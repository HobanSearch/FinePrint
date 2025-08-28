import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ApiResponse } from '../types';
import { AnalyticsEngine } from '../services/analytics-engine';
import { logger } from '../utils/logger';

const analyticsEngine = new AnalyticsEngine();

export default async function analyticsRoutes(fastify: FastifyInstance) {
  // Track content performance
  fastify.get('/content/:contentId/performance', async (request: FastifyRequest<{
    Params: { contentId: string };
    Querystring: {
      platforms?: string;
      startDate?: string;
      endDate?: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const { contentId } = request.params;
      const { platforms, startDate, endDate } = request.query;
      
      const platformArray = platforms ? platforms.split(',') as any[] : ['linkedin', 'twitter', 'facebook'];
      const timeRange = {
        start: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: endDate ? new Date(endDate) : new Date()
      };

      const analytics = await analyticsEngine.trackContentPerformance(contentId, platformArray, timeRange);

      const response: ApiResponse = {
        success: true,
        data: analytics,
        message: 'Content performance retrieved'
      };

      return response;
    } catch (error) {
      logger.error('Content performance tracking failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to track content performance'
      };
    }
  });

  // Analyze campaign ROI
  fastify.get('/campaigns/:campaignId/roi', async (request: FastifyRequest<{
    Params: { campaignId: string }
  }>, reply: FastifyReply) => {
    try {
      const { campaignId } = request.params;
      
      const roiAnalysis = await analyticsEngine.analyzeCampaignROI(campaignId);

      const response: ApiResponse = {
        success: true,
        data: roiAnalysis,
        message: 'Campaign ROI analysis completed'
      };

      return response;
    } catch (error) {
      logger.error('Campaign ROI analysis failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to analyze campaign ROI'
      };
    }
  });

  // Generate insights
  fastify.get('/content/:contentId/insights', async (request: FastifyRequest<{
    Params: { contentId: string };
    Querystring: {
      startDate?: string;
      endDate?: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const { contentId } = request.params;
      const { startDate, endDate } = request.query;
      
      const timeRange = {
        start: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: endDate ? new Date(endDate) : new Date()
      };

      const insights = await analyticsEngine.generateInsights(contentId, timeRange);

      const response: ApiResponse = {
        success: true,
        data: insights,
        message: 'Insights generated successfully'
      };

      return response;
    } catch (error) {
      logger.error('Insight generation failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to generate insights'
      };
    }
  });

  // Analyze audience engagement
  fastify.get('/audience/engagement', async (request: FastifyRequest<{
    Querystring: {
      platforms?: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const { platforms } = request.query;
      const platformArray = platforms ? platforms.split(',') as any[] : ['linkedin', 'twitter', 'facebook'];

      const audienceInsights = await analyticsEngine.analyzeAudienceEngagement(platformArray);

      const response: ApiResponse = {
        success: true,
        data: audienceInsights,
        message: 'Audience engagement analysis completed'
      };

      return response;
    } catch (error) {
      logger.error('Audience engagement analysis failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to analyze audience engagement'
      };
    }
  });

  // Track competitors
  fastify.post('/competitors', async (request: FastifyRequest<{
    Body: { competitors: string[] }
  }>, reply: FastifyReply) => {
    try {
      const { competitors } = request.body;

      const competitorAnalysis = await analyticsEngine.trackCompetitors(competitors);

      const response: ApiResponse = {
        success: true,
        data: competitorAnalysis,
        message: 'Competitor analysis completed'
      };

      return response;
    } catch (error) {
      logger.error('Competitor tracking failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to track competitors'
      };
    }
  });

  // Optimize posting schedule
  fastify.get('/posting-schedule/:platform/optimize', async (request: FastifyRequest<{
    Params: { platform: string };
    Querystring: {
      startDate?: string;
      endDate?: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const { platform } = request.params;
      const { startDate, endDate } = request.query;
      
      const timeRange = {
        start: startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        end: endDate ? new Date(endDate) : new Date()
      };

      const optimization = await analyticsEngine.optimizePostingSchedule(platform as any, timeRange);

      const response: ApiResponse = {
        success: true,
        data: optimization,
        message: 'Posting schedule optimization completed'
      };

      return response;
    } catch (error) {
      logger.error('Posting schedule optimization failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to optimize posting schedule'
      };
    }
  });

  // Get analytics dashboard data
  fastify.get('/dashboard', async (request: FastifyRequest<{
    Querystring: {
      period?: string;
      campaignId?: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const { period = '30d', campaignId } = request.query;
      
      // This would aggregate dashboard data
      const dashboardData = {
        overview: {
          totalImpressions: 1250000,
          totalClicks: 32000,
          totalLeads: 850,
          totalRevenue: 125000,
          avgEngagementRate: 3.2,
          avgConversionRate: 2.7
        },
        topPerformingContent: [
          { id: 'content_1', title: 'GDPR Compliance Guide', engagement: 8.5 },
          { id: 'content_2', title: 'Privacy Policy Red Flags', engagement: 7.2 },
          { id: 'content_3', title: 'Terms of Service Analysis', engagement: 6.8 }
        ],
        platformPerformance: {
          linkedin: { impressions: 450000, engagement: 4.2, leads: 320 },
          twitter: { impressions: 380000, engagement: 3.1, leads: 180 },
          facebook: { impressions: 280000, engagement: 2.8, leads: 120 },
          email: { impressions: 140000, engagement: 22.5, leads: 230 }
        },
        trends: {
          impressions: [120000, 135000, 128000, 142000, 155000],
          engagement: [3.1, 3.4, 3.2, 3.8, 4.1],
          leads: [45, 52, 48, 61, 68]
        },
        period
      };

      const response: ApiResponse = {
        success: true,
        data: dashboardData,
        message: 'Dashboard data retrieved'
      };

      return response;
    } catch (error) {
      logger.error('Dashboard data retrieval failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to retrieve dashboard data'
      };
    }
  });
}