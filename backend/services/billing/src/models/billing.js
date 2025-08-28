"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingModel = exports.ChargebackStatus = exports.RefundStatus = exports.RefundReason = exports.TaxProvider = exports.EventStatus = exports.BillingEventType = exports.UsageMetricType = exports.PaymentMethodType = exports.InvoiceStatus = exports.SubscriptionStatus = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
var SubscriptionStatus;
(function (SubscriptionStatus) {
    SubscriptionStatus["INCOMPLETE"] = "incomplete";
    SubscriptionStatus["INCOMPLETE_EXPIRED"] = "incomplete_expired";
    SubscriptionStatus["TRIALING"] = "trialing";
    SubscriptionStatus["ACTIVE"] = "active";
    SubscriptionStatus["PAST_DUE"] = "past_due";
    SubscriptionStatus["CANCELED"] = "canceled";
    SubscriptionStatus["UNPAID"] = "unpaid";
})(SubscriptionStatus || (exports.SubscriptionStatus = SubscriptionStatus = {}));
var InvoiceStatus;
(function (InvoiceStatus) {
    InvoiceStatus["DRAFT"] = "draft";
    InvoiceStatus["OPEN"] = "open";
    InvoiceStatus["PAID"] = "paid";
    InvoiceStatus["UNCOLLECTIBLE"] = "uncollectible";
    InvoiceStatus["VOID"] = "void";
})(InvoiceStatus || (exports.InvoiceStatus = InvoiceStatus = {}));
var PaymentMethodType;
(function (PaymentMethodType) {
    PaymentMethodType["CARD"] = "card";
    PaymentMethodType["SEPA_DEBIT"] = "sepa_debit";
    PaymentMethodType["ACH_DEBIT"] = "us_bank_account";
})(PaymentMethodType || (exports.PaymentMethodType = PaymentMethodType = {}));
var UsageMetricType;
(function (UsageMetricType) {
    UsageMetricType["ANALYSES"] = "analyses";
    UsageMetricType["API_CALLS"] = "api_calls";
    UsageMetricType["MONITORED_DOCUMENTS"] = "monitored_documents";
    UsageMetricType["TEAM_MEMBERS"] = "team_members";
})(UsageMetricType || (exports.UsageMetricType = UsageMetricType = {}));
var BillingEventType;
(function (BillingEventType) {
    BillingEventType["SUBSCRIPTION_CREATED"] = "subscription.created";
    BillingEventType["SUBSCRIPTION_UPDATED"] = "subscription.updated";
    BillingEventType["SUBSCRIPTION_CANCELED"] = "subscription.canceled";
    BillingEventType["INVOICE_CREATED"] = "invoice.created";
    BillingEventType["INVOICE_PAID"] = "invoice.paid";
    BillingEventType["INVOICE_PAYMENT_FAILED"] = "invoice.payment_failed";
    BillingEventType["PAYMENT_METHOD_ATTACHED"] = "payment_method.attached";
    BillingEventType["PAYMENT_METHOD_DETACHED"] = "payment_method.detached";
    BillingEventType["USAGE_RECORDED"] = "usage.recorded";
})(BillingEventType || (exports.BillingEventType = BillingEventType = {}));
var EventStatus;
(function (EventStatus) {
    EventStatus["PENDING"] = "pending";
    EventStatus["PROCESSING"] = "processing";
    EventStatus["COMPLETED"] = "completed";
    EventStatus["FAILED"] = "failed";
    EventStatus["RETRYING"] = "retrying";
})(EventStatus || (exports.EventStatus = EventStatus = {}));
var TaxProvider;
(function (TaxProvider) {
    TaxProvider["STRIPE_TAX"] = "stripe_tax";
    TaxProvider["TAXJAR"] = "taxjar";
    TaxProvider["AVATAX"] = "avatax";
})(TaxProvider || (exports.TaxProvider = TaxProvider = {}));
var RefundReason;
(function (RefundReason) {
    RefundReason["DUPLICATE"] = "duplicate";
    RefundReason["FRAUDULENT"] = "fraudulent";
    RefundReason["REQUESTED_BY_CUSTOMER"] = "requested_by_customer";
    RefundReason["EXPIRED_UNCAPTURED_CHARGE"] = "expired_uncaptured_charge";
})(RefundReason || (exports.RefundReason = RefundReason = {}));
var RefundStatus;
(function (RefundStatus) {
    RefundStatus["PENDING"] = "pending";
    RefundStatus["SUCCEEDED"] = "succeeded";
    RefundStatus["FAILED"] = "failed";
    RefundStatus["CANCELED"] = "canceled";
})(RefundStatus || (exports.RefundStatus = RefundStatus = {}));
var ChargebackStatus;
(function (ChargebackStatus) {
    ChargebackStatus["WARNING_NEEDS_RESPONSE"] = "warning_needs_response";
    ChargebackStatus["WARNING_UNDER_REVIEW"] = "warning_under_review";
    ChargebackStatus["WARNING_CLOSED"] = "warning_closed";
    ChargebackStatus["NEEDS_RESPONSE"] = "needs_response";
    ChargebackStatus["UNDER_REVIEW"] = "under_review";
    ChargebackStatus["CHARGE_REFUNDED"] = "charge_refunded";
    ChargebackStatus["WON"] = "won";
    ChargebackStatus["LOST"] = "lost";
})(ChargebackStatus || (exports.ChargebackStatus = ChargebackStatus = {}));
class BillingModel {
    static async createSubscription(data) {
        return prisma.subscription.create({
            data: {
                ...data,
                metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
            },
        });
    }
    static async updateSubscription(id, data) {
        return prisma.subscription.update({
            where: { id },
            data: {
                ...data,
                metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
            },
        });
    }
    static async getSubscriptionByUserId(userId) {
        return prisma.subscription.findFirst({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
    }
    static async getSubscriptionByStripeId(stripeSubscriptionId) {
        return prisma.subscription.findUnique({
            where: { stripeSubscriptionId },
        });
    }
    static async createInvoice(data) {
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
    static async updateInvoice(id, data) {
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
    static async getInvoicesByUserId(userId, limit = 50, offset = 0) {
        return prisma.invoice.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
        });
    }
    static async recordUsage(data) {
        return prisma.usageRecord.create({
            data: {
                ...data,
                metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
            },
        });
    }
    static async getUsageForPeriod(userId, metricType, periodStart, periodEnd) {
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
    static async createBillingEvent(data) {
        return prisma.billingEvent.create({
            data: {
                ...data,
                data: JSON.stringify(data.data),
            },
        });
    }
    static async updateBillingEvent(id, data) {
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
exports.BillingModel = BillingModel;
exports.default = BillingModel;
//# sourceMappingURL=billing.js.map