"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const config_1 = require("../config");
class Logger {
    serviceName = 'data-aggregation-service';
    formatMessage(level, message, metadata) {
        return {
            level: level,
            message,
            timestamp: new Date().toISOString(),
            service: this.serviceName,
            ...(metadata && { metadata }),
        };
    }
    shouldLog(level) {
        const levels = ['debug', 'info', 'warn', 'error'];
        const configLevel = config_1.config.logLevel.toLowerCase();
        const configIndex = levels.indexOf(configLevel);
        const messageIndex = levels.indexOf(level);
        return messageIndex >= configIndex;
    }
    log(level, message, metadata) {
        if (!this.shouldLog(level))
            return;
        const logEntry = this.formatMessage(level, message, metadata);
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
    debug(message, metadata) {
        this.log('debug', message, metadata);
    }
    info(message, metadata) {
        this.log('info', message, metadata);
    }
    warn(message, metadata) {
        this.log('warn', message, metadata);
    }
    error(message, error, metadata) {
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
    startTimer(operationId) {
        this.debug(`Starting operation: ${operationId}`, {
            operationId,
            startTime: Date.now(),
        });
    }
    endTimer(operationId, metadata) {
        this.debug(`Completed operation: ${operationId}`, {
            operationId,
            endTime: Date.now(),
            ...metadata,
        });
    }
    logRequest(method, url, statusCode, duration) {
        this.info('HTTP Request', {
            method,
            url,
            statusCode,
            duration,
        });
    }
    logDatabaseOperation(operation, table, duration, recordCount) {
        this.debug('Database Operation', {
            operation,
            table,
            duration,
            recordCount,
        });
    }
    logCrawlOperation(website, status, details) {
        this.info('Crawl Operation', {
            website,
            status,
            ...details,
        });
    }
    logProcessingOperation(documentId, status, details) {
        this.info('Processing Operation', {
            documentId,
            status,
            ...details,
        });
    }
    logComplianceAlert(regulation, severity, websiteName, details) {
        this.warn('Compliance Alert', {
            regulation,
            severity,
            websiteName,
            ...details,
        });
    }
}
exports.logger = new Logger();
//# sourceMappingURL=logger.js.map