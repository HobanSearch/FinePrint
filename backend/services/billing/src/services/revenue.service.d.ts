import { Decimal } from 'decimal.js';
export interface RevenueRecognitionRule {
    productType: 'subscription' | 'usage' | 'one_time';
    recognitionMethod: 'immediate' | 'monthly' | 'usage_based';
    deferralPeriod?: number;
}
export interface RevenueEntry {
    id: string;
    invoiceId: string;
    userId: string;
    amount: Decimal;
    recognizedAmount: Decimal;
    deferredAmount: Decimal;
    recognitionDate: Date;
    productType: string;
    description: string;
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}
export interface RevenueReport {
    period: {
        startDate: Date;
        endDate: Date;
    };
    totalRevenue: number;
    recognizedRevenue: number;
    deferredRevenue: number;
    breakdown: {
        subscriptions: number;
        usage: number;
        oneTime: number;
    };
    monthlyRecognition: Array<{
        month: string;
        amount: number;
    }>;
    revenueByTier: Record<string, number>;
    cohortAnalysis: Array<{
        cohort: string;
        revenue: number;
        customers: number;
        averageRevenue: number;
    }>;
}
export interface ARRMetrics {
    arr: number;
    mrr: number;
    growth: {
        mrr: number;
        arr: number;
        mom: number;
        yoy: number;
    };
    churn: {
        grossRevenueChurnRate: number;
        netRevenueChurnRate: number;
        customerChurnRate: number;
    };
    ltv: number;
    arpu: number;
}
export declare class RevenueService {
    private static recognitionRules;
    static processRevenueRecognition(invoiceId: string): Promise<void>;
    private static createImmediateRevenueEntry;
    private static createDeferredRevenueEntries;
    private static createUsageBasedRevenueEntry;
    static generateRevenueReport(startDate: Date, endDate: Date, options?: {
        includeCohorts?: boolean;
        includeProjections?: boolean;
    }): Promise<RevenueReport>;
    static calculateARRMetrics(asOfDate?: Date): Promise<ARRMetrics>;
    private static getMRRForMonth;
    private static calculateChurnMetrics;
    private static calculateLTV;
    private static calculateMonthlyRecognition;
    private static generateCohortAnalysis;
    private static determineProductType;
    static processMonthlyRecognition(): Promise<void>;
    static getRevenueForecast(months?: number): Promise<Array<{
        month: string;
        forecastedRevenue: number;
        confidence: number;
    }>>;
}
export default RevenueService;
//# sourceMappingURL=revenue.service.d.ts.map