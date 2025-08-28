import express from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { validateRequest, validateCommonParams } from '../middleware/validation';
import { createCustomRateLimit } from '../middleware/rate-limit';
import { SubscriptionService } from '../services/subscription.service';
import { UsageService } from '../services/usage.service';
import { RevenueService } from '../services/revenue.service';
import { RefundsService } from '../services/refunds.service';
import { DunningService } from '../services/dunning.service';
import { TaxService } from '../services/tax.service';
import { WebhookService } from '../services/webhook.service';
import { logger } from '../utils/logger';
import { DateTime } from 'luxon';

const router = express.Router();
const prisma = new PrismaClient();

// Apply authentication and admin authorization to all routes
router.use(authMiddleware);
router.use(adminMiddleware);

// Apply admin-specific rate limiting
const adminRateLimit = createCustomRateLimit({
  prefix: 'admin',
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Higher limit for admin users
  message: 'Admin rate limit exceeded',
});

router.use(adminRateLimit);

// =============================================================================
// DASHBOARD OVERVIEW
// =============================================================================

/**
 * Get billing dashboard overview
 */
router.get('/dashboard', async (req, res) => {
  try {
    const now = DateTime.now();
    const thirtyDaysAgo = now.minus({ days: 30 });
    const previousMonth = now.minus({ months: 1 });

    // Get key metrics
    const [
      totalUsers,
      activeSubscriptions,
      monthlyRevenue,
      failedPayments,
      pendingRefunds,
      activeDunningCampaigns,
    ] = await Promise.all([
      prisma.user.count(),
      
      prisma.user.count({
        where: {
          subscriptionTier: { not: 'free' },
          status: 'active',
        },
      }),

      prisma.invoice.aggregate({
        where: {
          status: 'paid',
          createdAt: {
            gte: previousMonth.startOf('month').toJSDate(),
            lte: previousMonth.endOf('month').toJSDate(),
          },
        },
        _sum: { total: true },
      }),

      prisma.invoice.count({
        where: {
          status: { in: ['open', 'past_due'] },
          dueDate: { lt: new Date() },
        },
      }),

      prisma.refund.count({
        where: { status: 'pending' },
      }),

      prisma.dunningCampaign.count({
        where: { status: 'active' },
      }),
    ]);

    // Get subscription distribution
    const subscriptionDistribution = await prisma.user.groupBy({
      by: ['subscriptionTier'],
      _count: { id: true },
    });

    // Get recent activity
    const recentInvoices = await prisma.invoice.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { email: true, displayName: true },
        },
      },
    });

    // Calculate growth metrics
    const previousMonthUsers = await prisma.user.count({
      where: {
        createdAt: { lte: previousMonth.endOf('month').toJSDate() },
      },
    });

    const userGrowth = previousMonthUsers > 0 
      ? ((totalUsers - previousMonthUsers) / previousMonthUsers) * 100 
      : 0;

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          activeSubscriptions,
          monthlyRevenue: Number(monthlyRevenue._sum.total || 0),
          userGrowth: Math.round(userGrowth * 100) / 100,
        },
        alerts: {
          failedPayments,
          pendingRefunds,
          activeDunningCampaigns,
        },
        subscriptionDistribution: subscriptionDistribution.reduce((acc, item) => {
          acc[item.subscriptionTier] = item._count.id;
          return acc;
        }, {} as Record<string, number>),
        recentActivity: recentInvoices.map(invoice => ({
          id: invoice.id,
          type: 'invoice',
          amount: Number(invoice.total),
          currency: invoice.currency,
          status: invoice.status,
          user: invoice.user?.email,
          createdAt: invoice.createdAt,
        })),
      },
    });

  } catch (error) {
    logger.error('Failed to get dashboard overview', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve dashboard data',
    });
  }
});

// =============================================================================
// USER MANAGEMENT
// =============================================================================

/**
 * Get users with billing information
 */
router.get('/users', validateCommonParams, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const search = req.query.search as string;
    const tier = req.query.tier as string;
    const status = req.query.status as string;

    const whereClause: any = {};

    if (search) {
      whereClause.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (tier) {
      whereClause.subscriptionTier = tier;
    }

    if (status) {
      whereClause.status = status;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: whereClause,
        include: {
          _count: {
            select: {
              documents: true,
              documentAnalyses: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),

      prisma.user.count({ where: whereClause }),
    ]);

    // Get usage data for each user
    const usersWithUsage = await Promise.all(
      users.map(async (user) => {
        const usage = await SubscriptionService.getSubscriptionUsage(user.id);
        return {
          ...user,
          usage,
        };
      })
    );

    res.json({
      success: true,
      data: {
        users: usersWithUsage,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      },
    });

  } catch (error) {
    logger.error('Failed to get users', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve users',
    });
  }
});

/**
 * Get user details with billing history
 */
router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        sessions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        _count: {
          select: {
            documents: true,
            documentAnalyses: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Get billing information
    const [invoices, paymentMethods, usage, dunningCampaigns] = await Promise.all([
      prisma.invoice.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),

      prisma.paymentMethod.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),

      SubscriptionService.getSubscriptionUsage(userId),

      DunningService.getUserDunningCampaigns(userId),
    ]);

    res.json({
      success: true,
      data: {
        user,
        billing: {
          invoices,
          paymentMethods,
          usage,
          dunningCampaigns,
        },
      },
    });

  } catch (error) {
    logger.error('Failed to get user details', { error, userId: req.params.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user details',
    });
  }
});

/**
 * Update user subscription
 */
const updateUserSubscriptionSchema = z.object({
  tier: z.enum(['free', 'starter', 'professional', 'team', 'enterprise']),
  reason: z.string().optional(),
});

router.put('/users/:userId/subscription', validateRequest(updateUserSubscriptionSchema), async (req, res) => {
  try {
    const { userId } = req.params;
    const { tier, reason } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionId: true, subscriptionTier: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    if (tier === 'free') {
      // Downgrade to free
      await prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionTier: tier,
          subscriptionId: null,
          subscriptionExpiresAt: null,
        },
      });

      // Cancel Stripe subscription if exists
      if (user.subscriptionId) {
        await SubscriptionService.cancelSubscription({
          subscriptionId: user.subscriptionId,
          cancelAtPeriodEnd: false,
          cancellationReason: reason || 'Admin action',
        });
      }
    } else if (user.subscriptionId) {
      // Update existing subscription
      await SubscriptionService.updateSubscription({
        subscriptionId: user.subscriptionId,
        tier: tier as any,
      });
    } else {
      // Create new subscription (this would typically require payment method)
      return res.status(400).json({
        success: false,
        error: 'Cannot upgrade user without payment method. User must subscribe through normal flow.',
      });
    }

    // Log admin action
    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: 'subscription_updated',
        resourceType: 'subscription',
        resourceId: userId,
        oldValues: JSON.stringify({ tier: user.subscriptionTier }),
        newValues: JSON.stringify({ tier, reason }),
      },
    });

    res.json({
      success: true,
      message: 'User subscription updated successfully',
    });

  } catch (error) {
    logger.error('Failed to update user subscription', { error, userId: req.params.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to update subscription',
    });
  }
});

// =============================================================================
// REVENUE ANALYTICS
// =============================================================================

/**
 * Get revenue report
 */
const getRevenueReportSchema = z.object({
  startDate: z.string().transform(str => new Date(str)),
  endDate: z.string().transform(str => new Date(str)),
  includeCohorts: z.string().optional().transform(str => str === 'true'),
  includeProjections: z.string().optional().transform(str => str === 'true'),
});

router.get('/revenue/report', validateRequest(getRevenueReportSchema, 'query'), async (req, res) => {
  try {
    const { startDate, endDate, includeCohorts, includeProjections } = req.query as any;

    const report = await RevenueService.generateRevenueReport(startDate, endDate, {
      includeCohorts,
      includeProjections,
    });

    res.json({
      success: true,
      data: report,
    });

  } catch (error) {
    logger.error('Failed to generate revenue report', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to generate revenue report',
    });
  }
});

/**
 * Get ARR metrics
 */
router.get('/revenue/arr', async (req, res) => {
  try {
    const metrics = await RevenueService.calculateARRMetrics();

    res.json({
      success: true,
      data: metrics,
    });

  } catch (error) {
    logger.error('Failed to get ARR metrics', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve ARR metrics',
    });
  }
});

/**
 * Get revenue forecast
 */
router.get('/revenue/forecast', async (req, res) => {
  try {
    const months = parseInt(req.query.months as string) || 12;
    const forecast = await RevenueService.getRevenueForecast(months);

    res.json({
      success: true,
      data: forecast,
    });

  } catch (error) {
    logger.error('Failed to get revenue forecast', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to generate revenue forecast',
    });
  }
});

// =============================================================================
// USAGE ANALYTICS
// =============================================================================

/**
 * Get usage analytics
 */
router.get('/usage/analytics', validateRequest(getRevenueReportSchema, 'query'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query as any;
    const metricType = req.query.metricType as any;

    const analytics = await UsageService.getUsageAnalytics(startDate, endDate, metricType);

    res.json({
      success: true,
      data: analytics,
    });

  } catch (error) {
    logger.error('Failed to get usage analytics', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve usage analytics',
    });
  }
});

// =============================================================================
// REFUNDS & CHARGEBACKS
// =============================================================================

/**
 * Get refund analytics
 */
router.get('/refunds/analytics', validateRequest(getRevenueReportSchema, 'query'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query as any;

    const analytics = await RefundsService.getRefundAnalytics(startDate, endDate);

    res.json({
      success: true,
      data: analytics,
    });

  } catch (error) {
    logger.error('Failed to get refund analytics', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve refund analytics',
    });
  }
});

/**
 * Get chargeback analytics
 */
router.get('/chargebacks/analytics', validateRequest(getRevenueReportSchema, 'query'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query as any;

    const analytics = await RefundsService.getChargebackAnalytics(startDate, endDate);

    res.json({
      success: true,
      data: analytics,
    });

  } catch (error) {
    logger.error('Failed to get chargeback analytics', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve chargeback analytics',
    });
  }
});

/**
 * Create manual refund
 */
const createRefundSchema = z.object({
  invoiceId: z.string(),
  amount: z.number().positive().optional(),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer', 'expired_uncaptured_charge']),
  description: z.string().optional(),
});

router.post('/refunds', validateRequest(createRefundSchema), async (req, res) => {
  try {
    const refund = await RefundsService.createRefund(req.body);

    // Log admin action
    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: 'refund_created',
        resourceType: 'refund',
        resourceId: refund.id,
        newValues: JSON.stringify(req.body),
      },
    });

    res.json({
      success: true,
      data: refund,
    });

  } catch (error) {
    logger.error('Failed to create refund', { error });
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create refund',
    });
  }
});

// =============================================================================
// DUNNING MANAGEMENT
// =============================================================================

/**
 * Get dunning analytics
 */
router.get('/dunning/analytics', validateRequest(getRevenueReportSchema, 'query'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query as any;

    const analytics = await DunningService.getDunningAnalytics(startDate, endDate);

    res.json({
      success: true,
      data: analytics,
    });

  } catch (error) {
    logger.error('Failed to get dunning analytics', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve dunning analytics',
    });
  }
});

/**
 * Pause dunning campaign
 */
router.post('/dunning/:campaignId/pause', async (req, res) => {
  try {
    const { campaignId } = req.params;

    await DunningService.pauseDunningCampaign(campaignId);

    // Log admin action
    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: 'dunning_paused',
        resourceType: 'dunning_campaign',
        resourceId: campaignId,
      },
    });

    res.json({
      success: true,
      message: 'Dunning campaign paused',
    });

  } catch (error) {
    logger.error('Failed to pause dunning campaign', { error, campaignId: req.params.campaignId });
    res.status(500).json({
      success: false,
      error: 'Failed to pause dunning campaign',
    });
  }
});

/**
 * Resume dunning campaign
 */
router.post('/dunning/:campaignId/resume', async (req, res) => {
  try {
    const { campaignId } = req.params;

    await DunningService.resumeDunningCampaign(campaignId);

    // Log admin action
    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: 'dunning_resumed',
        resourceType: 'dunning_campaign',
        resourceId: campaignId,
      },
    });

    res.json({
      success: true,
      message: 'Dunning campaign resumed',
    });

  } catch (error) {
    logger.error('Failed to resume dunning campaign', { error, campaignId: req.params.campaignId });
    res.status(500).json({
      success: false,
      error: 'Failed to resume dunning campaign',
    });
  }
});

// =============================================================================
// TAX MANAGEMENT
// =============================================================================

/**
 * Get tax summary
 */
router.get('/tax/summary', validateRequest(getRevenueReportSchema, 'query'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query as any;

    const summary = await TaxService.getTaxSummaryForPeriod(startDate, endDate);

    res.json({
      success: true,
      data: summary,
    });

  } catch (error) {
    logger.error('Failed to get tax summary', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve tax summary',
    });
  }
});

/**
 * Generate tax report
 */
const generateTaxReportSchema = z.object({
  startDate: z.string().transform(str => new Date(str)),
  endDate: z.string().transform(str => new Date(str)),
  jurisdiction: z.string().optional(),
});

router.post('/tax/report', validateRequest(generateTaxReportSchema), async (req, res) => {
  try {
    const { startDate, endDate, jurisdiction } = req.body;

    const report = await TaxService.generateTaxReport(startDate, endDate, jurisdiction);

    res.json({
      success: true,
      data: report,
    });

  } catch (error) {
    logger.error('Failed to generate tax report', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to generate tax report',
    });
  }
});

// =============================================================================
// SYSTEM MANAGEMENT
// =============================================================================

/**
 * Retry failed webhook events
 */
router.post('/webhooks/retry', async (req, res) => {
  try {
    await WebhookService.retryFailedEvents();

    res.json({
      success: true,
      message: 'Failed webhook events retried',
    });

  } catch (error) {
    logger.error('Failed to retry webhook events', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retry webhook events',
    });
  }
});

/**
 * Get audit logs
 */
router.get('/audit-logs', validateCommonParams, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const action = req.query.action as string;
    const userId = req.query.userId as string;

    const whereClause: any = {};

    if (action) {
      whereClause.action = action;
    }

    if (userId) {
      whereClause.userId = userId;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: whereClause,
        include: {
          user: {
            select: { email: true, displayName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),

      prisma.auditLog.count({ where: whereClause }),
    ]);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      },
    });

  } catch (error) {
    logger.error('Failed to get audit logs', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve audit logs',
    });
  }
});

export default router;