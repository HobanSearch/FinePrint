/**
 * Fine Print AI - DevOps Agent Service
 * 
 * Comprehensive DevOps automation and infrastructure management platform
 * providing IaC, CI/CD, monitoring, security, and cost optimization capabilities.
 */

import Fastify from 'fastify';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { registerRoutes } from '@/routes';
import { registerPlugins } from '@/plugins';
import { initializeServices } from '@/services';
import { setupErrorHandling } from '@/utils/error-handler';
import { startBackgroundJobs } from '@/workers';
import { validateEnvironment } from '@/utils/environment-validator';

const fastify = Fastify({
  logger: false, // Using custom winston logger
  trustProxy: true,
  maxParamLength: 1000,
  ignoreTrailingSlash: true,
});

/**
 * Graceful shutdown handler
 */
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  
  try {
    await fastify.close();
    logger.info('Server closed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

/**
 * Initialize and start the DevOps Agent service
 */
const start = async () => {
  try {
    // Validate environment configuration
    await validateEnvironment();
    
    // Setup error handling
    setupErrorHandling(fastify);
    
    // Register plugins (cors, helmet, jwt, rate limiting, etc.)
    await registerPlugins(fastify);
    
    // Initialize services (Redis, database connections, etc.)
    await initializeServices();
    
    // Register routes
    await registerRoutes(fastify);
    
    // Start background job workers
    await startBackgroundJobs();
    
    // Start the server
    await fastify.listen({
      port: config.server.port,
      host: config.server.host,
    });
    
    logger.info(`🚀 DevOps Agent service started successfully`);
    logger.info(`📊 Server listening on ${config.server.host}:${config.server.port}`);
    logger.info(`📖 API Documentation: http://${config.server.host}:${config.server.port}/docs`);
    logger.info(`🏥 Health Check: http://${config.server.host}:${config.server.port}/health`);
    
    // Health check endpoint
    fastify.get('/health', async () => ({
      status: 'healthy',
      service: 'devops-agent',
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.app.environment,
      nodeVersion: process.version,
    }));
    
  } catch (error) {
    logger.error('Failed to start DevOps Agent service:', error);
    process.exit(1);
  }
};

// Handle process signals for graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the service
start();