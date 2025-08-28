import { z } from 'zod';
import { EventEmitter } from 'events';
export declare const PerformanceMetricSchema: any;
export type PerformanceMetric = z.infer<typeof PerformanceMetricSchema>;
export declare const DataDriftConfigSchema: any;
export type DataDriftConfig = z.infer<typeof DataDriftConfigSchema>;
export interface DriftDetectionResult {
    id: string;
    model_id: string;
    timestamp: string;
    drift_detected: boolean;
    drift_score: number;
    method_used: string;
    affected_features: string[];
    statistical_tests: {
        feature_name: string;
        test_name: string;
        p_value: number;
        drift_detected: boolean;
        drift_magnitude: number;
    }[];
    recommendations: string[];
    severity: 'low' | 'medium' | 'high' | 'critical';
    metadata: Record<string, any>;
}
export interface PerformanceAlert {
    id: string;
    type: 'performance_degradation' | 'data_drift' | 'resource_anomaly' | 'error_spike' | 'latency_spike';
    model_id: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    triggered_at: string;
    resolved_at?: string;
    status: 'active' | 'acknowledged' | 'resolved' | 'suppressed';
    threshold_value: number;
    current_value: number;
    recommendations: string[];
    metadata: Record<string, any>;
}
export interface ModelPerformanceDashboard {
    model_id: string;
    model_name: string;
    time_range: string;
    summary: {
        total_requests: number;
        avg_latency_ms: number;
        p95_latency_ms: number;
        p99_latency_ms: number;
        error_rate: number;
        throughput_rps: number;
        uptime_percentage: number;
    };
    trends: {
        latency_trend: Array<{
            timestamp: string;
            value: number;
        }>;
        throughput_trend: Array<{
            timestamp: string;
            value: number;
        }>;
        error_trend: Array<{
            timestamp: string;
            value: number;
        }>;
        resource_usage_trend: Array<{
            timestamp: string;
            cpu: number;
            memory: number;
            gpu?: number;
        }>;
    };
    alerts: PerformanceAlert[];
    drift_status: {
        drift_detected: boolean;
        last_check: string;
        drift_score: number;
        affected_features: string[];
    };
}
export declare class PerformanceMonitor extends EventEmitter {
    private cache;
    private queue;
    private metricsBuffer;
    private driftConfigs;
    private activeAlerts;
    private referenceData;
    private metricsPath;
    private monitoringInterval?;
    private isMonitoring;
    constructor();
    initialize(): Promise<void>;
    private initializeMonitoringQueue;
    private loadDriftConfigurations;
    private loadActiveAlerts;
    logMetrics(metric: PerformanceMetric): Promise<void>;
    private processPerformanceMetric;
    private storeMetric;
    private checkPerformanceAnomalies;
    private updatePerformanceAggregates;
    configureDriftDetection(config: DataDriftConfig): Promise<void>;
    private saveDriftConfigurations;
    private checkDriftDetectionTriggers;
    private shouldTriggerDriftDetection;
    private processDriftDetection;
    private detectDrift;
    private statisticalDriftDetection;
    private kolmogorovSmirnovTest;
    private calculateKSPValue;
    private domainClassifierDriftDetection;
    private autoencoderDriftDetection;
    private ensembleDriftDetection;
    private getReferenceData;
    private getCurrentData;
    private loadReferenceDataFromStorage;
    private getRecentMetrics;
    private createAlert;
    private createDriftAlert;
    private saveActiveAlerts;
    private storeDriftResult;
    startContinuousMonitoring(): Promise<void>;
    stopContinuousMonitoring(): Promise<void>;
    private performPeriodicTasks;
    private flushMetricsBuffer;
    private checkAlertAutoResolution;
    private shouldAutoResolveAlert;
    resolveAlert(alertId: string, resolution: string): Promise<void>;
    private cleanupOldData;
    getModelDashboard(modelId: string, timeRange?: string): Promise<ModelPerformanceDashboard>;
    private getModelInfo;
    private getMetricsForTimeRange;
    private parseTimeRange;
    private calculateSummaryMetrics;
    private calculateTrends;
    private groupMetricsByTimeBuckets;
    private getDriftStatus;
    getServiceMetrics(): {
        models_monitored: number;
        drift_configs: number;
        total_alerts: number;
        active_alerts: number;
        critical_alerts: number;
        monitoring_active: boolean;
    };
}
//# sourceMappingURL=performance-monitor.d.ts.map