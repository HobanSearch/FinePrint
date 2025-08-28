import { UsageRecord, UsageMetricType } from '../models/billing';
export interface RecordUsageParams {
    userId: string;
    metricType: UsageMetricType;
    quantity: number;
    metadata?: Record<string, any>;
    timestamp?: Date;
}
export interface UsageOverage {
    metricType: UsageMetricType;
    allowedQuantity: number;
    usedQuantity: number;
    overageQuantity: number;
    overageCost: number;
    currency: string;
}
export interface BillingPeriodUsage {
    userId: string;
    periodStart: Date;
    periodEnd: Date;
    metrics: {
        [key in UsageMetricType]: {
            quantity: number;
            limit: number;
            overage: number;
            cost: number;
        };
    };
    totalOverageCost: number;
    currency: string;
}
export declare class UsageService {
    static recordUsage(params: RecordUsageParams): Promise<UsageRecord>;
    static getCurrentPeriodUsage(userId: string): Promise<BillingPeriodUsage>;
    static getUsageForPeriod(userId: string, periodStart: Date, periodEnd: Date): Promise<BillingPeriodUsage>;
    static calculateOverageCharges(userId: string, periodStart: Date, periodEnd: Date): Promise<UsageOverage[]>;
    static processOverageBilling(subscriptionId: string): Promise<void>;
    private static reportUsageToStripe;
    private static getMetricUnit;
    private static getMetricDisplayName;
    private static getMetricLimit;
    private static getOverageCost;
    static recordBulkUsage(userId: string, usages: Array<{
        metricType: UsageMetricType;
        quantity: number;
        metadata?: Record<string, any>;
    }>, timestamp?: Date): Promise<UsageRecord[]>;
    static getUsageAnalytics(startDate: Date, endDate: Date, metricType?: UsageMetricType): Promise<{
        totalUsage: number;
        averageUsage: number;
        uniqueUsers: number;
        usageByTier: Record<string, number>;
        dailyUsage: Array<{
            date: string;
            usage: number;
        }>;
    }>;
}
export default UsageService;
//# sourceMappingURL=usage.service.d.ts.map