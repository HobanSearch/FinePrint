"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageQueueService = void 0;
const bull_1 = __importDefault(require("bull"));
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const config_1 = require("@fineprintai/shared-config");
const logger = (0, logger_1.createServiceLogger)('message-queue-service');
class MessageQueueService {
    messageQueue;
    deliveryQueue;
    deadLetterQueue;
    initialized = false;
    MAX_MESSAGE_SIZE = 1024 * 1024;
    MAX_QUEUE_SIZE = 10000;
    DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000;
    constructor() {
        const redisConfig = {
            host: config_1.config.redis.host,
            port: config_1.config.redis.port,
            password: config_1.config.redis.password,
            db: config_1.config.redis.db || 0,
            maxRetriesPerRequest: 3,
            lazyConnect: true,
        };
        this.messageQueue = new bull_1.default('websocket-messages', {
            redis: redisConfig,
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
        this.deliveryQueue = new bull_1.default('message-delivery', {
            redis: redisConfig,
            defaultJobOptions: {
                removeOnComplete: 50,
                removeOnFail: 25,
                attempts: 5,
                backoff: {
                    type: 'exponential',
                    delay: 1000,
                },
            },
        });
        this.deadLetterQueue = new bull_1.default('dead-letter-messages', {
            redis: redisConfig,
            defaultJobOptions: {
                removeOnComplete: 10,
                removeOnFail: false,
            },
        });
    }
    async initialize() {
        if (this.initialized)
            return;
        try {
            await this.setupQueueProcessors();
            this.setupQueueEventHandlers();
            this.startQueueMonitoring();
            this.startCleanupJob();
            this.initialized = true;
            logger.info('Message queue service initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize message queue service', { error });
            throw error;
        }
    }
    async shutdown() {
        if (!this.initialized)
            return;
        try {
            logger.info('Shutting down message queue service...');
            await Promise.all([
                this.messageQueue.close(30000),
                this.deliveryQueue.close(30000),
                this.deadLetterQueue.close(30000),
            ]);
            this.initialized = false;
            logger.info('Message queue service shut down successfully');
        }
        catch (error) {
            logger.error('Error during message queue service shutdown', { error });
        }
    }
    async queueMessage(userId, message, options = {}) {
        try {
            const messageSize = Buffer.byteLength(JSON.stringify(message));
            if (messageSize > this.MAX_MESSAGE_SIZE) {
                throw new Error(`Message size (${messageSize}) exceeds maximum allowed (${this.MAX_MESSAGE_SIZE})`);
            }
            const userQueueSize = await this.getUserQueueSize(userId);
            if (userQueueSize >= this.MAX_QUEUE_SIZE) {
                logger.warn('User queue size limit exceeded', { userId, queueSize: userQueueSize });
                await this.removeOldestMessages(userId, 100);
            }
            const queuedMessage = {
                ...message,
                userId,
                priority: options.priority || 'medium',
                expiresAt: options.ttl ? new Date(Date.now() + options.ttl) : new Date(Date.now() + this.DEFAULT_TTL),
                metadata: {
                    queuedAt: new Date(),
                    attempts: 0,
                },
            };
            const priorityValue = this.getPriorityValue(options.priority || 'medium');
            const jobOptions = {
                priority: priorityValue,
                delay: options.delay || 0,
                attempts: options.attempts || 3,
                backoff: options.backoff || 'exponential',
                removeOnComplete: options.removeOnComplete || 100,
                removeOnFail: options.removeOnFail || 50,
            };
            const job = await this.messageQueue.add(queuedMessage, jobOptions);
            await cache_1.cache.increment(`user:queue_size:${userId}`);
            logger.debug('Message queued successfully', {
                userId,
                messageType: message.type,
                jobId: job.id,
                priority: options.priority,
                delay: options.delay,
            });
            return job.id?.toString() || '';
        }
        catch (error) {
            logger.error('Failed to queue message', { error, userId, messageType: message.type });
            throw error;
        }
    }
    async queueBulkMessages(messages) {
        try {
            const jobs = await Promise.all(messages.map(({ userId, message, options }) => this.queueMessage(userId, message, options)));
            logger.info('Bulk messages queued successfully', { count: messages.length });
            return jobs;
        }
        catch (error) {
            logger.error('Failed to queue bulk messages', { error, count: messages.length });
            throw error;
        }
    }
    async getQueuedMessages(userId, limit = 100) {
        try {
            const cachedMessages = await cache_1.cache.lrange(`user:messages:${userId}`, 0, limit - 1);
            if (cachedMessages.length > 0) {
                logger.debug('Retrieved queued messages from cache', { userId, count: cachedMessages.length });
                return cachedMessages;
            }
            const jobs = await this.messageQueue.getJobs(['waiting', 'delayed'], 0, limit);
            const userMessages = jobs
                .filter(job => job.data.userId === userId)
                .map(job => job.data)
                .slice(0, limit);
            logger.debug('Retrieved queued messages from queue', { userId, count: userMessages.length });
            return userMessages;
        }
        catch (error) {
            logger.error('Failed to get queued messages', { error, userId });
            return [];
        }
    }
    async clearQueuedMessages(userId) {
        try {
            const cacheKey = `user:messages:${userId}`;
            const cachedCount = await cache_1.cache.del(cacheKey);
            const jobs = await this.messageQueue.getJobs(['waiting', 'delayed']);
            const userJobs = jobs.filter(job => job.data.userId === userId);
            await Promise.all(userJobs.map(job => job.remove()));
            await cache_1.cache.del(`user:queue_size:${userId}`);
            const totalCleared = cachedCount + userJobs.length;
            logger.debug('Cleared queued messages', { userId, count: totalCleared });
            return totalCleared;
        }
        catch (error) {
            logger.error('Failed to clear queued messages', { error, userId });
            return 0;
        }
    }
    async getUserQueueSize(userId) {
        try {
            const cachedSize = await cache_1.cache.get(`user:queue_size:${userId}`);
            if (cachedSize !== null) {
                return cachedSize;
            }
            const jobs = await this.messageQueue.getJobs(['waiting', 'delayed', 'active']);
            const userJobCount = jobs.filter(job => job.data.userId === userId).length;
            await cache_1.cache.set(`user:queue_size:${userId}`, userJobCount, 300);
            return userJobCount;
        }
        catch (error) {
            logger.error('Failed to get user queue size', { error, userId });
            return 0;
        }
    }
    async getQueueStats() {
        try {
            const queues = [this.messageQueue, this.deliveryQueue, this.deadLetterQueue];
            const stats = [];
            for (const queue of queues) {
                const waiting = await queue.getWaiting();
                const active = await queue.getActive();
                const completed = await queue.getCompleted();
                const failed = await queue.getFailed();
                const delayed = await queue.getDelayed();
                stats.push({
                    name: queue.name,
                    waiting: waiting.length,
                    active: active.length,
                    completed: completed.length,
                    failed: failed.length,
                    delayed: delayed.length,
                    paused: await queue.isPaused(),
                });
            }
            return stats;
        }
        catch (error) {
            logger.error('Failed to get queue stats', { error });
            return [];
        }
    }
    async getDetailedStats() {
        try {
            const queueStats = await this.getQueueStats();
            const userStatsKeys = await cache_1.cache.keys('user:queue_size:*');
            const users = [];
            for (const key of userStatsKeys) {
                const userId = key.replace('user:queue_size:', '');
                const queueSize = await cache_1.cache.get(key) || 0;
                if (queueSize > 0) {
                    const messages = await this.getQueuedMessages(userId, 1);
                    users.push({
                        userId,
                        queueSize,
                        oldestMessage: messages[0]?.metadata?.queuedAt,
                        newestMessage: messages[messages.length - 1]?.metadata?.queuedAt,
                    });
                }
            }
            const jobs = await this.messageQueue.getJobs(['waiting', 'delayed', 'active']);
            const messageTypes = {};
            for (const job of jobs) {
                const messageType = job.data.type;
                messageTypes[messageType] = (messageTypes[messageType] || 0) + 1;
            }
            return {
                queues: queueStats,
                users,
                totalMessages: jobs.length,
                messageTypes,
            };
        }
        catch (error) {
            logger.error('Failed to get detailed stats', { error });
            return {
                queues: [],
                users: [],
                totalMessages: 0,
                messageTypes: {},
            };
        }
    }
    async getHealthStatus() {
        try {
            const stats = await this.getQueueStats();
            const healthy = stats.every(stat => !stat.paused);
            return {
                healthy,
                details: {
                    initialized: this.initialized,
                    queues: stats,
                },
            };
        }
        catch (error) {
            logger.error('Error getting queue health status', { error });
            return { healthy: false };
        }
    }
    async setupQueueProcessors() {
        this.messageQueue.process('*', async (job) => {
            const message = job.data;
            try {
                if (message.metadata) {
                    message.metadata.attempts++;
                    message.metadata.lastAttempt = new Date();
                }
                if (message.expiresAt && new Date() > message.expiresAt) {
                    logger.debug('Message expired, moving to dead letter queue', {
                        userId: message.userId,
                        messageType: message.type,
                        expiresAt: message.expiresAt,
                    });
                    await this.deadLetterQueue.add(message);
                    return { status: 'expired' };
                }
                await cache_1.cache.lpush(`user:messages:${message.userId}`, message);
                await cache_1.cache.expire(`user:messages:${message.userId}`, 86400);
                logger.debug('Message processed and cached', {
                    userId: message.userId,
                    messageType: message.type,
                    jobId: job.id,
                });
                return { status: 'cached' };
            }
            catch (error) {
                logger.error('Error processing message', {
                    error,
                    userId: message.userId,
                    messageType: message.type,
                    jobId: job.id,
                });
                if (message.metadata) {
                    message.metadata.failureReason = error.message;
                }
                throw error;
            }
        });
        this.deliveryQueue.process(async (job) => {
            const { userId, messages } = job.data;
            try {
                logger.debug('Batch delivery processed', { userId, messageCount: messages.length });
                return { status: 'delivered', count: messages.length };
            }
            catch (error) {
                logger.error('Error in batch delivery', { error, userId, messageCount: messages.length });
                throw error;
            }
        });
        this.deadLetterQueue.process(async (job) => {
            const message = job.data;
            logger.info('Processing dead letter message', {
                userId: message.userId,
                messageType: message.type,
                originalTimestamp: message.timestamp,
                attempts: message.metadata?.attempts,
                failureReason: message.metadata?.failureReason,
            });
            return { status: 'logged' };
        });
        logger.info('Queue processors setup completed');
    }
    setupQueueEventHandlers() {
        this.messageQueue.on('completed', (job, result) => {
            logger.debug('Message job completed', { jobId: job.id, result });
        });
        this.messageQueue.on('failed', (job, err) => {
            logger.warn('Message job failed', { jobId: job.id, error: err.message });
        });
        this.messageQueue.on('stalled', (job) => {
            logger.warn('Message job stalled', { jobId: job.id });
        });
        this.deliveryQueue.on('completed', (job, result) => {
            logger.debug('Delivery job completed', { jobId: job.id, result });
        });
        this.deliveryQueue.on('failed', (job, err) => {
            logger.warn('Delivery job failed', { jobId: job.id, error: err.message });
        });
        this.deadLetterQueue.on('completed', (job, result) => {
            logger.debug('Dead letter job processed', { jobId: job.id, result });
        });
        logger.info('Queue event handlers setup completed');
    }
    startQueueMonitoring() {
        setInterval(async () => {
            try {
                const stats = await this.getQueueStats();
                for (const stat of stats) {
                    if (stat.failed > 100) {
                        logger.warn('High failure rate detected', { queue: stat.name, failedJobs: stat.failed });
                    }
                    if (stat.waiting > 1000) {
                        logger.warn('High queue backlog detected', { queue: stat.name, waitingJobs: stat.waiting });
                    }
                }
            }
            catch (error) {
                logger.error('Error in queue monitoring', { error });
            }
        }, 5 * 60 * 1000);
        logger.info('Queue monitoring started');
    }
    startCleanupJob() {
        setInterval(async () => {
            try {
                await this.cleanupExpiredMessages();
            }
            catch (error) {
                logger.error('Error in cleanup job', { error });
            }
        }, 60 * 60 * 1000);
        logger.info('Cleanup job started');
    }
    async cleanupExpiredMessages() {
        try {
            const jobs = await this.messageQueue.getJobs(['waiting', 'delayed']);
            let cleanedCount = 0;
            for (const job of jobs) {
                const message = job.data;
                if (message.expiresAt && new Date() > message.expiresAt) {
                    await job.remove();
                    cleanedCount++;
                }
            }
            if (cleanedCount > 0) {
                logger.info('Cleaned up expired messages', { count: cleanedCount });
            }
        }
        catch (error) {
            logger.error('Error cleaning up expired messages', { error });
        }
    }
    async removeOldestMessages(userId, count) {
        try {
            const jobs = await this.messageQueue.getJobs(['waiting', 'delayed']);
            const userJobs = jobs
                .filter(job => job.data.userId === userId)
                .sort((a, b) => (a.data.metadata?.queuedAt?.getTime() || 0) - (b.data.metadata?.queuedAt?.getTime() || 0))
                .slice(0, count);
            await Promise.all(userJobs.map(job => job.remove()));
            await cache_1.cache.decrement(`user:queue_size:${userId}`, count);
            logger.debug('Removed oldest messages', { userId, count: userJobs.length });
        }
        catch (error) {
            logger.error('Error removing oldest messages', { error, userId, count });
        }
    }
    getPriorityValue(priority) {
        switch (priority) {
            case 'critical': return 1;
            case 'high': return 2;
            case 'medium': return 3;
            case 'low': return 4;
            default: return 3;
        }
    }
}
exports.MessageQueueService = MessageQueueService;
//# sourceMappingURL=messageQueueService.js.map