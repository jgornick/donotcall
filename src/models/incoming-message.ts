import { compact, get, map, split, flatten, invokeMap, head, reduce, startsWith, trim } from 'lodash';
import typeis from 'type-is';
import { PhoneNumberUtil, PhoneNumber } from 'google-libphonenumber';
import axios from 'axios';
import VCard from 'vcard-js';

const MEDIA_CONTENT_TYPE_KEY = 'MediaContentType';
const MEDIA_CONTENT_URL_KEY = 'MediaUrl';

export const MIME_TYPE_VCARD = 'text/x-vcard';

export class IncomingMessage {
  static fromJSON(json: JSON): IncomingMessage {
    return new IncomingMessage(json);
  }

  /**
   * A 34 character unique identifier for the message. May be used to later retrieve this message from the REST API.
   */
  public readonly messageSid: string;

  /**
   * Same value as MessageSid. Deprecated and included for backward compatibility.
   */
  public readonly smsSid: string;

  /**
   * The 34 character id of the Account this message is associated with.
   */
  public readonly accountSid: string;

  /**
   * The 34 character id of the Messaging Service associated with the message.
   */
  public readonly messagingServiceSid: string;

  /**
   * The phone number or Channel address that sent this message.
   */
  public readonly from: PhoneNumber;

  /**
   * The city of the sender
   */
  public readonly fromCity: string;

  /**
   * The state or province of the sender.
   */
  public readonly fromState: string;

  /**
   * The postal code of the called sender.
   */
  public readonly fromZip: string;

  /**
   * The country of the called sender.
   */
  public readonly fromCountry: string;

  /**
   * The phone number or Channel address of the recipient.
   */
  public readonly to: PhoneNumber;

  /**
   * The city of the recipient.
   */
  public readonly toCity: string;

  /**
   * The state or province of the recipient.
   */
  public readonly toState: string;

  /**
   * The postal code of the recipient.
   */
  public readonly toZip: string;

  /**
   * The country of the recipient.
   */
  public readonly toCountry: string;

  /**
   * The text body of the message. Up to 1600 characters long.
   */
  public readonly body: string;

  /**
   * The number of media items associated with your message
   */
  public readonly numMedia: number;

  /**
   * The original JSON of the incoming message.
   */
  private json: any;

  constructor(json: any) {
    this.json = json;

    this.messageSid = get(json, ['MessageSid']);
    this.smsSid = get(json, ['SmsSid']);
    this.accountSid = get(json, ['AccountSid']);
    this.messagingServiceSid = get(json, ['MessagingServiceSid']);

    this.from = PhoneNumberUtil.getInstance().parse(get(json, ['From']), 'US');
    this.fromCity = get(json, ['FromCity']);
    this.fromState = get(json, ['FromState']);
    this.fromZip = get(json, ['FromZip']);
    this.fromCountry = get(json, ['FromCountry']);

    this.to = PhoneNumberUtil.getInstance().parse(get(json, ['To']), 'US');
    this.toCity = get(json, ['ToCity']);
    this.toState = get(json, ['ToState']);
    this.toZip = get(json, ['ToZip']);
    this.toCountry = get(json, ['ToCountry']);

    this.body = get(json, ['Body']);
    this.numMedia = parseInt(get(json, ['NumMedia']));
  }

  /**
   * Fetch any media URLs from the incoming message. Optionally filter based on
   * mime type.
   *
   * @param mimeType Filter result based on mime type of media.
   */
  public getMediaUrls(mimeType: string = '*/*'): string[] {
    return reduce(
      this.json,
      (result, value, key) => {
        if (startsWith(key, MEDIA_CONTENT_TYPE_KEY)
            && typeis.is(value, [mimeType]) !== false
        ) {
          const mediaUrlIndex = head(key.match(/\d+/g));
          result.push(this.json[`${MEDIA_CONTENT_URL_KEY}${mediaUrlIndex}`]);
        }
        return result;
      },
      [] as string[]
    );
  }

  public getComplaintNumbers(): Promise<PhoneNumber[]> {
    if (this.numMedia === 0) {
      return new Promise((resolve, reject) => resolve(map(
        compact(map(split(this.body, /[,\n]/g), trim)),
        (number) => {
          let phoneNumber;

          try {
            phoneNumber = PhoneNumberUtil.getInstance().parse(number, 'US');
          } catch (e) {
            reject(new Error(`Unable to parse phone number "${number}".`));
          }

          if (phoneNumber.getCountryCode() !== 1) {
            throw new Error('Unable to file complaints for out of country numbers.');
          }

          return phoneNumber;
        }
      )));
    } else {
      return Promise.all(map(this.getMediaUrls(MIME_TYPE_VCARD), axios.get))
        .then((responses) => map(responses, 'data'))
        .then((vCardData) => map(vCardData, (data) => {
          try {
            return VCard.parse(data);
          } catch (e) {
            throw new Error(`Unable to parse vCard:\n${data}`);
          }
        }))
        .then((vCards) => map(flatten(invokeMap(head(vCards), 'find', 'TEL')), 'value'))
        .then((vCardTels) => map(vCardTels, (number) => {
          let phoneNumber;

          try {
            phoneNumber = PhoneNumberUtil.getInstance().parse(number, 'US');
          } catch (e) {
            throw new Error(`Unable to parse phone number "${number}".`);
          }

          if (phoneNumber.getCountryCode() !== 1) {
            throw new Error('Unable to file complaints for out of country numbers.');
          }

          return phoneNumber;
        }));
    }
  }
}
