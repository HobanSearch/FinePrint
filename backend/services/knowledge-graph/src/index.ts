import fastify, { FastifyInstance } from 'fastify';
import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { securityMiddleware } from '@fineprintai/shared-security';
import { KnowledgeGraphService } from '@/services/knowledge-graph-service';
import { BusinessIntelligenceService } from '@/services/business-intelligence-service';
import { RecommendationEngine } from '@/services/recommendation-engine';
import { PatternRecognitionService } from '@/services/pattern-recognition-service';
import { GraphAnalyticsService } from '@/services/graph-analytics-service';
import { CurriculumLearningService } from '@/services/curriculum-learning-service';
import { registerRoutes } from '@/routes';
import { registerPlugins } from '@/plugins';
import { GraphQLSchema } from '@/graphql/schema';

const logger = createServiceLogger('knowledge-graph-service');

/**
 * Initialize and start the Comprehensive Knowledge Graph Service
 * 
 * Features:
 * - Neo4j Business Intelligence Knowledge Graph with comprehensive entity modeling
 * - Advanced Graph Analytics with community detection, centrality analysis, and path optimization
 * - Real-time Recommendation Engine for business decision support
 * - Pattern Recognition Service for automatic insights discovery
 * - Business Intelligence Service for comprehensive analytics across all domains
 * - Curriculum Learning Engine with progressive difficulty (legacy support)
 * - Semantic search and vector-based knowledge retrieval
 * - Real-time knowledge base updates and event-driven pattern recognition
 * - Comprehensive monitoring, anomaly detection, and temporal analysis
 */
async function startServer(): Promise<void> {
  const server: FastifyInstance = fastify({
    logger: {
      level: config.app.logLevel,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
    trustProxy: true,
    disableRequestLogging: config.app.environment === 'production',
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  });

  try {
    // Register plugins
    await registerPlugins(server);

    // Apply security middleware
    await server.register(securityMiddleware);

    // Initialize core services
    const knowledgeGraphService = new KnowledgeGraphService();
    const neo4jService = knowledgeGraphService.getNeo4jService();
    
    // Initialize advanced business intelligence services
    const businessIntelligenceService = new BusinessIntelligenceService(neo4jService);
    const recommendationEngine = new RecommendationEngine(neo4jService);
    const patternRecognitionService = new PatternRecognitionService(neo4jService);
    const graphAnalyticsService = new GraphAnalyticsService(knowledgeGraphService);
    
    // Legacy curriculum learning service (for backward compatibility)
    const curriculumLearningService = new CurriculumLearningService(knowledgeGraphService);

    // Store services in server context
    server.decorate('knowledgeGraph', knowledgeGraphService);
    server.decorate('businessIntelligence', businessIntelligenceService);
    server.decorate('recommendationEngine', recommendationEngine);
    server.decorate('patternRecognition', patternRecognitionService);
    server.decorate('graphAnalytics', graphAnalyticsService);
    server.decorate('curriculumLearning', curriculumLearningService);

    // Initialize services in dependency order
    await knowledgeGraphService.initialize();
    await businessIntelligenceService.initialize();
    await recommendationEngine.initialize();
    await patternRecognitionService.initialize();
    await graphAnalyticsService.initialize();
    await curriculumLearningService.initialize();

    // Register GraphQL schema
    await server.register(GraphQLSchema);

    // Register REST API routes
    await registerRoutes(server);

    // Add global error handler
    server.setErrorHandler(async (error, request, reply) => {
      logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        requestId: request.id,
        method: request.method,
        url: request.url,
      });

      const statusCode = error.statusCode || 500;
      const message = statusCode === 500 ? 'Internal Server Error' : error.message;

      return reply.status(statusCode).send({
        error: {
          message,
          statusCode,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      });
    });

    // Add graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      
      try {
        // Shutdown services in reverse dependency order
        await curriculumLearningService.shutdown();
        await graphAnalyticsService.shutdown();
        await patternRecognitionService.shutdown();
        await recommendationEngine.shutdown();
        await businessIntelligenceService.shutdown();
        await knowledgeGraphService.shutdown();
        await server.close();
        logger.info('Server shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Start server
    const port = config.knowledgeGraph?.port || 3007;
    const host = config.app.environment === 'production' ? '0.0.0.0' : '127.0.0.1';

    await server.listen({ port, host });

    logger.info('Comprehensive Knowledge Graph Service started successfully', {
      port,
      host,
      environment: config.app.environment,
      neo4jConnected: await knowledgeGraphService.healthCheck(),
      businessIntelligence: businessIntelligenceService.isInitialized(),
      recommendationEngine: recommendationEngine.isInitialized(),
      patternRecognition: patternRecognitionService.isInitialized(),
      graphAnalytics: graphAnalyticsService.isInitialized(),
      curriculumEngine: curriculumLearningService.isInitialized(),
      capabilities: [
        'Business Intelligence Analytics',
        'Real-time Recommendations',
        'Pattern Recognition & Discovery',
        'Advanced Graph Analytics',
        'Community Detection',
        'Influence Propagation Analysis',
        'Anomaly Detection',
        'Temporal Analysis'
      ]
    });

  } catch (error) {
    logger.error('Failed to start Knowledge Graph Service', { error });
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.fatal('Uncaught Exception', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

// Start the service
startServer().catch((error) => {
  logger.fatal('Failed to start service', { error });
  process.exit(1);
});

// Export for testing
export { startServer };