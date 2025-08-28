import { PrismaClient } from '@prisma/client';
import { stripe } from '../lib/stripe';
import { logger } from '../utils/logger';
import { NotificationService } from './notification.service';
import { Refund, RefundReason, RefundStatus, Chargeback, ChargebackStatus } from '../models/billing';
import { Decimal } from 'decimal.js';
import Stripe from 'stripe';

const prisma = new PrismaClient();

export interface CreateRefundParams {
  invoiceId: string;
  amount?: number; // Partial refund amount (optional)
  reason: RefundReason;
  description?: string;
  metadata?: Record<string, string>;
}

export interface RefundAnalytics {
  totalRefunds: number;
  totalRefundAmount: number;
  refundRate: number;
  refundsByReason: Record<RefundReason, number>;
  refundsByMonth: Array<{
    month: string;
    count: number;
    amount: number;
  }>;
  averageRefundAmount: number;
}

export interface ChargebackAnalytics {
  totalChargebacks: number;
  totalChargebackAmount: number;
  chargebackRate: number;
  winRate: number;
  chargebacksByMonth: Array<{
    month: string;
    count: number;
    amount: number;
  }>;
  chargebacksByReason: Record<string, number>;
}

export class RefundsService {
  /**
   * Create a refund for an invoice
   */
  static async createRefund(params: CreateRefundParams): Promise<Refund> {
    try {
      const { invoiceId, amount, reason, description, metadata } = params;

      // Get invoice details
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

      // Get Stripe invoice details
      const stripeInvoice = await stripe.invoices.retrieve(invoice.stripeInvoiceId);
      
      if (!stripeInvoice.charge) {
        throw new Error('No charge found for this invoice');
      }

      // Calculate refund amount
      const invoiceTotal = Number(invoice.total);
      const refundAmount = amount || invoiceTotal;

      if (refundAmount > invoiceTotal) {
        throw new Error('Refund amount cannot exceed invoice total');
      }

      if (refundAmount <= 0) {
        throw new Error('Refund amount must be greater than zero');
      }

      // Check if there are existing refunds
      const existingRefunds = await prisma.refund.findMany({
        where: { invoiceId },
      });

      const totalRefunded = existingRefunds.reduce(
        (sum, refund) => sum + Number(refund.amount),
        0
      );

      if (totalRefunded + refundAmount > invoiceTotal) {
        throw new Error('Total refunds cannot exceed invoice amount');
      }

      // Create refund in Stripe
      const stripeRefund = await stripe.refunds.create({
        charge: stripeInvoice.charge as string,
        amount: Math.round(refundAmount * 100), // Convert to cents
        reason: this.mapRefundReasonToStripe(reason),
        metadata: {
          invoiceId,
          userId: invoice.userId,
          ...metadata,
        },
      });

      // Create refund record in database
      const refund = await prisma.refund.create({
        data: {
          userId: invoice.userId,
          invoiceId,
          stripeRefundId: stripeRefund.id,
          amount: new Decimal(refundAmount).toString(),
          currency: invoice.currency,
          reason,
          status: stripeRefund.status as RefundStatus,
          metadata: metadata ? JSON.stringify(metadata) : undefined,
        },
      });

      // Send notification to customer
      await NotificationService.sendRefundProcessed(invoice.userId, {
        amount: refundAmount,
        currency: invoice.currency,
        reason,
        description,
      });

      // Update invoice status if fully refunded
      if (totalRefunded + refundAmount >= invoiceTotal) {
        await prisma.invoice.update({
          where: { id: invoiceId },
          data: { status: 'void' },
        });
      }

      logger.info('Refund created successfully', {
        refundId: refund.id,
        stripeRefundId: stripeRefund.id,
        invoiceId,
        amount: refundAmount,
        reason,
      });

      return refund as Refund;

    } catch (error) {
      logger.error('Failed to create refund', { error, params });
      throw error;
    }
  }

  /**
   * Get refund details
   */
  static async getRefund(refundId: string): Promise<Refund | null> {
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

      return refund as Refund | null;

    } catch (error) {
      logger.error('Failed to get refund', { error, refundId });
      throw error;
    }
  }

  /**
   * Get refunds for a user
   */
  static async getUserRefunds(
    userId: string,
    limit = 50,
    offset = 0
  ): Promise<{ refunds: Refund[]; total: number }> {
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
        refunds: refunds as Refund[],
        total,
      };

    } catch (error) {
      logger.error('Failed to get user refunds', { error, userId });
      throw error;
    }
  }

  /**
   * Cancel a pending refund
   */
  static async cancelRefund(refundId: string): Promise<Refund> {
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

      // Cancel refund in Stripe (if possible)
      try {
        await stripe.refunds.cancel(refund.stripeRefundId);
      } catch (stripeError) {
        logger.warn('Failed to cancel refund in Stripe', {
          error: stripeError,
          refundId,
          stripeRefundId: refund.stripeRefundId,
        });
      }

      // Update refund status
      const updatedRefund = await prisma.refund.update({
        where: { id: refundId },
        data: { status: 'canceled' },
      });

      logger.info('Refund canceled', {
        refundId,
        stripeRefundId: refund.stripeRefundId,
      });

      return updatedRefund as Refund;

    } catch (error) {
      logger.error('Failed to cancel refund', { error, refundId });
      throw error;
    }
  }

  /**
   * Handle chargeback/dispute creation
   */
  static async handleChargeback(dispute: Stripe.Dispute): Promise<Chargeback> {
    try {
      const charge = await stripe.charges.retrieve(dispute.charge as string);
      const customerId = charge.customer as string;

      if (!customerId) {
        throw new Error('No customer associated with charge');
      }

      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) {
        throw new Error('Customer not found');
      }

      const userId = (customer as Stripe.Customer).metadata?.userId;
      if (!userId) {
        throw new Error('User ID not found in customer metadata');
      }

      // Find associated invoice
      const invoice = await prisma.invoice.findFirst({
        where: { stripeInvoiceId: charge.invoice as string },
      });

      if (!invoice) {
        throw new Error('Invoice not found for charge');
      }

      // Check if chargeback already exists
      const existingChargeback = await prisma.chargeback.findFirst({
        where: { stripeChargeId: charge.id },
      });

      if (existingChargeback) {
        logger.info('Chargeback already exists', {
          chargebackId: existingChargeback.id,
          disputeId: dispute.id,
        });
        return existingChargeback as Chargeback;
      }

      // Create chargeback record
      const chargeback = await prisma.chargeback.create({
        data: {
          userId,
          invoiceId: invoice.id,
          stripeChargeId: charge.id,
          amount: new Decimal(dispute.amount / 100).toString(),
          currency: dispute.currency,
          reason: dispute.reason,
          status: dispute.status as ChargebackStatus,
          evidence: dispute.evidence as any,
          metadata: JSON.stringify({
            disputeId: dispute.id,
            created: dispute.created,
            evidenceDueBy: dispute.evidence_details?.due_by,
          }),
        },
      });

      // Send internal notification
      await NotificationService.sendChargebackAlert(userId, dispute);

      logger.info('Chargeback created', {
        chargebackId: chargeback.id,
        disputeId: dispute.id,
        amount: dispute.amount / 100,
        reason: dispute.reason,
      });

      return chargeback as Chargeback;

    } catch (error) {
      logger.error('Failed to handle chargeback', { error, disputeId: dispute.id });
      throw error;
    }
  }

  /**
   * Update chargeback status
   */
  static async updateChargeback(
    chargebackId: string,
    updates: {
      status?: ChargebackStatus;
      evidence?: Record<string, any>;
      evidenceSubmittedAt?: Date;
    }
  ): Promise<Chargeback> {
    try {
      const updatedChargeback = await prisma.chargeback.update({
        where: { id: chargebackId },
        data: {
          ...updates,
          evidence: updates.evidence ? JSON.stringify(updates.evidence) : undefined,
        },
      });

      logger.info('Chargeback updated', {
        chargebackId,
        updates,
      });

      return updatedChargeback as Chargeback;

    } catch (error) {
      logger.error('Failed to update chargeback', { error, chargebackId, updates });
      throw error;
    }
  }

  /**
   * Submit evidence for chargeback dispute
   */
  static async submitChargebackEvidence(
    chargebackId: string,
    evidence: {
      customerCommunication?: string;
      receipt?: string;
      serviceDocumentation?: string;
      shippingDocumentation?: string;
      other?: string;
    }
  ): Promise<void> {
    try {
      const chargeback = await prisma.chargeback.findUnique({
        where: { id: chargebackId },
      });

      if (!chargeback) {
        throw new Error('Chargeback not found');
      }

      const metadata = JSON.parse(chargeback.metadata as string || '{}');
      const disputeId = metadata.disputeId;

      if (!disputeId) {
        throw new Error('Dispute ID not found in chargeback metadata');
      }

      // Submit evidence to Stripe
      await stripe.disputes.update(disputeId, {
        evidence: {
          customer_communication: evidence.customerCommunication,
          receipt: evidence.receipt,
          service_documentation: evidence.serviceDocumentation,
          shipping_documentation: evidence.shippingDocumentation,
          uncategorized_text: evidence.other,
        },
      });

      // Update chargeback record
      await this.updateChargeback(chargebackId, {
        evidence,
        evidenceSubmittedAt: new Date(),
      });

      logger.info('Chargeback evidence submitted', {
        chargebackId,
        disputeId,
      });

    } catch (error) {
      logger.error('Failed to submit chargeback evidence', { error, chargebackId });
      throw error;
    }
  }

  /**
   * Get refund analytics
   */
  static async getRefundAnalytics(
    startDate: Date,
    endDate: Date
  ): Promise<RefundAnalytics> {
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
      const totalRefundAmount = refunds.reduce(
        (sum, refund) => sum + Number(refund.amount),
        0
      );

      // Calculate refund rate (refunds vs total invoices)
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

      // Refunds by reason
      const refundsByReason = refunds.reduce((acc, refund) => {
        acc[refund.reason] = (acc[refund.reason] || 0) + 1;
        return acc;
      }, {} as Record<RefundReason, number>);

      // Monthly breakdown
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

    } catch (error) {
      logger.error('Failed to get refund analytics', { error, startDate, endDate });
      throw error;
    }
  }

  /**
   * Get chargeback analytics
   */
  static async getChargebackAnalytics(
    startDate: Date,
    endDate: Date
  ): Promise<ChargebackAnalytics> {
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
      const totalChargebackAmount = chargebacks.reduce(
        (sum, chargeback) => sum + Number(chargeback.amount),
        0
      );

      // Calculate chargeback rate
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

      // Calculate win rate
      const wonChargebacks = chargebacks.filter(c => c.status === 'won').length;
      const winRate = totalChargebacks > 0 ? (wonChargebacks / totalChargebacks) * 100 : 0;

      // Monthly breakdown
      const chargebacksByMonth = this.groupChargebacksByMonth(chargebacks);

      // Chargebacks by reason
      const chargebacksByReason = chargebacks.reduce((acc, chargeback) => {
        acc[chargeback.reason] = (acc[chargeback.reason] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        totalChargebacks,
        totalChargebackAmount,
        chargebackRate,
        winRate,
        chargebacksByMonth,
        chargebacksByReason,
      };

    } catch (error) {
      logger.error('Failed to get chargeback analytics', { error, startDate, endDate });
      throw error;
    }
  }

  /**
   * Process refund webhook updates
   */
  static async processRefundWebhook(refund: Stripe.Refund): Promise<void> {
    try {
      const existingRefund = await prisma.refund.findFirst({
        where: { stripeRefundId: refund.id },
      });

      if (!existingRefund) {
        logger.warn('Refund not found for webhook', { refundId: refund.id });
        return;
      }

      // Update refund status
      await prisma.refund.update({
        where: { id: existingRefund.id },
        data: {
          status: refund.status as RefundStatus,
          metadata: JSON.stringify({
            ...JSON.parse(existingRefund.metadata as string || '{}'),
            stripeMetadata: refund.metadata,
            failureReason: refund.failure_reason,
          }),
        },
      });

      // Send notification if refund succeeded
      if (refund.status === 'succeeded') {
        await NotificationService.sendRefundCompleted(existingRefund.userId, {
          amount: Number(existingRefund.amount),
          currency: existingRefund.currency,
        });
      }

      logger.info('Refund webhook processed', {
        refundId: existingRefund.id,
        stripeRefundId: refund.id,
        status: refund.status,
      });

    } catch (error) {
      logger.error('Failed to process refund webhook', { error, refundId: refund.id });
    }
  }

  /**
   * Map refund reason to Stripe format
   */
  private static mapRefundReasonToStripe(reason: RefundReason): string {
    switch (reason) {
      case RefundReason.DUPLICATE:
        return 'duplicate';
      case RefundReason.FRAUDULENT:
        return 'fraudulent';
      case RefundReason.REQUESTED_BY_CUSTOMER:
        return 'requested_by_customer';
      default:
        return 'requested_by_customer';
    }
  }

  /**
   * Group refunds by month
   */
  private static groupRefundsByMonth(refunds: any[]): Array<{
    month: string;
    count: number;
    amount: number;
  }> {
    const monthlyData = refunds.reduce((acc, refund) => {
      const month = refund.createdAt.toISOString().slice(0, 7); // YYYY-MM
      if (!acc[month]) {
        acc[month] = { count: 0, amount: 0 };
      }
      acc[month].count++;
      acc[month].amount += Number(refund.amount);
      return acc;
    }, {} as Record<string, { count: number; amount: number }>);

    return Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        count: data.count,
        amount: data.amount,
      }));
  }

  /**
   * Group chargebacks by month
   */
  private static groupChargebacksByMonth(chargebacks: any[]): Array<{
    month: string;
    count: number;
    amount: number;
  }> {
    const monthlyData = chargebacks.reduce((acc, chargeback) => {
      const month = chargeback.createdAt.toISOString().slice(0, 7); // YYYY-MM
      if (!acc[month]) {
        acc[month] = { count: 0, amount: 0 };
      }
      acc[month].count++;
      acc[month].amount += Number(chargeback.amount);
      return acc;
    }, {} as Record<string, { count: number; amount: number }>);

    return Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        count: data.count,
        amount: data.amount,
      }));
  }
}

// Additional notification methods for NotificationService
declare module './notification.service' {
  namespace NotificationService {
    function sendRefundProcessed(
      userId: string, 
      refundData: {
        amount: number;
        currency: string;
        reason: RefundReason;
        description?: string;
      }
    ): Promise<void>;

    function sendRefundCompleted(
      userId: string,
      refundData: {
        amount: number;
        currency: string;
      }
    ): Promise<void>;
  }
}

export default RefundsService;