"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionService = void 0;
const client_1 = require("@prisma/client");
const stripe_1 = require("../lib/stripe");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const billing_1 = require("../models/billing");
const luxon_1 = require("luxon");
const prisma = new client_1.PrismaClient();
class SubscriptionService {
    static async createSubscription(params) {
        try {
            const { userId, email, tier, paymentMethodId, trialDays, couponCode, metadata } = params;
            const pricingTier = config_1.PRICING_TIERS[tier];
            if (!pricingTier) {
                throw new Error(`Invalid subscription tier: ${tier}`);
            }
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
                        status: billing_1.SubscriptionStatus.ACTIVE,
                        currentPeriodStart: new Date(),
                        currentPeriodEnd: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)),
                        metadata,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    },
                };
            }
            const customer = await (0, stripe_1.getOrCreateStripeCustomer)(userId, email, undefined, { tier, ...metadata });
            const subscriptionParams = {
                customer: customer.id,
                items: [{ price: pricingTier.stripePriceId }],
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
            if (paymentMethodId) {
                subscriptionParams.default_payment_method = paymentMethodId;
            }
            if (trialDays && trialDays > 0) {
                subscriptionParams.trial_period_days = trialDays;
            }
            if (couponCode) {
                subscriptionParams.coupon = couponCode;
            }
            const stripeSubscription = await stripe_1.stripe.subscriptions.create(subscriptionParams);
            const subscription = await billing_1.BillingModel.createSubscription({
                userId,
                stripeSubscriptionId: stripeSubscription.id,
                stripeCustomerId: customer.id,
                stripePriceId: pricingTier.stripePriceId,
                tier,
                status: stripeSubscription.status,
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
            logger_1.logger.info('Subscription created successfully', {
                userId,
                subscriptionId: stripeSubscription.id,
                tier,
                status: stripeSubscription.status,
            });
            let clientSecret;
            if (stripeSubscription.latest_invoice &&
                typeof stripeSubscription.latest_invoice === 'object' &&
                stripeSubscription.latest_invoice.payment_intent &&
                typeof stripeSubscription.latest_invoice.payment_intent === 'object') {
                clientSecret = stripeSubscription.latest_invoice.payment_intent.client_secret;
            }
            return {
                subscription: subscription,
                clientSecret,
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to create subscription', { error, params });
            throw error;
        }
    }
    static async updateSubscription(params) {
        try {
            const { subscriptionId, tier, paymentMethodId, couponCode, prorationBehavior = 'create_prorations' } = params;
            const existingSubscription = await billing_1.BillingModel.getSubscriptionByStripeId(subscriptionId);
            if (!existingSubscription) {
                throw new Error('Subscription not found');
            }
            const updateParams = {
                proration_behavior: prorationBehavior,
            };
            if (tier && tier !== existingSubscription.tier) {
                const pricingTier = config_1.PRICING_TIERS[tier];
                if (!pricingTier || !pricingTier.stripePriceId) {
                    throw new Error(`Invalid subscription tier: ${tier}`);
                }
                updateParams.items = [{
                        id: (await stripe_1.stripe.subscriptions.retrieve(subscriptionId)).items.data[0].id,
                        price: pricingTier.stripePriceId,
                    }];
                updateParams.metadata = {
                    ...updateParams.metadata,
                    tier,
                };
            }
            if (paymentMethodId) {
                updateParams.default_payment_method = paymentMethodId;
            }
            if (couponCode) {
                updateParams.coupon = couponCode;
            }
            const stripeSubscription = await stripe_1.stripe.subscriptions.update(subscriptionId, updateParams);
            const updatedSubscription = await billing_1.BillingModel.updateSubscription(existingSubscription.id, {
                tier: tier || existingSubscription.tier,
                status: stripeSubscription.status,
                currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
                currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
            });
            if (tier) {
                await prisma.user.update({
                    where: { id: existingSubscription.userId },
                    data: {
                        subscriptionTier: tier,
                        subscriptionExpiresAt: new Date(stripeSubscription.current_period_end * 1000),
                    },
                });
            }
            logger_1.logger.info('Subscription updated successfully', {
                subscriptionId,
                userId: existingSubscription.userId,
                newTier: tier,
                status: stripeSubscription.status,
            });
            return updatedSubscription;
        }
        catch (error) {
            logger_1.logger.error('Failed to update subscription', { error, params });
            throw error;
        }
    }
    static async cancelSubscription(params) {
        try {
            const { subscriptionId, cancelAtPeriodEnd = true, cancellationReason } = params;
            const existingSubscription = await billing_1.BillingModel.getSubscriptionByStripeId(subscriptionId);
            if (!existingSubscription) {
                throw new Error('Subscription not found');
            }
            let stripeSubscription;
            if (cancelAtPeriodEnd) {
                stripeSubscription = await stripe_1.stripe.subscriptions.update(subscriptionId, {
                    cancel_at_period_end: true,
                    metadata: {
                        cancellation_reason: cancellationReason || 'user_requested',
                    },
                });
            }
            else {
                stripeSubscription = await stripe_1.stripe.subscriptions.cancel(subscriptionId, {
                    prorate: true,
                });
            }
            const updatedSubscription = await billing_1.BillingModel.updateSubscription(existingSubscription.id, {
                status: stripeSubscription.status,
                canceledAt: cancelAtPeriodEnd ? undefined : new Date(),
            });
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
            logger_1.logger.info('Subscription canceled successfully', {
                subscriptionId,
                userId: existingSubscription.userId,
                cancelAtPeriodEnd,
                cancellationReason,
            });
            return updatedSubscription;
        }
        catch (error) {
            logger_1.logger.error('Failed to cancel subscription', { error, params });
            throw error;
        }
    }
    static async reactivateSubscription(subscriptionId) {
        try {
            const existingSubscription = await billing_1.BillingModel.getSubscriptionByStripeId(subscriptionId);
            if (!existingSubscription) {
                throw new Error('Subscription not found');
            }
            const stripeSubscription = await stripe_1.stripe.subscriptions.update(subscriptionId, {
                cancel_at_period_end: false,
            });
            const updatedSubscription = await billing_1.BillingModel.updateSubscription(existingSubscription.id, {
                status: stripeSubscription.status,
                canceledAt: undefined,
            });
            logger_1.logger.info('Subscription reactivated successfully', {
                subscriptionId,
                userId: existingSubscription.userId,
            });
            return updatedSubscription;
        }
        catch (error) {
            logger_1.logger.error('Failed to reactivate subscription', { error, subscriptionId });
            throw error;
        }
    }
    static async getSubscription(userId) {
        try {
            const subscription = await billing_1.BillingModel.getSubscriptionByUserId(userId);
            return subscription;
        }
        catch (error) {
            logger_1.logger.error('Failed to get subscription', { error, userId });
            throw error;
        }
    }
    static async getSubscriptionUsage(userId) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { subscriptionTier: true, subscriptionExpiresAt: true },
            });
            if (!user) {
                throw new Error('User not found');
            }
            const tier = config_1.PRICING_TIERS[user.subscriptionTier];
            const periodStart = user.subscriptionExpiresAt
                ? luxon_1.DateTime.fromJSDate(user.subscriptionExpiresAt).minus({ month: 1 }).toJSDate()
                : luxon_1.DateTime.now().startOf('month').toJSDate();
            const periodEnd = user.subscriptionExpiresAt || luxon_1.DateTime.now().endOf('month').toJSDate();
            const [analysesUsage, apiCallsUsage, documentsCount] = await Promise.all([
                billing_1.BillingModel.getUsageForPeriod(userId, 'analyses', periodStart, periodEnd),
                billing_1.BillingModel.getUsageForPeriod(userId, 'api_calls', periodStart, periodEnd),
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
        }
        catch (error) {
            logger_1.logger.error('Failed to get subscription usage', { error, userId });
            throw error;
        }
    }
    static async canPerformAction(userId, action) {
        try {
            const usage = await this.getSubscriptionUsage(userId);
            switch (action) {
                case 'analysis':
                    if (usage.limits.analyses === -1)
                        return { allowed: true };
                    if (usage.analyses >= usage.limits.analyses) {
                        return {
                            allowed: false,
                            reason: `Monthly analysis limit of ${usage.limits.analyses} reached. Upgrade your plan or wait for next billing cycle.`
                        };
                    }
                    break;
                case 'api_call':
                    if (usage.limits.apiCalls === -1)
                        return { allowed: true };
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
                    if (usage.limits.monitoredDocuments === -1)
                        return { allowed: true };
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
        }
        catch (error) {
            logger_1.logger.error('Failed to check action permission', { error, userId, action });
            return {
                allowed: false,
                reason: 'Unable to verify subscription limits. Please try again.'
            };
        }
    }
}
exports.SubscriptionService = SubscriptionService;
exports.default = SubscriptionService;
//# sourceMappingURL=subscription.service.js.map