"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupPlugins = setupPlugins;
const logger_1 = require("../utils/logger");
const logger = logger_1.Logger.child({ component: 'plugins' });
async function setupPlugins(server) {
    logger.info('Setting up additional plugins...');
    logger.info('Additional plugins setup completed');
}
//# sourceMappingURL=index.js.map