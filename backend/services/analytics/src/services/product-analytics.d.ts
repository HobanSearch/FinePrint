import { ProductAnalyticsEvent, UserProperties, EventProperties, TrackingContext, FunnelStep, CohortDefinition } from '@/types/analytics';
declare class ProductAnalyticsService {
    private mixpanel?;
    private amplitude?;
    private segment?;
    private prisma;
    private isInitialized;
    constructor();
    private initialize;
    trackEvent(userId: string, eventName: string, properties?: EventProperties, context?: TrackingContext): Promise<void>;
    identifyUser(userId: string, properties: UserProperties, context?: TrackingContext): Promise<void>;
    trackPageView(userId: string, page: {
        url: string;
        title?: string;
        referrer?: string;
    }, properties?: EventProperties, context?: TrackingContext): Promise<void>;
    trackFunnelStep(userId: string, funnelName: string, stepName: string, stepOrder: number, properties?: EventProperties, context?: TrackingContext): Promise<void>;
    trackConversion(userId: string, conversionType: string, value?: number, properties?: EventProperties, context?: TrackingContext): Promise<void>;
    trackEngagement(userId: string, feature: string, action: string, duration?: number, properties?: EventProperties, context?: TrackingContext): Promise<void>;
    batchTrackEvents(events: ProductAnalyticsEvent[]): Promise<void>;
    getUserFunnelProgress(userId: string, funnelName: string): Promise<FunnelStep[]>;
    createCohort(definition: CohortDefinition): Promise<string[]>;
    private trackMixpanelEvent;
    private trackAmplitudeEvent;
    private trackSegmentEvent;
    private enrichEvent;
    private storeEventLocally;
    private storeFunnelStep;
    private sanitizeUserProperties;
    private anonymizeIp;
    private hashUserId;
    flush(): Promise<void>;
    shutdown(): Promise<void>;
}
export declare const productAnalyticsService: ProductAnalyticsService;
export {};
//# sourceMappingURL=product-analytics.d.ts.map