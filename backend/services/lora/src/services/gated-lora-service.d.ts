import { z } from 'zod';
export declare const GatedLoRAConfig: any;
export type GatedLoRAConfigType = z.infer<typeof GatedLoRAConfig>;
export interface LoRALayer {
    id: string;
    name: string;
    rank: number;
    alpha: number;
    target_module: string;
    weight_a: number[][];
    weight_b: number[][];
    bias?: number[];
    gate_weights: number[];
    gate_bias: number[];
    dropout_rate: number;
    frozen: boolean;
    created_at: string;
    updated_at: string;
}
export interface GatedLoRAAdapter {
    id: string;
    name: string;
    description: string;
    base_model: string;
    config: GatedLoRAConfigType;
    layers: LoRALayer[];
    task_embeddings: Map<string, number[]>;
    performance_metrics: {
        parameters_added: number;
        parameters_trainable: number;
        memory_overhead_mb: number;
        inference_speedup: number;
        convergence_epochs: number;
        final_loss: number;
    };
    training_history: TrainingRecord[];
    created_at: string;
    updated_at: string;
    status: 'draft' | 'training' | 'trained' | 'deployed' | 'archived';
}
export interface TrainingRecord {
    epoch: number;
    loss: number;
    accuracy: number;
    gate_utilization: number;
    learning_rate: number;
    timestamp: string;
}
export declare const LoRATrainingDataset: any;
export type LoRATrainingDatasetType = z.infer<typeof LoRATrainingDataset>;
export declare class GatedLoRAService {
    private cache;
    private queue;
    private adapters;
    private datasets;
    private modelsPath;
    constructor();
    private initializeService;
    private loadAdaptersFromDisk;
    private initializeTrainingQueue;
    createAdapter(name: string, description: string, baseModel: string, config: GatedLoRAConfigType, taskTypes?: string[]): Promise<string>;
    private createLoRALayers;
    private initializeMatrix;
    private initializeVector;
    private generateTaskEmbedding;
    private hashString;
    private calculateParametersAdded;
    private calculateTrainableParameters;
    private estimateMemoryOverhead;
    inference(adapterId: string, input: string, taskType?: string): Promise<{
        output: string;
        gate_activations: number[];
        used_gates: number;
        inference_time_ms: number;
    }>;
    private computeGateActivations;
    private computeInputEmbedding;
    private forwardPassWithLoRA;
    private applyLoRATransformation;
    startTraining(adapterId: string, datasetId: string, trainingConfig: {
        epochs: number;
        learning_rate: number;
        batch_size: number;
        warmup_steps: number;
        weight_decay: number;
        gradient_clipping: number;
    }): Promise<string>;
    private processTrainingJob;
    private simulateTraining;
    createDataset(name: string, taskType: LoRATrainingDatasetType['task_type'], samples: LoRATrainingDatasetType['samples'], validationSplit?: number): Promise<string>;
    private generateAdapterId;
    private generateDatasetId;
    private saveAdapterToDisk;
    getAdapter(adapterId: string): GatedLoRAAdapter | undefined;
    getDataset(datasetId: string): LoRATrainingDatasetType | undefined;
    listAdapters(): GatedLoRAAdapter[];
    listDatasets(): LoRATrainingDatasetType[];
    deleteAdapter(adapterId: string): Promise<void>;
    healthCheck(): Promise<boolean>;
    getServiceMetrics(): {
        adapters_total: number;
        adapters_by_status: Record<string, number>;
        datasets_total: number;
        total_parameters: number;
        memory_usage_mb: number;
    };
}
//# sourceMappingURL=gated-lora-service.d.ts.map