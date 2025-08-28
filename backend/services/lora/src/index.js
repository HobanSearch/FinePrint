"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const config_1 = require("@fineprintai/shared-config");
const logger_1 = require("@fineprintai/shared-logger");
const auth_1 = require("@fineprintai/auth");
const lora_1 = require("./routes/lora");
const training_1 = require("./routes/training");
const models_1 = require("./routes/models");
const metrics_1 = require("./routes/metrics");
const gated_lora_service_1 = require("./services/gated-lora-service");
const training_engine_1 = require("./services/training-engine");
const model_registry_1 = require("./services/model-registry");
const performance_monitor_1 = require("./services/performance-monitor");
const logger = (0, logger_1.createServiceLogger)('lora-service');
async function buildApp() {
    const app = (0, fastify_1.default)({
        logger: false,
        requestTimeout: 300000,
        bodyLimit: 52428800,
    });
    await app.register(helmet_1.default, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", 'data:', 'https:'],
            },
        },
    });
    await app.register(cors_1.default, {
        origin: config_1.config.cors.origins,
        credentials: true,
    });
    await app.register(rate_limit_1.default, {
        max: 50,
        timeWindow: '1 minute',
    });
    await app.register(multipart_1.default, {
        limits: {
            fileSize: 52428800,
            files: 10,
        },
    });
    await app.register(auth_1.authPlugin);
    const gatedLoRAService = new gated_lora_service_1.GatedLoRAService();
    const trainingEngine = new training_engine_1.TrainingEngine(gatedLoRAService);
    const modelRegistry = new model_registry_1.ModelRegistry();
    const performanceMonitor = new performance_monitor_1.PerformanceMonitor();
    app.decorate('gatedLoRAService', gatedLoRAService);
    app.decorate('trainingEngine', trainingEngine);
    app.decorate('modelRegistry', modelRegistry);
    app.decorate('performanceMonitor', performanceMonitor);
    app.get('/health', async () => {
        const services = {
            gated_lora: await gatedLoRAService.healthCheck(),
            training_engine: trainingEngine.isHealthy(),
            model_registry: modelRegistry.isHealthy(),
            performance_monitor: performanceMonitor.isHealthy(),
        };
        const allHealthy = Object.values(services).every(status => status);
        return {
            status: allHealthy ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            services,
        };
    });
    await app.register(lora_1.loraRoutes, { prefix: '/api/lora' });
    await app.register(training_1.trainingRoutes, { prefix: '/api/training' });
    await app.register(models_1.modelsRoutes, { prefix: '/api/models' });
    await app.register(metrics_1.metricsRoutes, { prefix: '/api/metrics' });
    app.setErrorHandler((error, request, reply) => {
        logger.error('Request error', {
            error: error.message,
            stack: error.stack,
            url: request.url,
            method: request.method,
        });
        const statusCode = error.statusCode || 500;
        reply.status(statusCode).send({
            error: {
                message: statusCode === 500 ? 'Internal Server Error' : error.message,
                statusCode,
                timestamp: new Date().toISOString(),
            },
        });
    });
    return app;
}
async function start() {
    try {
        const app = await buildApp();
        const port = config_1.config.services.lora?.port || 8007;
        const host = config_1.config.services.lora?.host || '0.0.0.0';
        await app.listen({ port, host });
        logger.info('Gated LoRA service started', {
            port,
            host,
            environment: config_1.config.environment,
            version: '1.0.0',
        });
        const gracefulShutdown = async (signal) => {
            logger.info(`Received ${signal}, shutting down gracefully`);
            try {
                await app.close();
                logger.info('Gated LoRA service stopped');
                process.exit(0);
            }
            catch (error) {
                logger.error('Error during shutdown', { error });
                process.exit(1);
            }
        };
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    }
    catch (error) {
        logger.error('Failed to start Gated LoRA service', { error });
        process.exit(1);
    }
}
if (require.main === module) {
    start();
}
//# sourceMappingURL=index.js.map