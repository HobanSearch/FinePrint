/**
 * Logger utility
 */

import { config } from '../config/index.js'

interface LogContext {
  [key: string]: any
}

class Logger {
  private serviceName = 'design-system-service'

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString()
    const logEntry = {
      timestamp,
      service: this.serviceName,
      level: level.toUpperCase(),
      message,
      ...context,
    }

    return JSON.stringify(logEntry)
  }

  private log(level: string, message: string, context?: LogContext): void {
    const formattedMessage = this.formatMessage(level, message, context)
    
    switch (level) {
      case 'error':
      case 'fatal':
        console.error(formattedMessage)
        break
      case 'warn':
        console.warn(formattedMessage)
        break
      case 'debug':
      case 'trace':
        if (config.logLevel === 'debug' || config.logLevel === 'trace') {
          console.log(formattedMessage)
        }
        break
      default:
        console.log(formattedMessage)
    }
  }

  fatal(message: string, context?: LogContext): void
  fatal(context: LogContext, message: string): void
  fatal(messageOrContext: string | LogContext, contextOrMessage?: LogContext | string): void {
    if (typeof messageOrContext === 'string') {
      this.log('fatal', messageOrContext, contextOrMessage as LogContext)
    } else {
      this.log('fatal', contextOrMessage as string, messageOrContext)
    }
  }

  error(message: string, context?: LogContext): void
  error(error: Error, message?: string): void
  error(context: LogContext, message: string): void
  error(messageOrErrorOrContext: string | Error | LogContext, contextOrMessage?: LogContext | string): void {
    if (messageOrErrorOrContext instanceof Error) {
      const error = messageOrErrorOrContext
      const message = contextOrMessage as string || error.message
      this.log('error', message, {
        error: error.message,
        stack: error.stack,
      })
    } else if (typeof messageOrErrorOrContext === 'string') {
      this.log('error', messageOrErrorOrContext, contextOrMessage as LogContext)
    } else {
      this.log('error', contextOrMessage as string, messageOrErrorOrContext)
    }
  }

  warn(message: string, context?: LogContext): void
  warn(context: LogContext, message: string): void
  warn(messageOrContext: string | LogContext, contextOrMessage?: LogContext | string): void {
    if (typeof messageOrContext === 'string') {
      this.log('warn', messageOrContext, contextOrMessage as LogContext)
    } else {
      this.log('warn', contextOrMessage as string, messageOrContext)
    }
  }

  info(message: string, context?: LogContext): void
  info(context: LogContext, message: string): void
  info(messageOrContext: string | LogContext, contextOrMessage?: LogContext | string): void {
    if (typeof messageOrContext === 'string') {
      this.log('info', messageOrContext, contextOrMessage as LogContext)
    } else {
      this.log('info', contextOrMessage as string, messageOrContext)
    }
  }

  debug(message: string, context?: LogContext): void
  debug(context: LogContext, message: string): void
  debug(messageOrContext: string | LogContext, contextOrMessage?: LogContext | string): void {
    if (typeof messageOrContext === 'string') {
      this.log('debug', messageOrContext, contextOrMessage as LogContext)
    } else {
      this.log('debug', contextOrMessage as string, messageOrContext)
    }
  }

  trace(message: string, context?: LogContext): void
  trace(context: LogContext, message: string): void
  trace(messageOrContext: string | LogContext, contextOrMessage?: LogContext | string): void {
    if (typeof messageOrContext === 'string') {
      this.log('trace', messageOrContext, contextOrMessage as LogContext)
    } else {
      this.log('trace', contextOrMessage as string, messageOrContext)
    }
  }

  child(context: LogContext): Logger {
    const childLogger = new Logger()
    const originalLog = childLogger.log.bind(childLogger)
    
    childLogger.log = (level: string, message: string, childContext?: LogContext) => {
      originalLog(level, message, { ...context, ...childContext })
    }
    
    return childLogger
  }
}

export const logger = new Logger()