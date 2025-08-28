"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const config_1 = require("@fineprintai/shared-config");
const logger_1 = require("@fineprintai/shared-logger");
const services_1 = require("./services");
const routes_1 = require("./routes");
const plugins_1 = require("./plugins");
const model_lifecycle_manager_1 = require("./services/model-lifecycle-manager");
const hyperparameter_optimizer_1 = require("./services/hyperparameter-optimizer");
const model_registry_1 = require("./services/model-registry");
const performance_monitor_1 = require("./services/performance-monitor");
const automl_pipeline_1 = require("./services/automl-pipeline");
const ab_testing_framework_1 = require("./services/ab-testing-framework");
const resource_optimizer_1 = require("./services/resource-optimizer");
const mlops_orchestrator_1 = require("./services/mlops-orchestrator");
const logger = (0, logger_1.createServiceLogger)('aiml-engineering');
const fastify = (0, fastify_1.default)({
    logger: {
        level: config_1.config.server.logLevel,
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
            },
        },
    },
    requestTimeout: 300000,
    bodyLimit: 10485760,
});
let modelLifecycleManager;
let hyperparameterOptimizer;
let modelRegistry;
let performanceMonitor;
let automlPipeline;
let abTestingFramework;
let resourceOptimizer;
let mlOpsOrchestrator;
async function initializeAIMLServices() {
    try {
        logger.info('Initializing AI/ML Engineering services...');
        modelRegistry = new model_registry_1.ModelRegistry();
        await modelRegistry.initialize();
        performanceMonitor = new performance_monitor_1.PerformanceMonitor();
        await performanceMonitor.initialize();
        resourceOptimizer = new resource_optimizer_1.ResourceOptimizer();
        await resourceOptimizer.initialize();
        modelLifecycleManager = new model_lifecycle_manager_1.ModelLifecycleManager(modelRegistry, performanceMonitor, resourceOptimizer);
        await modelLifecycleManager.initialize();
        hyperparameterOptimizer = new hyperparameter_optimizer_1.HyperparameterOptimizer(modelRegistry, performanceMonitor);
        await hyperparameterOptimizer.initialize();
        automlPipeline = new automl_pipeline_1.AutoMLPipeline(modelLifecycleManager, hyperparameterOptimizer, modelRegistry);
        await automlPipeline.initialize();
        abTestingFramework = new ab_testing_framework_1.ABTestingFramework(modelRegistry, performanceMonitor);
        await abTestingFramework.initialize();
        mlOpsOrchestrator = new mlops_orchestrator_1.MLOpsOrchestrator(modelLifecycleManager, hyperparameterOptimizer, modelRegistry, performanceMonitor, automlPipeline, abTestingFramework, resourceOptimizer);
        await mlOpsOrchestrator.initialize();
        fastify.decorate('aimlServices', {
            modelLifecycleManager,
            hyperparameterOptimizer,
            modelRegistry,
            performanceMonitor,
            automlPipeline,
            abTestingFramework,
            resourceOptimizer,
            mlOpsOrchestrator,
        });
        logger.info('AI/ML Engineering services initialized successfully');
    }
    catch (error) {
        logger.error('Failed to initialize AI/ML services', { error: error.message });
        throw error;
    }
}
async function start() {
    try {
        await (0, plugins_1.setupPlugins)(fastify);
        await initializeAIMLServices();
        await (0, services_1.initializeServices)();
        await (0, routes_1.registerRoutes)(fastify);
        const port = config_1.config.services.aimlEngineering?.port || 3006;
        const host = config_1.config.server.host || '0.0.0.0';
        await fastify.listen({ port, host });
        logger.info(`AI/ML Engineering service started on ${host}:${port}`, {
            port,
            host,
            environment: config_1.config.environment,
            nodeVersion: process.version,
            services: [
                'ModelLifecycleManager',
                'HyperparameterOptimizer',
                'ModelRegistry',
                'PerformanceMonitor',
                'AutoMLPipeline',
                'ABTestingFramework',
                'ResourceOptimizer',
                'MLOpsOrchestrator'
            ]
        });
        await startBackgroundServices();
    }
    catch (error) {
        logger.error('Failed to start AI/ML Engineering service', { error: error.message });
        process.exit(1);
    }
}
async function startBackgroundServices() {
    try {
        await performanceMonitor.startContinuousMonitoring();
        await resourceOptimizer.startOptimizationScheduler();
        await mlOpsOrchestrator.startOrchestration();
        logger.info('Background services started');
    }
    catch (error) {
        logger.error('Failed to start background services', { error: error.message });
    }
}
async function gracefulShutdown(signal) {
    logger.info(`Received ${signal}, starting graceful shutdown...`);
    try {
        if (performanceMonitor)
            await performanceMonitor.stopContinuousMonitoring();
        if (resourceOptimizer)
            await resourceOptimizer.stopOptimizationScheduler();
        if (mlOpsOrchestrator)
            await mlOpsOrchestrator.stopOrchestration();
        if (modelLifecycleManager)
            await modelLifecycleManager.stopAllTraining();
        await fastify.close();
        logger.info('Graceful shutdown completed');
        process.exit(0);
    }
    catch (error) {
        logger.error('Error during graceful shutdown', { error: error.message });
        process.exit(1);
    }
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', { reason, promise });
    process.exit(1);
});
start();
//# sourceMappingURL=index.js.map