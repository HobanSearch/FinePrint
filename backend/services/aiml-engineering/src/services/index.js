"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeServices = initializeServices;
const cache_1 = require("@fineprintai/shared-cache");
const queue_1 = require("@fineprintai/queue");
const logger_1 = require("@fineprintai/shared-logger");
const logger = (0, logger_1.createServiceLogger)('aiml-services');
async function initializeServices() {
    try {
        logger.info('Initializing shared services');
        const cache = new cache_1.CacheService();
        await cache.ping();
        logger.info('Cache service initialized');
        const queue = new queue_1.QueueService();
        logger.info('Queue service initialized');
        logger.info('All shared services initialized successfully');
    }
    catch (error) {
        logger.error('Failed to initialize shared services', { error: error.message });
        throw error;
    }
}
//# sourceMappingURL=index.js.map