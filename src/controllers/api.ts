import { Response, Request } from 'express';
import { map } from 'lodash';
import puppeteer from 'puppeteer';
import twilio from 'twilio';

import logger from '../util/logger';
import { IncomingMessage } from '../models/incoming-message';
import { Complaint } from '../models/complaint';
import { rateLimit } from '../util/cache';

/**
 * POST /
 */
export const postApi = async (req: Request, res: Response) => {
  const isRequestValid = twilio.validateExpressRequest(
    req,
    process.env.TWILIO_AUTH_TOKEN,
    { url: process.env.TWILIO_WEBHOOK_URL }
  );

  if (isRequestValid === false) {
    return res.sendStatus(400);
  }

  logger.info('REQ', req.body);
  const incomingMessage = IncomingMessage.fromJSON(req.body);

  if (incomingMessage.from.getCountryCode() !== 1) {
    return res
      .status(400)
      .send({ errors: [{ message: 'Unable to file complaints from non-US numbers.' }] });
  }

  if (await rateLimit.get(incomingMessage.from.getNationalNumber()) != null) {
    res
      .status(429)
      .setHeader('Retry-After', 1000 * 60);

    return res.send();
  }

  await rateLimit.set(incomingMessage.from.getNationalNumber(), +new Date(), 1000 * 60);

  logger.info('incomingMessage', incomingMessage);

  const browser = await puppeteer.launch({args: ['--no-sandbox', '--disable-setuid-sandbox']});

  const submissionNumbers = await incomingMessage.getComplaintNumbers();

  logger.info('submissionNumbers', submissionNumbers);

  // @ts-ignore
  const messageResponse = new twilio.twiml.MessagingResponse();

  try {
    await Promise.all(map(submissionNumbers, (number) => {
      const complaint = Complaint.fromIncomingMessage(incomingMessage, number);
      return complaint.submit(browser);
    }));

    messageResponse.message('Thank you!');
  } catch (e) {
    logger.error(e);
    messageResponse.message('Something went wrong while submitting the complaint. Please try again.');
  }

  await browser.close();

  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(messageResponse.toString());
};
