export interface JobOptions {
    priority?: number;
    delay?: number;
    attempts?: number;
    backoff?: {
        type: 'fixed' | 'exponential';
        delay?: number;
    };
    removeOnComplete?: number | boolean;
    removeOnFail?: number | boolean;
    jobId?: string;
    repeat?: {
        cron?: string;
        every?: number;
        limit?: number;
        endDate?: Date;
    };
    subscriptionTier?: SubscriptionTier;
    userId?: string;
    teamId?: string;
    timeout?: number;
    tags?: string[];
    deadLetterQueue?: boolean;
    retryDeadline?: Date;
}
export interface JobProgress {
    percentage: number;
    stage: string;
    message?: string;
    data?: Record<string, any>;
}
export interface QueueConfig {
    name: string;
    redis: {
        host: string;
        port: number;
        password?: string;
        db?: number;
    };
    defaultJobOptions: JobOptions;
    settings?: {
        stalledInterval?: number;
        maxStalledCount?: number;
        retryProcessDelay?: number;
    };
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
export interface MonitoringJobData {
    documentId: string;
    url: string;
    lastHash: string;
    userId: string;
    teamId?: string;
}
export interface NotificationJobData {
    notificationId: string;
    userId: string;
    type: string;
    channels: Array<{
        type: string;
        config: Record<string, any>;
    }>;
    title: string;
    message: string;
    data?: Record<string, any>;
}
export interface EmailJobData {
    to: string;
    subject: string;
    html: string;
    text?: string;
    templateId?: string;
    templateData?: Record<string, any>;
    metadata?: Record<string, any>;
}
export interface WebhookJobData {
    url: string;
    method: 'POST' | 'PUT' | 'PATCH';
    headers: Record<string, string>;
    payload: Record<string, any>;
    retryCount: number;
    maxRetries: number;
}
export interface ActionJobData {
    actionId: string;
    userId: string;
    templateId?: string;
    actionType: 'email' | 'api_call' | 'document_generation';
    config: Record<string, any>;
}
export interface CleanupJobData {
    type: 'expired_analyses' | 'old_sessions' | 'temp_files';
    olderThan: Date;
    batchSize?: number;
}
export interface ExportJobData {
    userId: string;
    exportType: 'gdpr_export' | 'user_data' | 'analysis_report';
    format: 'json' | 'csv' | 'pdf';
    filters?: Record<string, any>;
}
export interface QueueStats {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
}
export interface JobStatus {
    id: string;
    name: string;
    data: any;
    progress: JobProgress | null;
    status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused';
    createdAt: Date;
    startedAt?: Date;
    finishedAt?: Date;
    error?: string;
    result?: any;
    attempts: number;
    maxAttempts: number;
}
export declare enum SubscriptionTier {
    FREE = "free",
    STARTER = "starter",
    PROFESSIONAL = "professional",
    TEAM = "team",
    ENTERPRISE = "enterprise"
}
export interface PriorityConfig {
    [SubscriptionTier.FREE]: number;
    [SubscriptionTier.STARTER]: number;
    [SubscriptionTier.PROFESSIONAL]: number;
    [SubscriptionTier.TEAM]: number;
    [SubscriptionTier.ENTERPRISE]: number;
}
export interface QueueMetrics {
    queueName: string;
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    waitingJobs: number;
    activeJobs: number;
    delayedJobs: number;
    pausedJobs: number;
    throughput: number;
    avgProcessingTime: number;
    errorRate: number;
    lastUpdated: Date;
}
export interface DeadLetterQueueConfig {
    enabled: boolean;
    maxAttempts: number;
    retentionDays: number;
    alertThreshold: number;
}
export interface WorkerScalingConfig {
    minWorkers: number;
    maxWorkers: number;
    scaleUpThreshold: number;
    scaleDownThreshold: number;
    scaleUpDelay: number;
    scaleDownDelay: number;
}
export interface BulkJobOperation {
    action: 'add' | 'remove' | 'retry' | 'cancel';
    jobs: Array<{
        name: string;
        data: any;
        options?: JobOptions;
    }>;
    batchSize?: number;
}
export interface ScheduledJobConfig {
    name: string;
    cron: string;
    data: any;
    timezone?: string;
    enabled: boolean;
    lastRun?: Date;
    nextRun?: Date;
}
export interface QueueHealthCheck {
    queueName: string;
    isHealthy: boolean;
    lastCheck: Date;
    issues: string[];
    metrics: {
        memoryUsage: number;
        connectionCount: number;
        avgLatency: number;
    };
}
export interface JobExecutionContext {
    jobId: string;
    queueName: string;
    workerName: string;
    startTime: Date;
    timeout?: number;
    subscriptionTier: SubscriptionTier;
    userId?: string;
    teamId?: string;
}
export interface RetryStrategy {
    attempts: number;
    backoff: {
        type: 'fixed' | 'exponential' | 'linear' | 'custom';
        delay: number;
        maxDelay?: number;
        factor?: number;
    };
    retryCondition?: (error: Error, attempt: number) => boolean;
}
//# sourceMappingURL=queue.d.ts.map