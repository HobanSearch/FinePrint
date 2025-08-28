/**
 * Outcomes API Routes
 * Endpoints for recording and analyzing business outcomes
 */

import { FastifyPluginAsync } from 'fastify';
import { 
  RecordBusinessOutcomeRequest,
  RecordBusinessOutcomeResponse,
  QueryBusinessOutcomesRequest,
  QueryBusinessOutcomesResponse 
} from '../types/api';
import { BusinessDomain, BusinessOutcome } from '../types/learning';

export const outcomeRoutes: FastifyPluginAsync = async function (fastify) {
  
  // Record a new business outcome
  fastify.post<{
    Body: RecordBusinessOutcomeRequest;
    Reply: RecordBusinessOutcomeResponse;
  }>('/', {
    schema: {
      tags: ['outcomes'],
      summary: 'Record a business outcome',
      description: 'Records a business outcome that will be used for learning and optimization',
      body: {
        type: 'object',
        required: ['promptId', 'domain', 'metrics', 'context', 'success'],
        properties: {
          promptId: {
            type: 'string',
            description: 'ID of the prompt that generated this outcome'
          },
          domain: {
            type: 'string',
            enum: Object.values(BusinessDomain),
            description: 'Business domain this outcome belongs to'
          },
          metrics: {
            type: 'object',
            description: 'Business metrics associated with this outcome',
            properties: {
              revenue: {
                type: 'object',
                properties: {
                  amount: { type: 'number' },
                  currency: { type: 'string' },
                  conversionRate: { type: 'number' },
                  lifetimeValue: { type: 'number' }
                }
              },
              satisfaction: {
                type: 'object',
                properties: {
                  score: { type: 'number', minimum: 1, maximum: 10 },
                  nps: { type: 'number', minimum: -100, maximum: 100 },
                  responseTime: { type: 'number' },
                  resolutionRate: { type: 'number', minimum: 0, maximum: 1 }
                }
              },
              performance: {
                type: 'object',
                properties: {
                  accuracy: { type: 'number', minimum: 0, maximum: 1 },
                  precision: { type: 'number', minimum: 0, maximum: 1 },
                  recall: { type: 'number', minimum: 0, maximum: 1 },
                  f1Score: { type: 'number', minimum: 0, maximum: 1 },
                  responseTime: { type: 'number' }
                }
              },
              engagement: {
                type: 'object',
                properties: {
                  clickThroughRate: { type: 'number', minimum: 0, maximum: 1 },
                  conversionRate: { type: 'number', minimum: 0, maximum: 1 },
                  bounceRate: { type: 'number', minimum: 0, maximum: 1 },
                  timeOnPage: { type: 'number' },
                  userRetention: { type: 'number', minimum: 0, maximum: 1 }
                }
              },
              cost: {
                type: 'object',
                properties: {
                  operationalCost: { type: 'number' },
                  computeCost: { type: 'number' },
                  humanIntervention: { type: 'boolean' },
                  escalationRate: { type: 'number', minimum: 0, maximum: 1 }
                }
              }
            }
          },
          context: {
            type: 'object',
            description: 'Contextual information about the outcome',
            properties: {
              userId: { type: 'string' },
              sessionId: { type: 'string' },
              customerSegment: { type: 'string' },
              productCategory: { type: 'string' },
              timeOfDay: { type: 'string' },
              dayOfWeek: { type: 'string' },
              seasonality: { type: 'string' },
              marketConditions: { type: 'string' },
              userBehaviorPattern: { type: 'string' },
              previousInteractions: { type: 'number' },
              deviceType: { type: 'string' },
              location: { type: 'string' },
              referralSource: { type: 'string' }
            }
          },
          success: {
            type: 'boolean',
            description: 'Whether this outcome represents a success or failure'
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Confidence level in this outcome measurement'
          },
          metadata: {
            type: 'object',
            description: 'Additional metadata about the outcome'
          }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                promptId: { type: 'string' },
                domain: { type: 'string' },
                timestamp: { type: 'string', format: 'date-time' },
                success: { type: 'boolean' },
                confidence: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const startTime = Date.now();
    
    try {
      // Create outcome object
      const outcome = await fastify.learningOrchestrator.recordBusinessOutcome({
        promptId: request.body.promptId,
        domain: request.body.domain,
        metrics: request.body.metrics,
        context: request.body.context,
        success: request.body.success,
        confidence: request.body.confidence || 0.8,
        metadata: request.body.metadata,
      });

      const response: RecordBusinessOutcomeResponse = {
        success: true,
        data: outcome,
        metadata: {
          requestId: request.id,
          timestamp: new Date(),
          processingTime: Date.now() - startTime,
          version: '1.0.0',
        },
      };

      reply.status(201).send(response);

    } catch (error) {
      fastify.log.error('Failed to record business outcome', { error, requestBody: request.body });
      
      reply.status(500).send({
        success: false,
        error: {
          code: 'OUTCOME_RECORDING_FAILED',
          message: 'Failed to record business outcome',
          details: { originalError: error.message },
          timestamp: new Date(),
          requestId: request.id,
        }
      });
    }
  });

  // Query business outcomes with filtering and aggregation
  fastify.get<{
    Querystring: QueryBusinessOutcomesRequest;
    Reply: QueryBusinessOutcomesResponse;
  }>('/', {
    schema: {
      tags: ['outcomes'],
      summary: 'Query business outcomes',
      description: 'Retrieves business outcomes with filtering, pagination, and aggregation options',
      querystring: {
        type: 'object',
        properties: {
          domain: {
            type: 'string',
            enum: Object.values(BusinessDomain),
            description: 'Filter by business domain'
          },
          promptId: {
            type: 'string',
            description: 'Filter by specific prompt ID'
          },
          dateFrom: {
            type: 'string',
            format: 'date-time',
            description: 'Filter outcomes from this date'
          },
          dateTo: {
            type: 'string',
            format: 'date-time',
            description: 'Filter outcomes to this date'
          },
          successOnly: {
            type: 'boolean',
            description: 'Only return successful outcomes'
          },
          minConfidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Minimum confidence threshold'
          },
          page: {
            type: 'number',
            minimum: 1,
            default: 1,
            description: 'Page number'
          },
          pageSize: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            default: 20,
            description: 'Items per page'
          },
          aggregation: {
            type: 'object',
            description: 'Aggregation parameters',
            properties: {
              groupBy: {
                type: 'array',
                items: { type: 'string' },
                description: 'Fields to group by'
              },
              metrics: {
                type: 'array',
                items: { type: 'string' },
                description: 'Metrics to aggregate'
              },
              timeGranularity: {
                type: 'string',
                enum: ['hour', 'day', 'week', 'month'],
                description: 'Time aggregation granularity'
              }
            }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  promptId: { type: 'string' },
                  domain: { type: 'string' },
                  timestamp: { type: 'string', format: 'date-time' },
                  success: { type: 'boolean' },
                  confidence: { type: 'number' },
                  metrics: { type: 'object' },
                  context: { type: 'object' }
                }
              }
            },
            aggregations: { type: 'object' },
            insights: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const startTime = Date.now();
    
    try {
      const {
        domain,
        promptId,
        dateFrom,
        dateTo,
        successOnly,
        minConfidence,
        page = 1,
        pageSize = 20,
        aggregation
      } = request.query;

      // Get outcomes from integration manager
      const outcomes = await fastify.integrationManager.getHistoricalOutcomes({
        domain,
        startDate: dateFrom ? new Date(dateFrom) : undefined,
        endDate: dateTo ? new Date(dateTo) : undefined,
        limit: pageSize * page, // For simplicity, get more than needed
      });

      // Apply filters
      let filteredOutcomes = outcomes;
      
      if (promptId) {
        filteredOutcomes = filteredOutcomes.filter(o => o.promptId === promptId);
      }
      
      if (successOnly !== undefined) {
        filteredOutcomes = filteredOutcomes.filter(o => o.success === successOnly);
      }
      
      if (minConfidence !== undefined) {
        filteredOutcomes = filteredOutcomes.filter(o => o.confidence >= minConfidence);
      }

      // Paginate
      const startIndex = (page - 1) * pageSize;
      const paginatedOutcomes = filteredOutcomes.slice(startIndex, startIndex + pageSize);

      // Calculate aggregations if requested
      let aggregations = {};
      if (aggregation) {
        aggregations = calculateAggregations(filteredOutcomes, aggregation);
      }

      // Generate insights
      const insights = generateOutcomeInsights(filteredOutcomes);

      const response: QueryBusinessOutcomesResponse = {
        success: true,
        data: paginatedOutcomes,
        aggregations,
        insights,
        metadata: {
          requestId: request.id,
          timestamp: new Date(),
          processingTime: Date.now() - startTime,
          version: '1.0.0',
          pagination: {
            page,
            pageSize,
            totalItems: filteredOutcomes.length,
            totalPages: Math.ceil(filteredOutcomes.length / pageSize),
            hasNext: startIndex + pageSize < filteredOutcomes.length,
            hasPrevious: page > 1,
          },
        },
      };

      reply.send(response);

    } catch (error) {
      fastify.log.error('Failed to query business outcomes', { error, query: request.query });
      
      reply.status(500).send({
        success: false,
        error: {
          code: 'OUTCOME_QUERY_FAILED',
          message: 'Failed to query business outcomes',
          timestamp: new Date(),
          requestId: request.id,
        }
      });
    }
  });

  // Get outcome analytics for a specific domain
  fastify.get<{
    Params: { domain: BusinessDomain };
    Querystring: { timeframe?: string; metrics?: string };
  }>('/analytics/:domain', {
    schema: {
      tags: ['outcomes'],
      summary: 'Get outcome analytics for domain',
      description: 'Retrieves analytical insights for outcomes in a specific domain',
      params: {
        type: 'object',
        required: ['domain'],
        properties: {
          domain: {
            type: 'string',
            enum: Object.values(BusinessDomain)
          }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          timeframe: {
            type: 'string',
            enum: ['7d', '30d', '90d', '1y'],
            default: '30d',
            description: 'Analysis timeframe'
          },
          metrics: {
            type: 'string',
            description: 'Comma-separated list of metrics to analyze'
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { domain } = request.params;
      const { timeframe = '30d', metrics } = request.query;

      // Get domain state from business outcome learner
      const domainState = fastify.businessOutcomeLearner.getDomainState(domain);
      
      if (!domainState) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'DOMAIN_NOT_FOUND',
            message: `No data found for domain: ${domain}`,
            timestamp: new Date(),
            requestId: request.id,
          }
        });
      }

      // Get patterns for the domain
      const patterns = fastify.businessOutcomeLearner.getDomainPatterns(domain);

      const analytics = {
        domain,
        timeframe,
        summary: {
          totalOutcomes: domainState.totalOutcomes,
          successRate: domainState.successRate,
          trendDirection: domainState.trendAnalysis.direction,
          confidence: domainState.trendAnalysis.confidence,
        },
        metrics: domainState.averageMetrics,
        trends: domainState.trendAnalysis,
        patterns: {
          total: patterns.length,
          validated: patterns.filter(p => p.status === 'validated').length,
          topPatterns: patterns
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 5)
            .map(p => ({
              id: p.id,
              confidence: p.confidence,
              sampleSize: p.sampleSize,
              successRate: p.outcomes.successRate,
            })),
        },
        performanceGains: domainState.performanceGains,
        recommendations: generateDomainRecommendations(domainState, patterns),
      };

      reply.send({
        success: true,
        data: analytics,
        metadata: {
          requestId: request.id,
          timestamp: new Date(),
          version: '1.0.0',
        },
      });

    } catch (error) {
      fastify.log.error('Failed to get outcome analytics', { error, domain: request.params.domain });
      
      reply.status(500).send({
        success: false,
        error: {
          code: 'ANALYTICS_FAILED',
          message: 'Failed to retrieve outcome analytics',
          timestamp: new Date(),
          requestId: request.id,
        }
      });
    }
  });

  // Get outcome details by ID
  fastify.get<{
    Params: { outcomeId: string };
  }>('/:outcomeId', {
    schema: {
      tags: ['outcomes'],
      summary: 'Get outcome details',
      description: 'Retrieves detailed information about a specific outcome',
      params: {
        type: 'object',
        required: ['outcomeId'],
        properties: {
          outcomeId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const outcome = await fastify.integrationManager.getOutcome(request.params.outcomeId);
      
      if (!outcome) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'OUTCOME_NOT_FOUND',
            message: `Outcome not found: ${request.params.outcomeId}`,
            timestamp: new Date(),
            requestId: request.id,
          }
        });
      }

      reply.send({
        success: true,
        data: outcome,
        metadata: {
          requestId: request.id,
          timestamp: new Date(),
          version: '1.0.0',
        },
      });

    } catch (error) {
      fastify.log.error('Failed to get outcome details', { error, outcomeId: request.params.outcomeId });
      
      reply.status(500).send({
        success: false,
        error: {
          code: 'OUTCOME_RETRIEVAL_FAILED',
          message: 'Failed to retrieve outcome details',
          timestamp: new Date(),
          requestId: request.id,
        }
      });
    }
  });

  // Batch record outcomes
  fastify.post<{
    Body: { outcomes: RecordBusinessOutcomeRequest[] };
  }>('/batch', {
    schema: {
      tags: ['outcomes'],
      summary: 'Batch record outcomes',
      description: 'Records multiple business outcomes in a single request',
      body: {
        type: 'object',
        required: ['outcomes'],
        properties: {
          outcomes: {
            type: 'array',
            items: {
              type: 'object',
              required: ['promptId', 'domain', 'metrics', 'context', 'success'],
              properties: {
                promptId: { type: 'string' },
                domain: { type: 'string', enum: Object.values(BusinessDomain) },
                metrics: { type: 'object' },
                context: { type: 'object' },
                success: { type: 'boolean' },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                metadata: { type: 'object' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const results = [];
      const errors = [];

      // Process each outcome
      for (let i = 0; i < request.body.outcomes.length; i++) {
        try {
          const outcomeRequest = request.body.outcomes[i];
          const outcome = await fastify.learningOrchestrator.recordBusinessOutcome({
            promptId: outcomeRequest.promptId,
            domain: outcomeRequest.domain,
            metrics: outcomeRequest.metrics,
            context: outcomeRequest.context,
            success: outcomeRequest.success,
            confidence: outcomeRequest.confidence || 0.8,
            metadata: outcomeRequest.metadata,
          });
          
          results.push({ index: i, outcome });
        } catch (error) {
          errors.push({ 
            index: i, 
            error: error.message,
            outcome: request.body.outcomes[i]
          });
        }
      }

      reply.send({
        success: errors.length === 0,
        data: {
          processed: results.length,
          failed: errors.length,
          results,
          errors: errors.length > 0 ? errors : undefined,
        },
        metadata: {
          requestId: request.id,
          timestamp: new Date(),
          version: '1.0.0',
        },
      });

    } catch (error) {
      fastify.log.error('Failed to batch record outcomes', { error });
      
      reply.status(500).send({
        success: false,
        error: {
          code: 'BATCH_RECORDING_FAILED',
          message: 'Failed to batch record outcomes',
          timestamp: new Date(),
          requestId: request.id,
        }
      });
    }
  });
};

// Helper functions
function calculateAggregations(outcomes: BusinessOutcome[], aggregation: any): Record<string, any> {
  const aggregations: Record<string, any> = {};
  
  if (aggregation.groupBy && aggregation.groupBy.length > 0) {
    // Group outcomes by specified fields
    const groups = new Map<string, BusinessOutcome[]>();
    
    outcomes.forEach(outcome => {
      const groupKey = aggregation.groupBy
        .map((field: string) => getNestedValue(outcome, field))
        .join('|');
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(outcome);
    });

    // Calculate aggregated metrics for each group
    for (const [groupKey, groupOutcomes] of groups) {
      aggregations[groupKey] = {
        count: groupOutcomes.length,
        successRate: groupOutcomes.filter(o => o.success).length / groupOutcomes.length,
        averageConfidence: groupOutcomes.reduce((sum, o) => sum + o.confidence, 0) / groupOutcomes.length,
      };
    }
  }

  return aggregations;
}

function generateOutcomeInsights(outcomes: BusinessOutcome[]): string[] {
  const insights: string[] = [];
  
  if (outcomes.length === 0) {
    return insights;
  }

  const successRate = outcomes.filter(o => o.success).length / outcomes.length;
  const avgConfidence = outcomes.reduce((sum, o) => sum + o.confidence, 0) / outcomes.length;
  
  if (successRate > 0.8) {
    insights.push(`High success rate detected: ${(successRate * 100).toFixed(1)}%`);
  } else if (successRate < 0.5) {
    insights.push(`Low success rate detected: ${(successRate * 100).toFixed(1)}% - optimization recommended`);
  }
  
  if (avgConfidence < 0.6) {
    insights.push(`Low average confidence: ${avgConfidence.toFixed(2)} - data quality may need improvement`);
  }

  // Domain-specific insights
  const domainCounts = new Map<BusinessDomain, number>();
  outcomes.forEach(outcome => {
    domainCounts.set(outcome.domain, (domainCounts.get(outcome.domain) || 0) + 1);
  });

  if (domainCounts.size > 1) {
    const topDomain = Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])[0];
    insights.push(`Most active domain: ${topDomain[0]} (${topDomain[1]} outcomes)`);
  }

  return insights;
}

function generateDomainRecommendations(domainState: any, patterns: any[]): string[] {
  const recommendations: string[] = [];
  
  if (domainState.successRate < 0.7) {
    recommendations.push('Success rate below 70% - consider emergency optimization');
  }
  
  if (domainState.trendAnalysis.direction === 'declining') {
    recommendations.push('Performance declining - review recent changes and patterns');
  }
  
  if (patterns.length < 3) {
    recommendations.push('Few patterns identified - collect more training data');
  }
  
  const validatedPatterns = patterns.filter(p => p.status === 'validated').length;
  if (validatedPatterns > 0) {
    recommendations.push(`${validatedPatterns} validated patterns ready for deployment`);
  }

  return recommendations;
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}