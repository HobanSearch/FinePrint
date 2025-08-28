import { Queue, QueueEvents } from 'bullmq';
import { QueueMetrics, SubscriptionTier } from '@fineprintai/shared-types';
import EventEmitter from 'eventemitter3';
export interface MetricsConfig {
    collectInterval: number;
    retentionDays: number;
    enablePrometheus: boolean;
    enableCustomMetrics: boolean;
}
export interface DetailedMetrics extends QueueMetrics {
    jobsPerSecond: number;
    avgWaitTime: number;
    p95ProcessingTime: number;
    p99ProcessingTime: number;
    memoryUsage: number;
    cpuUsage: number;
    errorsByType: Record<string, number>;
    tierDistribution: Record<SubscriptionTier, number>;
    workerUtilization: number;
}
export declare class MetricsCollector extends EventEmitter {
    private config;
    private queues;
    private queueEvents;
    private metricsCache;
    private timeSeriesData;
    private collectInterval;
    private readonly prometheusMetrics;
    constructor(config?: Partial<MetricsConfig>);
    registerQueue(queueName: string, queue: Queue, queueEvents: QueueEvents): void;
    getQueueMetrics(queueName: string): Promise<DetailedMetrics | null>;
    getHistoricalMetrics(queueName: string, since?: Date, until?: Date): Array<{
        timestamp: Date;
        metrics: DetailedMetrics;
    }>;
    getAggregatedMetrics(): Promise<{
        totalJobs: number;
        totalThroughput: number;
        avgErrorRate: number;
        totalActiveWorkers: number;
        queueCount: number;
        healthyQueues: number;
    }>;
    getPerformanceInsights(queueName: string): Promise<{
        status: 'healthy' | 'warning' | 'critical';
        insights: string[];
        recommendations: string[];
        score: number;
    }>;
    exportMetrics(queueName?: string, format?: 'json' | 'csv' | 'prometheus', since?: Date, until?: Date): string;
    private collectQueueMetrics;
    private calculateThroughput;
    private calculateAvgProcessingTime;
    private calculateErrorRate;
    private calculatePercentiles;
    private calculateAvgWaitTime;
    private calculateTierDistribution;
    private calculateWorkerUtilization;
    private getErrorsByType;
    private updatePrometheusMetrics;
    private setupQueueEventListeners;
    private storeTimeSeriesData;
    private startCollection;
    private startCleanup;
    private registerPrometheusMetrics;
    close(): Promise<void>;
}
export default MetricsCollector;
//# sourceMappingURL=metrics-collector.d.ts.map