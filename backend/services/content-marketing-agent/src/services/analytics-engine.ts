import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import {
  AnalyticsData,
  GeneratedContent,
  Platform,
  Campaign,
  ExternalAPIError
} from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

interface PerformanceMetrics {
  contentId: string;
  platform: Platform;
  impressions: number;
  engagement: number;
  clicks: number;
  shares: number;
  conversions: number;
  roi: number;
  date: Date;
}

interface ROIAnalysis {
  totalRevenue: number;
  totalCost: number;
  roi: number;
  roas: number;
  costPerAcquisition: number;
  customerLifetimeValue: number;
}

interface CompetitorAnalysis {
  competitor: string;
  engagement: number;
  followerGrowth: number;
  contentFrequency: number;
  topPerformingContent: string[];
}

interface AudienceInsights {
  demographics: {
    age: Record<string, number>;
    gender: Record<string, number>;
    location: Record<string, number>;
  };
  interests: string[];
  peakEngagementTimes: Array<{ day: string; hour: number; engagement: number }>;
  contentPreferences: Record<string, number>;
}

export class AnalyticsEngine {
  private googleAnalyticsApiUrl = 'https://analyticsdata.googleapis.com/v1beta';
  private facebookInsightsUrl = 'https://graph.facebook.com/v18.0';
  private linkedInAnalyticsUrl = 'https://api.linkedin.com/v2';
  private twitterAnalyticsUrl = 'https://api.twitter.com/2';

  constructor() {}

  async trackContentPerformance(
    contentId: string,
    platforms: Platform[],
    timeRange: { start: Date; end: Date }
  ): Promise<AnalyticsData[]> {
    try {
      logger.info('Tracking content performance', { contentId, platforms, timeRange });

      const analyticsData: AnalyticsData[] = [];

      for (const platform of platforms) {
        try {
          const data = await this.getPerformanceData(contentId, platform, timeRange);
          if (data) {
            analyticsData.push(data);
          }
        } catch (error) {
          logger.warn('Failed to get analytics for platform', { platform, error });
        }
      }

      // Calculate aggregate metrics
      const aggregatedData = this.aggregateAnalytics(analyticsData);
      
      logger.info('Content performance tracking completed', {
        contentId,
        platformsTracked: analyticsData.length,
        totalImpressions: aggregatedData.totalImpressions,
        avgEngagementRate: aggregatedData.avgEngagementRate
      });

      return analyticsData;

    } catch (error) {
      logger.error('Content performance tracking failed', { error, contentId });
      throw error;
    }
  }

  async analyzeCampaignROI(campaignId: string): Promise<ROIAnalysis> {
    try {
      logger.info('Analyzing campaign ROI', { campaignId });

      const campaignData = await this.getCampaignData(campaignId);
      const analyticsData = await this.getCampaignAnalytics(campaignId);
      
      const totalRevenue = analyticsData.reduce((sum, data) => sum + (data.revenue || 0), 0);
      const totalCost = analyticsData.reduce((sum, data) => sum + (data.cost || 0), 0);
      const totalConversions = analyticsData.reduce((sum, data) => sum + data.leads, 0);

      const roi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0;
      const roas = totalCost > 0 ? totalRevenue / totalCost : 0;
      const costPerAcquisition = totalConversions > 0 ? totalCost / totalConversions : 0;
      
      // Estimate CLV based on industry averages for legal tech
      const customerLifetimeValue = totalRevenue / Math.max(totalConversions, 1) * 12; // Assume 12-month retention

      const roiAnalysis: ROIAnalysis = {
        totalRevenue,
        totalCost,
        roi,
        roas,
        costPerAcquisition,
        customerLifetimeValue
      };

      logger.info('Campaign ROI analysis completed', { campaignId, roi, roas });

      return roiAnalysis;

    } catch (error) {
      logger.error('Campaign ROI analysis failed', { error, campaignId });
      throw error;
    }
  }

  async generateInsights(
    contentId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<{
    insights: string[];
    recommendations: string[];
    predictedPerformance: number;
  }> {
    try {
      const analyticsData = await this.trackContentPerformance(
        contentId,
        ['linkedin', 'twitter', 'facebook', 'email', 'blog'],
        timeRange
      );

      const insights = await this.extractInsights(analyticsData, contentId);
      const recommendations = await this.generateRecommendations(analyticsData, insights);
      const predictedPerformance = await this.predictFuturePerformance(analyticsData);

      return {
        insights,
        recommendations,
        predictedPerformance
      };

    } catch (error) {
      logger.error('Insight generation failed', { error, contentId });
      throw error;
    }
  }

  async analyzeAudienceEngagement(platforms: Platform[]): Promise<AudienceInsights> {
    try {
      logger.info('Analyzing audience engagement', { platforms });

      const insights: AudienceInsights = {
        demographics: {
          age: {},
          gender: {},
          location: {}
        },
        interests: [],
        peakEngagementTimes: [],
        contentPreferences: {}
      };

      for (const platform of platforms) {
        const platformInsights = await this.getPlatformAudienceInsights(platform);
        
        // Merge demographics
        this.mergeDemographics(insights.demographics, platformInsights.demographics);
        
        // Merge interests
        insights.interests = [...new Set([...insights.interests, ...platformInsights.interests])];
        
        // Merge engagement times
        insights.peakEngagementTimes.push(...platformInsights.peakEngagementTimes);
        
        // Merge content preferences
        Object.entries(platformInsights.contentPreferences).forEach(([key, value]) => {
          insights.contentPreferences[key] = (insights.contentPreferences[key] || 0) + value;
        });
      }

      // Sort and limit results
      insights.interests = insights.interests.slice(0, 20);
      insights.peakEngagementTimes = insights.peakEngagementTimes
        .sort((a, b) => b.engagement - a.engagement)
        .slice(0, 10);

      logger.info('Audience engagement analysis completed', {
        platformsAnalyzed: platforms.length,
        topInterests: insights.interests.slice(0, 5),
        peakEngagementTime: insights.peakEngagementTimes[0]
      });

      return insights;

    } catch (error) {
      logger.error('Audience engagement analysis failed', { error });
      throw error;
    }
  }

  async trackCompetitors(competitors: string[]): Promise<CompetitorAnalysis[]> {
    try {
      logger.info('Tracking competitor performance', { competitors });

      const analyses: CompetitorAnalysis[] = [];

      for (const competitor of competitors) {
        try {
          const analysis = await this.analyzeCompetitor(competitor);
          analyses.push(analysis);
        } catch (error) {
          logger.warn('Failed to analyze competitor', { competitor, error });
        }
      }

      logger.info('Competitor analysis completed', { 
        competitorsAnalyzed: analyses.length,
        avgEngagement: analyses.reduce((sum, a) => sum + a.engagement, 0) / analyses.length
      });

      return analyses;

    } catch (error) {
      logger.error('Competitor tracking failed', { error });
      throw error;
    }
  }

  async optimizePostingSchedule(
    platform: Platform,
    timeRange: { start: Date; end: Date }
  ): Promise<{
    optimalTimes: Array<{ day: string; hour: number; score: number }>;
    frequencyRecommendation: string;
    contentTypeOptimization: Record<string, number>;
  }> {
    try {
      const audienceInsights = await this.getPlatformAudienceInsights(platform);
      const performanceData = await this.getPlatformPerformanceHistory(platform, timeRange);

      const optimalTimes = audienceInsights.peakEngagementTimes
        .map(time => ({
          day: time.day,
          hour: time.hour,
          score: time.engagement
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      const frequencyRecommendation = this.calculateOptimalFrequency(performanceData);
      const contentTypeOptimization = this.analyzeContentTypePerformance(performanceData);

      return {
        optimalTimes,
        frequencyRecommendation,
        contentTypeOptimization
      };

    } catch (error) {
      logger.error('Posting schedule optimization failed', { error, platform });
      throw error;
    }
  }

  private async getPerformanceData(
    contentId: string,
    platform: Platform,
    timeRange: { start: Date; end: Date }
  ): Promise<AnalyticsData | null> {
    switch (platform) {
      case 'linkedin':
        return await this.getLinkedInAnalytics(contentId, timeRange);
      case 'twitter':
        return await this.getTwitterAnalytics(contentId, timeRange);
      case 'facebook':
        return await this.getFacebookAnalytics(contentId, timeRange);
      case 'email':
        return await this.getEmailAnalytics(contentId, timeRange);
      case 'blog':
        return await this.getBlogAnalytics(contentId, timeRange);
      default:
        return null;
    }
  }

  private async getLinkedInAnalytics(
    contentId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<AnalyticsData> {
    try {
      // LinkedIn Analytics API would be called here
      // For now, return mock data
      return {
        contentId,
        platform: 'linkedin',
        date: new Date(),
        impressions: Math.floor(Math.random() * 10000) + 1000,
        clicks: Math.floor(Math.random() * 500) + 50,
        shares: Math.floor(Math.random() * 100) + 10,
        likes: Math.floor(Math.random() * 200) + 20,
        comments: Math.floor(Math.random() * 50) + 5,
        saves: Math.floor(Math.random() * 30) + 3,
        engagementRate: Math.random() * 5 + 1,
        clickThroughRate: Math.random() * 2 + 0.5,
        conversionRate: Math.random() * 0.5 + 0.1,
        leads: Math.floor(Math.random() * 20) + 2,
        revenue: Math.random() * 1000 + 100,
        cost: Math.random() * 200 + 50
      };
    } catch (error) {
      logger.error('LinkedIn analytics fetch failed', { error, contentId });
      throw new ExternalAPIError('LinkedIn', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async getTwitterAnalytics(
    contentId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<AnalyticsData> {
    try {
      // Twitter Analytics API would be called here
      return {
        contentId,
        platform: 'twitter',
        date: new Date(),
        impressions: Math.floor(Math.random() * 5000) + 500,
        clicks: Math.floor(Math.random() * 200) + 20,
        shares: Math.floor(Math.random() * 150) + 15,
        likes: Math.floor(Math.random() * 300) + 30,
        comments: Math.floor(Math.random() * 80) + 8,
        saves: Math.floor(Math.random() * 20) + 2,
        engagementRate: Math.random() * 3 + 1,
        clickThroughRate: Math.random() * 1.5 + 0.3,
        conversionRate: Math.random() * 0.3 + 0.05,
        leads: Math.floor(Math.random() * 10) + 1,
        revenue: Math.random() * 500 + 50,
        cost: Math.random() * 100 + 25
      };
    } catch (error) {
      logger.error('Twitter analytics fetch failed', { error, contentId });
      throw new ExternalAPIError('Twitter', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async getFacebookAnalytics(
    contentId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<AnalyticsData> {
    try {
      // Facebook Insights API would be called here
      return {
        contentId,
        platform: 'facebook',
        date: new Date(),
        impressions: Math.floor(Math.random() * 8000) + 800,
        clicks: Math.floor(Math.random() * 300) + 30,
        shares: Math.floor(Math.random() * 80) + 8,
        likes: Math.floor(Math.random() * 400) + 40,
        comments: Math.floor(Math.random() * 60) + 6,
        saves: Math.floor(Math.random() * 15) + 1,
        engagementRate: Math.random() * 4 + 1,
        clickThroughRate: Math.random() * 1.8 + 0.4,
        conversionRate: Math.random() * 0.4 + 0.08,
        leads: Math.floor(Math.random() * 15) + 1,
        revenue: Math.random() * 750 + 75,
        cost: Math.random() * 150 + 30
      };
    } catch (error) {
      logger.error('Facebook analytics fetch failed', { error, contentId });
      throw new ExternalAPIError('Facebook', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async getEmailAnalytics(
    contentId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<AnalyticsData> {
    try {
      // Email service analytics (SendGrid, Mailchimp) would be called here
      return {
        contentId,
        platform: 'email',
        date: new Date(),
        impressions: Math.floor(Math.random() * 2000) + 200, // Emails sent
        clicks: Math.floor(Math.random() * 100) + 10,
        shares: 0, // Not applicable for email
        likes: 0, // Not applicable for email
        comments: 0, // Not applicable for email
        saves: 0, // Not applicable for email
        engagementRate: Math.random() * 25 + 15, // Open rate
        clickThroughRate: Math.random() * 8 + 2,
        conversionRate: Math.random() * 2 + 0.5,
        leads: Math.floor(Math.random() * 25) + 5,
        revenue: Math.random() * 1500 + 200,
        cost: Math.random() * 100 + 20
      };
    } catch (error) {
      logger.error('Email analytics fetch failed', { error, contentId });
      throw new ExternalAPIError('Email', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async getBlogAnalytics(
    contentId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<AnalyticsData> {
    try {
      // Google Analytics would be used here
      return {
        contentId,
        platform: 'blog',
        date: new Date(),
        impressions: Math.floor(Math.random() * 15000) + 1500,
        clicks: Math.floor(Math.random() * 800) + 80,
        shares: Math.floor(Math.random() * 50) + 5,
        likes: 0, // Not directly trackable on blog
        comments: Math.floor(Math.random() * 20) + 2,
        saves: 0, // Not directly trackable
        engagementRate: Math.random() * 6 + 2,
        clickThroughRate: Math.random() * 3 + 1,
        conversionRate: Math.random() * 1 + 0.2,
        leads: Math.floor(Math.random() * 30) + 5,
        revenue: Math.random() * 2000 + 300,
        cost: Math.random() * 300 + 100
      };
    } catch (error) {
      logger.error('Blog analytics fetch failed', { error, contentId });
      throw new ExternalAPIError('Google Analytics', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async getCampaignData(campaignId: string): Promise<Campaign> {
    // This would fetch from database
    // Placeholder implementation
    return {
      id: campaignId,
      name: 'Sample Campaign',
      description: 'Campaign description',
      type: 'awareness',
      startDate: new Date(),
      endDate: new Date(),
      targetAudience: 'Privacy-conscious users',
      goals: ['increase_awareness', 'generate_leads'],
      kpis: { impressions: 100000, leads: 500 },
      status: 'active',
      contentIds: [],
      platforms: ['linkedin', 'twitter'],
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  private async getCampaignAnalytics(campaignId: string): Promise<AnalyticsData[]> {
    // This would aggregate analytics for all campaign content
    // Placeholder implementation
    return [];
  }

  private aggregateAnalytics(analyticsData: AnalyticsData[]): {
    totalImpressions: number;
    totalClicks: number;
    avgEngagementRate: number;
    totalLeads: number;
    totalRevenue: number;
  } {
    const totals = analyticsData.reduce(
      (acc, data) => ({
        impressions: acc.impressions + data.impressions,
        clicks: acc.clicks + data.clicks,
        engagementRate: acc.engagementRate + data.engagementRate,
        leads: acc.leads + data.leads,
        revenue: acc.revenue + (data.revenue || 0)
      }),
      { impressions: 0, clicks: 0, engagementRate: 0, leads: 0, revenue: 0 }
    );

    return {
      totalImpressions: totals.impressions,
      totalClicks: totals.clicks,
      avgEngagementRate: totals.engagementRate / analyticsData.length,
      totalLeads: totals.leads,
      totalRevenue: totals.revenue
    };
  }

  private async extractInsights(analyticsData: AnalyticsData[], contentId: string): Promise<string[]> {
    const insights: string[] = [];
    
    const bestPerforming = analyticsData.sort((a, b) => b.engagementRate - a.engagementRate)[0];
    if (bestPerforming) {
      insights.push(`${bestPerforming.platform} generated the highest engagement rate at ${bestPerforming.engagementRate.toFixed(2)}%`);
    }

    const totalLeads = analyticsData.reduce((sum, data) => sum + data.leads, 0);
    insights.push(`Generated ${totalLeads} leads across all platforms`);

    const avgCTR = analyticsData.reduce((sum, data) => sum + data.clickThroughRate, 0) / analyticsData.length;
    if (avgCTR > 2) {
      insights.push('Above-average click-through rate indicates strong content relevance');
    } else {
      insights.push('Click-through rate suggests room for improvement in call-to-action');
    }

    return insights;
  }

  private async generateRecommendations(analyticsData: AnalyticsData[], insights: string[]): Promise<string[]> {
    const recommendations: string[] = [];
    
    const bestPlatform = analyticsData.sort((a, b) => b.engagementRate - a.engagementRate)[0];
    if (bestPlatform) {
      recommendations.push(`Focus more budget on ${bestPlatform.platform} which shows highest engagement`);
    }

    const avgConversionRate = analyticsData.reduce((sum, data) => sum + data.conversionRate, 0) / analyticsData.length;
    if (avgConversionRate < 1) {
      recommendations.push('Consider A/B testing different call-to-action phrases to improve conversion rates');
    }

    recommendations.push('Republish high-performing content with slight variations to extend reach');
    recommendations.push('Create similar content to top-performing posts for consistent engagement');

    return recommendations;
  }

  private async predictFuturePerformance(analyticsData: AnalyticsData[]): Promise<number> {
    // Simple prediction based on historical performance
    const avgEngagement = analyticsData.reduce((sum, data) => sum + data.engagementRate, 0) / analyticsData.length;
    const trend = this.calculateTrend(analyticsData);
    
    return Math.max(0, Math.min(100, avgEngagement * (1 + trend)));
  }

  private calculateTrend(analyticsData: AnalyticsData[]): number {
    if (analyticsData.length < 2) return 0;
    
    const recent = analyticsData.slice(-3);
    const older = analyticsData.slice(0, -3);
    
    const recentAvg = recent.reduce((sum, data) => sum + data.engagementRate, 0) / recent.length;
    const olderAvg = older.reduce((sum, data) => sum + data.engagementRate, 0) / Math.max(older.length, 1);
    
    return (recentAvg - olderAvg) / Math.max(olderAvg, 1);
  }

  private async getPlatformAudienceInsights(platform: Platform): Promise<AudienceInsights> {
    // Platform-specific audience insights would be fetched here
    // Mock implementation
    return {
      demographics: {
        age: { '25-34': 35, '35-44': 30, '45-54': 20, '18-24': 10, '55+': 5 },
        gender: { 'male': 55, 'female': 45 },
        location: { 'US': 60, 'UK': 15, 'Canada': 10, 'Australia': 8, 'Other': 7 }
      },
      interests: ['privacy', 'technology', 'legal', 'business', 'security'],
      peakEngagementTimes: [
        { day: 'Tuesday', hour: 14, engagement: 85 },
        { day: 'Wednesday', hour: 10, engagement: 82 },
        { day: 'Thursday', hour: 15, engagement: 78 }
      ],
      contentPreferences: {
        'how-to': 40,
        'news': 25,
        'analysis': 20,
        'case-study': 15
      }
    };
  }

  private mergeDemographics(
    target: AudienceInsights['demographics'],
    source: AudienceInsights['demographics']
  ): void {
    ['age', 'gender', 'location'].forEach(key => {
      const targetDemo = target[key as keyof typeof target];
      const sourceDemo = source[key as keyof typeof source];
      
      Object.entries(sourceDemo).forEach(([k, v]) => {
        targetDemo[k] = (targetDemo[k] || 0) + v;
      });
    });
  }

  private async analyzeCompetitor(competitor: string): Promise<CompetitorAnalysis> {
    // This would use social media APIs to analyze competitor performance
    // Mock implementation
    return {
      competitor,
      engagement: Math.random() * 10 + 2,
      followerGrowth: Math.random() * 5 + 1,
      contentFrequency: Math.floor(Math.random() * 10) + 3,
      topPerformingContent: [
        'How to protect your data',
        'Privacy policy analysis',
        'GDPR compliance guide'
      ]
    };
  }

  private async getPlatformPerformanceHistory(
    platform: Platform,
    timeRange: { start: Date; end: Date }
  ): Promise<PerformanceMetrics[]> {
    // Mock historical performance data
    const metrics: PerformanceMetrics[] = [];
    const days = Math.floor((timeRange.end.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60 * 24));
    
    for (let i = 0; i < days; i++) {
      const date = new Date(timeRange.start.getTime() + i * 24 * 60 * 60 * 1000);
      metrics.push({
        contentId: uuidv4(),
        platform,
        impressions: Math.floor(Math.random() * 5000) + 1000,
        engagement: Math.random() * 10 + 1,
        clicks: Math.floor(Math.random() * 200) + 50,
        shares: Math.floor(Math.random() * 50) + 10,
        conversions: Math.floor(Math.random() * 10) + 1,
        roi: Math.random() * 200 + 50,
        date
      });
    }
    
    return metrics;
  }

  private calculateOptimalFrequency(performanceData: PerformanceMetrics[]): string {
    const avgEngagement = performanceData.reduce((sum, data) => sum + data.engagement, 0) / performanceData.length;
    
    if (avgEngagement > 8) return 'Post 2-3 times per day';
    if (avgEngagement > 5) return 'Post 1-2 times per day';
    if (avgEngagement > 3) return 'Post once per day';
    return 'Post 3-5 times per week';
  }

  private analyzeContentTypePerformance(performanceData: PerformanceMetrics[]): Record<string, number> {
    // Mock content type performance analysis
    return {
      'how-to-guides': 85,
      'news-updates': 72,
      'case-studies': 68,
      'infographics': 78,
      'videos': 82
    };
  }
}