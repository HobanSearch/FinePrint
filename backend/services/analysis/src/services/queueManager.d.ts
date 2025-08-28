import { AnalysisRequest, EnhancedAnalysisResult } from './enhancedAnalysis';
import { EventEmitter } from 'events';
export interface QueueJob {
    id: string;
    analysisId: string;
    documentId: string;
    userId: string;
    request: AnalysisRequest;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    result?: EnhancedAnalysisResult;
    error?: string;
    attempts: number;
    maxAttempts: number;
    estimatedDuration?: number;
    actualDuration?: number;
    assignedModel?: string;
}
export interface QueueStats {
    totalJobs: number;
    pendingJobs: number;
    processingJobs: number;
    completedJobs: number;
    failedJobs: number;
    averageProcessingTime: number;
    queueThroughput: number;
    modelUtilization: {
        [model: string]: number;
    };
    currentLoad: number;
}
export interface BatchJobRequest {
    jobs: Array<{
        analysisId: string;
        documentId: string;
        userId: string;
        request: AnalysisRequest;
        priority?: 'low' | 'normal' | 'high' | 'urgent';
    }>;
    batchId?: string;
    maxConcurrency?: number;
    completionCallback?: (results: EnhancedAnalysisResult[]) => void;
}
export declare class QueueManager extends EventEmitter {
    private jobs;
    private queues;
    private processing;
    private maxConcurrentJobs;
    private processingIntervalId?;
    private statsIntervalId?;
    private isProcessing;
    private completedJobsLastHour;
    private currentMinute;
    constructor(maxConcurrentJobs?: number);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    addJob(analysisId: string, documentId: string, userId: string, request: AnalysisRequest, priority?: 'low' | 'normal' | 'high' | 'urgent'): Promise<string>;
    addBatchJobs(batchRequest: BatchJobRequest): Promise<string[]>;
    cancelJob(jobId: string): Promise<boolean>;
    getJob(jobId: string): QueueJob | undefined;
    getJobsByUser(userId: string): QueueJob[];
    getJobsByAnalysis(analysisId: string): QueueJob[];
    getQueueStats(): QueueStats;
    private startProcessingLoop;
    private processNext;
    private getNextJobId;
    private getTotalQueueSize;
    private estimateJobDuration;
    private trackBatchCompletion;
    private calculateModelUtilization;
    private updateThroughputStats;
    private startStatsCollection;
    private startCleanupTask;
    private cleanupOldJobs;
    getDetailedStats(): Promise<any>;
    adjustCapacity(newMaxConcurrency: number): Promise<void>;
}
export declare const queueManager: QueueManager;
//# sourceMappingURL=queueManager.d.ts.map