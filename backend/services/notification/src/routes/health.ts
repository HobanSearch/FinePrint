import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createServiceLogger } from '@fineprintai/shared-logger';

import { notificationService } from '../services/notificationService';
import { emailService } from '../services/emailService';
import { webhookService } from '../services/webhookService';
import { preferenceService } from '../services/preferenceService';
import { templateService } from '../services/templateService';
import { deliveryTracker } from '../services/deliveryTracker';
import { abTestService } from '../services/abTestService';

const logger = createServiceLogger('health-routes');

export default async function healthRoutes(fastify: FastifyInstance) {
  // Basic health check
  fastify.get('/', {
    schema: {
      description: 'Basic health check',
      tags: ['health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
            version: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
    });
  });

  // Detailed health check
  fastify.get('/detailed', {
    schema: {
      description: 'Detailed health check with service status',
      tags: ['health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            services: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                  responseTime: { type: 'number' },
                  error: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const services = {
      notificationService: await checkService('notification', () => 
        notificationService.getNotificationStats()
      ),
      emailService: await checkService('email', () => 
        emailService.getEmailTemplates({ limit: 1 })
      ),
      webhookService: await checkService('webhook', () => 
        webhookService.getUserWebhookEndpoints('health-check')
      ),
      preferenceService: await checkService('preference', () => 
        preferenceService.getUserPreferences('health-check')
      ),
      templateService: await checkService('template', () => 
        templateService.listTemplates({ limit: 1 })
      ),
      deliveryTracker: await checkService('delivery', () => 
        deliveryTracker.getDeliveryStats()
      ),
      abTestService: await checkService('abtest', () => 
        abTestService.listABTests({ limit: 1 })
      ),
    };

    const allHealthy = Object.values(services).every(service => service.status === 'healthy');

    reply.send({
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services,
    });
  });

  // Readiness check (for Kubernetes)
  fastify.get('/ready', {
    schema: {
      description: 'Readiness check for Kubernetes',
      tags: ['health'],
      response: {
        200: {
          type: 'object',
          properties: {
            ready: { type: 'boolean' },
            timestamp: { type: 'string' },
          },
        },
        503: {
          type: 'object',
          properties: {
            ready: { type: 'boolean' },
            timestamp: { type: 'string' },
            reason: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check critical services
      await Promise.all([
        notificationService.getNotificationStats('health-check'),
        emailService.getEmailTemplates({ limit: 1 }),
        preferenceService.getUserPreferences('health-check'),
      ]);

      reply.send({
        ready: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Readiness check failed', { error: error.message });
      reply.status(503).send({
        ready: false,
        timestamp: new Date().toISOString(),
        reason: error.message,
      });
    }
  });

  // Liveness check (for Kubernetes)
  fastify.get('/live', {
    schema: {
      description: 'Liveness check for Kubernetes',
      tags: ['health'],
      response: {
        200: {
          type: 'object',
          properties: {
            alive: { type: 'boolean' },
            timestamp: { type: 'string' },
          },
        },
        503: {
          type: 'object',
          properties: {
            alive: { type: 'boolean' },
            timestamp: { type: 'string' },
            reason: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Basic liveness check - just verify process is responding
      const memUsage = process.memoryUsage();
      const maxMemory = 1024 * 1024 * 1024; // 1GB limit

      if (memUsage.heapUsed > maxMemory) {
        throw new Error('Memory usage too high');
      }

      reply.send({
        alive: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Liveness check failed', { error: error.message });
      reply.status(503).send({
        alive: false,
        timestamp: new Date().toISOString(),
        reason: error.message,
      });
    }
  });

  // Metrics endpoint (Prometheus format)
  fastify.get('/metrics', {
    schema: {
      description: 'Metrics in Prometheus format',
      tags: ['health'],
      response: {
        200: {
          type: 'string',
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await notificationService.getNotificationStats();
      const deliveryStats = await deliveryTracker.getDeliveryStats();
      const memUsage = process.memoryUsage();

      const metrics = [
        `# HELP notification_total Total number of notifications`,
        `# TYPE notification_total counter`,
        `notification_total{status="pending"} ${stats.pending || 0}`,
        `notification_total{status="sent"} ${stats.sent || 0}`,
        `notification_total{status="failed"} ${stats.failed || 0}`,
        
        `# HELP delivery_rate Notification delivery rate`,
        `# TYPE delivery_rate gauge`,
        `delivery_rate ${deliveryStats.deliveryRate}`,
        
        `# HELP open_rate Notification open rate`,
        `# TYPE open_rate gauge`,
        `open_rate ${deliveryStats.openRate}`,
        
        `# HELP click_rate Notification click rate`,
        `# TYPE click_rate gauge`,
        `click_rate ${deliveryStats.clickRate}`,
        
        `# HELP process_memory_bytes Process memory usage in bytes`,
        `# TYPE process_memory_bytes gauge`,
        `process_memory_bytes{type="rss"} ${memUsage.rss}`,
        `process_memory_bytes{type="heapTotal"} ${memUsage.heapTotal}`,
        `process_memory_bytes{type="heapUsed"} ${memUsage.heapUsed}`,
        
        `# HELP process_uptime_seconds Process uptime in seconds`,
        `# TYPE process_uptime_seconds counter`,
        `process_uptime_seconds ${process.uptime()}`,
      ].join('\n');

      reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      reply.send(metrics + '\n');
    } catch (error) {
      logger.error('Failed to generate metrics', { error: error.message });
      reply.status(500).send('# Error generating metrics\n');
    }
  });
}

// Helper function to check service health
async function checkService(
  serviceName: string, 
  healthCheck: () => Promise<any>
): Promise<{
  status: 'healthy' | 'unhealthy';
  responseTime: number;
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    await healthCheck();
    return {
      status: 'healthy',
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    logger.warn(`Health check failed for ${serviceName}`, { error: error.message });
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error.message,
    };
  }
}