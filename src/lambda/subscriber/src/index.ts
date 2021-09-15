
import { SNSEvent, Context } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import axios from 'axios';
import { AmazonPinpointInboundSms, ChatimeLocation } from './types';

// Amazon Location service
const location = new AWS.Location();

// AWS SNS service
const sns = new AWS.SNS();

export const handler = async (
  event: SNSEvent,
  context: Context,
) => {

  console.log('Event: '+JSON.stringify(event));

  let snsMessage: AmazonPinpointInboundSms = JSON.parse(event.Records[0].Sns.Message);
  snsMessage.messageBody = snsMessage.messageBody.trim(); // Clean up for messy humans

  // Check to see if the response contains a postal code (A1A1A1) or a storeid (#####)
  if (new RegExp(/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d$/i).test(snsMessage.messageBody)) {

    // Postal code detected
    console.log('Postal code detected: '+snsMessage.messageBody);

    // Use Amazon Location service to get long/lat coords from Postal Code
    let longitude: number;
    let latitude: number;
    try {
      const locationResults = await location.searchPlaceIndexForText({
        IndexName: process.env.PLACE_INDEX || '',
        Text: snsMessage.messageBody,
      }).promise();
      console.log('Amazon Location search result: '+JSON.stringify(locationResults));

      let coords = locationResults.Results[0].Place.Geometry.Point || [];
      longitude = coords[0];
      latitude = coords[1];

    } catch (err) {
      console.error(err);
      return; // Bail.
    }
    console.log('Coordinates resolved: '+longitude+','+latitude);

    // Send a request to Chatime's locations service to get closest stores
    axios.defaults.headers.common.Referer = `https://chatime.com/locations/?location=${snsMessage.messageBody}&category=63&radius=50`;
    const storeResults = await axios.post('https://chatime.com/wp-admin/admin-ajax.php', `action=get_stores&lat=${latitude}&lng=${longitude}&radius=50&categories%5B0%5D=63`);
    console.log("Response from Chatime's locations service: "+JSON.stringify(storeResults.data));

    // Extract closest three locations
    let chatimeLocations: ChatimeLocation[] = [storeResults.data[0], storeResults.data[1], storeResults.data[2]];
    console.log('Closest three Chatime locations: ');
    let messageForUser = `Respond with Store ID of location you'd like to monitor:\n`;
    chatimeLocations.forEach(async chatimeLocation => {

      // Let's first check that the location supports UberEats, as that is how we'll be monitoring it
      let uberEatsUrlSearch = chatimeLocation.de.match(new RegExp(/(https?:\/\/www\.ubereats\.com[^ "]*)/));
      if (uberEatsUrlSearch) {
        let uberEatsUrl = uberEatsUrlSearch[1];

        console.log(`${chatimeLocation.ID} - ${chatimeLocation.na} - ${uberEatsUrl}`);
        messageForUser = `${messageForUser}\n${chatimeLocation.ID} - ${chatimeLocation.na}`;

        // Create the SNS topic
        console.log('Creating SNS topic if not exists: chatime_notifier_'+chatimeLocation.ID);
        try {
          await sns.createTopic({
            Name: `chatime_notifier_${chatimeLocation.ID}`,
            Tags: [
              {
                Key: 'ubereats_url',
                Value: uberEatsUrl,
              },
            ],
          }).promise();
        } catch (err) {
          console.error(err);
          return; // Bail.
        }
      }
    });
    console.log('Message to be sent to end-user: '+messageForUser);

    // Send SMS response to the user
    try {
      await sns.publish({
        PhoneNumber: snsMessage.originationNumber,
        Message: messageForUser,
        MessageAttributes: {
          'AWS.MM.SMS.OriginationNumber': {
            DataType: 'String',
            StringValue: process.env.ORIGINATION_NUMBER,
          },
        },
      }).promise();
    } catch (err) {
      console.error(err);
      return; // Bail.
    }

  } else if (new RegExp(/^\d+$/).test(snsMessage.messageBody)) {

    // Store ID detected
    console.log('Store ID detected: '+snsMessage.messageBody);

    // Subscribe the end-users phone number to the topic and let them know
    console.log(`Determined the topic ARN to be: arn:aws:sns:${process.env.AWS_REGION}:${context.invokedFunctionArn.split(':')[4]}:chatime_notifier_${snsMessage.messageBody}`);
    console.log('Subscribing the end-user to it, and letting them know.');
    try {
      await sns.subscribe({
        TopicArn: `arn:aws:sns:${process.env.AWS_REGION}:${context.invokedFunctionArn.split(':')[4]}:chatime_notifier_${snsMessage.messageBody}`,
        Protocol: 'sms',
        Endpoint: snsMessage.originationNumber,
      }).promise();

      await sns.publish({
        PhoneNumber: snsMessage.originationNumber,
        Message: `We'll monitor store #${snsMessage.messageBody} and let you know when they open for online orders.`,
        MessageAttributes: {
          'AWS.MM.SMS.OriginationNumber': {
            DataType: 'String',
            StringValue: process.env.ORIGINATION_NUMBER,
          },
        },
      }).promise();
    } catch (err) {
      console.error(err);
      return; // Bail.
    }

  } else {

    // We don't understand this message
    console.log('Unknown message received: '+snsMessage.messageBody);

  }
};