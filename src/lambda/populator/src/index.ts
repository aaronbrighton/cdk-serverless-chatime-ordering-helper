
import { EventBridgeEvent } from 'aws-lambda';
import * as AWS from 'aws-sdk';

// AWS SNS service
const sns = new AWS.SNS();

// AWS SNS service
const sqs = new AWS.SQS();

export const handler = async (
  event: EventBridgeEvent<'Scheduled Event', any>,
) => {

  console.log('Event: '+JSON.stringify(event));

  try {

    console.log('Searching for topics with subscriptions...');

    // Get list of SNS topics in account/region
    const snsTopics = await sns.listTopics().promise();

    for (const topic of snsTopics.Topics!) {

      // Let's only work on topics that are relevant
      if (topic.TopicArn?.split(':').pop()?.startsWith('chatime_notifier_')) {
        console.log('Topic identified: '+JSON.stringify(topic));
        
        // Which topics actually have subscriptions that we need to run checks for?
        let topicSubscriptions = await sns.listSubscriptionsByTopic({
          TopicArn: topic.TopicArn,
        }).promise();

        if (topicSubscriptions.Subscriptions?.length) {

          console.log('Found relevant topic with subscriptions: '+topic.TopicArn);

          // Retrieve the tags for the topic
          const topicTags = await sns.listTagsForResource({
            ResourceArn: topic.TopicArn,
          }).promise();
          let uberEatsUrl: string = '';
          if (topicTags.Tags?.length) {
            uberEatsUrl = topicTags.Tags[0].Value;
          }
          console.log("Topic's Uber Eats URL: "+uberEatsUrl);

          // Prime the queue with this topic's store information.
          console.log('Sending topic to queue for monitoring...');
          await sqs.sendMessage({
            QueueUrl: process.env.MONITORING_QUEUE || '',
            MessageBody: ' ', // Needs to have some sort of content in the message body.
            MessageAttributes: {
              uberEatsUrl: {
                DataType: 'String',
                StringValue: uberEatsUrl,
              },
              topicArn: {
                DataType: 'String',
                StringValue: topic.TopicArn,
              },
            },
          }).promise();
        }
      }
    };

  } catch (err) {
    console.error(err);
    return; // Bail.
  }
};