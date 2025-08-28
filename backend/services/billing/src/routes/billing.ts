import express from 'express';
import { z } from 'zod';
import { SubscriptionService } from '../services/subscription.service';
import { UsageService } from '../services/usage.service';
import { TaxService } from '../services/tax.service';
import { NotificationService } from '../services/notification.service';
import { stripe, createSetupIntent, createPaymentIntent, getUpcomingInvoice } from '../lib/stripe';
import { authMiddleware } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { rateLimitMiddleware } from '../middleware/rate-limit';
import { logger } from '../utils/logger';
import { PRICING_TIERS } from '../config';

const router = express.Router();

// Apply authentication to all billing routes
router.use(authMiddleware);

// Apply rate limiting
router.use(rateLimitMiddleware);

// =============================================================================
// SUBSCRIPTION ROUTES
// =============================================================================

/**
 * Get current subscription
 */
router.get('/subscription', async (req, res) => {
  try {
    const { userId } = req.user!;
    
    const subscription = await SubscriptionService.getSubscription(userId);
    const usage = await SubscriptionService.getSubscriptionUsage(userId);

    res.json({
      success: true,
      data: {
        subscription,
        usage,
        availableTiers: PRICING_TIERS,
      },
    });

  } catch (error) {
    logger.error('Failed to get subscription', { error, userId: req.user?.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve subscription information',
    });
  }
});

/**
 * Create new subscription
 */
const createSubscriptionSchema = z.object({
  tier: z.enum(['free', 'starter', 'professional', 'team', 'enterprise']),
  paymentMethodId: z.string().optional(),
  trialDays: z.number().min(0).max(30).optional(),
  couponCode: z.string().optional(),
});

router.post('/subscription', validateRequest(createSubscriptionSchema), async (req, res) => {
  try {
    const { userId, email } = req.user!;
    const { tier, paymentMethodId, trialDays, couponCode } = req.body;

    const result = await SubscriptionService.createSubscription({
      userId,
      email,
      tier,
      paymentMethodId,
      trialDays,
      couponCode,
    });

    res.json({
      success: true,
      data: result,
    });

  } catch (error) {
    logger.error('Failed to create subscription', { error, userId: req.user?.userId });
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create subscription',
    });
  }
});

/**
 * Update subscription
 */
const updateSubscriptionSchema = z.object({
  tier: z.enum(['starter', 'professional', 'team', 'enterprise']).optional(),
  paymentMethodId: z.string().optional(),
  couponCode: z.string().optional(),
  prorationBehavior: z.enum(['create_prorations', 'none', 'always_invoice']).optional(),
});

router.put('/subscription', validateRequest(updateSubscriptionSchema), async (req, res) => {
  try {
    const { userId } = req.user!;
    const currentSubscription = await SubscriptionService.getSubscription(userId);

    if (!currentSubscription?.stripeSubscriptionId) {
      return res.status(400).json({
        success: false,
        error: 'No active subscription found',
      });
    }

    const updatedSubscription = await SubscriptionService.updateSubscription({
      subscriptionId: currentSubscription.stripeSubscriptionId,
      ...req.body,
    });

    res.json({
      success: true,
      data: updatedSubscription,
    });

  } catch (error) {
    logger.error('Failed to update subscription', { error, userId: req.user?.userId });
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update subscription',
    });
  }
});

/**
 * Cancel subscription
 */
const cancelSubscriptionSchema = z.object({
  cancelAtPeriodEnd: z.boolean().default(true),
  cancellationReason: z.string().optional(),
});

router.post('/subscription/cancel', validateRequest(cancelSubscriptionSchema), async (req, res) => {
  try {
    const { userId } = req.user!;
    const currentSubscription = await SubscriptionService.getSubscription(userId);

    if (!currentSubscription?.stripeSubscriptionId) {
      return res.status(400).json({
        success: false,
        error: 'No active subscription found',
      });
    }

    const canceledSubscription = await SubscriptionService.cancelSubscription({
      subscriptionId: currentSubscription.stripeSubscriptionId,
      ...req.body,
    });

    res.json({
      success: true,
      data: canceledSubscription,
    });

  } catch (error) {
    logger.error('Failed to cancel subscription', { error, userId: req.user?.userId });
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel subscription',
    });
  }
});

/**
 * Reactivate subscription
 */
router.post('/subscription/reactivate', async (req, res) => {
  try {
    const { userId } = req.user!;
    const currentSubscription = await SubscriptionService.getSubscription(userId);

    if (!currentSubscription?.stripeSubscriptionId) {
      return res.status(400).json({
        success: false,
        error: 'No subscription found',
      });
    }

    const reactivatedSubscription = await SubscriptionService.reactivateSubscription(
      currentSubscription.stripeSubscriptionId
    );

    res.json({
      success: true,
      data: reactivatedSubscription,
    });

  } catch (error) {
    logger.error('Failed to reactivate subscription', { error, userId: req.user?.userId });
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reactivate subscription',
    });
  }
});

// =============================================================================
// PAYMENT METHODS
// =============================================================================

/**
 * Create setup intent for adding payment method
 */
router.post('/payment-methods/setup-intent', async (req, res) => {
  try {
    const { userId, email } = req.user!;

    // Get or create Stripe customer
    const customers = await stripe.customers.list({
      email,
      limit: 1,
    });

    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email,
        metadata: { userId },
      });
      customerId = customer.id;
    }

    const setupIntent = await createSetupIntent(customerId, { userId });

    res.json({
      success: true,
      data: {
        clientSecret: setupIntent.client_secret,
        customerId,
      },
    });

  } catch (error) {
    logger.error('Failed to create setup intent', { error, userId: req.user?.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to create setup intent',
    });
  }
});

/**
 * Get payment methods
 */
router.get('/payment-methods', async (req, res) => {
  try {
    const { userId } = req.user!;

    const paymentMethods = await prisma.paymentMethod.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: paymentMethods,
    });

  } catch (error) {
    logger.error('Failed to get payment methods', { error, userId: req.user?.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve payment methods',
    });
  }
});

/**
 * Set default payment method
 */
const setDefaultPaymentMethodSchema = z.object({
  paymentMethodId: z.string(),
});

router.post('/payment-methods/default', validateRequest(setDefaultPaymentMethodSchema), async (req, res) => {
  try {
    const { userId } = req.user!;
    const { paymentMethodId } = req.body;

    // Update all payment methods to not default
    await prisma.paymentMethod.updateMany({
      where: { userId },
      data: { isDefault: false },
    });

    // Set the selected one as default
    await prisma.paymentMethod.update({
      where: { 
        userId,
        stripePaymentMethodId: paymentMethodId,
      },
      data: { isDefault: true },
    });

    // Update default payment method in Stripe subscription if exists
    const subscription = await SubscriptionService.getSubscription(userId);
    if (subscription?.stripeSubscriptionId) {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        default_payment_method: paymentMethodId,
      });
    }

    res.json({
      success: true,
      message: 'Default payment method updated',
    });

  } catch (error) {
    logger.error('Failed to set default payment method', { error, userId: req.user?.userId });
    res.status(400).json({
      success: false,
      error: 'Failed to set default payment method',
    });
  }
});

/**
 * Remove payment method
 */
const removePaymentMethodSchema = z.object({
  paymentMethodId: z.string(),
});

router.delete('/payment-methods', validateRequest(removePaymentMethodSchema), async (req, res) => {
  try {
    const { userId } = req.user!;
    const { paymentMethodId } = req.body;

    // Detach from Stripe
    await stripe.paymentMethods.detach(paymentMethodId);

    // Remove from database
    await prisma.paymentMethod.deleteMany({
      where: {
        userId,
        stripePaymentMethodId: paymentMethodId,
      },
    });

    res.json({
      success: true,
      message: 'Payment method removed',
    });

  } catch (error) {
    logger.error('Failed to remove payment method', { error, userId: req.user?.userId });
    res.status(400).json({
      success: false,
      error: 'Failed to remove payment method',
    });
  }
});

// =============================================================================
// INVOICES
// =============================================================================

/**
 * Get invoices
 */
router.get('/invoices', async (req, res) => {
  try {
    const { userId } = req.user!;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const invoices = await prisma.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await prisma.invoice.count({
      where: { userId },
    });

    res.json({
      success: true,
      data: {
        invoices,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      },
    });

  } catch (error) {
    logger.error('Failed to get invoices', { error, userId: req.user?.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve invoices',
    });
  }
});

/**
 * Get specific invoice
 */
router.get('/invoices/:invoiceId', async (req, res) => {
  try {
    const { userId } = req.user!;
    const { invoiceId } = req.params;

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        userId,
      },
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found',
      });
    }

    // Get Stripe invoice for additional details
    const stripeInvoice = await stripe.invoices.retrieve(invoice.stripeInvoiceId);

    res.json({
      success: true,
      data: {
        ...invoice,
        stripeData: stripeInvoice,
      },
    });

  } catch (error) {
    logger.error('Failed to get invoice', { error, userId: req.user?.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve invoice',
    });
  }
});

/**
 * Get upcoming invoice preview
 */
router.get('/invoices/upcoming/preview', async (req, res) => {
  try {
    const { userId } = req.user!;
    const subscription = await SubscriptionService.getSubscription(userId);

    if (!subscription?.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        error: 'No subscription found',
      });
    }

    const upcomingInvoice = await getUpcomingInvoice(
      subscription.stripeCustomerId,
      subscription.stripeSubscriptionId
    );

    res.json({
      success: true,
      data: upcomingInvoice,
    });

  } catch (error) {
    logger.error('Failed to get upcoming invoice', { error, userId: req.user?.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve upcoming invoice',
    });
  }
});

/**
 * Download invoice PDF
 */
router.get('/invoices/:invoiceId/download', async (req, res) => {
  try {
    const { userId } = req.user!;
    const { invoiceId } = req.params;

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        userId,
      },
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found',
      });
    }

    // Get invoice PDF from Stripe
    const stripeInvoice = await stripe.invoices.retrieve(invoice.stripeInvoiceId);
    
    if (!stripeInvoice.invoice_pdf) {
      return res.status(400).json({
        success: false,
        error: 'Invoice PDF not available',
      });
    }

    res.redirect(stripeInvoice.invoice_pdf);

  } catch (error) {
    logger.error('Failed to download invoice', { error, userId: req.user?.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to download invoice',
    });
  }
});

// =============================================================================
// USAGE
// =============================================================================

/**
 * Get usage for current period
 */
router.get('/usage/current', async (req, res) => {
  try {
    const { userId } = req.user!;

    const usage = await UsageService.getCurrentPeriodUsage(userId);

    res.json({
      success: true,
      data: usage,
    });

  } catch (error) {
    logger.error('Failed to get current usage', { error, userId: req.user?.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve usage information',
    });
  }
});

/**
 * Get usage for specific period
 */
const getUsageSchema = z.object({
  startDate: z.string().transform(str => new Date(str)),
  endDate: z.string().transform(str => new Date(str)),
});

router.get('/usage/period', validateRequest(getUsageSchema, 'query'), async (req, res) => {
  try {
    const { userId } = req.user!;
    const { startDate, endDate } = req.query as any;

    const usage = await UsageService.getUsageForPeriod(userId, startDate, endDate);

    res.json({
      success: true,
      data: usage,
    });

  } catch (error) {
    logger.error('Failed to get usage for period', { error, userId: req.user?.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve usage information',
    });
  }
});

/**
 * Get overage charges
 */
router.get('/usage/overages', validateRequest(getUsageSchema, 'query'), async (req, res) => {
  try {
    const { userId } = req.user!;
    const { startDate, endDate } = req.query as any;

    const overages = await UsageService.calculateOverageCharges(userId, startDate, endDate);

    res.json({
      success: true,
      data: overages,
    });

  } catch (error) {
    logger.error('Failed to get overage charges', { error, userId: req.user?.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve overage information',
    });
  }
});

// =============================================================================
// NOTIFICATIONS
// =============================================================================

/**
 * Get notification preferences
 */
router.get('/notifications/preferences', async (req, res) => {
  try {
    const { userId } = req.user!;

    const preferences = await NotificationService.getNotificationPreferences(userId);

    res.json({
      success: true,
      data: preferences,
    });

  } catch (error) {
    logger.error('Failed to get notification preferences', { error, userId: req.user?.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve notification preferences',
    });
  }
});

/**
 * Update notification preferences
 */
const updateNotificationPreferencesSchema = z.object({
  emailEnabled: z.boolean().optional(),
  browserEnabled: z.boolean().optional(),
  webhookEnabled: z.boolean().optional(),
  webhookUrl: z.string().url().optional(),
  analysisComplete: z.boolean().optional(),
  documentChanges: z.boolean().optional(),
  highRiskFindings: z.boolean().optional(),
  weeklySummary: z.boolean().optional(),
  marketingEmails: z.boolean().optional(),
});

router.put('/notifications/preferences', validateRequest(updateNotificationPreferencesSchema), async (req, res) => {
  try {
    const { userId } = req.user!;

    const preferences = await NotificationService.updateNotificationPreferences(userId, req.body);

    res.json({
      success: true,
      data: preferences,
    });

  } catch (error) {
    logger.error('Failed to update notification preferences', { error, userId: req.user?.userId });
    res.status(400).json({
      success: false,
      error: 'Failed to update notification preferences',
    });
  }
});

/**
 * Get notifications
 */
router.get('/notifications', async (req, res) => {
  try {
    const { userId } = req.user!;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const unreadOnly = req.query.unread === 'true';

    const notifications = await NotificationService.getUserNotifications(
      userId,
      limit,
      offset,
      unreadOnly
    );

    res.json({
      success: true,
      data: notifications,
    });

  } catch (error) {
    logger.error('Failed to get notifications', { error, userId: req.user?.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve notifications',
    });
  }
});

/**
 * Mark notification as read
 */
router.post('/notifications/:notificationId/read', async (req, res) => {
  try {
    const { notificationId } = req.params;

    await NotificationService.markNotificationAsRead(notificationId);

    res.json({
      success: true,
      message: 'Notification marked as read',
    });

  } catch (error) {
    logger.error('Failed to mark notification as read', { error, notificationId: req.params.notificationId });
    res.status(400).json({
      success: false,
      error: 'Failed to mark notification as read',
    });
  }
});

export default router;