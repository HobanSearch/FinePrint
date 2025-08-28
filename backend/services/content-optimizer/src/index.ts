/**
 * Content Optimizer Service
 * Dynamic content delivery system with A/B test optimization
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { 
  ContentRequest, 
  ContentResponse,
  ServiceConfig,
  HealthStatus 
} from './types';
import { logger } from './utils/logger';
import { RedisCache, CacheWarmer } from './cache/redis-cache';
import { ContentStore } from './versioning/content-store';
import { ContentSelector } from './optimization/content-selector';
import { WinnerDetector } from './optimization/winner-detector';
import { PersonalizationEngine } from './personalization/personalization-engine';
import { DigitalTwinClient } from './integration/digital-twin-client';
import { ExperimentSubscriber } from './integration/experiment-subscriber';

// Load configuration
const config: ServiceConfig = {
  port: parseInt(process.env.PORT || '3006'),
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    keyPrefix: 'content:'
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost/fineprint',
    maxConnections: 20,
    connectionTimeout: 5000
  },
  optimization: {
    minSampleSize: parseInt(process.env.MIN_SAMPLE_SIZE || '100'),
    confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.95'),
    explorationRate: parseFloat(process.env.EXPLORATION_RATE || '0.1'),
    updateInterval: parseInt(process.env.UPDATE_INTERVAL || '60000'),
    winnerPromotionDelay: parseInt(process.env.WINNER_DELAY || '3600000')
  },
  cache: {
    ttl: 300,
    warmOnStartup: true,
    layers: [
      { name: 'memory', ttl: 60, priority: 1, maxSize: 1000 },
      { name: 'redis', ttl: 300, priority: 2 },
      { name: 'database', ttl: 3600, priority: 3 }
    ]
  },
  integration: {
    digitalTwinUrl: process.env.DIGITAL_TWIN_URL || 'http://localhost:3005',
    businessAgentUrl: process.env.BUSINESS_AGENT_URL || 'http://localhost:3007',
    websocketUrl: process.env.WEBSOCKET_URL || 'ws://localhost:3005/ws',
    apiKey: process.env.INTEGRATION_API_KEY,
    timeout: 5000
  }
};

// Initialize components
const cache = new RedisCache(config.redis);
const contentStore = new ContentStore(cache, {
  maxVersionsPerContent: 20,
  retentionDays: 90
});
const contentSelector = new ContentSelector(cache, contentStore, {
  explorationRate: config.optimization.explorationRate,
  minSampleSize: config.optimization.minSampleSize,
  cacheKeyPrefix: config.redis.keyPrefix
});
const winnerDetector = new WinnerDetector({
  minSampleSize: config.optimization.minSampleSize,
  confidenceLevel: config.optimization.confidenceThreshold,
  effectSizeThreshold: 0.05,
  earlyStoppingEnabled: true
});
const personalizationEngine = new PersonalizationEngine(cache, {
  enablePersonalization: true,
  segmentCacheTTL: 3600,
  contextCacheTTL: 1800
});
const digitalTwinClient = new DigitalTwinClient({
  baseUrl: config.integration.digitalTwinUrl,
  apiKey: config.integration.apiKey,
  timeout: config.integration.timeout
});
const experimentSubscriber = new ExperimentSubscriber({
  url: config.integration.websocketUrl,
  apiKey: config.integration.apiKey,
  heartbeatInterval: 30000
});

// Create Fastify instance
const fastify = Fastify({
  logger: false, // We use our own logger
  requestIdHeader: 'x-request-id',
  trustProxy: true
});

// Register plugins
fastify.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(',') || true,
  credentials: true
});

fastify.register(helmet, {
  contentSecurityPolicy: false // Configure based on requirements
});

fastify.register(compress, {
  global: true,
  threshold: 1024
});

fastify.register(rateLimit, {
  max: 1000,
  timeWindow: '1 minute'
});

// API Documentation
fastify.register(swagger, {
  openapi: {
    info: {
      title: 'Content Optimizer API',
      description: 'Dynamic content optimization service',
      version: '1.0.0'
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3006',
        description: 'Content Optimizer Service'
      }
    ],
    tags: [
      { name: 'content', description: 'Content delivery endpoints' },
      { name: 'admin', description: 'Administration endpoints' },
      { name: 'health', description: 'Health and monitoring' }
    ]
  }
});

fastify.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: false
  }
});

// Request logging
fastify.addHook('onRequest', async (request, reply) => {
  logger.info({
    request: {
      method: request.method,
      url: request.url,
      path: request.routerPath,
      parameters: request.params,
      query: request.query,
      headers: {
        'user-agent': request.headers['user-agent'],
        'content-type': request.headers['content-type']
      }
    }
  }, 'Request received');
});

// Response logging
fastify.addHook('onResponse', async (request, reply) => {
  logger.info({
    request: {
      method: request.method,
      url: request.url
    },
    response: {
      statusCode: reply.statusCode,
      duration: reply.getResponseTime()
    }
  }, 'Request completed');
});

// Error handling
fastify.setErrorHandler((error, request, reply) => {
  logger.error({
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code
    },
    request: {
      method: request.method,
      url: request.url
    }
  }, 'Request error');

  reply.status(error.statusCode || 500).send({
    success: false,
    error: error.message,
    timestamp: new Date()
  });
});

/**
 * Content Delivery Endpoints
 */

// Get optimized marketing content
fastify.get<{
  Params: { page: string };
  Querystring: { 
    segment?: string;
    personalize?: boolean;
    userId?: string;
    sessionId?: string;
  };
}>('/content/marketing/:page', {
  schema: {
    tags: ['content'],
    summary: 'Get optimized marketing content',
    params: {
      type: 'object',
      properties: {
        page: { type: 'string' }
      }
    },
    querystring: {
      type: 'object',
      properties: {
        segment: { type: 'string', enum: ['enterprise', 'smb', 'startup', 'individual'] },
        personalize: { type: 'boolean' },
        userId: { type: 'string' },
        sessionId: { type: 'string' }
      }
    }
  }
}, async (request, reply) => {
  const contentRequest: ContentRequest = {
    category: 'marketing',
    page: request.params.page,
    context: {
      userId: request.query.userId,
      sessionId: request.query.sessionId || request.id,
      segment: request.query.segment as any
    },
    options: {
      personalize: request.query.personalize,
      fallbackToDefault: true
    }
  };

  const optimizedContent = await contentSelector.selectContent(contentRequest);
  
  // Apply personalization if requested
  let finalContent = optimizedContent.content;
  if (request.query.personalize) {
    finalContent = await personalizationEngine.personalizeContent(
      finalContent,
      contentRequest.context!,
      'marketing'
    );
  }

  const response: ContentResponse = {
    success: true,
    content: finalContent,
    timestamp: new Date()
  };

  reply.send(response);
});

// Get optimized sales messaging
fastify.get<{
  Querystring: { 
    segment?: string;
    industry?: string;
    personalize?: boolean;
  };
}>('/content/sales/messaging', {
  schema: {
    tags: ['content'],
    summary: 'Get optimized sales messaging'
  }
}, async (request, reply) => {
  const contentRequest: ContentRequest = {
    category: 'sales',
    page: 'messaging',
    context: {
      sessionId: request.id,
      segment: request.query.segment as any,
      industry: request.query.industry as any
    },
    options: {
      personalize: request.query.personalize
    }
  };

  const optimizedContent = await contentSelector.selectContent(contentRequest);
  
  let finalContent = optimizedContent.content;
  if (request.query.personalize) {
    finalContent = await personalizationEngine.personalizeContent(
      finalContent,
      contentRequest.context!,
      'sales'
    );
  }

  reply.send({
    success: true,
    messages: finalContent,
    timestamp: new Date()
  });
});

// Get optimized support responses
fastify.get('/content/support/responses', {
  schema: {
    tags: ['content'],
    summary: 'Get optimized support responses'
  }
}, async (request, reply) => {
  const contentRequest: ContentRequest = {
    category: 'support',
    page: 'responses',
    context: {
      sessionId: request.id
    }
  };

  const optimizedContent = await contentSelector.selectContent(contentRequest);
  
  reply.send({
    success: true,
    responses: optimizedContent.content,
    timestamp: new Date()
  });
});

// Get optimized SEO metadata
fastify.get('/content/seo/metadata', {
  schema: {
    tags: ['content'],
    summary: 'Get optimized SEO metadata'
  }
}, async (request, reply) => {
  const contentRequest: ContentRequest = {
    category: 'seo',
    page: 'metadata',
    context: {
      sessionId: request.id
    }
  };

  const optimizedContent = await contentSelector.selectContent(contentRequest);
  
  reply.send({
    success: true,
    metadata: optimizedContent.content,
    timestamp: new Date()
  });
});

/**
 * Conversion Tracking Endpoint
 */
fastify.post<{
  Body: {
    variantId: string;
    success: boolean;
    userId?: string;
    sessionId?: string;
  };
}>('/track/conversion', {
  schema: {
    tags: ['content'],
    summary: 'Track conversion for content variant',
    body: {
      type: 'object',
      required: ['variantId', 'success'],
      properties: {
        variantId: { type: 'string' },
        success: { type: 'boolean' },
        userId: { type: 'string' },
        sessionId: { type: 'string' }
      }
    }
  }
}, async (request, reply) => {
  await contentSelector.updateConversion(
    request.body.variantId,
    request.body.success,
    {
      userId: request.body.userId,
      sessionId: request.body.sessionId || request.id
    }
  );

  reply.send({
    success: true,
    message: 'Conversion tracked',
    timestamp: new Date()
  });
});

/**
 * Admin Endpoints
 */

// Get content statistics
fastify.get('/admin/stats', {
  schema: {
    tags: ['admin'],
    summary: 'Get content optimization statistics'
  }
}, async (request, reply) => {
  const stats = {
    variants: contentStore.getStatistics(),
    bandits: Array.from(contentSelector.getStatistics()),
    cache: await cache.getStats(),
    websocket: experimentSubscriber.getStats()
  };

  reply.send(stats);
});

// Manually promote variant to winner
fastify.post<{
  Body: { variantId: string };
}>('/admin/promote-winner', {
  schema: {
    tags: ['admin'],
    summary: 'Manually promote variant to winner',
    body: {
      type: 'object',
      required: ['variantId'],
      properties: {
        variantId: { type: 'string' }
      }
    }
  }
}, async (request, reply) => {
  await contentStore.promoteToWinner(request.body.variantId);
  
  reply.send({
    success: true,
    message: 'Variant promoted to winner',
    timestamp: new Date()
  });
});

// Clear cache
fastify.post('/admin/cache/clear', {
  schema: {
    tags: ['admin'],
    summary: 'Clear content cache'
  }
}, async (request, reply) => {
  await cache.flush();
  
  reply.send({
    success: true,
    message: 'Cache cleared',
    timestamp: new Date()
  });
});

/**
 * Health Check Endpoint
 */
fastify.get('/health', {
  schema: {
    tags: ['health'],
    summary: 'Health check endpoint'
  }
}, async (request, reply) => {
  const health: HealthStatus = {
    healthy: true,
    version: '1.0.0',
    uptime: process.uptime(),
    connections: {
      redis: await cache.exists('health_check'),
      database: true, // Would check actual database connection
      digitalTwin: await digitalTwinClient.healthCheck()
    },
    metrics: {
      requestsPerMinute: 0, // Would track actual metrics
      averageResponseTime: 0,
      cacheHitRate: 0
    }
  };

  reply.send(health);
});

/**
 * Setup experiment update listeners
 */
experimentSubscriber.on('winner', async (data) => {
  logger.info({ data }, 'Winner detected via WebSocket');
  
  // Promote winning variant
  if (data.winnerVariantId) {
    await contentStore.promoteToWinner(data.winnerVariantId);
  }
});

experimentSubscriber.on('update', async (data) => {
  // Update variant performance
  await contentStore.updateVariantPerformance(data.variantId, {
    impression: true
  });
});

/**
 * Periodic tasks
 */

// Check for experiment winners periodically
setInterval(async () => {
  try {
    const winners = await digitalTwinClient.getWinningExperiments();
    
    for (const winner of winners) {
      await contentStore.promoteToWinner(winner.winnerVariantId);
    }
  } catch (error) {
    logger.error({ error }, 'Error checking for winners');
  }
}, config.optimization.updateInterval);

// Prune underperforming variants
setInterval(async () => {
  try {
    await contentSelector.pruneVariants();
  } catch (error) {
    logger.error({ error }, 'Error pruning variants');
  }
}, 3600000); // Every hour

/**
 * Cache warming
 */
const cacheWarmer = new CacheWarmer(cache, async () => {
  // Load popular content for cache warming
  const popularContent = [];
  
  // Add marketing content
  for (const page of ['homepage', 'pricing', 'features']) {
    popularContent.push({
      key: `content:marketing:${page}:default`,
      value: await contentSelector.selectContent({
        category: 'marketing',
        page,
        options: { fallbackToDefault: true }
      }),
      ttl: 600
    });
  }

  return popularContent;
});

// Warm cache on startup
if (config.cache.warmOnStartup) {
  cacheWarmer.warmOnStartup();
}

// Schedule periodic warming
cacheWarmer.schedulePeriodic(3600000); // Every hour

/**
 * Graceful shutdown
 */
const gracefulShutdown = async () => {
  logger.info('Shutting down gracefully...');
  
  experimentSubscriber.close();
  await cache.close();
  await fastify.close();
  
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

/**
 * Start server
 */
const start = async () => {
  try {
    await fastify.listen({
      port: config.port,
      host: '0.0.0.0'
    });

    logger.info({ 
      port: config.port,
      docs: `http://localhost:${config.port}/docs`
    }, 'Content Optimizer Service started');

  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
};

start();