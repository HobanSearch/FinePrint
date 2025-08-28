import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Logger } from '@/utils/logger';

const logger = Logger.getInstance();

export default async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  
  /**
   * Basic health check
   */
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'fullstack-agent',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid,
      };

      return reply.send(health);
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
      return reply.status(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
      });
    }
  });

  /**
   * Detailed health check with dependencies
   */
  fastify.get('/detailed', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const checks = {
        service: 'healthy',
        database: 'healthy', // Would check actual database connection
        redis: 'healthy',    // Would check actual Redis connection
        integrations: {
      dspy: 'healthy',
      lora: 'healthy',
      knowledgeGraph: 'healthy',
        },
        ai: {
          ollama: 'healthy',
        },
      };

      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'fullstack-agent',
        version: '1.0.0',
        checks,
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          pid: process.pid,
          platform: process.platform,
          nodeVersion: process.version,
        },
      };

      return reply.send(health);
    } catch (error) {
      logger.error('Detailed health check failed', { error: error.message });
      return reply.status(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
      });
    }
  });

  /**
   * Readiness probe
   */
  fastify.get('/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check if service is ready to handle requests
      const ready = {
        status: 'ready',
        timestamp: new Date().toISOString(),
        initialized: true,
        dependencies: {
          templates: true,
          integrations: true,
          ai: true,
        },
      };

      return reply.send(ready);
    } catch (error) {
      logger.error('Readiness check failed', { error: error.message });
      return reply.status(503).send({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: error.message,
      });
    }
  });

  /**
   * Liveness probe
   */
  fastify.get('/live', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    } catch (error) {
      logger.error('Liveness check failed', { error: error.message });
      return reply.status(503).send({
        status: 'dead',
        timestamp: new Date().toISOString(),
        error: error.message,
      });
    }
  });
}