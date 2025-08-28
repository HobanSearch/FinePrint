export interface EmailTemplateData {
    [key: string]: any;
}
export declare class NotificationService {
    static sendSubscriptionWelcome(userId: string, tier: string): Promise<void>;
    static sendPaymentSuccess(userId: string, paymentDetails: {
        amount: number;
        currency: string;
    }): Promise<void>;
    static sendPaymentFailed(userId: string): Promise<void>;
    static sendUpcomingInvoice(userId: string, invoiceDetails: {
        amount: number;
        currency: string;
        dueDate: Date;
    }): Promise<void>;
    static sendTrialEnding(userId: string, trialEndDate: Date): Promise<void>;
    static sendSubscriptionCanceled(userId: string): Promise<void>;
    static sendSubscriptionEnded(userId: string): Promise<void>;
    static sendPaymentMethodAdded(userId: string): Promise<void>;
    static sendDunningReminder(userId: string, reminderData: {
        attemptNumber: number;
        amount: number;
        currency: string;
        dueDate: Date;
        invoiceUrl: string;
    }): Promise<void>;
    static sendFinalNotice(userId: string, noticeData: {
        amount: number;
        currency: string;
        suspensionDate: Date;
        paymentUrl: string;
    }): Promise<void>;
    static sendAccountSuspended(userId: string): Promise<void>;
    static sendChargebackAlert(userId: string, dispute: any): Promise<void>;
    static sendUsageLimitWarning(userId: string, usageData: {
        metricType: string;
        usage: number;
        limit: number;
        warningThreshold: number;
    }): Promise<void>;
    static getNotificationPreferences(userId: string): Promise<any>;
    static updateNotificationPreferences(userId: string, preferences: Partial<{
        emailEnabled: boolean;
        browserEnabled: boolean;
        webhookEnabled: boolean;
        webhookUrl: string;
        analysisComplete: boolean;
        documentChanges: boolean;
        highRiskFindings: boolean;
        weeklySummary: boolean;
        marketingEmails: boolean;
    }>): Promise<any>;
    static markNotificationAsRead(notificationId: string): Promise<any>;
    static getUserNotifications(userId: string, limit?: number, offset?: number, unreadOnly?: boolean): Promise<any>;
}
export default NotificationService;
//# sourceMappingURL=notification.service.d.ts.map