"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRoutes = registerRoutes;
const logger_1 = require("@fineprintai/shared-logger");
const health_1 = __importDefault(require("./health"));
const metrics_1 = __importDefault(require("./metrics"));
const admin_1 = __importDefault(require("./admin"));
const websocket_1 = __importDefault(require("./websocket"));
const logger = (0, logger_1.createServiceLogger)('websocket-routes');
async function registerRoutes(server) {
    await server.register(health_1.default, { prefix: '/health' });
    await server.register(metrics_1.default, { prefix: '/metrics' });
    await server.register(admin_1.default, { prefix: '/admin' });
    await server.register(websocket_1.default, { prefix: '/ws' });
    server.get('/', async (request, reply) => {
        return {
            service: 'Fine Print AI WebSocket Service',
            version: '1.0.0',
            status: 'running',
            timestamp: new Date().toISOString(),
            docs: '/docs',
            health: '/health',
            metrics: '/metrics',
        };
    });
    logger.info('All routes registered successfully');
}
//# sourceMappingURL=index.js.map