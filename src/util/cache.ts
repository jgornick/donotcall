import Keyv from 'keyv';

const rateLimit = new Keyv({ namespace: 'rate-limit' });

export { rateLimit };
