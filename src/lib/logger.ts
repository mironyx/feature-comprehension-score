// Structured Pino logger factory.
// Design reference: docs/adr/0016-structured-logging-pino.md
//
// Usage:
//   import { logger } from '@/lib/logger';
//   logger.info({ requestId }, 'assessment created');
//   const log = logger.child({ requestId, userId });

import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

/** Base Pino logger instance for the FCS application. */
export const logger = pino({
  name: 'fcs',
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isProduction ? {} : { transport: { target: 'pino-pretty' } }),
});
