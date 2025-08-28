export interface DocumentAnalysisRequest {
    content?: string;
    url?: string;
    fileBuffer?: Buffer;
    filename?: string;
    documentType?: string;
    language?: string;
    userId: string;
    teamId?: string;
}
export interface DocumentAnalysisResponse {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    documentId: string;
    overallRiskScore: number | null;
    executiveSummary: string | null;
    keyFindings: string[];
    recommendations: string[];
    findings: AnalysisFindingResponse[];
    processingTimeMs: number | null;
    modelUsed: string | null;
    createdAt: Date;
    completedAt: Date | null;
}
export interface AnalysisFindingResponse {
    id: string;
    category: string;
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    confidenceScore: number | null;
    textExcerpt: string | null;
    positionStart: number | null;
    positionEnd: number | null;
    recommendation: string | null;
    impactExplanation: string | null;
}
export interface DocumentUpload {
    title: string;
    content?: string;
    url?: string;
    documentType: string;
    filename?: string;
    contentLength?: number;
    language?: string;
    monitoringEnabled?: boolean;
    monitoringFrequency?: number;
}
export interface DocumentResponse {
    id: string;
    title: string;
    url: string | null;
    documentType: string;
    documentHash: string;
    contentLength: number | null;
    language: string;
    monitoringEnabled: boolean;
    monitoringFrequency: number;
    lastMonitoredAt: Date | null;
    nextMonitorAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
export interface PatternMatch {
    patternId: string;
    category: string;
    name: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    confidence: number;
    matches: TextMatch[];
}
export interface TextMatch {
    text: string;
    start: number;
    end: number;
    context: string;
}
export interface OllamaRequest {
    model: string;
    prompt: string;
    stream?: boolean;
    options?: {
        temperature?: number;
        top_p?: number;
        max_tokens?: number;
        presence_penalty?: number;
        frequency_penalty?: number;
    };
}
export interface OllamaResponse {
    model: string;
    response: string;
    done: boolean;
    context?: number[];
    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
    prompt_eval_duration?: number;
    eval_count?: number;
    eval_duration?: number;
}
export interface PatternLibraryEntry {
    id: string;
    category: string;
    name: string;
    description: string;
    patternRegex: string | null;
    patternKeywords: string[];
    severity: 'low' | 'medium' | 'high' | 'critical';
    explanation: string | null;
    recommendation: string | null;
    legalContext: string | null;
    examples: string[];
    isActive: boolean;
    isCustom: boolean;
    version: number;
}
export interface AnalysisJobData {
    analysisId: string;
    documentId: string;
    userId: string;
    content: string;
    documentType: string;
    language: string;
    modelPreference?: string;
}
export interface AnalysisJobResult {
    analysisId: string;
    status: 'completed' | 'failed';
    overallRiskScore?: number;
    executiveSummary?: string;
    keyFindings?: string[];
    recommendations?: string[];
    findings?: AnalysisFindingResponse[];
    processingTimeMs?: number;
    modelUsed?: string;
    error?: string;
}
//# sourceMappingURL=analysis.d.ts.map