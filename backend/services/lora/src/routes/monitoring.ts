import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { ModelPerformanceMonitor } from '../services/model-performance-monitor';
import { ABTestingManager } from '../services/ab-testing-manager';
import Redis from 'ioredis';

const monitoringRoutes: FastifyPluginAsync = async (fastify) => {
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD
  });

  const performanceMonitor = new ModelPerformanceMonitor(redis);
  const abTestingManager = new ABTestingManager(redis, performanceMonitor);

  // Get model metrics
  fastify.get('/metrics/:adapterId', {
    schema: {
      params: Type.Object({
        adapterId: Type.String()
      }),
      response: {
        200: Type.Object({
          adapterId: Type.String(),
          totalRequests: Type.Number(),
          avgResponseTime: Type.Number(),
          avgTokensGenerated: Type.Number(),
          errorRate: Type.Number(),
          userSatisfactionScore: Type.Number(),
          lastUsed: Type.String(),
          dailyMetrics: Type.Array(Type.Object({
            date: Type.String(),
            requests: Type.Number(),
            avgResponseTime: Type.Number(),
            errors: Type.Number(),
            feedbackScores: Type.Array(Type.Number())
          }))
        })
      }
    }
  }, async (request, reply) => {
    const { adapterId } = request.params;
    const metrics = await performanceMonitor.getModelMetrics(adapterId);
    return metrics;
  });

  // Compare models
  fastify.post('/metrics/compare', {
    schema: {
      body: Type.Object({
        baselineId: Type.String(),
        challengerId: Type.String()
      }),
      response: {
        200: Type.Object({
          baselineModel: Type.String(),
          challengerModel: Type.String(),
          metrics: Type.Object({
            avgResponseTime: Type.Object({
              baseline: Type.Number(),
              challenger: Type.Number(),
              improvement: Type.Number()
            }),
            errorRate: Type.Object({
              baseline: Type.Number(),
              challenger: Type.Number(),
              improvement: Type.Number()
            }),
            userSatisfaction: Type.Object({
              baseline: Type.Number(),
              challenger: Type.Number(),
              improvement: Type.Number()
            }),
            tokensPerSecond: Type.Object({
              baseline: Type.Number(),
              challenger: Type.Number(),
              improvement: Type.Number()
            })
          }),
          recommendation: Type.Union([
            Type.Literal('keep_baseline'),
            Type.Literal('switch_to_challenger'),
            Type.Literal('need_more_data')
          ]),
          confidence: Type.Number()
        })
      }
    }
  }, async (request, reply) => {
    const { baselineId, challengerId } = request.body;
    const comparison = await performanceMonitor.compareModels(baselineId, challengerId);
    return comparison;
  });

  // Get performance trends
  fastify.get('/metrics/:adapterId/trends', {
    schema: {
      params: Type.Object({
        adapterId: Type.String()
      }),
      querystring: Type.Object({
        days: Type.Optional(Type.Number({ minimum: 1, maximum: 30 }))
      }),
      response: {
        200: Type.Object({
          dates: Type.Array(Type.String()),
          avgResponseTimes: Type.Array(Type.Number()),
          errorRates: Type.Array(Type.Number()),
          requestCounts: Type.Array(Type.Number()),
          satisfactionScores: Type.Array(Type.Number())
        })
      }
    }
  }, async (request, reply) => {
    const { adapterId } = request.params;
    const { days = 7 } = request.query;
    const trends = await performanceMonitor.getPerformanceTrends(adapterId, days);
    return trends;
  });

  // Get top performing models
  fastify.get('/metrics/top-performers', {
    schema: {
      querystring: Type.Object({
        domain: Type.Optional(Type.String()),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 20 }))
      }),
      response: {
        200: Type.Array(Type.Object({
          adapterId: Type.String(),
          totalRequests: Type.Number(),
          avgResponseTime: Type.Number(),
          avgTokensGenerated: Type.Number(),
          errorRate: Type.Number(),
          userSatisfactionScore: Type.Number()
        }))
      }
    }
  }, async (request, reply) => {
    const { domain, limit = 5 } = request.query;
    const topModels = await performanceMonitor.getTopPerformingModels(domain, limit);
    return topModels;
  });

  // Record user feedback
  fastify.post('/metrics/feedback', {
    schema: {
      body: Type.Object({
        adapterId: Type.String(),
        requestId: Type.String(),
        score: Type.Number({ minimum: 1, maximum: 5 })
      }),
      response: {
        200: Type.Object({
          success: Type.Boolean()
        })
      }
    }
  }, async (request, reply) => {
    const { adapterId, requestId, score } = request.body;
    await performanceMonitor.recordUserFeedback(adapterId, requestId, score);
    return { success: true };
  });

  // Export metrics
  fastify.get('/metrics/:adapterId/export', {
    schema: {
      params: Type.Object({
        adapterId: Type.String()
      }),
      querystring: Type.Object({
        format: Type.Optional(Type.Union([Type.Literal('json'), Type.Literal('csv')]))
      })
    }
  }, async (request, reply) => {
    const { adapterId } = request.params;
    const { format = 'json' } = request.query;
    
    const exported = await performanceMonitor.exportMetrics(adapterId, format);
    
    if (format === 'csv') {
      reply.type('text/csv');
      reply.header('Content-Disposition', `attachment; filename="${adapterId}-metrics.csv"`);
    } else {
      reply.type('application/json');
      reply.header('Content-Disposition', `attachment; filename="${adapterId}-metrics.json"`);
    }
    
    return exported;
  });

  // Create A/B test
  fastify.post('/ab-tests', {
    schema: {
      body: Type.Object({
        name: Type.String(),
        domain: Type.String(),
        baselineModel: Type.String(),
        challengerModels: Type.Array(Type.String()),
        trafficAllocation: Type.Optional(Type.Object({
          baseline: Type.Number({ minimum: 0, maximum: 100 }),
          challengers: Type.Record(Type.String(), Type.Number())
        })),
        config: Type.Optional(Type.Object({
          minSampleSize: Type.Optional(Type.Number()),
          maxDuration: Type.Optional(Type.Number()),
          confidenceLevel: Type.Optional(Type.Number()),
          primaryMetric: Type.Optional(Type.Union([
            Type.Literal('response_time'),
            Type.Literal('error_rate'),
            Type.Literal('user_satisfaction'),
            Type.Literal('composite')
          ])),
          autoStop: Type.Optional(Type.Boolean()),
          autoPromote: Type.Optional(Type.Boolean())
        }))
      }),
      response: {
        200: Type.Object({
          testId: Type.String(),
          name: Type.String(),
          domain: Type.String(),
          status: Type.String(),
          startDate: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const test = await abTestingManager.createABTest(request.body);
    return {
      testId: test.testId,
      name: test.name,
      domain: test.domain,
      status: test.status,
      startDate: test.startDate.toISOString()
    };
  });

  // Get A/B test status
  fastify.get('/ab-tests/:testId', {
    schema: {
      params: Type.Object({
        testId: Type.String()
      })
    }
  }, async (request, reply) => {
    const { testId } = request.params;
    const test = await abTestingManager.getTestStatus(testId);
    
    if (!test) {
      return reply.code(404).send({ error: 'Test not found' });
    }
    
    return test;
  });

  // Stop A/B test
  fastify.post('/ab-tests/:testId/stop', {
    schema: {
      params: Type.Object({
        testId: Type.String()
      }),
      body: Type.Object({
        reason: Type.Optional(Type.String())
      })
    }
  }, async (request, reply) => {
    const { testId } = request.params;
    const { reason } = request.body;
    
    try {
      const result = await abTestingManager.stopTest(testId, reason);
      return result;
    } catch (error) {
      return reply.code(404).send({ error: 'Test not found' });
    }
  });

  // Get active A/B tests
  fastify.get('/ab-tests', {
    schema: {
      querystring: Type.Object({
        domain: Type.Optional(Type.String())
      })
    }
  }, async (request, reply) => {
    const { domain } = request.query;
    const tests = await abTestingManager.getActiveTests(domain);
    return { tests };
  });

  // Record conversion
  fastify.post('/ab-tests/:testId/conversion', {
    schema: {
      params: Type.Object({
        testId: Type.String()
      }),
      body: Type.Object({
        modelId: Type.String(),
        value: Type.Optional(Type.Number())
      })
    }
  }, async (request, reply) => {
    const { testId } = request.params;
    const { modelId, value = 1 } = request.body;
    
    await abTestingManager.recordConversion(testId, modelId, value);
    return { success: true };
  });

  // Get model for request (for routing)
  fastify.post('/ab-tests/route', {
    schema: {
      body: Type.Object({
        domain: Type.String(),
        userId: Type.Optional(Type.String())
      }),
      response: {
        200: Type.Object({
          model: Type.String(),
          testId: Type.Optional(Type.String())
        })
      }
    }
  }, async (request, reply) => {
    const { domain, userId } = request.body;
    const model = await abTestingManager.getModelForRequest(domain, userId);
    
    // Find active test if any
    const activeTests = await abTestingManager.getActiveTests(domain);
    const testId = activeTests.length > 0 ? activeTests[0].testId : undefined;
    
    return { model, testId };
  });

  // Cleanup on shutdown
  fastify.addHook('onClose', async () => {
    await abTestingManager.cleanup();
    await redis.quit();
  });
};

export default monitoringRoutes;