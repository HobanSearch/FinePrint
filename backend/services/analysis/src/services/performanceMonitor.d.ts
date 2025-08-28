import { EventEmitter } from 'events';
export interface SystemMetrics {
    timestamp: Date;
    cpu: {
        usage: number;
        loadAverage: number[];
        cores: number;
    };
    memory: {
        total: number;
        used: number;
        free: number;
        usage: number;
        heapUsed: number;
        heapTotal: number;
    };
    disk: {
        usage: number;
    };
    network: {
        connections: number;
        activeWebSockets: number;
    };
    process: {
        uptime: number;
        pid: number;
        version: string;
    };
}
export interface AnalysisMetrics {
    timestamp: Date;
    totalAnalyses: number;
    completedAnalyses: number;
    failedAnalyses: number;
    averageProcessingTime: number;
    throughput: number;
    accuracyScore: number;
    modelPerformance: {
        [model: string]: ModelPerformanceMetrics;
    };
    queueMetrics: {
        totalJobs: number;
        pendingJobs: number;
        processingJobs: number;
        averageWaitTime: number;
    };
    errorRates: {
        extractionErrors: number;
        patternErrors: number;
        aiErrors: number;
        embeddingErrors: number;
    };
}
export interface ModelPerformanceMetrics {
    model: string;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    averageTokensPerSecond: number;
    memoryUsage: number;
    accuracy: number;
    lastUsed: Date;
    errorRate: number;
}
export interface CacheMetrics {
    timestamp: Date;
    hitRate: number;
    missRate: number;
    totalRequests: number;
    totalHits: number;
    totalMisses: number;
    cacheSize: number;
    evictions: number;
    averageKeySize: number;
    averageValueSize: number;
    topKeys: Array<{
        key: string;
        hits: number;
        size: number;
    }>;
}
export interface AlertConfig {
    id: string;
    name: string;
    metric: string;
    threshold: number;
    comparison: 'greater' | 'less' | 'equal';
    severity: 'low' | 'medium' | 'high' | 'critical';
    enabled: boolean;
    cooldownMinutes: number;
    description: string;
}
export interface Alert {
    id: string;
    configId: string;
    timestamp: Date;
    severity: 'low' | 'medium' | 'high' | 'critical';
    metric: string;
    value: number;
    threshold: number;
    message: string;
    resolved: boolean;
    resolvedAt?: Date;
}
export declare class PerformanceMonitor extends EventEmitter {
    private isRunning;
    private metricsIntervalId?;
    private cacheStatsIntervalId?;
    private alertCheckIntervalId?;
    private systemMetricsHistory;
    private analysisMetricsHistory;
    private cacheMetricsHistory;
    private alertConfigs;
    private activeAlerts;
    private alertCooldowns;
    private requestCounts;
    private responseTimeHistogram;
    private errorCounts;
    private cacheHits;
    private cacheMisses;
    private cacheRequests;
    constructor();
    start(): Promise<void>;
    stop(): Promise<void>;
    private startSystemMetricsCollection;
    private collectSystemMetrics;
    private startAnalysisMetricsCollection;
    private collectAnalysisMetrics;
    private startCacheMetricsCollection;
    private collectCacheMetrics;
    private initializeDefaultAlerts;
    private startAlertChecking;
    private checkAllAlerts;
    private checkSystemAlerts;
    private checkAnalysisAlerts;
    private checkAlert;
    private evaluateAlertCondition;
    trackRequest(operation: string, modelName?: string): void;
    trackResponse(operation: string, responseTime: number, modelName?: string): void;
    trackError(operation: string, error: string, modelName?: string): void;
    private setupCacheTracking;
    getCurrentSystemMetrics(): SystemMetrics | null;
    getCurrentAnalysisMetrics(): AnalysisMetrics | null;
    getCurrentCacheMetrics(): CacheMetrics | null;
    getSystemMetricsHistory(hours?: number): SystemMetrics[];
    getAnalysisMetricsHistory(hours?: number): AnalysisMetrics[];
    getActiveAlerts(): Alert[];
    getAllAlerts(hours?: number): Alert[];
    addAlertConfig(config: AlertConfig): void;
    removeAlertConfig(configId: string): void;
    getHealthStatus(): {
        status: 'healthy' | 'warning' | 'critical';
        checks: {
            [key: string]: {
                status: 'pass' | 'warn' | 'fail';
                message: string;
            };
        };
    };
    private calculateOverallAccuracy;
}
export declare const performanceMonitor: PerformanceMonitor;
//# sourceMappingURL=performanceMonitor.d.ts.map