import { DatabaseClient } from '../utils/database.js';
import { RedisClient } from '../utils/redis.js';
import type { UserEvent, HeatmapData, ConversionFunnel, UserJourney, PerformanceMetrics, UXInsight, ComponentUsageStats, AccessibilityMetrics } from '../types/ux-analytics.js';
export declare class UXAnalyticsEngine {
    private database;
    private redis;
    private isInitialized;
    private eventBuffer;
    private bufferFlushInterval;
    private readonly BUFFER_SIZE;
    private readonly FLUSH_INTERVAL;
    constructor(database: DatabaseClient, redis: RedisClient);
    initialize(): Promise<void>;
    healthCheck(): Promise<boolean>;
    trackEvent(event: Omit<UserEvent, 'id'>): Promise<void>;
    trackPerformanceMetrics(metrics: Omit<PerformanceMetrics, 'id'>): Promise<void>;
    generateHeatmap(url: string, timeRange: {
        start: Date;
        end: Date;
    }, options?: {
        eventTypes?: string[];
        viewport?: {
            width: number;
            height: number;
        };
        segment?: string;
    }): Promise<HeatmapData>;
    generateScrollHeatmap(url: string, timeRange: {
        start: Date;
        end: Date;
    }): Promise<{
        depth: number;
        percentage: number;
    }[]>;
    analyzeConversionFunnel(funnelSteps: string[], timeRange: {
        start: Date;
        end: Date;
    }, segment?: string): Promise<ConversionFunnel>;
    mapUserJourney(sessionId: string, includePerformance?: boolean): Promise<UserJourney>;
    analyzeComponentUsage(componentName: string, timeRange: {
        start: Date;
        end: Date;
    }): Promise<ComponentUsageStats>;
    analyzeAccessibilityMetrics(timeRange: {
        start: Date;
        end: Date;
    }): Promise<AccessibilityMetrics>;
    generateUXInsights(timeRange: {
        start: Date;
        end: Date;
    }): Promise<UXInsight[]>;
    private setupEventBuffer;
    private flushEventBuffer;
    private ensureAnalyticsTables;
    private setupDataRetention;
    private updatePerformanceDashboard;
    private analyzeBounceRate;
    private analyzeErrorPatterns;
    private analyzeAccessibilityIssues;
    private analyzePerformanceBottlenecks;
    cleanup(): Promise<void>;
}
//# sourceMappingURL=ux-analytics-engine.d.ts.map