import { EnhancedAnalysisResult } from './enhancedAnalysis';
export interface UnifiedAnalysisRequest {
    content?: string;
    url?: string;
    fileBuffer?: Buffer;
    filename?: string;
    userId: string;
    teamId?: string;
    documentType?: 'terms_of_service' | 'privacy_policy' | 'eula' | 'cookie_policy' | 'data_processing_agreement' | 'service_agreement' | 'other';
    language?: string;
    priority?: 'low' | 'normal' | 'high';
    options?: {
        modelPreference?: 'speed' | 'accuracy' | 'balanced';
        includeEmbeddings?: boolean;
        includeSimilarDocuments?: boolean;
        enableChangeMonitoring?: boolean;
        generateReport?: boolean;
        customPatterns?: string[];
        webhookUrl?: string;
    };
}
export interface UnifiedAnalysisResponse {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    documentId: string;
    progress?: {
        percentage: number;
        stage: string;
        message: string;
        estimatedTimeRemaining?: number;
    };
    queuePosition?: number;
    createdAt: Date;
    completedAt?: Date;
    results?: EnhancedAnalysisResult;
    quota?: {
        used: number;
        limit: number;
        resetDate: Date;
    };
    changeAlert?: {
        enabled: boolean;
        lastChecked?: Date;
    };
}
export interface AnalysisStats {
    total: number;
    completed: number;
    pending: number;
    failed: number;
    avgRiskScore: number;
    avgProcessingTime: number;
    topCategories: Array<{
        category: string;
        count: number;
    }>;
    riskDistribution: {
        [level: string]: number;
    };
    recentTrends: Array<{
        date: string;
        count: number;
        avgRisk: number;
    }>;
}
export declare class UnifiedAnalysisEngine {
    private analysisService;
    private wsService?;
    private notificationService?;
    private processingQueue;
    constructor();
    initialize(): Promise<void>;
    createAnalysis(request: UnifiedAnalysisRequest): Promise<UnifiedAnalysisResponse>;
    getAnalysis(analysisId: string, userId: string): Promise<UnifiedAnalysisResponse | null>;
    getUserAnalyses(userId: string, options?: {
        page?: number;
        limit?: number;
        status?: string;
        documentType?: string;
        sortBy?: 'created' | 'completed' | 'risk_score';
        sortOrder?: 'asc' | 'desc';
    }): Promise<{
        analyses: UnifiedAnalysisResponse[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
            hasNext: boolean;
            hasPrev: boolean;
        };
        stats: AnalysisStats;
    }>;
    cancelAnalysis(analysisId: string, userId: string): Promise<boolean>;
    private processAnalysisAsync;
    private createDocumentRecord;
    private fetchDocumentFromUrl;
    private checkUserQuota;
    private updateUserQuota;
    private getPriorityScore;
    private getRiskLevel;
    private getQueueInfo;
    private getUserAnalysisStats;
    private getTopCategories;
    private getRiskDistribution;
    private getRecentTrends;
    private enableChangeMonitoring;
    private generateAnalysisReport;
    private sendWebhook;
}
export declare const unifiedAnalysisEngine: UnifiedAnalysisEngine;
//# sourceMappingURL=analysisEngine.d.ts.map