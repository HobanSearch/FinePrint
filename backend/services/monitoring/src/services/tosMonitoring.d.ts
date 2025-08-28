interface DocumentVersion {
    id: string;
    documentId: string;
    version: number;
    content: string;
    contentHash: string;
    detectedAt: Date;
    changeType: 'minor' | 'major' | 'structural';
    changeSummary?: string;
    riskScore: number;
    metadata: Record<string, any>;
}
interface MonitoringJob {
    id: string;
    documentId: string;
    url: string;
    userId: string;
    teamId?: string;
    frequency: number;
    lastCrawledAt?: Date;
    nextCrawlAt: Date;
    isActive: boolean;
    retryCount: number;
    lastError?: string;
    crawlConfig: {
        userAgent: string;
        timeout: number;
        followRedirects: boolean;
        respectRobotsTxt: boolean;
    };
}
declare class TosMonitoringService {
    private prisma;
    private initialized;
    private monitoringJobs;
    private versionHistory;
    constructor();
    initialize(): Promise<void>;
    createMonitoringJob(data: {
        documentId: string;
        url: string;
        userId: string;
        teamId?: string;
        frequency: number;
        crawlConfig?: Partial<MonitoringJob['crawlConfig']>;
    }): Promise<MonitoringJob>;
    updateMonitoringJob(jobId: string, updates: Partial<Pick<MonitoringJob, 'frequency' | 'isActive' | 'crawlConfig'>>): Promise<MonitoringJob>;
    deleteMonitoringJob(jobId: string): Promise<void>;
    processMonitoringJob(jobId: string): Promise<void>;
    private performInitialCrawl;
    private updateJobAfterSuccessfulCrawl;
    private handleCrawlError;
    private loadMonitoringJobs;
    private initializeSchedules;
    getJobsDueForProcessing(): Promise<MonitoringJob[]>;
    getMonitoringStats(): Promise<{
        totalJobs: number;
        activeJobs: number;
        failedJobs: number;
        totalVersions: number;
        averageRiskScore: number;
    }>;
    getDocumentVersionHistory(documentId: string, limit?: number): Promise<DocumentVersion[]>;
    healthCheck(): Promise<void>;
    shutdown(): Promise<void>;
}
export declare const tosMonitoringService: TosMonitoringService;
export {};
//# sourceMappingURL=tosMonitoring.d.ts.map