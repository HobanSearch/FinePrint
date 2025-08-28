import { DSPyService, OptimizationRecord } from './dspy-service';
import { z } from 'zod';
export declare const OptimizationConfig: any;
export type OptimizationConfigType = z.infer<typeof OptimizationConfig>;
export interface OptimizationJob {
    id: string;
    module_name: string;
    config: OptimizationConfigType;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    progress: number;
    started_at?: string;
    completed_at?: string;
    error_message?: string;
    results?: OptimizationResults;
}
export interface OptimizationResults {
    performance_before: number;
    performance_after: number;
    improvement_percentage: number;
    compilation_time_ms: number;
    iterations_completed: number;
    best_prompt: string;
    validation_metrics: Record<string, number>;
    optimization_history: OptimizationRecord[];
}
export declare const DatasetEntry: any;
export type DatasetEntryType = z.infer<typeof DatasetEntry>;
export declare class OptimizationEngine {
    private dspyService;
    private cache;
    private queue;
    private jobs;
    private isHealthy;
    constructor(dspyService: DSPyService);
    private initializeOptimizationQueue;
    startOptimization(moduleName: string, config: OptimizationConfigType, dataset: DatasetEntryType[]): Promise<string>;
    private processOptimizationJob;
    private createOptimizer;
    private splitDataset;
    private evaluateModule;
    private updateJobStatus;
    private generateJobId;
    getJob(jobId: string): OptimizationJob | undefined;
    listJobs(): OptimizationJob[];
    cancelJob(jobId: string): Promise<boolean>;
    isHealthy(): boolean;
    getOptimizationMetrics(): Promise<any>;
    private getOptimizerDistribution;
}
//# sourceMappingURL=optimization-engine.d.ts.map