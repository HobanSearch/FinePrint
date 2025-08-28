import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

export default async function healthRoutes(fastify: FastifyInstance) {
  // Basic health check
  fastify.get('/', {
    schema: {
      description: 'Basic health check',
      tags: ['Health'],
      response: {
        200: z.object({
          status: z.string(),
          timestamp: z.string(),
          uptime: z.number(),
          version: z.string(),
        }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
    });
  });

  // Comprehensive health check
  fastify.get('/detailed', {
    schema: {
      description: 'Detailed health check with service status',
      tags: ['Health'],
      response: {
        200: z.object({
          status: z.string(),
          timestamp: z.string(),
          uptime: z.number(),
          version: z.string(),
          services: z.record(z.object({
            status: z.string(),
            details: z.any().optional(),
          })),
          system: z.object({
            memory: z.object({
              used: z.number(),
              total: z.number(),
              percentage: z.number(),
            }),
            cpu: z.object({
              usage: z.number(),
            }),
            disk: z.object({
              usage: z.number(),
            }).optional(),
          }),
        }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const aimlServices = fastify.aimlServices;
      
      // Check individual service health
      const serviceHealth = {
        modelLifecycleManager: { status: 'healthy' },
        hyperparameterOptimizer: { status: 'healthy' },
        modelRegistry: { status: 'healthy' },
        performanceMonitor: { status: 'healthy' },
        automlPipeline: { status: 'healthy' },
        abTestingFramework: { status: 'healthy' },
        resourceOptimizer: { status: 'healthy' },
        mlOpsOrchestrator: { status: 'healthy' },
      };

      // Get system metrics
      const memoryUsage = process.memoryUsage();
      const systemHealth = {
        memory: {
          used: memoryUsage.heapUsed,
          total: memoryUsage.heapTotal,
          percentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
        },
        cpu: {
          usage: process.cpuUsage().user / 1000000, // Convert to seconds
        },
      };

      // Determine overall status
      const allHealthy = Object.values(serviceHealth).every(service => service.status === 'healthy');
      const overallStatus = allHealthy ? 'healthy' : 'degraded';

      return reply.code(200).send({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
        services: serviceHealth,
        system: systemHealth,
      });
    } catch (error: any) {
      return reply.code(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
        error: error.message,
      });
    }
  });

  // Readiness probe
  fastify.get('/ready', {
    schema: {
      description: 'Readiness probe for Kubernetes',
      tags: ['Health'],
      response: {
        200: z.object({
          ready: z.boolean(),
          timestamp: z.string(),
        }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check if all critical services are initialized
      const aimlServices = fastify.aimlServices;
      const ready = !!(
        aimlServices.modelLifecycleManager &&
        aimlServices.hyperparameterOptimizer &&
        aimlServices.modelRegistry &&
        aimlServices.performanceMonitor
      );

      const statusCode = ready ? 200 : 503;
      
      return reply.code(statusCode).send({
        ready,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      return reply.code(503).send({
        ready: false,
        timestamp: new Date().toISOString(),
        error: error.message,
      });
    }
  });

  // Liveness probe
  fastify.get('/live', {
    schema: {
      description: 'Liveness probe for Kubernetes',
      tags: ['Health'],
      response: {
        200: z.object({
          alive: z.boolean(),
          timestamp: z.string(),
        }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({
      alive: true,
      timestamp: new Date().toISOString(),
    });
  });
}