import { Lead, EmailCampaign } from '../types';
interface LeadMagnet {
    id: string;
    title: string;
    description: string;
    type: 'whitepaper' | 'guide' | 'checklist' | 'template' | 'webinar' | 'free_trial';
    downloadUrl: string;
    landingPageUrl: string;
    conversionRate: number;
}
interface LeadNurturingSequence {
    id: string;
    name: string;
    emails: EmailCampaign[];
    triggers: Array<{
        condition: string;
        action: string;
        delay: number;
    }>;
    goals: string[];
}
interface PersonalizationData {
    firstName?: string;
    lastName?: string;
    company?: string;
    industry?: string;
    interests: string[];
    painPoints: string[];
    contentPreferences: string[];
}
export declare class LeadGenerationEngine {
    private leadScoringRules;
    private leadMagnets;
    constructor();
    generateLeadsFromContent(contentIds: string[], leadMagnets: string[], targetAudience: string): Promise<Lead[]>;
    createLeadMagnet(title: string, type: LeadMagnet['type'], targetAudience: string, topic: string): Promise<LeadMagnet>;
    setupNurturingCampaign(segmentName: string, leads: Lead[], goals: string[]): Promise<LeadNurturingSequence>;
    personalizeLandingPage(leadMagnetId: string, visitorData: PersonalizationData): Promise<{
        headline: string;
        subheadline: string;
        benefitsList: string[];
        ctaText: string;
        socialProof: string;
    }>;
    identifyHotLeads(leads: Lead[]): Promise<Lead[]>;
    optimizeLeadGeneration(campaignId: string): Promise<{
        recommendations: string[];
        projectedImprovement: number;
        optimizedLeadMagnets: LeadMagnet[];
    }>;
    private generateLeadsFromSingleContent;
    private scoreLeads;
    private setupNurturingSequences;
    private createNurturingSequence;
    private generateNurturingEmails;
    private enrollInNurturingSequence;
    private generateLeadMagnetDescription;
    private estimateConversionRate;
    private generatePersonalizedContent;
    private hasHighEngagementBehavior;
    private hasUrgentPainPoints;
    private calculateConversionProbability;
    private analyzeLeadGenPerformance;
    private generateOptimizedLeadMagnets;
    private segmentLeads;
    private generateEmailContent;
    private generateEmailHTML;
    private isTargetIndustry;
    private initializeLeadScoringRules;
    private initializeLeadMagnets;
    private generateRandomEmail;
    private generateRandomFirstName;
    private generateRandomLastName;
    private generateRandomCompany;
    private generateRandomTitle;
    private generateLeadTags;
}
export {};
//# sourceMappingURL=lead-generation-engine.d.ts.map