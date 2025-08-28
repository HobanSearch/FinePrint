"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const zod_1 = require("zod");
const product_analytics_1 = require("@/services/product-analytics");
const logger_1 = require("@/utils/logger");
const trackEventSchema = zod_1.z.object({
    eventName: zod_1.z.string().min(1).max(100),
    properties: zod_1.z.record(zod_1.z.any()).optional().default({}),
    context: zod_1.z.object({
        sessionId: zod_1.z.string().optional(),
        ip: zod_1.z.string().optional(),
        userAgent: zod_1.z.string().optional(),
        platform: zod_1.z.enum(['web', 'mobile', 'api', 'cli']).optional(),
        page: zod_1.z.object({
            url: zod_1.z.string(),
            title: zod_1.z.string().optional(),
            referrer: zod_1.z.string().optional()
        }).optional(),
        device: zod_1.z.object({
            type: zod_1.z.enum(['desktop', 'mobile', 'tablet']).optional(),
            os: zod_1.z.string().optional(),
            browser: zod_1.z.string().optional()
        }).optional(),
        campaign: zod_1.z.object({
            source: zod_1.z.string().optional(),
            medium: zod_1.z.string().optional(),
            campaign: zod_1.z.string().optional(),
            term: zod_1.z.string().optional(),
            content: zod_1.z.string().optional()
        }).optional()
    }).optional().default({})
});
const identifyUserSchema = zod_1.z.object({
    properties: zod_1.z.object({
        subscriptionTier: zod_1.z.string().optional(),
        createdAt: zod_1.z.string().optional(),
        timezone: zod_1.z.string().optional(),
        language: zod_1.z.string().optional(),
        userType: zod_1.z.string().optional(),
        planType: zod_1.z.string().optional()
    }),
    context: zod_1.z.object({
        ip: zod_1.z.string().optional(),
        userAgent: zod_1.z.string().optional(),
        platform: zod_1.z.enum(['web', 'mobile', 'api', 'cli']).optional(),
        page: zod_1.z.object({
            url: zod_1.z.string(),
            title: zod_1.z.string().optional()
        }).optional()
    }).optional().default({})
});
const trackPageViewSchema = zod_1.z.object({
    page: zod_1.z.object({
        url: zod_1.z.string(),
        title: zod_1.z.string().optional(),
        referrer: zod_1.z.string().optional()
    }),
    properties: zod_1.z.record(zod_1.z.any()).optional().default({}),
    context: zod_1.z.object({
        sessionId: zod_1.z.string().optional(),
        ip: zod_1.z.string().optional(),
        userAgent: zod_1.z.string().optional(),
        platform: zod_1.z.enum(['web', 'mobile', 'api', 'cli']).optional()
    }).optional().default({})
});
const trackFunnelStepSchema = zod_1.z.object({
    funnelName: zod_1.z.string().min(1).max(100),
    stepName: zod_1.z.string().min(1).max(100),
    stepOrder: zod_1.z.number().int().min(1),
    properties: zod_1.z.record(zod_1.z.any()).optional().default({}),
    context: zod_1.z.object({
        sessionId: zod_1.z.string().optional(),
        ip: zod_1.z.string().optional(),
        userAgent: zod_1.z.string().optional(),
        platform: zod_1.z.enum(['web', 'mobile', 'api', 'cli']).optional()
    }).optional().default({})
});
const trackConversionSchema = zod_1.z.object({
    conversionType: zod_1.z.string().min(1).max(100),
    value: zod_1.z.number().optional(),
    properties: zod_1.z.record(zod_1.z.any()).optional().default({}),
    context: zod_1.z.object({
        sessionId: zod_1.z.string().optional(),
        ip: zod_1.z.string().optional(),
        userAgent: zod_1.z.string().optional(),
        platform: zod_1.z.enum(['web', 'mobile', 'api', 'cli']).optional()
    }).optional().default({})
});
const trackEngagementSchema = zod_1.z.object({
    feature: zod_1.z.string().min(1).max(100),
    action: zod_1.z.string().min(1).max(100),
    duration: zod_1.z.number().optional(),
    properties: zod_1.z.record(zod_1.z.any()).optional().default({}),
    context: zod_1.z.object({
        sessionId: zod_1.z.string().optional(),
        ip: zod_1.z.string().optional(),
        userAgent: zod_1.z.string().optional(),
        platform: zod_1.z.enum(['web', 'mobile', 'api', 'cli']).optional()
    }).optional().default({})
});
const batchTrackEventsSchema = zod_1.z.object({
    events: zod_1.z.array(zod_1.z.object({
        userId: zod_1.z.string(),
        eventName: zod_1.z.string().min(1).max(100),
        properties: zod_1.z.record(zod_1.z.any()).optional().default({}),
        context: zod_1.z.object({
            sessionId: zod_1.z.string().optional(),
            ip: zod_1.z.string().optional(),
            userAgent: zod_1.z.string().optional(),
            platform: zod_1.z.enum(['web', 'mobile', 'api', 'cli']).optional()
        }).optional().default({})
    })).min(1).max(100)
});
const productAnalyticsRoutes = async (fastify) => {
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
            const { eventName, properties, context } = request.body;
            const userId = request.user?.id;
            if (!userId) {
                return reply.code(401).send({
                    error: 'Unauthorized',
                    message: 'User authentication required'
                });
            }
            await product_analytics_1.productAnalyticsService.trackEvent(userId, eventName, properties, context);
            return reply.code(200).send({
                success: true,
                message: 'Event tracked successfully'
            });
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'track_event_route',
                userId: request.user?.id
            });
            return reply.code(500).send({
                error: 'Internal Server Error',
                message: 'Failed to track event'
            });
        }
    });
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
            const { properties, context } = request.body;
            const userId = request.user?.id;
            if (!userId) {
                return reply.code(401).send({
                    error: 'Unauthorized',
                    message: 'User authentication required'
                });
            }
            await product_analytics_1.productAnalyticsService.identifyUser(userId, properties, context);
            return reply.code(200).send({
                success: true,
                message: 'User identified successfully'
            });
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'identify_user_route',
                userId: request.user?.id
            });
            return reply.code(500).send({
                error: 'Internal Server Error',
                message: 'Failed to identify user'
            });
        }
    });
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
            const { page, properties, context } = request.body;
            const userId = request.user?.id;
            if (!userId) {
                return reply.code(401).send({
                    error: 'Unauthorized',
                    message: 'User authentication required'
                });
            }
            await product_analytics_1.productAnalyticsService.trackPageView(userId, page, properties, context);
            return reply.code(200).send({
                success: true,
                message: 'Page view tracked successfully'
            });
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'track_pageview_route',
                userId: request.user?.id
            });
            return reply.code(500).send({
                error: 'Internal Server Error',
                message: 'Failed to track page view'
            });
        }
    });
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
            const { funnelName, stepName, stepOrder, properties, context } = request.body;
            const userId = request.user?.id;
            if (!userId) {
                return reply.code(401).send({
                    error: 'Unauthorized',
                    message: 'User authentication required'
                });
            }
            await product_analytics_1.productAnalyticsService.trackFunnelStep(userId, funnelName, stepName, stepOrder, properties, context);
            return reply.code(200).send({
                success: true,
                message: 'Funnel step tracked successfully'
            });
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'track_funnel_step_route',
                userId: request.user?.id
            });
            return reply.code(500).send({
                error: 'Internal Server Error',
                message: 'Failed to track funnel step'
            });
        }
    });
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
            const { conversionType, value, properties, context } = request.body;
            const userId = request.user?.id;
            if (!userId) {
                return reply.code(401).send({
                    error: 'Unauthorized',
                    message: 'User authentication required'
                });
            }
            await product_analytics_1.productAnalyticsService.trackConversion(userId, conversionType, value, properties, context);
            return reply.code(200).send({
                success: true,
                message: 'Conversion tracked successfully'
            });
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'track_conversion_route',
                userId: request.user?.id
            });
            return reply.code(500).send({
                error: 'Internal Server Error',
                message: 'Failed to track conversion'
            });
        }
    });
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
            const { feature, action, duration, properties, context } = request.body;
            const userId = request.user?.id;
            if (!userId) {
                return reply.code(401).send({
                    error: 'Unauthorized',
                    message: 'User authentication required'
                });
            }
            await product_analytics_1.productAnalyticsService.trackEngagement(userId, feature, action, duration, properties, context);
            return reply.code(200).send({
                success: true,
                message: 'Engagement tracked successfully'
            });
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'track_engagement_route',
                userId: request.user?.id
            });
            return reply.code(500).send({
                error: 'Internal Server Error',
                message: 'Failed to track engagement'
            });
        }
    });
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
            const { events } = request.body;
            await product_analytics_1.productAnalyticsService.batchTrackEvents(events);
            return reply.code(200).send({
                success: true,
                message: 'Events tracked successfully',
                processed: events.length
            });
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'batch_track_events_route',
                eventCount: request.body?.events?.length
            });
            return reply.code(500).send({
                error: 'Internal Server Error',
                message: 'Failed to track events'
            });
        }
    });
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
            const { funnelName } = request.params;
            const userId = request.user?.id;
            if (!userId) {
                return reply.code(401).send({
                    error: 'Unauthorized',
                    message: 'User authentication required'
                });
            }
            const steps = await product_analytics_1.productAnalyticsService.getUserFunnelProgress(userId, funnelName);
            return reply.code(200).send({
                funnelName,
                steps
            });
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'get_funnel_progress_route',
                userId: request.user?.id,
                funnelName: request.params?.funnelName
            });
            return reply.code(500).send({
                error: 'Internal Server Error',
                message: 'Failed to get funnel progress'
            });
        }
    });
};
exports.default = productAnalyticsRoutes;
//# sourceMappingURL=product-analytics.js.map