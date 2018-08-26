import axios from 'axios';
import typeis from 'type-is';
import VCard from 'vcard-js';
import { compact, get, head, map, reduce, split, startsWith, trim, invoke } from 'lodash';
import { PhoneNumber, PhoneNumberUtil } from 'google-libphonenumber';
import logger from '../util/logger';


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

  public getComplaintNumber(): Promise<PhoneNumber> {
    if (this.numMedia === 0) {
      const number = head(compact(map(split(this.body, /[,\n]/g), trim)));

      try {
        const phoneNumber = PhoneNumberUtil.getInstance().parse(number, 'US');

        if (phoneNumber.getCountryCode() !== 1) {
          return Promise.reject(new Error('Unable to file complaints for out of country numbers.'));
        }

        return Promise.resolve(phoneNumber);
      } catch (e) {
        return Promise.reject(new Error(`Unable to parse phone number "${number}".`));
      }
    } else {
      return axios.get(head(this.getMediaUrls(MIME_TYPE_VCARD)))
        .then((response) => {
          try {
            return VCard.parse(response.data);
          } catch (e) {
            throw new Error(`Unable to parse vCard:\n${response.data}`);
          }
        })
        .then((vCard) => get(head(invoke(head(vCard), 'find', 'TEL')), 'value'))
        .then((number) => {
          try {
            const phoneNumber = PhoneNumberUtil.getInstance().parse(number, 'US');

            if (phoneNumber.getCountryCode() !== 1) {
              throw new Error('Unable to file complaints for out of country numbers.');
            }

            return phoneNumber;
          } catch (e) {
            throw new Error(`Unable to parse phone number "${number}".`);
          }
        });
    }
  }
}
