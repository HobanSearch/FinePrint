import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

export default async function metricsRoutes(fastify: FastifyInstance) {
  // Prometheus metrics endpoint
  fastify.get('/', {
    schema: {
      description: 'Get Prometheus metrics',
      tags: ['Metrics'],
      response: {
        200: z.string(),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const aimlServices = fastify.aimlServices;
      
      // Get metrics from all services
      const lifecycleMetrics = aimlServices.modelLifecycleManager.getServiceMetrics();
      const optimizationMetrics = aimlServices.hyperparameterOptimizer.getServiceMetrics();
      const registryMetrics = aimlServices.modelRegistry.getServiceMetrics();
      const monitoringMetrics = aimlServices.performanceMonitor.getServiceMetrics();
      const automlMetrics = aimlServices.automlPipeline.getServiceMetrics();
      const abTestingMetrics = aimlServices.abTestingFramework.getServiceMetrics();
      const orchestratorMetrics = aimlServices.mlOpsOrchestrator.getServiceMetrics();

      // Format as Prometheus metrics
      const prometheusMetrics = `
# HELP aiml_training_jobs_total Total number of training jobs
# TYPE aiml_training_jobs_total counter
aiml_training_jobs_total ${lifecycleMetrics.total_jobs}

# HELP aiml_training_jobs_active Number of active training jobs
# TYPE aiml_training_jobs_active gauge
aiml_training_jobs_active ${lifecycleMetrics.active_jobs}

# HELP aiml_optimization_studies_total Total number of optimization studies
# TYPE aiml_optimization_studies_total counter
aiml_optimization_studies_total ${optimizationMetrics.total_studies}

# HELP aiml_models_registered_total Total number of registered models
# TYPE aiml_models_registered_total counter
aiml_models_registered_total ${registryMetrics.total_models}

# HELP aiml_models_deployed Number of deployed models
# TYPE aiml_models_deployed gauge
aiml_models_deployed ${registryMetrics.deployed_models}

# HELP aiml_active_alerts Number of active performance alerts
# TYPE aiml_active_alerts gauge
aiml_active_alerts ${monitoringMetrics.active_alerts}

# HELP aiml_service_uptime_seconds Service uptime in seconds
# TYPE aiml_service_uptime_seconds counter
aiml_service_uptime_seconds ${process.uptime()}

# HELP aiml_memory_usage_bytes Memory usage in bytes
# TYPE aiml_memory_usage_bytes gauge
aiml_memory_usage_bytes ${process.memoryUsage().heapUsed}
      `.trim();

      return reply
        .type('text/plain; version=0.0.4; charset=utf-8')
        .code(200)
        .send(prometheusMetrics);
    } catch (error: any) {
      return reply.code(500).send({
        error: error.message,
      });
    }
  });

  // Service-specific metrics
  fastify.get('/services/:service', {
    schema: {
      description: 'Get metrics for a specific service',
      tags: ['Metrics'],
      params: z.object({
        service: z.enum([
          'lifecycle',
          'optimization',
          'registry',
          'monitoring',
          'automl',
          'abtesting',
          'orchestrator'
        ]),
      }),
    },
  }, async (request: FastifyRequest<{ Params: { service: string } }>, reply: FastifyReply) => {
    try {
      const aimlServices = fastify.aimlServices;
      let metrics;

      switch (request.params.service) {
        case 'lifecycle':
          metrics = aimlServices.modelLifecycleManager.getServiceMetrics();
          break;
        case 'optimization':
          metrics = aimlServices.hyperparameterOptimizer.getServiceMetrics();
          break;
        case 'registry':
          metrics = aimlServices.modelRegistry.getServiceMetrics();
          break;
        case 'monitoring':
          metrics = aimlServices.performanceMonitor.getServiceMetrics();
          break;
        case 'automl':
          metrics = aimlServices.automlPipeline.getServiceMetrics();
          break;
        case 'abtesting':
          metrics = aimlServices.abTestingFramework.getServiceMetrics();
          break;
        case 'orchestrator':
          metrics = aimlServices.mlOpsOrchestrator.getServiceMetrics();
          break;
        default:
          return reply.code(404).send({
            error: 'Service not found',
          });
      }

      return reply.code(200).send({
        success: true,
        service: request.params.service,
        metrics,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      return reply.code(400).send({
        error: error.message,
      });
    }
  });
}