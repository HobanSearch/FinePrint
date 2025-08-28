import type { OllamaRequest, OllamaResponse } from '@fineprintai/shared-types';
interface EnhancedAnalysisConfig {
    useDSPy: boolean;
    useLoRA: boolean;
    useKnowledgeGraph: boolean;
    curriculumLevel: 'basic' | 'intermediate' | 'advanced';
    adapterId?: string;
    moduleOverride?: string;
    knowledgeContext?: string[];
}
interface EnhancedAnalysisResult {
    riskScore: number;
    executiveSummary: string;
    keyFindings: string[];
    recommendations: string[];
    findings: Array<{
        category: string;
        title: string;
        description: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
        confidenceScore: number;
        textExcerpt?: string;
        recommendation?: string;
        impactExplanation?: string;
        knowledgeReferences?: string[];
        curriculumContext?: string;
    }>;
    enhancementMetadata: {
        dspyModule?: string;
        loraAdapter?: string;
        knowledgeContext: string[];
        curriculumLevel: string;
        processingTime: number;
        enhancementScore: number;
    };
}
export declare class EnhancedOllamaService {
    private client;
    private baseUrl;
    private cache;
    private dspyServiceUrl;
    private loraServiceUrl;
    private knowledgeGraphUrl;
    constructor();
    generate(request: OllamaRequest): Promise<OllamaResponse>;
    chat(messages: Array<{
        role: string;
        content: string;
    }>, model?: string): Promise<string>;
    getAvailableModels(): Promise<string[]>;
    pullModel(modelName: string): Promise<boolean>;
    isModelAvailable(modelName: string): Promise<boolean>;
    analyzeDocument(content: string, documentType: string, language?: string, enhancementConfig?: EnhancedAnalysisConfig): Promise<EnhancedAnalysisResult>;
    private legacyAnalyzeDocument;
    private buildAnalysisPrompt;
    private parseAnalysisResponse;
    healthCheck(): Promise<boolean>;
    private getKnowledgeContext;
    private dspyEnhancedAnalysis;
    private loraEnhancedAnalysis;
    private curriculumAwareEnhancement;
    private addKnowledgeReferences;
    private wrapLegacyResult;
    private calculateEnhancementScore;
    private mapCurriculumToDepth;
    batchAnalyzeDocuments(documents: Array<{
        content: string;
        documentType: string;
        language?: string;
        enhancementConfig?: EnhancedAnalysisConfig;
    }>): Promise<EnhancedAnalysisResult[]>;
    checkIntegrationHealth(): Promise<{
        ollama: boolean;
        dspy: boolean;
        lora: boolean;
        knowledgeGraph: boolean;
        overall: boolean;
    }>;
}
export {};
//# sourceMappingURL=ollama.d.ts.map