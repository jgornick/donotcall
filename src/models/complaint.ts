import moment, { Moment } from 'moment-timezone';
import { PhoneNumber } from 'google-libphonenumber';
import { Browser, NavigationOptions, Response } from 'puppeteer';
import axios, { AxiosResponse } from 'axios';
import { URL } from 'url';
import { get } from 'lodash';
import logger from '../util/logger';

import { IncomingMessage } from './incoming-message';

const DO_NOT_CALL_FORM_URL = 'https://complaints.donotcall.gov/complaint/complaintcheck.aspx';
const GOOGLE_MAPS_GEOCODE_API_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const GOOGLE_MAPS_TIMEZONE_API_URL = 'https://maps.googleapis.com/maps/api/timezone/json';

export class Complaint {
  static fromIncomingMessage(incomingMessage: IncomingMessage, complaintNumber: PhoneNumber): Complaint {
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
        logger.debug('geocode response', response.data);
        location = get(response.data, 'results.0.geometry.location');

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

        logger.debug('timezone response', response.data);
        const timezoneId = get(response.data, 'timeZoneId');

        if (timezoneId == null) {
          logger.error(`Unable to load time zone for location "${location.lat},${location.lng}".`);
          logger.debug(response.data);
          return this.utcDate;
        }

        this._localDate = moment.tz(this.utcDate.unix(), timezoneId);

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
    let waitForNavigation = Promise.resolve<Response>(undefined);
    const waitForNavigationOptions: NavigationOptions = {
      waitUntil: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2']
    };
    const page = await browser.newPage();
    const localDate = await this.localDate;

    logger.debug(`localDate: ${localDate.toISOString()}`);

    logger.debug(`Loading ${DO_NOT_CALL_FORM_URL}`);
    await page.goto(DO_NOT_CALL_FORM_URL, waitForNavigationOptions);
    logger.debug(`Done loading ${DO_NOT_CALL_FORM_URL}`);

    logger.debug('Clicking submit on first step...');
    waitForNavigation = page.waitForNavigation(waitForNavigationOptions);
    await page.click('input[type="submit"]');
    await waitForNavigation;
    logger.debug('Done clicking submit on first step.');

    await page.type('#PhoneTextBox', String(this.fromNumber.getNationalNumber()));
    await page.type('#DateOfCallTextBox', localDate.format('MM/DD/YYYY'));
    await page.select('#TimeOfCallDropDownList', localDate.format('HH'));
    await page.select('#ddlMinutes', localDate.format('mm'));
    await page.click('#PhoneCallRadioButton');

    logger.debug('Clicking submit on second step...');
    waitForNavigation = page.waitForNavigation(waitForNavigationOptions);
    await page.click('input[type="submit"]');
    await waitForNavigation;
    logger.debug('Done clicking submit on second step.');

    await page.type('#CallerPhoneNumberTextBox', String(this.number.getNationalNumber()));
    await page.type('#CityTextBox', this.fromCity);
    await page.select('#StateDropDownList', this.fromState);
    await page.type('#ZipCodeTextBox', this.fromZip);
    await page.type('#CommentTextBox', 'Submitted via donotcall.tel');

    logger.debug('Clicking submit on third step...');
    waitForNavigation = page.waitForNavigation(waitForNavigationOptions);
    await page.click('input[type="submit"]');
    await waitForNavigation;
    logger.debug('Done clicking submit on third step.');

    if (await page.$('#StepTwoAcceptedPanel') === null) {
      let pdfPath  = `/var/log/donotcall`;
      pdfPath += `/${this.number.getNationalNumber()}`;
      pdfPath += `-${this.fromNumber.getNationalNumber()}`;
      pdfPath += `-${this.utcDate.unix()}.pdf`;

      await page.pdf({ path: pdfPath });
      await page.close();
      throw new Error('Unable to confirm submission!');
    }

    return await page.close();
  }
}
