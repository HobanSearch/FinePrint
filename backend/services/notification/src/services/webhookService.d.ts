export interface WebhookSendResult {
    success: boolean;
    statusCode?: number;
    responseBody?: any;
    errorCode?: string;
    errorMessage?: string;
    retryable?: boolean;
}
export interface WebhookSendRequest {
    url: string;
    method: 'POST' | 'PUT' | 'PATCH';
    headers: Record<string, string>;
    payload: any;
    deliveryId: string;
    timeout?: number;
    retryCount?: number;
    maxRetries?: number;
}
export interface WebhookEndpoint {
    id: string;
    userId: string;
    url: string;
    secret?: string;
    isActive: boolean;
    events: string[];
    headers?: Record<string, string>;
    timeout: number;
    maxRetries: number;
}
declare class WebhookService {
    private initialized;
    private axiosInstance;
    constructor();
    private setupAxiosInterceptors;
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    sendWebhook(request: WebhookSendRequest): Promise<WebhookSendResult>;
    createWebhookEndpoint(data: {
        userId: string;
        url: string;
        secret?: string;
        events: string[];
        headers?: Record<string, string>;
        timeout?: number;
        maxRetries?: number;
    }): Promise<WebhookEndpoint>;
    updateWebhookEndpoint(endpointId: string, updates: {
        url?: string;
        secret?: string;
        events?: string[];
        headers?: Record<string, string>;
        timeout?: number;
        maxRetries?: number;
        isActive?: boolean;
    }): Promise<WebhookEndpoint>;
    deleteWebhookEndpoint(endpointId: string): Promise<void>;
    getUserWebhookEndpoints(userId: string): Promise<WebhookEndpoint[]>;
    testWebhookEndpoint(url: string, headers?: Record<string, string>): Promise<{
        success: boolean;
        error?: string;
        statusCode?: number;
    }>;
    private getWebhookEndpoint;
    private generateSignature;
    private isValidWebhookUrl;
    private isPrivateIP;
    private isRetryableError;
    private sanitizeHeaders;
    private sanitizeResponseBody;
    getWebhookStats(endpointId: string, days?: number): Promise<{
        totalDeliveries: number;
        successfulDeliveries: number;
        failedDeliveries: number;
        averageResponseTime: number;
        successRate: number;
    }>;
    verifyWebhookSignature(payload: string | Buffer, signature: string, secret: string): boolean;
    sendBatchWebhooks(requests: WebhookSendRequest[]): Promise<WebhookSendResult[]>;
}
export declare const webhookService: WebhookService;
export {};
//# sourceMappingURL=webhookService.d.ts.map