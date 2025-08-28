"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const config_1 = require("@fineprintai/shared-config");
const logger_1 = require("@fineprintai/shared-logger");
const auth_1 = require("@fineprintai/auth");
const dspy_1 = require("./routes/dspy");
const optimization_1 = require("./routes/optimization");
const modules_1 = require("./routes/modules");
const metrics_1 = require("./routes/metrics");
const dspy_service_1 = require("./services/dspy-service");
const optimization_engine_1 = require("./services/optimization-engine");
const module_registry_1 = require("./services/module-registry");
const metrics_collector_1 = require("./services/metrics-collector");
const logger = (0, logger_1.createServiceLogger)('dspy-service');
async function buildApp() {
    const app = (0, fastify_1.default)({
        logger: false,
        requestTimeout: 60000,
        bodyLimit: 10485760,
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
        max: 100,
        timeWindow: '1 minute',
    });
    await app.register(auth_1.authPlugin);
    const dspyService = new dspy_service_1.DSPyService();
    const optimizationEngine = new optimization_engine_1.OptimizationEngine(dspyService);
    const moduleRegistry = new module_registry_1.ModuleRegistry(dspyService);
    const metricsCollector = new metrics_collector_1.MetricsCollector();
    app.decorate('dspyService', dspyService);
    app.decorate('optimizationEngine', optimizationEngine);
    app.decorate('moduleRegistry', moduleRegistry);
    app.decorate('metricsCollector', metricsCollector);
    app.get('/health', async () => {
        const ollama = await dspyService.healthCheck();
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            services: {
                ollama: ollama ? 'healthy' : 'unhealthy',
                dspy: 'healthy',
                optimization: optimizationEngine.isHealthy() ? 'healthy' : 'unhealthy',
            },
        };
    });
    await app.register(dspy_1.dspyRoutes, { prefix: '/api/dspy' });
    await app.register(optimization_1.optimizationRoutes, { prefix: '/api/optimization' });
    await app.register(modules_1.moduleRoutes, { prefix: '/api/modules' });
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
        const port = config_1.config.services.dspy.port || 8006;
        const host = config_1.config.services.dspy.host || '0.0.0.0';
        await app.listen({ port, host });
        logger.info('DSPy service started', {
            port,
            host,
            environment: config_1.config.environment,
            version: '1.0.0',
        });
        const gracefulShutdown = async (signal) => {
            logger.info(`Received ${signal}, shutting down gracefully`);
            try {
                await app.close();
                logger.info('DSPy service stopped');
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
        logger.error('Failed to start DSPy service', { error });
        process.exit(1);
    }
}
if (require.main === module) {
    start();
}
//# sourceMappingURL=index.js.map