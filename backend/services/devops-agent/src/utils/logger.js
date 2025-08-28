"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createContextLogger = exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const config_1 = require("@/config");
const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};
const logColors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'blue',
};
winston_1.default.addColors(logColors);
const logFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.colorize({ all: true }), winston_1.default.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}${info.stack ? `\n${info.stack}` : ''}`));
const transports = [
    new winston_1.default.transports.Console({
        format: logFormat,
    }),
];
if (config_1.config.app.environment === 'production') {
    transports.push(new winston_1.default.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
    }), new winston_1.default.transports.File({
        filename: 'logs/combined.log',
        format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
    }));
}
exports.logger = winston_1.default.createLogger({
    level: config_1.config.app.environment === 'development' ? 'debug' : 'info',
    levels: logLevels,
    transports,
    exitOnError: false,
});
const createContextLogger = (context) => ({
    error: (message, ...args) => exports.logger.error(`[${context}] ${message}`, ...args),
    warn: (message, ...args) => exports.logger.warn(`[${context}] ${message}`, ...args),
    info: (message, ...args) => exports.logger.info(`[${context}] ${message}`, ...args),
    http: (message, ...args) => exports.logger.http(`[${context}] ${message}`, ...args),
    debug: (message, ...args) => exports.logger.debug(`[${context}] ${message}`, ...args),
});
exports.createContextLogger = createContextLogger;
exports.default = exports.logger;
//# sourceMappingURL=logger.js.map