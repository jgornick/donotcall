import { Browser, NavigationOptions, Response } from 'puppeteer';

import { Complaint } from '../models/complaint';

const DO_NOT_CALL_FORM_URL = 'https://complaints.donotcall.gov/complaint/complaintcheck.aspx';

export async function submitComplaint(browser: Browser, complaint: Complaint) {
  let waitForNavigation = Promise.resolve<Response>(undefined);
  const waitForNavigationOptions: NavigationOptions = { waitUntil: 'networkidle0' };

  const page = await browser.newPage();
  await page.goto(DO_NOT_CALL_FORM_URL, waitForNavigationOptions);

  await page.pdf({ path: `${complaint.number.getNationalNumber()}-step0.pdf` });
  waitForNavigation = page.waitForNavigation(waitForNavigationOptions);
  await page.click('input[type="submit"]');
  await waitForNavigation;

  console.log('step1');

  await page.type('#PhoneTextBox', String(complaint.fromNumber.getNationalNumber()));
  await page.type('#DateOfCallTextBox', complaint.date.format('MM/DD/YYYY'));
  await page.select('#TimeOfCallDropDownList', complaint.date.format('HH'));
  await page.select('#ddlMinutes', complaint.date.format('mm'));
  await page.click('#PrerecordMessageYESRadioButton');
  await page.click('#PhoneCallRadioButton');
  await page.pdf({ path: `${complaint.number.getNationalNumber()}-step1.pdf` });
  waitForNavigation = page.waitForNavigation(waitForNavigationOptions);
  await page.click('input[type="submit"]');
  await waitForNavigation;

  console.log('step2');

  await page.type('#CallerPhoneNumberTextBox', String(complaint.number.getNationalNumber()));
  await page.type('#CityTextBox', complaint.fromCity);
  await page.select('#StateDropDownList', complaint.fromState);
  await page.type('#ZipCodeTextBox', complaint.fromZip);
  await page.type('#CommentTextBox', 'Submitted via donotcall.tel');
  await page.pdf({ path: `${complaint.number.getNationalNumber()}-step2.pdf` });
  // waitForNavigation = page.waitForNavigation(waitForNavigationOptions);
  // await page.click('input[type="submit"]');
  // await waitForNavigation;

  console.log('step3');

  // verify Your Complaint Has Been Accepted

  await page.pdf({ path: `${complaint.number.getNationalNumber()}-step3.pdf` });

  return await page.close();
}
