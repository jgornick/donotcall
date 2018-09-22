import { Response, Request } from 'express';
import puppeteer from 'puppeteer';
import twilio from 'twilio';

import logger from '../util/logger';
import { IncomingMessage } from '../models/incoming-message';
import { Complaint } from '../models/complaint';
import { rateLimit } from '../util/cache';
import { trackEvent } from '../util/analytics';

/**
 * POST /
 */
export const postApi = async (req: Request, res: Response) => {
  const isRequestValid = twilio.validateExpressRequest(
    req,
    process.env.TWILIO_AUTH_TOKEN,
    // @ts-ignore - https://github.com/twilio/twilio-node/issues/376
    { url: process.env.TWILIO_WEBHOOK_URL }
  );

  if (isRequestValid === false) {
    return res.sendStatus(400);
  }

  // @ts-ignore
  const messageResponse = new twilio.twiml.MessagingResponse();

  const incomingMessage = IncomingMessage.fromJSON(req.body);
  res.status(200).setHeader('Content-Type', 'text/xml');

  logger.info('incomingMessage: %s', JSON.stringify(incomingMessage));

  // Prevent requests from the same number every 60 seconds.
  if (await rateLimit.get(incomingMessage.from.getNationalNumber()) != null) {
    res
      .status(429)
      .setHeader('Retry-After', 1000 * 60);

    return res.end();
  }

  // Set a value for the from number and TTL it for 60 seconds.
  await rateLimit.set(incomingMessage.from.getNationalNumber(), +new Date(), 1000 * 60);

  if (incomingMessage.from.getCountryCode() !== 1) {
    messageResponse.message('Unable to file complaints from non-US numbers.');
    return res.end(messageResponse.toString());
  }


  // @ts-ignore
  const browserFetcher = puppeteer.createBrowserFetcher();
  const revisionInfo = await browserFetcher.download('584349');
  const browser = await puppeteer.launch({
    executablePath: revisionInfo.executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const complaintNumber = await incomingMessage.getComplaintNumber();

    if (complaintNumber == null) {
      messageResponse.message('You must provide a phone number to file a complaint.');
    } else {
      const complaint = Complaint.fromIncomingMessage(incomingMessage, complaintNumber);
      const localDate = await complaint.localDate;

      await complaint.submit(browser);
      await trackEvent({
        ec: 'complaint',
        ea: 'file',
        el: String(complaintNumber.getNationalNumber()),
        ev: incomingMessage.from.getNationalNumber()
      });

      messageResponse.message(`Complaint filed for "${complaintNumber.getNationalNumber()}" at ${localDate.format('LLL')}.`);
    }
  } catch (e) {
    logger.error(e);
    messageResponse.message(e.message);
  }

  await browser.close();
  return res.end(messageResponse.toString());
};
