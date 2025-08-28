export interface DeliveryEvent {
    deliveryId: string;
    notificationId: string;
    userId?: string;
    event: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed' | 'unsubscribed';
    timestamp: Date;
    metadata?: Record<string, any>;
}
export interface DeliveryStats {
    totalSent: number;
    totalDelivered: number;
    totalOpened: number;
    totalClicked: number;
    totalFailed: number;
    totalBounced: number;
    deliveryRate: number;
    openRate: number;
    clickRate: number;
    bounceRate: number;
}
export interface AnalyticsJobData {
    type: 'delivery_event' | 'daily_aggregation' | 'user_engagement';
    data: any;
    timestamp: Date;
}
declare class DeliveryTracker {
    private analyticsQueue;
    private analyticsWorker;
    private initialized;
    constructor();
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    trackDelivery(notificationId: string, status: string, metadata?: any): Promise<void>;
    trackEngagement(deliveryId: string, event: 'opened' | 'clicked', metadata?: any): Promise<void>;
    trackEmailEvent(deliveryId: string, event: string, providerId?: string, metadata?: any): Promise<void>;
    getDeliveryStats(options?: {
        userId?: string;
        notificationId?: string;
        channel?: string;
        dateFrom?: Date;
        dateTo?: Date;
    }): Promise<DeliveryStats>;
    getDeliveryTimeline(notificationId: string): Promise<Array<{
        timestamp: Date;
        event: string;
        channel: string;
        status: string;
        metadata?: any;
    }>>;
    getUserEngagementMetrics(userId: string, days?: number): Promise<{
        totalNotifications: number;
        emailMetrics: DeliveryStats;
        pushMetrics: DeliveryStats;
        overallEngagement: number;
        recentActivity: Array<{
            date: string;
            sent: number;
            opened: number;
            clicked: number;
        }>;
    }>;
    getMetricsByDate(dateFrom: Date, dateTo: Date, groupBy?: 'day' | 'week' | 'month'): Promise<Array<{
        date: string;
        sent: number;
        delivered: number;
        opened: number;
        clicked: number;
        failed: number;
        deliveryRate: number;
        openRate: number;
        clickRate: number;
    }>>;
    private addWorkerErrorHandlers;
    private processAnalyticsJob;
    private processDeliveryEvent;
    private processEngagementEvent;
    private processDailyAggregation;
    private handleUnsubscribeEvent;
    private scheduleDailyAggregation;
    private getDailyActivity;
    getRealtimeDeliveryStatus(notificationId: string): Promise<{
        status: string;
        progress: {
            total: number;
            sent: number;
            delivered: number;
            failed: number;
        };
        channels: Array<{
            channel: string;
            status: string;
            attempts: number;
            lastAttempt?: Date;
            nextRetry?: Date;
        }>;
    }>;
}
export declare const deliveryTracker: DeliveryTracker;
export {};
//# sourceMappingURL=deliveryTracker.d.ts.map