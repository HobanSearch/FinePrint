"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigReloadService = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const logger = (0, logger_1.createServiceLogger)('config-reload');
class ConfigReloadService {
    config;
    watcher;
    intervalId;
    constructor(config) {
        this.config = config;
    }
    async initialize() {
        this.intervalId = setInterval(() => this.checkConfigChanges(), this.config.watchInterval);
        logger.info('Config reload service initialized', {
            configPath: this.config.configPath,
            watchInterval: this.config.watchInterval,
        });
    }
    async shutdown() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        if (this.watcher) {
            this.watcher.close();
        }
        logger.info('Config reload service shut down');
    }
    async checkConfigChanges() {
        logger.debug('Checking for configuration changes...');
    }
}
exports.ConfigReloadService = ConfigReloadService;
//# sourceMappingURL=configReload.js.map