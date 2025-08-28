import { PrismaClient } from '@prisma/client';
export interface ProcessingJob {
    documentId: string;
    priority: 'high' | 'medium' | 'low';
    processingType: 'initial' | 'reprocess' | 'comparison';
    metadata?: Record<string, any>;
}
export interface ProcessingResult {
    documentId: string;
    analysisId: string;
    riskScore: number;
    patterns: any[];
    insights: any[];
    processingTime: number;
    success: boolean;
    errorMessage?: string;
}
export interface QueueStats {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
}
export declare class DocumentProcessorService {
    private prisma;
    private processingQueue;
    private ollamaService;
    private patternService;
    private riskService;
    private isRunning;
    private concurrency;
    constructor(prisma: PrismaClient);
    startProcessingQueue(): Promise<void>;
    stop(): Promise<void>;
    private setupQueueHandlers;
    private processDocument;
    private analyzeDocument;
    private generateAIInsights;
    private buildInsightsPrompt;
    private parseInsightsResponse;
    private generateComparisonAnalysis;
    private generateComparisonInsights;
    private generateComparisonSummary;
    private queuePendingDocuments;
    queueProcessingJob(job: ProcessingJob): Promise<void>;
    private getPriorityValue;
    private getPriority;
    getQueueStatus(): Promise<QueueStats>;
    getProcessingStats(days?: number): Promise<any>;
    reprocessDocument(documentId: string): Promise<void>;
    getRecentAnalyses(limit?: number): Promise<any[]>;
}
//# sourceMappingURL=document-processor.d.ts.map