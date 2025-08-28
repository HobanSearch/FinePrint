"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupWorkers = setupWorkers;
const logger_1 = require("@fineprintai/shared-logger");
const logger = (0, logger_1.createServiceLogger)('notification-workers');
async function setupWorkers() {
    try {
        logger.info('All notification workers are running');
    }
    catch (error) {
        logger.error('Failed to setup workers', { error });
        throw error;
    }
}
//# sourceMappingURL=index.js.map