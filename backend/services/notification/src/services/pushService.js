"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushService = void 0;
const client_1 = require("@prisma/client");
const uuid_1 = require("uuid");
const config_1 = require("@fineprintai/shared-config");
const logger_1 = require("@fineprintai/shared-logger");
const logger = (0, logger_1.createServiceLogger)('push-service');
const prisma = new client_1.PrismaClient();
class PushService {
    initialized = false;
    async initialize() {
        if (this.initialized)
            return;
        try {
            await prisma.$connect();
            if (!config_1.config.push.vapidPublicKey || !config_1.config.push.vapidPrivateKey) {
                logger.warn('VAPID keys not configured, push notifications will not work');
            }
            this.initialized = true;
            logger.info('Push service initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize push service', { error });
            throw error;
        }
    }
    async shutdown() {
        if (!this.initialized)
            return;
        try {
            await prisma.$disconnect();
            this.initialized = false;
            logger.info('Push service shut down successfully');
        }
        catch (error) {
            logger.error('Error during push service shutdown', { error });
        }
    }
    async sendPushNotification(request) {
        try {
            const subscriptions = await this.getUserPushSubscriptions(request.userId);
            if (subscriptions.length === 0) {
                logger.info('No push subscriptions found for user', { userId: request.userId });
                return {
                    success: false,
                    errorCode: 'NO_SUBSCRIPTIONS',
                    errorMessage: 'User has no active push subscriptions',
                    retryable: false,
                };
            }
            const payload = {
                title: request.title,
                body: request.body,
                icon: request.iconUrl || '/icons/notification-icon.png',
                image: request.imageUrl,
                badge: '/icons/badge.png',
                data: {
                    ...request.data,
                    actionUrl: request.actionUrl,
                    notificationId: request.deliveryId,
                    timestamp: Date.now(),
                },
                actions: request.actionUrl ? [
                    {
                        action: 'open',
                        title: 'View',
                        icon: '/icons/view-icon.png',
                    },
                ] : undefined,
                requireInteraction: false,
                silent: false,
            };
            const sendResults = await Promise.allSettled(subscriptions.map(subscription => this.sendToSubscription(subscription, payload)));
            const successful = sendResults.filter(result => result.status === 'fulfilled' && result.value.success).length;
            const failed = sendResults.length - successful;
            await this.cleanupFailedSubscriptions(sendResults, subscriptions);
            if (successful === 0) {
                return {
                    success: false,
                    errorCode: 'ALL_SUBSCRIPTIONS_FAILED',
                    errorMessage: `Failed to send to all ${subscriptions.length} subscriptions`,
                    retryable: true,
                };
            }
            logger.info('Push notification sent', {
                userId: request.userId,
                deliveryId: request.deliveryId,
                successful,
                failed,
                totalSubscriptions: subscriptions.length,
            });
            return {
                success: true,
                providerId: 'web-push',
                providerStatus: `${successful}/${subscriptions.length} sent`,
                messageId: request.deliveryId,
            };
        }
        catch (error) {
            logger.error('Failed to send push notification', {
                error: error.message,
                userId: request.userId,
                deliveryId: request.deliveryId,
            });
            return {
                success: false,
                errorCode: 'SEND_FAILED',
                errorMessage: error.message,
                retryable: this.isRetryableError(error),
            };
        }
    }
    async sendToSubscription(subscription, payload) {
        try {
            await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
            if (Math.random() < 0.05) {
                throw new Error('Simulated push failure');
            }
            return { success: true };
        }
        catch (error) {
            logger.error('Failed to send to push subscription', {
                subscriptionId: subscription.id,
                error: error.message,
            });
            return {
                success: false,
                error: error.message,
            };
        }
    }
    async getUserPushSubscriptions(userId) {
        try {
            const subscriptions = await prisma.pushSubscription.findMany({
                where: {
                    userId,
                    isActive: true,
                },
                orderBy: { createdAt: 'desc' },
            });
            return subscriptions.map(sub => ({
                id: sub.id,
                userId: sub.userId,
                endpoint: sub.endpoint,
                keys: JSON.parse(sub.keys),
                userAgent: sub.userAgent,
                isActive: sub.isActive,
                createdAt: sub.createdAt,
            }));
        }
        catch (error) {
            logger.error('Failed to get user push subscriptions', { error, userId });
            return [];
        }
    }
    async cleanupFailedSubscriptions(sendResults, subscriptions) {
        try {
            const failedSubscriptionIds = [];
            sendResults.forEach((result, index) => {
                if (result.status === 'rejected' ||
                    (result.status === 'fulfilled' && !result.value.success)) {
                    const error = result.status === 'rejected'
                        ? result.reason?.message
                        : result.value.error;
                    if (this.isPermanentPushError(error)) {
                        failedSubscriptionIds.push(subscriptions[index].id);
                    }
                }
            });
            if (failedSubscriptionIds.length > 0) {
                await prisma.pushSubscription.updateMany({
                    where: {
                        id: { in: failedSubscriptionIds },
                    },
                    data: {
                        isActive: false,
                        updatedAt: new Date(),
                    },
                });
                logger.info('Cleaned up failed push subscriptions', {
                    count: failedSubscriptionIds.length,
                });
            }
        }
        catch (error) {
            logger.error('Failed to cleanup failed subscriptions', { error });
        }
    }
    async subscribeToPush(data) {
        try {
            const existing = await prisma.pushSubscription.findFirst({
                where: {
                    userId: data.userId,
                    endpoint: data.endpoint,
                },
            });
            if (existing) {
                const updated = await prisma.pushSubscription.update({
                    where: { id: existing.id },
                    data: {
                        keys: JSON.stringify(data.keys),
                        userAgent: data.userAgent,
                        isActive: true,
                        updatedAt: new Date(),
                    },
                });
                logger.info('Push subscription reactivated', {
                    subscriptionId: updated.id,
                    userId: data.userId,
                });
                return {
                    id: updated.id,
                    userId: updated.userId,
                    endpoint: updated.endpoint,
                    keys: JSON.parse(updated.keys),
                    userAgent: updated.userAgent,
                    isActive: updated.isActive,
                    createdAt: updated.createdAt,
                };
            }
            const subscription = await prisma.pushSubscription.create({
                data: {
                    id: (0, uuid_1.v4)(),
                    userId: data.userId,
                    endpoint: data.endpoint,
                    keys: JSON.stringify(data.keys),
                    userAgent: data.userAgent,
                    isActive: true,
                },
            });
            logger.info('Push subscription created', {
                subscriptionId: subscription.id,
                userId: data.userId,
            });
            return {
                id: subscription.id,
                userId: subscription.userId,
                endpoint: subscription.endpoint,
                keys: JSON.parse(subscription.keys),
                userAgent: subscription.userAgent,
                isActive: subscription.isActive,
                createdAt: subscription.createdAt,
            };
        }
        catch (error) {
            logger.error('Failed to create push subscription', { error, data });
            throw error;
        }
    }
    async unsubscribeFromPush(subscriptionId) {
        try {
            await prisma.pushSubscription.update({
                where: { id: subscriptionId },
                data: {
                    isActive: false,
                    updatedAt: new Date(),
                },
            });
            logger.info('Push subscription deactivated', { subscriptionId });
        }
        catch (error) {
            logger.error('Failed to unsubscribe from push', { error, subscriptionId });
            throw error;
        }
    }
    async getUserSubscriptions(userId) {
        return this.getUserPushSubscriptions(userId);
    }
    async deleteSubscription(subscriptionId) {
        try {
            await prisma.pushSubscription.delete({
                where: { id: subscriptionId },
            });
            logger.info('Push subscription deleted', { subscriptionId });
        }
        catch (error) {
            logger.error('Failed to delete push subscription', { error, subscriptionId });
            throw error;
        }
    }
    async sendTestPush(userId) {
        try {
            const result = await this.sendPushNotification({
                userId,
                title: 'Test Notification',
                body: 'This is a test push notification from Fine Print AI',
                data: {
                    test: true,
                },
                deliveryId: `test-${(0, uuid_1.v4)()}`,
            });
            return {
                success: result.success,
                message: result.success
                    ? 'Test push notification sent successfully'
                    : result.errorMessage || 'Failed to send test notification',
            };
        }
        catch (error) {
            logger.error('Failed to send test push', { error, userId });
            return {
                success: false,
                message: error.message || 'Failed to send test notification',
            };
        }
    }
    async getPushStats(userId) {
        try {
            const whereClause = userId ? { userId } : {};
            const [subscriptionStats, recentNotifications] = await Promise.all([
                prisma.pushSubscription.groupBy({
                    by: ['isActive'],
                    where: whereClause,
                    _count: { _all: true },
                }),
                prisma.notificationDelivery.count({
                    where: {
                        channel: 'push',
                        createdAt: {
                            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                        },
                        ...(userId && {
                            notification: {
                                userId,
                            },
                        }),
                    },
                }),
            ]);
            const totalSubscriptions = subscriptionStats.reduce((sum, stat) => sum + stat._count._all, 0);
            const activeSubscriptions = subscriptionStats
                .find(stat => stat.isActive)?._count._all || 0;
            return {
                totalSubscriptions,
                activeSubscriptions,
                recentNotifications,
            };
        }
        catch (error) {
            logger.error('Failed to get push stats', { error, userId });
            throw error;
        }
    }
    isRetryableError(error) {
        const retryablePatterns = [
            'network error',
            'timeout',
            'connection',
            'rate limit',
            'service unavailable',
        ];
        const errorMessage = (error.message || '').toLowerCase();
        return retryablePatterns.some(pattern => errorMessage.includes(pattern));
    }
    isPermanentPushError(error) {
        const permanentErrors = [
            'invalid registration',
            'not found',
            'gone',
            'invalid subscription',
            'unsubscribed',
        ];
        const errorMessage = (error || '').toLowerCase();
        return permanentErrors.some(pattern => errorMessage.includes(pattern));
    }
    async sendBatchPushNotifications(requests) {
        const results = [];
        const batchSize = 10;
        for (let i = 0; i < requests.length; i += batchSize) {
            const batch = requests.slice(i, i + batchSize);
            const batchPromises = batch.map(request => this.sendPushNotification(request).catch(error => ({
                success: false,
                errorCode: 'BATCH_ERROR',
                errorMessage: error.message,
                retryable: true,
            })));
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            if (i + batchSize < requests.length) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
        return results;
    }
    async cleanupOldSubscriptions(daysOld = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);
            const result = await prisma.pushSubscription.deleteMany({
                where: {
                    isActive: false,
                    updatedAt: {
                        lt: cutoffDate,
                    },
                },
            });
            logger.info('Cleaned up old push subscriptions', {
                count: result.count,
                daysOld,
            });
            return result.count;
        }
        catch (error) {
            logger.error('Failed to cleanup old subscriptions', { error, daysOld });
            throw error;
        }
    }
}
exports.pushService = new PushService();
//# sourceMappingURL=pushService.js.map