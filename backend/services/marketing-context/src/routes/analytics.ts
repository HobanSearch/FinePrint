import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { z } from 'zod';

const logger = createServiceLogger('marketing-analytics-routes');

// Request/Response schemas
const GetDashboardSchema = z.object({
  timeframe: z.enum(['7d', '30d', '90d', '1y']).optional().default('30d'),
  segments: z.array(z.string()).optional(),
  campaigns: z.array(z.string()).optional(),
});

const GetInsightsSchema = z.object({
  type: z.enum(['performance', 'optimization', 'prediction', 'anomaly']).optional(),
  limit: z.number().min(1).max(100).optional().default(20),
  minConfidence: z.number().min(0).max(100).optional().default(70),
});

const TrackEventSchema = z.object({
  eventType: z.string(),
  properties: z.record(z.any()),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});

const CampaignMetricsSchema = z.object({
  campaignId: z.string(),
  metrics: z.object({
    impressions: z.number().optional(),
    clicks: z.number().optional(),
    conversions: z.number().optional(),
    spend: z.number().optional(),
  }),
});

const AnalyticsQuerySchema = z.object({
  metrics: z.array(z.string()),
  dimensions: z.array(z.string()).optional(),
  filters: z.record(z.any()).optional(),
  timeRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  granularity: z.enum(['hour', 'day', 'week', 'month']).optional().default('day'),
});

interface GetDashboardRequest extends FastifyRequest {
  Querystring: z.infer<typeof GetDashboardSchema>;
}

interface GetInsightsRequest extends FastifyRequest {
  Querystring: z.infer<typeof GetInsightsSchema>;
}

interface TrackEventRequest extends FastifyRequest {
  Body: z.infer<typeof TrackEventSchema>;
}

interface CampaignMetricsRequest extends FastifyRequest {
  Body: z.infer<typeof CampaignMetricsSchema>;
}

interface AnalyticsQueryRequest extends FastifyRequest {
  Body: z.infer<typeof AnalyticsQuerySchema>;
}

export const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  // Get marketing dashboard
  fastify.get('/dashboard', {
    schema: {
      tags: ['analytics'],
      summary: 'Get marketing dashboard',
      description: 'Retrieve comprehensive marketing dashboard with key metrics and insights',
      querystring: {
        type: 'object',
        properties: {
          timeframe: { type: 'string', enum: ['7d', '30d', '90d', '1y'] },
          segments: { type: 'array', items: { type: 'string' } },
          campaigns: { type: 'array', items: { type: 'string' } },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            campaigns: { type: 'object' },
            audience: { type: 'object' },
            content: { type: 'object' },
            attribution: { type: 'object' },
            predictions: { type: 'object' },
          },
        },
      },
    },
  }, async (request: GetDashboardRequest, reply: FastifyReply) => {
    try {
      const { timeframe, segments, campaigns } = GetDashboardSchema.parse(request.query);
      
      const dashboard = await fastify.marketingContext.getMarketingDashboard(timeframe);
      
      // Apply filters if provided
      let filteredDashboard = dashboard;
      if (segments?.length || campaigns?.length) {
        // Filter dashboard data based on segments and campaigns
        filteredDashboard = await filterDashboardData(dashboard, { segments, campaigns });
      }

      logger.info('Marketing dashboard retrieved', { 
        timeframe, 
        userId: (request as any).user?.id,
        segmentsCount: segments?.length || 0,
        campaignsCount: campaigns?.length || 0,
      });

      return filteredDashboard;

    } catch (error) {
      logger.error('Failed to get marketing dashboard', { error });
      throw error;
    }
  });

  // Get marketing insights
  fastify.get('/insights', {
    schema: {
      tags: ['analytics'],
      summary: 'Get marketing insights',
      description: 'Retrieve AI-generated marketing insights and recommendations',
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['performance', 'optimization', 'prediction', 'anomaly'] },
          limit: { type: 'number', minimum: 1, maximum: 100 },
          minConfidence: { type: 'number', minimum: 0, maximum: 100 },
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
              impact: { type: 'string' },
              confidence: { type: 'number' },
              actionItems: { type: 'array', items: { type: 'string' } },
              createdAt: { type: 'string' },
            },
          },
        },
      },
    },
  }, async (request: GetInsightsRequest, reply: FastifyReply) => {
    try {
      const { type, limit, minConfidence } = GetInsightsSchema.parse(request.query);
      
      const allInsights = await fastify.marketingContext.generateMarketingInsights();
      
      // Filter insights based on criteria
      let filteredInsights = allInsights;
      if (type) {
        filteredInsights = filteredInsights.filter(insight => insight.type === type);
      }
      
      filteredInsights = filteredInsights
        .filter(insight => insight.confidence >= minConfidence)
        .slice(0, limit);

      logger.info('Marketing insights retrieved', { 
        type, 
        limit, 
        minConfidence,
        totalInsights: filteredInsights.length,
        userId: (request as any).user?.id,
      });

      return filteredInsights;

    } catch (error) {
      logger.error('Failed to get marketing insights', { error });
      throw error;
    }
  });

  // Track marketing event
  fastify.post('/track', {
    schema: {
      tags: ['analytics'],
      summary: 'Track marketing event',
      description: 'Track marketing events for analytics and attribution',
      body: {
        type: 'object',
        required: ['eventType', 'properties'],
        properties: {
          eventType: { type: 'string' },
          properties: { type: 'object' },
          userId: { type: 'string' },
          sessionId: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            eventId: { type: 'string' },
            tracked: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request: TrackEventRequest, reply: FastifyReply) => {
    try {
      const eventData = TrackEventSchema.parse(request.body);
      
      const eventId = await trackMarketingEvent(eventData);
      
      logger.info('Marketing event tracked', { 
        eventType: eventData.eventType,
        eventId,
        userId: eventData.userId || (request as any).user?.id,
      });

      return {
        eventId,
        tracked: true,
      };

    } catch (error) {
      logger.error('Failed to track marketing event', { error });
      throw error;
    }
  });

  // Update campaign metrics
  fastify.post('/campaigns/metrics', {
    schema: {
      tags: ['analytics'],
      summary: 'Update campaign metrics',
      description: 'Update campaign performance metrics for real-time tracking',
      body: {
        type: 'object',
        required: ['campaignId', 'metrics'],
        properties: {
          campaignId: { type: 'string' },
          metrics: {
            type: 'object',
            properties: {
              impressions: { type: 'number' },
              clicks: { type: 'number' },
              conversions: { type: 'number' },
              spend: { type: 'number' },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            updated: { type: 'boolean' },
            insights: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  }, async (request: CampaignMetricsRequest, reply: FastifyReply) => {
    try {
      const { campaignId, metrics } = CampaignMetricsSchema.parse(request.body);
      
      await fastify.marketingContext.trackCampaignPerformance(campaignId, metrics);
      
      // Generate immediate insights if metrics show significant changes
      const insights = await generateMetricInsights(campaignId, metrics);
      
      logger.info('Campaign metrics updated', { 
        campaignId,
        metrics,
        insightsGenerated: insights.length,
        userId: (request as any).user?.id,
      });

      return {
        updated: true,
        insights,
      };

    } catch (error) {
      logger.error('Failed to update campaign metrics', { error });
      throw error;
    }
  });

  // Custom analytics query
  fastify.post('/query', {
    schema: {
      tags: ['analytics'],
      summary: 'Custom analytics query',
      description: 'Execute custom analytics queries with flexible filtering and aggregation',
      body: {
        type: 'object',
        required: ['metrics', 'timeRange'],
        properties: {
          metrics: { type: 'array', items: { type: 'string' } },
          dimensions: { type: 'array', items: { type: 'string' } },
          filters: { type: 'object' },
          timeRange: {
            type: 'object',
            required: ['start', 'end'],
            properties: {
              start: { type: 'string', format: 'date-time' },
              end: { type: 'string', format: 'date-time' },
            },
          },
          granularity: { type: 'string', enum: ['hour', 'day', 'week', 'month'] },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array' },
            meta: {
              type: 'object',
              properties: {
                totalRows: { type: 'number' },
                queryTime: { type: 'number' },
                granularity: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request: AnalyticsQueryRequest, reply: FastifyReply) => {
    try {
      const queryParams = AnalyticsQuerySchema.parse(request.body);
      
      const startTime = Date.now();
      const result = await executeAnalyticsQuery(queryParams);
      const queryTime = Date.now() - startTime;
      
      logger.info('Custom analytics query executed', { 
        metrics: queryParams.metrics,
        dimensions: queryParams.dimensions,
        queryTime,
        resultRows: result.length,
        userId: (request as any).user?.id,
      });

      return {
        data: result,
        meta: {
          totalRows: result.length,
          queryTime,
          granularity: queryParams.granularity,
        },
      };

    } catch (error) {
      logger.error('Failed to execute analytics query', { error });
      throw error;
    }
  });

  // Get channel attribution
  fastify.get('/attribution/:conversionId', {
    schema: {
      tags: ['analytics'],
      summary: 'Get conversion attribution',
      description: 'Get attribution analysis for a specific conversion',
      params: {
        type: 'object',
        required: ['conversionId'],
        properties: {
          conversionId: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            attribution: { type: 'object' },
            primaryChannel: { type: 'string' },
            journeyInsights: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ Params: { conversionId: string } }>, reply: FastifyReply) => {
    try {
      const { conversionId } = request.params;
      
      const attributionData = await getConversionAttribution(conversionId);
      
      logger.info('Attribution data retrieved', { 
        conversionId,
        primaryChannel: attributionData.primaryChannel,
        userId: (request as any).user?.id,
      });

      return attributionData;

    } catch (error) {
      logger.error('Failed to get attribution data', { error });
      throw error;
    }
  });
};

// Helper functions
async function filterDashboardData(dashboard: any, filters: { segments?: string[]; campaigns?: string[] }) {
  // Implementation to filter dashboard data
  // This would filter the dashboard based on selected segments and campaigns
  return dashboard;
}

async function trackMarketingEvent(eventData: z.infer<typeof TrackEventSchema>): Promise<string> {
  // Implementation to track marketing events
  // This would store the event and trigger any real-time processing
  const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Store event data, trigger attribution updates, etc.
  
  return eventId;
}

async function generateMetricInsights(campaignId: string, metrics: any): Promise<string[]> {
  // Implementation to generate insights from metric changes
  const insights: string[] = [];
  
  // Example logic for generating insights
  if (metrics.conversions && metrics.clicks) {
    const conversionRate = metrics.conversions / metrics.clicks;
    if (conversionRate > 0.05) {
      insights.push('High conversion rate detected - consider increasing budget');
    }
  }
  
  return insights;
}

async function executeAnalyticsQuery(params: z.infer<typeof AnalyticsQuerySchema>): Promise<any[]> {
  // Implementation for custom analytics queries
  // This would query the appropriate data sources and apply aggregations
  return [];
}

async function getConversionAttribution(conversionId: string): Promise<{
  attribution: Record<string, number>;
  primaryChannel: string;
  journeyInsights: string[];
}> {
  // Implementation to get attribution data for a conversion
  return {
    attribution: {},
    primaryChannel: 'direct',
    journeyInsights: [],
  };
}