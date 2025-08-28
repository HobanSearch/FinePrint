"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampaignManager = void 0;
const uuid_1 = require("uuid");
const content_creation_engine_1 = require("./content-creation-engine");
const content_distribution_engine_1 = require("./content-distribution-engine");
const analytics_engine_1 = require("./analytics-engine");
const lead_generation_engine_1 = require("./lead-generation-engine");
const logger_1 = require("../utils/logger");
class CampaignManager {
    contentEngine;
    distributionEngine;
    analyticsEngine;
    leadEngine;
    constructor() {
        this.contentEngine = new content_creation_engine_1.ContentCreationEngine();
        this.distributionEngine = new content_distribution_engine_1.ContentDistributionEngine();
        this.analyticsEngine = new analytics_engine_1.AnalyticsEngine();
        this.leadEngine = new lead_generation_engine_1.LeadGenerationEngine();
    }
    async createCampaign(name, type, description, targetAudience, goals, duration, platforms, budget) {
        try {
            logger_1.logger.info('Creating new campaign', { name, type, targetAudience });
            const campaign = {
                id: (0, uuid_1.v4)(),
                name,
                description,
                type,
                startDate: duration.start,
                endDate: duration.end,
                targetAudience,
                goals: Object.keys(goals),
                kpis: goals,
                budget,
                status: 'planning',
                contentIds: [],
                platforms,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            const campaignPlan = await this.generateCampaignPlan(campaign);
            const initialContent = await this.createCampaignContent(campaignPlan.contentPlan, campaign.id);
            campaign.contentIds = initialContent.map(content => content.id);
            await this.scheduleCampaignContent(campaignPlan.distributionPlan, initialContent);
            campaign.status = 'active';
            campaign.updatedAt = new Date();
            logger_1.logger.info('Campaign created successfully', {
                campaignId: campaign.id,
                contentPieces: campaign.contentIds.length,
                platforms: platforms.length
            });
            return campaign;
        }
        catch (error) {
            logger_1.logger.error('Campaign creation failed', { error, name });
            throw error;
        }
    }
    async generateAutonomousCampaign(topic, targetAudience, goals, platforms, duration = 30) {
        try {
            logger_1.logger.info('Generating autonomous campaign', { topic, targetAudience, duration });
            const campaignType = this.determineCampaignType(goals);
            const contentMix = await this.calculateOptimalContentMix(campaignType, platforms);
            const campaignName = await this.generateCampaignName(topic, campaignType);
            const startDate = new Date();
            const endDate = new Date(startDate.getTime() + duration * 24 * 60 * 60 * 1000);
            const campaign = await this.createCampaign(campaignName, campaignType, `Autonomous ${campaignType} campaign for ${topic}`, targetAudience, goals, { start: startDate, end: endDate }, platforms);
            await this.setupCampaignAutomation(campaign.id, {
                autoPublish: true,
                autoOptimize: true,
                autoScale: true,
                performanceThresholds: {
                    pauseIfEngagementBelow: 1.0,
                    scaleIfEngagementAbove: 5.0,
                    maxDailySpend: 100
                }
            });
            logger_1.logger.info('Autonomous campaign generated', {
                campaignId: campaign.id,
                contentPieces: contentMix.totalPieces,
                automationEnabled: true
            });
            return campaign;
        }
        catch (error) {
            logger_1.logger.error('Autonomous campaign generation failed', { error, topic });
            throw error;
        }
    }
    async optimizeCampaign(campaignId) {
        try {
            logger_1.logger.info('Optimizing campaign', { campaignId });
            const campaign = await this.getCampaign(campaignId);
            const analytics = await this.getCampaignAnalytics(campaignId);
            const optimizations = [];
            let projectedImprovement = 0;
            let newContent = [];
            const topPerformingContent = analytics
                .sort((a, b) => b.engagementRate - a.engagementRate)
                .slice(0, 3);
            const lowPerformingContent = analytics
                .filter(a => a.engagementRate < 2.0);
            if (topPerformingContent.length > 0) {
                optimizations.push('Create variations of top-performing content');
                const similarContent = await this.generateSimilarContent(topPerformingContent.map(a => a.contentId), campaign.targetAudience);
                newContent.push(...similarContent);
                projectedImprovement += 25;
            }
            const platformPerformance = this.analyzePlatformPerformance(analytics);
            const bestPlatform = Object.entries(platformPerformance)
                .sort(([, a], [, b]) => b - a)[0];
            if (bestPlatform) {
                optimizations.push(`Increase budget allocation to ${bestPlatform[0]} (${bestPlatform[1].toFixed(1)}% engagement)`);
                projectedImprovement += 15;
            }
            const optimalTimes = await this.analyzeOptimalPostingTimes(campaignId);
            if (optimalTimes.length > 0) {
                optimizations.push('Reschedule content to optimal engagement times');
                projectedImprovement += 10;
            }
            const audienceInsights = await this.analyzeCampaignAudience(campaignId);
            if (audienceInsights.underPerformingSegments.length > 0) {
                optimizations.push('Refine targeting to exclude underperforming audience segments');
                projectedImprovement += 20;
            }
            if (campaign.budget) {
                const budgetOptimization = await this.optimizeBudgetAllocation(campaignId);
                optimizations.push(...budgetOptimization.recommendations);
                projectedImprovement += budgetOptimization.projectedImprovement;
            }
            logger_1.logger.info('Campaign optimization completed', {
                campaignId,
                optimizationsFound: optimizations.length,
                projectedImprovement,
                newContentPieces: newContent.length
            });
            return {
                optimizations,
                projectedImprovement,
                newContent: newContent.length > 0 ? newContent : undefined
            };
        }
        catch (error) {
            logger_1.logger.error('Campaign optimization failed', { error, campaignId });
            throw error;
        }
    }
    async pauseCampaign(campaignId, reason) {
        try {
            const campaign = await this.getCampaign(campaignId);
            campaign.status = 'paused';
            campaign.updatedAt = new Date();
            await this.pauseScheduledContent(campaignId);
            logger_1.logger.info('Campaign paused', { campaignId, reason });
        }
        catch (error) {
            logger_1.logger.error('Campaign pause failed', { error, campaignId });
            throw error;
        }
    }
    async resumeCampaign(campaignId) {
        try {
            const campaign = await this.getCampaign(campaignId);
            campaign.status = 'active';
            campaign.updatedAt = new Date();
            await this.resumeScheduledContent(campaignId);
            logger_1.logger.info('Campaign resumed', { campaignId });
        }
        catch (error) {
            logger_1.logger.error('Campaign resume failed', { error, campaignId });
            throw error;
        }
    }
    async generateLeadsFromCampaign(campaignId, leadMagnets) {
        try {
            logger_1.logger.info('Generating leads from campaign', { campaignId, leadMagnets });
            const campaign = await this.getCampaign(campaignId);
            const campaignAnalytics = await this.getCampaignAnalytics(campaignId);
            const highPerformingContent = campaignAnalytics
                .filter(a => a.engagementRate > 3.0)
                .map(a => a.contentId);
            const leads = await this.leadEngine.generateLeadsFromContent(highPerformingContent, leadMagnets, campaign.targetAudience);
            const totalLeads = leads.length;
            campaign.kpis.leads = (campaign.kpis.leads || 0) + totalLeads;
            campaign.updatedAt = new Date();
            logger_1.logger.info('Leads generated from campaign', {
                campaignId,
                leadsGenerated: totalLeads,
                qualifiedLeads: leads.filter(l => l.score >= 70).length
            });
            return leads;
        }
        catch (error) {
            logger_1.logger.error('Campaign lead generation failed', { error, campaignId });
            throw error;
        }
    }
    async generateCampaignPlan(campaign) {
        const durationDays = Math.ceil((campaign.endDate.getTime() - campaign.startDate.getTime()) / (1000 * 60 * 60 * 24));
        const contentFrequency = this.calculateContentFrequency(campaign.type, durationDays);
        const contentPlan = await this.generateContentPlan(campaign.type, campaign.targetAudience, contentFrequency, campaign.platforms);
        const distributionPlan = this.generateDistributionPlan(contentPlan, campaign.platforms, campaign.startDate, campaign.endDate);
        const calendar = this.generateContentCalendar(contentPlan, distributionPlan, campaign.id);
        return {
            campaign,
            contentPlan,
            distributionPlan,
            calendar
        };
    }
    async createCampaignContent(contentPlan, campaignId) {
        const content = [];
        for (const request of contentPlan) {
            try {
                const generatedContent = await this.contentEngine.createContent({
                    ...request,
                    campaignId
                });
                content.push(generatedContent);
            }
            catch (error) {
                logger_1.logger.warn('Failed to create campaign content', { error, request });
            }
        }
        return content;
    }
    async scheduleCampaignContent(distributionPlan, content) {
        for (const plan of distributionPlan) {
            const contentPiece = content.find(c => c.id === plan.contentId);
            if (contentPiece) {
                try {
                    await this.distributionEngine.scheduleContent(contentPiece, plan.platforms, plan.scheduleTime);
                }
                catch (error) {
                    logger_1.logger.warn('Failed to schedule content', { error, contentId: plan.contentId });
                }
            }
        }
    }
    determineCampaignType(goals) {
        if (goals.brandAwareness && goals.brandAwareness > 0)
            return 'awareness';
        if (goals.leads && goals.leads > 0)
            return 'lead_generation';
        if (goals.conversions && goals.conversions > 0)
            return 'conversion';
        if (goals.engagement && goals.engagement > 0)
            return 'engagement';
        return 'awareness';
    }
    async calculateOptimalContentMix(campaignType, platforms) {
        const baseMix = {
            awareness: { blog_post: 3, social_media_post: 10, infographic_content: 2, video_script: 1 },
            lead_generation: { whitepaper: 2, case_study: 2, email_campaign: 5, landing_page: 1 },
            engagement: { social_media_post: 15, video_script: 3, poll: 2, tutorial: 2 },
            conversion: { case_study: 3, testimonial: 2, demo: 1, email_campaign: 3 }
        };
        const mix = baseMix[campaignType] || baseMix.awareness;
        const totalPieces = Object.values(mix).reduce((sum, count) => sum + count, 0);
        return {
            totalPieces,
            distribution: mix
        };
    }
    async generateCampaignName(topic, type) {
        const typeNames = {
            awareness: 'Awareness',
            lead_generation: 'Lead Gen',
            engagement: 'Engagement',
            conversion: 'Conversion',
            product_launch: 'Launch',
            education: 'Education',
            retention: 'Retention',
            seasonal: 'Seasonal'
        };
        return `${topic} ${typeNames[type]} Campaign ${new Date().getFullYear()}`;
    }
    calculateContentFrequency(type, durationDays) {
        const frequencies = {
            awareness: Math.max(1, Math.floor(durationDays / 2)),
            lead_generation: Math.max(1, Math.floor(durationDays / 3)),
            engagement: Math.max(1, Math.floor(durationDays / 1.5)),
            conversion: Math.max(1, Math.floor(durationDays / 4))
        };
        return frequencies[type] || frequencies.awareness;
    }
    async generateContentPlan(type, targetAudience, frequency, platforms) {
        const contentPlan = [];
        const topics = await this.generateCampaignTopics(type, targetAudience);
        for (let i = 0; i < frequency; i++) {
            const topic = topics[i % topics.length];
            const contentTypes = this.getContentTypesForCampaign(type);
            const contentType = contentTypes[i % contentTypes.length];
            contentPlan.push({
                type: contentType,
                topic,
                targetAudience,
                tone: 'professional',
                seoOptimized: true,
                includeCallToAction: true,
                platform: platforms[0]
            });
        }
        return contentPlan;
    }
    generateDistributionPlan(contentPlan, platforms, startDate, endDate) {
        const distributionPlan = [];
        const totalDuration = endDate.getTime() - startDate.getTime();
        const interval = totalDuration / contentPlan.length;
        contentPlan.forEach((content, index) => {
            const scheduleTime = new Date(startDate.getTime() + interval * index);
            distributionPlan.push({
                contentId: (0, uuid_1.v4)(),
                platforms: platforms,
                scheduleTime
            });
        });
        return distributionPlan;
    }
    generateContentCalendar(contentPlan, distributionPlan, campaignId) {
        return distributionPlan.map((distribution, index) => ({
            id: (0, uuid_1.v4)(),
            contentId: distribution.contentId,
            title: contentPlan[index]?.topic || 'Campaign Content',
            type: contentPlan[index]?.type || 'blog_post',
            platform: distribution.platforms[0],
            scheduledDate: distribution.scheduleTime,
            status: 'draft',
            priority: 'medium',
            campaignId
        }));
    }
    async setupCampaignAutomation(campaignId, rules) {
        logger_1.logger.info('Campaign automation setup', { campaignId, rules });
    }
    async getCampaign(campaignId) {
        throw new Error('Not implemented - would fetch from database');
    }
    async getCampaignAnalytics(campaignId) {
        return [];
    }
    async generateSimilarContent(topContentIds, targetAudience) {
        return [];
    }
    analyzePlatformPerformance(analytics) {
        return {
            linkedin: 4.2,
            twitter: 3.8,
            facebook: 3.1,
            email: 2.9
        };
    }
    async analyzeOptimalPostingTimes(campaignId) {
        return [
            { day: 'Tuesday', hour: 14, score: 85 },
            { day: 'Wednesday', hour: 10, score: 82 }
        ];
    }
    async analyzeCampaignAudience(campaignId) {
        return {
            underPerformingSegments: ['segment1'],
            topPerformingSegments: ['segment2', 'segment3']
        };
    }
    async optimizeBudgetAllocation(campaignId) {
        return {
            recommendations: ['Reallocate 30% budget from Facebook to LinkedIn'],
            projectedImprovement: 15
        };
    }
    async pauseScheduledContent(campaignId) {
        logger_1.logger.info('Paused scheduled content', { campaignId });
    }
    async resumeScheduledContent(campaignId) {
        logger_1.logger.info('Resumed scheduled content', { campaignId });
    }
    async generateCampaignTopics(type, targetAudience) {
        const legalTechTopics = [
            'Understanding Terms of Service',
            'Privacy Policy Red Flags',
            'GDPR Compliance for Businesses',
            'Protecting Your Digital Rights',
            'Legal Document Analysis',
            'Data Privacy Best Practices',
            'User Agreement Dangers',
            'Legal Tech Innovation',
            'Consumer Protection Online',
            'Digital Contract Safety'
        ];
        return legalTechTopics;
    }
    getContentTypesForCampaign(type) {
        const contentTypes = {
            awareness: ['blog_post', 'social_media_post', 'infographic_content', 'video_script'],
            lead_generation: ['whitepaper', 'case_study', 'email_campaign', 'guide'],
            engagement: ['social_media_post', 'video_script', 'tutorial', 'newsletter'],
            conversion: ['case_study', 'email_campaign', 'landing_page', 'press_release']
        };
        return contentTypes[type] || contentTypes.awareness;
    }
}
exports.CampaignManager = CampaignManager;
//# sourceMappingURL=campaign-manager.js.map