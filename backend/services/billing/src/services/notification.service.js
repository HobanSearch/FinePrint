"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const mail_1 = __importDefault(require("@sendgrid/mail"));
const client_1 = require("@prisma/client");
const config_1 = __importDefault(require("../config"));
const logger_1 = require("../utils/logger");
const prisma = new client_1.PrismaClient();
mail_1.default.setApiKey(config_1.default.SENDGRID_API_KEY);
class NotificationService {
    static async sendSubscriptionWelcome(userId, tier) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, displayName: true },
            });
            if (!user)
                throw new Error('User not found');
            const emailData = {
                to: user.email,
                from: {
                    email: 'billing@fineprintai.com',
                    name: 'Fine Print AI Billing',
                },
                templateId: 'd-subscription-welcome',
                dynamicTemplateData: {
                    displayName: user.displayName || 'User',
                    tier: tier.charAt(0).toUpperCase() + tier.slice(1),
                    dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`,
                    billingUrl: `${process.env.FRONTEND_URL}/billing`,
                },
            };
            await mail_1.default.send(emailData);
            await prisma.notification.create({
                data: {
                    userId,
                    type: 'subscription_update',
                    title: `Welcome to Fine Print AI ${tier.charAt(0).toUpperCase() + tier.slice(1)}!`,
                    message: `Your subscription has been activated. You now have access to all ${tier} features.`,
                    data: JSON.stringify({ tier }),
                },
            });
            logger_1.logger.info('Subscription welcome email sent', { userId, tier });
        }
        catch (error) {
            logger_1.logger.error('Failed to send subscription welcome email', { error, userId, tier });
        }
    }
    static async sendPaymentSuccess(userId, paymentDetails) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, displayName: true },
            });
            if (!user)
                throw new Error('User not found');
            const emailData = {
                to: user.email,
                from: {
                    email: 'billing@fineprintai.com',
                    name: 'Fine Print AI Billing',
                },
                templateId: 'd-payment-success',
                dynamicTemplateData: {
                    displayName: user.displayName || 'User',
                    amount: paymentDetails.amount.toFixed(2),
                    currency: paymentDetails.currency.toUpperCase(),
                    invoicesUrl: `${process.env.FRONTEND_URL}/billing/invoices`,
                },
            };
            await mail_1.default.send(emailData);
            await prisma.notification.create({
                data: {
                    userId,
                    type: 'subscription_update',
                    title: 'Payment Successful',
                    message: `Your payment of ${paymentDetails.currency.toUpperCase()} ${paymentDetails.amount.toFixed(2)} has been processed successfully.`,
                    data: JSON.stringify(paymentDetails),
                },
            });
            logger_1.logger.info('Payment success email sent', { userId, amount: paymentDetails.amount });
        }
        catch (error) {
            logger_1.logger.error('Failed to send payment success email', { error, userId });
        }
    }
    static async sendPaymentFailed(userId) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, displayName: true },
            });
            if (!user)
                throw new Error('User not found');
            const emailData = {
                to: user.email,
                from: {
                    email: 'billing@fineprintai.com',
                    name: 'Fine Print AI Billing',
                },
                templateId: 'd-payment-failed',
                dynamicTemplateData: {
                    displayName: user.displayName || 'User',
                    billingUrl: `${process.env.FRONTEND_URL}/billing`,
                    supportUrl: `${process.env.FRONTEND_URL}/support`,
                },
            };
            await mail_1.default.send(emailData);
            await prisma.notification.create({
                data: {
                    userId,
                    type: 'action_required',
                    title: 'Payment Failed',
                    message: 'Your recent payment could not be processed. Please update your payment method.',
                    actionUrl: `${process.env.FRONTEND_URL}/billing`,
                },
            });
            logger_1.logger.info('Payment failed email sent', { userId });
        }
        catch (error) {
            logger_1.logger.error('Failed to send payment failed email', { error, userId });
        }
    }
    static async sendUpcomingInvoice(userId, invoiceDetails) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, displayName: true },
            });
            if (!user)
                throw new Error('User not found');
            const emailData = {
                to: user.email,
                from: {
                    email: 'billing@fineprintai.com',
                    name: 'Fine Print AI Billing',
                },
                templateId: 'd-upcoming-invoice',
                dynamicTemplateData: {
                    displayName: user.displayName || 'User',
                    amount: invoiceDetails.amount.toFixed(2),
                    currency: invoiceDetails.currency.toUpperCase(),
                    dueDate: invoiceDetails.dueDate.toLocaleDateString(),
                    billingUrl: `${process.env.FRONTEND_URL}/billing`,
                },
            };
            await mail_1.default.send(emailData);
            await prisma.notification.create({
                data: {
                    userId,
                    type: 'subscription_update',
                    title: 'Upcoming Invoice',
                    message: `Your next invoice for ${invoiceDetails.currency.toUpperCase()} ${invoiceDetails.amount.toFixed(2)} is due on ${invoiceDetails.dueDate.toLocaleDateString()}.`,
                    data: JSON.stringify(invoiceDetails),
                },
            });
            logger_1.logger.info('Upcoming invoice email sent', { userId, amount: invoiceDetails.amount });
        }
        catch (error) {
            logger_1.logger.error('Failed to send upcoming invoice email', { error, userId });
        }
    }
    static async sendTrialEnding(userId, trialEndDate) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, displayName: true },
            });
            if (!user)
                throw new Error('User not found');
            const daysLeft = Math.ceil((trialEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            const emailData = {
                to: user.email,
                from: {
                    email: 'billing@fineprintai.com',
                    name: 'Fine Print AI Billing',
                },
                templateId: 'd-trial-ending',
                dynamicTemplateData: {
                    displayName: user.displayName || 'User',
                    daysLeft,
                    trialEndDate: trialEndDate.toLocaleDateString(),
                    subscribeUrl: `${process.env.FRONTEND_URL}/billing/subscribe`,
                },
            };
            await mail_1.default.send(emailData);
            await prisma.notification.create({
                data: {
                    userId,
                    type: 'action_required',
                    title: 'Trial Ending Soon',
                    message: `Your free trial ends in ${daysLeft} days. Subscribe now to continue using Fine Print AI.`,
                    actionUrl: `${process.env.FRONTEND_URL}/billing/subscribe`,
                },
            });
            logger_1.logger.info('Trial ending email sent', { userId, daysLeft });
        }
        catch (error) {
            logger_1.logger.error('Failed to send trial ending email', { error, userId });
        }
    }
    static async sendSubscriptionCanceled(userId) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, displayName: true, subscriptionExpiresAt: true },
            });
            if (!user)
                throw new Error('User not found');
            const emailData = {
                to: user.email,
                from: {
                    email: 'billing@fineprintai.com',
                    name: 'Fine Print AI Billing',
                },
                templateId: 'd-subscription-canceled',
                dynamicTemplateData: {
                    displayName: user.displayName || 'User',
                    accessUntil: user.subscriptionExpiresAt?.toLocaleDateString(),
                    reactivateUrl: `${process.env.FRONTEND_URL}/billing/reactivate`,
                },
            };
            await mail_1.default.send(emailData);
            await prisma.notification.create({
                data: {
                    userId,
                    type: 'subscription_update',
                    title: 'Subscription Canceled',
                    message: 'Your subscription has been canceled. You can reactivate it anytime before it expires.',
                    actionUrl: `${process.env.FRONTEND_URL}/billing/reactivate`,
                },
            });
            logger_1.logger.info('Subscription canceled email sent', { userId });
        }
        catch (error) {
            logger_1.logger.error('Failed to send subscription canceled email', { error, userId });
        }
    }
    static async sendSubscriptionEnded(userId) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, displayName: true },
            });
            if (!user)
                throw new Error('User not found');
            const emailData = {
                to: user.email,
                from: {
                    email: 'billing@fineprintai.com',
                    name: 'Fine Print AI Billing',
                },
                templateId: 'd-subscription-ended',
                dynamicTemplateData: {
                    displayName: user.displayName || 'User',
                    subscribeUrl: `${process.env.FRONTEND_URL}/billing/subscribe`,
                    exportUrl: `${process.env.FRONTEND_URL}/account/export`,
                },
            };
            await mail_1.default.send(emailData);
            await prisma.notification.create({
                data: {
                    userId,
                    type: 'subscription_update',
                    title: 'Subscription Ended',
                    message: 'Your subscription has ended. You now have access to the free tier features.',
                    actionUrl: `${process.env.FRONTEND_URL}/billing/subscribe`,
                },
            });
            logger_1.logger.info('Subscription ended email sent', { userId });
        }
        catch (error) {
            logger_1.logger.error('Failed to send subscription ended email', { error, userId });
        }
    }
    static async sendPaymentMethodAdded(userId) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, displayName: true },
            });
            if (!user)
                throw new Error('User not found');
            await prisma.notification.create({
                data: {
                    userId,
                    type: 'subscription_update',
                    title: 'Payment Method Added',
                    message: 'A new payment method has been added to your account.',
                },
            });
            logger_1.logger.info('Payment method added notification created', { userId });
        }
        catch (error) {
            logger_1.logger.error('Failed to create payment method added notification', { error, userId });
        }
    }
    static async sendDunningReminder(userId, reminderData) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, displayName: true },
            });
            if (!user)
                throw new Error('User not found');
            const emailData = {
                to: user.email,
                from: {
                    email: 'billing@fineprintai.com',
                    name: 'Fine Print AI Billing',
                },
                templateId: 'd-dunning-reminder',
                dynamicTemplateData: {
                    displayName: user.displayName || 'User',
                    attemptNumber: reminderData.attemptNumber,
                    amount: reminderData.amount.toFixed(2),
                    currency: reminderData.currency.toUpperCase(),
                    dueDate: reminderData.dueDate.toLocaleDateString(),
                    invoiceUrl: reminderData.invoiceUrl,
                    supportUrl: `${process.env.FRONTEND_URL}/support`,
                },
            };
            await mail_1.default.send(emailData);
            logger_1.logger.info('Dunning reminder email sent', {
                userId,
                attemptNumber: reminderData.attemptNumber
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to send dunning reminder email', { error, userId });
        }
    }
    static async sendFinalNotice(userId, noticeData) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, displayName: true },
            });
            if (!user)
                throw new Error('User not found');
            const emailData = {
                to: user.email,
                from: {
                    email: 'billing@fineprintai.com',
                    name: 'Fine Print AI Billing',
                },
                templateId: 'd-final-notice',
                dynamicTemplateData: {
                    displayName: user.displayName || 'User',
                    amount: noticeData.amount.toFixed(2),
                    currency: noticeData.currency.toUpperCase(),
                    suspensionDate: noticeData.suspensionDate.toLocaleDateString(),
                    paymentUrl: noticeData.paymentUrl,
                    supportUrl: `${process.env.FRONTEND_URL}/support`,
                },
            };
            await mail_1.default.send(emailData);
            await prisma.notification.create({
                data: {
                    userId,
                    type: 'action_required',
                    title: 'URGENT: Account Suspension Notice',
                    message: `Your account will be suspended on ${noticeData.suspensionDate.toLocaleDateString()} due to unpaid invoices. Please update your payment immediately.`,
                    actionUrl: noticeData.paymentUrl,
                },
            });
            logger_1.logger.info('Final notice email sent', { userId });
        }
        catch (error) {
            logger_1.logger.error('Failed to send final notice email', { error, userId });
        }
    }
    static async sendAccountSuspended(userId) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, displayName: true },
            });
            if (!user)
                throw new Error('User not found');
            const emailData = {
                to: user.email,
                from: {
                    email: 'billing@fineprintai.com',
                    name: 'Fine Print AI Billing',
                },
                templateId: 'd-account-suspended',
                dynamicTemplateData: {
                    displayName: user.displayName || 'User',
                    reactivateUrl: `${process.env.FRONTEND_URL}/billing/reactivate`,
                    supportUrl: `${process.env.FRONTEND_URL}/support`,
                },
            };
            await mail_1.default.send(emailData);
            await prisma.notification.create({
                data: {
                    userId,
                    type: 'system_alert',
                    title: 'Account Suspended',
                    message: 'Your account has been suspended due to unpaid invoices. Contact support to reactivate.',
                    actionUrl: `${process.env.FRONTEND_URL}/support`,
                },
            });
            logger_1.logger.info('Account suspended email sent', { userId });
        }
        catch (error) {
            logger_1.logger.error('Failed to send account suspended email', { error, userId });
        }
    }
    static async sendChargebackAlert(userId, dispute) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, displayName: true },
            });
            if (!user)
                throw new Error('User not found');
            await prisma.notification.create({
                data: {
                    userId,
                    type: 'system_alert',
                    title: 'Payment Dispute',
                    message: 'A payment dispute has been filed. Our team will handle this matter.',
                },
            });
            const internalEmailData = {
                to: 'billing-alerts@fineprintai.com',
                from: {
                    email: 'noreply@fineprintai.com',
                    name: 'Fine Print AI System',
                },
                subject: `Chargeback Alert: ${dispute.id}`,
                text: `
          Chargeback Created:
          - Dispute ID: ${dispute.id}
          - User ID: ${userId}
          - Amount: ${dispute.currency.toUpperCase()} ${(dispute.amount / 100).toFixed(2)}
          - Reason: ${dispute.reason}
          - Status: ${dispute.status}
        `,
            };
            await mail_1.default.send(internalEmailData);
            logger_1.logger.info('Chargeback alert sent', { userId, disputeId: dispute.id });
        }
        catch (error) {
            logger_1.logger.error('Failed to send chargeback alert', { error, userId });
        }
    }
    static async sendUsageLimitWarning(userId, usageData) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, displayName: true },
            });
            if (!user)
                throw new Error('User not found');
            const percentageUsed = (usageData.usage / usageData.limit) * 100;
            const emailData = {
                to: user.email,
                from: {
                    email: 'billing@fineprintai.com',
                    name: 'Fine Print AI Billing',
                },
                templateId: 'd-usage-warning',
                dynamicTemplateData: {
                    displayName: user.displayName || 'User',
                    metricType: usageData.metricType,
                    usage: usageData.usage,
                    limit: usageData.limit,
                    percentageUsed: Math.round(percentageUsed),
                    upgradeUrl: `${process.env.FRONTEND_URL}/billing/upgrade`,
                },
            };
            await mail_1.default.send(emailData);
            await prisma.notification.create({
                data: {
                    userId,
                    type: 'action_required',
                    title: 'Usage Limit Warning',
                    message: `You've used ${Math.round(percentageUsed)}% of your ${usageData.metricType} limit. Consider upgrading your plan.`,
                    actionUrl: `${process.env.FRONTEND_URL}/billing/upgrade`,
                },
            });
            logger_1.logger.info('Usage limit warning email sent', { userId, metricType: usageData.metricType });
        }
        catch (error) {
            logger_1.logger.error('Failed to send usage limit warning email', { error, userId });
        }
    }
    static async getNotificationPreferences(userId) {
        return prisma.notificationPreference.findUnique({
            where: { userId },
        });
    }
    static async updateNotificationPreferences(userId, preferences) {
        return prisma.notificationPreference.upsert({
            where: { userId },
            update: preferences,
            create: {
                userId,
                ...preferences,
            },
        });
    }
    static async markNotificationAsRead(notificationId) {
        return prisma.notification.update({
            where: { id: notificationId },
            data: { readAt: new Date() },
        });
    }
    static async getUserNotifications(userId, limit = 50, offset = 0, unreadOnly = false) {
        const whereClause = { userId };
        if (unreadOnly) {
            whereClause.readAt = null;
        }
        return prisma.notification.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
        });
    }
}
exports.NotificationService = NotificationService;
exports.default = NotificationService;
//# sourceMappingURL=notification.service.js.map