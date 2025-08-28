"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const config_1 = require("../config");
exports.logger = {
    level: config_1.config.logLevel,
    serializers: {
        req: (req) => ({
            method: req.method,
            url: req.url,
            headers: {
                'user-agent': req.headers['user-agent'],
                'content-type': req.headers['content-type'],
            },
            remoteAddress: req.ip,
            remotePort: req.socket?.remotePort,
        }),
        res: (res) => ({
            statusCode: res.statusCode,
            headers: {
                'content-type': res.getHeader('content-type'),
                'content-length': res.getHeader('content-length'),
            },
        }),
        err: (err) => ({
            type: err.constructor.name,
            message: err.message,
            stack: err.stack,
            code: err.code,
            statusCode: err.statusCode,
        }),
    },
    formatters: {
        level: (label) => ({ level: label }),
        log: (obj) => ({
            ...obj,
            service: 'sales-agent',
            timestamp: new Date().toISOString(),
        }),
    },
    transport: config_1.config.nodeEnv === 'development' ? {
        target: 'pino-pretty',
        options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
            colorize: true,
        },
    } : undefined,
};
//# sourceMappingURL=logger.js.map