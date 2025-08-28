import { DatabaseClient } from '../utils/database.js';
import type { UXAnalyticsEngine } from './ux-analytics-engine.js';
import type { ABTest, ABTestResult, StatisticalSignificance, ABTestConfig, VariantPerformance } from '../types/ab-testing.js';
export declare class ABTestingFramework {
    private uxAnalytics;
    private database;
    private activeTests;
    private userAssignments;
    private isInitialized;
    constructor(uxAnalytics: UXAnalyticsEngine, database: DatabaseClient);
    initialize(): Promise<void>;
    healthCheck(): Promise<boolean>;
    createTest(config: ABTestConfig): Promise<ABTest>;
    startTest(testId: string): Promise<ABTest>;
    stopTest(testId: string, reason?: string): Promise<ABTest>;
    assignUserToVariant(userId: string, testId: string, sessionId?: string): Promise<{
        testId: string;
        variantId: string;
        variantName: string;
    }>;
    getUserVariant(userId: string, testId: string): Promise<{
        testId: string;
        variantId: string;
        variantName: string;
    } | null>;
    trackConversion(event: {
        sessionId: string;
        userId?: string;
        testId: string;
        variantId: string;
        eventType: 'view' | 'click' | 'conversion' | 'bounce';
        metadata?: Record<string, any>;
    }): Promise<void>;
    analyzeTestResults(testId: string): Promise<ABTestResult>;
    calculateStatisticalSignificance(variantMetrics: Record<string, VariantPerformance>, test: ABTest): Promise<StatisticalSignificance>;
    private checkAutoWinner;
    declareWinner(testId: string, winnerVariantId?: string, source?: 'auto' | 'manual'): Promise<ABTest>;
    private ensureTestingTables;
    private loadActiveTests;
    private setupTestMonitoring;
    private getTest;
    private isUserEligible;
    private selectVariantByWeight;
    private hashUserId;
    private updateTestMetrics;
    private calculateTTestConfidence;
    private normalCDF;
    private erf;
    private calculateEffectSize;
    private checkMinimumSampleSize;
    private determineWinner;
    private calculateUplift;
    private generateRecommendation;
}
//# sourceMappingURL=ab-testing-framework.d.ts.map