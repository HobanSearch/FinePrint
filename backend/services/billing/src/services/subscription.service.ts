import { PrismaClient, SubscriptionTier } from '@prisma/client';
import { stripe, getOrCreateStripeCustomer } from '../lib/stripe';
import { PRICING_TIERS } from '../config';
import { logger } from '../utils/logger';
import { BillingModel, Subscription, SubscriptionStatus } from '../models/billing';
import { DateTime } from 'luxon';
import Stripe from 'stripe';

const prisma = new PrismaClient();

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

export class SubscriptionService {
  /**
   * Create a new subscription
   */
  static async createSubscription(params: CreateSubscriptionParams): Promise<{
    subscription: Subscription;
    clientSecret?: string;
  }> {
    try {
      const { userId, email, tier, paymentMethodId, trialDays, couponCode, metadata } = params;

      // Validate tier
      const pricingTier = PRICING_TIERS[tier];
      if (!pricingTier) {
        throw new Error(`Invalid subscription tier: ${tier}`);
      }

      // Free tier doesn't require Stripe subscription
      if (tier === 'free') {
        const user = await prisma.user.update({
          where: { id: userId },
          data: { 
            subscriptionTier: tier,
            trialEndsAt: null,
            subscriptionExpiresAt: null,
            subscriptionId: null,
          },
        });

        return {
          subscription: {
            id: userId,
            userId,
            stripeSubscriptionId: '',
            stripeCustomerId: '',
            stripePriceId: '',
            tier,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)), // 1 year
            metadata,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as Subscription,
        };
      }

      // Create or get Stripe customer
      const customer = await getOrCreateStripeCustomer(
        userId,
        email,
        undefined,
        { tier, ...metadata }
      );

      // Create subscription parameters
      const subscriptionParams: Stripe.SubscriptionCreateParams = {
        customer: customer.id,
        items: [{ price: pricingTier.stripePriceId! }],
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          userId,
          tier,
          ...metadata,
        },
      };

      // Add payment method if provided
      if (paymentMethodId) {
        subscriptionParams.default_payment_method = paymentMethodId;
      }

      // Add trial period
      if (trialDays && trialDays > 0) {
        subscriptionParams.trial_period_days = trialDays;
      }

      // Add coupon if provided
      if (couponCode) {
        subscriptionParams.coupon = couponCode;
      }

      // Create Stripe subscription
      const stripeSubscription = await stripe.subscriptions.create(subscriptionParams);

      // Save subscription to database
      const subscription = await BillingModel.createSubscription({
        userId,
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId: customer.id,
        stripePriceId: pricingTier.stripePriceId!,
        tier,
        status: stripeSubscription.status as SubscriptionStatus,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        trialStart: stripeSubscription.trial_start 
          ? new Date(stripeSubscription.trial_start * 1000) 
          : undefined,
        trialEnd: stripeSubscription.trial_end 
          ? new Date(stripeSubscription.trial_end * 1000) 
          : undefined,
        metadata,
      });

      // Update user subscription info
      await prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionTier: tier,
          subscriptionId: stripeSubscription.id,
          trialEndsAt: stripeSubscription.trial_end 
            ? new Date(stripeSubscription.trial_end * 1000) 
            : null,
          subscriptionExpiresAt: new Date(stripeSubscription.current_period_end * 1000),
        },
      });

      logger.info('Subscription created successfully', {
        userId,
        subscriptionId: stripeSubscription.id,
        tier,
        status: stripeSubscription.status,
      });

      // Extract client secret if payment intent exists
      let clientSecret: string | undefined;
      if (stripeSubscription.latest_invoice && 
          typeof stripeSubscription.latest_invoice === 'object' &&
          stripeSubscription.latest_invoice.payment_intent &&
          typeof stripeSubscription.latest_invoice.payment_intent === 'object') {
        clientSecret = stripeSubscription.latest_invoice.payment_intent.client_secret!;
      }

      return {
        subscription: subscription as Subscription,
        clientSecret,
      };

    } catch (error) {
      logger.error('Failed to create subscription', { error, params });
      throw error;
    }
  }

  /**
   * Update an existing subscription
   */
  static async updateSubscription(params: UpdateSubscriptionParams): Promise<Subscription> {
    try {
      const { subscriptionId, tier, paymentMethodId, couponCode, prorationBehavior = 'create_prorations' } = params;

      // Get existing subscription
      const existingSubscription = await BillingModel.getSubscriptionByStripeId(subscriptionId);
      if (!existingSubscription) {
        throw new Error('Subscription not found');
      }

      const updateParams: Stripe.SubscriptionUpdateParams = {
        proration_behavior: prorationBehavior,
      };

      // Update tier if provided
      if (tier && tier !== existingSubscription.tier) {
        const pricingTier = PRICING_TIERS[tier];
        if (!pricingTier || !pricingTier.stripePriceId) {
          throw new Error(`Invalid subscription tier: ${tier}`);
        }

        updateParams.items = [{
          id: (await stripe.subscriptions.retrieve(subscriptionId)).items.data[0].id,
          price: pricingTier.stripePriceId,
        }];

        updateParams.metadata = {
          ...updateParams.metadata,
          tier,
        };
      }

      // Update payment method if provided
      if (paymentMethodId) {
        updateParams.default_payment_method = paymentMethodId;
      }

      // Add coupon if provided
      if (couponCode) {
        updateParams.coupon = couponCode;
      }

      // Update Stripe subscription
      const stripeSubscription = await stripe.subscriptions.update(subscriptionId, updateParams);

      // Update database record
      const updatedSubscription = await BillingModel.updateSubscription(existingSubscription.id, {
        tier: tier || existingSubscription.tier,
        status: stripeSubscription.status as SubscriptionStatus,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      });

      // Update user record
      if (tier) {
        await prisma.user.update({
          where: { id: existingSubscription.userId },
          data: {
            subscriptionTier: tier,
            subscriptionExpiresAt: new Date(stripeSubscription.current_period_end * 1000),
          },
        });
      }

      logger.info('Subscription updated successfully', {
        subscriptionId,
        userId: existingSubscription.userId,
        newTier: tier,
        status: stripeSubscription.status,
      });

      return updatedSubscription as Subscription;

    } catch (error) {
      logger.error('Failed to update subscription', { error, params });
      throw error;
    }
  }

  /**
   * Cancel a subscription
   */
  static async cancelSubscription(params: CancelSubscriptionParams): Promise<Subscription> {
    try {
      const { subscriptionId, cancelAtPeriodEnd = true, cancellationReason } = params;

      // Get existing subscription
      const existingSubscription = await BillingModel.getSubscriptionByStripeId(subscriptionId);
      if (!existingSubscription) {
        throw new Error('Subscription not found');
      }

      let stripeSubscription: Stripe.Subscription;

      if (cancelAtPeriodEnd) {
        // Cancel at period end
        stripeSubscription = await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
          metadata: {
            cancellation_reason: cancellationReason || 'user_requested',
          },
        });
      } else {
        // Cancel immediately
        stripeSubscription = await stripe.subscriptions.cancel(subscriptionId, {
          prorate: true,
        });
      }

      // Update database record
      const updatedSubscription = await BillingModel.updateSubscription(existingSubscription.id, {
        status: stripeSubscription.status as SubscriptionStatus,
        canceledAt: cancelAtPeriodEnd ? undefined : new Date(),
      });

      // Update user record if canceled immediately
      if (!cancelAtPeriodEnd) {
        await prisma.user.update({
          where: { id: existingSubscription.userId },
          data: {
            subscriptionTier: 'free',
            subscriptionId: null,
            subscriptionExpiresAt: null,
          },
        });
      }

      logger.info('Subscription canceled successfully', {
        subscriptionId,
        userId: existingSubscription.userId,
        cancelAtPeriodEnd,
        cancellationReason,
      });

      return updatedSubscription as Subscription;

    } catch (error) {
      logger.error('Failed to cancel subscription', { error, params });
      throw error;
    }
  }

  /**
   * Reactivate a canceled subscription
   */
  static async reactivateSubscription(subscriptionId: string): Promise<Subscription> {
    try {
      // Get existing subscription
      const existingSubscription = await BillingModel.getSubscriptionByStripeId(subscriptionId);
      if (!existingSubscription) {
        throw new Error('Subscription not found');
      }

      // Reactivate in Stripe
      const stripeSubscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });

      // Update database record
      const updatedSubscription = await BillingModel.updateSubscription(existingSubscription.id, {
        status: stripeSubscription.status as SubscriptionStatus,
        canceledAt: undefined,
      });

      logger.info('Subscription reactivated successfully', {
        subscriptionId,
        userId: existingSubscription.userId,
      });

      return updatedSubscription as Subscription;

    } catch (error) {
      logger.error('Failed to reactivate subscription', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Get subscription details
   */
  static async getSubscription(userId: string): Promise<Subscription | null> {
    try {
      const subscription = await BillingModel.getSubscriptionByUserId(userId);
      return subscription as Subscription | null;
    } catch (error) {
      logger.error('Failed to get subscription', { error, userId });
      throw error;
    }
  }

  /**
   * Get subscription usage for current period
   */
  static async getSubscriptionUsage(userId: string): Promise<{
    analyses: number;
    apiCalls: number;
    monitoredDocuments: number;
    limits: {
      analyses: number;
      apiCalls: number;
      monitoredDocuments: number;
    };
  }> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionTier: true, subscriptionExpiresAt: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const tier = PRICING_TIERS[user.subscriptionTier];
      const periodStart = user.subscriptionExpiresAt 
        ? DateTime.fromJSDate(user.subscriptionExpiresAt).minus({ month: 1 }).toJSDate()
        : DateTime.now().startOf('month').toJSDate();
      const periodEnd = user.subscriptionExpiresAt || DateTime.now().endOf('month').toJSDate();

      // Get usage for current period
      const [analysesUsage, apiCallsUsage, documentsCount] = await Promise.all([
        BillingModel.getUsageForPeriod(userId, 'analyses' as any, periodStart, periodEnd),
        BillingModel.getUsageForPeriod(userId, 'api_calls' as any, periodStart, periodEnd),
        prisma.document.count({
          where: {
            userId,
            monitoringEnabled: true,
            deletedAt: null,
          },
        }),
      ]);

      return {
        analyses: Number(analysesUsage._sum.quantity || 0),
        apiCalls: Number(apiCallsUsage._sum.quantity || 0),
        monitoredDocuments: documentsCount,
        limits: {
          analyses: tier.features.analysesPerMonth,
          apiCalls: typeof tier.features.apiAccess === 'number' ? tier.features.apiAccess : -1,
          monitoredDocuments: typeof tier.features.monitoring === 'number' ? tier.features.monitoring : -1,
        },
      };

    } catch (error) {
      logger.error('Failed to get subscription usage', { error, userId });
      throw error;
    }
  }

  /**
   * Check if user can perform action based on subscription limits
   */
  static async canPerformAction(
    userId: string, 
    action: 'analysis' | 'api_call' | 'monitor_document'
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const usage = await this.getSubscriptionUsage(userId);

      switch (action) {
        case 'analysis':
          if (usage.limits.analyses === -1) return { allowed: true };
          if (usage.analyses >= usage.limits.analyses) {
            return { 
              allowed: false, 
              reason: `Monthly analysis limit of ${usage.limits.analyses} reached. Upgrade your plan or wait for next billing cycle.`
            };
          }
          break;

        case 'api_call':
          if (usage.limits.apiCalls === -1) return { allowed: true };
          if (usage.limits.apiCalls === 0) {
            return { 
              allowed: false, 
              reason: 'API access not included in your plan. Upgrade to Professional or higher.'
            };
          }
          if (usage.apiCalls >= usage.limits.apiCalls) {
            return { 
              allowed: false, 
              reason: `Monthly API limit of ${usage.limits.apiCalls} calls reached. Upgrade your plan or wait for next billing cycle.`
            };
          }
          break;

        case 'monitor_document':
          if (usage.limits.monitoredDocuments === -1) return { allowed: true };
          if (usage.limits.monitoredDocuments === 0) {
            return { 
              allowed: false, 
              reason: 'Document monitoring not included in your plan. Upgrade to Starter or higher.'
            };
          }
          if (usage.monitoredDocuments >= usage.limits.monitoredDocuments) {
            return { 
              allowed: false, 
              reason: `Document monitoring limit of ${usage.limits.monitoredDocuments} reached. Upgrade your plan for more capacity.`
            };
          }
          break;
      }

      return { allowed: true };

    } catch (error) {
      logger.error('Failed to check action permission', { error, userId, action });
      return { 
        allowed: false, 
        reason: 'Unable to verify subscription limits. Please try again.'
      };
    }
  }
}

export default SubscriptionService;