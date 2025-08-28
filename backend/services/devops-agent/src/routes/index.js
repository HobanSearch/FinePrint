"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRoutes = registerRoutes;
const logger_1 = require("@/utils/logger");
const health_1 = __importDefault(require("./health"));
const infrastructure_1 = __importDefault(require("./infrastructure"));
const cicd_1 = __importDefault(require("./cicd"));
const kubernetes_1 = __importDefault(require("./kubernetes"));
const monitoring_1 = __importDefault(require("./monitoring"));
const security_1 = __importDefault(require("./security"));
const cost_optimization_1 = __importDefault(require("./cost-optimization"));
const backup_1 = __importDefault(require("./backup"));
const gitops_1 = __importDefault(require("./gitops"));
const multi_cloud_1 = __importDefault(require("./multi-cloud"));
const metrics_1 = __importDefault(require("./metrics"));
const webhooks_1 = __importDefault(require("./webhooks"));
const logger = (0, logger_1.createContextLogger)('Routes');
async function registerRoutes(fastify) {
    logger.info('Registering DevOps Agent routes...');
    try {
        await fastify.register(health_1.default, { prefix: '/health' });
        await fastify.register(infrastructure_1.default, { prefix: '/api/v1/infrastructure' });
        await fastify.register(cicd_1.default, { prefix: '/api/v1/cicd' });
        await fastify.register(kubernetes_1.default, { prefix: '/api/v1/kubernetes' });
        await fastify.register(monitoring_1.default, { prefix: '/api/v1/monitoring' });
        await fastify.register(security_1.default, { prefix: '/api/v1/security' });
        await fastify.register(cost_optimization_1.default, { prefix: '/api/v1/cost-optimization' });
        await fastify.register(backup_1.default, { prefix: '/api/v1/backup' });
        await fastify.register(gitops_1.default, { prefix: '/api/v1/gitops' });
        await fastify.register(multi_cloud_1.default, { prefix: '/api/v1/multi-cloud' });
        await fastify.register(metrics_1.default, { prefix: '/api/v1/metrics' });
        await fastify.register(webhooks_1.default, { prefix: '/api/v1/webhooks' });
        await fastify.register(require('@fastify/swagger'), {
            swagger: {
                info: {
                    title: 'Fine Print AI DevOps Agent API',
                    description: 'Comprehensive DevOps automation and infrastructure management API',
                    version: '1.0.0',
                },
                host: 'localhost:8015',
                schemes: ['http', 'https'],
                consumes: ['application/json'],
                produces: ['application/json'],
                tags: [
                    { name: 'Health', description: 'Health check endpoints' },
                    { name: 'Infrastructure', description: 'Infrastructure as Code operations' },
                    { name: 'CI/CD', description: 'Continuous Integration/Deployment pipelines' },
                    { name: 'Kubernetes', description: 'Kubernetes cluster management' },
                    { name: 'Monitoring', description: 'Monitoring and observability' },
                    { name: 'Security', description: 'Security automation and compliance' },
                    { name: 'Cost Optimization', description: 'Resource cost optimization' },
                    { name: 'Backup', description: 'Disaster recovery and backup' },
                    { name: 'GitOps', description: 'GitOps workflow automation' },
                    { name: 'Multi-Cloud', description: 'Multi-cloud management' },
                    { name: 'Metrics', description: 'System metrics and analytics' },
                    { name: 'Webhooks', description: 'Webhook integrations' },
                ],
                securityDefinitions: {
                    Bearer: {
                        type: 'apiKey',
                        name: 'Authorization',
                        in: 'header',
                    },
                },
            },
        });
        await fastify.register(require('@fastify/swagger-ui'), {
            routePrefix: '/docs',
            uiConfig: {
                docExpansion: 'full',
                deepLinking: false,
            },
            staticCSP: true,
            transformStaticCSP: (header) => header,
        });
        logger.info('All DevOps Agent routes registered successfully');
    }
    catch (error) {
        logger.error('Failed to register routes:', error);
        throw error;
    }
}
exports.default = registerRoutes;
//# sourceMappingURL=index.js.map