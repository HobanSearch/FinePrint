"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRoutes = registerRoutes;
const model_lifecycle_1 = __importDefault(require("./model-lifecycle"));
const hyperparameter_optimization_1 = __importDefault(require("./hyperparameter-optimization"));
const model_registry_1 = __importDefault(require("./model-registry"));
const performance_monitoring_1 = __importDefault(require("./performance-monitoring"));
const automl_1 = __importDefault(require("./automl"));
const ab_testing_1 = __importDefault(require("./ab-testing"));
const resource_optimization_1 = __importDefault(require("./resource-optimization"));
const mlops_1 = __importDefault(require("./mlops"));
const integrations_1 = __importDefault(require("./integrations"));
const training_datasets_1 = __importDefault(require("./training-datasets"));
const automated_training_1 = __importDefault(require("./automated-training"));
const model_evaluation_1 = __importDefault(require("./model-evaluation"));
const health_1 = __importDefault(require("./health"));
const metrics_1 = __importDefault(require("./metrics"));
const websocket_1 = __importDefault(require("./websocket"));
async function registerRoutes(fastify) {
    await fastify.register(health_1.default, { prefix: '/health' });
    await fastify.register(metrics_1.default, { prefix: '/metrics' });
    await fastify.register(websocket_1.default, { prefix: '/ws' });
    await fastify.register(model_lifecycle_1.default, { prefix: '/api/v1/training' });
    await fastify.register(training_datasets_1.default, { prefix: '/api/v1/datasets' });
    await fastify.register(automated_training_1.default, { prefix: '/api/v1/pipelines' });
    await fastify.register(model_evaluation_1.default, { prefix: '/api/v1/evaluation' });
    await fastify.register(hyperparameter_optimization_1.default, { prefix: '/api/v1/optimization' });
    await fastify.register(model_registry_1.default, { prefix: '/api/v1/registry' });
    await fastify.register(performance_monitoring_1.default, { prefix: '/api/v1/monitoring' });
    await fastify.register(automl_1.default, { prefix: '/api/v1/automl' });
    await fastify.register(ab_testing_1.default, { prefix: '/api/v1/experiments' });
    await fastify.register(resource_optimization_1.default, { prefix: '/api/v1/resources' });
    await fastify.register(mlops_1.default, { prefix: '/api/v1/mlops' });
    await fastify.register(integrations_1.default, { prefix: '/api/v1/integrations' });
    fastify.get('/', async (request, reply) => {
        return {
            service: 'AI/ML Engineering Agent',
            version: '1.0.0',
            status: 'operational',
            endpoints: {
                health: '/health',
                metrics: '/metrics',
                websocket: '/ws',
                training: '/api/v1/training',
                datasets: '/api/v1/datasets',
                pipelines: '/api/v1/pipelines',
                evaluation: '/api/v1/evaluation',
                optimization: '/api/v1/optimization',
                registry: '/api/v1/registry',
                monitoring: '/api/v1/monitoring',
                automl: '/api/v1/automl',
                experiments: '/api/v1/experiments',
                resources: '/api/v1/resources',
                mlops: '/api/v1/mlops',
                integrations: '/api/v1/integrations',
            },
            documentation: '/docs',
        };
    });
}
//# sourceMappingURL=index.js.map