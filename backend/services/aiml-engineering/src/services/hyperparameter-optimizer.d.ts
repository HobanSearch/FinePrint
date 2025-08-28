import { ModelRegistry } from './model-registry';
import { PerformanceMonitor } from './performance-monitor';
import { z } from 'zod';
import { EventEmitter } from 'events';
export declare const SearchSpaceSchema: any;
export type SearchSpace = z.infer<typeof SearchSpaceSchema>;
export declare const OptimizationConfigSchema: any;
export type OptimizationConfig = z.infer<typeof OptimizationConfigSchema>;
export interface Trial {
    id: string;
    number: number;
    study_id: string;
    parameters: Record<string, any>;
    value: number | number[];
    state: 'running' | 'complete' | 'pruned' | 'failed';
    datetime_start: string;
    datetime_complete?: string;
    duration_seconds?: number;
    intermediate_values: Array<{
        step: number;
        value: number;
        timestamp: string;
    }>;
    user_attrs: Record<string, any>;
    system_attrs: Record<string, any>;
    training_job_id?: string;
    error_message?: string;
}
export interface OptimizationStudy {
    id: string;
    name: string;
    config: OptimizationConfig;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    trials: Trial[];
    best_trial?: Trial;
    best_parameters?: Record<string, any>;
    best_value?: number | number[];
    created_at: string;
    started_at?: string;
    completed_at?: string;
    metadata: {
        total_trials: number;
        completed_trials: number;
        pruned_trials: number;
        failed_trials: number;
        study_direction: string;
        sampler_name: string;
        pruner_name: string;
    };
    resource_usage: {
        total_gpu_hours: number;
        total_cpu_hours: number;
        peak_memory_gb: number;
        total_cost_estimate: number;
    };
}
export declare class HyperparameterOptimizer extends EventEmitter {
    private cache;
    private queue;
    private modelRegistry;
    private performanceMonitor;
    private activeStudies;
    private studiesPath;
    private scriptsPath;
    constructor(modelRegistry: ModelRegistry, performanceMonitor: PerformanceMonitor);
    initialize(): Promise<void>;
    private initializeOptimizationQueue;
    private loadActiveStudies;
    private setupOptimizationScripts;
    startOptimization(config: OptimizationConfig): Promise<string>;
    private processOptimizationStudy;
    private monitorOptimizationProcess;
    private parseOptimizationOutput;
    private startOptimizationResourceMonitoring;
    private getResourceUsage;
    private waitForOptimizationCompletion;
    private processOptimizationResults;
    stopOptimization(studyId: string): Promise<void>;
    private updateActiveStudiesCache;
    startMultiObjectiveOptimization(config: OptimizationConfig): Promise<string>;
    startBayesianOptimization(config: OptimizationConfig, acquisitionFunction?: string): Promise<string>;
    startHyperbandOptimization(config: OptimizationConfig): Promise<string>;
    getStudy(studyId: string): OptimizationStudy | undefined;
    listStudies(status?: OptimizationStudy['status']): OptimizationStudy[];
    getTrials(studyId: string): Trial[];
    getBestTrials(studyId: string, n?: number): Trial[];
    generateOptimizationReport(studyId: string): Promise<any>;
    private calculateParameterImportance;
    private calculateCorrelation;
    private getCumulativeBest;
    getServiceMetrics(): {
        total_studies: number;
        studies_by_status: Record<string, number>;
        total_trials: number;
        active_studies: number;
        completed_studies: number;
        total_cost_estimate: number;
        avg_trials_per_study: number;
    };
}
//# sourceMappingURL=hyperparameter-optimizer.d.ts.map