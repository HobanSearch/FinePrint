export declare const config: {
    host: string;
    port: number;
    logLevel: string;
    databaseUrl: string;
    redis: {
        host: string;
        port: number;
        password: string | undefined;
    };
    crawling: {
        userAgent: string;
        rateLimitDelay: number;
        requestTimeout: number;
        maxRetries: number;
        concurrentRequests: number;
    };
    processing: {
        concurrency: number;
        jobTimeout: number;
        queueCleanupInterval: number;
    };
    ollama: {
        baseUrl: string;
        defaultModel: string;
        timeout: number;
    };
    serviceAuthToken: string;
    monitoring: {
        healthCheckInterval: number;
        metricsPort: number;
    };
    features: {
        enableTrendAnalysis: boolean;
        enableComplianceMonitoring: boolean;
        enablePublicApi: boolean;
    };
    external: {
        analysisServiceUrl: string;
        notificationServiceUrl: string;
    };
    dataRetention: {
        documentVersions: number;
        analysisHistoryDays: number;
        alertHistoryDays: number;
    };
};
//# sourceMappingURL=index.d.ts.map