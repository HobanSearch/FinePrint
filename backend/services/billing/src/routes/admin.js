"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const rate_limit_1 = require("../middleware/rate-limit");
const subscription_service_1 = require("../services/subscription.service");
const usage_service_1 = require("../services/usage.service");
const revenue_service_1 = require("../services/revenue.service");
const refunds_service_1 = require("../services/refunds.service");
const dunning_service_1 = require("../services/dunning.service");
const tax_service_1 = require("../services/tax.service");
const webhook_service_1 = require("../services/webhook.service");
const logger_1 = require("../utils/logger");
const luxon_1 = require("luxon");
const router = express_1.default.Router();
const prisma = new client_1.PrismaClient();
router.use(auth_1.authMiddleware);
router.use(auth_1.adminMiddleware);
const adminRateLimit = (0, rate_limit_1.createCustomRateLimit)({
    prefix: 'admin',
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: 'Admin rate limit exceeded',
});
router.use(adminRateLimit);
router.get('/dashboard', async (req, res) => {
    try {
        const now = luxon_1.DateTime.now();
        const thirtyDaysAgo = now.minus({ days: 30 });
        const previousMonth = now.minus({ months: 1 });
        const [totalUsers, activeSubscriptions, monthlyRevenue, failedPayments, pendingRefunds, activeDunningCampaigns,] = await Promise.all([
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
        const subscriptionDistribution = await prisma.user.groupBy({
            by: ['subscriptionTier'],
            _count: { id: true },
        });
        const recentInvoices = await prisma.invoice.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: { email: true, displayName: true },
                },
            },
        });
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
                }, {}),
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
    }
    catch (error) {
        logger_1.logger.error('Failed to get dashboard overview', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve dashboard data',
        });
    }
});
router.get('/users', validation_1.validateCommonParams, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const search = req.query.search;
        const tier = req.query.tier;
        const status = req.query.status;
        const whereClause = {};
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
        const usersWithUsage = await Promise.all(users.map(async (user) => {
            const usage = await subscription_service_1.SubscriptionService.getSubscriptionUsage(user.id);
            return {
                ...user,
                usage,
            };
        }));
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
    }
    catch (error) {
        logger_1.logger.error('Failed to get users', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve users',
        });
    }
});
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
            subscription_service_1.SubscriptionService.getSubscriptionUsage(userId),
            dunning_service_1.DunningService.getUserDunningCampaigns(userId),
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
    }
    catch (error) {
        logger_1.logger.error('Failed to get user details', { error, userId: req.params.userId });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve user details',
        });
    }
});
const updateUserSubscriptionSchema = zod_1.z.object({
    tier: zod_1.z.enum(['free', 'starter', 'professional', 'team', 'enterprise']),
    reason: zod_1.z.string().optional(),
});
router.put('/users/:userId/subscription', (0, validation_1.validateRequest)(updateUserSubscriptionSchema), async (req, res) => {
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
            await prisma.user.update({
                where: { id: userId },
                data: {
                    subscriptionTier: tier,
                    subscriptionId: null,
                    subscriptionExpiresAt: null,
                },
            });
            if (user.subscriptionId) {
                await subscription_service_1.SubscriptionService.cancelSubscription({
                    subscriptionId: user.subscriptionId,
                    cancelAtPeriodEnd: false,
                    cancellationReason: reason || 'Admin action',
                });
            }
        }
        else if (user.subscriptionId) {
            await subscription_service_1.SubscriptionService.updateSubscription({
                subscriptionId: user.subscriptionId,
                tier: tier,
            });
        }
        else {
            return res.status(400).json({
                success: false,
                error: 'Cannot upgrade user without payment method. User must subscribe through normal flow.',
            });
        }
        await prisma.auditLog.create({
            data: {
                userId: req.user.userId,
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
    }
    catch (error) {
        logger_1.logger.error('Failed to update user subscription', { error, userId: req.params.userId });
        res.status(500).json({
            success: false,
            error: 'Failed to update subscription',
        });
    }
});
const getRevenueReportSchema = zod_1.z.object({
    startDate: zod_1.z.string().transform(str => new Date(str)),
    endDate: zod_1.z.string().transform(str => new Date(str)),
    includeCohorts: zod_1.z.string().optional().transform(str => str === 'true'),
    includeProjections: zod_1.z.string().optional().transform(str => str === 'true'),
});
router.get('/revenue/report', (0, validation_1.validateRequest)(getRevenueReportSchema, 'query'), async (req, res) => {
    try {
        const { startDate, endDate, includeCohorts, includeProjections } = req.query;
        const report = await revenue_service_1.RevenueService.generateRevenueReport(startDate, endDate, {
            includeCohorts,
            includeProjections,
        });
        res.json({
            success: true,
            data: report,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to generate revenue report', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to generate revenue report',
        });
    }
});
router.get('/revenue/arr', async (req, res) => {
    try {
        const metrics = await revenue_service_1.RevenueService.calculateARRMetrics();
        res.json({
            success: true,
            data: metrics,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get ARR metrics', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve ARR metrics',
        });
    }
});
router.get('/revenue/forecast', async (req, res) => {
    try {
        const months = parseInt(req.query.months) || 12;
        const forecast = await revenue_service_1.RevenueService.getRevenueForecast(months);
        res.json({
            success: true,
            data: forecast,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get revenue forecast', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to generate revenue forecast',
        });
    }
});
router.get('/usage/analytics', (0, validation_1.validateRequest)(getRevenueReportSchema, 'query'), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const metricType = req.query.metricType;
        const analytics = await usage_service_1.UsageService.getUsageAnalytics(startDate, endDate, metricType);
        res.json({
            success: true,
            data: analytics,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get usage analytics', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve usage analytics',
        });
    }
});
router.get('/refunds/analytics', (0, validation_1.validateRequest)(getRevenueReportSchema, 'query'), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const analytics = await refunds_service_1.RefundsService.getRefundAnalytics(startDate, endDate);
        res.json({
            success: true,
            data: analytics,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get refund analytics', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve refund analytics',
        });
    }
});
router.get('/chargebacks/analytics', (0, validation_1.validateRequest)(getRevenueReportSchema, 'query'), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const analytics = await refunds_service_1.RefundsService.getChargebackAnalytics(startDate, endDate);
        res.json({
            success: true,
            data: analytics,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get chargeback analytics', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve chargeback analytics',
        });
    }
});
const createRefundSchema = zod_1.z.object({
    invoiceId: zod_1.z.string(),
    amount: zod_1.z.number().positive().optional(),
    reason: zod_1.z.enum(['duplicate', 'fraudulent', 'requested_by_customer', 'expired_uncaptured_charge']),
    description: zod_1.z.string().optional(),
});
router.post('/refunds', (0, validation_1.validateRequest)(createRefundSchema), async (req, res) => {
    try {
        const refund = await refunds_service_1.RefundsService.createRefund(req.body);
        await prisma.auditLog.create({
            data: {
                userId: req.user.userId,
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
    }
    catch (error) {
        logger_1.logger.error('Failed to create refund', { error });
        res.status(400).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create refund',
        });
    }
});
router.get('/dunning/analytics', (0, validation_1.validateRequest)(getRevenueReportSchema, 'query'), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const analytics = await dunning_service_1.DunningService.getDunningAnalytics(startDate, endDate);
        res.json({
            success: true,
            data: analytics,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get dunning analytics', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve dunning analytics',
        });
    }
});
router.post('/dunning/:campaignId/pause', async (req, res) => {
    try {
        const { campaignId } = req.params;
        await dunning_service_1.DunningService.pauseDunningCampaign(campaignId);
        await prisma.auditLog.create({
            data: {
                userId: req.user.userId,
                action: 'dunning_paused',
                resourceType: 'dunning_campaign',
                resourceId: campaignId,
            },
        });
        res.json({
            success: true,
            message: 'Dunning campaign paused',
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to pause dunning campaign', { error, campaignId: req.params.campaignId });
        res.status(500).json({
            success: false,
            error: 'Failed to pause dunning campaign',
        });
    }
});
router.post('/dunning/:campaignId/resume', async (req, res) => {
    try {
        const { campaignId } = req.params;
        await dunning_service_1.DunningService.resumeDunningCampaign(campaignId);
        await prisma.auditLog.create({
            data: {
                userId: req.user.userId,
                action: 'dunning_resumed',
                resourceType: 'dunning_campaign',
                resourceId: campaignId,
            },
        });
        res.json({
            success: true,
            message: 'Dunning campaign resumed',
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to resume dunning campaign', { error, campaignId: req.params.campaignId });
        res.status(500).json({
            success: false,
            error: 'Failed to resume dunning campaign',
        });
    }
});
router.get('/tax/summary', (0, validation_1.validateRequest)(getRevenueReportSchema, 'query'), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const summary = await tax_service_1.TaxService.getTaxSummaryForPeriod(startDate, endDate);
        res.json({
            success: true,
            data: summary,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get tax summary', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve tax summary',
        });
    }
});
const generateTaxReportSchema = zod_1.z.object({
    startDate: zod_1.z.string().transform(str => new Date(str)),
    endDate: zod_1.z.string().transform(str => new Date(str)),
    jurisdiction: zod_1.z.string().optional(),
});
router.post('/tax/report', (0, validation_1.validateRequest)(generateTaxReportSchema), async (req, res) => {
    try {
        const { startDate, endDate, jurisdiction } = req.body;
        const report = await tax_service_1.TaxService.generateTaxReport(startDate, endDate, jurisdiction);
        res.json({
            success: true,
            data: report,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to generate tax report', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to generate tax report',
        });
    }
});
router.post('/webhooks/retry', async (req, res) => {
    try {
        await webhook_service_1.WebhookService.retryFailedEvents();
        res.json({
            success: true,
            message: 'Failed webhook events retried',
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to retry webhook events', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retry webhook events',
        });
    }
});
router.get('/audit-logs', validation_1.validateCommonParams, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const action = req.query.action;
        const userId = req.query.userId;
        const whereClause = {};
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
    }
    catch (error) {
        logger_1.logger.error('Failed to get audit logs', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve audit logs',
        });
    }
});
exports.default = router;
//# sourceMappingURL=admin.js.map