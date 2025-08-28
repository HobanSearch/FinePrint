/**
 * Main Routes for Business Agents API
 */

import { FastifyInstance } from 'fastify';
import { 
  MarketingGenerateSchema,
  SalesQualifySchema,
  SupportRespondSchema,
  AnalyticsAnalyzeSchema,
  DigitalTwinTestSchema,
  ImprovementCycleSchema,
  AgentType
} from '../types';
import { marketingController } from '../controllers/marketing.controller';
import { salesController } from '../controllers/sales.controller';
import { supportController } from '../controllers/support.controller';
import { analyticsController } from '../controllers/analytics.controller';
import { performanceService } from '../services/performance.service';
import { ollamaService } from '../services/ollama.service';
import { cacheService } from '../services/cache.service';
import { websocketService } from '../services/websocket.service';
import { authenticateRequest, requireTier, AuthenticatedRequest } from '../middleware/auth.middleware';
import { rateLimitMiddleware, createEndpointRateLimit } from '../middleware/rate-limit.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { asyncErrorHandler } from '../middleware/error.middleware';
import { createLogger } from '../utils/logger';
import { config } from '../config';

const logger = createLogger('routes');

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Health check endpoint
  fastify.get('/health', async (request, reply) => {
    const health = performanceService.getHealthStatus();
    const wsStats = websocketService.getConnectionStats();

    reply.send({
      status: health.healthy ? 'healthy' : 'unhealthy',
      service: config.service.name,
      version: config.service.version,
      agents: health.agents,
      websocket: wsStats,
      timestamp: new Date()
    });
  });

  // Marketing endpoints
  fastify.post(
    '/api/agents/marketing/generate',
    {
      preHandler: [
        authenticateRequest,
        rateLimitMiddleware,
        validateBody(MarketingGenerateSchema)
      ]
    },
    asyncErrorHandler(async (request, reply) => {
      const perfId = performanceService.startOperation(AgentType.MARKETING, 'generate');
      
      try {
        await marketingController.generateContent(request, reply);
        performanceService.endOperation(perfId, true);
      } catch (error) {
        performanceService.endOperation(perfId, false, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
      }
    })
  );

  // Sales endpoints
  fastify.post(
    '/api/agents/sales/qualify',
    {
      preHandler: [
        authenticateRequest,
        rateLimitMiddleware,
        validateBody(SalesQualifySchema)
      ]
    },
    asyncErrorHandler(async (request, reply) => {
      const perfId = performanceService.startOperation(AgentType.SALES, 'qualify');
      
      try {
        await salesController.qualifyLead(request, reply);
        performanceService.endOperation(perfId, true);
      } catch (error) {
        performanceService.endOperation(perfId, false, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
      }
    })
  );

  // Support endpoints
  fastify.post(
    '/api/agents/support/respond',
    {
      preHandler: [
        authenticateRequest,
        rateLimitMiddleware,
        validateBody(SupportRespondSchema)
      ]
    },
    asyncErrorHandler(async (request, reply) => {
      const perfId = performanceService.startOperation(AgentType.SUPPORT, 'respond');
      
      try {
        await supportController.generateResponse(request, reply);
        performanceService.endOperation(perfId, true);
      } catch (error) {
        performanceService.endOperation(perfId, false, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
      }
    })
  );

  // Analytics endpoints
  fastify.post(
    '/api/agents/analytics/analyze',
    {
      preHandler: [
        authenticateRequest,
        rateLimitMiddleware,
        validateBody(AnalyticsAnalyzeSchema)
      ]
    },
    asyncErrorHandler(async (request, reply) => {
      const perfId = performanceService.startOperation(AgentType.ANALYTICS, 'analyze');
      
      try {
        await analyticsController.analyzeData(request, reply);
        performanceService.endOperation(perfId, true);
      } catch (error) {
        performanceService.endOperation(perfId, false, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
      }
    })
  );

  // Performance metrics endpoint
  fastify.get(
    '/api/agents/performance',
    {
      preHandler: [authenticateRequest]
    },
    async (request: AuthenticatedRequest, reply) => {
      const agentType = (request.query as any)?.agent as AgentType;
      const metrics = performanceService.getMetrics(agentType);
      
      reply.send({
        metrics,
        cacheStats: cacheService.getStats(),
        timestamp: new Date()
      });
    }
  );

  // Digital Twin test endpoint
  fastify.post(
    '/api/agents/test',
    {
      preHandler: [
        authenticateRequest,
        requireTier('PROFESSIONAL' as any),
        validateBody(DigitalTwinTestSchema)
      ]
    },
    asyncErrorHandler(async (request, reply) => {
      const { body } = request;
      
      // Simulate digital twin testing
      const testResult = {
        id: require('uuid').v4(),
        agentType: body.agentType,
        scenario: body.scenario.name,
        results: {
          passed: true,
          iterations: body.iterations,
          successRate: 0.95,
          averageAccuracy: 0.92,
          performanceMetrics: {
            avgResponseTime: 250,
            minResponseTime: 150,
            maxResponseTime: 450,
            p95ResponseTime: 380
          },
          outputs: [],
          errors: []
        },
        recommendations: [
          'Consider fine-tuning for edge cases',
          'Optimize response caching strategy'
        ],
        metadata: {
          testedAt: new Date(),
          environment: body.environment,
          modelVersion: '1.0.0'
        }
      };

      // Broadcast test results
      websocketService.broadcastTestResult(body.agentType, testResult);

      reply.send(testResult);
    })
  );

  // Improvement cycle endpoint
  fastify.post(
    '/api/agents/improve',
    {
      preHandler: [
        authenticateRequest,
        requireTier('ENTERPRISE' as any),
        validateBody(ImprovementCycleSchema)
      ]
    },
    asyncErrorHandler(async (request, reply) => {
      const { body } = request;
      
      // Simulate improvement cycle
      const improvementResult = {
        id: require('uuid').v4(),
        agentType: body.agentType,
        status: 'initiated' as const,
        improvements: [
          {
            metricName: body.targetMetric,
            before: body.currentPerformance,
            after: body.targetPerformance * 0.9, // Simulate partial improvement
            improvement: (body.targetPerformance * 0.9) - body.currentPerformance,
            percentageChange: ((body.targetPerformance * 0.9 - body.currentPerformance) / body.currentPerformance) * 100
          }
        ],
        modelChanges: {
          previousVersion: '1.0.0',
          newVersion: '1.1.0',
          changeLog: [
            'Fine-tuned on new training data',
            'Optimized prompt engineering',
            'Adjusted temperature settings'
          ]
        },
        validationResults: {
          accuracy: 0.93,
          precision: 0.91,
          recall: 0.94,
          f1Score: 0.925
        },
        metadata: {
          startedAt: new Date(),
          resourcesUsed: {
            cpu: 85,
            memory: 4096,
            gpu: 50
          }
        }
      };

      // Broadcast improvement status
      websocketService.broadcastAgentUpdate(body.agentType, {
        type: 'improvement_cycle',
        data: improvementResult
      });

      reply.send(improvementResult);
    })
  );

  // Model versions endpoint
  fastify.get(
    '/api/agents/versions',
    {
      preHandler: [authenticateRequest]
    },
    asyncErrorHandler(async (request, reply) => {
      const versions = await Promise.all(
        Object.values(AgentType).map(async (agentType) => {
          try {
            const info = await ollamaService.getModelInfo(agentType);
            return {
              agentType,
              model: info.name,
              version: '1.0.0',
              lastUpdated: new Date(),
              status: 'active'
            };
          } catch (error) {
            return {
              agentType,
              model: `fine-print-${agentType}`,
              version: '1.0.0',
              lastUpdated: new Date(),
              status: 'error',
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        })
      );

      reply.send({
        versions,
        timestamp: new Date()
      });
    })
  );

  // Cache management endpoints (admin only)
  fastify.post(
    '/api/agents/cache/invalidate',
    {
      preHandler: [
        authenticateRequest,
        requireTier('ENTERPRISE' as any)
      ]
    },
    async (request, reply) => {
      const { agentType, operation, params } = request.body as any;
      
      await cacheService.invalidate(agentType, operation, params);
      
      reply.send({
        success: true,
        message: 'Cache invalidated',
        agentType,
        operation,
        timestamp: new Date()
      });
    }
  );

  fastify.post(
    '/api/agents/cache/flush',
    {
      preHandler: [
        authenticateRequest,
        requireTier('ENTERPRISE' as any)
      ]
    },
    async (request, reply) => {
      await cacheService.flush();
      
      reply.send({
        success: true,
        message: 'All cache flushed',
        timestamp: new Date()
      });
    }
  );

  // WebSocket stats endpoint
  fastify.get(
    '/api/agents/websocket/stats',
    {
      preHandler: [authenticateRequest]
    },
    async (request, reply) => {
      const stats = websocketService.getConnectionStats();
      
      reply.send({
        ...stats,
        timestamp: new Date()
      });
    }
  );

  logger.info('All routes registered successfully');
}