import { ArchitectureDecisionRequest, ArchitectureDecisionResult, ArchitectureRecommendation } from '@/types';
export interface DecisionCriteria {
    performance: number;
    scalability: number;
    maintainability: number;
    cost: number;
    complexity: number;
    maturity: number;
    teamExpertise: number;
    timeConstraints: number;
}
export interface DecisionWeight {
    performance: number;
    scalability: number;
    maintainability: number;
    cost: number;
    complexity: number;
    maturity: number;
    teamExpertise: number;
    timeConstraints: number;
}
export interface TechnologyProfile {
    name: string;
    category: string;
    scores: DecisionCriteria;
    pros: string[];
    cons: string[];
    useCases: string[];
    alternatives: string[];
    learningCurve: 'low' | 'medium' | 'high';
    communitySupport: 'low' | 'medium' | 'high';
    documentation: 'poor' | 'good' | 'excellent';
    lastUpdated: Date;
}
export declare class ArchitectureDecisionService {
    private readonly logger;
    private readonly cache;
    private readonly aiService;
    private readonly technologyProfiles;
    private readonly defaultWeights;
    constructor();
    makeDecision(request: ArchitectureDecisionRequest): Promise<ArchitectureDecisionResult>;
    compareOptions(options: any[], criteria: string[], weights?: Partial<DecisionWeight>): Promise<{
        comparison: Array<{
            option: string;
            scores: Record<string, number>;
            totalScore: number;
            rank: number;
        }>;
        recommendation: string;
        insights: string[];
    }>;
    getRecommendationsForUseCase(useCase: string, constraints?: string[], preferences?: Partial<DecisionWeight>): Promise<{
        recommendations: TechnologyProfile[];
        reasoning: string;
        alternatives: TechnologyProfile[];
    }>;
    validateDecision(decision: ArchitectureDecisionResult, currentContext?: Record<string, any>): Promise<{
        isValid: boolean;
        concerns: string[];
        suggestions: string[];
        updatedRecommendation?: ArchitectureRecommendation;
    }>;
    private calculateDecisionWeights;
    private analyzeOption;
    private rankOptions;
    private performImpactAnalysis;
    private generateImplementationGuide;
    private generateRationale;
    private initializeTechnologyProfiles;
    private addTechnologyProfile;
    private getTechnologyProfile;
    private generateRequestId;
    private generateCacheKey;
    private isCacheValid;
    private calculateTechnologyScore;
    private violatesConstraint;
    private getScoreForCriterion;
    private analyzeRisks;
    private analyzeBenefits;
    private calculateConfidence;
    private generateOptionReasoning;
    private calculateRiskScore;
    private calculatePerformanceImpact;
    private calculateScalabilityImpact;
    private calculateMaintainabilityImpact;
    private calculateCostImpact;
    private calculateTimeToImplement;
    private calculateOverallRiskLevel;
    private generateImplementationSteps;
    private determineRequiredSkills;
    private identifyDependencies;
    private generateTestingStrategy;
    private generateRollbackPlan;
    private generateComparisonInsights;
    private getAIRecommendationsForUseCase;
    private generateUseCaseReasoning;
    private validateAgainstContext;
    private checkForNewAlternatives;
    private generateUpdatedRecommendation;
    private generateTechnologyProfileWithAI;
}
//# sourceMappingURL=architecture-decision-service.d.ts.map