/**
 * Improvement Orchestrator Service
 * Manages the full lifecycle of AI model improvements through Temporal workflows
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { Client, Connection } from '@temporalio/client';
import { ModelImprovementWorkflow } from './workflows/improvement-workflow';
import { RetrainingWorkflow } from './workflows/retraining-workflow';
import { DeploymentWorkflow } from './workflows/deployment-workflow';
import {
  ModelType,
  ImprovementPriority,
  WorkflowStatus,
  DeploymentStrategy
} from './types';
import pino from 'pino';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

// Initialize logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'UTC:yyyy-mm-dd HH:MM:ss.l'
    }
  }
});

// Initialize Redis client for caching
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

// Initialize Fastify server
const server = Fastify({
  logger,
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'requestId',
  genReqId: () => uuidv4()
});

// Temporal client
let temporalClient: Client;

// Register plugins
async function registerPlugins() {
  await server.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') || true,
    credentials: true
  });

  await server.register(helmet, {
    contentSecurityPolicy: false
  });

  await server.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  });

  await server.register(websocket);
}

// Initialize Temporal client
async function initializeTemporalClient() {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233'
  });

  temporalClient = new Client({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || 'default'
  });

  logger.info('Connected to Temporal server');
}

// API Routes

/**
 * Health check endpoint
 */
server.get('/health', async (request, reply) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    temporal: {
      connected: !!temporalClient
    },
    redis: {
      connected: redis.status === 'ready'
    }
  };

  return reply.code(200).send(health);
});

/**
 * Trigger model improvement workflow
 */
server.post<{
  Body: {
    modelType: ModelType;
    failureId: string;
    priority: ImprovementPriority;
    autoApprove?: boolean;
    maxRetries?: number;
    notificationChannels?: string[];
  }
}>('/api/workflows/improve-model', async (request, reply) => {
  try {
    const {
      modelType,
      failureId,
      priority,
      autoApprove = false,
      maxRetries = 3,
      notificationChannels = ['email']
    } = request.body;

    // Validate input
    if (!modelType || !failureId || !priority) {
      return reply.code(400).send({
        error: 'Missing required parameters: modelType, failureId, priority'
      });
    }

    // Start workflow
    const workflowId = `improvement_${modelType}_${Date.now()}`;
    const handle = await temporalClient.workflow.start(ModelImprovementWorkflow, {
      taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'improvement-orchestrator',
      workflowId,
      args: [{
        modelType,
        failureId,
        priority,
        autoApprove,
        maxRetries,
        notificationChannels
      }]
    });

    // Cache workflow info
    await redis.setex(
      `workflow:${workflowId}`,
      86400, // 24 hours
      JSON.stringify({
        workflowId,
        modelType,
        failureId,
        priority,
        startTime: new Date().toISOString(),
        status: WorkflowStatus.RUNNING
      })
    );

    logger.info({ workflowId, modelType, failureId }, 'Started improvement workflow');

    return reply.code(201).send({
      workflowId,
      status: 'started',
      message: `Improvement workflow started for ${modelType} model`
    });

  } catch (error) {
    logger.error({ error }, 'Failed to start improvement workflow');
    return reply.code(500).send({
      error: 'Failed to start workflow',
      message: error.message
    });
  }
});

/**
 * Trigger retraining workflow
 */
server.post<{
  Body: {
    modelType: ModelType;
    baseModelId: string;
    improvements: any[];
    datasetEnhancements?: any[];
    hyperparameterSearch?: boolean;
    validationStrategy?: string;
  }
}>('/api/workflows/retrain-model', async (request, reply) => {
  try {
    const {
      modelType,
      baseModelId,
      improvements,
      datasetEnhancements = [],
      hyperparameterSearch = true,
      validationStrategy = 'holdout'
    } = request.body;

    const workflowId = `retraining_${modelType}_${Date.now()}`;
    const handle = await temporalClient.workflow.start(RetrainingWorkflow, {
      taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'improvement-orchestrator',
      workflowId,
      args: [{
        modelType,
        baseModelId,
        improvements,
        datasetEnhancements,
        hyperparameterSearch,
        validationStrategy,
        maxTrainingTime: 8 * 60 * 60 * 1000, // 8 hours
        earlyStoppingPatience: 5,
        checkpointFrequency: 10
      }]
    });

    logger.info({ workflowId, modelType, baseModelId }, 'Started retraining workflow');

    return reply.code(201).send({
      workflowId,
      status: 'started',
      message: `Retraining workflow started for ${modelType} model`
    });

  } catch (error) {
    logger.error({ error }, 'Failed to start retraining workflow');
    return reply.code(500).send({
      error: 'Failed to start workflow',
      message: error.message
    });
  }
});

/**
 * Trigger deployment workflow
 */
server.post<{
  Body: {
    modelId: string;
    modelType: ModelType;
    strategy: DeploymentStrategy;
    environment: string;
    autoPromote?: boolean;
    rollbackOnFailure?: boolean;
    notificationChannels?: string[];
  }
}>('/api/workflows/deploy-model', async (request, reply) => {
  try {
    const {
      modelId,
      modelType,
      strategy,
      environment,
      autoPromote = false,
      rollbackOnFailure = true,
      notificationChannels = ['email', 'slack']
    } = request.body;

    const workflowId = `deployment_${modelId}_${Date.now()}`;
    const handle = await temporalClient.workflow.start(DeploymentWorkflow, {
      taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'improvement-orchestrator',
      workflowId,
      args: [{
        modelId,
        modelType,
        strategy,
        environment,
        autoPromote,
        rollbackOnFailure,
        notificationChannels
      }]
    });

    logger.info({ workflowId, modelId, strategy }, 'Started deployment workflow');

    return reply.code(201).send({
      workflowId,
      status: 'started',
      message: `Deployment workflow started for model ${modelId}`
    });

  } catch (error) {
    logger.error({ error }, 'Failed to start deployment workflow');
    return reply.code(500).send({
      error: 'Failed to start workflow',
      message: error.message
    });
  }
});

/**
 * Get workflow status
 */
server.get<{
  Params: { workflowId: string }
}>('/api/workflows/:workflowId/status', async (request, reply) => {
  try {
    const { workflowId } = request.params;

    // Check cache first
    const cached = await redis.get(`workflow:${workflowId}`);
    if (cached) {
      return reply.send(JSON.parse(cached));
    }

    // Query Temporal
    const handle = temporalClient.workflow.getHandle(workflowId);
    const description = await handle.describe();

    const status = {
      workflowId,
      status: description.status.name,
      startTime: description.startTime,
      closeTime: description.closeTime,
      historyLength: description.historyLength,
      memo: description.memo
    };

    // Cache the result
    await redis.setex(
      `workflow:${workflowId}`,
      300, // 5 minutes
      JSON.stringify(status)
    );

    return reply.send(status);

  } catch (error) {
    logger.error({ error, workflowId: request.params.workflowId }, 'Failed to get workflow status');
    return reply.code(404).send({
      error: 'Workflow not found',
      message: error.message
    });
  }
});

/**
 * Cancel workflow
 */
server.post<{
  Params: { workflowId: string }
}>('/api/workflows/:workflowId/cancel', async (request, reply) => {
  try {
    const { workflowId } = request.params;

    const handle = temporalClient.workflow.getHandle(workflowId);
    await handle.cancel();

    logger.info({ workflowId }, 'Cancelled workflow');

    return reply.send({
      workflowId,
      status: 'cancelled',
      message: 'Workflow cancelled successfully'
    });

  } catch (error) {
    logger.error({ error, workflowId: request.params.workflowId }, 'Failed to cancel workflow');
    return reply.code(500).send({
      error: 'Failed to cancel workflow',
      message: error.message
    });
  }
});

/**
 * Approve workflow (for manual approval steps)
 */
server.post<{
  Params: { workflowId: string }
}>('/api/workflows/:workflowId/approve', async (request, reply) => {
  try {
    const { workflowId } = request.params;

    const handle = temporalClient.workflow.getHandle(workflowId);
    await handle.signal('approve');

    logger.info({ workflowId }, 'Approved workflow');

    return reply.send({
      workflowId,
      status: 'approved',
      message: 'Workflow approved successfully'
    });

  } catch (error) {
    logger.error({ error, workflowId: request.params.workflowId }, 'Failed to approve workflow');
    return reply.code(500).send({
      error: 'Failed to approve workflow',
      message: error.message
    });
  }
});

/**
 * Trigger rollback for a workflow
 */
server.post<{
  Params: { workflowId: string }
}>('/api/workflows/:workflowId/rollback', async (request, reply) => {
  try {
    const { workflowId } = request.params;

    const handle = temporalClient.workflow.getHandle(workflowId);
    await handle.signal('rollback');

    logger.info({ workflowId }, 'Triggered rollback for workflow');

    return reply.send({
      workflowId,
      status: 'rollback_triggered',
      message: 'Rollback triggered successfully'
    });

  } catch (error) {
    logger.error({ error, workflowId: request.params.workflowId }, 'Failed to trigger rollback');
    return reply.code(500).send({
      error: 'Failed to trigger rollback',
      message: error.message
    });
  }
});

/**
 * Get improvement history
 */
server.get<{
  Querystring: {
    modelType?: ModelType;
    limit?: number;
    offset?: number;
  }
}>('/api/improvements/history', async (request, reply) => {
  try {
    const { modelType, limit = 100, offset = 0 } = request.query;

    // Query workflows from Temporal
    const workflows = await temporalClient.workflow.list({
      query: modelType ? `WorkflowType = "ModelImprovementWorkflow" AND ModelType = "${modelType}"` : 'WorkflowType = "ModelImprovementWorkflow"',
      pageSize: limit
    });

    const history = [];
    for await (const workflow of workflows) {
      history.push({
        workflowId: workflow.workflowId,
        status: workflow.status.name,
        startTime: workflow.startTime,
        closeTime: workflow.closeTime,
        memo: workflow.memo
      });
    }

    return reply.send({
      total: history.length,
      limit,
      offset,
      items: history
    });

  } catch (error) {
    logger.error({ error }, 'Failed to get improvement history');
    return reply.code(500).send({
      error: 'Failed to get history',
      message: error.message
    });
  }
});

/**
 * Get improvement metrics
 */
server.get('/api/metrics/improvement-rate', async (request, reply) => {
  try {
    // Calculate improvement metrics from Redis cache
    const keys = await redis.keys('workflow:*');
    const workflows = await Promise.all(
      keys.map(async (key) => {
        const data = await redis.get(key);
        return data ? JSON.parse(data) : null;
      })
    );

    const completed = workflows.filter(w => w?.status === WorkflowStatus.COMPLETED).length;
    const failed = workflows.filter(w => w?.status === WorkflowStatus.FAILED).length;
    const running = workflows.filter(w => w?.status === WorkflowStatus.RUNNING).length;
    const total = workflows.length;

    const metrics = {
      improvementRate: total > 0 ? (completed / total) * 100 : 0,
      successRate: (completed + running) > 0 ? (completed / (completed + failed)) * 100 : 0,
      totalWorkflows: total,
      completedWorkflows: completed,
      failedWorkflows: failed,
      runningWorkflows: running
    };

    return reply.send(metrics);

  } catch (error) {
    logger.error({ error }, 'Failed to get improvement metrics');
    return reply.code(500).send({
      error: 'Failed to get metrics',
      message: error.message
    });
  }
});

/**
 * WebSocket endpoint for real-time workflow updates
 */
server.get('/ws', { websocket: true }, (connection, req) => {
  connection.socket.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'subscribe' && data.workflowId) {
        // Subscribe to workflow updates
        const interval = setInterval(async () => {
          try {
            const handle = temporalClient.workflow.getHandle(data.workflowId);
            const description = await handle.describe();
            
            connection.socket.send(JSON.stringify({
              type: 'update',
              workflowId: data.workflowId,
              status: description.status.name,
              timestamp: new Date().toISOString()
            }));

            // Stop sending updates if workflow is complete
            if (description.status.name !== 'RUNNING') {
              clearInterval(interval);
            }
          } catch (error) {
            logger.error({ error, workflowId: data.workflowId }, 'Failed to get workflow update');
            clearInterval(interval);
          }
        }, 5000); // Send updates every 5 seconds

        // Clean up on disconnect
        connection.socket.on('close', () => {
          clearInterval(interval);
        });
      }
    } catch (error) {
      logger.error({ error }, 'WebSocket message error');
    }
  });
});

// Start the server
async function start() {
  try {
    // Register plugins
    await registerPlugins();

    // Initialize Temporal client
    await initializeTemporalClient();

    // Start server
    const port = parseInt(process.env.PORT || '3010');
    const host = process.env.HOST || '0.0.0.0';
    
    await server.listen({ port, host });
    
    logger.info(`Improvement Orchestrator Service running on ${host}:${port}`);
    logger.info('Ready to orchestrate model improvements!');

  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  await server.close();
  await redis.quit();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  await server.close();
  await redis.quit();
  process.exit(0);
});

// Start the service
start();