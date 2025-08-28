/**
 * Fastify Plugins Registration
 * Configure and register all required Fastify plugins
 */

import { FastifyInstance } from 'fastify';
import { createContextLogger } from '@/utils/logger';
import { config } from '@/config';

const logger = createContextLogger('Plugins');

export async function registerPlugins(fastify: FastifyInstance): Promise<void> {
  logger.info('Registering Fastify plugins...');

  try {
    // Security plugins
    await fastify.register(require('@fastify/helmet'), {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    });

    await fastify.register(require('@fastify/cors'), {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });

    // Rate limiting
    await fastify.register(require('@fastify/rate-limit'), {
      max: 100,
      timeWindow: '1 minute',
      skipOnError: true,
    });

    // JWT authentication
    await fastify.register(require('@fastify/jwt'), {
      secret: config.auth.jwtSecret,
      sign: {
        expiresIn: config.auth.jwtExpiresIn,
      },
    });

    // Sensible defaults
    await fastify.register(require('@fastify/sensible'));

    // Request logging
    fastify.addHook('onRequest', async (request, reply) => {
      logger.http(`${request.method} ${request.url} - ${request.ip}`);
    });

    // Authentication hook
    fastify.addHook('preValidation', async (request, reply) => {
      // Skip auth for health checks and docs
      const publicPaths = ['/health', '/docs', '/api/v1/webhooks'];
      const isPublicPath = publicPaths.some(path => request.url.startsWith(path));
      
      if (isPublicPath) {
        return;
      }

      // Verify JWT token
      try {
        await request.jwtVerify();
      } catch (error) {
        reply.code(401).send({
          success: false,
          error: 'Unauthorized',
          message: 'Valid authentication token required',
        });
      }
    });

    // Error handling
    fastify.setErrorHandler(async (error, request, reply) => {
      logger.error('Request error:', error);

      if (error.validation) {
        return reply.status(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Request validation failed',
          details: error.validation,
        });
      }

      if (error.statusCode) {
        return reply.status(error.statusCode).send({
          success: false,
          error: error.name,
          message: error.message,
        });
      }

      return reply.status(500).send({
        success: false,
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      });
    });

    // Not found handler
    fastify.setNotFoundHandler(async (request, reply) => {
      return reply.status(404).send({
        success: false,
        error: 'Not Found',
        message: `Route ${request.method} ${request.url} not found`,
      });
    });

    logger.info('All plugins registered successfully');

  } catch (error) {
    logger.error('Failed to register plugins:', error);
    throw error;
  }
}

export default registerPlugins;