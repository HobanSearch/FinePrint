/**
 * Patterns API Routes
 * Endpoints for pattern discovery, validation, and management
 */

import { FastifyPluginAsync } from 'fastify';
import { 
  DiscoverPatternsRequest,
  DiscoverPatternsResponse,
  GetPatternDetailsResponse,
  UpdatePatternRequest,
  UpdatePatternResponse 
} from '../types/api';
import { BusinessDomain, PatternStatus } from '../types/learning';

export const patternRoutes: FastifyPluginAsync = async function (fastify) {
  
  // Discover patterns from outcomes
  fastify.post<{
    Body: DiscoverPatternsRequest;
    Reply: DiscoverPatternsResponse;
  }>('/discover', {
    schema: {
      tags: ['patterns'],
      summary: 'Discover patterns from outcomes',
      description: 'Analyzes business outcomes to discover successful patterns',
      body: {
        type: 'object',
        properties: {
          domain: {
            type: 'string',
            enum: Object.values(BusinessDomain),
            description: 'Specific domain to analyze (optional)'
          },
          minSampleSize: {
            type: 'number',
            minimum: 10,
            default: 50,
            description: 'Minimum sample size for pattern validation'
          },
          minConfidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            default: 0.7,
            description: 'Minimum confidence threshold for patterns'
          },
          timeWindow: {
            type: 'object',
            properties: {
              start: { type: 'string', format: 'date-time' },
              end: { type: 'string', format: 'date-time' }
            },
            description: 'Time window for pattern analysis'
          },
          contextFilters: {
            type: 'object',
            description: 'Context filters to apply during analysis'
          },
          includeInactive: {
            type: 'boolean',
            default: false,
            description: 'Include inactive/deprecated patterns'
          }
        }
      }
    }
  }, async (request, reply) => {
    const startTime = Date.now();
    
    try {
      // Get recent outcomes for pattern analysis
      const outcomes = await fastify.integrationManager.getHistoricalOutcomes({
        domain: request.body.domain,
        startDate: request.body.timeWindow?.start ? new Date(request.body.timeWindow.start) : undefined,
        endDate: request.body.timeWindow?.end ? new Date(request.body.timeWindow.end) : undefined,
        limit: 10000, // Large limit for comprehensive analysis
      });

      if (outcomes.length === 0) {
        return reply.send({
          success: true,
          data: [],
          insights: {
            totalPatterns: 0,
            newPatterns: 0,
            improvedPatterns: 0,
            recommendations: ['No outcomes available for pattern analysis. Record more business outcomes to enable pattern discovery.'],
          },
          metadata: {
            requestId: request.id,
            timestamp: new Date(),
            processingTime: Date.now() - startTime,
            version: '1.0.0',
          },
        });
      }

      // Analyze outcomes for patterns
      const analysisResult = await fastify.patternEngine.analyzeOutcomes(outcomes);

      const response: DiscoverPatternsResponse = {
        success: true,
        data: analysisResult.patternsDiscovered,
        insights: {
          totalPatterns: analysisResult.patternsDiscovered.length + analysisResult.patternsUpdated.length,
          newPatterns: analysisResult.patternsDiscovered.length,
          improvedPatterns: analysisResult.patternsUpdated.length,
          recommendations: generatePatternRecommendations(analysisResult),
        },
        metadata: {
          requestId: request.id,
          timestamp: new Date(),
          processingTime: Date.now() - startTime,
          version: '1.0.0',
        },
      };

      reply.send(response);

    } catch (error) {
      fastify.log.error('Failed to discover patterns', { error, requestBody: request.body });
      
      reply.status(500).send({
        success: false,
        error: {
          code: 'PATTERN_DISCOVERY_FAILED',
          message: 'Failed to discover patterns from outcomes',
          details: { originalError: error.message },
          timestamp: new Date(),
          requestId: request.id,
        }
      });
    }
  });

  // Get all patterns for a domain
  fastify.get<{
    Params: { domain: BusinessDomain };
    Querystring: { 
      status?: string; 
      minConfidence?: number; 
      sortBy?: string; 
      sortOrder?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    };
  }>('/domain/:domain', {
    schema: {
      tags: ['patterns'],
      summary: 'Get patterns for domain',
      description: 'Retrieves all patterns for a specific business domain',
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
          status: {
            type: 'string',
            enum: Object.values(PatternStatus),
            description: 'Filter by pattern status'
          },
          minConfidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Minimum confidence threshold'
          },
          sortBy: {
            type: 'string',
            enum: ['confidence', 'sampleSize', 'createdAt', 'lastUpdated'],
            default: 'confidence',
            description: 'Sort field'
          },
          sortOrder: {
            type: 'string',
            enum: ['asc', 'desc'],
            default: 'desc',
            description: 'Sort order'
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
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { domain } = request.params;
      const { 
        status, 
        minConfidence, 
        sortBy = 'confidence', 
        sortOrder = 'desc',
        page = 1,
        pageSize = 20 
      } = request.query;

      // Get patterns from pattern engine
      let patterns = fastify.patternEngine.getValidatedPatterns(domain);

      // Apply filters
      if (status) {
        patterns = patterns.filter(p => p.status === status);
      }

      if (minConfidence !== undefined) {
        patterns = patterns.filter(p => p.confidence >= minConfidence);
      }

      // Sort patterns
      patterns.sort((a, b) => {
        const aVal = getPatternSortValue(a, sortBy);
        const bVal = getPatternSortValue(b, sortBy);
        
        if (sortOrder === 'asc') {
          return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        } else {
          return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        }
      });

      // Paginate
      const totalItems = patterns.length;
      const totalPages = Math.ceil(totalItems / pageSize);
      const startIndex = (page - 1) * pageSize;
      const paginatedPatterns = patterns.slice(startIndex, startIndex + pageSize);

      reply.send({
        success: true,
        data: paginatedPatterns,
        metadata: {
          requestId: request.id,
          timestamp: new Date(),
          version: '1.0.0',
          pagination: {
            page,
            pageSize,
            totalItems,
            totalPages,
            hasNext: page < totalPages,
            hasPrevious: page > 1,
          },
        },
      });

    } catch (error) {
      fastify.log.error('Failed to get domain patterns', { error, domain: request.params.domain });
      
      reply.status(500).send({
        success: false,
        error: {
          code: 'PATTERN_RETRIEVAL_FAILED',
          message: 'Failed to retrieve domain patterns',
          timestamp: new Date(),
          requestId: request.id,
        }
      });
    }
  });

  // Get detailed pattern information
  fastify.get<{
    Params: { patternId: string };
    Reply: GetPatternDetailsResponse;
  }>('/:patternId', {
    schema: {
      tags: ['patterns'],
      summary: 'Get pattern details',
      description: 'Retrieves detailed information about a specific pattern',
      params: {
        type: 'object',
        required: ['patternId'],
        properties: {
          patternId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Get pattern from storage (would integrate with memory service)
      const pattern = await fastify.integrationManager.getPattern?.(request.params.patternId);
      
      if (!pattern) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'PATTERN_NOT_FOUND',
            message: `Pattern not found: ${request.params.patternId}`,
            timestamp: new Date(),
            requestId: request.id,
          }
        });
      }

      // Get pattern performance history
      const performanceHistory = fastify.patternEngine.getPatternHistory(request.params.patternId);

      // Get related patterns (simplified - would use similarity analysis)
      const relatedPatterns = fastify.patternEngine.getValidatedPatterns(pattern.domain)
        .filter(p => p.id !== pattern.id)
        .slice(0, 5)
        .map(p => p.id);

      // Generate training examples for this pattern (mock implementation)
      const examples = []; // Would generate from pattern data

      const response: GetPatternDetailsResponse = {
        success: true,
        data: {
          pattern,
          examples,
          performance: {
            historicalMetrics: performanceHistory.length > 0 ? 
              {
                confidence: performanceHistory.map(h => ({ timestamp: h.timestamp, value: h.confidence })),
                successRate: performanceHistory.map(h => ({ timestamp: h.timestamp, value: h.successRate })),
                sampleSize: performanceHistory.map(h => ({ timestamp: h.timestamp, value: h.sampleSize })),
              } : {},
            trendAnalysis: analyzeTrend(performanceHistory),
            relatedPatterns,
          },
        },
        metadata: {
          requestId: request.id,
          timestamp: new Date(),
          version: '1.0.0',
        },
      };

      reply.send(response);

    } catch (error) {
      fastify.log.error('Failed to get pattern details', { error, patternId: request.params.patternId });
      
      reply.status(500).send({
        success: false,
        error: {
          code: 'PATTERN_DETAILS_FAILED',
          message: 'Failed to retrieve pattern details',
          timestamp: new Date(),
          requestId: request.id,
        }
      });
    }
  });

  // Update pattern status or configuration
  fastify.patch<{
    Params: { patternId: string };
    Body: UpdatePatternRequest;
    Reply: UpdatePatternResponse;
  }>('/:patternId', {
    schema: {
      tags: ['patterns'],
      summary: 'Update pattern',
      description: 'Updates pattern status, conditions, or other properties',
      params: {
        type: 'object',
        required: ['patternId'],
        properties: {
          patternId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['active', 'inactive', 'testing'],
            description: 'New pattern status'
          },
          conditions: {
            type: 'object',
            description: 'Updated pattern conditions'
          },
          notes: {
            type: 'string',
            description: 'Notes about the update'
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Get current pattern
      const pattern = await fastify.integrationManager.getPattern?.(request.params.patternId);
      
      if (!pattern) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'PATTERN_NOT_FOUND',
            message: `Pattern not found: ${request.params.patternId}`,
            timestamp: new Date(),
            requestId: request.id,
          }
        });
      }

      // Update pattern properties
      if (request.body.status) {
        const statusMapping = {
          'active': PatternStatus.ACTIVE,
          'inactive': PatternStatus.DEPRECATED,
          'testing': PatternStatus.TESTING,
        };
        pattern.status = statusMapping[request.body.status] || pattern.status;
      }

      if (request.body.conditions) {
        pattern.conditions = { ...pattern.conditions, ...request.body.conditions };
      }

      pattern.lastUpdated = new Date();

      // Store updated pattern
      await fastify.integrationManager.storePattern(pattern);

      const response: UpdatePatternResponse = {
        success: true,
        data: pattern,
        metadata: {
          requestId: request.id,
          timestamp: new Date(),
          version: '1.0.0',
        },
      };

      reply.send(response);

    } catch (error) {
      fastify.log.error('Failed to update pattern', { error, patternId: request.params.patternId });
      
      reply.status(500).send({
        success: false,
        error: {
          code: 'PATTERN_UPDATE_FAILED',
          message: 'Failed to update pattern',
          timestamp: new Date(),
          requestId: request.id,
        }
      });
    }
  });

  // Validate a pattern
  fastify.post<{
    Params: { patternId: string };
  }>('/:patternId/validate', {
    schema: {
      tags: ['patterns'],
      summary: 'Validate pattern',
      description: 'Validates a pattern against current performance standards',
      params: {
        type: 'object',
        required: ['patternId'],
        properties: {
          patternId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const validationResult = await fastify.patternEngine.validatePattern(request.params.patternId);

      reply.send({
        success: true,
        data: validationResult,
        metadata: {
          requestId: request.id,
          timestamp: new Date(),
          version: '1.0.0',
        },
      });

    } catch (error) {
      fastify.log.error('Failed to validate pattern', { error, patternId: request.params.patternId });
      
      reply.status(500).send({
        success: false,
        error: {
          code: 'PATTERN_VALIDATION_FAILED',
          message: 'Failed to validate pattern',
          timestamp: new Date(),
          requestId: request.id,
        }
      });
    }
  });

  // Get pattern performance analytics
  fastify.get<{
    Params: { patternId: string };
    Querystring: { timeframe?: string };
  }>('/:patternId/analytics', {
    schema: {
      tags: ['patterns'],
      summary: 'Get pattern analytics',
      description: 'Retrieves performance analytics for a specific pattern',
      params: {
        type: 'object',
        required: ['patternId'],
        properties: {
          patternId: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          timeframe: {
            type: 'string',
            enum: ['7d', '30d', '90d'],
            default: '30d',
            description: 'Analytics timeframe'
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { patternId } = request.params;
      const { timeframe = '30d' } = request.query;

      const performanceHistory = fastify.patternEngine.getPatternHistory(patternId);
      
      if (performanceHistory.length === 0) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NO_ANALYTICS_DATA',
            message: 'No analytics data available for this pattern',
            timestamp: new Date(),
            requestId: request.id,
          }
        });
      }

      // Filter by timeframe
      const cutoffDate = new Date();
      const timeframeDays = {
        '7d': 7,
        '30d': 30,
        '90d': 90,
      };
      cutoffDate.setDate(cutoffDate.getDate() - timeframeDays[timeframe]);

      const filteredHistory = performanceHistory.filter(h => h.timestamp >= cutoffDate);

      const analytics = {
        patternId,
        timeframe,
        dataPoints: filteredHistory.length,
        summary: {
          averageConfidence: filteredHistory.reduce((sum, h) => sum + h.confidence, 0) / filteredHistory.length,
          averageSuccessRate: filteredHistory.reduce((sum, h) => sum + h.successRate, 0) / filteredHistory.length,
          totalSampleSize: filteredHistory[filteredHistory.length - 1]?.sampleSize || 0,
        },
        trends: {
          confidence: analyzeTrend(filteredHistory.map(h => ({ timestamp: h.timestamp, value: h.confidence }))),
          successRate: analyzeTrend(filteredHistory.map(h => ({ timestamp: h.timestamp, value: h.successRate }))),
        },
        performanceHistory: filteredHistory,
        insights: generatePatternInsights(filteredHistory),
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
      fastify.log.error('Failed to get pattern analytics', { error, patternId: request.params.patternId });
      
      reply.status(500).send({
        success: false,
        error: {
          code: 'PATTERN_ANALYTICS_FAILED',
          message: 'Failed to retrieve pattern analytics',
          timestamp: new Date(),
          requestId: request.id,
        }
      });
    }
  });

  // Delete a pattern
  fastify.delete<{
    Params: { patternId: string };
    Body: { reason: string };
  }>('/:patternId', {
    schema: {
      tags: ['patterns'],
      summary: 'Delete pattern',
      description: 'Marks a pattern as deprecated and removes it from active use',
      params: {
        type: 'object',
        required: ['patternId'],
        properties: {
          patternId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: {
            type: 'string',
            description: 'Reason for deleting the pattern'
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const pattern = await fastify.integrationManager.getPattern?.(request.params.patternId);
      
      if (!pattern) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'PATTERN_NOT_FOUND',
            message: `Pattern not found: ${request.params.patternId}`,
            timestamp: new Date(),
            requestId: request.id,
          }
        });
      }

      // Mark as deprecated instead of hard delete
      pattern.status = PatternStatus.DEPRECATED;
      pattern.lastUpdated = new Date();

      await fastify.integrationManager.storePattern(pattern);

      reply.send({
        success: true,
        data: {
          patternId: request.params.patternId,
          status: 'deprecated',
          reason: request.body.reason,
          deprecatedAt: new Date(),
        },
        metadata: {
          requestId: request.id,
          timestamp: new Date(),
          version: '1.0.0',
        },
      });

    } catch (error) {
      fastify.log.error('Failed to delete pattern', { error, patternId: request.params.patternId });
      
      reply.status(500).send({
        success: false,
        error: {
          code: 'PATTERN_DELETION_FAILED',
          message: 'Failed to delete pattern',
          timestamp: new Date(),
          requestId: request.id,
        }
      });
    }
  });
};

// Helper functions
function generatePatternRecommendations(analysisResult: any): string[] {
  const recommendations: string[] = [];
  
  if (analysisResult.patternsDiscovered.length > 0) {
    recommendations.push(`${analysisResult.patternsDiscovered.length} new patterns discovered. Review and validate for deployment.`);
  }
  
  if (analysisResult.patternsUpdated.length > 0) {
    recommendations.push(`${analysisResult.patternsUpdated.length} existing patterns updated with new data.`);
  }
  
  if (analysisResult.patternsDeprecated.length > 0) {
    recommendations.push(`${analysisResult.patternsDeprecated.length} patterns deprecated due to poor performance.`);
  }
  
  if (analysisResult.crossDomainInsights.length > 0) {
    recommendations.push(`${analysisResult.crossDomainInsights.length} cross-domain learning opportunities identified.`);
  }

  if (recommendations.length === 0) {
    recommendations.push('No significant pattern changes detected. Continue monitoring outcome quality.');
  }

  return recommendations;
}

function getPatternSortValue(pattern: any, sortBy: string): any {
  switch (sortBy) {
    case 'confidence':
      return pattern.confidence;
    case 'sampleSize':
      return pattern.sampleSize;
    case 'createdAt':
      return pattern.createdAt.getTime();
    case 'lastUpdated':
      return pattern.lastUpdated.getTime();
    default:
      return pattern.confidence;
  }
}

function analyzeTrend(dataPoints: { timestamp: Date; value: number }[]): any {
  if (dataPoints.length < 2) {
    return { direction: 'stable', strength: 0, confidence: 0 };
  }

  // Simple linear trend analysis
  const sortedPoints = dataPoints.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const firstValue = sortedPoints[0].value;
  const lastValue = sortedPoints[sortedPoints.length - 1].value;
  const change = (lastValue - firstValue) / firstValue;
  
  const direction = Math.abs(change) < 0.05 ? 'stable' : (change > 0 ? 'improving' : 'declining');
  const strength = Math.min(1, Math.abs(change));
  const confidence = sortedPoints.length > 10 ? 0.8 : 0.5;

  return { direction, strength, confidence, change };
}

function generatePatternInsights(performanceHistory: any[]): string[] {
  const insights: string[] = [];
  
  if (performanceHistory.length === 0) {
    return insights;
  }

  const latest = performanceHistory[performanceHistory.length - 1];
  const earliest = performanceHistory[0];

  if (latest.confidence > 0.9) {
    insights.push('High confidence pattern - ready for production deployment');
  } else if (latest.confidence < 0.5) {
    insights.push('Low confidence - pattern may need more training data');
  }

  if (latest.sampleSize > 100) {
    insights.push('Good sample size - pattern is statistically significant');
  } else {
    insights.push('Small sample size - collect more data for better validation');
  }

  if (performanceHistory.length > 5) {
    const trend = analyzeTrend(performanceHistory.map(h => ({ 
      timestamp: h.timestamp, 
      value: h.successRate 
    })));
    
    if (trend.direction === 'improving') {
      insights.push('Success rate improving over time');
    } else if (trend.direction === 'declining') {
      insights.push('Success rate declining - review pattern conditions');
    }
  }

  return insights;
}