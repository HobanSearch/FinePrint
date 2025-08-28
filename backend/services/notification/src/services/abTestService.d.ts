import { NotificationRequest } from '@fineprintai/shared-types';
export interface ABTestConfig {
    id: string;
    name: string;
    description?: string;
    status: 'draft' | 'running' | 'completed' | 'paused';
    testType: 'subject' | 'content' | 'timing' | 'channel';
    variants: ABTestVariant[];
    trafficSplit: Record<string, number>;
    userSegment?: any;
    startDate?: Date;
    endDate?: Date;
    primaryMetric: string;
    secondaryMetrics?: string[];
    winner?: string;
    confidence?: number;
    results?: any;
}
export interface ABTestVariant {
    id: string;
    name: string;
    weight: number;
    config: {
        subject?: string;
        content?: string;
        templateId?: string;
        timing?: {
            delay?: number;
            scheduleType?: 'immediate' | 'delayed' | 'optimal';
        };
        channels?: string[];
    };
}
export interface ABTestResult {
    variantId: string;
    metrics: {
        sent: number;
        delivered: number;
        opened: number;
        clicked: number;
        converted: number;
        deliveryRate: number;
        openRate: number;
        clickRate: number;
        conversionRate: number;
    };
    statisticalSignificance?: number;
    confidenceInterval?: {
        lower: number;
        upper: number;
    };
}
declare class ABTestService {
    private initialized;
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    createABTest(config: Omit<ABTestConfig, 'id'>): Promise<ABTestConfig>;
    updateABTest(testId: string, updates: Partial<ABTestConfig>): Promise<ABTestConfig>;
    startABTest(testId: string): Promise<void>;
    pauseABTest(testId: string): Promise<void>;
    completeABTest(testId: string, winner?: string): Promise<void>;
    getABTest(testId: string): Promise<ABTestConfig | null>;
    listABTests(options?: {
        status?: string;
        testType?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        tests: ABTestConfig[];
        total: number;
    }>;
    deleteABTest(testId: string): Promise<void>;
    processNotificationForTest(request: NotificationRequest): Promise<NotificationRequest & {
        abTestId?: string;
        abTestGroup?: string;
        templateId?: string;
    }>;
    getABTestResults(testId: string): Promise<{
        test: ABTestConfig;
        results: ABTestResult[];
        summary: {
            totalParticipants: number;
            testDuration: number;
            statisticalSignificance: number;
            recommendedWinner?: string;
        };
    }>;
    private validateTestConfig;
    private mapABTestConfig;
    private findActiveTestForNotification;
    private isUserEligibleForTest;
    private assignUserToVariant;
    private applyVariantConfig;
    private trackTestAssignment;
    private calculateTestResults;
    private getVariantMetrics;
    private calculateStatisticalSignificance;
    private determineBestVariant;
    private calculateTestSummary;
    private hashUserId;
    private resumeRunningTests;
    getABTestAnalytics(): Promise<{
        totalTests: number;
        activeTests: number;
        completedTests: number;
        avgTestDuration: number;
        avgParticipants: number;
        topPerformingTests: Array<{
            id: string;
            name: string;
            winnerImprovement: number;
        }>;
    }>;
}
export declare const abTestService: ABTestService;
export {};
//# sourceMappingURL=abTestService.d.ts.map