/**
 * Logger utility for Business Agents service
 */

import pino from 'pino';
import { config } from '../config';

const pinoConfig: pino.LoggerOptions = {
  name: config.service.name,
  level: config.monitoring.logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => {
      return { level: label };
    }
  },
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err
  }
};

// Use pretty printing in development
if (config.service.environment === 'development') {
  pinoConfig.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'yyyy-mm-dd HH:MM:ss.l'
    }
  };
}

export const logger = pino(pinoConfig);

// Create child loggers for specific components
export const createLogger = (component: string) => {
  return logger.child({ component });
};