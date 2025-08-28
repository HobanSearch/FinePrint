export interface AIModelConfig {
    name: string;
    endpoint: string;
    maxTokens: number;
    temperature: number;
    timeout: number;
}
export interface AIGenerationRequest {
    prompt: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
    context?: Record<string, any>;
}
export interface AIGenerationResponse {
    content: string;
    model: string;
    tokens: {
        prompt: number;
        completion: number;
        total: number;
    };
    finishReason: string;
    processingTime: number;
}
export declare class AIService {
    private readonly logger;
    private readonly cache;
    private readonly models;
    constructor();
    generateCode(prompt: string, language: string, model?: string): Promise<string>;
    generateStructuredResponse(prompt: string, model?: string): Promise<string>;
    generateContext(prompt: string, model?: string): Promise<string>;
    generateArchitectureRecommendation(requirements: string[], constraints: string[], options: any[], model?: string): Promise<string>;
    generateQualityAssessment(code: string, language: string, checks: string[], model?: string): Promise<string>;
    generateDocumentation(code: string, language: string, type: 'api' | 'component' | 'readme' | 'tutorial', model?: string): Promise<string>;
    generateTestCases(code: string, language: string, testFramework: string, model?: string): Promise<string>;
    explainCode(code: string, language: string, audience?: 'developer' | 'manager' | 'user', model?: string): Promise<string>;
    private generate;
    private initializeModels;
    private getModelConfig;
    private buildFullPrompt;
    private buildCodeGenerationSystemPrompt;
    private buildDocumentationSystemPrompt;
    private buildExplanationSystemPrompt;
    private extractCodeFromResponse;
    private extractJsonFromResponse;
    private generateCacheKey;
}
//# sourceMappingURL=ai-service.d.ts.map