"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
class Logger {
    serviceName = 'content-marketing-agent';
    log(level, message, data) {
        const entry = {
            level,
            message,
            data,
            timestamp: new Date().toISOString(),
            service: this.serviceName
        };
        if (process.env.NODE_ENV === 'development') {
            console.log(JSON.stringify(entry, null, 2));
        }
        else {
            console.log(JSON.stringify(entry));
        }
    }
    info(message, data) {
        this.log('info', message, data);
    }
    warn(message, data) {
        this.log('warn', message, data);
    }
    error(message, data) {
        this.log('error', message, data);
    }
    debug(message, data) {
        if (process.env.NODE_ENV === 'development') {
            this.log('debug', message, data);
        }
    }
}
exports.logger = new Logger();
//# sourceMappingURL=logger.js.map