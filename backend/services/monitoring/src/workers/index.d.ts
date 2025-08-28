import { Job } from 'bullmq';
export declare function addMonitoringJob(type: string, data: any, options?: {
    delay?: number;
    priority?: number;
    attempts?: number;
}): Promise<Job>;
export declare function addWebhookJob(webhookId: string, eventType: string, payload: any, options?: {
    delay?: number;
    priority?: number;
}): Promise<Job>;
export declare function addAlertJob(alertType: string, payload: any, options?: {
    priority?: number;
}): Promise<Job>;
export declare function addAnalysisJob(documentId: string, oldContent: string, newContent: string, documentType: string, options?: {
    priority?: number;
}): Promise<Job>;
export declare function getQueueStats(): Promise<{
    monitoring: any;
    webhooks: any;
    alerts: any;
    analysis: any;
}>;
export declare function pauseAllQueues(): Promise<void>;
export declare function resumeAllQueues(): Promise<void>;
export declare function setupWorkers(): Promise<void>;
export declare function shutdownWorkers(): Promise<void>;
export declare function healthCheckWorkers(): Promise<{
    healthy: boolean;
    workers: {
        name: string;
        status: string;
    }[];
    queues: any;
}>;
//# sourceMappingURL=index.d.ts.map