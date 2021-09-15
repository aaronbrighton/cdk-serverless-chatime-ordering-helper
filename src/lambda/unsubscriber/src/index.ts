import * as AWS from 'aws-sdk';
import { StateMachineEvent } from './types';


// AWS SNS service
const sns = new AWS.SNS();

export const handler = async (
  event: StateMachineEvent,
) => {
  console.log('Event: '+JSON.stringify(event));

  // Delete the SNS Topic
  console.log('Deleting SNS topic: '+event.topicArn);
  try {
    await sns.deleteTopic({
      TopicArn: event.topicArn,
    }).promise();
  } catch (err) {
    console.error(err);
    return; // Bail.
  }
};