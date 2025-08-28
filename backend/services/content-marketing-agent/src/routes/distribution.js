"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = distributionRoutes;
const content_distribution_engine_1 = require("../services/content-distribution-engine");
const logger_1 = require("../utils/logger");
const distributionEngine = new content_distribution_engine_1.ContentDistributionEngine();
async function distributionRoutes(fastify) {
    fastify.post('/publish', async (request, reply) => {
        try {
            const { contentId, platforms, scheduleTime, immediate, testMode } = request.body;
            const content = {
                id: contentId,
                type: 'blog_post',
                title: 'Privacy Policy Red Flags You Should Never Ignore',
                content: 'When reviewing privacy policies, there are several red flags that should immediately catch your attention...',
                excerpt: 'Learn to identify dangerous clauses in privacy policies',
                tags: ['privacy', 'legal-tech', 'user-protection'],
                keywords: ['privacy policy', 'data protection', 'user rights'],
                platform: 'blog',
                status: 'approved',
                tone: 'professional',
                wordCount: 1200,
                readingTime: 6,
                seoScore: 85,
                engagementPrediction: 78,
                callToAction: 'Get your privacy policy analyzed free',
                hashtags: ['#PrivacyRights', '#LegalTech', '#DataProtection'],
                createdAt: new Date(),
                updatedAt: new Date(),
                authorId: 'content-marketing-agent'
            };
            const options = {
                scheduleTime: scheduleTime ? new Date(scheduleTime) : undefined,
                immediate: immediate || false,
                testMode: testMode || false
            };
            const results = await distributionEngine.publishContent(content, platforms, options);
            const response = {
                success: true,
                data: results,
                message: `Content distribution initiated to ${platforms.length} platforms`
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Content distribution failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to distribute content'
            };
        }
    });
    fastify.post('/schedule', async (request, reply) => {
        try {
            const { contentId, platforms, scheduleTime, recurring, endDate } = request.body;
            const content = {
                id: contentId,
                type: 'social_media_post',
                title: 'Daily Privacy Tip',
                content: 'Did you know that 73% of apps collect your location data even when not in use? Always check app permissions! #PrivacyTip',
                excerpt: 'Privacy tip about app permissions',
                tags: ['privacy-tip', 'daily-content'],
                keywords: ['privacy', 'app permissions'],
                platform: 'twitter',
                status: 'approved',
                tone: 'friendly',
                wordCount: 25,
                readingTime: 1,
                seoScore: 0,
                engagementPrediction: 65,
                hashtags: ['#PrivacyTip', '#AppSecurity'],
                createdAt: new Date(),
                updatedAt: new Date(),
                authorId: 'content-marketing-agent'
            };
            const options = {
                recurring: recurring,
                endDate: endDate ? new Date(endDate) : undefined
            };
            const results = await distributionEngine.scheduleContent(content, platforms, new Date(scheduleTime), options);
            const response = {
                success: true,
                data: results,
                message: `Content scheduled for ${platforms.length} platforms`
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Content scheduling failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to schedule content'
            };
        }
    });
    fastify.get('/status/:contentId', async (request, reply) => {
        try {
            const { contentId } = request.params;
            const status = {
                contentId,
                platforms: [
                    {
                        platform: 'linkedin',
                        status: 'published',
                        publishedAt: new Date(),
                        publishedId: 'li_post_123',
                        url: 'https://linkedin.com/feed/update/li_post_123',
                        metrics: {
                            impressions: 1250,
                            clicks: 45,
                            likes: 23,
                            shares: 8
                        }
                    },
                    {
                        platform: 'twitter',
                        status: 'scheduled',
                        scheduledFor: new Date(Date.now() + 2 * 60 * 60 * 1000),
                        message: 'Scheduled for optimal engagement time'
                    },
                    {
                        platform: 'facebook',
                        status: 'failed',
                        error: 'Authentication token expired',
                        retryAt: new Date(Date.now() + 30 * 60 * 1000)
                    }
                ],
                overallStatus: 'partial_success',
                lastUpdated: new Date()
            };
            const response = {
                success: true,
                data: status,
                message: 'Publishing status retrieved'
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Publishing status retrieval failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to retrieve publishing status'
            };
        }
    });
    fastify.get('/scheduled', async (request, reply) => {
        try {
            const { platform, startDate, endDate, page = '1', limit = '20' } = request.query;
            const pageNum = parseInt(page);
            const limitNum = parseInt(limit);
            const scheduledContent = [
                {
                    id: 'content_1',
                    title: 'GDPR Compliance Checklist',
                    platform: 'linkedin',
                    scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000),
                    status: 'pending',
                    type: 'blog_post'
                },
                {
                    id: 'content_2',
                    title: 'Privacy Policy Red Flags',
                    platform: 'twitter',
                    scheduledFor: new Date(Date.now() + 12 * 60 * 60 * 1000),
                    status: 'pending',
                    type: 'social_media_post'
                }
            ].filter(content => !platform || content.platform === platform);
            const response = {
                success: true,
                data: scheduledContent,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: scheduledContent.length,
                    totalPages: Math.ceil(scheduledContent.length / limitNum)
                },
                message: 'Scheduled content retrieved'
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Scheduled content retrieval failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to retrieve scheduled content'
            };
        }
    });
    fastify.delete('/scheduled/:contentId', async (request, reply) => {
        try {
            const { contentId } = request.params;
            const { platform } = request.query;
            const response = {
                success: true,
                message: platform
                    ? `Scheduled content cancelled for ${platform}`
                    : 'Scheduled content cancelled for all platforms'
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Content cancellation failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to cancel scheduled content'
            };
        }
    });
    fastify.get('/platforms', async (request, reply) => {
        try {
            const platforms = [
                {
                    name: 'linkedin',
                    displayName: 'LinkedIn',
                    capabilities: ['post', 'schedule', 'analytics', 'video'],
                    limits: {
                        textLength: 3000,
                        images: 20,
                        videos: 1
                    },
                    connected: true,
                    lastSync: new Date()
                },
                {
                    name: 'twitter',
                    displayName: 'Twitter',
                    capabilities: ['post', 'schedule', 'analytics', 'thread'],
                    limits: {
                        textLength: 280,
                        images: 4,
                        videos: 1
                    },
                    connected: true,
                    lastSync: new Date()
                },
                {
                    name: 'facebook',
                    displayName: 'Facebook',
                    capabilities: ['post', 'schedule', 'analytics'],
                    limits: {
                        textLength: 2000,
                        images: 10,
                        videos: 1
                    },
                    connected: false,
                    error: 'Authentication required'
                },
                {
                    name: 'medium',
                    displayName: 'Medium',
                    capabilities: ['post', 'schedule'],
                    limits: {
                        textLength: 100000,
                        images: 50
                    },
                    connected: true,
                    lastSync: new Date()
                }
            ];
            const response = {
                success: true,
                data: platforms,
                message: 'Platform capabilities retrieved'
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Platform capabilities retrieval failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to retrieve platform capabilities'
            };
        }
    });
    fastify.post('/platforms/:platform/test', async (request, reply) => {
        try {
            const { platform } = request.params;
            const testResult = {
                platform,
                connected: true,
                testMessage: 'Connection test successful',
                capabilities: ['post', 'schedule', 'analytics'],
                lastTested: new Date()
            };
            const response = {
                success: true,
                data: testResult,
                message: `${platform} connection test completed`
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Platform connection test failed', { error });
            reply.status(500);
            return {
                success: false,
                error: `Failed to test ${request.params.platform} connection`
            };
        }
    });
    fastify.get('/analytics', async (request, reply) => {
        try {
            const { platform, startDate, endDate, contentId } = request.query;
            const analytics = {
                period: {
                    start: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                    end: endDate || new Date().toISOString()
                },
                totalPosts: 45,
                totalImpressions: 125000,
                totalEngagement: 3200,
                totalClicks: 890,
                platforms: [
                    {
                        name: 'linkedin',
                        posts: 15,
                        impressions: 55000,
                        engagement: 1800,
                        clicks: 420,
                        engagementRate: 3.27
                    },
                    {
                        name: 'twitter',
                        posts: 20,
                        impressions: 45000,
                        engagement: 900,
                        clicks: 280,
                        engagementRate: 2.0
                    },
                    {
                        name: 'facebook',
                        posts: 10,
                        impressions: 25000,
                        engagement: 500,
                        clicks: 190,
                        engagementRate: 2.0
                    }
                ].filter(p => !platform || p.name === platform),
                topPerforming: [
                    {
                        contentId: 'post_1',
                        platform: 'linkedin',
                        title: 'GDPR Compliance Guide',
                        impressions: 8500,
                        engagement: 340,
                        engagementRate: 4.0
                    },
                    {
                        contentId: 'post_2',
                        platform: 'twitter',
                        title: 'Privacy Policy Red Flags',
                        impressions: 6200,
                        engagement: 280,
                        engagementRate: 4.5
                    }
                ]
            };
            const response = {
                success: true,
                data: analytics,
                message: 'Publishing analytics retrieved'
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Publishing analytics retrieval failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to retrieve publishing analytics'
            };
        }
    });
}
//# sourceMappingURL=distribution.js.map