export type AmazonPinpointInboundSms = {
  /**
     * The phone number that sent the incoming message to you (in other words, your customer's phone number).
     */
  originationNumber: string;

  /**
     * The phone number that the customer sent the message to (your dedicated phone number).
     */
  destinationNumber: string;

  /**
     * The registered keyword that's associated with your dedicated phone number.
     */
  messageKeyword: string;

  /**
     * The message that the customer sent to you.
     */
  messageBody: string;

  /**
     * The unique identifier for the incoming message.
     */
  inboundMessageId: string;

  /**
     * The unique identifier of the message that the customer is responding to.
     */
  previousPublishedMessageId?: string;
};

export type ChatimeLocation = {
  /**
     * Store ID
     */
  ID: string;

  /**
     * Name of the store.
     */
  na: string;

  /**
     * Store listing URL
     */
  gu: string;

  /**
     * HTML for list entry on Chatime mapping page
     */
  de: string;

  /**
     * Latitudinal coordinate for store
     */
  lat: string;

  /**
     * Longitudinal coordinate for store
     */
  lng: string;

  /**
     * Distance in relation to source lookup address
     */
  distance: string;

  /**
     * Store street address
     */
  st: string;

  /**
     * Store postal code
     */
  zp: string;

  /**
     * Store city
     */
  ct: string;

  /**
     * Store country
     */
  co: string;

  /**
     * Store province
     */
  rg: string;

  /**
     * Store telephone number
     */
  te: string;

  /**
     * Unknown...
     */
  ic: string;

  /**
     * Opening / closing hours
     */
  op: {};
};