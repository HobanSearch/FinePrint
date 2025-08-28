import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import axios from 'axios';
import { config } from './config';
import { logger } from './utils/logger';
import scoresRoutes from './routes/scores';

const fastify = Fastify({
  logger: logger as any,
});

// Initialize dependencies
const prisma = new PrismaClient();
const redis = new Redis(config.redis);
const queue = new Queue('privacy-scoring', { connection: redis });
const httpClient = axios.create();

// Decorate fastify with dependencies
fastify.decorate('prisma', prisma);
fastify.decorate('redis', redis);
fastify.decorate('queue', queue);
fastify.decorate('httpClient', httpClient);

// Declare decorations for TypeScript
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
    queue: Queue;
    httpClient: typeof axios;
  }
}

async function setupRoutes() {
  // Health check
  fastify.get('/health', async (request, reply) => {
    return { status: 'healthy', service: 'privacy-scoring' };
  });

  // Register API routes
  await fastify.register(scoresRoutes, { prefix: '/api' });
}

async function start() {
  try {
    // Register plugins
    await fastify.register(cors, {
      origin: process.env.CORS_ORIGIN || '*',
    });

    await fastify.register(helmet);

    await fastify.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
    });

    // Setup routes
    await setupRoutes();

    // Note: Worker is started separately via npm run worker:dev

    // Start server
    await fastify.listen({
      port: config.server.port,
      host: config.server.host,
    });

    logger.info(`Privacy scoring service started on ${config.server.host}:${config.server.port}`);
  } catch (err) {
    logger.error('Failed to start service:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  await redis.quit();
  await queue.close();
  await fastify.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await prisma.$disconnect();
  await redis.quit();
  await queue.close();
  await fastify.close();
  process.exit(0);
});

// Start the service
start();