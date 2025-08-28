"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const pino_1 = __importDefault(require("pino"));
const config_1 = require("../config");
class Logger {
    static instance;
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = (0, pino_1.default)({
                name: 'agent-orchestration',
                level: config_1.config.environment === 'development' ? 'debug' : 'info',
                transport: config_1.config.environment === 'development' ? {
                    target: 'pino-pretty',
                    options: {
                        colorize: true,
                        translateTime: 'HH:MM:ss Z',
                        ignore: 'pid,hostname',
                    },
                } : undefined,
                formatters: {
                    level: (label) => {
                        return { level: label.toUpperCase() };
                    },
                },
                timestamp: pino_1.default.stdTimeFunctions.isoTime,
                serializers: {
                    req: pino_1.default.stdSerializers.req,
                    res: pino_1.default.stdSerializers.res,
                    err: pino_1.default.stdSerializers.err,
                },
            });
        }
        return Logger.instance;
    }
    static child(bindings) {
        return Logger.getInstance().child(bindings);
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map