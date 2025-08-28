import { AnalyticsData, Platform } from '../types';
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
    peakEngagementTimes: Array<{
        day: string;
        hour: number;
        engagement: number;
    }>;
    contentPreferences: Record<string, number>;
}
export declare class AnalyticsEngine {
    private googleAnalyticsApiUrl;
    private facebookInsightsUrl;
    private linkedInAnalyticsUrl;
    private twitterAnalyticsUrl;
    constructor();
    trackContentPerformance(contentId: string, platforms: Platform[], timeRange: {
        start: Date;
        end: Date;
    }): Promise<AnalyticsData[]>;
    analyzeCampaignROI(campaignId: string): Promise<ROIAnalysis>;
    generateInsights(contentId: string, timeRange: {
        start: Date;
        end: Date;
    }): Promise<{
        insights: string[];
        recommendations: string[];
        predictedPerformance: number;
    }>;
    analyzeAudienceEngagement(platforms: Platform[]): Promise<AudienceInsights>;
    trackCompetitors(competitors: string[]): Promise<CompetitorAnalysis[]>;
    optimizePostingSchedule(platform: Platform, timeRange: {
        start: Date;
        end: Date;
    }): Promise<{
        optimalTimes: Array<{
            day: string;
            hour: number;
            score: number;
        }>;
        frequencyRecommendation: string;
        contentTypeOptimization: Record<string, number>;
    }>;
    private getPerformanceData;
    private getLinkedInAnalytics;
    private getTwitterAnalytics;
    private getFacebookAnalytics;
    private getEmailAnalytics;
    private getBlogAnalytics;
    private getCampaignData;
    private getCampaignAnalytics;
    private aggregateAnalytics;
    private extractInsights;
    private generateRecommendations;
    private predictFuturePerformance;
    private calculateTrend;
    private getPlatformAudienceInsights;
    private mergeDemographics;
    private analyzeCompetitor;
    private getPlatformPerformanceHistory;
    private calculateOptimalFrequency;
    private analyzeContentTypePerformance;
}
export {};
//# sourceMappingURL=analytics-engine.d.ts.map