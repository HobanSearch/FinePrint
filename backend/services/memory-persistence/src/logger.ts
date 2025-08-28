/**
 * Logger configuration for Memory Persistence Service
 */

import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname',
    },
  },
});

export function createServiceLogger(name: string) {
  return logger.child({ service: 'memory-persistence', component: name });
}

export default logger;