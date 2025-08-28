/**
 * Fine Print AI - Data Aggregation Service Logger
 */

import { config } from '../config';

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
  service: string;
  metadata?: Record<string, any>;
}

class Logger {
  private serviceName = 'data-aggregation-service';

  private formatMessage(level: string, message: string, metadata?: any): LogEntry {
    return {
      level: level as LogEntry['level'],
      message,
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      ...(metadata && { metadata }),
    };
  }

  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const configLevel = config.logLevel.toLowerCase();
    const configIndex = levels.indexOf(configLevel);
    const messageIndex = levels.indexOf(level);
    
    return messageIndex >= configIndex;
  }

  private log(level: string, message: string, metadata?: any): void {
    if (!this.shouldLog(level)) return;

    const logEntry = this.formatMessage(level, message, metadata);
    
    // In production, you might want to send logs to external service
    // For now, we'll use console with structured format
    const output = JSON.stringify(logEntry);
    
    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'info':
        console.info(output);
        break;
      case 'debug':
        console.debug(output);
        break;
      default:
        console.log(output);
    }
  }

  debug(message: string, metadata?: any): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: any): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: any): void {
    this.log('warn', message, metadata);
  }

  error(message: string, error?: Error | any, metadata?: any): void {
    const errorMetadata = {
      ...metadata,
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          ...(error.code && { code: error.code }),
          ...(error.statusCode && { statusCode: error.statusCode }),
        },
      }),
    };

    this.log('error', message, errorMetadata);
  }

  // Performance logging
  startTimer(operationId: string): void {
    this.debug(`Starting operation: ${operationId}`, {
      operationId,
      startTime: Date.now(),
    });
  }

  endTimer(operationId: string, metadata?: any): void {
    this.debug(`Completed operation: ${operationId}`, {
      operationId,
      endTime: Date.now(),
      ...metadata,
    });
  }

  // HTTP request logging
  logRequest(method: string, url: string, statusCode?: number, duration?: number): void {
    this.info('HTTP Request', {
      method,
      url,
      statusCode,
      duration,
    });
  }

  // Database operation logging
  logDatabaseOperation(operation: string, table: string, duration?: number, recordCount?: number): void {
    this.debug('Database Operation', {
      operation,
      table,
      duration,
      recordCount,
    });
  }

  // Crawling operation logging
  logCrawlOperation(website: string, status: 'success' | 'failed', details?: any): void {
    this.info('Crawl Operation', {
      website,
      status,
      ...details,
    });
  }

  // Processing operation logging
  logProcessingOperation(documentId: string, status: 'started' | 'completed' | 'failed', details?: any): void {
    this.info('Processing Operation', {
      documentId,
      status,
      ...details,
    });
  }

  // Compliance alert logging
  logComplianceAlert(regulation: string, severity: string, websiteName: string, details?: any): void {
    this.warn('Compliance Alert', {
      regulation,
      severity,
      websiteName,
      ...details,
    });
  }
}

export const logger = new Logger();