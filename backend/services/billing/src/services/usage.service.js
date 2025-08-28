"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsageService = void 0;
const client_1 = require("@prisma/client");
const stripe_1 = require("../lib/stripe");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const billing_1 = require("../models/billing");
const luxon_1 = require("luxon");
const prisma = new client_1.PrismaClient();
class UsageService {
    static async recordUsage(params) {
        try {
            const { userId, metricType, quantity, metadata, timestamp = new Date() } = params;
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
            const periodEnd = user.subscriptionExpiresAt
                ? luxon_1.DateTime.fromJSDate(user.subscriptionExpiresAt)
                : luxon_1.DateTime.now().endOf('month');
            const periodStart = periodEnd.minus({ month: 1 });
            const usageRecord = await billing_1.BillingModel.recordUsage({
                userId,
                subscriptionId: user.subscriptionId || undefined,
                metricType,
                quantity,
                unit: this.getMetricUnit(metricType),
                periodStart: periodStart.toJSDate(),
                periodEnd: periodEnd.toJSDate(),
                metadata,
            });
            if (user.subscriptionId && user.subscriptionTier !== 'free') {
                await this.reportUsageToStripe(user.subscriptionId, metricType, quantity, timestamp);
            }
            logger_1.logger.info('Usage recorded successfully', {
                userId,
                metricType,
                quantity,
                subscriptionTier: user.subscriptionTier,
            });
            return usageRecord;
        }
        catch (error) {
            logger_1.logger.error('Failed to record usage', { error, params });
            throw error;
        }
    }
    static async getCurrentPeriodUsage(userId) {
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
            const periodEnd = user.subscriptionExpiresAt
                ? luxon_1.DateTime.fromJSDate(user.subscriptionExpiresAt)
                : luxon_1.DateTime.now().endOf('month');
            const periodStart = periodEnd.minus({ month: 1 });
            return this.getUsageForPeriod(userId, periodStart.toJSDate(), periodEnd.toJSDate());
        }
        catch (error) {
            logger_1.logger.error('Failed to get current period usage', { error, userId });
            throw error;
        }
    }
    static async getUsageForPeriod(userId, periodStart, periodEnd) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { subscriptionTier: true },
            });
            if (!user) {
                throw new Error('User not found');
            }
            const metrics = {};
            let totalOverageCost = 0;
            for (const metricType of Object.values(billing_1.UsageMetricType)) {
                const usage = await billing_1.BillingModel.getUsageForPeriod(userId, metricType, periodStart, periodEnd);
                const quantity = Number(usage._sum.quantity || 0);
                const limit = this.getMetricLimit(user.subscriptionTier, metricType);
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
        }
        catch (error) {
            logger_1.logger.error('Failed to get usage for period', { error, userId, periodStart, periodEnd });
            throw error;
        }
    }
    static async calculateOverageCharges(userId, periodStart, periodEnd) {
        try {
            const usage = await this.getUsageForPeriod(userId, periodStart, periodEnd);
            const overages = [];
            for (const [metricType, data] of Object.entries(usage.metrics)) {
                if (data.overage > 0) {
                    overages.push({
                        metricType: metricType,
                        allowedQuantity: data.limit,
                        usedQuantity: data.quantity,
                        overageQuantity: data.overage,
                        overageCost: data.cost,
                        currency: usage.currency,
                    });
                }
            }
            return overages;
        }
        catch (error) {
            logger_1.logger.error('Failed to calculate overage charges', { error, userId, periodStart, periodEnd });
            throw error;
        }
    }
    static async processOverageBilling(subscriptionId) {
        try {
            const subscription = await billing_1.BillingModel.getSubscriptionByStripeId(subscriptionId);
            if (!subscription) {
                throw new Error('Subscription not found');
            }
            const periodEnd = luxon_1.DateTime.fromJSDate(subscription.currentPeriodEnd);
            const periodStart = luxon_1.DateTime.fromJSDate(subscription.currentPeriodStart);
            const overages = await this.calculateOverageCharges(subscription.userId, periodStart.toJSDate(), periodEnd.toJSDate());
            if (overages.length === 0) {
                logger_1.logger.info('No overages to bill', { subscriptionId, userId: subscription.userId });
                return;
            }
            const stripeCustomer = await stripe_1.stripe.customers.retrieve(subscription.stripeCustomerId);
            for (const overage of overages) {
                await stripe_1.stripe.invoiceItems.create({
                    customer: subscription.stripeCustomerId,
                    amount: Math.round(overage.overageCost * 100),
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
            logger_1.logger.info('Overage billing processed successfully', {
                subscriptionId,
                userId: subscription.userId,
                overageCount: overages.length,
                totalCost: overages.reduce((sum, o) => sum + o.overageCost, 0),
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to process overage billing', { error, subscriptionId });
            throw error;
        }
    }
    static async reportUsageToStripe(subscriptionId, metricType, quantity, timestamp) {
        try {
            const stripeSubscription = await stripe_1.stripe.subscriptions.retrieve(subscriptionId, {
                expand: ['items'],
            });
            const subscriptionItem = stripeSubscription.items.data.find(item => {
                const price = item.price;
                return price.metadata?.metricType === metricType;
            });
            if (!subscriptionItem) {
                logger_1.logger.warn('No subscription item found for metric type', {
                    subscriptionId,
                    metricType
                });
                return;
            }
            await (0, stripe_1.createUsageRecord)(subscriptionItem.id, quantity, Math.floor(timestamp.getTime() / 1000));
            logger_1.logger.debug('Usage reported to Stripe', {
                subscriptionId,
                subscriptionItemId: subscriptionItem.id,
                metricType,
                quantity,
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to report usage to Stripe', {
                error,
                subscriptionId,
                metricType,
                quantity,
            });
        }
    }
    static getMetricUnit(metricType) {
        switch (metricType) {
            case billing_1.UsageMetricType.ANALYSES:
                return 'analyses';
            case billing_1.UsageMetricType.API_CALLS:
                return 'calls';
            case billing_1.UsageMetricType.MONITORED_DOCUMENTS:
                return 'documents';
            case billing_1.UsageMetricType.TEAM_MEMBERS:
                return 'members';
            default:
                return 'units';
        }
    }
    static getMetricDisplayName(metricType) {
        switch (metricType) {
            case billing_1.UsageMetricType.ANALYSES:
                return 'Document Analysis';
            case billing_1.UsageMetricType.API_CALLS:
                return 'API Calls';
            case billing_1.UsageMetricType.MONITORED_DOCUMENTS:
                return 'Monitored Documents';
            case billing_1.UsageMetricType.TEAM_MEMBERS:
                return 'Team Members';
            default:
                return 'Usage';
        }
    }
    static getMetricLimit(tier, metricType) {
        const { PRICING_TIERS } = require('../config');
        const tierConfig = PRICING_TIERS[tier];
        if (!tierConfig)
            return 0;
        switch (metricType) {
            case billing_1.UsageMetricType.ANALYSES:
                return tierConfig.features.analysesPerMonth;
            case billing_1.UsageMetricType.API_CALLS:
                return typeof tierConfig.features.apiAccess === 'number' ? tierConfig.features.apiAccess : -1;
            case billing_1.UsageMetricType.MONITORED_DOCUMENTS:
                return typeof tierConfig.features.monitoring === 'number' ? tierConfig.features.monitoring : -1;
            case billing_1.UsageMetricType.TEAM_MEMBERS:
                return tierConfig.features.teamMembers;
            default:
                return -1;
        }
    }
    static getOverageCost(metricType) {
        switch (metricType) {
            case billing_1.UsageMetricType.ANALYSES:
                return config_1.USAGE_COSTS.analysisOverage;
            case billing_1.UsageMetricType.API_CALLS:
                return config_1.USAGE_COSTS.apiOverage;
            case billing_1.UsageMetricType.MONITORED_DOCUMENTS:
                return 1.00;
            case billing_1.UsageMetricType.TEAM_MEMBERS:
                return 10.00;
            default:
                return 0;
        }
    }
    static async recordBulkUsage(userId, usages, timestamp) {
        try {
            const records = [];
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
        }
        catch (error) {
            logger_1.logger.error('Failed to record bulk usage', { error, userId, usageCount: usages.length });
            throw error;
        }
    }
    static async getUsageAnalytics(startDate, endDate, metricType) {
        try {
            const whereClause = {
                createdAt: {
                    gte: startDate,
                    lte: endDate,
                },
            };
            if (metricType) {
                whereClause.metricType = metricType;
            }
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
                prisma.$queryRaw `
          SELECT DATE(created_at) as date, SUM(quantity) as usage
          FROM usage_records
          WHERE created_at >= ${startDate} AND created_at <= ${endDate}
          ${metricType ? prisma.$queryRaw `AND metric_type = ${metricType}` : prisma.$queryRaw ``}
          GROUP BY DATE(created_at)
          ORDER BY date
        `,
            ]);
            const usageByTier = {};
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
                dailyUsage: dailyUsage.map(row => ({
                    date: row.date,
                    usage: Number(row.usage),
                })),
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get usage analytics', { error, startDate, endDate, metricType });
            throw error;
        }
    }
}
exports.UsageService = UsageService;
exports.default = UsageService;
//# sourceMappingURL=usage.service.js.map