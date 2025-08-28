export interface DunningCampaign {
    id: string;
    userId: string;
    invoiceId: string;
    status: DunningStatus;
    attemptCount: number;
    maxAttempts: number;
    nextAttemptAt: Date;
    lastAttemptAt?: Date;
    completedAt?: Date;
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}
export declare enum DunningStatus {
    ACTIVE = "active",
    PAUSED = "paused",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELED = "canceled"
}
export interface DunningAttempt {
    id: string;
    campaignId: string;
    attemptNumber: number;
    type: DunningAttemptType;
    status: DunningAttemptStatus;
    scheduledAt: Date;
    executedAt?: Date;
    errorMessage?: string;
    metadata?: Record<string, any>;
    createdAt: Date;
}
export declare enum DunningAttemptType {
    EMAIL_REMINDER = "email_reminder",
    PAYMENT_RETRY = "payment_retry",
    PHONE_CALL = "phone_call",
    FINAL_NOTICE = "final_notice",
    ACCOUNT_SUSPENSION = "account_suspension"
}
export declare enum DunningAttemptStatus {
    SCHEDULED = "scheduled",
    PROCESSING = "processing",
    COMPLETED = "completed",
    FAILED = "failed",
    SKIPPED = "skipped"
}
export declare class DunningService {
    static startDunningProcess(userId: string, invoiceId: string, metadata?: Record<string, any>): Promise<DunningCampaign>;
    private static scheduleDunningAttempts;
    static processDueDunningAttempts(): Promise<void>;
    private static executeDunningAttempt;
    private static sendEmailReminder;
    private static retryPayment;
    private static sendFinalNotice;
    private static suspendAccount;
    private static completeDunningCampaign;
    static pauseDunningCampaign(campaignId: string): Promise<void>;
    static resumeDunningCampaign(campaignId: string): Promise<void>;
    static cancelDunningCampaign(campaignId: string, reason: string): Promise<void>;
    static getDunningAnalytics(startDate: Date, endDate: Date): Promise<{
        totalCampaigns: number;
        successfulRecoveries: number;
        suspendedAccounts: number;
        recoveryRate: number;
        averageRecoveryTime: number;
        campaignsByStatus: Record<string, number>;
    }>;
    static getUserDunningCampaigns(userId: string): Promise<DunningCampaign[]>;
}
export default DunningService;
//# sourceMappingURL=dunning.service.d.ts.map