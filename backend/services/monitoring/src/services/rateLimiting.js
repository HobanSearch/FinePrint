"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitingService = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const bottleneck_1 = __importDefault(require("bottleneck"));
const ioredis_1 = require("ioredis");
const config_1 = require("@fineprintai/shared-config");
const events_1 = require("events");
const logger = (0, logger_1.createServiceLogger)('rate-limiting-service');
class ExponentialBackoff {
    calculate(retryCount, baseDelay) {
        return Math.min(baseDelay * Math.pow(2, retryCount), 300000);
    }
}
class LinearBackoff {
    calculate(retryCount, baseDelay) {
        return Math.min(baseDelay * (retryCount + 1), 300000);
    }
}
class FixedBackoff {
    calculate(retryCount, baseDelay) {
        return baseDelay;
    }
}
class RateLimitingService extends events_1.EventEmitter {
    redis;
    limiters = new Map();
    backoffStrategies = new Map();
    initialized = false;
    statsCollectionInterval = null;
    constructor() {
        super();
        this.redis = new ioredis_1.Redis(config_1.config.redis.url);
        this.backoffStrategies.set('exponential', new ExponentialBackoff());
        this.backoffStrategies.set('linear', new LinearBackoff());
        this.backoffStrategies.set('fixed', new FixedBackoff());
    }
    async initialize() {
        if (this.initialized)
            return;
        logger.info('Initializing rate limiting service...');
        try {
            await this.redis.ping();
            await this.createDefaultLimiters();
            this.startStatsCollection();
            this.initialized = true;
            logger.info('Rate limiting service initialized successfully', {
                limiters: this.limiters.size,
            });
        }
        catch (error) {
            logger.error('Failed to initialize rate limiting service', { error });
            throw error;
        }
    }
    async createRateLimiter(config) {
        if (this.limiters.has(config.id)) {
            logger.warn('Rate limiter already exists, returning existing instance', {
                id: config.id
            });
            return this.limiters.get(config.id);
        }
        const bottleneckConfig = {
            id: config.id,
            datastore: 'redis',
            clientOptions: {
                host: this.redis.options.host,
                port: this.redis.options.port,
                db: this.redis.options.db || 0,
            },
            clearDatastore: false,
            trackDoneStatus: true,
        };
        switch (config.strategy) {
            case 'leak_bucket':
                bottleneckConfig.maxConcurrent = config.maxConcurrent || 1;
                bottleneckConfig.minTime = config.minTime || 1000;
                if (config.reservoir !== undefined) {
                    bottleneckConfig.reservoir = config.reservoir;
                    bottleneckConfig.reservoirRefreshAmount = config.reservoirRefreshAmount || config.reservoir;
                    bottleneckConfig.reservoirRefreshInterval = config.reservoirRefreshInterval || 60000;
                }
                break;
            case 'fixed_window':
                bottleneckConfig.reservoir = config.maxRequests || 100;
                bottleneckConfig.reservoirRefreshAmount = config.maxRequests || 100;
                bottleneckConfig.reservoirRefreshInterval = config.timeWindow || 60000;
                bottleneckConfig.maxConcurrent = config.maxConcurrent;
                break;
            case 'sliding_window':
                const windowSize = config.timeWindow || 60000;
                const buckets = 60;
                const bucketSize = Math.ceil((config.maxRequests || 100) / buckets);
                bottleneckConfig.reservoir = buckets * bucketSize;
                bottleneckConfig.reservoirRefreshAmount = bucketSize;
                bottleneckConfig.reservoirRefreshInterval = Math.floor(windowSize / buckets);
                bottleneckConfig.maxConcurrent = config.maxConcurrent;
                break;
            default:
                bottleneckConfig.maxConcurrent = config.maxConcurrent || 1;
                bottleneckConfig.minTime = config.minTime || 1000;
        }
        if (config.highWater !== undefined) {
            bottleneckConfig.highWater = config.highWater;
        }
        const limiter = new bottleneck_1.default(bottleneckConfig);
        this.setupLimiterEventListeners(limiter, config.id);
        if (config.retryCount && config.retryCount > 0) {
            this.setupRetryLogic(limiter, config);
        }
        this.limiters.set(config.id, limiter);
        logger.info('Created rate limiter', {
            id: config.id,
            strategy: config.strategy,
            maxConcurrent: bottleneckConfig.maxConcurrent,
            minTime: bottleneckConfig.minTime,
            reservoir: bottleneckConfig.reservoir,
        });
        return limiter;
    }
    async executeWithRateLimit(limiterId, task, options = {}) {
        const limiter = this.limiters.get(limiterId);
        if (!limiter) {
            throw new Error(`Rate limiter not found: ${limiterId}`);
        }
        const jobOptions = {
            priority: options.priority || 5,
            weight: options.weight || 1,
        };
        if (options.expiration) {
            jobOptions.expiration = options.expiration;
        }
        try {
            const result = await limiter.schedule(jobOptions, task);
            logger.debug('Rate limited task executed successfully', {
                limiterId,
                priority: options.priority,
                weight: options.weight,
            });
            return result;
        }
        catch (error) {
            logger.error('Rate limited task failed', {
                limiterId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            if (options.retryCount && options.retryCount > 0) {
                return this.executeWithRetry(limiter, task, options.retryCount, limiterId);
            }
            throw error;
        }
    }
    async executeWithRetry(limiter, task, retryCount, limiterId, attempt = 1) {
        try {
            return await limiter.schedule(task);
        }
        catch (error) {
            if (attempt >= retryCount) {
                throw error;
            }
            const backoffDelay = this.calculateBackoffDelay(limiterId, attempt);
            logger.warn('Rate limited task retry', {
                limiterId,
                attempt,
                maxAttempts: retryCount,
                backoffDelay,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
            return this.executeWithRetry(limiter, task, retryCount, limiterId, attempt + 1);
        }
    }
    calculateBackoffDelay(limiterId, attempt) {
        const baseDelay = 1000;
        const strategy = this.backoffStrategies.get('exponential');
        return strategy.calculate(attempt - 1, baseDelay);
    }
    getRateLimiter(id) {
        return this.limiters.get(id);
    }
    getAllRateLimiters() {
        return new Map(this.limiters);
    }
    getRateLimitStats(id) {
        const limiter = this.limiters.get(id);
        if (!limiter)
            return undefined;
        const counts = limiter.counts();
        return {
            id,
            running: counts.RUNNING,
            queued: counts.QUEUED,
            submitted: counts.SUBMITTED,
            done: counts.DONE,
            failed: counts.FAILED,
            retries: counts.RETRIES || 0,
            executing: counts.RUNNING > 0,
            reservoir: limiter.reservoir(),
        };
    }
    getAllRateLimitStats() {
        return Array.from(this.limiters.keys())
            .map(id => this.getRateLimitStats(id))
            .filter(stats => stats !== undefined);
    }
    async updateReservoir(limiterId, reservoir) {
        const limiter = this.limiters.get(limiterId);
        if (!limiter)
            return false;
        await limiter.updateSettings({ reservoir });
        logger.info('Updated rate limiter reservoir', {
            limiterId,
            newReservoir: reservoir,
        });
        return true;
    }
    async incrementReservoir(limiterId, amount = 1) {
        const limiter = this.limiters.get(limiterId);
        if (!limiter)
            return null;
        const newReservoir = await limiter.incrementReservoir(amount);
        logger.debug('Incremented rate limiter reservoir', {
            limiterId,
            amount,
            newReservoir,
        });
        return newReservoir;
    }
    async getQueueLength(limiterId) {
        const limiter = this.limiters.get(limiterId);
        if (!limiter)
            return 0;
        return limiter.queued();
    }
    async clearQueue(limiterId) {
        const limiter = this.limiters.get(limiterId);
        if (!limiter)
            return 0;
        const queueLength = await limiter.queued();
        await limiter.stop({ dropWaitingJobs: true });
        logger.info('Cleared rate limiter queue', {
            limiterId,
            clearedJobs: queueLength,
        });
        return queueLength;
    }
    async pauseRateLimiter(limiterId) {
        const limiter = this.limiters.get(limiterId);
        if (!limiter)
            return false;
        await limiter.stop({ dropWaitingJobs: false });
        logger.info('Paused rate limiter', { limiterId });
        return true;
    }
    async resumeRateLimiter(limiterId) {
        const limiter = this.limiters.get(limiterId);
        if (!limiter)
            return false;
        limiter.start();
        logger.info('Resumed rate limiter', { limiterId });
        return true;
    }
    async removeRateLimiter(limiterId) {
        const limiter = this.limiters.get(limiterId);
        if (!limiter)
            return false;
        await limiter.stop({ dropWaitingJobs: true });
        await limiter.disconnect();
        this.limiters.delete(limiterId);
        logger.info('Removed rate limiter', { limiterId });
        return true;
    }
    async createDocumentCrawlerLimiter(maxConcurrent = 3, minTime = 1000) {
        return this.createRateLimiter({
            id: 'document-crawler',
            strategy: 'leak_bucket',
            maxConcurrent,
            minTime,
            retryCount: 3,
            backoffType: 'exponential',
            backoffDelay: 2000,
        });
    }
    async createWebhookDeliveryLimiter(maxRequests = 100, timeWindow = 60000) {
        return this.createRateLimiter({
            id: 'webhook-delivery',
            strategy: 'fixed_window',
            maxRequests,
            timeWindow,
            maxConcurrent: 10,
            retryCount: 5,
            backoffType: 'exponential',
            backoffDelay: 1000,
        });
    }
    async createAPIRateLimiter(tier) {
        const limits = config_1.config.rateLimiting.api[tier];
        return this.createRateLimiter({
            id: `api-${tier}`,
            strategy: 'sliding_window',
            maxRequests: limits.max === -1 ? 10000 : limits.max,
            timeWindow: this.parseTimeWindow(limits.timeWindow),
            maxConcurrent: Math.ceil(limits.max / 10),
        });
    }
    parseTimeWindow(timeWindow) {
        const match = timeWindow.match(/^(\d+)([hmsd])$/);
        if (!match)
            return 60000;
        const value = parseInt(match[1]);
        const unit = match[2];
        switch (unit) {
            case 's': return value * 1000;
            case 'm': return value * 60 * 1000;
            case 'h': return value * 60 * 60 * 1000;
            case 'd': return value * 24 * 60 * 60 * 1000;
            default: return value * 1000;
        }
    }
    async createDefaultLimiters() {
        await this.createDocumentCrawlerLimiter();
        await this.createWebhookDeliveryLimiter();
        const tiers = ['free', 'starter', 'professional', 'enterprise'];
        for (const tier of tiers) {
            await this.createAPIRateLimiter(tier);
        }
        logger.info('Created default rate limiters', {
            limiters: Array.from(this.limiters.keys()),
        });
    }
    setupLimiterEventListeners(limiter, id) {
        limiter.on('message', (msg) => {
            logger.debug('Rate limiter message', { id, message: msg });
        });
        limiter.on('debug', (message, data) => {
            logger.debug('Rate limiter debug', { id, message, data });
        });
        limiter.on('error', (error) => {
            logger.error('Rate limiter error', {
                id,
                error: error.message
            });
            this.emit('limiterError', { id, error });
        });
        limiter.on('empty', () => {
            logger.debug('Rate limiter queue empty', { id });
            this.emit('limiterEmpty', { id });
        });
        limiter.on('idle', () => {
            logger.debug('Rate limiter idle', { id });
            this.emit('limiterIdle', { id });
        });
        limiter.on('depleted', (empty) => {
            if (empty) {
                logger.warn('Rate limiter reservoir depleted', { id });
                this.emit('limiterDepleted', { id });
            }
        });
        limiter.on('dropped', (dropped) => {
            logger.warn('Rate limiter dropped job', { id, jobId: dropped.job.id });
            this.emit('jobDropped', { id, jobId: dropped.job.id });
        });
    }
    setupRetryLogic(limiter, config) {
        logger.debug('Retry logic configured for rate limiter', {
            id: config.id,
            retryCount: config.retryCount,
            backoffType: config.backoffType,
        });
    }
    startStatsCollection() {
        this.statsCollectionInterval = setInterval(() => {
            const allStats = this.getAllRateLimitStats();
            const summary = {
                totalLimiters: allStats.length,
                totalRunning: allStats.reduce((sum, stats) => sum + stats.running, 0),
                totalQueued: allStats.reduce((sum, stats) => sum + stats.queued, 0),
                totalDone: allStats.reduce((sum, stats) => sum + stats.done, 0),
                totalFailed: allStats.reduce((sum, stats) => sum + stats.failed, 0),
            };
            this.emit('statsUpdate', { allStats, summary });
            logger.debug('Rate limiting stats update', summary);
        }, 30000);
        logger.debug('Started rate limiting stats collection');
    }
    stopStatsCollection() {
        if (this.statsCollectionInterval) {
            clearInterval(this.statsCollectionInterval);
            this.statsCollectionInterval = null;
        }
    }
    async healthCheck() {
        if (!this.initialized) {
            throw new Error('Rate limiting service not initialized');
        }
        await this.redis.ping();
        const allStats = this.getAllRateLimitStats();
        const unhealthyLimiters = allStats.filter(stats => {
            const totalJobs = stats.done + stats.failed;
            const failureRate = totalJobs > 0 ? (stats.failed / totalJobs) * 100 : 0;
            return failureRate > 50;
        });
        if (unhealthyLimiters.length > 0) {
            logger.warn('Unhealthy rate limiters detected', {
                unhealthyLimiters: unhealthyLimiters.map(s => s.id),
            });
        }
        logger.info('Rate limiting service health check completed', {
            totalLimiters: allStats.length,
            unhealthyLimiters: unhealthyLimiters.length,
        });
    }
    getHealthStatus() {
        const allStats = this.getAllRateLimitStats();
        const unhealthyLimiters = allStats.filter(stats => {
            const totalJobs = stats.done + stats.failed;
            const failureRate = totalJobs > 0 ? (stats.failed / totalJobs) * 100 : 0;
            return failureRate > 50;
        }).map(s => s.id);
        return {
            healthy: unhealthyLimiters.length === 0,
            totalLimiters: allStats.length,
            unhealthyLimiters,
            totalRunning: allStats.reduce((sum, stats) => sum + stats.running, 0),
            totalQueued: allStats.reduce((sum, stats) => sum + stats.queued, 0),
        };
    }
    async shutdown() {
        logger.info('Shutting down rate limiting service...');
        this.stopStatsCollection();
        const shutdownPromises = Array.from(this.limiters.entries()).map(async ([id, limiter]) => {
            try {
                await limiter.stop({ dropWaitingJobs: false });
                await limiter.disconnect();
                logger.debug('Shut down rate limiter', { id });
            }
            catch (error) {
                logger.error('Error shutting down rate limiter', {
                    id,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });
        await Promise.allSettled(shutdownPromises);
        await this.redis.disconnect();
        this.limiters.clear();
        this.removeAllListeners();
        this.initialized = false;
        logger.info('Rate limiting service shutdown complete');
    }
}
exports.rateLimitingService = new RateLimitingService();
//# sourceMappingURL=rateLimiting.js.map