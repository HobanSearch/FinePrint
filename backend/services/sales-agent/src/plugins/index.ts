import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { config } from '../config';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
    queues: {
      leadProcessing: Queue;
      emailAutomation: Queue;
      crmSync: Queue;
      forecasting: Queue;
    };
  }
}

export const salesAgentPlugin: FastifyPluginAsync = fp(async (fastify) => {
  // Database connection
  const prisma = new PrismaClient({
    log: config.nodeEnv === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  });

  // Redis connection
  const redis = new Redis(config.redisUrl, {
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
  });

  // Queue setup
  const queuesConfig = {
    connection: {
      host: new URL(config.redisUrl).hostname,
      port: parseInt(new URL(config.redisUrl).port || '6379'),
      password: new URL(config.redisUrl).password || undefined,
    },
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
  };

  const queues = {
    leadProcessing: new Queue(`${config.queuePrefix}:lead-processing`, queuesConfig),
    emailAutomation: new Queue(`${config.queuePrefix}:email-automation`, queuesConfig),
    crmSync: new Queue(`${config.queuePrefix}:crm-sync`, queuesConfig),
    forecasting: new Queue(`${config.queuePrefix}:forecasting`, queuesConfig),
  };

  // Register instances
  fastify.decorate('prisma', prisma);
  fastify.decorate('redis', redis);
  fastify.decorate('queues', queues);

  // Health checks
  fastify.addHook('onReady', async () => {
    try {
      await prisma.$connect();
      fastify.log.info('Database connected successfully');
    } catch (error) {
      fastify.log.error(error, 'Failed to connect to database');
      throw error;
    }

    try {
      await redis.ping();
      fastify.log.info('Redis connected successfully');
    } catch (error) {
      fastify.log.error(error, 'Failed to connect to Redis');
      throw error;
    }
  });

  // Cleanup on close
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
    await redis.quit();
    await Promise.all([
      queues.leadProcessing.close(),
      queues.emailAutomation.close(),
      queues.crmSync.close(),
      queues.forecasting.close(),
    ]);
  });
});