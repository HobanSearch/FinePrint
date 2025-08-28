"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefundsService = void 0;
const client_1 = require("@prisma/client");
const stripe_1 = require("../lib/stripe");
const logger_1 = require("../utils/logger");
const notification_service_1 = require("./notification.service");
const billing_1 = require("../models/billing");
const decimal_js_1 = require("decimal.js");
const prisma = new client_1.PrismaClient();
class RefundsService {
    static async createRefund(params) {
        try {
            const { invoiceId, amount, reason, description, metadata } = params;
            const invoice = await prisma.invoice.findUnique({
                where: { id: invoiceId },
                include: {
                    user: true,
                },
            });
            if (!invoice) {
                throw new Error('Invoice not found');
            }
            if (invoice.status !== 'paid') {
                throw new Error('Can only refund paid invoices');
            }
            const stripeInvoice = await stripe_1.stripe.invoices.retrieve(invoice.stripeInvoiceId);
            if (!stripeInvoice.charge) {
                throw new Error('No charge found for this invoice');
            }
            const invoiceTotal = Number(invoice.total);
            const refundAmount = amount || invoiceTotal;
            if (refundAmount > invoiceTotal) {
                throw new Error('Refund amount cannot exceed invoice total');
            }
            if (refundAmount <= 0) {
                throw new Error('Refund amount must be greater than zero');
            }
            const existingRefunds = await prisma.refund.findMany({
                where: { invoiceId },
            });
            const totalRefunded = existingRefunds.reduce((sum, refund) => sum + Number(refund.amount), 0);
            if (totalRefunded + refundAmount > invoiceTotal) {
                throw new Error('Total refunds cannot exceed invoice amount');
            }
            const stripeRefund = await stripe_1.stripe.refunds.create({
                charge: stripeInvoice.charge,
                amount: Math.round(refundAmount * 100),
                reason: this.mapRefundReasonToStripe(reason),
                metadata: {
                    invoiceId,
                    userId: invoice.userId,
                    ...metadata,
                },
            });
            const refund = await prisma.refund.create({
                data: {
                    userId: invoice.userId,
                    invoiceId,
                    stripeRefundId: stripeRefund.id,
                    amount: new decimal_js_1.Decimal(refundAmount).toString(),
                    currency: invoice.currency,
                    reason,
                    status: stripeRefund.status,
                    metadata: metadata ? JSON.stringify(metadata) : undefined,
                },
            });
            await notification_service_1.NotificationService.sendRefundProcessed(invoice.userId, {
                amount: refundAmount,
                currency: invoice.currency,
                reason,
                description,
            });
            if (totalRefunded + refundAmount >= invoiceTotal) {
                await prisma.invoice.update({
                    where: { id: invoiceId },
                    data: { status: 'void' },
                });
            }
            logger_1.logger.info('Refund created successfully', {
                refundId: refund.id,
                stripeRefundId: stripeRefund.id,
                invoiceId,
                amount: refundAmount,
                reason,
            });
            return refund;
        }
        catch (error) {
            logger_1.logger.error('Failed to create refund', { error, params });
            throw error;
        }
    }
    static async getRefund(refundId) {
        try {
            const refund = await prisma.refund.findUnique({
                where: { id: refundId },
                include: {
                    invoice: {
                        select: {
                            stripeInvoiceId: true,
                            total: true,
                            currency: true,
                        },
                    },
                    user: {
                        select: {
                            email: true,
                            displayName: true,
                        },
                    },
                },
            });
            return refund;
        }
        catch (error) {
            logger_1.logger.error('Failed to get refund', { error, refundId });
            throw error;
        }
    }
    static async getUserRefunds(userId, limit = 50, offset = 0) {
        try {
            const [refunds, total] = await Promise.all([
                prisma.refund.findMany({
                    where: { userId },
                    include: {
                        invoice: {
                            select: {
                                stripeInvoiceId: true,
                                total: true,
                                currency: true,
                                createdAt: true,
                            },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: limit,
                    skip: offset,
                }),
                prisma.refund.count({ where: { userId } }),
            ]);
            return {
                refunds: refunds,
                total,
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get user refunds', { error, userId });
            throw error;
        }
    }
    static async cancelRefund(refundId) {
        try {
            const refund = await prisma.refund.findUnique({
                where: { id: refundId },
            });
            if (!refund) {
                throw new Error('Refund not found');
            }
            if (refund.status !== 'pending') {
                throw new Error('Can only cancel pending refunds');
            }
            try {
                await stripe_1.stripe.refunds.cancel(refund.stripeRefundId);
            }
            catch (stripeError) {
                logger_1.logger.warn('Failed to cancel refund in Stripe', {
                    error: stripeError,
                    refundId,
                    stripeRefundId: refund.stripeRefundId,
                });
            }
            const updatedRefund = await prisma.refund.update({
                where: { id: refundId },
                data: { status: 'canceled' },
            });
            logger_1.logger.info('Refund canceled', {
                refundId,
                stripeRefundId: refund.stripeRefundId,
            });
            return updatedRefund;
        }
        catch (error) {
            logger_1.logger.error('Failed to cancel refund', { error, refundId });
            throw error;
        }
    }
    static async handleChargeback(dispute) {
        try {
            const charge = await stripe_1.stripe.charges.retrieve(dispute.charge);
            const customerId = charge.customer;
            if (!customerId) {
                throw new Error('No customer associated with charge');
            }
            const customer = await stripe_1.stripe.customers.retrieve(customerId);
            if (customer.deleted) {
                throw new Error('Customer not found');
            }
            const userId = customer.metadata?.userId;
            if (!userId) {
                throw new Error('User ID not found in customer metadata');
            }
            const invoice = await prisma.invoice.findFirst({
                where: { stripeInvoiceId: charge.invoice },
            });
            if (!invoice) {
                throw new Error('Invoice not found for charge');
            }
            const existingChargeback = await prisma.chargeback.findFirst({
                where: { stripeChargeId: charge.id },
            });
            if (existingChargeback) {
                logger_1.logger.info('Chargeback already exists', {
                    chargebackId: existingChargeback.id,
                    disputeId: dispute.id,
                });
                return existingChargeback;
            }
            const chargeback = await prisma.chargeback.create({
                data: {
                    userId,
                    invoiceId: invoice.id,
                    stripeChargeId: charge.id,
                    amount: new decimal_js_1.Decimal(dispute.amount / 100).toString(),
                    currency: dispute.currency,
                    reason: dispute.reason,
                    status: dispute.status,
                    evidence: dispute.evidence,
                    metadata: JSON.stringify({
                        disputeId: dispute.id,
                        created: dispute.created,
                        evidenceDueBy: dispute.evidence_details?.due_by,
                    }),
                },
            });
            await notification_service_1.NotificationService.sendChargebackAlert(userId, dispute);
            logger_1.logger.info('Chargeback created', {
                chargebackId: chargeback.id,
                disputeId: dispute.id,
                amount: dispute.amount / 100,
                reason: dispute.reason,
            });
            return chargeback;
        }
        catch (error) {
            logger_1.logger.error('Failed to handle chargeback', { error, disputeId: dispute.id });
            throw error;
        }
    }
    static async updateChargeback(chargebackId, updates) {
        try {
            const updatedChargeback = await prisma.chargeback.update({
                where: { id: chargebackId },
                data: {
                    ...updates,
                    evidence: updates.evidence ? JSON.stringify(updates.evidence) : undefined,
                },
            });
            logger_1.logger.info('Chargeback updated', {
                chargebackId,
                updates,
            });
            return updatedChargeback;
        }
        catch (error) {
            logger_1.logger.error('Failed to update chargeback', { error, chargebackId, updates });
            throw error;
        }
    }
    static async submitChargebackEvidence(chargebackId, evidence) {
        try {
            const chargeback = await prisma.chargeback.findUnique({
                where: { id: chargebackId },
            });
            if (!chargeback) {
                throw new Error('Chargeback not found');
            }
            const metadata = JSON.parse(chargeback.metadata || '{}');
            const disputeId = metadata.disputeId;
            if (!disputeId) {
                throw new Error('Dispute ID not found in chargeback metadata');
            }
            await stripe_1.stripe.disputes.update(disputeId, {
                evidence: {
                    customer_communication: evidence.customerCommunication,
                    receipt: evidence.receipt,
                    service_documentation: evidence.serviceDocumentation,
                    shipping_documentation: evidence.shippingDocumentation,
                    uncategorized_text: evidence.other,
                },
            });
            await this.updateChargeback(chargebackId, {
                evidence,
                evidenceSubmittedAt: new Date(),
            });
            logger_1.logger.info('Chargeback evidence submitted', {
                chargebackId,
                disputeId,
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to submit chargeback evidence', { error, chargebackId });
            throw error;
        }
    }
    static async getRefundAnalytics(startDate, endDate) {
        try {
            const refunds = await prisma.refund.findMany({
                where: {
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                include: {
                    invoice: {
                        select: {
                            total: true,
                        },
                    },
                },
            });
            const totalRefunds = refunds.length;
            const totalRefundAmount = refunds.reduce((sum, refund) => sum + Number(refund.amount), 0);
            const totalInvoices = await prisma.invoice.count({
                where: {
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                    status: 'paid',
                },
            });
            const refundRate = totalInvoices > 0 ? (totalRefunds / totalInvoices) * 100 : 0;
            const refundsByReason = refunds.reduce((acc, refund) => {
                acc[refund.reason] = (acc[refund.reason] || 0) + 1;
                return acc;
            }, {});
            const refundsByMonth = this.groupRefundsByMonth(refunds);
            const averageRefundAmount = totalRefunds > 0 ? totalRefundAmount / totalRefunds : 0;
            return {
                totalRefunds,
                totalRefundAmount,
                refundRate,
                refundsByReason,
                refundsByMonth,
                averageRefundAmount,
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get refund analytics', { error, startDate, endDate });
            throw error;
        }
    }
    static async getChargebackAnalytics(startDate, endDate) {
        try {
            const chargebacks = await prisma.chargeback.findMany({
                where: {
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
            });
            const totalChargebacks = chargebacks.length;
            const totalChargebackAmount = chargebacks.reduce((sum, chargeback) => sum + Number(chargeback.amount), 0);
            const totalTransactions = await prisma.invoice.count({
                where: {
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                    status: 'paid',
                },
            });
            const chargebackRate = totalTransactions > 0
                ? (totalChargebacks / totalTransactions) * 100
                : 0;
            const wonChargebacks = chargebacks.filter(c => c.status === 'won').length;
            const winRate = totalChargebacks > 0 ? (wonChargebacks / totalChargebacks) * 100 : 0;
            const chargebacksByMonth = this.groupChargebacksByMonth(chargebacks);
            const chargebacksByReason = chargebacks.reduce((acc, chargeback) => {
                acc[chargeback.reason] = (acc[chargeback.reason] || 0) + 1;
                return acc;
            }, {});
            return {
                totalChargebacks,
                totalChargebackAmount,
                chargebackRate,
                winRate,
                chargebacksByMonth,
                chargebacksByReason,
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get chargeback analytics', { error, startDate, endDate });
            throw error;
        }
    }
    static async processRefundWebhook(refund) {
        try {
            const existingRefund = await prisma.refund.findFirst({
                where: { stripeRefundId: refund.id },
            });
            if (!existingRefund) {
                logger_1.logger.warn('Refund not found for webhook', { refundId: refund.id });
                return;
            }
            await prisma.refund.update({
                where: { id: existingRefund.id },
                data: {
                    status: refund.status,
                    metadata: JSON.stringify({
                        ...JSON.parse(existingRefund.metadata || '{}'),
                        stripeMetadata: refund.metadata,
                        failureReason: refund.failure_reason,
                    }),
                },
            });
            if (refund.status === 'succeeded') {
                await notification_service_1.NotificationService.sendRefundCompleted(existingRefund.userId, {
                    amount: Number(existingRefund.amount),
                    currency: existingRefund.currency,
                });
            }
            logger_1.logger.info('Refund webhook processed', {
                refundId: existingRefund.id,
                stripeRefundId: refund.id,
                status: refund.status,
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to process refund webhook', { error, refundId: refund.id });
        }
    }
    static mapRefundReasonToStripe(reason) {
        switch (reason) {
            case billing_1.RefundReason.DUPLICATE:
                return 'duplicate';
            case billing_1.RefundReason.FRAUDULENT:
                return 'fraudulent';
            case billing_1.RefundReason.REQUESTED_BY_CUSTOMER:
                return 'requested_by_customer';
            default:
                return 'requested_by_customer';
        }
    }
    static groupRefundsByMonth(refunds) {
        const monthlyData = refunds.reduce((acc, refund) => {
            const month = refund.createdAt.toISOString().slice(0, 7);
            if (!acc[month]) {
                acc[month] = { count: 0, amount: 0 };
            }
            acc[month].count++;
            acc[month].amount += Number(refund.amount);
            return acc;
        }, {});
        return Object.entries(monthlyData)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, data]) => ({
            month,
            count: data.count,
            amount: data.amount,
        }));
    }
    static groupChargebacksByMonth(chargebacks) {
        const monthlyData = chargebacks.reduce((acc, chargeback) => {
            const month = chargeback.createdAt.toISOString().slice(0, 7);
            if (!acc[month]) {
                acc[month] = { count: 0, amount: 0 };
            }
            acc[month].count++;
            acc[month].amount += Number(chargeback.amount);
            return acc;
        }, {});
        return Object.entries(monthlyData)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, data]) => ({
            month,
            count: data.count,
            amount: data.amount,
        }));
    }
}
exports.RefundsService = RefundsService;
exports.default = RefundsService;
//# sourceMappingURL=refunds.service.js.map