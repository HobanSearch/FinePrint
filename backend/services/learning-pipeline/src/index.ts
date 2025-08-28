import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { FeedbackCollector } from './feedback/collector.js';
import { TrainingOrchestrator } from './training/orchestrator.js';
import { ModelEvaluator } from './evaluation/evaluator.js';
import { logger } from './utils/logger.js';
import {
  UserFeedbackSchema,
  ImplicitFeedbackSchema,
  TrainingConfigSchema,
  DeploymentConfigSchema,
  ABTestConfigSchema,
  DriftDetectionConfigSchema,
  ActiveLearningConfigSchema,
} from './types/index.js';

// Initialize Prisma
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'info', 'warn', 'error']
    : ['error'],
});

// Initialize Redis
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

// Initialize core components
const feedbackCollector = new FeedbackCollector(prisma, redis, {
  batchSize: 100,
  batchInterval: 60000,
  maxRetries: 3,
});

const trainingOrchestrator = new TrainingOrchestrator(prisma, redis, {
  maxConcurrentRuns: 3,
  checkpointInterval: 300000, // 5 minutes
  resourceCheckInterval: 30000, // 30 seconds
});

const modelEvaluator = new ModelEvaluator(prisma, redis);

// Create Fastify app
const app = Fastify({
  logger: logger as any,
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'requestId',
  disableRequestLogging: false,
  bodyLimit: 10485760, // 10MB
});

// Register plugins
await app.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(',') || true,
  credentials: true,
});

await app.register(helmet, {
  contentSecurityPolicy: process.env.NODE_ENV === 'production',
});

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  redis,
});

// Health check
app.get('/health', async () => {
  const [dbHealth, redisHealth] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redis.ping(),
  ]);

  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealth.status === 'fulfilled' ? 'healthy' : 'unhealthy',
      redis: redisHealth.status === 'fulfilled' ? 'healthy' : 'unhealthy',
    },
  };
});

// Feedback Collection Endpoints
app.post('/feedback/user', {
  schema: {
    body: UserFeedbackSchema,
  },
}, async (request, reply) => {
  try {
    const feedback = request.body as any;
    const response = await feedbackCollector.collectUserFeedback(feedback);
    return response;
  } catch (error) {
    logger.error('Failed to collect user feedback', { error });
    reply.code(500).send({ error: 'Failed to process feedback' });
  }
});

app.post('/feedback/implicit', {
  schema: {
    body: ImplicitFeedbackSchema,
  },
}, async (request, reply) => {
  try {
    const feedback = request.body as any;
    await feedbackCollector.collectImplicitFeedback(feedback);
    return { status: 'accepted' };
  } catch (error) {
    logger.error('Failed to collect implicit feedback', { error });
    reply.code(500).send({ error: 'Failed to process feedback' });
  }
});

app.get('/feedback/metrics', async (request, reply) => {
  try {
    const { modelId } = request.query as any;
    const metrics = await feedbackCollector.getMetrics(modelId);
    return metrics;
  } catch (error) {
    logger.error('Failed to get feedback metrics', { error });
    reply.code(500).send({ error: 'Failed to retrieve metrics' });
  }
});

// Training Pipeline Endpoints
app.post('/training/start', {
  schema: {
    body: TrainingConfigSchema,
  },
}, async (request, reply) => {
  try {
    const config = request.body as any;
    const response = await trainingOrchestrator.startTraining(config);
    return response;
  } catch (error) {
    logger.error('Failed to start training', { error });
    reply.code(500).send({ error: 'Failed to start training' });
  }
});

app.get('/training/status/:runId', async (request, reply) => {
  try {
    const { runId } = request.params as any;
    const status = await trainingOrchestrator.getTrainingStatus(runId);
    return status;
  } catch (error) {
    logger.error('Failed to get training status', { error });
    reply.code(500).send({ error: 'Failed to retrieve status' });
  }
});

app.post('/training/pause/:runId', async (request, reply) => {
  try {
    const { runId } = request.params as any;
    await trainingOrchestrator.pauseTraining(runId);
    return { status: 'paused' };
  } catch (error) {
    logger.error('Failed to pause training', { error });
    reply.code(500).send({ error: 'Failed to pause training' });
  }
});

app.post('/training/resume/:runId', async (request, reply) => {
  try {
    const { runId } = request.params as any;
    await trainingOrchestrator.resumeTraining(runId);
    return { status: 'resumed' };
  } catch (error) {
    logger.error('Failed to resume training', { error });
    reply.code(500).send({ error: 'Failed to resume training' });
  }
});

app.post('/training/cancel/:runId', async (request, reply) => {
  try {
    const { runId } = request.params as any;
    await trainingOrchestrator.cancelTraining(runId);
    return { status: 'cancelled' };
  } catch (error) {
    logger.error('Failed to cancel training', { error });
    reply.code(500).send({ error: 'Failed to cancel training' });
  }
});

// Evaluation Endpoints
app.post('/evaluation/run', async (request, reply) => {
  try {
    const { runId, modelPath, evaluationType } = request.body as any;
    const response = await modelEvaluator.evaluateModel(
      runId,
      modelPath,
      evaluationType
    );
    return response;
  } catch (error) {
    logger.error('Failed to run evaluation', { error });
    reply.code(500).send({ error: 'Failed to run evaluation' });
  }
});

// Dataset Management
app.post('/dataset/create', async (request, reply) => {
  try {
    const dataset = await prisma.trainingDataset.create({
      data: request.body as any,
    });
    return dataset;
  } catch (error) {
    logger.error('Failed to create dataset', { error });
    reply.code(500).send({ error: 'Failed to create dataset' });
  }
});

app.get('/dataset/:id', async (request, reply) => {
  try {
    const { id } = request.params as any;
    const dataset = await prisma.trainingDataset.findUnique({
      where: { id },
      include: {
        validations: {
          orderBy: { timestamp: 'desc' },
          take: 5,
        },
      },
    });
    
    if (!dataset) {
      reply.code(404).send({ error: 'Dataset not found' });
      return;
    }
    
    return dataset;
  } catch (error) {
    logger.error('Failed to get dataset', { error });
    reply.code(500).send({ error: 'Failed to retrieve dataset' });
  }
});

// Model Registry
app.get('/models', async (request, reply) => {
  try {
    const models = await prisma.trainingRun.findMany({
      where: { status: 'COMPLETED' },
      select: {
        id: true,
        modelType: true,
        metrics: true,
        createdAt: true,
        evaluations: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
        deployments: {
          where: { status: 'DEPLOYED' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    
    return models;
  } catch (error) {
    logger.error('Failed to get models', { error });
    reply.code(500).send({ error: 'Failed to retrieve models' });
  }
});

// Drift Monitoring
app.post('/drift/monitor', {
  schema: {
    body: DriftDetectionConfigSchema,
  },
}, async (request, reply) => {
  try {
    const config = request.body as any;
    // Start continuous drift monitoring
    // Implementation would integrate with DriftDetector
    return { status: 'monitoring started', config };
  } catch (error) {
    logger.error('Failed to start drift monitoring', { error });
    reply.code(500).send({ error: 'Failed to start monitoring' });
  }
});

// Active Learning
app.post('/active-learning/select', {
  schema: {
    body: ActiveLearningConfigSchema,
  },
}, async (request, reply) => {
  try {
    const config = request.body as any;
    
    // Select samples for active learning
    const samples = await prisma.activeLearningSample.findMany({
      where: {
        selected: false,
        labeled: false,
      },
      orderBy: [
        { priority: 'desc' },
        { uncertainty: 'desc' },
      ],
      take: config.batchSize,
    });
    
    // Mark as selected
    await prisma.activeLearningSample.updateMany({
      where: {
        id: { in: samples.map(s => s.id) },
      },
      data: { selected: true },
    });
    
    return { samples, count: samples.length };
  } catch (error) {
    logger.error('Failed to select active learning samples', { error });
    reply.code(500).send({ error: 'Failed to select samples' });
  }
});

app.post('/active-learning/label', async (request, reply) => {
  try {
    const { sampleId, label, labeledBy } = request.body as any;
    
    const sample = await prisma.activeLearningSample.update({
      where: { id: sampleId },
      data: {
        labeled: true,
        label,
        labeledBy,
        labeledAt: new Date(),
      },
    });
    
    return sample;
  } catch (error) {
    logger.error('Failed to label sample', { error });
    reply.code(500).send({ error: 'Failed to label sample' });
  }
});

// Analytics Dashboard
app.get('/analytics/learning-curve/:modelId', async (request, reply) => {
  try {
    const { modelId } = request.params as any;
    
    const metrics = await prisma.learningMetric.findMany({
      where: { modelId },
      orderBy: { timestamp: 'asc' },
    });
    
    return {
      modelId,
      metrics,
      improvement: metrics.length > 1 
        ? ((metrics[metrics.length - 1].value - metrics[0].value) / metrics[0].value) * 100
        : 0,
    };
  } catch (error) {
    logger.error('Failed to get learning curve', { error });
    reply.code(500).send({ error: 'Failed to retrieve learning curve' });
  }
});

app.get('/analytics/feature-importance/:modelId', async (request, reply) => {
  try {
    const { modelId } = request.params as any;
    
    const importance = await prisma.featureImportance.findMany({
      where: { modelId },
      orderBy: { importance: 'desc' },
      take: 20,
    });
    
    return importance;
  } catch (error) {
    logger.error('Failed to get feature importance', { error });
    reply.code(500).send({ error: 'Failed to retrieve feature importance' });
  }
});

app.get('/analytics/roi/:modelId', async (request, reply) => {
  try {
    const { modelId } = request.params as any;
    
    const roi = await prisma.retrainingROI.findFirst({
      where: { modelId },
      orderBy: { calculatedAt: 'desc' },
    });
    
    return roi || { message: 'No ROI data available' };
  } catch (error) {
    logger.error('Failed to get ROI', { error });
    reply.code(500).send({ error: 'Failed to retrieve ROI' });
  }
});

// Event listeners for component integration
feedbackCollector.on('retrain:trigger', async (data) => {
  logger.info('Retraining triggered by feedback', data);
  // Trigger automatic retraining
  try {
    await trainingOrchestrator.startTraining({
      modelType: data.modelId,
      datasetId: 'latest', // Would need to determine appropriate dataset
      hyperparameters: {
        learningRate: 0.001,
        batchSize: 32,
        epochs: 5,
      },
    });
  } catch (error) {
    logger.error('Failed to trigger automatic retraining', { error });
  }
});

feedbackCollector.on('alert:low_confidence', async (data) => {
  logger.warn('Low model confidence detected', data);
  // Could trigger evaluation or retraining
});

feedbackCollector.on('pattern:detected', async (data) => {
  logger.info('Error pattern detected', data);
  // Store pattern for analysis
  await redis.sadd(`patterns:${data.modelId}`, JSON.stringify(data));
});

trainingOrchestrator.on('training:completed', async (data) => {
  logger.info('Training completed', data);
  // Trigger automatic evaluation
  try {
    await modelEvaluator.evaluateModel(
      data.runId,
      data.modelPath,
      'comprehensive'
    );
  } catch (error) {
    logger.error('Failed to trigger automatic evaluation', { error });
  }
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down learning pipeline...');
  
  await feedbackCollector.shutdown();
  await trainingOrchestrator.shutdown();
  await redis.quit();
  await prisma.$disconnect();
  await app.close();
  
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3010');
    const host = process.env.HOST || '0.0.0.0';
    
    await app.listen({ port, host });
    
    logger.info(`Learning Pipeline service started on ${host}:${port}`);
    logger.info('Components initialized:', {
      feedback: 'active',
      training: 'active',
      evaluation: 'active',
      monitoring: 'active',
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
};

start();