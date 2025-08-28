import { z } from 'zod';
export declare const LegalAnalysisSignature: any;
export declare const LegalAnalysisOutput: any;
export type LegalAnalysisInput = z.infer<typeof LegalAnalysisSignature>;
export type LegalAnalysisResult = z.infer<typeof LegalAnalysisOutput>;
export interface DSPyModule {
    name: string;
    signature: string;
    description: string;
    compiled: boolean;
    version: string;
    optimization_history: OptimizationRecord[];
    predict(input: any): Promise<any>;
    compile(optimizer: string, dataset?: any[]): Promise<void>;
}
export interface OptimizationRecord {
    timestamp: string;
    optimizer: string;
    dataset_size: number;
    performance_before: number;
    performance_after: number;
    improvement_percentage: number;
    compilation_time_ms: number;
}
export interface DSPyConfig {
    ollama_url: string;
    default_model: string;
    temperature: number;
    max_tokens: number;
    compilation_cache_ttl: number;
    optimization_threshold: number;
}
export declare class DSPyService {
    private client;
    private cache;
    private queue;
    private config;
    private modules;
    constructor();
    private setupInterceptors;
    private initializeBuiltinModules;
    callOllama(prompt: string, model?: string): Promise<string>;
    chatOllama(messages: Array<{
        role: string;
        content: string;
    }>, model?: string): Promise<string>;
    analyzeDocument(input: LegalAnalysisInput): Promise<LegalAnalysisResult>;
    private selectModule;
    private getCacheKey;
    private hashContent;
    private estimateTokenUsage;
    private calculateConfidenceScore;
    getModule(name: string): DSPyModule | undefined;
    registerModule(name: string, module: DSPyModule): void;
    listModules(): string[];
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=dspy-service.d.ts.map