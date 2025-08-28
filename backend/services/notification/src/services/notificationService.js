"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationService = void 0;
const client_1 = require("@prisma/client");
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const uuid_1 = require("uuid");
const config_1 = require("@fineprintai/shared-config");
const logger_1 = require("@fineprintai/shared-logger");
const emailService_1 = require("./emailService");
const webhookService_1 = require("./webhookService");
const pushService_1 = require("./pushService");
const preferenceService_1 = require("./preferenceService");
const deliveryTracker_1 = require("./deliveryTracker");
const abTestService_1 = require("./abTestService");
const templateService_1 = require("./templateService");
const logger = (0, logger_1.createServiceLogger)('notification-service');
const prisma = new client_1.PrismaClient();
const redis = new ioredis_1.default(config_1.config.redis.url, {
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
});
class NotificationService {
    notificationQueue;
    batchQueue;
    priorityQueue;
    retryQueue;
    notificationWorker;
    batchWorker;
    priorityWorker;
    retryWorker;
    initialized = false;
    constructor() {
        this.notificationQueue = new bullmq_1.Queue('notifications', {
            connection: redis,
            defaultJobOptions: {
                removeOnComplete: 100,
                removeOnFail: 50,
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
            },
        });
        this.batchQueue = new bullmq_1.Queue('batch-notifications', {
            connection: redis,
            defaultJobOptions: {
                removeOnComplete: 50,
                removeOnFail: 25,
                attempts: 2,
                backoff: {
                    type: 'exponential',
                    delay: 5000,
                },
            },
        });
        this.priorityQueue = new bullmq_1.Queue('priority-notifications', {
            connection: redis,
            defaultJobOptions: {
                removeOnComplete: 200,
                removeOnFail: 100,
                attempts: 5,
                backoff: {
                    type: 'exponential',
                    delay: 1000,
                },
            },
        });
        this.retryQueue = new bullmq_1.Queue('retry-notifications', {
            connection: redis,
            defaultJobOptions: {
                removeOnComplete: 50,
                removeOnFail: 50,
                attempts: 1,
            },
        });
        this.initializeWorkers();
    }
    initializeWorkers() {
        this.notificationWorker = new bullmq_1.Worker('notifications', async (job) => {
            return this.processNotification(job.data);
        }, {
            connection: redis,
            concurrency: 10,
            removeOnComplete: 100,
            removeOnFail: 50,
        });
        this.batchWorker = new bullmq_1.Worker('batch-notifications', async (job) => {
            return this.processBatchNotifications(job.data);
        }, {
            connection: redis,
            concurrency: 5,
            removeOnComplete: 50,
            removeOnFail: 25,
        });
        this.priorityWorker = new bullmq_1.Worker('priority-notifications', async (job) => {
            return this.processNotification(job.data);
        }, {
            connection: redis,
            concurrency: 20,
            removeOnComplete: 200,
            removeOnFail: 100,
        });
        this.retryWorker = new bullmq_1.Worker('retry-notifications', async (job) => {
            return this.processNotification(job.data);
        }, {
            connection: redis,
            concurrency: 5,
            removeOnComplete: 50,
            removeOnFail: 50,
        });
        this.addWorkerErrorHandlers();
    }
    addWorkerErrorHandlers() {
        const workers = [
            this.notificationWorker,
            this.batchWorker,
            this.priorityWorker,
            this.retryWorker,
        ];
        workers.forEach((worker, index) => {
            const workerNames = ['notification', 'batch', 'priority', 'retry'];
            const workerName = workerNames[index];
            worker.on('error', (error) => {
                logger.error(`${workerName} worker error`, { error });
            });
            worker.on('failed', (job, error) => {
                logger.error(`${workerName} job failed`, {
                    jobId: job?.id,
                    jobData: job?.data,
                    error: error.message,
                });
            });
            worker.on('completed', (job) => {
                logger.info(`${workerName} job completed`, {
                    jobId: job.id,
                    duration: job.processedOn ? Date.now() - job.processedOn : 0,
                });
            });
        });
    }
    async initialize() {
        if (this.initialized)
            return;
        try {
            await prisma.$connect();
            await redis.ping();
            await Promise.all([
                emailService_1.emailService.initialize(),
                webhookService_1.webhookService.initialize(),
                pushService_1.pushService.initialize(),
                preferenceService_1.preferenceService.initialize(),
                deliveryTracker_1.deliveryTracker.initialize(),
                abTestService_1.abTestService.initialize(),
                templateService_1.templateService.initialize(),
            ]);
            this.initialized = true;
            logger.info('Notification service initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize notification service', { error });
            throw error;
        }
    }
    async shutdown() {
        if (!this.initialized)
            return;
        try {
            await Promise.all([
                this.notificationWorker.close(),
                this.batchWorker.close(),
                this.priorityWorker.close(),
                this.retryWorker.close(),
            ]);
            await Promise.all([
                this.notificationQueue.close(),
                this.batchQueue.close(),
                this.priorityQueue.close(),
                this.retryQueue.close(),
            ]);
            await prisma.$disconnect();
            await redis.quit();
            this.initialized = false;
            logger.info('Notification service shut down successfully');
        }
        catch (error) {
            logger.error('Error during notification service shutdown', { error });
            throw error;
        }
    }
    async createNotification(request) {
        try {
            const preferences = await preferenceService_1.preferenceService.getUserPreferences(request.userId);
            if (!preferences?.consentGiven) {
                throw new Error('User has not given consent for notifications');
            }
            const allowedChannels = this.filterChannelsByPreferences(request.channels, preferences);
            if (allowedChannels.length === 0) {
                throw new Error('No allowed channels for this user');
            }
            const processedRequest = await abTestService_1.abTestService.processNotificationForTest(request);
            const notification = await prisma.notification.create({
                data: {
                    id: (0, uuid_1.v4)(),
                    userId: request.userId,
                    type: request.type,
                    category: this.getCategoryFromType(request.type),
                    priority: this.getPriorityFromType(request.type),
                    title: processedRequest.title,
                    message: processedRequest.message,
                    data: request.data ? JSON.stringify(request.data) : null,
                    actionUrl: request.actionUrl,
                    scheduledAt: request.scheduledAt || new Date(),
                    expiresAt: request.expiresAt,
                    templateId: processedRequest.templateId,
                    abTestGroup: processedRequest.abTestGroup,
                    abTestId: processedRequest.abTestId,
                },
            });
            await Promise.all(allowedChannels.map(channel => prisma.notificationDelivery.create({
                data: {
                    id: (0, uuid_1.v4)(),
                    notificationId: notification.id,
                    channel: channel.type,
                    webhookUrl: channel.type === 'webhook' ? channel.config.url : null,
                },
            })));
            const jobData = {
                notificationId: notification.id,
                userId: request.userId,
                channels: allowedChannels,
                priority: notification.priority,
                scheduledAt: notification.scheduledAt,
            };
            const queue = this.getQueueByPriority(notification.priority);
            const delay = notification.scheduledAt
                ? Math.max(0, notification.scheduledAt.getTime() - Date.now())
                : 0;
            await queue.add(`notification-${notification.id}`, jobData, {
                delay,
                priority: this.getPriorityScore(notification.priority),
            });
            logger.info('Notification created and queued', {
                notificationId: notification.id,
                userId: request.userId,
                type: request.type,
                channels: allowedChannels.length,
            });
            return {
                id: notification.id,
                type: notification.type,
                title: notification.title,
                message: notification.message,
                data: notification.data ? JSON.parse(notification.data) : null,
                readAt: notification.readAt,
                actionUrl: notification.actionUrl,
                expiresAt: notification.expiresAt,
                createdAt: notification.createdAt,
            };
        }
        catch (error) {
            logger.error('Failed to create notification', { error, request });
            throw error;
        }
    }
    async createBulkNotifications(request) {
        try {
            const batchId = (0, uuid_1.v4)();
            const batchSize = request.batchSize || 100;
            let queued = 0;
            let skipped = 0;
            for (let i = 0; i < request.userIds.length; i += batchSize) {
                const userBatch = request.userIds.slice(i, i + batchSize);
                const notifications = [];
                for (const userId of userBatch) {
                    try {
                        const preferences = await preferenceService_1.preferenceService.getUserPreferences(userId);
                        if (!preferences?.consentGiven) {
                            skipped++;
                            continue;
                        }
                        const allowedChannels = this.filterChannelsByPreferences(request.channels, preferences);
                        if (allowedChannels.length === 0) {
                            skipped++;
                            continue;
                        }
                        const notification = await prisma.notification.create({
                            data: {
                                id: (0, uuid_1.v4)(),
                                userId,
                                type: request.type,
                                category: this.getCategoryFromType(request.type),
                                priority: this.getPriorityFromType(request.type),
                                title: request.title,
                                message: request.message,
                                data: request.data ? JSON.stringify(request.data) : null,
                                actionUrl: request.actionUrl,
                            },
                        });
                        await Promise.all(allowedChannels.map(channel => prisma.notificationDelivery.create({
                            data: {
                                id: (0, uuid_1.v4)(),
                                notificationId: notification.id,
                                channel: channel.type,
                                webhookUrl: channel.type === 'webhook' ? channel.config.url : null,
                            },
                        })));
                        notifications.push({
                            notificationId: notification.id,
                            userId,
                            channels: allowedChannels,
                            priority: notification.priority,
                        });
                        queued++;
                    }
                    catch (error) {
                        logger.warn('Failed to create notification for user', { userId, error });
                        skipped++;
                    }
                }
                if (notifications.length > 0) {
                    await this.batchQueue.add(`batch-${batchId}-${i}`, {
                        notifications,
                        batchId,
                        userId: 'bulk',
                    }, {
                        priority: 50,
                    });
                }
            }
            logger.info('Bulk notifications created', {
                batchId,
                totalUsers: request.userIds.length,
                queued,
                skipped,
            });
            return { batchId, queued, skipped };
        }
        catch (error) {
            logger.error('Failed to create bulk notifications', { error, request });
            throw error;
        }
    }
    async processNotification(jobData) {
        try {
            const notification = await prisma.notification.findUnique({
                where: { id: jobData.notificationId },
                include: {
                    template: true,
                    channels: true,
                },
            });
            if (!notification) {
                throw new Error(`Notification ${jobData.notificationId} not found`);
            }
            if (notification.expiresAt && notification.expiresAt < new Date()) {
                await prisma.notification.update({
                    where: { id: notification.id },
                    data: { status: 'expired' },
                });
                return;
            }
            await prisma.notification.update({
                where: { id: notification.id },
                data: { status: 'processing' },
            });
            const deliveryPromises = jobData.channels.map(async (channel) => {
                try {
                    const deliveryRecord = await prisma.notificationDelivery.findFirst({
                        where: {
                            notificationId: notification.id,
                            channel: channel.type,
                        },
                    });
                    if (!deliveryRecord) {
                        throw new Error(`Delivery record not found for channel ${channel.type}`);
                    }
                    await this.processChannel(notification, channel, deliveryRecord.id);
                }
                catch (error) {
                    logger.error('Failed to process channel', {
                        notificationId: notification.id,
                        channel: channel.type,
                        error,
                    });
                }
            });
            await Promise.allSettled(deliveryPromises);
            const deliveries = await prisma.notificationDelivery.findMany({
                where: { notificationId: notification.id },
            });
            const allFailed = deliveries.every(d => d.status === 'failed');
            const anyDelivered = deliveries.some(d => ['sent', 'delivered', 'opened', 'clicked'].includes(d.status));
            const finalStatus = allFailed ? 'failed' : anyDelivered ? 'sent' : 'processing';
            await prisma.notification.update({
                where: { id: notification.id },
                data: { status: finalStatus },
            });
            await deliveryTracker_1.deliveryTracker.trackDelivery(notification.id, finalStatus);
            logger.info('Notification processed', {
                notificationId: notification.id,
                status: finalStatus,
                channelsProcessed: jobData.channels.length,
            });
        }
        catch (error) {
            logger.error('Failed to process notification', {
                notificationId: jobData.notificationId,
                error,
            });
            await prisma.notification.update({
                where: { id: jobData.notificationId },
                data: { status: 'failed' },
            }).catch(() => { });
            throw error;
        }
    }
    async processBatchNotifications(jobData) {
        try {
            logger.info('Processing batch notifications', {
                batchId: jobData.batchId,
                count: jobData.notifications.length,
            });
            const subBatchSize = 10;
            for (let i = 0; i < jobData.notifications.length; i += subBatchSize) {
                const subBatch = jobData.notifications.slice(i, i + subBatchSize);
                const processingPromises = subBatch.map(notification => this.processNotification(notification).catch(error => {
                    logger.error('Failed to process notification in batch', {
                        notificationId: notification.notificationId,
                        batchId: jobData.batchId,
                        error,
                    });
                }));
                await Promise.allSettled(processingPromises);
                if (i + subBatchSize < jobData.notifications.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            logger.info('Batch notifications processed', {
                batchId: jobData.batchId,
                count: jobData.notifications.length,
            });
        }
        catch (error) {
            logger.error('Failed to process batch notifications', {
                batchId: jobData.batchId,
                error,
            });
            throw error;
        }
    }
    async processChannel(notification, channel, deliveryId) {
        try {
            await prisma.notificationDelivery.update({
                where: { id: deliveryId },
                data: {
                    status: 'processing',
                    attempts: { increment: 1 },
                    lastAttemptAt: new Date(),
                },
            });
            let result;
            switch (channel.type) {
                case 'email':
                    result = await emailService_1.emailService.sendEmail({
                        userId: notification.userId,
                        notificationId: notification.id,
                        template: notification.template,
                        data: notification.data ? JSON.parse(notification.data) : {},
                        deliveryId,
                    });
                    break;
                case 'webhook':
                    result = await webhookService_1.webhookService.sendWebhook({
                        url: channel.config.url,
                        method: channel.config.method || 'POST',
                        headers: channel.config.headers || {},
                        payload: {
                            notificationId: notification.id,
                            userId: notification.userId,
                            type: notification.type,
                            title: notification.title,
                            message: notification.message,
                            data: notification.data ? JSON.parse(notification.data) : null,
                            actionUrl: notification.actionUrl,
                            createdAt: notification.createdAt,
                        },
                        deliveryId,
                    });
                    break;
                case 'push':
                    result = await pushService_1.pushService.sendPushNotification({
                        userId: notification.userId,
                        title: notification.title,
                        body: notification.message,
                        data: notification.data ? JSON.parse(notification.data) : {},
                        actionUrl: notification.actionUrl,
                        deliveryId,
                    });
                    break;
                default:
                    throw new Error(`Unsupported channel type: ${channel.type}`);
            }
            await prisma.notificationDelivery.update({
                where: { id: deliveryId },
                data: {
                    status: result.success ? 'sent' : 'failed',
                    providerId: result.providerId,
                    providerStatus: result.providerStatus,
                    sentAt: result.success ? new Date() : null,
                    errorCode: result.errorCode,
                    errorMessage: result.errorMessage,
                },
            });
            if (!result.success && result.retryable) {
                await this.scheduleRetry(notification.id, channel, deliveryId);
            }
        }
        catch (error) {
            logger.error('Failed to process channel', {
                notificationId: notification.id,
                channel: channel.type,
                deliveryId,
                error,
            });
            await prisma.notificationDelivery.update({
                where: { id: deliveryId },
                data: {
                    status: 'failed',
                    errorMessage: error.message,
                    failedAt: new Date(),
                },
            });
        }
    }
    async scheduleRetry(notificationId, channel, deliveryId) {
        try {
            const delivery = await prisma.notificationDelivery.findUnique({
                where: { id: deliveryId },
            });
            if (!delivery || delivery.attempts >= delivery.maxAttempts) {
                return;
            }
            const delay = Math.min(1000 * Math.pow(2, delivery.attempts), 300000);
            const nextRetryAt = new Date(Date.now() + delay);
            await prisma.notificationDelivery.update({
                where: { id: deliveryId },
                data: { nextRetryAt },
            });
            await this.retryQueue.add(`retry-${deliveryId}`, {
                notificationId,
                userId: delivery.id,
                channels: [channel],
                priority: 'normal',
                retryAttempts: delivery.attempts,
            }, { delay });
            logger.info('Retry scheduled', {
                notificationId,
                deliveryId,
                attempt: delivery.attempts + 1,
                delay,
            });
        }
        catch (error) {
            logger.error('Failed to schedule retry', {
                notificationId,
                deliveryId,
                error,
            });
        }
    }
    filterChannelsByPreferences(channels, preferences) {
        return channels.filter(channel => {
            switch (channel.type) {
                case 'email':
                    return preferences.emailEnabled;
                case 'push':
                    return preferences.pushEnabled;
                case 'webhook':
                    return preferences.webhookEnabled;
                default:
                    return preferences.inAppEnabled;
            }
        });
    }
    getCategoryFromType(type) {
        const transactionalTypes = [
            'analysis_complete',
            'document_changed',
            'action_required',
            'system_alert'
        ];
        return transactionalTypes.includes(type) ? 'transactional' : 'marketing';
    }
    getPriorityFromType(type) {
        const priorityMap = {
            system_alert: 'urgent',
            action_required: 'high',
            analysis_complete: 'normal',
            document_changed: 'normal',
            subscription_update: 'low',
        };
        return priorityMap[type] || 'normal';
    }
    getQueueByPriority(priority) {
        return priority === 'urgent' || priority === 'high'
            ? this.priorityQueue
            : this.notificationQueue;
    }
    getPriorityScore(priority) {
        const scores = {
            urgent: 100,
            high: 75,
            normal: 50,
            low: 25,
        };
        return scores[priority] || 50;
    }
    async getUserNotifications(userId, options = {}) {
        const { limit = 50, offset = 0, unreadOnly = false, type, category, } = options;
        const whereClause = { userId };
        if (unreadOnly) {
            whereClause.readAt = null;
        }
        if (type) {
            whereClause.type = type;
        }
        if (category) {
            whereClause.category = category;
        }
        const notifications = await prisma.notification.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
            select: {
                id: true,
                type: true,
                title: true,
                message: true,
                data: true,
                readAt: true,
                actionUrl: true,
                expiresAt: true,
                createdAt: true,
            },
        });
        return notifications.map(notification => ({
            id: notification.id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            data: notification.data ? JSON.parse(notification.data) : null,
            readAt: notification.readAt,
            actionUrl: notification.actionUrl,
            expiresAt: notification.expiresAt,
            createdAt: notification.createdAt,
        }));
    }
    async markNotificationAsRead(notificationId) {
        await prisma.notification.update({
            where: { id: notificationId },
            data: { readAt: new Date() },
        });
        await deliveryTracker_1.deliveryTracker.trackEngagement(notificationId, 'read');
    }
    async getNotificationStats(userId) {
        const whereClause = userId ? { userId } : {};
        const stats = await prisma.notification.groupBy({
            by: ['status'],
            where: whereClause,
            _count: { _all: true },
        });
        return stats.reduce((acc, stat) => {
            acc[stat.status] = stat._count._all;
            return acc;
        }, {});
    }
}
exports.notificationService = new NotificationService();
//# sourceMappingURL=notificationService.js.map