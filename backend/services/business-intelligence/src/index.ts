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
import { dashboardRoutes } from './routes/dashboard';
import { analyticsRoutes } from './routes/analytics';
import { predictiveRoutes } from './routes/predictive';
import { insightsRoutes } from './routes/insights';
import { reportsRoutes } from './routes/reports';
import { metricsRoutes } from './routes/metrics';
import { integrationRoutes } from './routes/integration';
import { websocketRoutes } from './routes/websocket';

// Import services
import { BusinessIntelligenceService } from './services/business-intelligence-service';
import { CrossFunctionAnalyticsService } from './services/cross-function-analytics-service';
import { PredictiveAnalyticsService } from './services/predictive-analytics-service';
import { BusinessImpactService } from './services/business-impact-service';
import { AutomatedInsightsService } from './services/automated-insights-service';
import { ExecutiveReportingService } from './services/executive-reporting-service';
import { RealTimeDashboardService } from './services/real-time-dashboard-service';
import { IntegrationService } from './services/integration-service';

const logger = createServiceLogger('business-intelligence-service');

async function buildApp() {
  const app = Fastify({
    logger: false, // Use our custom logger
    requestTimeout: 300000, // 5 minutes for complex analytics
    bodyLimit: 104857600, // 100MB for large data uploads
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
    max: 100,
    timeWindow: '1 minute',
  });

  // WebSocket support for real-time dashboards
  await app.register(websocket);

  // Swagger documentation
  await app.register(swagger, {
    swagger: {
      info: {
        title: 'Business Intelligence Hub API',
        description: 'Integrated Analytics and Predictive Insights API',
        version: '1.0.0',
      },
      host: 'localhost:8013',
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'dashboard', description: 'Real-time business dashboards' },
        { name: 'analytics', description: 'Cross-function business analytics' },
        { name: 'predictive', description: 'Predictive analytics and forecasting' },
        { name: 'insights', description: 'Automated business insights' },
        { name: 'reports', description: 'Executive reporting and summaries' },
        { name: 'metrics', description: 'Business metrics and KPIs' },
        { name: 'integration', description: 'External system integrations' },
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
  const businessIntelligenceService = new BusinessIntelligenceService();
  const crossFunctionAnalyticsService = new CrossFunctionAnalyticsService();
  const predictiveAnalyticsService = new PredictiveAnalyticsService();
  const businessImpactService = new BusinessImpactService();
  const automatedInsightsService = new AutomatedInsightsService();
  const executiveReportingService = new ExecutiveReportingService();
  const realTimeDashboardService = new RealTimeDashboardService();
  const integrationService = new IntegrationService();

  // Add services to app context
  app.decorate('businessIntelligence', businessIntelligenceService);
  app.decorate('crossFunctionAnalytics', crossFunctionAnalyticsService);
  app.decorate('predictiveAnalytics', predictiveAnalyticsService);
  app.decorate('businessImpact', businessImpactService);
  app.decorate('automatedInsights', automatedInsightsService);
  app.decorate('executiveReporting', executiveReportingService);
  app.decorate('realTimeDashboard', realTimeDashboardService);
  app.decorate('integration', integrationService);

  // Initialize services
  await businessIntelligenceService.initialize();
  await crossFunctionAnalyticsService.initialize();
  await predictiveAnalyticsService.initialize();
  await businessImpactService.initialize();
  await automatedInsightsService.initialize();
  await executiveReportingService.initialize();
  await realTimeDashboardService.initialize();
  await integrationService.initialize();

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
            systemMetrics: { type: 'object' },
          },
        },
      },
    },
  }, async () => {
    const healthChecks = await Promise.all([
      businessIntelligenceService.healthCheck(),
      crossFunctionAnalyticsService.healthCheck(),
      predictiveAnalyticsService.healthCheck(),
      businessImpactService.healthCheck(),
      automatedInsightsService.healthCheck(),
      executiveReportingService.healthCheck(),
      realTimeDashboardService.healthCheck(),
      integrationService.healthCheck(),
    ]);

    const allHealthy = healthChecks.every(check => check);

    // Get system metrics
    const systemMetrics = await businessIntelligenceService.getSystemMetrics();

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        business_intelligence: healthChecks[0] ? 'healthy' : 'unhealthy',
        cross_function_analytics: healthChecks[1] ? 'healthy' : 'unhealthy',
        predictive_analytics: healthChecks[2] ? 'healthy' : 'unhealthy',
        business_impact: healthChecks[3] ? 'healthy' : 'unhealthy',
        automated_insights: healthChecks[4] ? 'healthy' : 'unhealthy',
        executive_reporting: healthChecks[5] ? 'healthy' : 'unhealthy',
        real_time_dashboard: healthChecks[6] ? 'healthy' : 'unhealthy',
        integration: healthChecks[7] ? 'healthy' : 'unhealthy',
      },
      systemMetrics,
    };
  });

  // Register route handlers
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(predictiveRoutes, { prefix: '/api/predictive' });
  await app.register(insightsRoutes, { prefix: '/api/insights' });
  await app.register(reportsRoutes, { prefix: '/api/reports' });
  await app.register(metricsRoutes, { prefix: '/api/metrics' });
  await app.register(integrationRoutes, { prefix: '/api/integration' });
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
    
    const port = config.services.businessIntelligence?.port || 8013;
    const host = config.services.businessIntelligence?.host || '0.0.0.0';

    await app.listen({ port, host });
    
    logger.info('Business Intelligence Hub started', {
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
        logger.info('Business Intelligence Hub stopped');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start Business Intelligence Hub', { error });
    process.exit(1);
  }
}

// TypeScript declarations for decorated services
declare module 'fastify' {
  interface FastifyInstance {
    businessIntelligence: BusinessIntelligenceService;
    crossFunctionAnalytics: CrossFunctionAnalyticsService;
    predictiveAnalytics: PredictiveAnalyticsService;
    businessImpact: BusinessImpactService;
    automatedInsights: AutomatedInsightsService;
    executiveReporting: ExecutiveReportingService;
    realTimeDashboard: RealTimeDashboardService;
    integration: IntegrationService;
  }
}

if (import.meta.url.startsWith('file://') && process.argv[1] === new URL(import.meta.url).pathname) {
  start();
}

export { buildApp };