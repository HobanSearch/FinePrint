import { NotificationRequest, NotificationResponse, BulkNotificationRequest, NotificationChannel } from '@fineprintai/shared-types';
export interface NotificationJobData {
    notificationId: string;
    userId: string;
    channels: NotificationChannel[];
    priority: 'low' | 'normal' | 'high' | 'urgent';
    scheduledAt?: Date;
    retryAttempts?: number;
}
export interface BatchNotificationJobData {
    notifications: NotificationJobData[];
    batchId: string;
    userId: string;
}
declare class NotificationService {
    private notificationQueue;
    private batchQueue;
    private priorityQueue;
    private retryQueue;
    private notificationWorker;
    private batchWorker;
    private priorityWorker;
    private retryWorker;
    private initialized;
    constructor();
    private initializeWorkers;
    private addWorkerErrorHandlers;
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    createNotification(request: NotificationRequest): Promise<NotificationResponse>;
    createBulkNotifications(request: BulkNotificationRequest): Promise<{
        batchId: string;
        queued: number;
        skipped: number;
    }>;
    private processNotification;
    private processBatchNotifications;
    private processChannel;
    private scheduleRetry;
    private filterChannelsByPreferences;
    private getCategoryFromType;
    private getPriorityFromType;
    private getQueueByPriority;
    private getPriorityScore;
    getUserNotifications(userId: string, options?: {
        limit?: number;
        offset?: number;
        unreadOnly?: boolean;
        type?: string;
        category?: string;
    }): Promise<NotificationResponse[]>;
    markNotificationAsRead(notificationId: string): Promise<void>;
    getNotificationStats(userId?: string): Promise<any>;
}
export declare const notificationService: NotificationService;
export {};
//# sourceMappingURL=notificationService.d.ts.map