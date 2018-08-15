import { IncomingMessage } from './incoming-message';
import moment, { Moment } from 'moment';
import { PhoneNumber } from 'google-libphonenumber';

export class Complaint {
  static fromIncomingMessage(incomingMessage: IncomingMessage, complaintNumber: PhoneNumber): Complaint {
    const complaint = new Complaint();

    complaint.fromNumber = incomingMessage.from;
    complaint.fromCity = incomingMessage.fromCity;
    complaint.fromState = incomingMessage.fromState;
    complaint.fromZip = incomingMessage.fromZip;
    complaint.date = moment.utc();

    complaint.number = complaintNumber;

    return complaint;
  }

  public fromNumber: PhoneNumber;
  public fromCity: string;
  public fromState: string;
  public fromZip: string;
  public number: PhoneNumber;
  public date: Moment;
}
