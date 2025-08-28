import { PatternAnalysisResult } from './patterns';
export interface RiskFactor {
    id: string;
    name: string;
    category: string;
    weight: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    score: number;
    confidence: number;
    description: string;
    evidence: string[];
    recommendation: string;
}
export interface RiskAssessment {
    overallScore: number;
    riskLevel: 'minimal' | 'low' | 'moderate' | 'high' | 'critical';
    confidence: number;
    factors: RiskFactor[];
    categoryScores: {
        [category: string]: number;
    };
    trend: 'improving' | 'stable' | 'worsening';
    recommendations: string[];
    executiveSummary: string;
    comparativeAnalysis?: {
        industryAverage: number;
        percentile: number;
        similar_documents: number;
    };
}
export interface ScoringWeights {
    patternMatches: number;
    severityMultiplier: {
        low: number;
        medium: number;
        high: number;
        critical: number;
    };
    confidenceThreshold: number;
    categoryWeights: {
        [category: string]: number;
    };
    documentTypeModifiers: {
        [type: string]: number;
    };
    lengthAdjustment: {
        short: number;
        medium: number;
        long: number;
    };
}
export declare class RiskScoringEngine {
    private readonly DEFAULT_WEIGHTS;
    private scoringWeights;
    constructor(customWeights?: Partial<ScoringWeights>);
    calculateRiskScore(patternAnalysis: PatternAnalysisResult, documentMetadata?: {
        type?: string;
        wordCount?: number;
        language?: string;
        jurisdiction?: string;
    }): Promise<RiskAssessment>;
    private calculateRiskFactors;
    private calculateCategoryScores;
    private calculateBaseScore;
    private applyDocumentAdjustments;
    private determineRiskLevel;
    private calculateOverallConfidence;
    private generateRecommendations;
    private generateExecutiveSummary;
    private groupFactorsByCategory;
    private getFactorDescription;
    private getFactorRecommendation;
    addComparativeAnalysis(assessment: RiskAssessment, industryData?: {
        averageScore: number;
        documentCount: number;
        scoreDistribution: {
            [range: string]: number;
        };
    }): Promise<RiskAssessment>;
    private calculatePercentile;
    updateScoringWeights(weights: Partial<ScoringWeights>): void;
    getScoringWeights(): ScoringWeights;
    batchScore(analyses: Array<{
        patternAnalysis: PatternAnalysisResult;
        metadata: {
            type?: string;
            wordCount?: number;
            language?: string;
            jurisdiction?: string;
        };
    }>): Promise<RiskAssessment[]>;
}
export declare const riskScoringEngine: RiskScoringEngine;
//# sourceMappingURL=riskScoring.d.ts.map