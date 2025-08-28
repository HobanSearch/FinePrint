interface ProposalRequest {
    opportunityId: string;
    templateId?: string;
    customizations?: Record<string, any>;
    sections?: string[];
}
export declare class ProposalGenerationService {
    private prisma;
    private openai;
    private templates;
    constructor();
    generateProposal(request: ProposalRequest): Promise<{
        id: string;
        content: string;
        sections: any[];
        metadata: any;
    }>;
    generatePricingOptions(opportunityId: string): Promise<{
        tiers: PricingTier[];
        recommendations: string[];
    }>;
    generateExecutiveSummary(opportunityId: string): Promise<string>;
    generateROIAnalysis(opportunityId: string): Promise<{
        currentCosts: any;
        projectedSavings: any;
        roi: number;
        paybackPeriod: number;
        breakdown: any[];
    }>;
    customizeForIndustry(opportunityId: string, industry: string): Promise<{
        customizations: any;
        case_studies: any[];
        compliance_focus: string[];
    }>;
    private getOpportunityDetails;
    private selectTemplate;
    private personalizeSections;
    private enhanceWithAI;
    private enhanceSectionWithAI;
    private compileFinalProposal;
    private saveProposal;
    private generateTieredPricing;
    private generatePricingRecommendations;
    private replaceVariables;
    private inferIndustry;
    private estimateEmployeeCount;
    private estimateCurrentCosts;
    private calculateProjectedSavings;
    private getIndustryCaseStudies;
    private getDefaultExecutiveSummary;
    private getEnterpriseTemplate;
    private getStandardTemplate;
    private getBasicTemplate;
}
interface PricingTier {
    name: string;
    price: number;
    features: string[];
    recommended: boolean;
}
export {};
//# sourceMappingURL=proposal-generation-service.d.ts.map