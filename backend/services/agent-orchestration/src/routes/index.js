"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRoutes = registerRoutes;
const logger_1 = require("../utils/logger");
const agents_1 = __importDefault(require("./agents"));
const workflows_1 = __importDefault(require("./workflows"));
const communication_1 = __importDefault(require("./communication"));
const decisions_1 = __importDefault(require("./decisions"));
const resources_1 = __importDefault(require("./resources"));
const monitoring_1 = __importDefault(require("./monitoring"));
const business_processes_1 = __importDefault(require("./business-processes"));
const health_1 = __importDefault(require("./health"));
const logger = logger_1.Logger.child({ component: 'routes' });
async function registerRoutes(server) {
    logger.info('Registering routes...');
    await server.register(health_1.default, { prefix: '/health' });
    await server.register(async function (fastify) {
        await fastify.register(agents_1.default, { prefix: '/api/v1/agents' });
        await fastify.register(workflows_1.default, { prefix: '/api/v1/workflows' });
        await fastify.register(communication_1.default, { prefix: '/api/v1/communication' });
        await fastify.register(decisions_1.default, { prefix: '/api/v1/decisions' });
        await fastify.register(resources_1.default, { prefix: '/api/v1/resources' });
        await fastify.register(monitoring_1.default, { prefix: '/api/v1/monitoring' });
        await fastify.register(business_processes_1.default, { prefix: '/api/v1/business-processes' });
    });
    logger.info('Routes registered successfully');
}
//# sourceMappingURL=index.js.map