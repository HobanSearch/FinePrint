import { PrismaClient } from '@prisma/client';
export interface TrendData {
    date: string;
    value: number;
    count: number;
    metadata?: Record<string, any>;
}
export interface IndustryTrend {
    category: string;
    currentAverage: number;
    previousAverage: number;
    change: number;
    changePercent: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    dataPoints: TrendData[];
    topWebsites: {
        name: string;
        score: number;
        change: number;
    }[];
}
export interface PatternEvolution {
    patternType: string;
    frequency: TrendData[];
    severity: TrendData[];
    affectedWebsites: {
        name: string;
        frequency: number;
        lastSeen: Date;
    }[];
    emergingPatterns: string[];
    decliningPatterns: string[];
}
export interface TrendReport {
    generatedAt: Date;
    period: {
        start: Date;
        end: Date;
        days: number;
    };
    summary: {
        totalDocuments: number;
        averageRiskScore: number;
        riskScoreChange: number;
        mostActiveCategory: string;
        emergingRisks: string[];
    };
    categoryTrends: IndustryTrend[];
    patternEvolution: PatternEvolution[];
    recommendations: string[];
}
export declare class TrendAnalysisService {
    private prisma;
    private isRunning;
    private analysisInterval;
    constructor(prisma: PrismaClient);
    startPeriodicAnalysis(): Promise<void>;
    stop(): Promise<void>;
    private runFullAnalysis;
    getIndustryTrends(category?: string, days?: number): Promise<IndustryTrend[]>;
    getRiskScoreTrends(websiteName?: string, days?: number): Promise<TrendData[]>;
    getPatternEvolution(patternType?: string, days?: number): Promise<PatternEvolution[]>;
    generateTrendReport(options: {
        category?: string;
        websites?: string[];
        days?: number;
    }): Promise<TrendReport>;
    private calculateIndustryTrends;
    private analyzePatternEvolution;
    private generateTrendAlerts;
    private getRiskScoreData;
    private getTopWebsitesByRisk;
    private generateReportSummary;
    private generateRecommendations;
    private calculateAverage;
}
//# sourceMappingURL=trend-analysis.d.ts.map