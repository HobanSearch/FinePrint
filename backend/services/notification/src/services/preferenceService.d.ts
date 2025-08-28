import { NotificationPreferences } from '@fineprintai/shared-types';
export interface PreferenceUpdateRequest {
    emailEnabled?: boolean;
    pushEnabled?: boolean;
    inAppEnabled?: boolean;
    webhookEnabled?: boolean;
    webhookUrl?: string;
    webhookSecret?: string;
    analysisComplete?: boolean;
    documentChanges?: boolean;
    highRiskFindings?: boolean;
    weeklySummary?: boolean;
    marketingEmails?: boolean;
    securityAlerts?: boolean;
    billingUpdates?: boolean;
    systemMaintenance?: boolean;
    quietHoursEnabled?: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    timezone?: string;
    batchingEnabled?: boolean;
    batchingInterval?: number;
    maxBatchSize?: number;
}
export interface ConsentRequest {
    consentGiven: boolean;
    consentTypes: string[];
    ipAddress?: string;
    userAgent?: string;
    source?: string;
}
export interface UnsubscribeRequest {
    type: 'all' | 'marketing' | 'transactional' | 'specific';
    categories?: string[];
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
    source?: string;
}
declare class PreferenceService {
    private initialized;
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    getUserPreferences(userId: string): Promise<NotificationPreferences | null>;
    getDetailedUserPreferences(userId: string): Promise<any>;
    private createDefaultPreferences;
    private createDefaultPreferencesRecord;
    updateUserPreferences(userId: string, updates: PreferenceUpdateRequest): Promise<NotificationPreferences>;
    updateConsent(userId: string, consentRequest: ConsentRequest): Promise<{
        success: boolean;
        message: string;
    }>;
    processUnsubscribe(userId: string, unsubscribeRequest: UnsubscribeRequest): Promise<{
        success: boolean;
        message: string;
    }>;
    canReceiveNotification(userId: string, notificationType: string, channel: 'email' | 'push' | 'in_app' | 'webhook'): Promise<boolean>;
    shouldBatchNotifications(userId: string): Promise<{
        shouldBatch: boolean;
        batchInterval: number;
        maxBatchSize: number;
    }>;
    exportUserData(userId: string): Promise<any>;
    deleteUserData(userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    private logConsentAction;
    private getUserEmail;
    private checkUnsubscribeStatus;
    private isValidWebhookUrl;
    private isValidTimeFormat;
    private isValidTimezone;
    private isInQuietHours;
    getPreferenceStats(): Promise<{
        totalUsers: number;
        consentRate: number;
        channelPreferences: Record<string, number>;
        notificationTypePreferences: Record<string, number>;
    }>;
}
export declare const preferenceService: PreferenceService;
export {};
//# sourceMappingURL=preferenceService.d.ts.map