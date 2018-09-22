import Axios, { AxiosPromise } from 'axios';
import { reduce } from 'lodash';

export interface EventParams {
  /**
   * Category
   */
  ec?: string;

  /**
   * Action
   */
  ea?: string;

  /**
   * Label
   */
  el?: string;

  /**
   * Value
   */
  ev?: string | number;

  /**
   * Document path
   */
  dp?: string;
}

export function trackEvent (event: EventParams): AxiosPromise {
  const data = {
    ...{
      // API Version.
      v: '1',
      // Tracking ID / Property ID.
      tid: process.env.GOOGLE_ANALYTICS_TRACKING_CODE,
      // Anonymous Client Identifier. Ideally, this should be a UUID that
      // is associated with particular user, device, or browser instance.
      cid: process.env.GOOGLE_ANALYTICS_APP_ID,
      // Event hit type.
      t: 'event'
    },
    ...event
  };

  const params = reduce(
    data,
    (result, value, key) => {
      result.append(key, String(value));
      return result;
    },
    new URLSearchParams()
  );

  return Axios.post('http://www.google-analytics.com/collect', params);
}