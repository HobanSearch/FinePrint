export interface NotificationRequest {
    userId: string;
    type: 'analysis_complete' | 'document_changed' | 'subscription_update' | 'action_required' | 'system_alert';
    title: string;
    message: string;
    data?: Record<string, any>;
    actionUrl?: string;
    expiresAt?: Date;
    channels: NotificationChannel[];
}
export interface NotificationChannel {
    type: 'email' | 'browser' | 'webhook' | 'slack' | 'teams';
    config: Record<string, any>;
}
export interface EmailNotification {
    to: string;
    subject: string;
    html: string;
    text?: string;
    templateId?: string;
    templateData?: Record<string, any>;
}
export interface WebhookNotification {
    url: string;
    method: 'POST' | 'PUT';
    headers: Record<string, string>;
    payload: Record<string, any>;
    retryCount: number;
    maxRetries: number;
}
export interface SlackNotification {
    webhookUrl: string;
    channel?: string;
    username?: string;
    iconEmoji?: string;
    text: string;
    attachments?: SlackAttachment[];
}
export interface SlackAttachment {
    color?: string;
    title?: string;
    title_link?: string;
    text?: string;
    fields?: SlackField[];
}
export interface SlackField {
    title: string;
    value: string;
    short?: boolean;
}
export interface TeamsNotification {
    webhookUrl: string;
    title: string;
    text: string;
    themeColor?: string;
    sections?: TeamsSection[];
    potentialAction?: TeamsAction[];
}
export interface TeamsSection {
    activityTitle?: string;
    activitySubtitle?: string;
    activityImage?: string;
    facts?: TeamsFact[];
    markdown?: boolean;
}
export interface TeamsFact {
    name: string;
    value: string;
}
export interface TeamsAction {
    '@type': string;
    name: string;
    targets: Array<{
        os: string;
        uri: string;
    }>;
}
export interface NotificationPreferences {
    userId: string;
    emailEnabled: boolean;
    browserEnabled: boolean;
    webhookEnabled: boolean;
    webhookUrl?: string;
    analysisComplete: boolean;
    documentChanges: boolean;
    highRiskFindings: boolean;
    weeklySummary: boolean;
    marketingEmails: boolean;
}
export interface NotificationResponse {
    id: string;
    type: string;
    title: string;
    message: string;
    data: Record<string, any> | null;
    readAt: Date | null;
    actionUrl: string | null;
    expiresAt: Date | null;
    createdAt: Date;
}
export interface BulkNotificationRequest {
    userIds: string[];
    type: string;
    title: string;
    message: string;
    data?: Record<string, any>;
    actionUrl?: string;
    channels: NotificationChannel[];
    batchSize?: number;
}
export interface NotificationStats {
    sent: number;
    delivered: number;
    failed: number;
    opened: number;
    clicked: number;
}
//# sourceMappingURL=notification.d.ts.map