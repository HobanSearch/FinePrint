import { AnalysisRequest } from './enhancedAnalysis';
import { AnalysisService } from './analysis';
export interface IntegrationConfig {
    maxConcurrentJobs?: number;
    cacheEnabled?: boolean;
    monitoringEnabled?: boolean;
    websocketPort?: number;
    defaultModelPreference?: 'speed' | 'accuracy' | 'balanced';
    enableEmbeddings?: boolean;
    enableProgressTracking?: boolean;
}
export interface ServiceHealth {
    service: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    message: string;
    lastCheck: Date;
    responseTime?: number;
    metadata?: any;
}
export interface SystemStatus {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: ServiceHealth[];
    lastUpdate: Date;
    version: string;
    uptime: number;
}
export declare class IntegrationService {
    private config;
    private isInitialized;
    private startTime;
    private analysisService;
    private healthCheckIntervalId?;
    constructor(config?: IntegrationConfig);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    analyzeDocument(request: AnalysisRequest): Promise<string>;
    analyzeBatch(requests: Array<{
        analysisId: string;
        documentId: string;
        userId: string;
        request: AnalysisRequest;
        priority?: 'low' | 'normal' | 'high' | 'urgent';
    }>): Promise<string[]>;
    getAnalysisStatus(analysisId: string, userId: string): Promise<{
        status: 'pending' | 'processing' | 'completed' | 'failed';
        progress?: any;
        result?: any;
        error?: string;
    }>;
    cancelAnalysis(analysisId: string, userId: string): Promise<boolean>;
    getSystemStatus(): Promise<SystemStatus>;
    updateConfiguration(updates: Partial<IntegrationConfig>): void;
    getConfiguration(): IntegrationConfig;
    getSystemStatistics(): Promise<{
        analysis: any;
        queue: any;
        models: any;
        system?: any;
        cache?: any;
    }>;
    private setupServiceIntegrations;
    private determinePriority;
    private getQueuePosition;
    private getEnabledServices;
    private startHealthMonitoring;
    get services(): {
        modelManager: import("./modelManager").ModelManager;
        textProcessor: import("./textProcessor").TextProcessor;
        patternLibrary: import("./patterns").PatternLibrary;
        embeddingService: import("./embeddings").EmbeddingService;
        riskScoringEngine: import("./riskScoring").RiskScoringEngine;
        enhancedAnalysisEngine: import("./enhancedAnalysis").EnhancedAnalysisEngine;
        queueManager: import("./queueManager").QueueManager;
        progressTracker: import("./progressTracker").ProgressTracker | null;
        performanceMonitor: import("./performanceMonitor").PerformanceMonitor | null;
        analysisService: AnalysisService;
    };
}
export declare const integrationService: IntegrationService;
//# sourceMappingURL=integration.d.ts.map