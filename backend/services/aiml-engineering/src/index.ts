import Fastify from 'fastify';
import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { initializeServices } from './services';
import { registerRoutes } from './routes';
import { setupPlugins } from './plugins';
import { ModelLifecycleManager } from './services/model-lifecycle-manager';
import { HyperparameterOptimizer } from './services/hyperparameter-optimizer';
import { ModelRegistry } from './services/model-registry';
import { PerformanceMonitor } from './services/performance-monitor';
import { AutoMLPipeline } from './services/automl-pipeline';
import { ABTestingFramework } from './services/ab-testing-framework';
import { ResourceOptimizer } from './services/resource-optimizer';
import { MLOpsOrchestrator } from './services/mlops-orchestrator';

const logger = createServiceLogger('aiml-engineering');

const fastify = Fastify({
  logger: {
    level: config.server.logLevel,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
  requestTimeout: 300000, // 5 minutes for ML operations
  bodyLimit: 10485760, // 10MB for model uploads
});

// Service instances
let modelLifecycleManager: ModelLifecycleManager;
let hyperparameterOptimizer: HyperparameterOptimizer;
let modelRegistry: ModelRegistry;
let performanceMonitor: PerformanceMonitor;
let automlPipeline: AutoMLPipeline;
let abTestingFramework: ABTestingFramework;
let resourceOptimizer: ResourceOptimizer;
let mlOpsOrchestrator: MLOpsOrchestrator;

async function initializeAIMLServices() {
  try {
    logger.info('Initializing AI/ML Engineering services...');

    // Initialize core services
    modelRegistry = new ModelRegistry();
    await modelRegistry.initialize();

    performanceMonitor = new PerformanceMonitor();
    await performanceMonitor.initialize();

    resourceOptimizer = new ResourceOptimizer();
    await resourceOptimizer.initialize();

    modelLifecycleManager = new ModelLifecycleManager(
      modelRegistry,
      performanceMonitor,
      resourceOptimizer
    );
    await modelLifecycleManager.initialize();

    hyperparameterOptimizer = new HyperparameterOptimizer(
      modelRegistry,
      performanceMonitor
    );
    await hyperparameterOptimizer.initialize();

    automlPipeline = new AutoMLPipeline(
      modelLifecycleManager,
      hyperparameterOptimizer,
      modelRegistry
    );
    await automlPipeline.initialize();

    abTestingFramework = new ABTestingFramework(
      modelRegistry,
      performanceMonitor
    );
    await abTestingFramework.initialize();

    mlOpsOrchestrator = new MLOpsOrchestrator(
      modelLifecycleManager,
      hyperparameterOptimizer,
      modelRegistry,
      performanceMonitor,
      automlPipeline,
      abTestingFramework,
      resourceOptimizer
    );
    await mlOpsOrchestrator.initialize();

    // Add services to fastify context
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
  } catch (error) {
    logger.error('Failed to initialize AI/ML services', { error: error.message });
    throw error;
  }
}

async function start() {
  try {
    // Setup plugins
    await setupPlugins(fastify);

    // Initialize AI/ML services
    await initializeAIMLServices();

    // Initialize other services (cache, queue, etc.)
    await initializeServices();

    // Register routes
    await registerRoutes(fastify);

    // Start server
    const port = config.services.aimlEngineering?.port || 3006;
    const host = config.server.host || '0.0.0.0';

    await fastify.listen({ port, host });

    logger.info(`AI/ML Engineering service started on ${host}:${port}`, {
      port,
      host,
      environment: config.environment,
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

    // Start background services
    await startBackgroundServices();

  } catch (error) {
    logger.error('Failed to start AI/ML Engineering service', { error: error.message });
    process.exit(1);
  }
}

async function startBackgroundServices() {
  try {
    // Start continuous monitoring
    await performanceMonitor.startContinuousMonitoring();
    
    // Start resource optimization scheduler
    await resourceOptimizer.startOptimizationScheduler();
    
    // Start MLOps orchestration
    await mlOpsOrchestrator.startOrchestration();

    logger.info('Background services started');
  } catch (error) {
    logger.error('Failed to start background services', { error: error.message });
  }
}

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  try {
    // Stop background services
    if (performanceMonitor) await performanceMonitor.stopContinuousMonitoring();
    if (resourceOptimizer) await resourceOptimizer.stopOptimizationScheduler();
    if (mlOpsOrchestrator) await mlOpsOrchestrator.stopOrchestration();

    // Stop training jobs
    if (modelLifecycleManager) await modelLifecycleManager.stopAllTraining();

    // Close server
    await fastify.close();

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', { error: error.message });
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

// Start the service
start();