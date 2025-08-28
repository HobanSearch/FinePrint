import { SubscriptionTier } from '@prisma/client';
import { Subscription } from '../models/billing';
export interface CreateSubscriptionParams {
    userId: string;
    email: string;
    tier: SubscriptionTier;
    paymentMethodId?: string;
    trialDays?: number;
    couponCode?: string;
    metadata?: Record<string, string>;
}
export interface UpdateSubscriptionParams {
    subscriptionId: string;
    tier?: SubscriptionTier;
    paymentMethodId?: string;
    couponCode?: string;
    prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice';
}
export interface CancelSubscriptionParams {
    subscriptionId: string;
    cancelAtPeriodEnd?: boolean;
    cancellationReason?: string;
}
export declare class SubscriptionService {
    static createSubscription(params: CreateSubscriptionParams): Promise<{
        subscription: Subscription;
        clientSecret?: string;
    }>;
    static updateSubscription(params: UpdateSubscriptionParams): Promise<Subscription>;
    static cancelSubscription(params: CancelSubscriptionParams): Promise<Subscription>;
    static reactivateSubscription(subscriptionId: string): Promise<Subscription>;
    static getSubscription(userId: string): Promise<Subscription | null>;
    static getSubscriptionUsage(userId: string): Promise<{
        analyses: number;
        apiCalls: number;
        monitoredDocuments: number;
        limits: {
            analyses: number;
            apiCalls: number;
            monitoredDocuments: number;
        };
    }>;
    static canPerformAction(userId: string, action: 'analysis' | 'api_call' | 'monitor_document'): Promise<{
        allowed: boolean;
        reason?: string;
    }>;
}
export default SubscriptionService;
//# sourceMappingURL=subscription.service.d.ts.map