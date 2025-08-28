import { CustomerHealthResponse, Prediction } from '@fineprintai/shared-types';
export declare class CustomerHealthMonitor {
    private prisma;
    private openai;
    constructor();
    calculateHealthScore(customerId: string): Promise<CustomerHealthResponse>;
    predictChurnRisk(customerId: string): Promise<Prediction>;
    identifyExpansionOpportunities(customerId: string): Promise<any[]>;
    getCustomerInsights(customerId: string): Promise<any>;
    private getCustomerWithMetrics;
    private calculateUsageFactor;
    private calculateEngagementFactor;
    private calculateSupportFactor;
    private calculateBillingFactor;
    private calculateOverallHealth;
    private determineRiskLevel;
    private generateRecommendations;
    private calculateTrend;
    private extractChurnFeatures;
    private calculateChurnProbability;
    private calculateConfidence;
    private identifyChurnFactors;
    private storePrediction;
    private getExpectedUsage;
    private calculateFeatureAdoptionRate;
    private isHighUsage;
    private getUnadoptedFeatures;
    private indicatesTeamGrowth;
    private generateAIInsights;
    private getAIRecommendations;
}
//# sourceMappingURL=customer-health-monitor.d.ts.map