import { ModelRegistry } from './model-registry';
import { PerformanceMonitor } from './performance-monitor';
import { ResourceOptimizer } from './resource-optimizer';
import { z } from 'zod';
import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
export declare const TrainingConfigSchema: any;
export type TrainingConfig = z.infer<typeof TrainingConfigSchema>;
export interface TrainingJob {
    id: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
    config: TrainingConfig;
    metrics: TrainingMetrics;
    process?: ChildProcess;
    created_at: string;
    started_at?: string;
    completed_at?: string;
    error_message?: string;
    checkpoints: string[];
    logs: TrainingLog[];
    resource_usage: ResourceUsage;
}
export interface TrainingMetrics {
    epoch: number;
    step: number;
    train_loss: number;
    eval_loss?: number;
    accuracy?: number;
    f1_score?: number;
    precision?: number;
    recall?: number;
    learning_rate: number;
    gpu_memory_mb: number;
    cpu_usage_percent: number;
    eta_seconds?: number;
    samples_per_second?: number;
}
export interface TrainingLog {
    timestamp: string;
    level: 'info' | 'warning' | 'error' | 'debug';
    message: string;
    metadata?: any;
}
export interface ResourceUsage {
    gpu_utilization: number;
    gpu_memory_used: number;
    gpu_memory_total: number;
    cpu_utilization: number;
    memory_used_mb: number;
    disk_usage_mb: number;
}
export declare const ModelValidationSchema: any;
export type ModelValidation = z.infer<typeof ModelValidationSchema>;
export declare class ModelLifecycleManager extends EventEmitter {
    private cache;
    private queue;
    private modelRegistry;
    private performanceMonitor;
    private resourceOptimizer;
    private activeJobs;
    private modelsPath;
    private scriptsPath;
    constructor(modelRegistry: ModelRegistry, performanceMonitor: PerformanceMonitor, resourceOptimizer: ResourceOptimizer);
    initialize(): Promise<void>;
    private initializeTrainingQueue;
    private loadActiveJobs;
    private setupTrainingScripts;
    startTraining(config: TrainingConfig): Promise<string>;
    private processTrainingJob;
    private monitorTrainingProcess;
    private parseTrainingOutput;
    private startResourceMonitoring;
    private waitForProcessCompletion;
    private registerTrainedModel;
    stopTraining(jobId: string): Promise<void>;
    pauseTraining(jobId: string): Promise<void>;
    resumeTraining(jobId: string): Promise<void>;
    stopAllTraining(): Promise<void>;
    private updateActiveJobsCache;
    getJob(jobId: string): TrainingJob | undefined;
    listJobs(status?: TrainingJob['status']): TrainingJob[];
    getJobLogs(jobId: string, limit?: number): TrainingLog[];
    validateModel(validation: ModelValidation): Promise<string>;
    private processValidationJob;
    getServiceMetrics(): {
        total_jobs: number;
        jobs_by_status: Record<string, number>;
        active_jobs: number;
        completed_jobs: number;
        failed_jobs: number;
    };
}
//# sourceMappingURL=model-lifecycle-manager.d.ts.map