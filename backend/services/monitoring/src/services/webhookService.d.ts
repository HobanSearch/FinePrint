import { DocumentChangeDetected, MonitoringAlert } from '@fineprintai/shared-types';
interface WebhookEndpoint {
    id: string;
    userId: string;
    teamId?: string;
    url: string;
    secret?: string;
    events: WebhookEvent[];
    isActive: boolean;
    retryConfig: {
        maxAttempts: number;
        backoffMultiplier: number;
        maxDelay: number;
    };
    headers: Record<string, string>;
    createdAt: Date;
    lastTriggeredAt?: Date;
    failureCount: number;
}
type WebhookEvent = 'document.change.detected' | 'document.risk.increased' | 'document.risk.decreased' | 'monitoring.error' | 'monitoring.resumed' | 'analysis.completed';
declare class WebhookService {
    private prisma;
    private httpClient;
    private initialized;
    private webhookEndpoints;
    private deliveryQueue;
    constructor();
    initialize(): Promise<void>;
    createWebhookEndpoint(data: {
        userId: string;
        teamId?: string;
        url: string;
        secret?: string;
        events: WebhookEvent[];
        headers?: Record<string, string>;
    }): Promise<WebhookEndpoint>;
    updateWebhookEndpoint(webhookId: string, updates: Partial<Pick<WebhookEndpoint, 'url' | 'secret' | 'events' | 'isActive' | 'headers'>>): Promise<WebhookEndpoint>;
    deleteWebhookEndpoint(webhookId: string): Promise<void>;
    triggerDocumentChangeWebhook(changeEvent: DocumentChangeDetected): Promise<void>;
    triggerRiskChangeWebhook(documentId: string, userId: string, teamId: string | undefined, riskChange: number, newRiskScore: number): Promise<void>;
    triggerMonitoringErrorWebhook(alert: MonitoringAlert): Promise<void>;
    private getWebhookEndpointsForEvent;
    private deliverWebhook;
    private executeWebhookDelivery;
    private scheduleWebhookRetry;
    private retryWebhookDelivery;
    private markWebhookDeliveryFailed;
    testWebhookEndpoint(webhookId: string): Promise<{
        success: boolean;
        httpStatus?: number;
        responseTime: number;
        error?: string;
    }>;
    private loadWebhookEndpoints;
    private loadPendingDeliveries;
    getWebhookStats(): Promise<{
        totalEndpoints: number;
        activeEndpoints: number;
        totalDeliveries: number;
        pendingDeliveries: number;
        successRate: number;
    }>;
    healthCheck(): Promise<void>;
    shutdown(): Promise<void>;
}
export declare const webhookService: WebhookService;
export {};
//# sourceMappingURL=webhookService.d.ts.map