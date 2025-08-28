"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsLogger = exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
const config_1 = require("@/config");
const customLevels = {
    analytics: 35,
    performance: 45,
    privacy: 55
};
const safeSerializers = {
    req: (req) => {
        const safePath = req.url?.replace(/\/users\/[^\/]+/g, '/users/[USER_ID]');
        return {
            method: req.method,
            url: safePath,
            hostname: req.hostname,
            remoteAddress: req.ip ? req.ip.replace(/\d+$/, 'x') : undefined,
            userAgent: req.headers?.['user-agent']?.substring(0, 100),
            requestId: req.id
        };
    },
    res: (res) => ({
        statusCode: res.statusCode,
        responseTime: res.responseTime,
        contentLength: res.headers?.['content-length']
    }),
    err: pino_1.default.stdSerializers.err,
    event: (event) => {
        const { userId, email, ...safeEvent } = event;
        return {
            ...safeEvent,
            userId: userId ? `user_${Buffer.from(userId).toString('base64').substring(0, 8)}` : undefined,
            email: email ? `${email.split('@')[0].substring(0, 3)}***@${email.split('@')[1]}` : undefined
        };
    },
    query: (query) => ({
        operation: query.operation,
        table: query.table,
        duration: query.duration,
        rowCount: query.rowCount,
        hasParameters: !!query.parameters
    })
};
exports.logger = (0, pino_1.default)({
    level: config_1.config.nodeEnv === 'production' ? 'info' : 'debug',
    customLevels,
    useOnlyCustomLevels: false,
    serializers: safeSerializers,
    formatters: {
        level: (label) => ({
            level: label
        }),
        log: (object) => ({
            ...object,
            service: 'analytics',
            timestamp: new Date().toISOString(),
            environment: config_1.config.nodeEnv
        })
    },
    redact: {
        paths: [
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
            '*.password',
            '*.token',
            '*.apiKey',
            '*.secret',
            '*.authorization',
            '*.email',
            '*.phone',
            'event.properties.email',
            'event.properties.phone',
            'user.email',
            'user.phone',
            'properties.email',
            'properties.phone'
        ],
        censor: '[REDACTED]'
    },
    transport: config_1.config.nodeEnv !== 'production' ? {
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
exports.analyticsLogger = {
    event: (eventName, properties, userId) => {
        exports.logger.analytics({
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
    performance: (metric, value, tags) => {
        exports.logger.performance({
            type: 'performance_metric',
            metric: {
                name: metric,
                value,
                tags,
                timestamp: new Date().toISOString()
            }
        }, `Performance metric: ${metric} = ${value}`);
    },
    privacy: (action, details) => {
        exports.logger.privacy({
            type: 'privacy_event',
            privacy: {
                action,
                details,
                timestamp: new Date().toISOString()
            }
        }, `Privacy action: ${action}`);
    },
    dataProcessing: (operation, recordCount, duration) => {
        exports.logger.info({
            type: 'data_processing',
            processing: {
                operation,
                recordCount,
                duration,
                timestamp: new Date().toISOString()
            }
        }, `Data processing: ${operation} - ${recordCount} records in ${duration}ms`);
    },
    apiUsage: (endpoint, method, statusCode, responseTime) => {
        exports.logger.info({
            type: 'api_usage',
            api: {
                endpoint: endpoint.replace(/\/\d+/g, '/:id'),
                method,
                statusCode,
                responseTime,
                timestamp: new Date().toISOString()
            }
        }, `API usage: ${method} ${endpoint} - ${statusCode} (${responseTime}ms)`);
    },
    error: (error, context) => {
        exports.logger.error({
            type: 'error',
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
                context: context ? JSON.stringify(context) : undefined
            }
        }, `Error: ${error.message}`);
    },
    health: (service, status, details) => {
        const level = status === 'healthy' ? 'info' : status === 'degraded' ? 'warn' : 'error';
        exports.logger[level]({
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
exports.default = exports.logger;
//# sourceMappingURL=logger.js.map