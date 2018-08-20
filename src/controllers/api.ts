import { Response, Request } from 'express';
import { map } from 'lodash';
import puppeteer from 'puppeteer';
import twilio from 'twilio';

import logger from '../util/logger';
import { IncomingMessage } from '../models/incoming-message';
import { Complaint } from '../models/complaint';

/**
 * POST /
 */
export const postApi = async (req: Request, res: Response) => {
  logger.info('REQ', req);
  const incomingMessage = IncomingMessage.fromJSON(req.body);

  logger.info('incomingMessage', incomingMessage);

  const browser = await puppeteer.launch({args: ['--no-sandbox', '--disable-setuid-sandbox']});

  const submissionNumbers = await incomingMessage.getComplaintNumbers();

  logger.info('submissionNumbers', submissionNumbers);

  // @ts-ignore
  const messageResponse = new twilio.twiml.MessagingResponse();

  try {
    await Promise.all(map(submissionNumbers, (number) => {
      const complaint = Complaint.fromIncomingMessage(incomingMessage, number);
      logger.info('complaint', complaint);
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
