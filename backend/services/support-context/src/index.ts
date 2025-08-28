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
import { ticketsRoutes } from './routes/tickets';
import { customersRoutes } from './routes/customers';
import { healthRoutes } from './routes/health';
import { analyticsRoutes } from './routes/analytics';
import { knowledgeBaseRoutes } from './routes/knowledge-base';
import { performanceRoutes } from './routes/performance';
import { automationRoutes } from './routes/automation';
import { websocketRoutes } from './routes/websocket';

// Import services
import { SupportContextService } from './services/support-context-service';
import { CustomerHealthService } from './services/customer-health-service';
import { TicketClassificationService } from './services/ticket-classification-service';
import { ResolutionAnalyticsService } from './services/resolution-analytics-service';
import { CustomerJourneyService } from './services/customer-journey-service';
import { KnowledgeBaseAnalyticsService } from './services/knowledge-base-analytics-service';
import { AgentPerformanceService } from './services/agent-performance-service';
import { SentimentAnalysisService } from './services/sentiment-analysis-service';
import { EscalationPredictionService } from './services/escalation-prediction-service';

const logger = createServiceLogger('support-context-service');

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

  // WebSocket support for real-time updates
  await app.register(websocket);

  // Swagger documentation
  await app.register(swagger, {
    swagger: {
      info: {
        title: 'Support Context Engine API',
        description: 'Business Intelligence API for Customer Support Operations',
        version: '1.0.0',
      },
      host: 'localhost:8012',
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'tickets', description: 'Support ticket management and analytics' },
        { name: 'customers', description: 'Customer health and journey analysis' },
        { name: 'health', description: 'Customer health scoring and monitoring' },
        { name: 'analytics', description: 'Support analytics and insights' },
        { name: 'knowledge-base', description: 'Knowledge base analytics and optimization' },
        { name: 'performance', description: 'Agent and team performance metrics' },
        { name: 'automation', description: 'Support automation and workflows' },
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
  const supportContextService = new SupportContextService();
  const customerHealthService = new CustomerHealthService();
  const ticketClassificationService = new TicketClassificationService();
  const resolutionAnalyticsService = new ResolutionAnalyticsService();
  const customerJourneyService = new CustomerJourneyService();
  const knowledgeBaseService = new KnowledgeBaseAnalyticsService();
  const agentPerformanceService = new AgentPerformanceService();
  const sentimentAnalysisService = new SentimentAnalysisService();
  const escalationPredictionService = new EscalationPredictionService();

  // Add services to app context
  app.decorate('supportContext', supportContextService);
  app.decorate('customerHealth', customerHealthService);
  app.decorate('ticketClassification', ticketClassificationService);
  app.decorate('resolutionAnalytics', resolutionAnalyticsService);
  app.decorate('customerJourney', customerJourneyService);
  app.decorate('knowledgeBase', knowledgeBaseService);
  app.decorate('agentPerformance', agentPerformanceService);
  app.decorate('sentimentAnalysis', sentimentAnalysisService);
  app.decorate('escalationPrediction', escalationPredictionService);

  // Initialize services
  await supportContextService.initialize();
  await customerHealthService.initialize();
  await ticketClassificationService.initialize();
  await resolutionAnalyticsService.initialize();
  await customerJourneyService.initialize();
  await knowledgeBaseService.initialize();
  await agentPerformanceService.initialize();
  await sentimentAnalysisService.initialize();
  await escalationPredictionService.initialize();

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
      supportContextService.healthCheck(),
      customerHealthService.healthCheck(),
      ticketClassificationService.healthCheck(),
      resolutionAnalyticsService.healthCheck(),
      customerJourneyService.healthCheck(),
      knowledgeBaseService.healthCheck(),
      agentPerformanceService.healthCheck(),
      sentimentAnalysisService.healthCheck(),
      escalationPredictionService.healthCheck(),
    ]);

    const allHealthy = healthChecks.every(check => check);

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        support_context: healthChecks[0] ? 'healthy' : 'unhealthy',
        customer_health: healthChecks[1] ? 'healthy' : 'unhealthy',
        ticket_classification: healthChecks[2] ? 'healthy' : 'unhealthy',
        resolution_analytics: healthChecks[3] ? 'healthy' : 'unhealthy',
        customer_journey: healthChecks[4] ? 'healthy' : 'unhealthy',
        knowledge_base: healthChecks[5] ? 'healthy' : 'unhealthy',
        agent_performance: healthChecks[6] ? 'healthy' : 'unhealthy',
        sentiment_analysis: healthChecks[7] ? 'healthy' : 'unhealthy',
        escalation_prediction: healthChecks[8] ? 'healthy' : 'unhealthy',
      },
    };
  });

  // Register route handlers
  await app.register(ticketsRoutes, { prefix: '/api/tickets' });
  await app.register(customersRoutes, { prefix: '/api/customers' });
  await app.register(healthRoutes, { prefix: '/api/health' });
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(knowledgeBaseRoutes, { prefix: '/api/knowledge-base' });
  await app.register(performanceRoutes, { prefix: '/api/performance' });
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
    
    const port = config.services.supportContext?.port || 8012;
    const host = config.services.supportContext?.host || '0.0.0.0';

    await app.listen({ port, host });
    
    logger.info('Support Context Engine started', {
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
        logger.info('Support Context Engine stopped');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start Support Context Engine', { error });
    process.exit(1);
  }
}

// TypeScript declarations for decorated services
declare module 'fastify' {
  interface FastifyInstance {
    supportContext: SupportContextService;
    customerHealth: CustomerHealthService;
    ticketClassification: TicketClassificationService;
    resolutionAnalytics: ResolutionAnalyticsService;
    customerJourney: CustomerJourneyService;
    knowledgeBase: KnowledgeBaseAnalyticsService;
    agentPerformance: AgentPerformanceService;
    sentimentAnalysis: SentimentAnalysisService;
    escalationPrediction: EscalationPredictionService;
  }
}

if (import.meta.url.startsWith('file://') && process.argv[1] === new URL(import.meta.url).pathname) {
  start();
}

export { buildApp };