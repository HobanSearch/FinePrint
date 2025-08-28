export interface PushSendResult {
    success: boolean;
    providerId?: string;
    providerStatus?: string;
    messageId?: string;
    errorCode?: string;
    errorMessage?: string;
    retryable?: boolean;
}
export interface PushSendRequest {
    userId: string;
    title: string;
    body: string;
    data?: Record<string, any>;
    actionUrl?: string;
    imageUrl?: string;
    iconUrl?: string;
    deliveryId: string;
}
export interface PushSubscription {
    id: string;
    userId: string;
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
    userAgent?: string;
    isActive: boolean;
    createdAt: Date;
}
declare class PushService {
    private initialized;
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    sendPushNotification(request: PushSendRequest): Promise<PushSendResult>;
    private sendToSubscription;
    private getUserPushSubscriptions;
    private cleanupFailedSubscriptions;
    subscribeToPush(data: {
        userId: string;
        endpoint: string;
        keys: {
            p256dh: string;
            auth: string;
        };
        userAgent?: string;
    }): Promise<PushSubscription>;
    unsubscribeFromPush(subscriptionId: string): Promise<void>;
    getUserSubscriptions(userId: string): Promise<PushSubscription[]>;
    deleteSubscription(subscriptionId: string): Promise<void>;
    sendTestPush(userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    getPushStats(userId?: string): Promise<{
        totalSubscriptions: number;
        activeSubscriptions: number;
        recentNotifications: number;
    }>;
    private isRetryableError;
    private isPermanentPushError;
    sendBatchPushNotifications(requests: PushSendRequest[]): Promise<PushSendResult[]>;
    cleanupOldSubscriptions(daysOld?: number): Promise<number>;
}
export declare const pushService: PushService;
export {};
//# sourceMappingURL=pushService.d.ts.map