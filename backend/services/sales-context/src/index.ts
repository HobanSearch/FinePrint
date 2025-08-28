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
import { leadsRoutes } from './routes/leads';
import { opportunitiesRoutes } from './routes/opportunities';
import { forecastingRoutes } from './routes/forecasting';
import { pipelineRoutes } from './routes/pipeline';
import { performanceRoutes } from './routes/performance';
import { analyticsRoutes } from './routes/analytics';
import { automationRoutes } from './routes/automation';
import { websocketRoutes } from './routes/websocket';

// Import services
import { SalesContextService } from './services/sales-context-service';
import { LeadScoringService } from './services/lead-scoring-service';
import { OpportunityAnalyticsService } from './services/opportunity-analytics-service';
import { RevenueForecasting } from './services/revenue-forecasting-service';
import { SalesCycleAnalytics } from './services/sales-cycle-analytics-service';
import { WinLossAnalysis } from './services/win-loss-analysis-service';
import { SalesPerformanceService } from './services/sales-performance-service';
import { SalesAutomationService } from './services/sales-automation-service';

const logger = createServiceLogger('sales-context-service');

async function buildApp() {
  const app = Fastify({
    logger: false, // Use our custom logger
    requestTimeout: 120000, // 2 minutes for complex forecasting
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

  // WebSocket support for real-time updates
  await app.register(websocket);

  // Swagger documentation
  await app.register(swagger, {
    swagger: {
      info: {
        title: 'Sales Context Engine API',
        description: 'Business Intelligence API for Sales Operations',
        version: '1.0.0',
      },
      host: 'localhost:8011',
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'leads', description: 'Lead management and scoring' },
        { name: 'opportunities', description: 'Opportunity tracking and analytics' },
        { name: 'forecasting', description: 'Revenue forecasting and predictions' },
        { name: 'pipeline', description: 'Sales pipeline analytics' },
        { name: 'performance', description: 'Sales performance metrics' },
        { name: 'analytics', description: 'Sales analytics and insights' },
        { name: 'automation', description: 'Sales automation and workflows' },
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
  const salesContextService = new SalesContextService();
  const leadScoringService = new LeadScoringService();
  const opportunityAnalyticsService = new OpportunityAnalyticsService();
  const revenueForecastingService = new RevenueForecasting();
  const salesCycleAnalyticsService = new SalesCycleAnalytics();
  const winLossAnalysisService = new WinLossAnalysis();
  const salesPerformanceService = new SalesPerformanceService();
  const salesAutomationService = new SalesAutomationService();

  // Add services to app context
  app.decorate('salesContext', salesContextService);
  app.decorate('leadScoring', leadScoringService);
  app.decorate('opportunityAnalytics', opportunityAnalyticsService);
  app.decorate('revenueForecasting', revenueForecastingService);
  app.decorate('salesCycleAnalytics', salesCycleAnalyticsService);
  app.decorate('winLossAnalysis', winLossAnalysisService);
  app.decorate('salesPerformance', salesPerformanceService);
  app.decorate('salesAutomation', salesAutomationService);

  // Initialize services
  await salesContextService.initialize();
  await leadScoringService.initialize();
  await opportunityAnalyticsService.initialize();
  await revenueForecastingService.initialize();
  await salesCycleAnalyticsService.initialize();
  await winLossAnalysisService.initialize();
  await salesPerformanceService.initialize();
  await salesAutomationService.initialize();

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
      salesContextService.healthCheck(),
      leadScoringService.healthCheck(),
      opportunityAnalyticsService.healthCheck(),
      revenueForecastingService.healthCheck(),
      salesCycleAnalyticsService.healthCheck(),
      winLossAnalysisService.healthCheck(),
      salesPerformanceService.healthCheck(),
      salesAutomationService.healthCheck(),
    ]);

    const allHealthy = healthChecks.every(check => check);

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        sales_context: healthChecks[0] ? 'healthy' : 'unhealthy',
        lead_scoring: healthChecks[1] ? 'healthy' : 'unhealthy',
        opportunity_analytics: healthChecks[2] ? 'healthy' : 'unhealthy',
        revenue_forecasting: healthChecks[3] ? 'healthy' : 'unhealthy',
        sales_cycle_analytics: healthChecks[4] ? 'healthy' : 'unhealthy',
        win_loss_analysis: healthChecks[5] ? 'healthy' : 'unhealthy',
        sales_performance: healthChecks[6] ? 'healthy' : 'unhealthy',
        sales_automation: healthChecks[7] ? 'healthy' : 'unhealthy',
      },
    };
  });

  // Register route handlers
  await app.register(leadsRoutes, { prefix: '/api/leads' });
  await app.register(opportunitiesRoutes, { prefix: '/api/opportunities' });
  await app.register(forecastingRoutes, { prefix: '/api/forecasting' });
  await app.register(pipelineRoutes, { prefix: '/api/pipeline' });
  await app.register(performanceRoutes, { prefix: '/api/performance' });
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(automationRoutes, { prefix: '/api/automation' });
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
    
    const port = config.services.salesContext?.port || 8011;
    const host = config.services.salesContext?.host || '0.0.0.0';

    await app.listen({ port, host });
    
    logger.info('Sales Context Engine started', {
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
        logger.info('Sales Context Engine stopped');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start Sales Context Engine', { error });
    process.exit(1);
  }
}

// TypeScript declarations for decorated services
declare module 'fastify' {
  interface FastifyInstance {
    salesContext: SalesContextService;
    leadScoring: LeadScoringService;
    opportunityAnalytics: OpportunityAnalyticsService;
    revenueForecasting: RevenueForecasting;
    salesCycleAnalytics: SalesCycleAnalytics;
    winLossAnalysis: WinLossAnalysis;
    salesPerformance: SalesPerformanceService;
    salesAutomation: SalesAutomationService;
  }
}

if (import.meta.url.startsWith('file://') && process.argv[1] === new URL(import.meta.url).pathname) {
  start();
}

export { buildApp };