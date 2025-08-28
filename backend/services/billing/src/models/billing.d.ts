import { SubscriptionTier } from '@prisma/client';
import { Decimal } from 'decimal.js';
export interface Subscription {
    id: string;
    userId: string;
    stripeSubscriptionId: string;
    stripeCustomerId: string;
    stripePriceId: string;
    tier: SubscriptionTier;
    status: SubscriptionStatus;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    canceledAt?: Date;
    trialStart?: Date;
    trialEnd?: Date;
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}
export declare enum SubscriptionStatus {
    INCOMPLETE = "incomplete",
    INCOMPLETE_EXPIRED = "incomplete_expired",
    TRIALING = "trialing",
    ACTIVE = "active",
    PAST_DUE = "past_due",
    CANCELED = "canceled",
    UNPAID = "unpaid"
}
export interface Invoice {
    id: string;
    userId: string;
    subscriptionId?: string;
    stripeInvoiceId: string;
    status: InvoiceStatus;
    total: Decimal;
    subtotal: Decimal;
    tax: Decimal;
    currency: string;
    periodStart: Date;
    periodEnd: Date;
    dueDate: Date;
    paidAt?: Date;
    attemptCount: number;
    nextPaymentAttempt?: Date;
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}
export declare enum InvoiceStatus {
    DRAFT = "draft",
    OPEN = "open",
    PAID = "paid",
    UNCOLLECTIBLE = "uncollectible",
    VOID = "void"
}
export interface PaymentMethod {
    id: string;
    userId: string;
    stripePaymentMethodId: string;
    type: PaymentMethodType;
    brand?: string;
    last4?: string;
    expiryMonth?: number;
    expiryYear?: number;
    isDefault: boolean;
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}
export declare enum PaymentMethodType {
    CARD = "card",
    SEPA_DEBIT = "sepa_debit",
    ACH_DEBIT = "us_bank_account"
}
export interface UsageRecord {
    id: string;
    userId: string;
    subscriptionId?: string;
    metricType: UsageMetricType;
    quantity: number;
    unit: string;
    periodStart: Date;
    periodEnd: Date;
    metadata?: Record<string, any>;
    createdAt: Date;
}
export declare enum UsageMetricType {
    ANALYSES = "analyses",
    API_CALLS = "api_calls",
    MONITORED_DOCUMENTS = "monitored_documents",
    TEAM_MEMBERS = "team_members"
}
export interface BillingEvent {
    id: string;
    userId: string;
    subscriptionId?: string;
    invoiceId?: string;
    eventType: BillingEventType;
    status: EventStatus;
    data: Record<string, any>;
    processedAt?: Date;
    errorMessage?: string;
    retryCount: number;
    nextRetryAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}
export declare enum BillingEventType {
    SUBSCRIPTION_CREATED = "subscription.created",
    SUBSCRIPTION_UPDATED = "subscription.updated",
    SUBSCRIPTION_CANCELED = "subscription.canceled",
    INVOICE_CREATED = "invoice.created",
    INVOICE_PAID = "invoice.paid",
    INVOICE_PAYMENT_FAILED = "invoice.payment_failed",
    PAYMENT_METHOD_ATTACHED = "payment_method.attached",
    PAYMENT_METHOD_DETACHED = "payment_method.detached",
    USAGE_RECORDED = "usage.recorded"
}
export declare enum EventStatus {
    PENDING = "pending",
    PROCESSING = "processing",
    COMPLETED = "completed",
    FAILED = "failed",
    RETRYING = "retrying"
}
export interface TaxCalculation {
    id: string;
    userId: string;
    invoiceId?: string;
    country: string;
    region?: string;
    postalCode?: string;
    taxRate: Decimal;
    taxAmount: Decimal;
    taxType: string;
    provider: TaxProvider;
    metadata?: Record<string, any>;
    createdAt: Date;
}
export declare enum TaxProvider {
    STRIPE_TAX = "stripe_tax",
    TAXJAR = "taxjar",
    AVATAX = "avatax"
}
export interface Refund {
    id: string;
    userId: string;
    invoiceId: string;
    stripeRefundId: string;
    amount: Decimal;
    currency: string;
    reason: RefundReason;
    status: RefundStatus;
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}
export declare enum RefundReason {
    DUPLICATE = "duplicate",
    FRAUDULENT = "fraudulent",
    REQUESTED_BY_CUSTOMER = "requested_by_customer",
    EXPIRED_UNCAPTURED_CHARGE = "expired_uncaptured_charge"
}
export declare enum RefundStatus {
    PENDING = "pending",
    SUCCEEDED = "succeeded",
    FAILED = "failed",
    CANCELED = "canceled"
}
export interface Chargeback {
    id: string;
    userId: string;
    invoiceId: string;
    stripeChargeId: string;
    amount: Decimal;
    currency: string;
    reason: string;
    status: ChargebackStatus;
    evidence?: Record<string, any>;
    evidenceSubmittedAt?: Date;
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}
export declare enum ChargebackStatus {
    WARNING_NEEDS_RESPONSE = "warning_needs_response",
    WARNING_UNDER_REVIEW = "warning_under_review",
    WARNING_CLOSED = "warning_closed",
    NEEDS_RESPONSE = "needs_response",
    UNDER_REVIEW = "under_review",
    CHARGE_REFUNDED = "charge_refunded",
    WON = "won",
    LOST = "lost"
}
export declare class BillingModel {
    static createSubscription(data: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>): Promise<any>;
    static updateSubscription(id: string, data: Partial<Subscription>): Promise<any>;
    static getSubscriptionByUserId(userId: string): Promise<any>;
    static getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<any>;
    static createInvoice(data: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>): Promise<any>;
    static updateInvoice(id: string, data: Partial<Invoice>): Promise<any>;
    static getInvoicesByUserId(userId: string, limit?: number, offset?: number): Promise<any>;
    static recordUsage(data: Omit<UsageRecord, 'id' | 'createdAt'>): Promise<any>;
    static getUsageForPeriod(userId: string, metricType: UsageMetricType, periodStart: Date, periodEnd: Date): Promise<any>;
    static createBillingEvent(data: Omit<BillingEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<any>;
    static updateBillingEvent(id: string, data: Partial<BillingEvent>): Promise<any>;
    static getPendingBillingEvents(limit?: number): Promise<any>;
}
export default BillingModel;
//# sourceMappingURL=billing.d.ts.map