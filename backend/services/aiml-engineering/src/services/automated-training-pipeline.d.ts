import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';
import { z } from 'zod';
export declare const TrainingPipelineConfigSchema: any;
export type TrainingPipelineConfig = z.infer<typeof TrainingPipelineConfigSchema>;
export interface TrainingPipeline {
    id: string;
    name: string;
    config: TrainingPipelineConfig;
    status: 'pending' | 'dataset_generation' | 'model_training' | 'evaluation' | 'deployment' | 'completed' | 'failed';
    current_stage: string;
    progress: number;
    dataset_id?: string;
    model_id?: string;
    adapter_id?: string;
    training_job_id?: string;
    evaluation_results?: any;
    deployment_info?: any;
    error_message?: string;
    created_at: Date;
    updated_at: Date;
    started_at?: Date;
    completed_at?: Date;
    logs: TrainingLog[];
}
export interface TrainingLog {
    timestamp: Date;
    level: 'info' | 'warn' | 'error';
    stage: string;
    message: string;
    metadata?: any;
}
export interface PipelineProgress {
    pipeline_id: string;
    stage: string;
    progress: number;
    message: string;
    estimated_completion?: Date;
}
export declare class AutomatedTrainingPipeline extends EventEmitter {
    private prisma;
    private queue;
    private datasetGenerator;
    private modelManager;
    private modelRegistry;
    private performanceMonitor;
    private activePipelines;
    constructor(prisma: PrismaClient);
    startPipeline(config: TrainingPipelineConfig): Promise<TrainingPipeline>;
    private generateDataset;
    private trainModel;
    private monitorTrainingProgress;
    private evaluateModel;
    private deployModel;
    private deployToStaging;
    private validateStagingDeployment;
    private deployToProduction;
    private rollbackDeployment;
    private handlePipelineError;
    private updatePipelineStatus;
    private addLog;
    private setupEventHandlers;
    private mapTaskToLoraDomain;
    getPipeline(pipelineId: string): Promise<TrainingPipeline | null>;
    listPipelines(): Promise<TrainingPipeline[]>;
    cancelPipeline(pipelineId: string): Promise<void>;
    getPipelineLogs(pipelineId: string): Promise<TrainingLog[]>;
}
//# sourceMappingURL=automated-training-pipeline.d.ts.map