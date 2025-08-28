import { PrismaClient, SubscriptionTier } from '@prisma/client';
import { Decimal } from 'decimal.js';

const prisma = new PrismaClient();

// Subscription model extensions
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

export enum SubscriptionStatus {
  INCOMPLETE = 'incomplete',
  INCOMPLETE_EXPIRED = 'incomplete_expired',
  TRIALING = 'trialing',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  UNPAID = 'unpaid',
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

export enum InvoiceStatus {
  DRAFT = 'draft',
  OPEN = 'open',
  PAID = 'paid',
  UNCOLLECTIBLE = 'uncollectible',
  VOID = 'void',
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

export enum PaymentMethodType {
  CARD = 'card',
  SEPA_DEBIT = 'sepa_debit',
  ACH_DEBIT = 'us_bank_account',
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

export enum UsageMetricType {
  ANALYSES = 'analyses',
  API_CALLS = 'api_calls',
  MONITORED_DOCUMENTS = 'monitored_documents',
  TEAM_MEMBERS = 'team_members',
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

export enum BillingEventType {
  SUBSCRIPTION_CREATED = 'subscription.created',
  SUBSCRIPTION_UPDATED = 'subscription.updated',
  SUBSCRIPTION_CANCELED = 'subscription.canceled',
  INVOICE_CREATED = 'invoice.created',
  INVOICE_PAID = 'invoice.paid',
  INVOICE_PAYMENT_FAILED = 'invoice.payment_failed',
  PAYMENT_METHOD_ATTACHED = 'payment_method.attached',
  PAYMENT_METHOD_DETACHED = 'payment_method.detached',
  USAGE_RECORDED = 'usage.recorded',
}

export enum EventStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRYING = 'retrying',
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

export enum TaxProvider {
  STRIPE_TAX = 'stripe_tax',
  TAXJAR = 'taxjar',
  AVATAX = 'avatax',
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

export enum RefundReason {
  DUPLICATE = 'duplicate',
  FRAUDULENT = 'fraudulent',
  REQUESTED_BY_CUSTOMER = 'requested_by_customer',
  EXPIRED_UNCAPTURED_CHARGE = 'expired_uncaptured_charge',
}

export enum RefundStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed', 
  CANCELED = 'canceled',
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

export enum ChargebackStatus {
  WARNING_NEEDS_RESPONSE = 'warning_needs_response',
  WARNING_UNDER_REVIEW = 'warning_under_review',
  WARNING_CLOSED = 'warning_closed',
  NEEDS_RESPONSE = 'needs_response',
  UNDER_REVIEW = 'under_review',
  CHARGE_REFUNDED = 'charge_refunded',
  WON = 'won',
  LOST = 'lost',
}

// Database operations
export class BillingModel {
  // Subscription operations
  static async createSubscription(data: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>) {
    return prisma.subscription.create({
      data: {
        ...data,
        metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
      },
    });
  }

  static async updateSubscription(id: string, data: Partial<Subscription>) {
    return prisma.subscription.update({
      where: { id },
      data: {
        ...data,
        metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
      },
    });
  }

  static async getSubscriptionByUserId(userId: string) {
    return prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getSubscriptionByStripeId(stripeSubscriptionId: string) {
    return prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
    });
  }

  // Invoice operations
  static async createInvoice(data: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>) {
    return prisma.invoice.create({
      data: {
        ...data,
        total: data.total.toString(),
        subtotal: data.subtotal.toString(),
        tax: data.tax.toString(),
        metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
      },
    });
  }

  static async updateInvoice(id: string, data: Partial<Invoice>) {
    return prisma.invoice.update({
      where: { id },
      data: {
        ...data,
        total: data.total?.toString(),
        subtotal: data.subtotal?.toString(),
        tax: data.tax?.toString(),
        metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
      },
    });
  }

  static async getInvoicesByUserId(userId: string, limit = 50, offset = 0) {
    return prisma.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  // Usage operations
  static async recordUsage(data: Omit<UsageRecord, 'id' | 'createdAt'>) {
    return prisma.usageRecord.create({
      data: {
        ...data,
        metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
      },
    });
  }

  static async getUsageForPeriod(
    userId: string,
    metricType: UsageMetricType,
    periodStart: Date,
    periodEnd: Date
  ) {
    return prisma.usageRecord.aggregate({
      where: {
        userId,
        metricType,
        createdAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      _sum: {
        quantity: true,
      },
    });
  }

  // Billing event operations
  static async createBillingEvent(data: Omit<BillingEvent, 'id' | 'createdAt' | 'updatedAt'>) {
    return prisma.billingEvent.create({
      data: {
        ...data,
        data: JSON.stringify(data.data),
      },
    });
  }

  static async updateBillingEvent(id: string, data: Partial<BillingEvent>) {
    return prisma.billingEvent.update({
      where: { id },
      data: {
        ...data,
        data: data.data ? JSON.stringify(data.data) : undefined,
      },
    });
  }

  static async getPendingBillingEvents(limit = 100) {
    return prisma.billingEvent.findMany({
      where: {
        status: { in: [EventStatus.PENDING, EventStatus.RETRYING] },
        OR: [
          { nextRetryAt: null },
          { nextRetryAt: { lte: new Date() } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }
}

export default BillingModel;