export type StateMachineEvent = {
  /**
     * The ARN of the SNS topic that we are being asked to remove.
     */
  topicArn: string;
}