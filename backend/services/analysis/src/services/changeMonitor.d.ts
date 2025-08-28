export interface ChangeMonitorConfig {
    id: string;
    userId: string;
    teamId?: string;
    analysisId: string;
    url: string;
    enabled: boolean;
    checkInterval: number;
    sensitivity: 'low' | 'medium' | 'high';
    alertTypes: ('email' | 'webhook' | 'websocket' | 'sms')[];
    webhookUrl?: string;
    emailRecipients?: string[];
    schedule?: string;
    timezone?: string;
    ignoreMinorChanges?: boolean;
    keywordsToWatch?: string[];
    sectionsToWatch?: string[];
    createdAt: Date;
    updatedAt: Date;
    lastCheck?: Date;
    nextCheck?: Date;
    status: 'active' | 'paused' | 'error' | 'disabled';
    errorMessage?: string;
    checksPerformed: number;
    changesDetected: number;
}
export interface ChangeDetectionResult {
    id: string;
    monitorId: string;
    detectedAt: Date;
    changeType: 'minor' | 'moderate' | 'major' | 'critical';
    changeScore: number;
    affectedSections: string[];
    originalContent: string;
    newContent: string;
    contentHash: string;
    diffSummary: string;
    originalAnalysis?: {
        riskScore: number;
        keyFindings: string[];
    };
    newAnalysis?: {
        riskScore: number;
        keyFindings: string[];
    };
    analysisChanged: boolean;
    riskScoreChange: number;
    addedContent: string[];
    removedContent: string[];
    modifiedSections: Array<{
        section: string;
        originalText: string;
        newText: string;
    }>;
    newRiskyPatterns: string[];
    removedRiskyPatterns: string[];
    metadata: {
        contentLength: number;
        wordCount: number;
        checkDuration: number;
        userAgent: string;
    };
}
export interface MonitoringAlert {
    id: string;
    monitorId: string;
    changeId: string;
    alertType: 'email' | 'webhook' | 'websocket' | 'sms';
    title: string;
    message: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    recipient?: string;
    deliveryStatus: 'pending' | 'sent' | 'failed' | 'delivered';
    sentAt?: Date;
    deliveredAt?: Date;
    errorMessage?: string;
    createdAt: Date;
}
export declare class ChangeMonitoringService {
    private notificationService?;
    private wsService?;
    private activeMonitors;
    private cronJobs;
    constructor();
    initialize(): Promise<void>;
    createMonitor(config: Omit<ChangeMonitorConfig, 'id' | 'createdAt' | 'updatedAt' | 'checksPerformed' | 'changesDetected'>): Promise<ChangeMonitorConfig>;
    getMonitor(monitorId: string, userId: string): Promise<ChangeMonitorConfig | null>;
    updateMonitor(monitorId: string, userId: string, updates: Partial<ChangeMonitorConfig>): Promise<ChangeMonitorConfig>;
    deleteMonitor(monitorId: string, userId: string): Promise<boolean>;
    listUserMonitors(userId: string, options?: {
        page?: number;
        limit?: number;
        status?: string;
        enabled?: boolean;
    }): Promise<{
        monitors: ChangeMonitorConfig[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    getChangeHistory(monitorId: string, userId: string, options?: {
        page?: number;
        limit?: number;
        changeType?: string;
    }): Promise<{
        changes: ChangeDetectionResult[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    manualCheck(monitorId: string, userId: string): Promise<ChangeDetectionResult | null>;
    private startMonitoring;
    private stopMonitoring;
    private performScheduledCheck;
    private performCheck;
    private analyzeChanges;
    private calculateChangeScore;
    private determineChangeType;
    private findAddedContent;
    private findRemovedContent;
    private findModifiedSections;
    private extractSection;
    private findRiskyPatterns;
    private generateDiffSummary;
    private identifyAffectedSections;
    private areSimilar;
    private getAnalysisForContent;
    private sendAlerts;
    private sendAlert;
    private sendEmailAlert;
    private sendWebhookAlert;
    private getAlertPriority;
    private generateAlertTitle;
    private generateAlertMessage;
    private generateEmailBody;
    private storeChangeRecord;
    private fetchContentSafely;
    private getOriginalContent;
    private validateUrl;
    private calculateNextCheck;
    private loadActiveMonitors;
    private startCleanupJob;
    private mapDatabaseToConfig;
    private mapDatabaseToChangeResult;
}
export declare const changeMonitoringService: ChangeMonitoringService;
//# sourceMappingURL=changeMonitor.d.ts.map