import { DocumentChangeDetected, MonitoringAlert } from '@fineprintai/shared-types';
interface AlertRule {
    id: string;
    userId: string;
    teamId?: string;
    name: string;
    conditions: AlertCondition[];
    actions: AlertAction[];
    isActive: boolean;
    cooldownMinutes: number;
    lastTriggeredAt?: Date;
    triggerCount: number;
    createdAt: Date;
}
interface AlertCondition {
    type: 'change_type' | 'risk_change' | 'document_type' | 'keyword_match';
    operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'matches_regex';
    value: string | number;
}
interface AlertAction {
    type: 'email' | 'slack' | 'teams' | 'webhook' | 'push_notification';
    config: Record<string, any>;
}
interface NotificationChannel {
    id: string;
    userId: string;
    teamId?: string;
    type: 'email' | 'slack' | 'teams' | 'push';
    config: Record<string, any>;
    isActive: boolean;
    preferences: {
        severities: ('low' | 'medium' | 'high' | 'critical')[];
        quietHours?: {
            start: string;
            end: string;
            timezone: string;
        };
        frequency: 'immediate' | 'hourly' | 'daily';
    };
}
declare class AlertingService {
    private prisma;
    private emailTransporter;
    private initialized;
    private alertRules;
    private notificationChannels;
    private activeAlerts;
    constructor();
    initialize(): Promise<void>;
    createAlertRule(data: {
        userId: string;
        teamId?: string;
        name: string;
        conditions: AlertCondition[];
        actions: AlertAction[];
        cooldownMinutes?: number;
    }): Promise<AlertRule>;
    createNotificationChannel(data: {
        userId: string;
        teamId?: string;
        type: NotificationChannel['type'];
        config: Record<string, any>;
        preferences?: Partial<NotificationChannel['preferences']>;
    }): Promise<NotificationChannel>;
    processDocumentChange(changeEvent: DocumentChangeDetected): Promise<void>;
    processMonitoringError(alert: MonitoringAlert): Promise<void>;
    private evaluateAlertConditions;
    private evaluateCondition;
    private triggerAlert;
    private determineSeverity;
    private generateAlertTitle;
    private generateAlertDescription;
    private createAlertInstance;
    private executeAlertActions;
    private executeAlertAction;
    private executeWebhookAction;
    private executeSlackAction;
    private executeTeamsAction;
    private getSeverityColor;
    private sendNotifications;
    private sendNotification;
    private sendEmailNotification;
    private sendPushNotification;
    private generateEmailContent;
    private isInQuietHours;
    private getRelevantAlertRules;
    private getRelevantNotificationChannels;
    testNotificationChannel(channelId: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    private loadAlertRules;
    private loadNotificationChannels;
    private loadActiveAlerts;
    getAlertStats(): Promise<{
        totalRules: number;
        activeRules: number;
        totalChannels: number;
        activeAlerts: number;
        alertsByseverity: Record<string, number>;
    }>;
    healthCheck(): Promise<void>;
    shutdown(): Promise<void>;
}
export declare const alertingService: AlertingService;
export {};
//# sourceMappingURL=alertingService.d.ts.map