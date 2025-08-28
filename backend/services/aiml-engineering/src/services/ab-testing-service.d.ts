import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';
import { z } from 'zod';
export declare const ABTestConfigSchema: any;
export type ABTestConfig = z.infer<typeof ABTestConfigSchema>;
export interface ABTest {
    id: string;
    name: string;
    config: ABTestConfig;
    status: 'draft' | 'running' | 'completed' | 'stopped' | 'failed';
    variants: TestVariant[];
    metrics: TestMetrics;
    statistical_results: StatisticalResults | null;
    winner: string | null;
    confidence_level: number;
    created_at: Date;
    started_at?: Date;
    completed_at?: Date;
    current_sample_size: number;
    estimated_completion: Date | null;
}
export interface TestVariant {
    id: string;
    model_id: string;
    model_name: string;
    is_control: boolean;
    traffic_percentage: number;
    sample_size: number;
    metrics: VariantMetrics;
    performance_data: PerformanceData[];
}
export interface VariantMetrics {
    accuracy: number;
    avg_response_time: number;
    error_rate: number;
    user_satisfaction: number;
    conversion_rate: number;
    confidence_intervals: Record<string, {
        lower: number;
        upper: number;
    }>;
}
export interface PerformanceData {
    timestamp: Date;
    metric_name: string;
    value: number;
    sample_count: number;
}
export interface TestMetrics {
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    avg_response_time: number;
    p95_response_time: number;
    conversion_rate: number;
    user_satisfaction_score: number;
}
export interface StatisticalResults {
    is_significant: boolean;
    p_value: number;
    effect_size: number;
    confidence_interval: {
        lower: number;
        upper: number;
    };
    statistical_power: number;
    required_sample_size: number;
    bayesian_probability: number;
}
export interface TestResult {
    test_id: string;
    variant_id: string;
    user_id: string;
    request_id: string;
    timestamp: Date;
    response_time: number;
    accuracy_score?: number;
    user_feedback?: number;
    conversion: boolean;
    error_occurred: boolean;
    metadata: Record<string, any>;
}
export declare class ABTestingService extends EventEmitter {
    private prisma;
    private cache;
    private activeTests;
    private testResults;
    constructor(prisma: PrismaClient);
    createTest(config: ABTestConfig): Promise<ABTest>;
    startTest(testId: string): Promise<ABTest>;
    stopTest(testId: string, reason?: string): Promise<ABTest>;
    recordResult(result: Omit<TestResult, 'variant_id'>): Promise<void>;
    private selectVariant;
    private hashUserId;
    private updateVariantMetrics;
    private updateTestMetrics;
    private checkEarlyStoppingConditions;
    private performStatisticalAnalysis;
    private normalCDF;
    private erf;
    private calculateStatisticalPower;
    private calculateRequiredSampleSize;
    private completeTest;
    private performFinalAnalysis;
    private calculateConfidenceIntervals;
    private shouldCompleteTest;
    private estimateCompletionTime;
    private startBackgroundMonitoring;
    private monitorActiveTests;
    getTest(testId: string): Promise<ABTest | null>;
    listTests(): Promise<ABTest[]>;
    getTestResults(testId: string): Promise<TestResult[]>;
    exportTestData(testId: string): Promise<any>;
}
//# sourceMappingURL=ab-testing-service.d.ts.map