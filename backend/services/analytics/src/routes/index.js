"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const product_analytics_1 = __importDefault(require("./product-analytics"));
const ai_analytics_1 = __importDefault(require("./ai-analytics"));
const routes = async (fastify) => {
    await fastify.register(product_analytics_1.default, { prefix: '/product' });
    await fastify.register(ai_analytics_1.default, { prefix: '/ai' });
    fastify.get('/health', async (request, reply) => {
        return reply.code(200).send({
            status: 'healthy',
            service: 'analytics',
            timestamp: new Date().toISOString(),
            version: '1.0.0'
        });
    });
};
exports.default = routes;
//# sourceMappingURL=index.js.map