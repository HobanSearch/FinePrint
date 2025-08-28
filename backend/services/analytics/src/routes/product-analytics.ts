/**
 * Fine Print AI - Product Analytics Routes
 * 
 * API endpoints for product analytics including:
 * - Event tracking
 * - User identification
 * - Funnel analysis
 * - Cohort analysis
 * - Feature adoption tracking
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { productAnalyticsService } from '@/services/product-analytics';
import { analyticsLogger } from '@/utils/logger';

// Request schemas
const trackEventSchema = z.object({
  eventName: z.string().min(1).max(100),
  properties: z.record(z.any()).optional().default({}),
  context: z.object({
    sessionId: z.string().optional(),
    ip: z.string().optional(),
    userAgent: z.string().optional(),
    platform: z.enum(['web', 'mobile', 'api', 'cli']).optional(),
    page: z.object({
      url: z.string(),
      title: z.string().optional(),
      referrer: z.string().optional()
    }).optional(),
    device: z.object({
      type: z.enum(['desktop', 'mobile', 'tablet']).optional(),
      os: z.string().optional(),
      browser: z.string().optional()
    }).optional(),
    campaign: z.object({
      source: z.string().optional(),
      medium: z.string().optional(),
      campaign: z.string().optional(),
      term: z.string().optional(),
      content: z.string().optional()
    }).optional()
  }).optional().default({})
});

const identifyUserSchema = z.object({
  properties: z.object({
    subscriptionTier: z.string().optional(),
    createdAt: z.string().optional(),
    timezone: z.string().optional(),
    language: z.string().optional(),
    userType: z.string().optional(),
    planType: z.string().optional()
  }),
  context: z.object({
    ip: z.string().optional(),
    userAgent: z.string().optional(),
    platform: z.enum(['web', 'mobile', 'api', 'cli']).optional(),
    page: z.object({
      url: z.string(),
      title: z.string().optional()
    }).optional()
  }).optional().default({})
});

const trackPageViewSchema = z.object({
  page: z.object({
    url: z.string(),
    title: z.string().optional(),
    referrer: z.string().optional()
  }),
  properties: z.record(z.any()).optional().default({}),
  context: z.object({
    sessionId: z.string().optional(),
    ip: z.string().optional(),
    userAgent: z.string().optional(),
    platform: z.enum(['web', 'mobile', 'api', 'cli']).optional()
  }).optional().default({})
});

const trackFunnelStepSchema = z.object({
  funnelName: z.string().min(1).max(100),
  stepName: z.string().min(1).max(100),
  stepOrder: z.number().int().min(1),
  properties: z.record(z.any()).optional().default({}),
  context: z.object({
    sessionId: z.string().optional(),
    ip: z.string().optional(),
    userAgent: z.string().optional(),
    platform: z.enum(['web', 'mobile', 'api', 'cli']).optional()
  }).optional().default({})
});

const trackConversionSchema = z.object({
  conversionType: z.string().min(1).max(100),
  value: z.number().optional(),
  properties: z.record(z.any()).optional().default({}),
  context: z.object({
    sessionId: z.string().optional(),
    ip: z.string().optional(),
    userAgent: z.string().optional(),
    platform: z.enum(['web', 'mobile', 'api', 'cli']).optional()
  }).optional().default({})
});

const trackEngagementSchema = z.object({
  feature: z.string().min(1).max(100),
  action: z.string().min(1).max(100),
  duration: z.number().optional(),
  properties: z.record(z.any()).optional().default({}),
  context: z.object({
    sessionId: z.string().optional(),
    ip: z.string().optional(),
    userAgent: z.string().optional(),
    platform: z.enum(['web', 'mobile', 'api', 'cli']).optional()
  }).optional().default({})
});

const batchTrackEventsSchema = z.object({
  events: z.array(z.object({
    userId: z.string(),
    eventName: z.string().min(1).max(100),
    properties: z.record(z.any()).optional().default({}),
    context: z.object({
      sessionId: z.string().optional(),
      ip: z.string().optional(),
      userAgent: z.string().optional(),
      platform: z.enum(['web', 'mobile', 'api', 'cli']).optional()
    }).optional().default({})
  })).min(1).max(100)
});

const productAnalyticsRoutes: FastifyPluginAsync = async (fastify) => {
  // Track event
  fastify.post('/events', {
    schema: {
      description: 'Track a product analytics event',
      tags: ['Product Analytics'],
      security: [{ Bearer: [] }],
      body: trackEventSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { eventName, properties, context } = request.body as z.infer<typeof trackEventSchema>;
      const userId = request.user?.id;

      if (!userId) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'User authentication required'
        });
      }

      await productAnalyticsService.trackEvent(userId, eventName, properties, context);

      return reply.code(200).send({
        success: true,
        message: 'Event tracked successfully'
      });
    } catch (error) {
      analyticsLogger.error(error as Error, { 
        context: 'track_event_route',
        userId: request.user?.id 
      });
      
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to track event'
      });
    }
  });

  // Identify user
  fastify.post('/identify', {
    schema: {
      description: 'Identify user and set properties',
      tags: ['Product Analytics'],
      security: [{ Bearer: [] }],
      body: identifyUserSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { properties, context } = request.body as z.infer<typeof identifyUserSchema>;
      const userId = request.user?.id;

      if (!userId) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'User authentication required'
        });
      }

      await productAnalyticsService.identifyUser(userId, properties, context);

      return reply.code(200).send({
        success: true,
        message: 'User identified successfully'
      });
    } catch (error) {
      analyticsLogger.error(error as Error, { 
        context: 'identify_user_route',
        userId: request.user?.id 
      });
      
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to identify user'
      });
    }
  });

  // Track page view
  fastify.post('/pageview', {
    schema: {
      description: 'Track a page view',
      tags: ['Product Analytics'],
      security: [{ Bearer: [] }],
      body: trackPageViewSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { page, properties, context } = request.body as z.infer<typeof trackPageViewSchema>;
      const userId = request.user?.id;

      if (!userId) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'User authentication required'
        });
      }

      await productAnalyticsService.trackPageView(userId, page, properties, context);

      return reply.code(200).send({
        success: true,
        message: 'Page view tracked successfully'
      });
    } catch (error) {
      analyticsLogger.error(error as Error, { 
        context: 'track_pageview_route',
        userId: request.user?.id 
      });
      
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to track page view'
      });
    }
  });

  // Track funnel step
  fastify.post('/funnel-step', {
    schema: {
      description: 'Track funnel step completion',
      tags: ['Product Analytics'],
      security: [{ Bearer: [] }],
      body: trackFunnelStepSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { funnelName, stepName, stepOrder, properties, context } = 
        request.body as z.infer<typeof trackFunnelStepSchema>;
      const userId = request.user?.id;

      if (!userId) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'User authentication required'
        });
      }

      await productAnalyticsService.trackFunnelStep(
        userId, 
        funnelName, 
        stepName, 
        stepOrder, 
        properties, 
        context
      );

      return reply.code(200).send({
        success: true,
        message: 'Funnel step tracked successfully'
      });
    } catch (error) {
      analyticsLogger.error(error as Error, { 
        context: 'track_funnel_step_route',
        userId: request.user?.id 
      });
      
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to track funnel step'
      });
    }
  });

  // Track conversion
  fastify.post('/conversion', {
    schema: {
      description: 'Track conversion event',
      tags: ['Product Analytics'],
      security: [{ Bearer: [] }],
      body: trackConversionSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { conversionType, value, properties, context } = 
        request.body as z.infer<typeof trackConversionSchema>;
      const userId = request.user?.id;

      if (!userId) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'User authentication required'
        });
      }

      await productAnalyticsService.trackConversion(userId, conversionType, value, properties, context);

      return reply.code(200).send({
        success: true,
        message: 'Conversion tracked successfully'
      });
    } catch (error) {
      analyticsLogger.error(error as Error, { 
        context: 'track_conversion_route',
        userId: request.user?.id 
      });
      
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to track conversion'
      });
    }
  });

  // Track engagement
  fastify.post('/engagement', {
    schema: {
      description: 'Track feature engagement',
      tags: ['Product Analytics'],
      security: [{ Bearer: [] }],
      body: trackEngagementSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { feature, action, duration, properties, context } = 
        request.body as z.infer<typeof trackEngagementSchema>;
      const userId = request.user?.id;

      if (!userId) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'User authentication required'
        });
      }

      await productAnalyticsService.trackEngagement(
        userId, 
        feature, 
        action, 
        duration, 
        properties, 
        context
      );

      return reply.code(200).send({
        success: true,
        message: 'Engagement tracked successfully'
      });
    } catch (error) {
      analyticsLogger.error(error as Error, { 
        context: 'track_engagement_route',
        userId: request.user?.id 
      });
      
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to track engagement'
      });
    }
  });

  // Batch track events
  fastify.post('/events/batch', {
    schema: {
      description: 'Track multiple events in batch',
      tags: ['Product Analytics'],
      security: [{ Bearer: [] }],
      body: batchTrackEventsSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            processed: { type: 'number' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { events } = request.body as z.infer<typeof batchTrackEventsSchema>;

      await productAnalyticsService.batchTrackEvents(events);

      return reply.code(200).send({
        success: true,
        message: 'Events tracked successfully',
        processed: events.length
      });
    } catch (error) {
      analyticsLogger.error(error as Error, { 
        context: 'batch_track_events_route',
        eventCount: (request.body as any)?.events?.length 
      });
      
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to track events'
      });
    }
  });

  // Get user funnel progress
  fastify.get('/funnel/:funnelName/progress', {
    schema: {
      description: 'Get user funnel progress',
      tags: ['Product Analytics'],
      security: [{ Bearer: [] }],
      params: {
        type: 'object',
        properties: {
          funnelName: { type: 'string' }
        },
        required: ['funnelName']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            funnelName: { type: 'string' },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  stepName: { type: 'string' },
                  stepOrder: { type: 'number' },
                  completedAt: { type: 'string' },
                  properties: { type: 'object' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { funnelName } = request.params as { funnelName: string };
      const userId = request.user?.id;

      if (!userId) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'User authentication required'
        });
      }

      const steps = await productAnalyticsService.getUserFunnelProgress(userId, funnelName);

      return reply.code(200).send({
        funnelName,
        steps
      });
    } catch (error) {
      analyticsLogger.error(error as Error, { 
        context: 'get_funnel_progress_route',
        userId: request.user?.id,
        funnelName: (request.params as any)?.funnelName
      });
      
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get funnel progress'
      });
    }
  });
};

export default productAnalyticsRoutes;