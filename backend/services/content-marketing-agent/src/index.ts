import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';

import routes from './routes';
import { config, serverConfig } from './config';
import { logger } from './utils/logger';
import { ContentMarketingError } from './types';

const fastify: FastifyInstance = Fastify({
  logger: false, // We use our custom logger
  trustProxy: true
});

async function buildApp(): Promise<FastifyInstance> {
  try {
    // Register CORS
    await fastify.register(cors, {
      origin: serverConfig.cors.origin,
      credentials: serverConfig.cors.credentials
    });

    // Register security middleware
    await fastify.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"]
        }
      }
    });

    // Register rate limiting
    await fastify.register(rateLimit, {
      max: serverConfig.rateLimit.max,
      timeWindow: serverConfig.rateLimit.timeWindow,
      errorResponseBuilder: (request, context) => ({
        error: 'Rate limit exceeded',
        message: `Too many requests. Try again in ${Math.round(context.ttl / 1000)} seconds.`,
        statusCode: 429
      })
    });

    // Register Swagger documentation
    await fastify.register(swagger, {
      swagger: {
        info: {
          title: 'Fine Print AI - Content Marketing Agent API',
          description: 'Autonomous content marketing system for Fine Print AI',
          version: '1.0.0'
        },
        host: `localhost:${serverConfig.port}`,
        schemes: ['http', 'https'],
        consumes: ['application/json'],
        produces: ['application/json'],
        tags: [
          { name: 'Health', description: 'Health check endpoints' },
          { name: 'Content', description: 'Content creation and management' },
          { name: 'Campaigns', description: 'Marketing campaign management' },
          { name: 'Analytics', description: 'Performance analytics and insights' },
          { name: 'Leads', description: 'Lead generation and management' },
          { name: 'SEO', description: 'SEO optimization and keyword research' },
          { name: 'Distribution', description: 'Content distribution and publishing' }
        ]
      }
    });

    await fastify.register(swaggerUI, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false
      }
    });

    // Global error handler
    fastify.setErrorHandler((error, request, reply) => {
      logger.error('Request error', {
        error: error.message,
        stack: error.stack,
        url: request.url,
        method: request.method,
        params: request.params,
        query: request.query
      });

      if (error instanceof ContentMarketingError) {
        reply.status(error.statusCode).send({
          success: false,
          error: error.message,
          code: error.code
        });
      } else if (error.validation) {
        reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: error.validation
        });
      } else {
        reply.status(500).send({
          success: false,
          error: 'Internal server error'
        });
      }
    });

    // Register routes
    await fastify.register(routes, { prefix: '/api/v1' });

    // 404 handler
    fastify.setNotFoundHandler((request, reply) => {
      reply.status(404).send({
        success: false,
        error: 'Endpoint not found',
        path: request.url
      });
    });

    return fastify;

  } catch (error) {
    logger.error('Failed to build app', { error });
    throw error;
  }
}

async function start(): Promise<void> {
  try {
    const app = await buildApp();
    
    const address = await app.listen({
      port: serverConfig.port,
      host: serverConfig.host
    });

    logger.info('Content Marketing Agent started successfully', {
      address,
      environment: serverConfig.environment,
      features: [
        'AI Content Creation',
        'Multi-Channel Distribution',
        'SEO Optimization',
        'Campaign Management',
        'Lead Generation',
        'Performance Analytics'
      ]
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        await app.close();
        logger.info('Server closed successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Start the server if this file is run directly
if (import.meta.url.startsWith('file://') && process.argv[1] === new URL(import.meta.url).pathname) {
  start();
}

export { buildApp, start };
export default fastify;