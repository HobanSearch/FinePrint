import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../utils/logger';

export default async function healthRoutes(fastify: FastifyInstance) {
  // Health check endpoint
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      status: 'healthy',
      service: 'content-marketing-agent',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    };
  });

  // Detailed health check
  fastify.get('/detailed', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const healthChecks = {
        service: 'healthy',
        database: 'healthy', // Would check database connection
        redis: 'healthy',    // Would check Redis connection
        openai: 'healthy',   // Would check OpenAI API
        email: 'healthy',    // Would check email service
        storage: 'healthy'   // Would check file storage
      };

      const overallHealth = Object.values(healthChecks).every(status => status === 'healthy')
        ? 'healthy'
        : 'degraded';

      return {
        status: overallHealth,
        service: 'content-marketing-agent',
        version: '1.0.0',
        checks: healthChecks,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Health check failed', { error });
      reply.status(500);
      return {
        status: 'unhealthy',
        service: 'content-marketing-agent',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  });

  // Readiness check
  fastify.get('/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check if service is ready to handle requests
      const ready = true; // Would perform actual readiness checks
      
      if (ready) {
        return {
          status: 'ready',
          service: 'content-marketing-agent',
          timestamp: new Date().toISOString()
        };
      } else {
        reply.status(503);
        return {
          status: 'not_ready',
          service: 'content-marketing-agent',
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      logger.error('Readiness check failed', { error });
      reply.status(503);
      return {
        status: 'not_ready',
        service: 'content-marketing-agent',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  });
}