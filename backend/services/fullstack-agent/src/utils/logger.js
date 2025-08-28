"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const pino_1 = __importDefault(require("pino"));
const config_1 = require("@/config");
class Logger {
    static instance;
    logger;
    constructor() {
        this.logger = (0, pino_1.default)({
            level: config_1.config.logger.level,
            ...(config_1.config.logger.prettyPrint && {
                transport: {
                    target: 'pino-pretty',
                    options: {
                        colorize: true,
                        translateTime: 'HH:MM:ss Z',
                        ignore: 'pid,hostname',
                    },
                },
            }),
            redact: config_1.config.logger.redactPaths,
            serializers: {
                err: pino_1.default.stdSerializers.err,
                req: pino_1.default.stdSerializers.req,
                res: pino_1.default.stdSerializers.res,
            },
            base: {
                service: 'fullstack-agent',
                version: '1.0.0',
            },
        });
    }
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    info(message, meta) {
        this.logger.info(meta, message);
    }
    error(message, meta) {
        this.logger.error(meta, message);
    }
    warn(message, meta) {
        this.logger.warn(meta, message);
    }
    debug(message, meta) {
        this.logger.debug(meta, message);
    }
    trace(message, meta) {
        this.logger.trace(meta, message);
    }
    fatal(message, meta) {
        this.logger.fatal(meta, message);
    }
    child(bindings) {
        return this.logger.child(bindings);
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map