import { z } from 'zod';
export declare const ModelMetadataSchema: any;
export type ModelMetadata = z.infer<typeof ModelMetadataSchema>;
export interface ModelVersion {
    id: string;
    model_name: string;
    version: string;
    metadata: ModelMetadata;
    changelog: string;
    created_at: string;
    is_latest: boolean;
    download_count: number;
    deployment_count: number;
}
export interface ModelArtifact {
    id: string;
    model_id: string;
    artifact_type: 'model_weights' | 'tokenizer' | 'config' | 'training_data' | 'documentation' | 'other';
    file_path: string;
    file_name: string;
    file_size_bytes: number;
    checksum: string;
    compressed: boolean;
    created_at: string;
}
export declare class ModelRegistry {
    private cache;
    private models;
    private versions;
    private artifacts;
    private registryPath;
    private artifactsPath;
    constructor();
    initialize(): Promise<void>;
    private loadModelsFromDisk;
    private loadModelVersions;
    registerModel(metadata: Partial<ModelMetadata>): Promise<string>;
    private saveModelMetadata;
    private createModelVersion;
    updateModel(modelId: string, updates: Partial<ModelMetadata>): Promise<void>;
    getModel(modelId: string): Promise<ModelMetadata | null>;
    getModelByName(name: string, version?: string): Promise<ModelMetadata | null>;
    listModels(filters?: {
        type?: string;
        task?: string;
        status?: string;
        tags?: string[];
        domain?: string;
    }): Promise<ModelMetadata[]>;
    getModelVersions(modelName: string): Promise<ModelVersion[]>;
    getLatestVersion(modelName: string): Promise<ModelVersion | null>;
    promoteModel(modelId: string, newStatus: ModelMetadata['status']): Promise<void>;
    archiveModel(modelId: string): Promise<void>;
    deprecateModel(modelId: string): Promise<void>;
    deleteModel(modelId: string, force?: boolean): Promise<void>;
    addArtifact(modelId: string, artifactType: ModelArtifact['artifact_type'], filePath: string, fileName?: string, compress?: boolean): Promise<string>;
    private calculateChecksum;
    getModelArtifacts(modelId: string): Promise<ModelArtifact[]>;
    downloadArtifact(modelId: string, artifactId: string): Promise<string>;
    private deleteModelArtifacts;
    searchModels(query: string, filters?: any): Promise<ModelMetadata[]>;
    compareModels(modelIds: string[]): Promise<any>;
    private comparePerformanceMetrics;
    private compareResourceRequirements;
    private checkCompatibility;
    getServiceMetrics(): {
        total_models: number;
        total_versions: number;
        total_artifacts: number;
        models_by_status: z.infer<any>;
        models_by_type: z.infer<any>;
        deployed_models: number;
        avg_versions_per_model: number;
    };
}
//# sourceMappingURL=model-registry.d.ts.map