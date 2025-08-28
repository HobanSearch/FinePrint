export interface AnalysisRequest {
    content?: string;
    url?: string;
    fileBuffer?: Buffer;
    filename?: string;
    documentId: string;
    analysisId: string;
    userId: string;
    options?: {
        documentType?: string;
        language?: string;
        modelPreference?: 'speed' | 'accuracy' | 'balanced';
        includeEmbeddings?: boolean;
        includeSimilarDocuments?: boolean;
        customPatterns?: string[];
    };
}
export interface EnhancedAnalysisResult {
    analysisId: string;
    documentId: string;
    status: 'completed' | 'failed';
    overallRiskScore: number;
    riskLevel: 'minimal' | 'low' | 'moderate' | 'high' | 'critical';
    executiveSummary: string;
    keyFindings: string[];
    recommendations: string[];
    findings: Array<{
        id: string;
        category: string;
        title: string;
        description: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
        confidenceScore: number;
        textExcerpt: string;
        positionStart?: number;
        positionEnd?: number;
        recommendation: string;
        impactExplanation: string;
        patternId?: string;
    }>;
    semanticInsights?: {
        keyThemes: string[];
        documentSimilarity: Array<{
            documentId: string;
            similarity: number;
            title: string;
        }>;
        conceptClusters: string[];
    };
    processingTimeMs: number;
    modelUsed: string;
    confidence: number;
    categoryScores: {
        [category: string]: number;
    };
    patternMatches: {
        total: number;
        byCategory: {
            [category: string]: number;
        };
        bySeverity: {
            [severity: string]: number;
        };
    };
    extractionQuality: {
        textLength: number;
        wordCount: number;
        chunksProcessed: number;
        languageDetected: string;
        documentTypeDetected: string;
    };
}
export interface CitationReference {
    id: string;
    text: string;
    position: {
        start: number;
        end: number;
        page?: number;
        section?: string;
    };
    context: string;
    relevanceScore: number;
}
export declare class EnhancedAnalysisEngine {
    private ollamaService;
    constructor();
    initialize(): Promise<void>;
    analyzeDocument(request: AnalysisRequest): Promise<EnhancedAnalysisResult>;
    private extractText;
    private performAIAnalysis;
    private buildEnhancedAnalysisPrompt;
    private parseEnhancedAnalysisResponse;
    private performSemanticAnalysis;
    private identifyKeyConcepts;
    private combineFindings;
    private generateSemanticInsights;
    private calculateSeverityDistribution;
    private generateContentHash;
    analyzeDocumentWithProgress(request: AnalysisRequest, progressCallback?: (progress: {
        step: string;
        percentage: number;
        message: string;
    }) => void): Promise<EnhancedAnalysisResult>;
}
export declare const enhancedAnalysisEngine: EnhancedAnalysisEngine;
//# sourceMappingURL=enhancedAnalysis.d.ts.map