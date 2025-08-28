import { PrismaClient } from '@prisma/client';
import { stripe, retryFailedPayment } from '../lib/stripe';
import { BILLING_CONFIG } from '../config';
import { logger } from '../utils/logger';
import { NotificationService } from './notification.service';
import { DateTime } from 'luxon';

const prisma = new PrismaClient();

export interface DunningCampaign {
  id: string;
  userId: string;
  invoiceId: string;
  status: DunningStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lastAttemptAt?: Date;
  completedAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export enum DunningStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

export interface DunningAttempt {
  id: string;
  campaignId: string;
  attemptNumber: number;
  type: DunningAttemptType;
  status: DunningAttemptStatus;
  scheduledAt: Date;
  executedAt?: Date;
  errorMessage?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export enum DunningAttemptType {
  EMAIL_REMINDER = 'email_reminder',
  PAYMENT_RETRY = 'payment_retry',
  PHONE_CALL = 'phone_call',
  FINAL_NOTICE = 'final_notice',
  ACCOUNT_SUSPENSION = 'account_suspension',
}

export enum DunningAttemptStatus {
  SCHEDULED = 'scheduled',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export class DunningService {
  /**
   * Start dunning process for failed payment
   */
  static async startDunningProcess(
    userId: string,
    invoiceId: string,
    metadata?: Record<string, any>
  ): Promise<DunningCampaign> {
    try {
      // Check if dunning campaign already exists for this invoice
      const existingCampaign = await prisma.dunningCampaign.findFirst({
        where: { invoiceId },
      });

      if (existingCampaign) {
        logger.info('Dunning campaign already exists', { 
          campaignId: existingCampaign.id,
          invoiceId 
        });
        return existingCampaign as DunningCampaign;
      }

      // Create new dunning campaign
      const campaign = await prisma.dunningCampaign.create({
        data: {
          userId,
          invoiceId,
          status: DunningStatus.ACTIVE,
          attemptCount: 0,
          maxAttempts: BILLING_CONFIG.dunningRetryAttempts,
          nextAttemptAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Start in 24 hours
          metadata: metadata ? JSON.stringify(metadata) : undefined,
        },
      });

      // Schedule initial dunning attempts
      await this.scheduleDunningAttempts(campaign.id);

      logger.info('Dunning campaign started', {
        campaignId: campaign.id,
        userId,
        invoiceId,
      });

      return campaign as DunningCampaign;

    } catch (error) {
      logger.error('Failed to start dunning process', { error, userId, invoiceId });
      throw error;
    }
  }

  /**
   * Schedule dunning attempts for a campaign
   */
  private static async scheduleDunningAttempts(campaignId: string): Promise<void> {
    try {
      const campaign = await prisma.dunningCampaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign) {
        throw new Error('Dunning campaign not found');
      }

      // Dunning schedule: Day 1, 3, 7, 14, 21, 30
      const scheduleOffsets = [1, 3, 7, 14, 21, 30]; // Days after failed payment
      const baseDate = DateTime.now();

      const attempts = [
        // Day 1: Email reminder
        {
          attemptNumber: 1,
          type: DunningAttemptType.EMAIL_REMINDER,
          scheduledAt: baseDate.plus({ days: scheduleOffsets[0] }).toJSDate(),
        },
        
        // Day 3: Payment retry + email
        {
          attemptNumber: 2,
          type: DunningAttemptType.PAYMENT_RETRY,
          scheduledAt: baseDate.plus({ days: scheduleOffsets[1] }).toJSDate(),
        },
        
        // Day 7: Email reminder
        {
          attemptNumber: 3,
          type: DunningAttemptType.EMAIL_REMINDER,
          scheduledAt: baseDate.plus({ days: scheduleOffsets[2] }).toJSDate(),
        },
        
        // Day 14: Payment retry + email
        {
          attemptNumber: 4,
          type: DunningAttemptType.PAYMENT_RETRY,
          scheduledAt: baseDate.plus({ days: scheduleOffsets[3] }).toJSDate(),
        },
        
        // Day 21: Final notice
        {
          attemptNumber: 5,
          type: DunningAttemptType.FINAL_NOTICE,
          scheduledAt: baseDate.plus({ days: scheduleOffsets[4] }).toJSDate(),
        },
        
        // Day 30: Account suspension
        {
          attemptNumber: 6,
          type: DunningAttemptType.ACCOUNT_SUSPENSION,
          scheduledAt: baseDate.plus({ days: scheduleOffsets[5] }).toJSDate(),
        },
      ];

      // Create dunning attempts
      for (const attempt of attempts) {
        await prisma.dunningAttempt.create({
          data: {
            campaignId,
            attemptNumber: attempt.attemptNumber,
            type: attempt.type,
            status: DunningAttemptStatus.SCHEDULED,
            scheduledAt: attempt.scheduledAt,
          },
        });
      }

      logger.info('Dunning attempts scheduled', {
        campaignId,
        attemptCount: attempts.length,
      });

    } catch (error) {
      logger.error('Failed to schedule dunning attempts', { error, campaignId });
      throw error;
    }
  }

  /**
   * Process due dunning attempts
   */
  static async processDueDunningAttempts(): Promise<void> {
    try {
      const dueAttempts = await prisma.dunningAttempt.findMany({
        where: {
          status: DunningAttemptStatus.SCHEDULED,
          scheduledAt: {
            lte: new Date(),
          },
        },
        include: {
          campaign: {
            include: {
              user: true,
              invoice: true,
            },
          },
        },
        orderBy: {
          scheduledAt: 'asc',
        },
        take: 50, // Process 50 attempts at a time
      });

      for (const attempt of dueAttempts) {
        await this.executeDunningAttempt(attempt.id);
      }

      logger.info('Processed due dunning attempts', { count: dueAttempts.length });

    } catch (error) {
      logger.error('Failed to process due dunning attempts', { error });
    }
  }

  /**
   * Execute a specific dunning attempt
   */
  private static async executeDunningAttempt(attemptId: string): Promise<void> {
    try {
      const attempt = await prisma.dunningAttempt.findUnique({
        where: { id: attemptId },
        include: {
          campaign: {
            include: {
              user: true,
              invoice: true,
            },
          },
        },
      });

      if (!attempt || !attempt.campaign) {
        logger.warn('Dunning attempt or campaign not found', { attemptId });
        return;
      }

      // Mark attempt as processing
      await prisma.dunningAttempt.update({
        where: { id: attemptId },
        data: {
          status: DunningAttemptStatus.PROCESSING,
          executedAt: new Date(),
        },
      });

      try {
        // Execute attempt based on type
        switch (attempt.type) {
          case DunningAttemptType.EMAIL_REMINDER:
            await this.sendEmailReminder(attempt);
            break;

          case DunningAttemptType.PAYMENT_RETRY:
            await this.retryPayment(attempt);
            break;

          case DunningAttemptType.FINAL_NOTICE:
            await this.sendFinalNotice(attempt);
            break;

          case DunningAttemptType.ACCOUNT_SUSPENSION:
            await this.suspendAccount(attempt);
            break;

          default:
            logger.warn('Unknown dunning attempt type', { 
              attemptId, 
              type: attempt.type 
            });
            return;
        }

        // Mark attempt as completed
        await prisma.dunningAttempt.update({
          where: { id: attemptId },
          data: { status: DunningAttemptStatus.COMPLETED },
        });

        // Update campaign
        await prisma.dunningCampaign.update({
          where: { id: attempt.campaignId },
          data: {
            attemptCount: { increment: 1 },
            lastAttemptAt: new Date(),
          },
        });

        logger.info('Dunning attempt executed successfully', {
          attemptId,
          campaignId: attempt.campaignId,
          type: attempt.type,
        });

      } catch (executionError) {
        // Mark attempt as failed
        await prisma.dunningAttempt.update({
          where: { id: attemptId },
          data: {
            status: DunningAttemptStatus.FAILED,
            errorMessage: (executionError as Error).message,
          },
        });

        logger.error('Dunning attempt execution failed', {
          attemptId,
          error: executionError,
        });
      }

    } catch (error) {
      logger.error('Failed to execute dunning attempt', { error, attemptId });
    }
  }

  /**
   * Send email reminder for failed payment
   */
  private static async sendEmailReminder(attempt: any): Promise<void> {
    const { campaign } = attempt;
    const user = campaign.user;
    const invoice = campaign.invoice;

    await NotificationService.sendDunningReminder(user.id, {
      attemptNumber: attempt.attemptNumber,
      amount: Number(invoice.total),
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      invoiceUrl: `${process.env.FRONTEND_URL}/billing/invoices/${invoice.id}`,
    });
  }

  /**
   * Retry failed payment
   */
  private static async retryPayment(attempt: any): Promise<void> {
    const { campaign } = attempt;
    const invoice = campaign.invoice;

    try {
      // Attempt to retry the payment in Stripe
      const stripeInvoice = await retryFailedPayment(invoice.stripeInvoiceId);
      
      if (stripeInvoice.status === 'paid') {
        // Payment succeeded, complete the dunning campaign
        await this.completeDunningCampaign(campaign.id, 'payment_successful');
        
        await NotificationService.sendPaymentSuccess(campaign.userId, {
          amount: Number(invoice.total),
          currency: invoice.currency,
        });
      } else {
        // Payment still failed, send reminder email
        await this.sendEmailReminder(attempt);
      }

    } catch (error) {
      // Payment retry failed, send reminder email
      await this.sendEmailReminder(attempt);
      throw error;
    }
  }

  /**
   * Send final notice before account suspension
   */
  private static async sendFinalNotice(attempt: any): Promise<void> {
    const { campaign } = attempt;
    const user = campaign.user;
    const invoice = campaign.invoice;

    await NotificationService.sendFinalNotice(user.id, {
      amount: Number(invoice.total),
      currency: invoice.currency,
      suspensionDate: DateTime.now().plus({ days: 7 }).toJSDate(),
      paymentUrl: `${process.env.FRONTEND_URL}/billing/payment/${invoice.id}`,
    });
  }

  /**
   * Suspend user account for non-payment
   */
  private static async suspendAccount(attempt: any): Promise<void> {
    const { campaign } = attempt;
    const user = campaign.user;

    // Suspend user account
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'suspended' },
    });

    // Cancel subscription in Stripe
    if (user.subscriptionId) {
      try {
        await stripe.subscriptions.cancel(user.subscriptionId, {
          prorate: false,
        });
      } catch (error) {
        logger.error('Failed to cancel subscription during suspension', {
          userId: user.id,
          subscriptionId: user.subscriptionId,
          error,
        });
      }
    }

    // Complete dunning campaign
    await this.completeDunningCampaign(campaign.id, 'account_suspended');

    await NotificationService.sendAccountSuspended(user.id);

    logger.info('Account suspended for non-payment', {
      userId: user.id,
      campaignId: campaign.id,
    });
  }

  /**
   * Complete dunning campaign
   */
  private static async completeDunningCampaign(
    campaignId: string,
    reason: string
  ): Promise<void> {
    await prisma.dunningCampaign.update({
      where: { id: campaignId },
      data: {
        status: DunningStatus.COMPLETED,
        completedAt: new Date(),
        metadata: JSON.stringify({ completionReason: reason }),
      },
    });

    // Cancel any remaining scheduled attempts
    await prisma.dunningAttempt.updateMany({
      where: {
        campaignId,
        status: DunningAttemptStatus.SCHEDULED,
      },
      data: {
        status: DunningAttemptStatus.SKIPPED,
      },
    });

    logger.info('Dunning campaign completed', { campaignId, reason });
  }

  /**
   * Pause dunning campaign
   */
  static async pauseDunningCampaign(campaignId: string): Promise<void> {
    await prisma.dunningCampaign.update({
      where: { id: campaignId },
      data: { status: DunningStatus.PAUSED },
    });

    logger.info('Dunning campaign paused', { campaignId });
  }

  /**
   * Resume dunning campaign
   */
  static async resumeDunningCampaign(campaignId: string): Promise<void> {
    await prisma.dunningCampaign.update({
      where: { id: campaignId },
      data: { status: DunningStatus.ACTIVE },
    });

    logger.info('Dunning campaign resumed', { campaignId });
  }

  /**
   * Cancel dunning campaign
   */
  static async cancelDunningCampaign(
    campaignId: string,
    reason: string
  ): Promise<void> {
    await prisma.dunningCampaign.update({
      where: { id: campaignId },
      data: {
        status: DunningStatus.CANCELED,
        completedAt: new Date(),
        metadata: JSON.stringify({ cancellationReason: reason }),
      },
    });

    // Cancel any remaining scheduled attempts
    await prisma.dunningAttempt.updateMany({
      where: {
        campaignId,
        status: DunningAttemptStatus.SCHEDULED,
      },
      data: {
        status: DunningAttemptStatus.SKIPPED,
      },
    });

    logger.info('Dunning campaign canceled', { campaignId, reason });
  }

  /**
   * Get dunning campaign analytics
   */
  static async getDunningAnalytics(
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalCampaigns: number;
    successfulRecoveries: number;
    suspendedAccounts: number;
    recoveryRate: number;
    averageRecoveryTime: number;
    campaignsByStatus: Record<string, number>;
  }> {
    try {
      const campaigns = await prisma.dunningCampaign.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          attempts: true,
        },
      });

      const totalCampaigns = campaigns.length;
      const successfulRecoveries = campaigns.filter(
        c => c.status === DunningStatus.COMPLETED && 
        JSON.parse(c.metadata as string || '{}').completionReason === 'payment_successful'
      ).length;
      
      const suspendedAccounts = campaigns.filter(
        c => c.status === DunningStatus.COMPLETED && 
        JSON.parse(c.metadata as string || '{}').completionReason === 'account_suspended'
      ).length;

      const recoveryRate = totalCampaigns > 0 ? (successfulRecoveries / totalCampaigns) * 100 : 0;

      // Calculate average recovery time
      const recoveredCampaigns = campaigns.filter(c => 
        c.status === DunningStatus.COMPLETED && 
        JSON.parse(c.metadata as string || '{}').completionReason === 'payment_successful'
      );
      
      const averageRecoveryTime = recoveredCampaigns.length > 0
        ? recoveredCampaigns.reduce((sum, c) => {
            const recoveryTime = c.completedAt!.getTime() - c.createdAt.getTime();
            return sum + recoveryTime;
          }, 0) / recoveredCampaigns.length / (1000 * 60 * 60 * 24) // Convert to days
        : 0;

      // Count campaigns by status
      const campaignsByStatus = campaigns.reduce((acc, c) => {
        acc[c.status] = (acc[c.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        totalCampaigns,
        successfulRecoveries,
        suspendedAccounts,
        recoveryRate,
        averageRecoveryTime,
        campaignsByStatus,
      };

    } catch (error) {
      logger.error('Failed to get dunning analytics', { error, startDate, endDate });
      throw error;
    }
  }

  /**
   * Get user's active dunning campaigns
   */
  static async getUserDunningCampaigns(userId: string): Promise<DunningCampaign[]> {
    try {
      const campaigns = await prisma.dunningCampaign.findMany({
        where: {
          userId,
          status: { in: [DunningStatus.ACTIVE, DunningStatus.PAUSED] },
        },
        include: {
          attempts: {
            orderBy: { attemptNumber: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return campaigns as DunningCampaign[];

    } catch (error) {
      logger.error('Failed to get user dunning campaigns', { error, userId });
      throw error;
    }
  }
}

export default DunningService;