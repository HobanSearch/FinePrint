import { FunnelDefinition, FunnelAnalysis, CohortDefinition, CohortAnalysis, EventCondition } from '@/types/analytics';
interface UserJourney {
    userId: string;
    sessionId: string;
    touchpoints: TouchPoint[];
    totalDuration: number;
    conversionPath: string[];
    dropOffPoint?: string;
}
interface TouchPoint {
    timestamp: Date;
    type: 'page_view' | 'event' | 'conversion';
    name: string;
    properties: Record<string, any>;
    durationOnPage?: number;
}
interface UserSegment {
    id: string;
    name: string;
    description: string;
    criteria: EventCondition[];
    userCount: number;
    avgLifetimeValue: number;
    conversionRate: number;
    churnRate: number;
}
declare class UserBehaviorAnalyticsService {
    private prisma;
    private predefinedFunnels;
    private activeSegments;
    constructor();
    private initializeFunnels;
    analyzeFunnel(funnelName: string, timeRange: {
        start: Date;
        end: Date;
    }, segmentCriteria?: EventCondition[]): Promise<FunnelAnalysis>;
    analyzeCohort(cohortDefinition: CohortDefinition, timeRange: {
        start: Date;
        end: Date;
    }): Promise<CohortAnalysis>;
    analyzeUserJourneys(timeRange: {
        start: Date;
        end: Date;
    }, segmentCriteria?: EventCondition[]): Promise<UserJourney[]>;
    getFeatureAdoptionRates(features: string[], timeRange: {
        start: Date;
        end: Date;
    }): Promise<Record<string, number>>;
    createUserSegment(name: string, description: string, criteria: EventCondition[]): Promise<string>;
    getUserBehaviorPatterns(userId: string, timeRange: {
        start: Date;
        end: Date;
    }): Promise<any>;
    private getFunnelUsers;
    private getStepUsers;
    private calculateAvgTimeBetweenSteps;
    private calculateAverageTimeToConvert;
    private getCohortUsers;
    private calculatePeriodStart;
    private calculatePeriodEnd;
    private getActiveUsersInPeriod;
    private getUserSessions;
    private getSessionTouchpoints;
    private identifyDropOffPoint;
    private getUsersMatchingCriteria;
    private calculateAvgLifetimeValue;
    private calculateSegmentConversionRate;
    private calculateSegmentChurnRate;
    private storeUserSegment;
    private getUserSessionCount;
    private getAvgSessionDuration;
    private getMostUsedFeatures;
    private getActivityTimeline;
    private calculateEngagementScore;
    getPredefinedFunnels(): FunnelDefinition[];
    getActiveSegments(): UserSegment[];
    shutdown(): Promise<void>;
}
export declare const userBehaviorAnalyticsService: UserBehaviorAnalyticsService;
export {};
//# sourceMappingURL=user-behavior.d.ts.map