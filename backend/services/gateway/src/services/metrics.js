"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsService = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const logger = (0, logger_1.createServiceLogger)('metrics-service');
class MetricsService {
    config;
    server;
    constructor(config) {
        this.config = config;
    }
    async initialize() {
        logger.info('Metrics service initialized', {
            prometheusPort: this.config.prometheusPort,
        });
    }
    async startMetricsServer() {
        logger.info(`Metrics server would start on port ${this.config.prometheusPort}`);
    }
    async shutdown() {
        if (this.server) {
            await this.server.close();
        }
        logger.info('Metrics service shut down');
    }
}
exports.MetricsService = MetricsService;
//# sourceMappingURL=metrics.js.map