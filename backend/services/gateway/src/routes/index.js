"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRoutes = registerRoutes;
const health_1 = __importDefault(require("./health"));
const admin_1 = __importDefault(require("./admin"));
const metrics_1 = __importDefault(require("./metrics"));
const config_1 = __importDefault(require("./config"));
async function registerRoutes(server) {
    await server.register(health_1.default, { prefix: '/health' });
    await server.register(admin_1.default, { prefix: '/admin' });
    await server.register(metrics_1.default, { prefix: '/metrics' });
    await server.register(config_1.default, { prefix: '/config' });
    server.get('/', async (request, reply) => {
        reply.send({
            service: 'gateway-service',
            version: '1.0.0',
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
        });
    });
}
//# sourceMappingURL=index.js.map