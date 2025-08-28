/**
 * Structured logging utility using Pino
 * Provides consistent logging across the service
 */

import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = pino({
  name: 'content-optimizer',
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  
  // Pretty print in development
  transport: isDevelopment ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'HH:MM:ss.l',
      singleLine: false
    }
  } : undefined,

  // Production settings
  ...(!isDevelopment && {
    formatters: {
      level: (label) => {
        return { level: label };
      }
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      error: pino.stdSerializers.err,
      request: (req) => ({
        method: req.method,
        url: req.url,
        path: req.path,
        parameters: req.params,
        query: req.query,
        headers: {
          'user-agent': req.headers['user-agent'],
          'content-type': req.headers['content-type']
        }
      }),
      response: (res) => ({
        statusCode: res.statusCode,
        duration: res.duration
      })
    }
  }),

  // Redact sensitive information
  redact: {
    paths: [
      'password',
      'apiKey',
      'authorization',
      'cookie',
      'token',
      'secret',
      '*.password',
      '*.apiKey',
      '*.token',
      'headers.authorization',
      'headers.cookie'
    ],
    censor: '[REDACTED]'
  }
});

// Child logger for specific components
export const createLogger = (component: string) => {
  return logger.child({ component });
};