import moment, { Moment } from 'moment-timezone';
import { PhoneNumber } from 'google-libphonenumber';
import { Browser, NavigationOptions, Page } from 'puppeteer';
import axios, { AxiosResponse } from 'axios';
import { URL } from 'url';
import { get, trim } from 'lodash';

import logger from '../util/logger';
import { IncomingMessage } from './incoming-message';

const DO_NOT_CALL_FORM_URL = 'https://complaints.donotcall.gov/complaint/complaintcheck.aspx';
const GOOGLE_MAPS_GEOCODE_API_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const GOOGLE_MAPS_TIMEZONE_API_URL = 'https://maps.googleapis.com/maps/api/timezone/json';

export class Complaint {
  static fromIncomingMessage(
    incomingMessage: IncomingMessage,
    complaintNumber: PhoneNumber
  ): Complaint {
    return new Complaint(incomingMessage, complaintNumber);
  }

  public readonly fromNumber: PhoneNumber;
  public readonly fromCity: string;
  public readonly fromState: string;
  public readonly fromZip: string;
  public readonly number: PhoneNumber;
  public readonly utcDate: Moment;

  public get localDate(): Promise<Moment> {
    if (this._localDate != null) {
      return Promise.resolve(this._localDate);
    }

    let location: { lat: number, lng: number };

    const geocodeUrl = new URL(GOOGLE_MAPS_GEOCODE_API_URL);
    geocodeUrl.searchParams.append('key', process.env.GOOGLE_MAPS_API_KEY);
    geocodeUrl.searchParams.append('address', this.fromZip);

    logger.debug('geocodeUrl: %s', geocodeUrl.toString());

    return axios.get(geocodeUrl.toString())
      .then((response: AxiosResponse) => {
        location = get(response.data, 'results.0.geometry.location');
        logger.debug(`location: ${location}`);

        if (location == null) {
          logger.error(`Unable to load location for "${this.fromZip}".`);
          logger.debug(response.data);
          return null;
        }

        const timezoneUrl = new URL(GOOGLE_MAPS_TIMEZONE_API_URL);
        timezoneUrl.searchParams.append('key', process.env.GOOGLE_MAPS_API_KEY);
        timezoneUrl.searchParams.append('location', `${location.lat},${location.lng}`);
        timezoneUrl.searchParams.append('timestamp', this.utcDate.unix().toString());

        logger.debug('timezoneUrl: %s', timezoneUrl.toString());

        return axios.get(timezoneUrl.toString());
      })
      .then((response: AxiosResponse) => {
        if (response === null) {
          return this.utcDate;
        }

        const timezoneId = get(response.data, 'timeZoneId');
        logger.debug(`timezoneId: ${timezoneId}`);

        if (timezoneId == null) {
          logger.error(`Unable to load time zone for location "${location.lat},${location.lng}".`);
          logger.debug(response.data);
          return this.utcDate;
        }

        this._localDate = moment.tz(this.utcDate.unix() * 1000, timezoneId);

        return this._localDate;
      });
  }

  private _localDate: Moment;

  constructor(incomingMessage: IncomingMessage, complaintNumber: PhoneNumber) {
    this.fromNumber = incomingMessage.from;
    this.fromCity = incomingMessage.fromCity;
    this.fromState = incomingMessage.fromState;
    this.fromZip = incomingMessage.fromZip;
    this.utcDate = moment.utc();

    this.number = complaintNumber;
  }

  public async submit(browser: Browser) {
    const page = await browser.newPage();
    const waitForNavigationOptions: NavigationOptions = {
      timeout: 1000 * 10,
      waitUntil: ['networkidle2']
    };

    await page.setViewport({ width: 1440, height: 900 });

    await this.loadComplaintPage(page, waitForNavigationOptions);
    await this.startComplaint(page, waitForNavigationOptions);
    await this.submitComplaintStep1(page, waitForNavigationOptions);
    await this.submitComplaintStep2(page, waitForNavigationOptions);
    await this.validateComplaintStep3(page);

    return await page.close();
  }

  private async loadComplaintPage(page: Page, waitForNavigationOptions: NavigationOptions) {
    logger.debug(`Loading ${DO_NOT_CALL_FORM_URL}`);
    await page.goto(DO_NOT_CALL_FORM_URL, waitForNavigationOptions);
    logger.debug(`Done loading ${DO_NOT_CALL_FORM_URL}`);
  }

  private async startComplaint(page: Page, waitForNavigationOptions: NavigationOptions) {
    logger.debug('Clicking submit on start step...');
    const waitForNavigation = page.waitForNavigation(waitForNavigationOptions);
    await page.click('#ContinueButton');
    await waitForNavigation;
    logger.debug('Done clicking submit on start step.');
  }

  private async submitComplaintStep1(page: Page, waitForNavigationOptions: NavigationOptions) {
    const error = await this.getError(page);
    if (error != null) {
      throw new Error(error);
    }

    const localDate = await this.localDate;
    logger.debug(`localDate: ${localDate.toISOString()}`);

    await page.type('#PhoneTextBox', String(this.fromNumber.getNationalNumber()));
    await page.type('#DateOfCallTextBox', localDate.format('MM/DD/YYYY'));
    await page.select('#TimeOfCallDropDownList', localDate.format('HH'));
    await page.select('#ddlMinutes', localDate.format('mm'));
    await page.click('#PhoneCallRadioButton');

    logger.debug('Clicking submit on step 1...');
    const waitForNavigation = page.waitForNavigation(waitForNavigationOptions);
    await page.click('#StepOneContinueButton');
    await waitForNavigation;
    logger.debug('Done clicking submit on step 1.');
  }

  private async submitComplaintStep2(page: Page, waitForNavigationOptions: NavigationOptions) {
    const error = await this.getError(page);
    if (error != null) {
      throw new Error(error);
    }

    await page.type('#CallerPhoneNumberTextBox', String(this.number.getNationalNumber()));
    await page.type('#CityTextBox', this.fromCity);
    await page.select('#StateDropDownList', this.fromState);
    await page.type('#ZipCodeTextBox', this.fromZip);
    await page.type('#CommentTextBox', 'Submitted via donotcall.tel');

    logger.debug('Clicking submit on step 2...');
    const waitForNavigation = page.waitForNavigation(waitForNavigationOptions);
    await page.click('#StepTwoSubmitButton');
    await waitForNavigation;
    logger.debug('Done clicking submit on step 2.');
  }

  private async validateComplaintStep3(page: Page) {
    const error = await this.getError(page);
    if (error != null) {
      throw new Error(error);
    }

    if (await page.$('#StepTwoAcceptedPanel') === null) {
      let pdfPath  = `/var/log/donotcall`;
      pdfPath += `/${this.number.getNationalNumber()}`;
      pdfPath += `-${this.fromNumber.getNationalNumber()}`;
      pdfPath += `-${this.utcDate.unix()}.pdf`;

      await page.pdf({ path: pdfPath });
      await page.close();
      throw new Error('Unable to confirm submission!');
    }
  }

  private async getError(page: Page) {
    const errorMessage = await page.evaluate(() => {
      const errorMessageNode = document.querySelector('#ErrorMsg');
      if (errorMessageNode == null) {
        return null;
      }

      return errorMessageNode.textContent;
    });

    if (trim(errorMessage) === '') {
      return null;
    }

    return errorMessage;
  }
}
