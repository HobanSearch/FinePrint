import { z } from 'zod';
export declare const DSPyMetricEntry: any;
export type DSPyMetricEntryType = z.infer<typeof DSPyMetricEntry>;
export interface MetricsSummary {
    total_operations: number;
    success_rate: number;
    average_latency_ms: number;
    average_accuracy: number;
    average_confidence: number;
    total_token_usage: number;
    operations_by_type: Record<string, number>;
    modules_by_usage: Record<string, number>;
    error_distribution: Record<string, number>;
    performance_trends: {
        hourly: MetricDataPoint[];
        daily: MetricDataPoint[];
        weekly: MetricDataPoint[];
    };
}
export interface MetricDataPoint {
    timestamp: string;
    operations: number;
    success_rate: number;
    average_latency: number;
    average_accuracy: number;
}
export interface PerformanceAlert {
    id: string;
    type: 'latency_spike' | 'accuracy_drop' | 'error_rate_high' | 'token_usage_high';
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    threshold: number;
    current_value: number;
    module_name?: string;
    timestamp: string;
    resolved: boolean;
}
export declare class MetricsCollector {
    private cache;
    private metrics;
    private alerts;
    private thresholds;
    constructor();
    private initializeMetricsCollection;
    recordMetric(metric: Omit<DSPyMetricEntryType, 'timestamp'>): Promise<void>;
    private cacheMetric;
    private loadMetricsFromCache;
    private updateRealTimeMetrics;
    getMetricsSummary(timeRange?: {
        start: string;
        end: string;
    }): Promise<MetricsSummary>;
    private getEmptyMetricsSummary;
    private calculatePerformanceTrends;
    private groupMetricsByHour;
    private groupMetricsByDay;
    private groupMetricsByWeek;
    private calculateDataPoints;
    private checkPerformanceAlerts;
    private getRecentMetrics;
    private checkLatencyAlerts;
    private checkErrorRateAlerts;
    private checkAccuracyAlerts;
    private checkTokenUsageAlerts;
    private createAlert;
    getActiveAlerts(): PerformanceAlert[];
    getAllAlerts(limit?: number): PerformanceAlert[];
    resolveAlert(alertId: string): Promise<boolean>;
    private performHousekeeping;
    updateThresholds(newThresholds: Partial<typeof MetricsCollector.prototype.thresholds>): void;
    getThresholds(): typeof MetricsCollector.prototype.thresholds;
}
//# sourceMappingURL=metrics-collector.d.ts.map