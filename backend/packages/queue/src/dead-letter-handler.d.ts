import { Queue, Job } from 'bullmq';
import Redis from 'ioredis';
import { DeadLetterQueueConfig } from '@fineprintai/shared-types';
export interface DeadLetterJobData {
    originalQueue: string;
    originalJobId: string;
    jobData: any;
    error: string;
    stackTrace?: string;
    failedAt: Date;
    attempts: number;
    subscriptionTier?: string;
    userId?: string;
    teamId?: string;
}
export interface DeadLetterStats {
    totalJobs: number;
    jobsByQueue: Record<string, number>;
    jobsByError: Record<string, number>;
    jobsByTier: Record<string, number>;
    oldestJob?: Date;
    newestJob?: Date;
}
export declare class DeadLetterHandler {
    private connection;
    private deadLetterQueues;
    private configs;
    private alertThresholds;
    private lastAlertTimes;
    constructor(connection: Redis);
    createDeadLetterQueue(originalQueueName: string, config: DeadLetterQueueConfig): Queue;
    moveToDeadLetter(originalQueueName: string, job: Job, error: Error, attempts: number): Promise<boolean>;
    retryDeadLetterJobs(originalQueueName: string, filter?: {
        jobIds?: string[];
        errorPattern?: RegExp;
        olderThan?: Date;
        subscriptionTier?: string;
        maxJobs?: number;
    }): Promise<{
        succeeded: number;
        failed: number;
        errors: string[];
    }>;
    getDeadLetterStats(originalQueueName?: string): Promise<DeadLetterStats>;
    cleanupDeadLetterJobs(originalQueueName: string, olderThanDays?: number): Promise<number>;
    exportDeadLetterJobs(originalQueueName: string, format?: 'json' | 'csv'): Promise<string>;
    getDeadLetterJobs(originalQueueName: string, options?: {
        limit?: number;
        offset?: number;
        errorPattern?: RegExp;
        subscriptionTier?: string;
        since?: Date;
        until?: Date;
    }): Promise<DeadLetterJobData[]>;
    private checkAlertThreshold;
    private startCleanupScheduler;
    getDeadLetterQueues(): Map<string, Queue>;
    closeAll(): Promise<void>;
}
export default DeadLetterHandler;
//# sourceMappingURL=dead-letter-handler.d.ts.map