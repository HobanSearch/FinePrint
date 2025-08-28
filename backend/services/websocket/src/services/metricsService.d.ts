export interface MetricValue {
    value: number;
    timestamp: Date;
    labels?: Record<string, string>;
}
export interface Counter {
    name: string;
    value: number;
    labels: Record<string, string>;
}
export interface Gauge {
    name: string;
    value: number;
    labels: Record<string, string>;
}
export interface Histogram {
    name: string;
    buckets: Record<string, number>;
    count: number;
    sum: number;
    labels: Record<string, string>;
}
export interface MetricsSnapshot {
    timestamp: Date;
    counters: Counter[];
    gauges: Gauge[];
    histograms: Histogram[];
    uptime: number;
    memory: NodeJS.MemoryUsage;
}
export declare class MetricsService {
    private counters;
    private counterLabels;
    private gauges;
    private gaugeLabels;
    private histograms;
    private histogramLabels;
    private initialized;
    private metricsInterval;
    constructor();
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    incrementCounter(name: string, labels?: Record<string, string>, value?: number): void;
    getCounter(name: string, labels?: Record<string, string>): number;
    resetCounter(name: string, labels?: Record<string, string>): void;
    recordGauge(name: string, value: number, labels?: Record<string, string>): void;
    getGauge(name: string, labels?: Record<string, string>): number;
    incrementGauge(name: string, labels?: Record<string, string>, value?: number): void;
    decrementGauge(name: string, labels?: Record<string, string>, value?: number): void;
    recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
    getHistogramStats(name: string, labels?: Record<string, string>): {
        count: number;
        sum: number;
        avg: number;
        min: number;
        max: number;
        p50: number;
        p95: number;
        p99: number;
    };
    recordConnectionEvent(event: 'connect' | 'disconnect', userId?: string, teamId?: string): void;
    recordMessageEvent(type: 'sent' | 'received' | 'queued' | 'failed', messageType: string, userId?: string, teamId?: string): void;
    recordAuthEvent(event: 'success' | 'failure', reason?: string): void;
    recordRateLimitEvent(rule: string, action: 'allowed' | 'blocked'): void;
    recordQueueStats(queueName: string, stats: {
        waiting: number;
        active: number;
        completed: number;
        failed: number;
    }): void;
    recordSystemMetrics(): void;
    getMetricsSnapshot(): MetricsSnapshot;
    getPrometheusMetrics(): string;
    getHealthStatus(): Promise<{
        healthy: boolean;
        details?: any;
    }>;
    private generateMetricKey;
    private extractMetricName;
    private formatLabels;
    private percentile;
    private updateCachedMetric;
    private loadPersistedMetrics;
    private persistMetrics;
    private startMetricsCollection;
    private startCleanupJob;
    private cleanupOldMetrics;
}
//# sourceMappingURL=metricsService.d.ts.map