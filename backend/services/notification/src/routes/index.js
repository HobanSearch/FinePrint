"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRoutes = registerRoutes;
const logger_1 = require("@fineprintai/shared-logger");
const notifications_1 = __importDefault(require("./notifications"));
const preferences_1 = __importDefault(require("./preferences"));
const templates_1 = __importDefault(require("./templates"));
const delivery_1 = __importDefault(require("./delivery"));
const abTests_1 = __importDefault(require("./abTests"));
const webhooks_1 = __importDefault(require("./webhooks"));
const health_1 = __importDefault(require("./health"));
const logger = (0, logger_1.createServiceLogger)('notification-routes');
async function registerRoutes(server) {
    await server.register(notifications_1.default, { prefix: '/api/v1/notifications' });
    await server.register(preferences_1.default, { prefix: '/api/v1/preferences' });
    await server.register(templates_1.default, { prefix: '/api/v1/templates' });
    await server.register(delivery_1.default, { prefix: '/api/v1/delivery' });
    await server.register(abTests_1.default, { prefix: '/api/v1/ab-tests' });
    await server.register(webhooks_1.default, { prefix: '/api/v1/webhooks' });
    await server.register(health_1.default, { prefix: '/health' });
    await server.register(async function (fastify) {
        fastify.get('/ws', { websocket: true }, (connection, req) => {
            connection.socket.on('message', (message) => {
                logger.debug('WebSocket message received', { message: message.toString() });
            });
        });
    });
    logger.info('All notification service routes registered');
}
//# sourceMappingURL=index.js.map