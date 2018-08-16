import { inspect } from 'util';
import { Response, Request } from 'express';
import { map } from 'lodash';
import puppeteer from 'puppeteer';
import twilio from 'twilio';

import { IncomingMessage } from '../models/incoming-message';
import { Complaint } from '../models/complaint';

/**
 * POST /
 */
export const postApi = async (req: Request, res: Response) => {
  const incomingMessage = IncomingMessage.fromJSON(req.body);

  console.log('incomingMessage', inspect(incomingMessage));

  const browser = await puppeteer.launch();

  const submissionNumbers = await incomingMessage.getComplaintNumbers();

  console.log('submissionNumbers', inspect(submissionNumbers));

  await Promise.all(map(submissionNumbers, (number) => {
    const complaint = Complaint.fromIncomingMessage(incomingMessage, number);
    return complaint.submit(browser);
  }));

  await browser.close();

  // @ts-ignore
  const messageResponse = new twilio.twiml.MessagingResponse();
  messageResponse.message('Thank you!');

  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(messageResponse.toString());
};
