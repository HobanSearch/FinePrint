import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { z } from 'zod';

const logger = createServiceLogger('bi-dashboard-routes');

// Request/Response schemas
const GetDashboardSchema = z.object({
  timeframe: z.enum(['1d', '7d', '30d', '90d', '1y']).optional().default('30d'),
  filters: z.record(z.any()).optional(),
  refresh: z.boolean().optional().default(false),
});

const GetAnalyticsSchema = z.object({
  type: z.enum(['customer_journey', 'attribution', 'conversion_funnel', 'cohort_analysis', 'segmentation']),
  timeframe: z.string().optional().default('30d'),
  params: z.record(z.any()).optional(),
});

const GetPredictiveSchema = z.object({
  type: z.enum(['revenue', 'churn', 'conversion', 'expansion', 'usage']),
  horizon: z.number().min(1).max(365).optional().default(30),
  confidence: z.number().min(0).max(100).optional().default(80),
});

const GetImpactAnalysisSchema = z.object({
  initiative: z.string(),
  type: z.enum(['feature', 'campaign', 'process', 'tool', 'strategy']).optional(),
  investment: z.number().optional(),
  timeline: z.number().optional(), // months
});

const GetExecutiveReportSchema = z.object({
  period: z.enum(['week', 'month', 'quarter']),
  format: z.enum(['summary', 'detailed']).optional().default('summary'),
  sections: z.array(z.string()).optional(),
});

interface GetDashboardRequest extends FastifyRequest {
  Querystring: z.infer<typeof GetDashboardSchema>;
}

interface GetAnalyticsRequest extends FastifyRequest {
  Body: z.infer<typeof GetAnalyticsSchema>;
}

interface GetPredictiveRequest extends FastifyRequest {
  Body: z.infer<typeof GetPredictiveSchema>;
}

interface GetImpactAnalysisRequest extends FastifyRequest {
  Body: z.infer<typeof GetImpactAnalysisSchema>;
}

interface GetExecutiveReportRequest extends FastifyRequest {
  Querystring: z.infer<typeof GetExecutiveReportSchema>;
}

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  // Get integrated business dashboard
  fastify.get('/', {
    schema: {
      tags: ['dashboard'],
      summary: 'Get integrated business dashboard',
      description: 'Retrieve comprehensive business intelligence dashboard with cross-functional metrics',
      querystring: {
        type: 'object',
        properties: {
          timeframe: { type: 'string', enum: ['1d', '7d', '30d', '90d', '1y'] },
          filters: { type: 'object' },
          refresh: { type: 'boolean' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            overview: { type: 'object' },
            revenue: { type: 'object' },
            customers: { type: 'object' },
            sales: { type: 'object' },
            marketing: { type: 'object' },
            support: { type: 'object' },
            insights: { type: 'array', items: { type: 'object' } },
            alerts: { type: 'array', items: { type: 'object' } },
            generatedAt: { type: 'string' },
          },
        },
      },
    },
  }, async (request: GetDashboardRequest, reply: FastifyReply) => {
    try {
      const { timeframe, filters, refresh } = GetDashboardSchema.parse(request.query);
      
      // Clear cache if refresh requested
      if (refresh) {
        await clearDashboardCache(timeframe, filters);
      }

      const dashboard = await fastify.businessIntelligence.getIntegratedDashboard(timeframe, filters);
      
      logger.info('Integrated dashboard retrieved', { 
        timeframe, 
        userId: (request as any).user?.id,
        insightsCount: dashboard.insights.length,
        alertsCount: dashboard.alerts.length,
      });

      return {
        ...dashboard,
        generatedAt: new Date().toISOString(),
      };

    } catch (error) {
      logger.error('Failed to get integrated dashboard', { error });
      throw error;
    }
  });

  // Get cross-function analytics
  fastify.post('/analytics', {
    schema: {
      tags: ['dashboard'],
      summary: 'Get cross-function analytics',
      description: 'Perform advanced cross-functional business analytics',
      body: {
        type: 'object',
        required: ['type'],
        properties: {
          type: { type: 'string', enum: ['customer_journey', 'attribution', 'conversion_funnel', 'cohort_analysis', 'segmentation'] },
          timeframe: { type: 'string' },
          params: { type: 'object' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            analysisType: { type: 'string' },
            data: { type: 'object' },
            insights: { type: 'array', items: { type: 'string' } },
            recommendations: { type: 'array', items: { type: 'string' } },
            confidence: { type: 'number' },
            generatedAt: { type: 'string' },
          },
        },
      },
    },
  }, async (request: GetAnalyticsRequest, reply: FastifyReply) => {
    try {
      const { type, timeframe, params } = GetAnalyticsSchema.parse(request.body);
      
      const analysisData = await fastify.businessIntelligence.getCrossFunctionAnalytics(type, {
        timeframe,
        ...params,
      });
      
      // Generate insights and recommendations based on analysis
      const insights = await generateAnalyticsInsights(type, analysisData);
      const recommendations = await generateAnalyticsRecommendations(type, analysisData);
      
      logger.info('Cross-function analytics completed', { 
        type, 
        timeframe,
        userId: (request as any).user?.id,
        insightsCount: insights.length,
      });

      return {
        analysisType: type,
        data: analysisData,
        insights,
        recommendations,
        confidence: calculateAnalysisConfidence(analysisData),
        generatedAt: new Date().toISOString(),
      };

    } catch (error) {
      logger.error('Failed to perform cross-function analytics', { error });
      throw error;
    }
  });

  // Get predictive insights
  fastify.post('/predictive', {
    schema: {
      tags: ['dashboard'],
      summary: 'Get predictive insights',
      description: 'Generate predictive analytics and forecasting insights',
      body: {
        type: 'object',
        required: ['type'],
        properties: {
          type: { type: 'string', enum: ['revenue', 'churn', 'conversion', 'expansion', 'usage'] },
          horizon: { type: 'number', minimum: 1, maximum: 365 },
          confidence: { type: 'number', minimum: 0, maximum: 100 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            predictionType: { type: 'string' },
            predictions: { type: 'array', items: { type: 'object' } },
            confidence: { type: 'number' },
            factors: { type: 'array', items: { type: 'object' } },
            recommendations: { type: 'array', items: { type: 'string' } },
            horizon: { type: 'number' },
            generatedAt: { type: 'string' },
          },
        },
      },
    },
  }, async (request: GetPredictiveRequest, reply: FastifyReply) => {
    try {
      const { type, horizon, confidence: minConfidence } = GetPredictiveSchema.parse(request.body);
      
      const predictiveInsights = await fastify.businessIntelligence.getPredictiveInsights(type, horizon);
      
      // Filter predictions by confidence threshold
      const filteredPredictions = predictiveInsights.predictions.filter(
        prediction => prediction.confidence >= (minConfidence || 0)
      );
      
      logger.info('Predictive insights generated', { 
        type, 
        horizon,
        predictionsCount: filteredPredictions.length,
        confidence: predictiveInsights.confidence,
        userId: (request as any).user?.id,
      });

      return {
        predictionType: type,
        predictions: filteredPredictions,
        confidence: predictiveInsights.confidence,
        factors: predictiveInsights.factors,
        recommendations: predictiveInsights.recommendations,
        horizon,
        generatedAt: new Date().toISOString(),
      };

    } catch (error) {
      logger.error('Failed to generate predictive insights', { error });
      throw error;
    }
  });

  // Get business impact analysis
  fastify.post('/impact-analysis', {
    schema: {
      tags: ['dashboard'],
      summary: 'Get business impact analysis',
      description: 'Analyze business impact of initiatives and investments',
      body: {
        type: 'object',
        required: ['initiative'],
        properties: {
          initiative: { type: 'string' },
          type: { type: 'string', enum: ['feature', 'campaign', 'process', 'tool', 'strategy'] },
          investment: { type: 'number' },
          timeline: { type: 'number' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            initiative: { type: 'string' },
            type: { type: 'string' },
            impact: { type: 'object' },
            roi: { type: 'object' },
            risks: { type: 'array', items: { type: 'object' } },
            timeline: { type: 'object' },
            generatedAt: { type: 'string' },
          },
        },
      },
    },
  }, async (request: GetImpactAnalysisRequest, reply: FastifyReply) => {
    try {
      const { initiative, type, investment, timeline } = GetImpactAnalysisSchema.parse(request.body);
      
      const impactAnalysis = await fastify.businessIntelligence.getBusinessImpactAnalysis(initiative, {
        type,
        investment,
        timeline,
      });
      
      logger.info('Business impact analysis completed', { 
        initiative, 
        type,
        roi: impactAnalysis.roi.return,
        userId: (request as any).user?.id,
      });

      return {
        ...impactAnalysis,
        generatedAt: new Date().toISOString(),
      };

    } catch (error) {
      logger.error('Failed to analyze business impact', { error });
      throw error;
    }
  });

  // Get executive report
  fastify.get('/executive-report', {
    schema: {
      tags: ['dashboard'],
      summary: 'Get executive report',
      description: 'Generate executive summary report with key business insights',
      querystring: {
        type: 'object',
        required: ['period'],
        properties: {
          period: { type: 'string', enum: ['week', 'month', 'quarter'] },
          format: { type: 'string', enum: ['summary', 'detailed'] },
          sections: { type: 'array', items: { type: 'string' } },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            period: { type: 'string' },
            summary: { type: 'object' },
            sections: { type: 'array', items: { type: 'object' } },
            appendix: { type: 'object' },
            generatedAt: { type: 'string' },
          },
        },
      },
    },
  }, async (request: GetExecutiveReportRequest, reply: FastifyReply) => {
    try {
      const { period, format, sections } = GetExecutiveReportSchema.parse(request.query);
      
      const report = await fastify.businessIntelligence.getExecutiveReport(period, format);
      
      // Filter sections if specific sections requested
      let filteredReport = report;
      if (sections && sections.length > 0) {
        filteredReport = {
          ...report,
          sections: report.sections.filter(section => 
            sections.includes(section.title.toLowerCase())
          ),
        };
      }
      
      logger.info('Executive report generated', { 
        period, 
        format,
        sectionsCount: filteredReport.sections.length,
        userId: (request as any).user?.id,
      });

      return {
        ...filteredReport,
        generatedAt: new Date().toISOString(),
      };

    } catch (error) {
      logger.error('Failed to generate executive report', { error });
      throw error;
    }
  });

  // Get automated insights
  fastify.get('/insights', {
    schema: {
      tags: ['dashboard'],
      summary: 'Get automated insights',
      description: 'Retrieve AI-generated business insights and recommendations',
      querystring: {
        type: 'object',
        properties: {
          timeframe: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 100 },
          minConfidence: { type: 'number', minimum: 0, maximum: 100 },
          type: { type: 'string', enum: ['cross_functional', 'predictive', 'comparative', 'causal'] },
        },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              confidence: { type: 'number' },
              impact: { type: 'object' },
              recommendations: { type: 'array', items: { type: 'object' } },
              createdAt: { type: 'string' },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ 
    Querystring: { 
      timeframe?: string; 
      limit?: number; 
      minConfidence?: number; 
      type?: string; 
    } 
  }>, reply: FastifyReply) => {
    try {
      const { timeframe = '7d', limit = 20, minConfidence = 70, type } = request.query;
      
      const allInsights = await fastify.businessIntelligence.getAutomatedInsights(timeframe);
      
      // Apply filters
      let filteredInsights = allInsights;
      
      if (type) {
        filteredInsights = filteredInsights.filter(insight => insight.type === type);
      }
      
      filteredInsights = filteredInsights
        .filter(insight => insight.confidence >= minConfidence)
        .slice(0, limit);
      
      logger.info('Automated insights retrieved', { 
        timeframe, 
        limit,
        minConfidence,
        type,
        totalInsights: filteredInsights.length,
        userId: (request as any).user?.id,
      });

      return filteredInsights;

    } catch (error) {
      logger.error('Failed to get automated insights', { error });
      throw error;
    }
  });

  // Get system metrics
  fastify.get('/system-metrics', {
    schema: {
      tags: ['dashboard'],
      summary: 'Get system metrics',
      description: 'Retrieve system performance and health metrics',
      response: {
        200: {
          type: 'object',
          properties: {
            performance: { type: 'object' },
            resources: { type: 'object' },
            connections: { type: 'object' },
            timestamp: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const systemMetrics = await fastify.businessIntelligence.getSystemMetrics();
      
      logger.info('System metrics retrieved', { 
        userId: (request as any).user?.id,
        performanceScore: systemMetrics.performance.responseTime,
      });

      return {
        ...systemMetrics,
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      logger.error('Failed to get system metrics', { error });
      throw error;
    }
  });
};

// Helper functions
async function clearDashboardCache(timeframe: string, filters?: Record<string, any>): Promise<void> {
  // Implementation to clear dashboard cache
  // This would invalidate cached dashboard data
}

async function generateAnalyticsInsights(type: string, data: any): Promise<string[]> {
  const insights: string[] = [];
  
  // Generate insights based on analysis type and data
  switch (type) {
    case 'customer_journey':
      if (data.totalValue > 0) {
        insights.push(`Average customer journey value is $${data.totalValue.toLocaleString()}`);
      }
      if (data.conversionRate < 50) {
        insights.push('Conversion rate is below average - consider optimizing key touchpoints');
      }
      break;
    
    case 'attribution':
      if (data.primaryChannel) {
        insights.push(`${data.primaryChannel} is the primary attribution channel`);
      }
      break;
    
    default:
      insights.push('Analysis completed successfully');
  }
  
  return insights;
}

async function generateAnalyticsRecommendations(type: string, data: any): Promise<string[]> {
  const recommendations: string[] = [];
  
  // Generate recommendations based on analysis results
  switch (type) {
    case 'customer_journey':
      recommendations.push('Focus on improving high-impact touchpoints');
      recommendations.push('Implement targeted nurturing campaigns for drop-off stages');
      break;
    
    case 'conversion_funnel':
      recommendations.push('Optimize funnel stages with highest drop-off rates');
      recommendations.push('A/B test improvements to increase conversion rates');
      break;
    
    default:
      recommendations.push('Continue monitoring key metrics');
  }
  
  return recommendations;
}

function calculateAnalysisConfidence(data: any): number {
  // Calculate confidence score based on data quality and completeness
  let confidence = 50; // Base confidence
  
  if (data && typeof data === 'object') {
    const dataPoints = Object.keys(data).length;
    confidence += Math.min(40, dataPoints * 2); // Add up to 40 points for data richness
    
    // Add points for data recency and completeness
    if (data.timestamp && new Date(data.timestamp) > new Date(Date.now() - 86400000)) {
      confidence += 10; // Recent data
    }
  }
  
  return Math.min(100, confidence);
}