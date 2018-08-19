import { createLogger, transports } from 'winston';

const logger = createLogger({
  transports: [
    new transports.Console({ level: process.env.NODE_ENV === 'production' ? 'info' : 'debug' }),
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.debug('Logging initialized at debug level');
}

export default logger;

