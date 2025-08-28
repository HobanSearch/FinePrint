/**
 * External Integrations Service
 * Handles integrations with Stripe, SendGrid, and social media platforms
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config';
import { createServiceLogger } from './logger';
import { authPlugin } from './auth';

import stripeRoutes from './routes/stripe';
import emailRoutes from './routes/email';
import socialMediaRoutes from './routes/social-media';
import webhookRoutes from './routes/webhooks';

import { StripeService } from './services/stripe-service';
import { SendGridService } from './services/sendgrid-service';
import { SocialMediaService } from './services/social-media-service';
import { WebhookProcessor } from './services/webhook-processor';

const logger = createServiceLogger('external-integrations-service');

async function buildApp() {
  const app = Fastify({
    logger: false,
    requestTimeout: 60000,
    bodyLimit: 10485760, // 10MB
  });

  // Security plugins
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  await app.register(cors, {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    skipSuccessfulRequests: true,
  });

  // Auth plugin
  await app.register(authPlugin);

  // Initialize services
  const stripeService = new StripeService();
  const sendGridService = new SendGridService();
  const socialMediaService = new SocialMediaService();
  const webhookProcessor = new WebhookProcessor(stripeService, sendGridService);

  // Initialize all services
  await stripeService.initialize();
  await sendGridService.initialize();
  await socialMediaService.initialize();
  await webhookProcessor.initialize();

  // Add services to app context
  app.decorate('stripeService', stripeService);
  app.decorate('sendGridService', sendGridService);
  app.decorate('socialMediaService', socialMediaService);
  app.decorate('webhookProcessor', webhookProcessor);

  // Health check
  app.get('/health', async () => {
    const services = {
      stripe: stripeService.isHealthy(),
      sendgrid: sendGridService.isHealthy(),
      social_media: socialMediaService.isHealthy(),
      webhook_processor: webhookProcessor.isHealthy(),
    };

    const allHealthy = Object.values(services).every(status => status);

    return {
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services,
    };
  });

  // Register routes
  await app.register(stripeRoutes, { prefix: '/api/stripe' });
  await app.register(emailRoutes, { prefix: '/api/email' });
  await app.register(socialMediaRoutes, { prefix: '/api/social' });
  await app.register(webhookRoutes, { prefix: '/api/webhooks' });

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    logger.error('Request error', {
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
    });

    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      error: {
        message: statusCode === 500 ? 'Internal Server Error' : error.message,
        statusCode,
        timestamp: new Date().toISOString(),
      },
    });
  });

  return app;
}

async function start() {
  try {
    const app = await buildApp();
    
    const port = process.env.PORT ? parseInt(process.env.PORT) : 8010;
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });
    
    logger.info('External Integrations Service started', {
      port,
      host,
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      
      try {
        await app.close();
        logger.info('External Integrations Service stopped');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start External Integrations Service', { error });
    process.exit(1);
  }
}

// Add TypeScript declarations
declare module 'fastify' {
  interface FastifyInstance {
    stripeService: StripeService;
    sendGridService: SendGridService;
    socialMediaService: SocialMediaService;
    webhookProcessor: WebhookProcessor;
  }
}

if (require.main === module) {
  start();
}