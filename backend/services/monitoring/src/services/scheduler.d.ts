interface ScheduledTask {
    id: string;
    name: string;
    schedule: string;
    task: () => Promise<void>;
    enabled: boolean;
    lastRun?: Date;
    nextRun?: Date;
    runCount: number;
    errorCount: number;
    lastError?: string;
    timeout?: number;
}
declare class SchedulerService {
    private tasks;
    private cronJobs;
    private initialized;
    initialize(): Promise<void>;
    registerTask(task: Omit<ScheduledTask, 'runCount' | 'errorCount'>): Promise<void>;
    startTask(taskId: string): Promise<boolean>;
    stopTask(taskId: string): Promise<boolean>;
    executeTask(taskId: string): Promise<void>;
    runTaskNow(taskId: string): Promise<void>;
    getTask(taskId: string): ScheduledTask | undefined;
    getAllTasks(): ScheduledTask[];
    getTaskStatus(): {
        totalTasks: number;
        enabledTasks: number;
        runningTasks: number;
        totalRuns: number;
        totalErrors: number;
    };
    private registerDefaultTasks;
    private startAllTasks;
    private getNextRunTime;
    pauseAllTasks(): Promise<void>;
    resumeAllTasks(): Promise<void>;
    healthCheck(): Promise<void>;
    shutdown(): Promise<void>;
}
export declare const schedulerService: SchedulerService;
export {};
//# sourceMappingURL=scheduler.d.ts.map