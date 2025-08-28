import { FastifyInstance } from 'fastify';
import modelLifecycleRoutes from './model-lifecycle';
import hyperparameterOptimizationRoutes from './hyperparameter-optimization';
import modelRegistryRoutes from './model-registry';
import performanceMonitoringRoutes from './performance-monitoring';
import automlRoutes from './automl';
import abTestingRoutes from './ab-testing';
import resourceOptimizationRoutes from './resource-optimization';
import mlopsRoutes from './mlops';
import integrationRoutes from './integrations';
import trainingDatasetsRoutes from './training-datasets';
import automatedTrainingRoutes from './automated-training';
import modelEvaluationRoutes from './model-evaluation';
import healthRoutes from './health';
import metricsRoutes from './metrics';
import websocketRoutes from './websocket';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Health and system routes
  await fastify.register(healthRoutes, { prefix: '/health' });
  await fastify.register(metricsRoutes, { prefix: '/metrics' });
  await fastify.register(websocketRoutes, { prefix: '/ws' });

  // Core AI/ML services
  await fastify.register(modelLifecycleRoutes, { prefix: '/api/v1/training' });
  await fastify.register(trainingDatasetsRoutes, { prefix: '/api/v1/datasets' });
  await fastify.register(automatedTrainingRoutes, { prefix: '/api/v1/pipelines' });
  await fastify.register(modelEvaluationRoutes, { prefix: '/api/v1/evaluation' });
  await fastify.register(hyperparameterOptimizationRoutes, { prefix: '/api/v1/optimization' });
  await fastify.register(modelRegistryRoutes, { prefix: '/api/v1/registry' });
  await fastify.register(performanceMonitoringRoutes, { prefix: '/api/v1/monitoring' });
  await fastify.register(automlRoutes, { prefix: '/api/v1/automl' });
  await fastify.register(abTestingRoutes, { prefix: '/api/v1/experiments' });
  await fastify.register(resourceOptimizationRoutes, { prefix: '/api/v1/resources' });
  await fastify.register(mlopsRoutes, { prefix: '/api/v1/mlops' });

  // Integration routes
  await fastify.register(integrationRoutes, { prefix: '/api/v1/integrations' });

  // Root route
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