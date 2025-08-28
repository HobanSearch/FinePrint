import type { DocumentAnalysisResponse, PaginationQuery } from '@fineprintai/shared-types';
export declare class AnalysisService {
    createAnalysis(data: {
        documentId: string;
        userId: string;
    }): Promise<any>;
    getAnalysisById(analysisId: string, userId: string): Promise<DocumentAnalysisResponse | null>;
    getUserAnalyses(userId: string, options: PaginationQuery & {
        status?: string;
    }): Promise<{
        analyses: any;
        pagination: PaginationInfo;
    }>;
    updateAnalysisStatus(analysisId: string, status: 'pending' | 'processing' | 'completed' | 'failed', errorMessage?: string): Promise<any>;
    saveAnalysisResults(analysisId: string, results: {
        overallRiskScore: number;
        executiveSummary: string;
        keyFindings: string[];
        recommendations: string[];
        findings: Array<{
            category: string;
            title: string;
            description: string;
            severity: 'low' | 'medium' | 'high' | 'critical';
            confidenceScore?: number;
            textExcerpt?: string;
            positionStart?: number;
            positionEnd?: number;
            recommendation?: string;
            impactExplanation?: string;
            patternId?: string;
        }>;
        processingTimeMs: number;
        modelUsed: string;
    }): Promise<void>;
    getAnalysisStats(userId?: string): Promise<{
        totalAnalyses: any;
        completedAnalyses: any;
        pendingAnalyses: any;
        failedAnalyses: any;
        avgRiskScore: any;
        completionRate: number;
    }>;
    deleteAnalysis(analysisId: string, userId: string): Promise<void>;
    getRecentAnalyses(userId: string, limit?: number): Promise<any>;
}
//# sourceMappingURL=analysis.d.ts.map