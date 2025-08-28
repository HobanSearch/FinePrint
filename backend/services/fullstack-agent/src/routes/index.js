"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = routes;
const code_generation_1 = __importDefault(require("./code-generation"));
const architecture_1 = __importDefault(require("./architecture"));
const quality_1 = __importDefault(require("./quality"));
const templates_1 = __importDefault(require("./templates"));
const integrations_1 = __importDefault(require("./integrations"));
const health_1 = __importDefault(require("./health"));
const metrics_1 = __importDefault(require("./metrics"));
const webhooks_1 = __importDefault(require("./webhooks"));
const websocket_1 = __importDefault(require("./websocket"));
async function routes(fastify, options) {
    await fastify.register(health_1.default, { prefix: '/health' });
    await fastify.register(metrics_1.default, { prefix: '/metrics' });
    await fastify.register(code_generation_1.default, { prefix: '/api/v1/generate' });
    await fastify.register(architecture_1.default, { prefix: '/api/v1/architecture' });
    await fastify.register(quality_1.default, { prefix: '/api/v1/quality' });
    await fastify.register(templates_1.default, { prefix: '/api/v1/templates' });
    await fastify.register(integrations_1.default, { prefix: '/api/v1/integrations' });
    await fastify.register(webhooks_1.default, { prefix: '/webhooks' });
    await fastify.register(websocket_1.default);
    fastify.get('/', async (request, reply) => {
        return {
            service: 'Full-Stack Development Agent',
            version: '1.0.0',
            status: 'operational',
            capabilities: [
                'code_generation',
                'architecture_decisions',
                'quality_assurance',
                'template_management',
                'integration_management',
            ],
            endpoints: {
                health: '/health',
                metrics: '/metrics',
                api: '/api/v1',
                docs: '/docs',
                websocket: '/ws',
            },
        };
    });
}
;
//# sourceMappingURL=index.js.map