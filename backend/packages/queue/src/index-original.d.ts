import { Queue, Worker, Job } from 'bullmq';
import type { JobOptions, QueueConfig, QueueStats, JobStatus, AnalysisJobData, MonitoringJobData, NotificationJobData, EmailJobData, WebhookJobData, ActionJobData, CleanupJobData, ExportJobData } from '@fineprintai/shared-types';
export declare class QueueManager {
    private connection;
    private queues;
    private workers;
    private queueEvents;
    constructor();
    createQueue(name: string, options?: Partial<QueueConfig>): Queue;
    createWorker<T = any>(queueName: string, processor: (job: Job<T>) => Promise<any>, options?: {
        concurrency?: number;
        limiter?: {
            max: number;
            duration: number;
        };
    }): Worker<T>;
    addJob<T = any>(queueName: string, jobName: string, data: T, options?: JobOptions): Promise<Job<T>>;
    getJob(queueName: string, jobId: string): Promise<Job | null>;
    getQueueStats(queueName: string): Promise<QueueStats>;
    getJobStatus(queueName: string, jobId: string): Promise<JobStatus | null>;
    removeJob(queueName: string, jobId: string): Promise<boolean>;
    retryJob(queueName: string, jobId: string): Promise<boolean>;
    pauseQueue(queueName: string): Promise<void>;
    resumeQueue(queueName: string): Promise<void>;
    cleanQueue(queueName: string, grace?: number, limit?: number, type?: 'completed' | 'waiting' | 'active' | 'delayed' | 'failed'): Promise<string[]>;
    obliterateQueue(queueName: string): Promise<void>;
    closeAll(): Promise<void>;
    getQueue(name: string): Queue | undefined;
    getWorker(name: string): Worker | undefined;
    getAllQueueNames(): string[];
}
export declare const queueManager: QueueManager;
export declare const analysisQueue: Queue;
export declare const monitoringQueue: Queue;
export declare const notificationQueue: Queue;
export declare const addAnalysisJob: (data: AnalysisJobData, options?: JobOptions) => Promise<Job<T>>;
export declare const addMonitoringJob: (data: MonitoringJobData, options?: JobOptions) => Promise<Job<T>>;
export declare const addNotificationJob: (data: NotificationJobData, options?: JobOptions) => Promise<Job<T>>;
export declare const addEmailJob: (data: EmailJobData, options?: JobOptions) => Promise<Job<T>>;
export declare const addWebhookJob: (data: WebhookJobData, options?: JobOptions) => Promise<Job<T>>;
export declare const addActionJob: (data: ActionJobData, options?: JobOptions) => Promise<Job<T>>;
export declare const addCleanupJob: (data: CleanupJobData, options?: JobOptions) => Promise<Job<T>>;
export declare const addExportJob: (data: ExportJobData, options?: JobOptions) => Promise<Job<T>>;
export default queueManager;
//# sourceMappingURL=index-original.d.ts.map