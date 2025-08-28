import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { authPlugin } from '@fineprintai/auth';

// Import route handlers
import { campaignRoutes } from './routes/campaigns';
import { segmentationRoutes } from './routes/segmentation';
import { analyticsRoutes } from './routes/analytics';
import { attributionRoutes } from './routes/attribution';
import { personalizationRoutes } from './routes/personalization';
import { insightsRoutes } from './routes/insights';
import { websocketRoutes } from './routes/websocket';

// Import services
import { MarketingContextService } from './services/marketing-context-service';
import { CampaignAnalyticsService } from './services/campaign-analytics-service';
import { CustomerSegmentationService } from './services/customer-segmentation-service';
import { ContentPerformanceService } from './services/content-performance-service';
import { MarketIntelligenceService } from './services/market-intelligence-service';
import { PersonalizationEngineService } from './services/personalization-engine-service';
import { AttributionModelingService } from './services/attribution-modeling-service';

const logger = createServiceLogger('marketing-context-service');

async function buildApp() {
  const app = Fastify({
    logger: false, // Use our custom logger
    requestTimeout: 120000, // 2 minutes for complex analytics
    bodyLimit: 52428800, // 50MB for large data uploads
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
    origin: config.cors.origins,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  });

  // WebSocket support for real-time analytics
  await app.register(websocket);

  // Swagger documentation
  await app.register(swagger, {
    swagger: {
      info: {
        title: 'Marketing Context Engine API',
        description: 'Business Intelligence API for Marketing Operations',
        version: '1.0.0',
      },
      host: 'localhost:8010',
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'campaigns', description: 'Campaign management and analytics' },
        { name: 'segmentation', description: 'Customer segmentation operations' },
        { name: 'analytics', description: 'Marketing analytics and insights' },
        { name: 'attribution', description: 'Attribution modeling and analysis' },
        { name: 'personalization', description: 'Personalization engine operations' },
        { name: 'insights', description: 'AI-driven marketing insights' },
      ],
    },
  });

  await app.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });

  // Auth plugin
  await app.register(authPlugin);

  // Initialize core services
  const marketingContextService = new MarketingContextService();
  const campaignAnalyticsService = new CampaignAnalyticsService();
  const segmentationService = new CustomerSegmentationService();
  const contentPerformanceService = new ContentPerformanceService();
  const marketIntelligenceService = new MarketIntelligenceService();
  const personalizationService = new PersonalizationEngineService();
  const attributionService = new AttributionModelingService();

  // Add services to app context
  app.decorate('marketingContext', marketingContextService);
  app.decorate('campaignAnalytics', campaignAnalyticsService);
  app.decorate('segmentation', segmentationService);
  app.decorate('contentPerformance', contentPerformanceService);
  app.decorate('marketIntelligence', marketIntelligenceService);
  app.decorate('personalization', personalizationService);
  app.decorate('attribution', attributionService);

  // Initialize services
  await marketingContextService.initialize();
  await campaignAnalyticsService.initialize();
  await segmentationService.initialize();
  await contentPerformanceService.initialize();
  await marketIntelligenceService.initialize();
  await personalizationService.initialize();
  await attributionService.initialize();

  // Health check endpoint
  app.get('/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            version: { type: 'string' },
            services: { type: 'object' },
          },
        },
      },
    },
  }, async () => {
    const healthChecks = await Promise.all([
      marketingContextService.healthCheck(),
      campaignAnalyticsService.healthCheck(),
      segmentationService.healthCheck(),
      contentPerformanceService.healthCheck(),
      marketIntelligenceService.healthCheck(),
      personalizationService.healthCheck(),
      attributionService.healthCheck(),
    ]);

    const allHealthy = healthChecks.every(check => check);

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        marketing_context: healthChecks[0] ? 'healthy' : 'unhealthy',
        campaign_analytics: healthChecks[1] ? 'healthy' : 'unhealthy',
        customer_segmentation: healthChecks[2] ? 'healthy' : 'unhealthy',
        content_performance: healthChecks[3] ? 'healthy' : 'unhealthy',
        market_intelligence: healthChecks[4] ? 'healthy' : 'unhealthy',
        personalization_engine: healthChecks[5] ? 'healthy' : 'unhealthy',
        attribution_modeling: healthChecks[6] ? 'healthy' : 'unhealthy',
      },
    };
  });

  // Register route handlers
  await app.register(campaignRoutes, { prefix: '/api/campaigns' });
  await app.register(segmentationRoutes, { prefix: '/api/segmentation' });
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(attributionRoutes, { prefix: '/api/attribution' });
  await app.register(personalizationRoutes, { prefix: '/api/personalization' });
  await app.register(insightsRoutes, { prefix: '/api/insights' });
  await app.register(websocketRoutes, { prefix: '/ws' });

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    logger.error('Request error', {
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
      userId: (request as any).user?.id,
    });

    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      error: {
        message: statusCode === 500 ? 'Internal Server Error' : error.message,
        statusCode,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      },
    });
  });

  return app;
}

async function start() {
  try {
    const app = await buildApp();
    
    const port = config.services.marketingContext?.port || 8010;
    const host = config.services.marketingContext?.host || '0.0.0.0';

    await app.listen({ port, host });
    
    logger.info('Marketing Context Engine started', {
      port,
      host,
      environment: config.environment,
      version: '1.0.0',
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      
      try {
        await app.close();
        logger.info('Marketing Context Engine stopped');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start Marketing Context Engine', { error });
    process.exit(1);
  }
}

// TypeScript declarations for decorated services
declare module 'fastify' {
  interface FastifyInstance {
    marketingContext: MarketingContextService;
    campaignAnalytics: CampaignAnalyticsService;
    segmentation: CustomerSegmentationService;
    contentPerformance: ContentPerformanceService;
    marketIntelligence: MarketIntelligenceService;
    personalization: PersonalizationEngineService;
    attribution: AttributionModelingService;
  }
}

if (import.meta.url.startsWith('file://') && process.argv[1] === new URL(import.meta.url).pathname) {
  start();
}

export { buildApp };