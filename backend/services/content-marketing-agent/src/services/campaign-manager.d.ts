import { Campaign, CampaignType, GeneratedContent, Platform, Lead } from '../types';
interface CampaignGoals {
    impressions?: number;
    engagement?: number;
    leads?: number;
    conversions?: number;
    revenue?: number;
    brandAwareness?: number;
}
export declare class CampaignManager {
    private contentEngine;
    private distributionEngine;
    private analyticsEngine;
    private leadEngine;
    constructor();
    createCampaign(name: string, type: CampaignType, description: string, targetAudience: string, goals: CampaignGoals, duration: {
        start: Date;
        end: Date;
    }, platforms: Platform[], budget?: number): Promise<Campaign>;
    generateAutonomousCampaign(topic: string, targetAudience: string, goals: CampaignGoals, platforms: Platform[], duration?: number): Promise<Campaign>;
    optimizeCampaign(campaignId: string): Promise<{
        optimizations: string[];
        projectedImprovement: number;
        newContent?: GeneratedContent[];
    }>;
    pauseCampaign(campaignId: string, reason?: string): Promise<void>;
    resumeCampaign(campaignId: string): Promise<void>;
    generateLeadsFromCampaign(campaignId: string, leadMagnets: string[]): Promise<Lead[]>;
    private generateCampaignPlan;
    private createCampaignContent;
    private scheduleCampaignContent;
    private determineCampaignType;
    private calculateOptimalContentMix;
    private generateCampaignName;
    private calculateContentFrequency;
    private generateContentPlan;
    private generateDistributionPlan;
    private generateContentCalendar;
    private setupCampaignAutomation;
    private getCampaign;
    private getCampaignAnalytics;
    private generateSimilarContent;
    private analyzePlatformPerformance;
    private analyzeOptimalPostingTimes;
    private analyzeCampaignAudience;
    private optimizeBudgetAllocation;
    private pauseScheduledContent;
    private resumeScheduledContent;
    private generateCampaignTopics;
    private getContentTypesForCampaign;
}
export {};
//# sourceMappingURL=campaign-manager.d.ts.map