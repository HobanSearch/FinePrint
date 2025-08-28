import { config } from '../config/index.js';
class Logger {
    serviceName = 'design-system-service';
    formatMessage(level, message, context) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            service: this.serviceName,
            level: level.toUpperCase(),
            message,
            ...context,
        };
        return JSON.stringify(logEntry);
    }
    log(level, message, context) {
        const formattedMessage = this.formatMessage(level, message, context);
        switch (level) {
            case 'error':
            case 'fatal':
                console.error(formattedMessage);
                break;
            case 'warn':
                console.warn(formattedMessage);
                break;
            case 'debug':
            case 'trace':
                if (config.logLevel === 'debug' || config.logLevel === 'trace') {
                    console.log(formattedMessage);
                }
                break;
            default:
                console.log(formattedMessage);
        }
    }
    fatal(messageOrContext, contextOrMessage) {
        if (typeof messageOrContext === 'string') {
            this.log('fatal', messageOrContext, contextOrMessage);
        }
        else {
            this.log('fatal', contextOrMessage, messageOrContext);
        }
    }
    error(messageOrErrorOrContext, contextOrMessage) {
        if (messageOrErrorOrContext instanceof Error) {
            const error = messageOrErrorOrContext;
            const message = contextOrMessage || error.message;
            this.log('error', message, {
                error: error.message,
                stack: error.stack,
            });
        }
        else if (typeof messageOrErrorOrContext === 'string') {
            this.log('error', messageOrErrorOrContext, contextOrMessage);
        }
        else {
            this.log('error', contextOrMessage, messageOrErrorOrContext);
        }
    }
    warn(messageOrContext, contextOrMessage) {
        if (typeof messageOrContext === 'string') {
            this.log('warn', messageOrContext, contextOrMessage);
        }
        else {
            this.log('warn', contextOrMessage, messageOrContext);
        }
    }
    info(messageOrContext, contextOrMessage) {
        if (typeof messageOrContext === 'string') {
            this.log('info', messageOrContext, contextOrMessage);
        }
        else {
            this.log('info', contextOrMessage, messageOrContext);
        }
    }
    debug(messageOrContext, contextOrMessage) {
        if (typeof messageOrContext === 'string') {
            this.log('debug', messageOrContext, contextOrMessage);
        }
        else {
            this.log('debug', contextOrMessage, messageOrContext);
        }
    }
    trace(messageOrContext, contextOrMessage) {
        if (typeof messageOrContext === 'string') {
            this.log('trace', messageOrContext, contextOrMessage);
        }
        else {
            this.log('trace', contextOrMessage, messageOrContext);
        }
    }
    child(context) {
        const childLogger = new Logger();
        const originalLog = childLogger.log.bind(childLogger);
        childLogger.log = (level, message, childContext) => {
            originalLog(level, message, { ...context, ...childContext });
        };
        return childLogger;
    }
}
export const logger = new Logger();
//# sourceMappingURL=logger.js.map