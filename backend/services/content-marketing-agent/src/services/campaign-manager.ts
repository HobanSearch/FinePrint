import { v4 as uuidv4 } from 'uuid';
import {
  Campaign,
  CampaignType,
  GeneratedContent,
  ContentCreationRequest,
  Platform,
  Lead,
  ContentCalendarEntry,
  ValidationError
} from '../types';
import { ContentCreationEngine } from './content-creation-engine';
import { ContentDistributionEngine } from './content-distribution-engine';
import { AnalyticsEngine } from './analytics-engine';
import { LeadGenerationEngine } from './lead-generation-engine';
import { logger } from '../utils/logger';

interface CampaignPlan {
  campaign: Campaign;
  contentPlan: ContentCreationRequest[];
  distributionPlan: Array<{
    contentId: string;
    platforms: Platform[];
    scheduleTime: Date;
  }>;
  calendar: ContentCalendarEntry[];
}

interface CampaignGoals {
  impressions?: number;
  engagement?: number;
  leads?: number;
  conversions?: number;
  revenue?: number;
  brandAwareness?: number;
}

interface CampaignAutomationRules {
  autoPublish: boolean;
  autoOptimize: boolean;
  autoScale: boolean;
  budgetCap?: number;
  performanceThresholds: {
    pauseIfEngagementBelow: number;
    scaleIfEngagementAbove: number;
    maxDailySpend: number;
  };
}

export class CampaignManager {
  private contentEngine: ContentCreationEngine;
  private distributionEngine: ContentDistributionEngine;
  private analyticsEngine: AnalyticsEngine;
  private leadEngine: LeadGenerationEngine;

  constructor() {
    this.contentEngine = new ContentCreationEngine();
    this.distributionEngine = new ContentDistributionEngine();
    this.analyticsEngine = new AnalyticsEngine();
    this.leadEngine = new LeadGenerationEngine();
  }

  async createCampaign(
    name: string,
    type: CampaignType,
    description: string,
    targetAudience: string,
    goals: CampaignGoals,
    duration: { start: Date; end: Date },
    platforms: Platform[],
    budget?: number
  ): Promise<Campaign> {
    try {
      logger.info('Creating new campaign', { name, type, targetAudience });

      const campaign: Campaign = {
        id: uuidv4(),
        name,
        description,
        type,
        startDate: duration.start,
        endDate: duration.end,
        targetAudience,
        goals: Object.keys(goals),
        kpis: goals as Record<string, number>,
        budget,
        status: 'planning',
        contentIds: [],
        platforms,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Generate campaign plan
      const campaignPlan = await this.generateCampaignPlan(campaign);
      
      // Create initial content based on plan
      const initialContent = await this.createCampaignContent(campaignPlan.contentPlan, campaign.id);
      campaign.contentIds = initialContent.map(content => content.id);

      // Schedule content distribution
      await this.scheduleCampaignContent(campaignPlan.distributionPlan, initialContent);

      campaign.status = 'active';
      campaign.updatedAt = new Date();

      logger.info('Campaign created successfully', {
        campaignId: campaign.id,
        contentPieces: campaign.contentIds.length,
        platforms: platforms.length
      });

      return campaign;

    } catch (error) {
      logger.error('Campaign creation failed', { error, name });
      throw error;
    }
  }

  async generateAutonomousCampaign(
    topic: string,
    targetAudience: string,
    goals: CampaignGoals,
    platforms: Platform[],
    duration: number = 30 // days
  ): Promise<Campaign> {
    try {
      logger.info('Generating autonomous campaign', { topic, targetAudience, duration });

      // Determine campaign type based on goals
      const campaignType = this.determineCampaignType(goals);
      
      // Calculate optimal content mix
      const contentMix = await this.calculateOptimalContentMix(campaignType, platforms);
      
      // Generate campaign name
      const campaignName = await this.generateCampaignName(topic, campaignType);
      
      // Set duration
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + duration * 24 * 60 * 60 * 1000);

      // Create campaign
      const campaign = await this.createCampaign(
        campaignName,
        campaignType,
        `Autonomous ${campaignType} campaign for ${topic}`,
        targetAudience,
        goals,
        { start: startDate, end: endDate },
        platforms
      );

      // Set up automation rules
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

      logger.info('Autonomous campaign generated', {
        campaignId: campaign.id,
        contentPieces: contentMix.totalPieces,
        automationEnabled: true
      });

      return campaign;

    } catch (error) {
      logger.error('Autonomous campaign generation failed', { error, topic });
      throw error;
    }
  }

  async optimizeCampaign(campaignId: string): Promise<{
    optimizations: string[];
    projectedImprovement: number;
    newContent?: GeneratedContent[];
  }> {
    try {
      logger.info('Optimizing campaign', { campaignId });

      const campaign = await this.getCampaign(campaignId);
      const analytics = await this.getCampaignAnalytics(campaignId);
      
      const optimizations: string[] = [];
      let projectedImprovement = 0;
      let newContent: GeneratedContent[] = [];

      // Analyze performance and identify optimizations
      const topPerformingContent = analytics
        .sort((a, b) => b.engagementRate - a.engagementRate)
        .slice(0, 3);

      const lowPerformingContent = analytics
        .filter(a => a.engagementRate < 2.0);

      // Content optimization
      if (topPerformingContent.length > 0) {
        optimizations.push('Create variations of top-performing content');
        
        // Generate similar content to top performers
        const similarContent = await this.generateSimilarContent(
          topPerformingContent.map(a => a.contentId),
          campaign.targetAudience
        );
        newContent.push(...similarContent);
        projectedImprovement += 25;
      }

      // Platform optimization
      const platformPerformance = this.analyzePlatformPerformance(analytics);
      const bestPlatform = Object.entries(platformPerformance)
        .sort(([,a], [,b]) => b - a)[0];

      if (bestPlatform) {
        optimizations.push(`Increase budget allocation to ${bestPlatform[0]} (${bestPlatform[1].toFixed(1)}% engagement)`);
        projectedImprovement += 15;
      }

      // Timing optimization
      const optimalTimes = await this.analyzeOptimalPostingTimes(campaignId);
      if (optimalTimes.length > 0) {
        optimizations.push('Reschedule content to optimal engagement times');
        projectedImprovement += 10;
      }

      // Audience optimization
      const audienceInsights = await this.analyzeCampaignAudience(campaignId);
      if (audienceInsights.underPerformingSegments.length > 0) {
        optimizations.push('Refine targeting to exclude underperforming audience segments');
        projectedImprovement += 20;
      }

      // Budget optimization
      if (campaign.budget) {
        const budgetOptimization = await this.optimizeBudgetAllocation(campaignId);
        optimizations.push(...budgetOptimization.recommendations);
        projectedImprovement += budgetOptimization.projectedImprovement;
      }

      logger.info('Campaign optimization completed', {
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

    } catch (error) {
      logger.error('Campaign optimization failed', { error, campaignId });
      throw error;
    }
  }

  async pauseCampaign(campaignId: string, reason?: string): Promise<void> {
    try {
      const campaign = await this.getCampaign(campaignId);
      campaign.status = 'paused';
      campaign.updatedAt = new Date();

      // Pause all scheduled content
      await this.pauseScheduledContent(campaignId);

      logger.info('Campaign paused', { campaignId, reason });
    } catch (error) {
      logger.error('Campaign pause failed', { error, campaignId });
      throw error;
    }
  }

  async resumeCampaign(campaignId: string): Promise<void> {
    try {
      const campaign = await this.getCampaign(campaignId);
      campaign.status = 'active';
      campaign.updatedAt = new Date();

      // Resume scheduled content
      await this.resumeScheduledContent(campaignId);

      logger.info('Campaign resumed', { campaignId });
    } catch (error) {
      logger.error('Campaign resume failed', { error, campaignId });
      throw error;
    }
  }

  async generateLeadsFromCampaign(
    campaignId: string,
    leadMagnets: string[]
  ): Promise<Lead[]> {
    try {
      logger.info('Generating leads from campaign', { campaignId, leadMagnets });

      const campaign = await this.getCampaign(campaignId);
      const campaignAnalytics = await this.getCampaignAnalytics(campaignId);

      // Identify high-performing content for lead generation
      const highPerformingContent = campaignAnalytics
        .filter(a => a.engagementRate > 3.0)
        .map(a => a.contentId);

      // Generate leads using the lead engine
      const leads = await this.leadEngine.generateLeadsFromContent(
        highPerformingContent,
        leadMagnets,
        campaign.targetAudience
      );

      // Update campaign with lead generation results
      const totalLeads = leads.length;
      campaign.kpis.leads = (campaign.kpis.leads || 0) + totalLeads;
      campaign.updatedAt = new Date();

      logger.info('Leads generated from campaign', {
        campaignId,
        leadsGenerated: totalLeads,
        qualifiedLeads: leads.filter(l => l.score >= 70).length
      });

      return leads;

    } catch (error) {
      logger.error('Campaign lead generation failed', { error, campaignId });
      throw error;
    }
  }

  private async generateCampaignPlan(campaign: Campaign): Promise<CampaignPlan> {
    const durationDays = Math.ceil(
      (campaign.endDate.getTime() - campaign.startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Calculate content frequency based on campaign type and duration
    const contentFrequency = this.calculateContentFrequency(campaign.type, durationDays);
    
    // Generate content plan
    const contentPlan = await this.generateContentPlan(
      campaign.type,
      campaign.targetAudience,
      contentFrequency,
      campaign.platforms
    );

    // Generate distribution plan
    const distributionPlan = this.generateDistributionPlan(
      contentPlan,
      campaign.platforms,
      campaign.startDate,
      campaign.endDate
    );

    // Generate calendar
    const calendar = this.generateContentCalendar(contentPlan, distributionPlan, campaign.id);

    return {
      campaign,
      contentPlan,
      distributionPlan,
      calendar
    };
  }

  private async createCampaignContent(
    contentPlan: ContentCreationRequest[],
    campaignId: string
  ): Promise<GeneratedContent[]> {
    const content: GeneratedContent[] = [];

    for (const request of contentPlan) {
      try {
        const generatedContent = await this.contentEngine.createContent({
          ...request,
          campaignId
        });
        content.push(generatedContent);
      } catch (error) {
        logger.warn('Failed to create campaign content', { error, request });
      }
    }

    return content;
  }

  private async scheduleCampaignContent(
    distributionPlan: Array<{
      contentId: string;
      platforms: Platform[];
      scheduleTime: Date;
    }>,
    content: GeneratedContent[]
  ): Promise<void> {
    for (const plan of distributionPlan) {
      const contentPiece = content.find(c => c.id === plan.contentId);
      if (contentPiece) {
        try {
          await this.distributionEngine.scheduleContent(
            contentPiece,
            plan.platforms,
            plan.scheduleTime
          );
        } catch (error) {
          logger.warn('Failed to schedule content', { error, contentId: plan.contentId });
        }
      }
    }
  }

  private determineCampaignType(goals: CampaignGoals): CampaignType {
    if (goals.brandAwareness && goals.brandAwareness > 0) return 'awareness';
    if (goals.leads && goals.leads > 0) return 'lead_generation';
    if (goals.conversions && goals.conversions > 0) return 'conversion';
    if (goals.engagement && goals.engagement > 0) return 'engagement';
    return 'awareness';
  }

  private async calculateOptimalContentMix(
    campaignType: CampaignType,
    platforms: Platform[]
  ): Promise<{ totalPieces: number; distribution: Record<string, number> }> {
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

  private async generateCampaignName(topic: string, type: CampaignType): Promise<string> {
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

  private calculateContentFrequency(type: CampaignType, durationDays: number): number {
    const frequencies = {
      awareness: Math.max(1, Math.floor(durationDays / 2)),
      lead_generation: Math.max(1, Math.floor(durationDays / 3)),
      engagement: Math.max(1, Math.floor(durationDays / 1.5)),
      conversion: Math.max(1, Math.floor(durationDays / 4))
    };

    return frequencies[type] || frequencies.awareness;
  }

  private async generateContentPlan(
    type: CampaignType,
    targetAudience: string,
    frequency: number,
    platforms: Platform[]
  ): Promise<ContentCreationRequest[]> {
    const contentPlan: ContentCreationRequest[] = [];
    
    const topics = await this.generateCampaignTopics(type, targetAudience);
    
    for (let i = 0; i < frequency; i++) {
      const topic = topics[i % topics.length];
      
      // Vary content types
      const contentTypes = this.getContentTypesForCampaign(type);
      const contentType = contentTypes[i % contentTypes.length];
      
      contentPlan.push({
        type: contentType,
        topic,
        targetAudience,
        tone: 'professional',
        seoOptimized: true,
        includeCallToAction: true,
        platform: platforms[0] // Primary platform
      });
    }

    return contentPlan;
  }

  private generateDistributionPlan(
    contentPlan: ContentCreationRequest[],
    platforms: Platform[],
    startDate: Date,
    endDate: Date
  ): Array<{
    contentId: string;
    platforms: Platform[];
    scheduleTime: Date;
  }> {
    const distributionPlan: Array<{
      contentId: string;
      platforms: Platform[];
      scheduleTime: Date;
    }> = [];

    const totalDuration = endDate.getTime() - startDate.getTime();
    const interval = totalDuration / contentPlan.length;

    contentPlan.forEach((content, index) => {
      const scheduleTime = new Date(startDate.getTime() + interval * index);
      
      distributionPlan.push({
        contentId: uuidv4(), // This would be the actual content ID after creation
        platforms: platforms,
        scheduleTime
      });
    });

    return distributionPlan;
  }

  private generateContentCalendar(
    contentPlan: ContentCreationRequest[],
    distributionPlan: Array<{
      contentId: string;
      platforms: Platform[];
      scheduleTime: Date;
    }>,
    campaignId: string
  ): ContentCalendarEntry[] {
    return distributionPlan.map((distribution, index) => ({
      id: uuidv4(),
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

  private async setupCampaignAutomation(
    campaignId: string,
    rules: CampaignAutomationRules
  ): Promise<void> {
    // This would set up automation rules in the system
    logger.info('Campaign automation setup', { campaignId, rules });
  }

  private async getCampaign(campaignId: string): Promise<Campaign> {
    // This would fetch from database
    throw new Error('Not implemented - would fetch from database');
  }

  private async getCampaignAnalytics(campaignId: string): Promise<Array<{
    contentId: string;
    engagementRate: number;
    platform: string;
  }>> {
    // This would fetch analytics for campaign content
    return [];
  }

  private async generateSimilarContent(
    topContentIds: string[],
    targetAudience: string
  ): Promise<GeneratedContent[]> {
    // This would analyze top content and generate similar pieces
    return [];
  }

  private analyzePlatformPerformance(analytics: any[]): Record<string, number> {
    // Analyze performance by platform
    return {
      linkedin: 4.2,
      twitter: 3.8,
      facebook: 3.1,
      email: 2.9
    };
  }

  private async analyzeOptimalPostingTimes(campaignId: string): Promise<Array<{
    day: string;
    hour: number;
    score: number;
  }>> {
    // Analyze when audience is most active
    return [
      { day: 'Tuesday', hour: 14, score: 85 },
      { day: 'Wednesday', hour: 10, score: 82 }
    ];
  }

  private async analyzeCampaignAudience(campaignId: string): Promise<{
    underPerformingSegments: string[];
    topPerformingSegments: string[];
  }> {
    return {
      underPerformingSegments: ['segment1'],
      topPerformingSegments: ['segment2', 'segment3']
    };
  }

  private async optimizeBudgetAllocation(campaignId: string): Promise<{
    recommendations: string[];
    projectedImprovement: number;
  }> {
    return {
      recommendations: ['Reallocate 30% budget from Facebook to LinkedIn'],
      projectedImprovement: 15
    };
  }

  private async pauseScheduledContent(campaignId: string): Promise<void> {
    // Pause all scheduled content for campaign
    logger.info('Paused scheduled content', { campaignId });
  }

  private async resumeScheduledContent(campaignId: string): Promise<void> {
    // Resume scheduled content for campaign
    logger.info('Resumed scheduled content', { campaignId });
  }

  private async generateCampaignTopics(type: CampaignType, targetAudience: string): Promise<string[]> {
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

  private getContentTypesForCampaign(type: CampaignType): Array<any> {
    const contentTypes = {
      awareness: ['blog_post', 'social_media_post', 'infographic_content', 'video_script'],
      lead_generation: ['whitepaper', 'case_study', 'email_campaign', 'guide'],
      engagement: ['social_media_post', 'video_script', 'tutorial', 'newsletter'],
      conversion: ['case_study', 'email_campaign', 'landing_page', 'press_release']
    };

    return contentTypes[type] || contentTypes.awareness;
  }
}