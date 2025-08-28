"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliveryTracker = void 0;
const client_1 = require("@prisma/client");
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const uuid_1 = require("uuid");
const config_1 = require("@fineprintai/shared-config");
const logger_1 = require("@fineprintai/shared-logger");
const logger = (0, logger_1.createServiceLogger)('delivery-tracker');
const prisma = new client_1.PrismaClient();
const redis = new ioredis_1.default(config_1.config.redis.url, {
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
});
class DeliveryTracker {
    analyticsQueue;
    analyticsWorker;
    initialized = false;
    constructor() {
        this.analyticsQueue = new bullmq_1.Queue('delivery-analytics', {
            connection: redis,
            defaultJobOptions: {
                removeOnComplete: 1000,
                removeOnFail: 500,
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
            },
        });
        this.analyticsWorker = new bullmq_1.Worker('delivery-analytics', async (job) => {
            return this.processAnalyticsJob(job.data);
        }, {
            connection: redis,
            concurrency: 5,
            removeOnComplete: 1000,
            removeOnFail: 500,
        });
        this.addWorkerErrorHandlers();
    }
    async initialize() {
        if (this.initialized)
            return;
        try {
            await prisma.$connect();
            await redis.ping();
            await this.scheduleDailyAggregation();
            this.initialized = true;
            logger.info('Delivery tracker initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize delivery tracker', { error });
            throw error;
        }
    }
    async shutdown() {
        if (!this.initialized)
            return;
        try {
            await this.analyticsWorker.close();
            await this.analyticsQueue.close();
            await prisma.$disconnect();
            await redis.quit();
            this.initialized = false;
            logger.info('Delivery tracker shut down successfully');
        }
        catch (error) {
            logger.error('Error during delivery tracker shutdown', { error });
        }
    }
    async trackDelivery(notificationId, status, metadata) {
        try {
            await prisma.notification.update({
                where: { id: notificationId },
                data: { status },
            });
            await this.analyticsQueue.add('delivery-event', {
                type: 'delivery_event',
                data: {
                    notificationId,
                    status,
                    metadata,
                },
                timestamp: new Date(),
            });
            logger.debug('Delivery tracked', { notificationId, status });
        }
        catch (error) {
            logger.error('Failed to track delivery', { error, notificationId, status });
        }
    }
    async trackEngagement(deliveryId, event, metadata) {
        try {
            const updateData = {};
            switch (event) {
                case 'opened':
                    updateData.status = 'opened';
                    updateData.openedAt = new Date();
                    break;
                case 'clicked':
                    updateData.status = 'clicked';
                    updateData.clickedAt = new Date();
                    break;
            }
            await prisma.notificationDelivery.update({
                where: { id: deliveryId },
                data: updateData,
            });
            await this.analyticsQueue.add('engagement-event', {
                type: 'user_engagement',
                data: {
                    deliveryId,
                    event,
                    metadata,
                },
                timestamp: new Date(),
            });
            logger.debug('Engagement tracked', { deliveryId, event });
        }
        catch (error) {
            logger.error('Failed to track engagement', { error, deliveryId, event });
        }
    }
    async trackEmailEvent(deliveryId, event, providerId, metadata) {
        try {
            const updateData = {
                providerStatus: event,
            };
            switch (event.toLowerCase()) {
                case 'delivered':
                    updateData.status = 'delivered';
                    updateData.deliveredAt = new Date();
                    break;
                case 'opened':
                    updateData.status = 'opened';
                    updateData.openedAt = new Date();
                    break;
                case 'clicked':
                    updateData.status = 'clicked';
                    updateData.clickedAt = new Date();
                    break;
                case 'bounced':
                case 'bounce':
                    updateData.status = 'bounced';
                    updateData.failedAt = new Date();
                    updateData.errorMessage = metadata?.reason || 'Email bounced';
                    break;
                case 'dropped':
                case 'blocked':
                    updateData.status = 'failed';
                    updateData.failedAt = new Date();
                    updateData.errorMessage = metadata?.reason || 'Email dropped/blocked';
                    break;
                case 'unsubscribed':
                    await this.handleUnsubscribeEvent(deliveryId, metadata);
                    break;
            }
            if (providerId) {
                updateData.providerId = providerId;
            }
            await prisma.notificationDelivery.update({
                where: { id: deliveryId },
                data: updateData,
            });
            await this.analyticsQueue.add('email-event', {
                type: 'delivery_event',
                data: {
                    deliveryId,
                    event,
                    providerId,
                    metadata,
                },
                timestamp: new Date(),
            });
            logger.debug('Email event tracked', { deliveryId, event, providerId });
        }
        catch (error) {
            logger.error('Failed to track email event', { error, deliveryId, event });
        }
    }
    async getDeliveryStats(options = {}) {
        try {
            const { userId, notificationId, channel, dateFrom, dateTo, } = options;
            const whereClause = {};
            if (userId) {
                whereClause.notification = { userId };
            }
            if (notificationId) {
                whereClause.notificationId = notificationId;
            }
            if (channel) {
                whereClause.channel = channel;
            }
            if (dateFrom || dateTo) {
                whereClause.createdAt = {};
                if (dateFrom)
                    whereClause.createdAt.gte = dateFrom;
                if (dateTo)
                    whereClause.createdAt.lte = dateTo;
            }
            const stats = await prisma.notificationDelivery.groupBy({
                by: ['status'],
                where: whereClause,
                _count: { _all: true },
            });
            const statusCounts = stats.reduce((acc, stat) => {
                acc[stat.status] = stat._count._all;
                return acc;
            }, {});
            const totalSent = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
            const totalDelivered = (statusCounts.delivered || 0) + (statusCounts.opened || 0) + (statusCounts.clicked || 0);
            const totalOpened = (statusCounts.opened || 0) + (statusCounts.clicked || 0);
            const totalClicked = statusCounts.clicked || 0;
            const totalFailed = statusCounts.failed || 0;
            const totalBounced = statusCounts.bounced || 0;
            return {
                totalSent,
                totalDelivered,
                totalOpened,
                totalClicked,
                totalFailed,
                totalBounced,
                deliveryRate: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0,
                openRate: totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0,
                clickRate: totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0,
                bounceRate: totalSent > 0 ? (totalBounced / totalSent) * 100 : 0,
            };
        }
        catch (error) {
            logger.error('Failed to get delivery stats', { error, options });
            throw error;
        }
    }
    async getDeliveryTimeline(notificationId) {
        try {
            const deliveries = await prisma.notificationDelivery.findMany({
                where: { notificationId },
                orderBy: { createdAt: 'asc' },
                select: {
                    channel: true,
                    status: true,
                    createdAt: true,
                    sentAt: true,
                    deliveredAt: true,
                    openedAt: true,
                    clickedAt: true,
                    failedAt: true,
                    errorMessage: true,
                },
            });
            const timeline = [];
            for (const delivery of deliveries) {
                timeline.push({
                    timestamp: delivery.createdAt,
                    event: 'created',
                    channel: delivery.channel,
                    status: 'pending',
                });
                if (delivery.sentAt) {
                    timeline.push({
                        timestamp: delivery.sentAt,
                        event: 'sent',
                        channel: delivery.channel,
                        status: 'sent',
                    });
                }
                if (delivery.deliveredAt) {
                    timeline.push({
                        timestamp: delivery.deliveredAt,
                        event: 'delivered',
                        channel: delivery.channel,
                        status: 'delivered',
                    });
                }
                if (delivery.openedAt) {
                    timeline.push({
                        timestamp: delivery.openedAt,
                        event: 'opened',
                        channel: delivery.channel,
                        status: 'opened',
                    });
                }
                if (delivery.clickedAt) {
                    timeline.push({
                        timestamp: delivery.clickedAt,
                        event: 'clicked',
                        channel: delivery.channel,
                        status: 'clicked',
                    });
                }
                if (delivery.failedAt) {
                    timeline.push({
                        timestamp: delivery.failedAt,
                        event: 'failed',
                        channel: delivery.channel,
                        status: 'failed',
                        metadata: { error: delivery.errorMessage },
                    });
                }
            }
            return timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        }
        catch (error) {
            logger.error('Failed to get delivery timeline', { error, notificationId });
            throw error;
        }
    }
    async getUserEngagementMetrics(userId, days = 30) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            const totalNotifications = await prisma.notification.count({
                where: { userId },
            });
            const emailMetrics = await this.getDeliveryStats({
                userId,
                channel: 'email',
                dateFrom: startDate,
            });
            const pushMetrics = await this.getDeliveryStats({
                userId,
                channel: 'push',
                dateFrom: startDate,
            });
            const totalInteractions = emailMetrics.totalOpened + emailMetrics.totalClicked +
                pushMetrics.totalOpened + pushMetrics.totalClicked;
            const totalSent = emailMetrics.totalSent + pushMetrics.totalSent;
            const overallEngagement = totalSent > 0 ? (totalInteractions / totalSent) * 100 : 0;
            const recentActivity = await this.getDailyActivity(userId, days);
            return {
                totalNotifications,
                emailMetrics,
                pushMetrics,
                overallEngagement,
                recentActivity,
            };
        }
        catch (error) {
            logger.error('Failed to get user engagement metrics', { error, userId, days });
            throw error;
        }
    }
    async getMetricsByDate(dateFrom, dateTo, groupBy = 'day') {
        try {
            const metrics = await prisma.notificationMetrics.findMany({
                where: {
                    date: {
                        gte: dateFrom,
                        lte: dateTo,
                    },
                },
                orderBy: { date: 'asc' },
            });
            return metrics.map(metric => ({
                date: metric.date.toISOString().split('T')[0],
                sent: metric.sent,
                delivered: metric.delivered,
                opened: metric.opened,
                clicked: metric.clicked,
                failed: metric.failed,
                deliveryRate: metric.deliveryRate,
                openRate: metric.openRate,
                clickRate: metric.clickRate,
            }));
        }
        catch (error) {
            logger.error('Failed to get metrics by date', { error, dateFrom, dateTo, groupBy });
            throw error;
        }
    }
    addWorkerErrorHandlers() {
        this.analyticsWorker.on('error', (error) => {
            logger.error('Analytics worker error', { error });
        });
        this.analyticsWorker.on('failed', (job, error) => {
            logger.error('Analytics job failed', {
                jobId: job?.id,
                jobData: job?.data,
                error: error.message,
            });
        });
        this.analyticsWorker.on('completed', (job) => {
            logger.debug('Analytics job completed', {
                jobId: job.id,
                type: job.data.type,
            });
        });
    }
    async processAnalyticsJob(jobData) {
        try {
            switch (jobData.type) {
                case 'delivery_event':
                    await this.processDeliveryEvent(jobData.data);
                    break;
                case 'user_engagement':
                    await this.processEngagementEvent(jobData.data);
                    break;
                case 'daily_aggregation':
                    await this.processDailyAggregation(jobData.data);
                    break;
                default:
                    logger.warn('Unknown analytics job type', { type: jobData.type });
            }
        }
        catch (error) {
            logger.error('Failed to process analytics job', { error, jobData });
            throw error;
        }
    }
    async processDeliveryEvent(data) {
        const date = new Date().toISOString().split('T')[0];
        const key = `metrics:${date}`;
        await redis.hincrby(key, `${data.status}_count`, 1);
        await redis.expire(key, 86400 * 7);
    }
    async processEngagementEvent(data) {
        const userId = data.userId;
        const date = new Date().toISOString().split('T')[0];
        const key = `engagement:${userId}:${date}`;
        await redis.hincrby(key, `${data.event}_count`, 1);
        await redis.expire(key, 86400 * 30);
    }
    async processDailyAggregation(data) {
        const date = data.date || new Date();
        const dateStr = new Date(date).toISOString().split('T')[0];
        const channels = ['email', 'push', 'webhook', 'in_app'];
        for (const channel of channels) {
            const stats = await this.getDeliveryStats({
                channel,
                dateFrom: new Date(dateStr),
                dateTo: new Date(dateStr + 'T23:59:59Z'),
            });
            await prisma.notificationMetrics.upsert({
                where: {
                    date_type_channel: {
                        date: new Date(dateStr),
                        type: 'all',
                        channel,
                    },
                },
                update: {
                    sent: stats.totalSent,
                    delivered: stats.totalDelivered,
                    opened: stats.totalOpened,
                    clicked: stats.totalClicked,
                    failed: stats.totalFailed,
                    bounced: stats.totalBounced,
                    deliveryRate: stats.deliveryRate,
                    openRate: stats.openRate,
                    clickRate: stats.clickRate,
                    bounceRate: stats.bounceRate,
                    updatedAt: new Date(),
                },
                create: {
                    id: (0, uuid_1.v4)(),
                    date: new Date(dateStr),
                    type: 'all',
                    channel,
                    sent: stats.totalSent,
                    delivered: stats.totalDelivered,
                    opened: stats.totalOpened,
                    clicked: stats.totalClicked,
                    failed: stats.totalFailed,
                    bounced: stats.totalBounced,
                    deliveryRate: stats.deliveryRate,
                    openRate: stats.openRate,
                    clickRate: stats.clickRate,
                    bounceRate: stats.bounceRate,
                },
            });
        }
        logger.info('Daily aggregation completed', { date: dateStr });
    }
    async handleUnsubscribeEvent(deliveryId, metadata) {
        try {
            const delivery = await prisma.notificationDelivery.findUnique({
                where: { id: deliveryId },
                include: { notification: true },
            });
            if (!delivery)
                return;
            await prisma.unsubscribeRecord.create({
                data: {
                    id: (0, uuid_1.v4)(),
                    userId: delivery.notification.userId,
                    email: metadata?.email || 'unknown',
                    type: 'all',
                    reason: 'webhook_unsubscribe',
                    source: 'email_link',
                },
            });
            await prisma.notificationPreference.upsert({
                where: { userId: delivery.notification.userId },
                update: {
                    emailEnabled: false,
                    optOutDate: new Date(),
                },
                create: {
                    id: (0, uuid_1.v4)(),
                    userId: delivery.notification.userId,
                    emailEnabled: false,
                    consentGiven: false,
                    optOutDate: new Date(),
                },
            });
            logger.info('Unsubscribe processed', {
                userId: delivery.notification.userId,
                deliveryId,
            });
        }
        catch (error) {
            logger.error('Failed to handle unsubscribe event', { error, deliveryId, metadata });
        }
    }
    async scheduleDailyAggregation() {
        try {
            await this.analyticsQueue.add('daily-aggregation', {
                type: 'daily_aggregation',
                data: { date: new Date() },
                timestamp: new Date(),
            }, {
                repeat: {
                    pattern: '0 0 * * *',
                },
                removeOnComplete: 10,
                removeOnFail: 5,
            });
            logger.info('Daily aggregation scheduled');
        }
        catch (error) {
            logger.error('Failed to schedule daily aggregation', { error });
        }
    }
    async getDailyActivity(userId, days) {
        try {
            const activity = [];
            for (let i = 0; i < days; i++) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                const stats = await this.getDeliveryStats({
                    userId,
                    dateFrom: new Date(dateStr),
                    dateTo: new Date(dateStr + 'T23:59:59Z'),
                });
                activity.push({
                    date: dateStr,
                    sent: stats.totalSent,
                    opened: stats.totalOpened,
                    clicked: stats.totalClicked,
                });
            }
            return activity.reverse();
        }
        catch (error) {
            logger.error('Failed to get daily activity', { error, userId, days });
            return [];
        }
    }
    async getRealtimeDeliveryStatus(notificationId) {
        try {
            const notification = await prisma.notification.findUnique({
                where: { id: notificationId },
                include: { channels: true },
            });
            if (!notification) {
                throw new Error(`Notification ${notificationId} not found`);
            }
            const total = notification.channels.length;
            const sent = notification.channels.filter(c => ['sent', 'delivered', 'opened', 'clicked'].includes(c.status)).length;
            const delivered = notification.channels.filter(c => ['delivered', 'opened', 'clicked'].includes(c.status)).length;
            const failed = notification.channels.filter(c => ['failed', 'bounced'].includes(c.status)).length;
            return {
                status: notification.status,
                progress: {
                    total,
                    sent,
                    delivered,
                    failed,
                },
                channels: notification.channels.map(channel => ({
                    channel: channel.channel,
                    status: channel.status,
                    attempts: channel.attempts,
                    lastAttempt: channel.lastAttemptAt,
                    nextRetry: channel.nextRetryAt,
                })),
            };
        }
        catch (error) {
            logger.error('Failed to get realtime delivery status', { error, notificationId });
            throw error;
        }
    }
}
exports.deliveryTracker = new DeliveryTracker();
//# sourceMappingURL=deliveryTracker.js.map