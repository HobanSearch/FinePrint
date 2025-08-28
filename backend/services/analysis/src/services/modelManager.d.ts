export interface ModelInfo {
    name: string;
    tag: string;
    size: number;
    digest: string;
    modifiedAt: Date;
    parameterSize: string;
    quantizationLevel: string;
    capabilities: ModelCapabilities;
    performance: ModelPerformance;
}
export interface ModelCapabilities {
    documentAnalysis: boolean;
    embedding: boolean;
    codeGeneration: boolean;
    reasoning: boolean;
    maxContextLength: number;
    languages: string[];
}
export interface ModelPerformance {
    avgTokensPerSecond: number;
    avgMemoryUsage: number;
    avgAnalysisTime: number;
    accuracy: number;
    lastBenchmark: Date;
}
export interface ModelSelection {
    model: string;
    reason: string;
    expectedPerformance: {
        speed: 'fast' | 'medium' | 'slow';
        accuracy: 'high' | 'medium' | 'low';
        resourceUsage: 'low' | 'medium' | 'high';
    };
}
export declare class ModelManager {
    private client;
    private availableModels;
    private modelQueue;
    private modelMetrics;
    private readonly SUPPORTED_MODELS;
    constructor();
    private initializeModelMetrics;
    initialize(): Promise<void>;
    refreshAvailableModels(): Promise<void>;
    ensureRequiredModels(): Promise<void>;
    downloadModel(modelName: string, onProgress?: (progress: number) => void): Promise<boolean>;
    removeModel(modelName: string): Promise<boolean>;
    selectOptimalModel(requirements: {
        documentType?: string;
        contentLength?: number;
        priority?: 'speed' | 'accuracy' | 'balanced';
        language?: string;
    }): ModelSelection;
    private calculateModelScore;
    private getExpectedPerformance;
    reserveModel(modelName: string): Promise<boolean>;
    releaseModel(modelName: string): void;
    updateModelPerformance(modelName: string, metrics: {
        tokensPerSecond?: number;
        memoryUsage?: number;
        analysisTime?: number;
        accuracy?: number;
    }): Promise<void>;
    getModelInfo(modelName: string): ModelInfo | null;
    getAvailableModels(): ModelInfo[];
    getModelStatus(): {
        [key: string]: {
            available: boolean;
            busy: boolean;
            performance: ModelPerformance;
        };
    };
    private extractParameterSize;
    private extractQuantizationLevel;
    private startHealthChecks;
    private performHealthCheck;
    benchmarkModel(modelName: string): Promise<ModelPerformance>;
}
export declare const modelManager: ModelManager;
//# sourceMappingURL=modelManager.d.ts.map