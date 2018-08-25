import { PhoneNumberUtil } from 'google-libphonenumber';
import moment from 'moment-timezone';
import mockAxios from 'jest-mock-axios';

import {
  MOCK_INCOMING_MESSAGE_JSON,
  MOCK_INCOMING_MESSAGE_JSON_BODY_SINGLE,
  MOCK_NUMBERS,
  MOCK_INCOMING_MESSAGE_JSON_FROM_ZIP_90210
} from './incoming-message.test';
import { Complaint } from './complaint';
import { IncomingMessage } from './incoming-message';

describe('Complaint', () => {
  afterEach(() => {
    mockAxios.reset();
  });

  describe('#localDate', () => {
    it('should return a localized date', () => {
      const incomingMessage = new IncomingMessage({
        ...MOCK_INCOMING_MESSAGE_JSON,
        ...MOCK_INCOMING_MESSAGE_JSON_BODY_SINGLE
      });

      const complaint = new Complaint(
        incomingMessage,
        PhoneNumberUtil.getInstance().parse(MOCK_NUMBERS[0])
      );

      const localDate = moment.tz(complaint.utcDate.unix(), 'America/Chicago');

      expect(complaint.localDate).resolves.toEqual(localDate);
    });

    it('should return a localized date for 90210', () => {
      const incomingMessage = new IncomingMessage({
        ...MOCK_INCOMING_MESSAGE_JSON,
        ...MOCK_INCOMING_MESSAGE_JSON_BODY_SINGLE,
        ...MOCK_INCOMING_MESSAGE_JSON_FROM_ZIP_90210
      });

      const complaint = new Complaint(
        incomingMessage,
        PhoneNumberUtil.getInstance().parse(MOCK_NUMBERS[0])
      );

      const localDate = moment.tz(complaint.utcDate.unix(), 'America/Los_Angeles');

      expect(complaint.localDate).resolves.toEqual(localDate);
    });
  });
});
