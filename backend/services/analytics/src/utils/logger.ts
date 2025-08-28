/**
 * Fine Print AI - Analytics Service Logger
 * 
 * Structured logging for analytics service with privacy-compliant practices
 */

import pino, { Logger } from 'pino';
import { config } from '@/config';

// Custom log levels for analytics
const customLevels = {
  analytics: 35,
  performance: 45,
  privacy: 55
};

// Privacy-safe serializers to prevent PII logging
const safeSerializers = {
  req: (req: any) => {
    const safePath = req.url?.replace(/\/users\/[^\/]+/g, '/users/[USER_ID]');
    return {
      method: req.method,
      url: safePath,
      hostname: req.hostname,
      remoteAddress: req.ip ? req.ip.replace(/\d+$/, 'x') : undefined, // Anonymize last IP octet
      userAgent: req.headers?.['user-agent']?.substring(0, 100), // Truncate user agent
      requestId: req.id
    };
  },
  
  res: (res: any) => ({
    statusCode: res.statusCode,
    responseTime: res.responseTime,
    contentLength: res.headers?.['content-length']
  }),
  
  err: pino.stdSerializers.err,
  
  // Custom serializer for analytics events
  event: (event: any) => {
    const { userId, email, ...safeEvent } = event;
    return {
      ...safeEvent,
      userId: userId ? `user_${Buffer.from(userId).toString('base64').substring(0, 8)}` : undefined,
      email: email ? `${email.split('@')[0].substring(0, 3)}***@${email.split('@')[1]}` : undefined
    };
  },
  
  // Custom serializer for database queries
  query: (query: any) => ({
    operation: query.operation,
    table: query.table,
    duration: query.duration,
    rowCount: query.rowCount,
    // Exclude actual query parameters that might contain PII
    hasParameters: !!query.parameters
  })
};

// Create logger instance
export const logger: Logger = pino({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  
  customLevels,
  useOnlyCustomLevels: false,
  
  serializers: safeSerializers,
  
  formatters: {
    level: (label: string) => ({
      level: label
    }),
    log: (object: any) => ({
      ...object,
      service: 'analytics',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv
    })
  },
  
  redact: {
    paths: [
      // Redact sensitive fields
      'password',
      'token',
      'apiKey',
      'secret',
      'authorization',
      'cookie',
      'email',
      'phone',
      'ssn',
      'credit_card',
      // Redact nested sensitive fields
      '*.password',
      '*.token',
      '*.apiKey',
      '*.secret',
      '*.authorization',
      '*.email',
      '*.phone',
      // Analytics specific
      'event.properties.email',
      'event.properties.phone',
      'user.email',
      'user.phone',
      'properties.email',
      'properties.phone'
    ],
    censor: '[REDACTED]'
  },
  
  transport: config.nodeEnv !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      messageFormat: '[{service}] {msg}',
      levelFirst: true
    }
  } : undefined
});

// Analytics-specific logging functions
export const analyticsLogger = {
  // Log analytics events (with privacy protection)
  event: (eventName: string, properties: any, userId?: string) => {
    logger.analytics({
      type: 'analytics_event',
      event: {
        name: eventName,
        properties: {
          ...properties,
          timestamp: new Date().toISOString()
        },
        userId
      }
    }, `Analytics event: ${eventName}`);
  },
  
  // Log performance metrics
  performance: (metric: string, value: number, tags?: Record<string, string>) => {
    logger.performance({
      type: 'performance_metric',
      metric: {
        name: metric,
        value,
        tags,
        timestamp: new Date().toISOString()
      }
    }, `Performance metric: ${metric} = ${value}`);
  },
  
  // Log privacy-related events
  privacy: (action: string, details: any) => {
    logger.privacy({
      type: 'privacy_event',
      privacy: {
        action,
        details,
        timestamp: new Date().toISOString()
      }
    }, `Privacy action: ${action}`);
  },
  
  // Log data processing events
  dataProcessing: (operation: string, recordCount: number, duration: number) => {
    logger.info({
      type: 'data_processing',
      processing: {
        operation,
        recordCount,
        duration,
        timestamp: new Date().toISOString()
      }
    }, `Data processing: ${operation} - ${recordCount} records in ${duration}ms`);
  },
  
  // Log API usage
  apiUsage: (endpoint: string, method: string, statusCode: number, responseTime: number) => {
    logger.info({
      type: 'api_usage',
      api: {
        endpoint: endpoint.replace(/\/\d+/g, '/:id'), // Anonymize IDs in paths
        method,
        statusCode,
        responseTime,
        timestamp: new Date().toISOString()
      }
    }, `API usage: ${method} ${endpoint} - ${statusCode} (${responseTime}ms)`);
  },
  
  // Log errors with context
  error: (error: Error, context?: any) => {
    logger.error({
      type: 'error',
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        context: context ? JSON.stringify(context) : undefined
      }
    }, `Error: ${error.message}`);
  },
  
  // Log system health
  health: (service: string, status: 'healthy' | 'unhealthy' | 'degraded', details?: any) => {
    const level = status === 'healthy' ? 'info' : status === 'degraded' ? 'warn' : 'error';
    logger[level]({
      type: 'health_check',
      health: {
        service,
        status,
        details,
        timestamp: new Date().toISOString()
      }
    }, `Health check: ${service} is ${status}`);
  }
};

// Export singleton logger instance
export default logger;