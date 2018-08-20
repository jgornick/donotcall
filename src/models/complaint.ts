import moment, { Moment } from 'moment';
import { PhoneNumber } from 'google-libphonenumber';
import { Browser, NavigationOptions, Response } from 'puppeteer';

import { IncomingMessage } from './incoming-message';

const DO_NOT_CALL_FORM_URL = 'https://complaints.donotcall.gov/complaint/complaintcheck.aspx';

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

  public async submit(browser: Browser) {
    let waitForNavigation = Promise.resolve<Response>(undefined);
    const waitForNavigationOptions: NavigationOptions = { waitUntil: 'networkidle2' };
    const page = await browser.newPage();

    await page.goto(DO_NOT_CALL_FORM_URL, waitForNavigationOptions);
    waitForNavigation = page.waitForNavigation(waitForNavigationOptions);
    await page.click('input[type="submit"]');
    await waitForNavigation;

    await page.type('#PhoneTextBox', String(this.fromNumber.getNationalNumber()));
    await page.type('#DateOfCallTextBox', this.date.format('MM/DD/YYYY'));
    await page.select('#TimeOfCallDropDownList', this.date.format('HH'));
    await page.select('#ddlMinutes', this.date.format('mm'));
    await page.click('#PhoneCallRadioButton');
    waitForNavigation = page.waitForNavigation(waitForNavigationOptions);
    await page.click('input[type="submit"]');
    await waitForNavigation;

    await page.type('#CallerPhoneNumberTextBox', String(this.number.getNationalNumber()));
    await page.type('#CityTextBox', this.fromCity);
    await page.select('#StateDropDownList', this.fromState);
    await page.type('#ZipCodeTextBox', this.fromZip);
    await page.type('#CommentTextBox', 'Submitted via donotcall.tel');
    // waitForNavigation = page.waitForNavigation(waitForNavigationOptions);
    // await page.click('input[type="submit"]');
    // await waitForNavigation;

    if (await page.$('#StepTwoAcceptedPanel') === null) {
      let pdfPath  = `/var/log/donotcall`;
      pdfPath += `/${this.number.getNationalNumber()}`;
      pdfPath += `-${this.fromNumber.getNationalNumber()}`;
      pdfPath += `-${this.date.unix()}.pdf`;

      await page.pdf({ path: pdfPath });
      await page.close();
      throw new Error('Unable to confirm submission!');
    }

    return await page.close();
  }
}
