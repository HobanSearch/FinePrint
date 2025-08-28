/**
 * Centralized logging utility for DevOps Agent
 */

import winston from 'winston';
import { config } from '@/config';

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each log level
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(logColors);

// Create custom format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}${
      info.stack ? `\n${info.stack}` : ''
    }`
  )
);

// Create transports
const transports: winston.transport[] = [
  new winston.transports.Console({
    format: logFormat,
  }),
];

// Add file transports in production
if (config.app.environment === 'production') {
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
    })
  );
}

// Create the logger
export const logger = winston.createLogger({
  level: config.app.environment === 'development' ? 'debug' : 'info',
  levels: logLevels,
  transports,
  exitOnError: false,
});

// Create context-aware logger
export const createContextLogger = (context: string) => ({
  error: (message: string, ...args: any[]) => 
    logger.error(`[${context}] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => 
    logger.warn(`[${context}] ${message}`, ...args),
  info: (message: string, ...args: any[]) => 
    logger.info(`[${context}] ${message}`, ...args),
  http: (message: string, ...args: any[]) => 
    logger.http(`[${context}] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => 
    logger.debug(`[${context}] ${message}`, ...args),
});

export default logger;