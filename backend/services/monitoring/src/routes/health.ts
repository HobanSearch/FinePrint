import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { tosMonitoringService } from '../services/tosMonitoring';
import { changeDetectionEngine } from '../services/changeDetection';
import { documentCrawlerService } from '../services/documentCrawler';
import { webhookService } from '../services/webhookService';
import { alertingService } from '../services/alertingService';
import { mongoChangeStreamService } from '../services/mongoChangeStream';
import { circuitBreakerService } from '../services/circuitBreaker';
import { rateLimitingService } from '../services/rateLimiting';
import { schedulerService } from '../services/scheduler';

export async function healthRoutes(server: FastifyInstance): Promise<void> {
  // Basic health check
  server.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
    };
  });

  // Detailed health check
  server.get('/detailed', async (request: FastifyRequest, reply: FastifyReply) => {
    const services = [
      { name: 'tosMonitoring', service: tosMonitoringService },
      { name: 'changeDetection', service: changeDetectionEngine },
      { name: 'documentCrawler', service: documentCrawlerService },
      { name: 'webhook', service: webhookService },
      { name: 'alerting', service: alertingService },
      { name: 'mongoChangeStream', service: mongoChangeStreamService },
      { name: 'scheduler', service: schedulerService },
    ];

    const healthChecks = await Promise.allSettled(
      services.map(async ({ name, service }) => {
        try {
          await service.healthCheck();
          return { name, status: 'healthy' };
        } catch (error) {
          return {
            name,
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    const results = healthChecks.map((result, index) => ({
      service: services[index].name,
      ...(result.status === 'fulfilled' ? result.value : { status: 'error', error: result.reason }),
    }));

    const overallHealthy = results.every(result => result.status === 'healthy');

    if (!overallHealthy) {
      reply.code(503);
    }

    return {
      status: overallHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: results,
      circuitBreakers: circuitBreakerService.getHealthStatus(),
      rateLimiters: rateLimitingService.getHealthStatus(),
    };
  });

  // Readiness check
  server.get('/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Quick checks for readiness
      const criticalServices = [tosMonitoringService, changeDetectionEngine];
      
      await Promise.all(
        criticalServices.map(service => service.healthCheck())
      );

      return {
        status: 'ready',
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      reply.code(503);
      return {
        status: 'not ready',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Liveness check
  server.get('/live', async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  });
}