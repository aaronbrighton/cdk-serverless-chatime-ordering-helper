import * as path from 'path';
import * as events from '@aws-cdk/aws-events';
import * as events_targets from '@aws-cdk/aws-events-targets';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as lambda_event_sources from '@aws-cdk/aws-lambda-event-sources';
import * as lambda_nodejs from '@aws-cdk/aws-lambda-nodejs';
import * as location from '@aws-cdk/aws-location';
import * as sns from '@aws-cdk/aws-sns';
import * as sns_subscriptions from '@aws-cdk/aws-sns-subscriptions';
import * as sqs from '@aws-cdk/aws-sqs';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';
import { App, Construct, Stack, StackProps, CfnOutput, Duration } from '@aws-cdk/core';

export class ChatimeNotifier extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    // Amazon Location service used for looking up the users LAT/LONG coordinates from Canadian Postal Code, to find closest Chatime store
    const locationPlaceIndex = new location.CfnPlaceIndex(this, 'place-index', {
      indexName: 'place-index'+this.node.addr,
      dataSource: 'Esri',
      pricingPlan: 'RequestBasedUsage',
    });

    // Amazon Pinpoint will route in-bound SMS messages to this topic
    const smsRelayTopic = new sns.Topic(this, 'sms-relay-topic');

    // Output it, as someone will need to manually stitch Pinpoint to this topic
    new CfnOutput(this, 'sms-relay-topic-output', {
      value: smsRelayTopic.topicArn,
    });

    // The logic that gets called when someone is looking for the closest store and requesting monitoring of it
    const subscriberLambda = new lambda_nodejs.NodejsFunction(this, 'subscriber-function', {
      entry: path.join(__dirname, 'lambda/subscriber/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_14_X,
      memorySize: 1024, // Arbitrary, opportunity for optimizing
      timeout: Duration.seconds(30), // Arbitrary
      bundling: {
        nodeModules: ['axios'],
      },
      environment: {
        PLACE_INDEX: locationPlaceIndex.indexName,
        ORIGINATION_NUMBER: this.node.tryGetContext('originationNumber'), // Amazon Pinpoint/SNS phone number used to send SMS responses
      },
      initialPolicy: [
        new iam.PolicyStatement({
          actions: [
            'sns:Publish',
            'sns:CreateTopic',
            'sns:TagResource',
            'sns:Subscribe',
          ],
          resources: [
            '*',
          ],
        }),
        new iam.PolicyStatement({
          actions: [
            'geo:SearchPlaceIndexForText',
          ],
          resources: [
            locationPlaceIndex.attrArn,
          ],
        }),
      ],
    });
    smsRelayTopic.addSubscription(new sns_subscriptions.LambdaSubscription(subscriberLambda));

    // This queue will be populated with messages representing individual stores tasked for monitoring
    const monitoringQueue = new sqs.Queue(this, 'monitoring-queue');

    // Populates the above queue with messages containing the SNS Topic ARN for a monitored store, as well as the associated Uber Eats store front URL
    const populatorLambda = new lambda_nodejs.NodejsFunction(this, 'populator-function', {
      entry: path.join(__dirname, 'lambda/populator/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_14_X,
      memorySize: 1024, // Arbitrary, opportunity for optimizing
      timeout: Duration.seconds(30), // Arbitrary
      environment: {
        MONITORING_QUEUE: monitoringQueue.queueUrl,
      },
      initialPolicy: [
        new iam.PolicyStatement({
          actions: [
            'sns:ListTopics',
            'sns:ListSubscriptionsByTopic',
            'sns:ListTagsForResource',
          ],
          resources: [
            '*',
          ],
        }),
      ],
    });
    monitoringQueue.grantSendMessages(populatorLambda);

    // The populator Lambda should run every minute and scan through the topics and fill the queue with stores to be probed
    const populatorScheduler = new events.Rule(this, 'populator-scheduler-rule', {
      schedule: events.Schedule.rate(Duration.minutes(1)),
    });
    populatorScheduler.addTarget(new events_targets.LambdaFunction(populatorLambda));

    // After a store has opened up for orders we want to clear out the existing topic so that users dont get repeat notifications
    // However, there is a risk that if we kill the SNS topic immediately after publishing, that some notifications won't make it out
    // Therefore, we use a state machine to pause for 30 seconds before nuking the SNS topic
    const unsubscriberLambda = new lambda_nodejs.NodejsFunction(this, 'unsubscriber-function', {
      entry: path.join(__dirname, 'lambda/unsubscriber/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_14_X,
      memorySize: 1024, // Arbitrary, opportunity for optimizing
      timeout: Duration.seconds(30), // Arbitrary
      initialPolicy: [
        new iam.PolicyStatement({
          actions: [
            'sns:DeleteTopic',
          ],
          resources: [
            '*',
          ],
        }),
      ],
    });
    const waitStep = new sfn.Wait(this, 'unsubscriber-wait-step', {
      time: sfn.WaitTime.duration(Duration.seconds(30)),
    });
    const unsubscriberJob = new tasks.LambdaInvoke(this, 'unsubscriber-state-machine-job', {
      lambdaFunction: unsubscriberLambda,
    });
    const definition = waitStep.next(unsubscriberJob);
    const unsubscriberStateMachine = new sfn.StateMachine(this, 'unsubscriber-state-machine', {
      definition,
      timeout: Duration.minutes(5),
    });

    // This function actually runs the check against the Uber Eats store front to see if ordering is available, notifies the users, and then cleans up with the above state machine
    const workerLambda = new lambda_nodejs.NodejsFunction(this, 'worker-function', {
      entry: path.join(__dirname, 'lambda/worker/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_14_X,
      memorySize: 1024, // Arbitrary, opportunity for optimizing
      timeout: Duration.seconds(30), // Arbitrary
      bundling: {
        nodeModules: ['axios'],
      },
      events: [
        new lambda_event_sources.SqsEventSource(monitoringQueue, {
          batchSize: 1,
        }),
      ],
      environment: {
        ORIGINATION_NUMBER: this.node.tryGetContext('originationNumber'),
        STATE_MACHINE: unsubscriberStateMachine.stateMachineArn,
      },
      initialPolicy: [
        new iam.PolicyStatement({
          actions: [
            'sns:Publish',
          ],
          resources: [
            '*',
          ],
        }),
      ],
    });
    unsubscriberStateMachine.grantStartExecution(workerLambda);

  }
}

const app = new App();

new ChatimeNotifier(app, 'chatime-notifier');

app.synth();