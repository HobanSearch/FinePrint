"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const zod_1 = require("zod");
const subscription_service_1 = require("../services/subscription.service");
const usage_service_1 = require("../services/usage.service");
const notification_service_1 = require("../services/notification.service");
const stripe_1 = require("../lib/stripe");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const rate_limit_1 = require("../middleware/rate-limit");
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
const router = express_1.default.Router();
router.use(auth_1.authMiddleware);
router.use(rate_limit_1.rateLimitMiddleware);
router.get('/subscription', async (req, res) => {
    try {
        const { userId } = req.user;
        const subscription = await subscription_service_1.SubscriptionService.getSubscription(userId);
        const usage = await subscription_service_1.SubscriptionService.getSubscriptionUsage(userId);
        res.json({
            success: true,
            data: {
                subscription,
                usage,
                availableTiers: config_1.PRICING_TIERS,
            },
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get subscription', { error, userId: req.user?.userId });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve subscription information',
        });
    }
});
const createSubscriptionSchema = zod_1.z.object({
    tier: zod_1.z.enum(['free', 'starter', 'professional', 'team', 'enterprise']),
    paymentMethodId: zod_1.z.string().optional(),
    trialDays: zod_1.z.number().min(0).max(30).optional(),
    couponCode: zod_1.z.string().optional(),
});
router.post('/subscription', (0, validation_1.validateRequest)(createSubscriptionSchema), async (req, res) => {
    try {
        const { userId, email } = req.user;
        const { tier, paymentMethodId, trialDays, couponCode } = req.body;
        const result = await subscription_service_1.SubscriptionService.createSubscription({
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
    }
    catch (error) {
        logger_1.logger.error('Failed to create subscription', { error, userId: req.user?.userId });
        res.status(400).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create subscription',
        });
    }
});
const updateSubscriptionSchema = zod_1.z.object({
    tier: zod_1.z.enum(['starter', 'professional', 'team', 'enterprise']).optional(),
    paymentMethodId: zod_1.z.string().optional(),
    couponCode: zod_1.z.string().optional(),
    prorationBehavior: zod_1.z.enum(['create_prorations', 'none', 'always_invoice']).optional(),
});
router.put('/subscription', (0, validation_1.validateRequest)(updateSubscriptionSchema), async (req, res) => {
    try {
        const { userId } = req.user;
        const currentSubscription = await subscription_service_1.SubscriptionService.getSubscription(userId);
        if (!currentSubscription?.stripeSubscriptionId) {
            return res.status(400).json({
                success: false,
                error: 'No active subscription found',
            });
        }
        const updatedSubscription = await subscription_service_1.SubscriptionService.updateSubscription({
            subscriptionId: currentSubscription.stripeSubscriptionId,
            ...req.body,
        });
        res.json({
            success: true,
            data: updatedSubscription,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to update subscription', { error, userId: req.user?.userId });
        res.status(400).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update subscription',
        });
    }
});
const cancelSubscriptionSchema = zod_1.z.object({
    cancelAtPeriodEnd: zod_1.z.boolean().default(true),
    cancellationReason: zod_1.z.string().optional(),
});
router.post('/subscription/cancel', (0, validation_1.validateRequest)(cancelSubscriptionSchema), async (req, res) => {
    try {
        const { userId } = req.user;
        const currentSubscription = await subscription_service_1.SubscriptionService.getSubscription(userId);
        if (!currentSubscription?.stripeSubscriptionId) {
            return res.status(400).json({
                success: false,
                error: 'No active subscription found',
            });
        }
        const canceledSubscription = await subscription_service_1.SubscriptionService.cancelSubscription({
            subscriptionId: currentSubscription.stripeSubscriptionId,
            ...req.body,
        });
        res.json({
            success: true,
            data: canceledSubscription,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to cancel subscription', { error, userId: req.user?.userId });
        res.status(400).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to cancel subscription',
        });
    }
});
router.post('/subscription/reactivate', async (req, res) => {
    try {
        const { userId } = req.user;
        const currentSubscription = await subscription_service_1.SubscriptionService.getSubscription(userId);
        if (!currentSubscription?.stripeSubscriptionId) {
            return res.status(400).json({
                success: false,
                error: 'No subscription found',
            });
        }
        const reactivatedSubscription = await subscription_service_1.SubscriptionService.reactivateSubscription(currentSubscription.stripeSubscriptionId);
        res.json({
            success: true,
            data: reactivatedSubscription,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to reactivate subscription', { error, userId: req.user?.userId });
        res.status(400).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to reactivate subscription',
        });
    }
});
router.post('/payment-methods/setup-intent', async (req, res) => {
    try {
        const { userId, email } = req.user;
        const customers = await stripe_1.stripe.customers.list({
            email,
            limit: 1,
        });
        let customerId;
        if (customers.data.length > 0) {
            customerId = customers.data[0].id;
        }
        else {
            const customer = await stripe_1.stripe.customers.create({
                email,
                metadata: { userId },
            });
            customerId = customer.id;
        }
        const setupIntent = await (0, stripe_1.createSetupIntent)(customerId, { userId });
        res.json({
            success: true,
            data: {
                clientSecret: setupIntent.client_secret,
                customerId,
            },
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to create setup intent', { error, userId: req.user?.userId });
        res.status(500).json({
            success: false,
            error: 'Failed to create setup intent',
        });
    }
});
router.get('/payment-methods', async (req, res) => {
    try {
        const { userId } = req.user;
        const paymentMethods = await prisma.paymentMethod.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
        res.json({
            success: true,
            data: paymentMethods,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get payment methods', { error, userId: req.user?.userId });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve payment methods',
        });
    }
});
const setDefaultPaymentMethodSchema = zod_1.z.object({
    paymentMethodId: zod_1.z.string(),
});
router.post('/payment-methods/default', (0, validation_1.validateRequest)(setDefaultPaymentMethodSchema), async (req, res) => {
    try {
        const { userId } = req.user;
        const { paymentMethodId } = req.body;
        await prisma.paymentMethod.updateMany({
            where: { userId },
            data: { isDefault: false },
        });
        await prisma.paymentMethod.update({
            where: {
                userId,
                stripePaymentMethodId: paymentMethodId,
            },
            data: { isDefault: true },
        });
        const subscription = await subscription_service_1.SubscriptionService.getSubscription(userId);
        if (subscription?.stripeSubscriptionId) {
            await stripe_1.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
                default_payment_method: paymentMethodId,
            });
        }
        res.json({
            success: true,
            message: 'Default payment method updated',
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to set default payment method', { error, userId: req.user?.userId });
        res.status(400).json({
            success: false,
            error: 'Failed to set default payment method',
        });
    }
});
const removePaymentMethodSchema = zod_1.z.object({
    paymentMethodId: zod_1.z.string(),
});
router.delete('/payment-methods', (0, validation_1.validateRequest)(removePaymentMethodSchema), async (req, res) => {
    try {
        const { userId } = req.user;
        const { paymentMethodId } = req.body;
        await stripe_1.stripe.paymentMethods.detach(paymentMethodId);
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
    }
    catch (error) {
        logger_1.logger.error('Failed to remove payment method', { error, userId: req.user?.userId });
        res.status(400).json({
            success: false,
            error: 'Failed to remove payment method',
        });
    }
});
router.get('/invoices', async (req, res) => {
    try {
        const { userId } = req.user;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
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
    }
    catch (error) {
        logger_1.logger.error('Failed to get invoices', { error, userId: req.user?.userId });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve invoices',
        });
    }
});
router.get('/invoices/:invoiceId', async (req, res) => {
    try {
        const { userId } = req.user;
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
        const stripeInvoice = await stripe_1.stripe.invoices.retrieve(invoice.stripeInvoiceId);
        res.json({
            success: true,
            data: {
                ...invoice,
                stripeData: stripeInvoice,
            },
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get invoice', { error, userId: req.user?.userId });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve invoice',
        });
    }
});
router.get('/invoices/upcoming/preview', async (req, res) => {
    try {
        const { userId } = req.user;
        const subscription = await subscription_service_1.SubscriptionService.getSubscription(userId);
        if (!subscription?.stripeCustomerId) {
            return res.status(400).json({
                success: false,
                error: 'No subscription found',
            });
        }
        const upcomingInvoice = await (0, stripe_1.getUpcomingInvoice)(subscription.stripeCustomerId, subscription.stripeSubscriptionId);
        res.json({
            success: true,
            data: upcomingInvoice,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get upcoming invoice', { error, userId: req.user?.userId });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve upcoming invoice',
        });
    }
});
router.get('/invoices/:invoiceId/download', async (req, res) => {
    try {
        const { userId } = req.user;
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
        const stripeInvoice = await stripe_1.stripe.invoices.retrieve(invoice.stripeInvoiceId);
        if (!stripeInvoice.invoice_pdf) {
            return res.status(400).json({
                success: false,
                error: 'Invoice PDF not available',
            });
        }
        res.redirect(stripeInvoice.invoice_pdf);
    }
    catch (error) {
        logger_1.logger.error('Failed to download invoice', { error, userId: req.user?.userId });
        res.status(500).json({
            success: false,
            error: 'Failed to download invoice',
        });
    }
});
router.get('/usage/current', async (req, res) => {
    try {
        const { userId } = req.user;
        const usage = await usage_service_1.UsageService.getCurrentPeriodUsage(userId);
        res.json({
            success: true,
            data: usage,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get current usage', { error, userId: req.user?.userId });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve usage information',
        });
    }
});
const getUsageSchema = zod_1.z.object({
    startDate: zod_1.z.string().transform(str => new Date(str)),
    endDate: zod_1.z.string().transform(str => new Date(str)),
});
router.get('/usage/period', (0, validation_1.validateRequest)(getUsageSchema, 'query'), async (req, res) => {
    try {
        const { userId } = req.user;
        const { startDate, endDate } = req.query;
        const usage = await usage_service_1.UsageService.getUsageForPeriod(userId, startDate, endDate);
        res.json({
            success: true,
            data: usage,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get usage for period', { error, userId: req.user?.userId });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve usage information',
        });
    }
});
router.get('/usage/overages', (0, validation_1.validateRequest)(getUsageSchema, 'query'), async (req, res) => {
    try {
        const { userId } = req.user;
        const { startDate, endDate } = req.query;
        const overages = await usage_service_1.UsageService.calculateOverageCharges(userId, startDate, endDate);
        res.json({
            success: true,
            data: overages,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get overage charges', { error, userId: req.user?.userId });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve overage information',
        });
    }
});
router.get('/notifications/preferences', async (req, res) => {
    try {
        const { userId } = req.user;
        const preferences = await notification_service_1.NotificationService.getNotificationPreferences(userId);
        res.json({
            success: true,
            data: preferences,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get notification preferences', { error, userId: req.user?.userId });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve notification preferences',
        });
    }
});
const updateNotificationPreferencesSchema = zod_1.z.object({
    emailEnabled: zod_1.z.boolean().optional(),
    browserEnabled: zod_1.z.boolean().optional(),
    webhookEnabled: zod_1.z.boolean().optional(),
    webhookUrl: zod_1.z.string().url().optional(),
    analysisComplete: zod_1.z.boolean().optional(),
    documentChanges: zod_1.z.boolean().optional(),
    highRiskFindings: zod_1.z.boolean().optional(),
    weeklySummary: zod_1.z.boolean().optional(),
    marketingEmails: zod_1.z.boolean().optional(),
});
router.put('/notifications/preferences', (0, validation_1.validateRequest)(updateNotificationPreferencesSchema), async (req, res) => {
    try {
        const { userId } = req.user;
        const preferences = await notification_service_1.NotificationService.updateNotificationPreferences(userId, req.body);
        res.json({
            success: true,
            data: preferences,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to update notification preferences', { error, userId: req.user?.userId });
        res.status(400).json({
            success: false,
            error: 'Failed to update notification preferences',
        });
    }
});
router.get('/notifications', async (req, res) => {
    try {
        const { userId } = req.user;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const unreadOnly = req.query.unread === 'true';
        const notifications = await notification_service_1.NotificationService.getUserNotifications(userId, limit, offset, unreadOnly);
        res.json({
            success: true,
            data: notifications,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get notifications', { error, userId: req.user?.userId });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve notifications',
        });
    }
});
router.post('/notifications/:notificationId/read', async (req, res) => {
    try {
        const { notificationId } = req.params;
        await notification_service_1.NotificationService.markNotificationAsRead(notificationId);
        res.json({
            success: true,
            message: 'Notification marked as read',
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to mark notification as read', { error, notificationId: req.params.notificationId });
        res.status(400).json({
            success: false,
            error: 'Failed to mark notification as read',
        });
    }
});
exports.default = router;
//# sourceMappingURL=billing.js.map