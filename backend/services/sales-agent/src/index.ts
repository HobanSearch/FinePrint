import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { config } from './config';
import { logger } from './utils/logger';
import { registerRoutes } from './routes';
import { salesAgentPlugin } from './plugins';
import { initializeServices } from './services';

const server = Fastify({
  logger: logger,
  requestTimeout: 30000,
  bodyLimit: 10485760, // 10MB
});

async function start() {
  try {
    // Register security plugins
    await server.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    });

    await server.register(cors, {
      origin: config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    });

    await server.register(rateLimit, {
      max: 1000,
      timeWindow: '15 minutes',
      errorResponseBuilder: (req, context) => {
        return {
          code: 429,
          error: 'Too Many Requests',
          message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds`,
          date: Date.now(),
          expiresIn: Math.round(context.ttl / 1000),
        };
      },
    });

    // Register documentation
    await server.register(swagger, {
      swagger: {
        info: {
          title: 'Fine Print AI - Sales Agent API',
          description: 'Autonomous Sales Agent for CRM, Lead Management, and Revenue Forecasting',
          version: '1.0.0',
        },
        host: `localhost:${config.port}`,
        schemes: ['http', 'https'],
        consumes: ['application/json'],
        produces: ['application/json'],
        tags: [
          { name: 'leads', description: 'Lead management endpoints' },
          { name: 'opportunities', description: 'Sales opportunity endpoints' },
          { name: 'forecasting', description: 'Revenue forecasting endpoints' },
          { name: 'automation', description: 'Sales automation endpoints' },
          { name: 'analytics', description: 'Sales analytics endpoints' },
          { name: 'health', description: 'Health check endpoints' },
        ],
      },
    });

    await server.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'full',
        deepLinking: false,
      },
      staticCSP: true,
      transformStaticCSP: (header) => header,
    });

    // Register custom plugins
    await server.register(salesAgentPlugin);

    // Initialize services
    await initializeServices();

    // Register routes
    await registerRoutes(server);

    // Health check endpoint
    server.get('/health', async (request, reply) => {
      return {
        status: 'healthy',
        service: 'sales-agent',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0',
      };
    });

    // Start server
    const address = await server.listen({
      port: config.port,
      host: config.host,
    });

    logger.info(`Sales Agent service started on ${address}`);
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await server.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await server.close();
      process.exit(0);
    });

  } catch (error) {
    logger.error(error, 'Error starting Sales Agent service');
    process.exit(1);
  }
}

start();