import { Queue } from 'bullmq';
import { ScheduledJobConfig } from '@fineprintai/shared-types';
import EventEmitter from 'eventemitter3';
export interface ScheduledJobExecution {
    configName: string;
    executionId: string;
    scheduledFor: Date;
    executedAt: Date;
    success: boolean;
    jobId?: string;
    error?: string;
    duration?: number;
}
export interface SchedulerStats {
    totalJobs: number;
    activeJobs: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageExecutionTime: number;
    nextExecution?: {
        configName: string;
        scheduledFor: Date;
    };
}
export declare class JobScheduler extends EventEmitter {
    private scheduledJobs;
    private queues;
    private schedulerInterval;
    private executionHistory;
    private nextExecutions;
    private isRunning;
    private readonly checkInterval;
    private readonly maxHistoryPerJob;
    private readonly maxMissedExecutions;
    constructor();
    scheduleJob(config: ScheduledJobConfig, queue: Queue): void;
    updateScheduledJob(name: string, updates: Partial<ScheduledJobConfig>): boolean;
    toggleScheduledJob(name: string, enabled: boolean): boolean;
    removeScheduledJob(name: string): boolean;
    executeJobNow(name: string): Promise<string | null>;
    getScheduledJobs(): ScheduledJobConfig[];
    getScheduledJob(name: string): ScheduledJobConfig | undefined;
    getExecutionHistory(name: string, limit?: number): ScheduledJobExecution[];
    getSchedulerStats(): SchedulerStats;
    getUpcomingExecutions(withinMinutes?: number): Array<{
        configName: string;
        scheduledFor: Date;
        config: ScheduledJobConfig;
    }>;
    static validateCronExpression(cron: string, timezone?: string): boolean;
    static getNextExecutions(cron: string, count?: number, timezone?: string): Date[];
    private startScheduler;
    private processScheduledJobs;
    private executeScheduledJob;
    private calculateNextRun;
    private recordExecution;
    private getRecentFailures;
    stop(): void;
    close(): Promise<void>;
}
export default JobScheduler;
//# sourceMappingURL=job-scheduler.d.ts.map