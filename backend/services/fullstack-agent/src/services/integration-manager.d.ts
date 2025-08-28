import { AxiosRequestConfig } from 'axios';
import { EventEmitter } from 'events';
import { Integration, IntegrationType, IntegrationConfiguration } from '@/types';
export interface IntegrationEvent {
    type: string;
    source: IntegrationType;
    data: any;
    timestamp: Date;
}
export interface IntegrationHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    latency: number;
    errorRate: number;
    availability: number;
    lastCheck: Date;
}
export interface SyncResult {
    success: boolean;
    syncedItems: number;
    errors: string[];
    duration: number;
    timestamp: Date;
}
export declare class IntegrationManager extends EventEmitter {
    private readonly logger;
    private readonly cache;
    private readonly integrations;
    private readonly clients;
    private readonly healthChecks;
    private syncIntervals;
    constructor();
    private initializeIntegrations;
    getIntegration(type: IntegrationType): Integration | null;
    updateIntegration(type: IntegrationType, configuration: Partial<IntegrationConfiguration>): Promise<Integration>;
    testIntegration(type: IntegrationType): Promise<IntegrationHealth>;
    syncWithIntegration(type: IntegrationType, data?: any): Promise<SyncResult>;
    sendToIntegration(type: IntegrationType, endpoint: string, data: any, options?: AxiosRequestConfig): Promise<any>;
    receiveFromIntegration(type: IntegrationType, endpoint: string, options?: AxiosRequestConfig): Promise<any>;
    getIntegrationHealth(type: IntegrationType): IntegrationHealth | null;
    getAllIntegrationHealth(): Map<IntegrationType, IntegrationHealth>;
    disableIntegration(type: IntegrationType): Promise<void>;
    enableIntegration(type: IntegrationType): Promise<void>;
    private initializeDSPyIntegration;
    private initializeLoRAIntegration;
    private initializeKnowledgeGraphIntegration;
    private initializeGitIntegration;
    private initializeCICDIntegration;
    private initializeMonitoringIntegration;
    private createClient;
    private createDefaultMetrics;
    private setupHealthChecks;
    private startPeriodicSync;
    private startPeriodicSyncForIntegration;
    private performHealthCheck;
    private syncWithDSPy;
    private syncWithLoRA;
    private syncWithKnowledgeGraph;
    private syncWithGit;
    private syncWithCICD;
    private syncWithMonitoring;
    private updateIntegrationMetrics;
    private executeHooks;
    private executeHook;
    private optimizePromptHook;
    private updateMetricsHook;
    private refreshCacheHook;
    private updateGraphHook;
    private extractEntitiesHook;
    private sendAlertHook;
    private logMetricHook;
    private collectMetrics;
}
//# sourceMappingURL=integration-manager.d.ts.map