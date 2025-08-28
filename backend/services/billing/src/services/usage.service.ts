import { PrismaClient } from '@prisma/client';
import { stripe, createUsageRecord } from '../lib/stripe';
import { USAGE_COSTS, BILLING_CONFIG } from '../config';
import { logger } from '../utils/logger';
import { BillingModel, UsageRecord, UsageMetricType } from '../models/billing';
import { DateTime } from 'luxon';
import { Decimal } from 'decimal.js';

const prisma = new PrismaClient();

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

export class UsageService {
  /**
   * Record usage for a specific metric
   */
  static async recordUsage(params: RecordUsageParams): Promise<UsageRecord> {
    try {
      const { userId, metricType, quantity, metadata, timestamp = new Date() } = params;

      // Get user's subscription to determine billing period
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { 
          subscriptionTier: true, 
          subscriptionId: true,
          subscriptionExpiresAt: true,
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Determine billing period
      const periodEnd = user.subscriptionExpiresAt 
        ? DateTime.fromJSDate(user.subscriptionExpiresAt)
        : DateTime.now().endOf('month');
      const periodStart = periodEnd.minus({ month: 1 });

      // Record usage in database
      const usageRecord = await BillingModel.recordUsage({
        userId,
        subscriptionId: user.subscriptionId || undefined,
        metricType,
        quantity,
        unit: this.getMetricUnit(metricType),
        periodStart: periodStart.toJSDate(),
        periodEnd: periodEnd.toJSDate(),
        metadata,
      });

      // If user has active Stripe subscription, report usage to Stripe for metered billing
      if (user.subscriptionId && user.subscriptionTier !== 'free') {
        await this.reportUsageToStripe(user.subscriptionId, metricType, quantity, timestamp);
      }

      logger.info('Usage recorded successfully', {
        userId,
        metricType,
        quantity,
        subscriptionTier: user.subscriptionTier,
      });

      return usageRecord as UsageRecord;

    } catch (error) {
      logger.error('Failed to record usage', { error, params });
      throw error;
    }
  }

  /**
   * Get usage for current billing period
   */
  static async getCurrentPeriodUsage(userId: string): Promise<BillingPeriodUsage> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { 
          subscriptionTier: true,
          subscriptionExpiresAt: true,
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Determine billing period
      const periodEnd = user.subscriptionExpiresAt 
        ? DateTime.fromJSDate(user.subscriptionExpiresAt)
        : DateTime.now().endOf('month');
      const periodStart = periodEnd.minus({ month: 1 });

      return this.getUsageForPeriod(userId, periodStart.toJSDate(), periodEnd.toJSDate());

    } catch (error) {
      logger.error('Failed to get current period usage', { error, userId });
      throw error;
    }
  }

  /**
   * Get usage for specific period
   */
  static async getUsageForPeriod(
    userId: string, 
    periodStart: Date, 
    periodEnd: Date
  ): Promise<BillingPeriodUsage> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionTier: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Get usage for all metrics
      const metrics = {} as BillingPeriodUsage['metrics'];
      let totalOverageCost = 0;

      for (const metricType of Object.values(UsageMetricType)) {
        const usage = await BillingModel.getUsageForPeriod(
          userId,
          metricType,
          periodStart,
          periodEnd
        );

        const quantity = Number(usage._sum.quantity || 0);
        const limit = this.getMetricLimit(user.subscriptionTier as any, metricType);
        const overage = Math.max(0, limit > 0 ? quantity - limit : 0);
        const cost = overage * this.getOverageCost(metricType);

        metrics[metricType] = {
          quantity,
          limit,
          overage,
          cost,
        };

        totalOverageCost += cost;
      }

      return {
        userId,
        periodStart,
        periodEnd,
        metrics,
        totalOverageCost,
        currency: 'usd',
      };

    } catch (error) {
      logger.error('Failed to get usage for period', { error, userId, periodStart, periodEnd });
      throw error;
    }
  }

  /**
   * Calculate overage charges for billing period
   */
  static async calculateOverageCharges(
    userId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<UsageOverage[]> {
    try {
      const usage = await this.getUsageForPeriod(userId, periodStart, periodEnd);
      const overages: UsageOverage[] = [];

      for (const [metricType, data] of Object.entries(usage.metrics)) {
        if (data.overage > 0) {
          overages.push({
            metricType: metricType as UsageMetricType,
            allowedQuantity: data.limit,
            usedQuantity: data.quantity,
            overageQuantity: data.overage,
            overageCost: data.cost,
            currency: usage.currency,
          });
        }
      }

      return overages;

    } catch (error) {
      logger.error('Failed to calculate overage charges', { error, userId, periodStart, periodEnd });
      throw error;
    }
  }

  /**
   * Process overage billing for subscription
   */
  static async processOverageBilling(subscriptionId: string): Promise<void> {
    try {
      // Get subscription details
      const subscription = await BillingModel.getSubscriptionByStripeId(subscriptionId);
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Calculate current period dates
      const periodEnd = DateTime.fromJSDate(subscription.currentPeriodEnd);
      const periodStart = DateTime.fromJSDate(subscription.currentPeriodStart);

      // Calculate overages
      const overages = await this.calculateOverageCharges(
        subscription.userId,
        periodStart.toJSDate(),
        periodEnd.toJSDate()
      );

      if (overages.length === 0) {
        logger.info('No overages to bill', { subscriptionId, userId: subscription.userId });
        return;
      }

      // Create invoice items for overages
      const stripeCustomer = await stripe.customers.retrieve(subscription.stripeCustomerId);
      
      for (const overage of overages) {
        await stripe.invoiceItems.create({
          customer: subscription.stripeCustomerId,
          amount: Math.round(overage.overageCost * 100), // Convert to cents
          currency: overage.currency,
          description: `${this.getMetricDisplayName(overage.metricType)} overage: ${overage.overageQuantity} units`,
          metadata: {
            userId: subscription.userId,
            subscriptionId,
            metricType: overage.metricType,
            overageQuantity: overage.overageQuantity.toString(),
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
          },
        });
      }

      logger.info('Overage billing processed successfully', {
        subscriptionId,
        userId: subscription.userId,
        overageCount: overages.length,
        totalCost: overages.reduce((sum, o) => sum + o.overageCost, 0),
      });

    } catch (error) {
      logger.error('Failed to process overage billing', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Report usage to Stripe for metered billing
   */
  private static async reportUsageToStripe(
    subscriptionId: string,
    metricType: UsageMetricType,
    quantity: number,
    timestamp: Date
  ): Promise<void> {
    try {
      // Get Stripe subscription
      const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items'],
      });

      // Find subscription item for the metric
      const subscriptionItem = stripeSubscription.items.data.find(item => {
        const price = item.price;
        return price.metadata?.metricType === metricType;
      });

      if (!subscriptionItem) {
        logger.warn('No subscription item found for metric type', { 
          subscriptionId, 
          metricType 
        });
        return;
      }

      // Create usage record in Stripe
      await createUsageRecord(
        subscriptionItem.id,
        quantity,
        Math.floor(timestamp.getTime() / 1000)
      );

      logger.debug('Usage reported to Stripe', {
        subscriptionId,
        subscriptionItemId: subscriptionItem.id,
        metricType,
        quantity,
      });

    } catch (error) {
      logger.error('Failed to report usage to Stripe', {
        error,
        subscriptionId,
        metricType,
        quantity,
      });
      // Don't throw error here as local usage recording should still succeed
    }
  }

  /**
   * Get metric unit for display
   */
  private static getMetricUnit(metricType: UsageMetricType): string {
    switch (metricType) {
      case UsageMetricType.ANALYSES:
        return 'analyses';
      case UsageMetricType.API_CALLS:
        return 'calls';
      case UsageMetricType.MONITORED_DOCUMENTS:
        return 'documents';
      case UsageMetricType.TEAM_MEMBERS:
        return 'members';
      default:
        return 'units';
    }
  }

  /**
   * Get metric display name
   */
  private static getMetricDisplayName(metricType: UsageMetricType): string {
    switch (metricType) {
      case UsageMetricType.ANALYSES:
        return 'Document Analysis';
      case UsageMetricType.API_CALLS:
        return 'API Calls';
      case UsageMetricType.MONITORED_DOCUMENTS:
        return 'Monitored Documents';
      case UsageMetricType.TEAM_MEMBERS:
        return 'Team Members';
      default:
        return 'Usage';
    }
  }

  /**
   * Get metric limit for subscription tier
   */
  private static getMetricLimit(tier: keyof typeof import('../config').PRICING_TIERS, metricType: UsageMetricType): number {
    const { PRICING_TIERS } = require('../config');
    const tierConfig = PRICING_TIERS[tier];
    
    if (!tierConfig) return 0;

    switch (metricType) {
      case UsageMetricType.ANALYSES:
        return tierConfig.features.analysesPerMonth;
      case UsageMetricType.API_CALLS:
        return typeof tierConfig.features.apiAccess === 'number' ? tierConfig.features.apiAccess : -1;
      case UsageMetricType.MONITORED_DOCUMENTS:
        return typeof tierConfig.features.monitoring === 'number' ? tierConfig.features.monitoring : -1;
      case UsageMetricType.TEAM_MEMBERS:
        return tierConfig.features.teamMembers;
      default:
        return -1;
    }
  }

  /**
   * Get overage cost per unit
   */
  private static getOverageCost(metricType: UsageMetricType): number {
    switch (metricType) {
      case UsageMetricType.ANALYSES:
        return USAGE_COSTS.analysisOverage;
      case UsageMetricType.API_CALLS:
        return USAGE_COSTS.apiOverage;
      case UsageMetricType.MONITORED_DOCUMENTS:
        return 1.00; // $1 per additional monitored document
      case UsageMetricType.TEAM_MEMBERS:
        return 10.00; // $10 per additional team member
      default:
        return 0;
    }
  }

  /**
   * Bulk record usage for multiple metrics
   */
  static async recordBulkUsage(
    userId: string,
    usages: Array<{
      metricType: UsageMetricType;
      quantity: number;
      metadata?: Record<string, any>;
    }>,
    timestamp?: Date
  ): Promise<UsageRecord[]> {
    try {
      const records: UsageRecord[] = [];

      for (const usage of usages) {
        const record = await this.recordUsage({
          userId,
          metricType: usage.metricType,
          quantity: usage.quantity,
          metadata: usage.metadata,
          timestamp,
        });
        records.push(record);
      }

      return records;

    } catch (error) {
      logger.error('Failed to record bulk usage', { error, userId, usageCount: usages.length });
      throw error;
    }
  }

  /**
   * Get usage analytics for admin dashboard
   */
  static async getUsageAnalytics(
    startDate: Date,
    endDate: Date,
    metricType?: UsageMetricType
  ): Promise<{
    totalUsage: number;
    averageUsage: number;
    uniqueUsers: number;
    usageByTier: Record<string, number>;
    dailyUsage: Array<{ date: string; usage: number }>;
  }> {
    try {
      const whereClause: any = {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      };

      if (metricType) {
        whereClause.metricType = metricType;
      }

      // Get aggregated usage data
      const [totalUsage, usageByUser, dailyUsage] = await Promise.all([
        prisma.usageRecord.aggregate({
          where: whereClause,
          _sum: { quantity: true },
        }),
        
        prisma.usageRecord.groupBy({
          by: ['userId'],
          where: whereClause,
          _sum: { quantity: true },
        }),

        prisma.$queryRaw`
          SELECT DATE(created_at) as date, SUM(quantity) as usage
          FROM usage_records
          WHERE created_at >= ${startDate} AND created_at <= ${endDate}
          ${metricType ? prisma.$queryRaw`AND metric_type = ${metricType}` : prisma.$queryRaw``}
          GROUP BY DATE(created_at)
          ORDER BY date
        `,
      ]);

      // Get usage by subscription tier
      const usageByTier: Record<string, number> = {};
      for (const userUsage of usageByUser) {
        const user = await prisma.user.findUnique({
          where: { id: userUsage.userId },
          select: { subscriptionTier: true },
        });
        
        if (user) {
          const tier = user.subscriptionTier;
          usageByTier[tier] = (usageByTier[tier] || 0) + Number(userUsage._sum.quantity || 0);
        }
      }

      return {
        totalUsage: Number(totalUsage._sum.quantity || 0),
        averageUsage: usageByUser.length > 0 
          ? Number(totalUsage._sum.quantity || 0) / usageByUser.length 
          : 0,
        uniqueUsers: usageByUser.length,
        usageByTier,
        dailyUsage: (dailyUsage as any[]).map(row => ({
          date: row.date,
          usage: Number(row.usage),
        })),
      };

    } catch (error) {
      logger.error('Failed to get usage analytics', { error, startDate, endDate, metricType });
      throw error;
    }
  }
}

export default UsageService;