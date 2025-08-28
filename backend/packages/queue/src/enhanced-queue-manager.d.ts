import { Queue, Worker, Job } from 'bullmq';
import EventEmitter from 'eventemitter3';
import type { JobOptions, QueueConfig, JobStatus, QueueMetrics, DeadLetterQueueConfig, WorkerScalingConfig, BulkJobOperation, ScheduledJobConfig, QueueHealthCheck } from '@fineprintai/shared-types';
export declare class EnhancedQueueManager extends EventEmitter {
    private connection;
    private queues;
    private workers;
    private queueEvents;
    private deadLetterQueues;
    private scheduledJobs;
    private metricsCache;
    private healthChecks;
    private workerScalingConfigs;
    private jobContexts;
    private isShuttingDown;
    private readonly priorityConfig;
    private readonly defaultDLQConfig;
    constructor();
    private setupConnectionHandlers;
    createQueue(name: string, options?: Partial<QueueConfig & {
        deadLetterQueue?: DeadLetterQueueConfig;
        workerScaling?: WorkerScalingConfig;
    }>): Queue;
    createWorker<T = any>(queueName: string, processor: (job: Job<T>, token?: string) => Promise<any>, options?: {
        concurrency?: number;
        limiter?: {
            max: number;
            duration: number;
        };
        autoScale?: boolean;
        maxWorkers?: number;
        minWorkers?: number;
    }): Worker<T>;
    addJob<T = any>(queueName: string, jobName: string, data: T, options?: JobOptions): Promise<Job<T>>;
    bulkAddJobs(queueName: string, operation: BulkJobOperation): Promise<Job[]>;
    scheduleJob(config: ScheduledJobConfig): Promise<void>;
    cancelJob(queueName: string, jobId: string, reason?: string): Promise<boolean>;
    getJobStatus(queueName: string, jobId: string): Promise<JobStatus | null>;
    getQueueMetrics(queueName: string): Promise<QueueMetrics>;
    performHealthCheck(queueName: string): Promise<QueueHealthCheck>;
    private createJobContext;
    private handleFailedJob;
    private createDeadLetterQueue;
    private setupQueueEvents;
    private setupWorkerEvents;
    private setupWorkerAutoScaling;
    private checkWorkerScaling;
    private calculateNextRun;
    private calculateThroughput;
    private calculateAvgProcessingTime;
    private startMetricsCollection;
    private startHealthChecks;
    private setupGracefulShutdown;
    getJob(queueName: string, jobId: string): Promise<Job | null>;
    removeJob(queueName: string, jobId: string): Promise<boolean>;
    retryJob(queueName: string, jobId: string): Promise<boolean>;
    pauseQueue(queueName: string): Promise<void>;
    resumeQueue(queueName: string): Promise<void>;
    cleanQueue(queueName: string, grace?: number, limit?: number, type?: 'completed' | 'waiting' | 'active' | 'delayed' | 'failed'): Promise<string[]>;
    getQueue(name: string): Queue | undefined;
    getWorkers(name: string): Worker[] | undefined;
    getAllQueueNames(): string[];
    getAllHealthChecks(): QueueHealthCheck[];
    getAllMetrics(): QueueMetrics[];
    getScheduledJobs(): ScheduledJobConfig[];
}
//# sourceMappingURL=enhanced-queue-manager.d.ts.map