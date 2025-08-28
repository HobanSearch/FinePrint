import { z } from 'zod';

const configSchema = z.object({
  server: z.object({
    port: z.number().default(3007),
    host: z.string().default('0.0.0.0'),
  }),
  redis: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(6379),
    password: z.string().optional(),
    db: z.number().default(7),
  }),
  kafka: z.object({
    brokers: z.array(z.string()).default(['localhost:9092']),
    clientId: z.string().default('privacy-scoring-service'),
    groupId: z.string().default('privacy-scoring-group'),
  }),
  postgres: z.object({
    connectionString: z.string(),
  }),
  neo4j: z.object({
    uri: z.string().default('bolt://localhost:7687'),
    username: z.string().default('neo4j'),
    password: z.string(),
  }),
  scoring: z.object({
    // Scoring weights
    weights: z.object({
      patternDetection: z.number().default(0.5), // 50%
      dataCollection: z.number().default(0.2), // 20%
      userRights: z.number().default(0.2), // 20%
      transparency: z.number().default(0.1), // 10%
    }),
    // Grade thresholds
    gradeThresholds: z.object({
      A: z.number().default(90),
      B: z.number().default(80),
      C: z.number().default(70),
      D: z.number().default(60),
      F: z.number().default(0),
    }),
    // Performance requirements
    processingTimeout: z.number().default(300000), // 5 minutes per site
    batchSize: z.number().default(5), // Process 5 sites concurrently
    totalTimeLimit: z.number().default(3600000), // 1 hour for all 50 sites
  }),
  cache: z.object({
    ttl: z.object({
      score: z.number().default(3600), // 1 hour
      document: z.number().default(86400), // 24 hours
      scoreCard: z.number().default(7200), // 2 hours
    }),
  }),
  workers: z.object({
    concurrency: z.number().default(5),
    maxJobsPerWorker: z.number().default(10),
  }),
  webhooks: z.object({
    maxRetries: z.number().default(3),
    retryDelay: z.number().default(5000), // 5 seconds
    timeout: z.number().default(10000), // 10 seconds
  }),
  schedule: z.object({
    // Cron expressions
    weeklyRun: z.string().default('0 0 * * 0'), // Every Sunday at midnight
    dailyCheck: z.string().default('0 2 * * *'), // Every day at 2 AM
  }),
  documentAnalysis: z.object({
    serviceUrl: z.string().default('http://document-analysis:3003'),
    timeout: z.number().default(60000), // 1 minute
  }),
  imageGeneration: z.object({
    width: z.number().default(1200),
    height: z.number().default(630),
    format: z.enum(['png', 'jpeg']).default('png'),
  }),
});

export type Config = z.infer<typeof configSchema>;

export const config: Config = {
  server: {
    port: parseInt(process.env.PORT || '3007'),
    host: process.env.HOST || '0.0.0.0',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '7'),
  },
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'privacy-scoring-service',
    groupId: process.env.KAFKA_GROUP_ID || 'privacy-scoring-group',
  },
  postgres: {
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/fineprint',
  },
  neo4j: {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
  },
  scoring: {
    weights: {
      patternDetection: 0.5,
      dataCollection: 0.2,
      userRights: 0.2,
      transparency: 0.1,
    },
    gradeThresholds: {
      A: 90,
      B: 80,
      C: 70,
      D: 60,
      F: 0,
    },
    processingTimeout: 300000,
    batchSize: 5,
    totalTimeLimit: 3600000,
  },
  cache: {
    ttl: {
      score: 3600,
      document: 86400,
      scoreCard: 7200,
    },
  },
  workers: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5'),
    maxJobsPerWorker: 10,
  },
  webhooks: {
    maxRetries: 3,
    retryDelay: 5000,
    timeout: 10000,
  },
  schedule: {
    weeklyRun: process.env.WEEKLY_CRON || '0 0 * * 0',
    dailyCheck: process.env.DAILY_CRON || '0 2 * * *',
  },
  documentAnalysis: {
    serviceUrl: process.env.DOCUMENT_ANALYSIS_URL || 'http://document-analysis:3003',
    timeout: 60000,
  },
  imageGeneration: {
    width: 1200,
    height: 630,
    format: 'png',
  },
};

// Validate configuration
try {
  configSchema.parse(config);
} catch (error) {
  console.error('Invalid configuration:', error);
  process.exit(1);
}