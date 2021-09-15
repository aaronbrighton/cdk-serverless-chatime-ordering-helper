import { SQSEvent } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import axios from 'axios';

// AWS SNS service
const sns = new AWS.SNS();

// AWS StepFunctions service
const stepfunctions = new AWS.StepFunctions();

export const handler = async (
  event: SQSEvent,
) => {

  console.log('Event: '+JSON.stringify(event));

  for (const record of event.Records) {

    // Send a request to Uber Eats to see if the ordering is currently open or not.
    console.log('Sending request to: '+record.messageAttributes.uberEatsUrl.stringValue);
    const uberEatsResult = await axios.get(record.messageAttributes.uberEatsUrl.stringValue || '');

    if (!uberEatsResult.data.includes('Currently unavailable')) {
      // Store is open, let's pop-off a notification.
      console.log('Store is open, publishing to the SNS topic: '+record.messageAttributes.topicArn.stringValue);

      // Send SMS response to the user
      try {
        await sns.publish({
          TopicArn: record.messageAttributes.topicArn.stringValue,
          Message: `Order now from: ${record.messageAttributes.uberEatsUrl.stringValue}`,
          MessageAttributes: {
            'AWS.MM.SMS.OriginationNumber': {
              DataType: 'String',
              StringValue: process.env.ORIGINATION_NUMBER,
            },
          },
        }).promise();

        // Remove the users subscription so they don't receive repeat notifications.
        console.log('Removing the SNS topic...');
        await stepfunctions.startExecution({
          stateMachineArn: process.env.STATE_MACHINE || '',
          input: JSON.stringify({ topicArn: record.messageAttributes.topicArn.stringValue }),
        }).promise();

      } catch (err) {
        console.error(err);
        return; // Bail.
      }
    } else {
      console.log('Store is not currently open for orders...');
    }
  }
};