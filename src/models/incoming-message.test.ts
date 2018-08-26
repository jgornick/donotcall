import { PhoneNumberUtil } from 'google-libphonenumber';

import mockAxios from 'jest-mock-axios';

import { IncomingMessage, MIME_TYPE_VCARD } from './incoming-message';

export const MOCK_NUMBERS = [
  '+16235371600',
  '+16235371601'
];

export const MOCK_INCOMING_MESSAGE_JSON = {
  ToCountry: 'US',
  ToState: 'MN',
  SmsMessageSid: '47705864b52881d678fd19c8f6d8cc37',
  ToCity: 'MINNEAPOLIS',
  FromZip: '55318',
  SmsSid: '47705864b52881d678fd19c8f6d8cc37',
  FromState: 'MN',
  SmsStatus: 'received',
  FromCity: 'MINNEAPOLIS',
  FromCountry: 'US',
  To: '+16122608921',
  NumMedia: '0',
  NumSegments: '0',
  Body: '',
  ToZip: '55402',
  MessageSid: 'MM4264e26d1608899df1a1c0e090401e52',
  AccountSid: '47705864b52881d678fd19c8f6d8cc37',
  From: '+16122088141',
  ApiVersion: '2010-04-01'
};

export const MOCK_INCOMING_MESSAGE_JSON_MEDIA_SINGLE = {
  NumMedia: '1',
  Body: '',
  NumSegments: '1',
  MediaContentType0: 'text/x-vcard',
  MediaUrl0: '://',
};

export const MOCK_INCOMING_MESSAGE_JSON_FROM_ZIP_90210 = {
  FromZip: 90210
};

export const MOCK_INCOMING_MESSAGE_JSON_BODY_SINGLE = {
  Body: MOCK_NUMBERS[0]
};

export const MOCK_INCOMING_MESSAGE_JSON_BODY_INVALID = {
  Body: 'INVALID_NUMBER'
};

export const MOCK_INCOMING_MESSAGE_JSON_BODY_NON_US = {
  Body: '+49 30 202300'
};

export const MOCK_INCOMING_MESSAGE_VCARD = (number: string) => `
BEGIN:VCARD
VERSION:3.0
PRODID:-//Apple Inc.//iPhone OS 11.4.1//EN
N:;;;;
FN:
TEL;type=pref:${number}
END:VCARD
`;

describe('IncomingMessage', () => {
  afterEach(() => {
    mockAxios.reset();
  });

  describe('#getMediaUrls', () => {
    it('should return a single url for all mime types', () => {
      const incomingMessage = new IncomingMessage({
        ...MOCK_INCOMING_MESSAGE_JSON,
        ...MOCK_INCOMING_MESSAGE_JSON_MEDIA_SINGLE
      });
      const mediaUrls = incomingMessage.getMediaUrls();

      expect(mediaUrls).toHaveLength(1);
    });

    it('should return a single url for vCard mime type', () => {
      const incomingMessage = new IncomingMessage({
        ...MOCK_INCOMING_MESSAGE_JSON,
        ...MOCK_INCOMING_MESSAGE_JSON_MEDIA_SINGLE
      });
      const mediaUrls = incomingMessage.getMediaUrls(MIME_TYPE_VCARD);

      expect(mediaUrls).toHaveLength(1);
    });

    it('should return zero urls for missing mime type', () => {
      const incomingMessage = new IncomingMessage({
        ...MOCK_INCOMING_MESSAGE_JSON
      });
      const mediaUrls = incomingMessage.getMediaUrls('text/html');
      expect(mediaUrls).toHaveLength(0);
    });
  });

  describe('#getSubmissionNumbers', () => {
    it('should return a single phone number from vCard', async () => {
      const expectedPhoneNumber = PhoneNumberUtil.getInstance().parse(MOCK_NUMBERS[0], 'US');
      const incomingMessage = new IncomingMessage({
        ...MOCK_INCOMING_MESSAGE_JSON,
        ...MOCK_INCOMING_MESSAGE_JSON_MEDIA_SINGLE
      });
      const complaintNumber = incomingMessage.getComplaintNumber();

      mockAxios.mockResponse({
        data: MOCK_INCOMING_MESSAGE_VCARD(MOCK_NUMBERS[0]),
        headers: {
          'Content-Type': MIME_TYPE_VCARD
        }
      });

      expect(complaintNumber).resolves.toStrictEqual(expectedPhoneNumber);
    });

    it('should return a single phone number from body', async () => {
      const incomingMessage = new IncomingMessage({
        ...MOCK_INCOMING_MESSAGE_JSON,
        ...MOCK_INCOMING_MESSAGE_JSON_BODY_SINGLE
      });
      const complaintNumber = incomingMessage.getComplaintNumber();
      expect(complaintNumber).resolves.toEqual(
        PhoneNumberUtil.getInstance().parse(MOCK_NUMBERS[0], 'US')
      );
    });

    it('should return null when no numbers provided', async () => {
      const incomingMessage = new IncomingMessage(MOCK_INCOMING_MESSAGE_JSON);
      const complaintNumber = incomingMessage.getComplaintNumber();
      expect(complaintNumber).resolves.toBeNull();
    });

    it('should error with invalid phone number format', async () => {
      const incomingMessage = new IncomingMessage({
        ...MOCK_INCOMING_MESSAGE_JSON,
        ...MOCK_INCOMING_MESSAGE_JSON_BODY_INVALID
      });
      const complaintNumber = incomingMessage.getComplaintNumber();
      expect(complaintNumber).rejects.toThrowError(new Error(
        `Unable to parse phone number "${MOCK_INCOMING_MESSAGE_JSON_BODY_INVALID.Body}".`
      ));
    });

    it('should error with valid non-US phone number', async () => {
      const incomingMessage = new IncomingMessage({
        ...MOCK_INCOMING_MESSAGE_JSON,
        ...MOCK_INCOMING_MESSAGE_JSON_BODY_NON_US
      });
      const complaintNumber = incomingMessage.getComplaintNumber();
      expect(complaintNumber).rejects.toThrowError(new Error(
        'Unable to file complaints for out of country numbers.'
      ));
    });

  });
});
