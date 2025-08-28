import { createServiceLogger } from '@fineprintai/shared-logger';
import Bottleneck from 'bottleneck';
import { Redis } from 'ioredis';
import { config } from '@fineprintai/shared-config';
import { EventEmitter } from 'events';

const logger = createServiceLogger('rate-limiting-service');

interface RateLimitConfig {
  id: string;
  maxConcurrent?: number;
  minTime?: number; // Minimum time between requests (ms)
  maxRequests?: number; // Maximum requests per period
  timeWindow?: number; // Time window in ms
  reservoir?: number; // Number of tokens in bucket
  reservoirRefreshAmount?: number; // Tokens to add on refresh
  reservoirRefreshInterval?: number; // Refresh interval in ms
  strategy?: 'leak_bucket' | 'fixed_window' | 'sliding_window';
  retryCount?: number;
  highWater?: number; // Queue size limit
  backoffType?: 'exponential' | 'linear' | 'fixed';
  backoffDelay?: number;
}

interface RateLimitStats {
  id: string;
  running: number;
  queued: number;
  submitted: number;
  done: number;
  failed: number;
  retries: number;
  executing: boolean;
  reservoir?: number;
}

interface BackoffStrategy {
  calculate(retryCount: number, baseDelay: number): number;
}

class ExponentialBackoff implements BackoffStrategy {
  calculate(retryCount: number, baseDelay: number): number {
    return Math.min(baseDelay * Math.pow(2, retryCount), 300000); // Max 5 minutes
  }
}

class LinearBackoff implements BackoffStrategy {
  calculate(retryCount: number, baseDelay: number): number {
    return Math.min(baseDelay * (retryCount + 1), 300000);
  }
}

class FixedBackoff implements BackoffStrategy {
  calculate(retryCount: number, baseDelay: number): number {
    return baseDelay;
  }
}

class RateLimitingService extends EventEmitter {
  private redis: Redis;
  private limiters = new Map<string, Bottleneck>();
  private backoffStrategies = new Map<string, BackoffStrategy>();
  private initialized = false;
  private statsCollectionInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.redis = new Redis(config.redis.url);
    
    // Initialize backoff strategies
    this.backoffStrategies.set('exponential', new ExponentialBackoff());
    this.backoffStrategies.set('linear', new LinearBackoff());
    this.backoffStrategies.set('fixed', new FixedBackoff());
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing rate limiting service...');
    
    try {
      // Test Redis connection
      await this.redis.ping();
      
      // Create default limiters for common use cases
      await this.createDefaultLimiters();
      
      // Start stats collection
      this.startStatsCollection();
      
      this.initialized = true;
      logger.info('Rate limiting service initialized successfully', {
        limiters: this.limiters.size,
      });
    } catch (error) {
      logger.error('Failed to initialize rate limiting service', { error });
      throw error;
    }
  }

  async createRateLimiter(config: RateLimitConfig): Promise<Bottleneck> {
    if (this.limiters.has(config.id)) {
      logger.warn('Rate limiter already exists, returning existing instance', { 
        id: config.id 
      });
      return this.limiters.get(config.id)!;
    }

    const bottleneckConfig: Bottleneck.ConstructorOptions = {
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

    // Configure based on strategy
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
        // Sliding window is implemented using reservoir with smaller refresh intervals
        const windowSize = config.timeWindow || 60000;
        const buckets = 60; // 60 buckets for sliding window
        const bucketSize = Math.ceil((config.maxRequests || 100) / buckets);
        
        bottleneckConfig.reservoir = buckets * bucketSize;
        bottleneckConfig.reservoirRefreshAmount = bucketSize;
        bottleneckConfig.reservoirRefreshInterval = Math.floor(windowSize / buckets);
        bottleneckConfig.maxConcurrent = config.maxConcurrent;
        break;

      default:
        // Default leak bucket configuration
        bottleneckConfig.maxConcurrent = config.maxConcurrent || 1;
        bottleneckConfig.minTime = config.minTime || 1000;
    }

    // Additional configuration
    if (config.highWater !== undefined) {
      bottleneckConfig.highWater = config.highWater;
    }

    const limiter = new Bottleneck(bottleneckConfig);

    // Setup event listeners
    this.setupLimiterEventListeners(limiter, config.id);

    // Setup retry configuration
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

  async executeWithRateLimit<T>(
    limiterId: string,
    task: () => Promise<T>,
    options: {
      priority?: number;
      weight?: number;
      retryCount?: number;
      expiration?: number;
    } = {}
  ): Promise<T> {
    const limiter = this.limiters.get(limiterId);
    if (!limiter) {
      throw new Error(`Rate limiter not found: ${limiterId}`);
    }

    const jobOptions: Bottleneck.JobOptions = {
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
    } catch (error) {
      logger.error('Rate limited task failed', {
        limiterId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Handle retries if configured
      if (options.retryCount && options.retryCount > 0) {
        return this.executeWithRetry(limiter, task, options.retryCount, limiterId);
      }

      throw error;
    }
  }

  private async executeWithRetry<T>(
    limiter: Bottleneck,
    task: () => Promise<T>,
    retryCount: number,
    limiterId: string,
    attempt: number = 1
  ): Promise<T> {
    try {
      return await limiter.schedule(task);
    } catch (error) {
      if (attempt >= retryCount) {
        throw error;
      }

      // Calculate backoff delay
      const backoffDelay = this.calculateBackoffDelay(limiterId, attempt);
      
      logger.warn('Rate limited task retry', {
        limiterId,
        attempt,
        maxAttempts: retryCount,
        backoffDelay,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, backoffDelay));

      return this.executeWithRetry(limiter, task, retryCount, limiterId, attempt + 1);
    }
  }

  private calculateBackoffDelay(limiterId: string, attempt: number): number {
    // Extract backoff configuration from limiter (would need to store this separately in real implementation)
    const baseDelay = 1000; // Default 1 second
    const strategy = this.backoffStrategies.get('exponential')!; // Default to exponential
    
    return strategy.calculate(attempt - 1, baseDelay);
  }

  getRateLimiter(id: string): Bottleneck | undefined {
    return this.limiters.get(id);
  }

  getAllRateLimiters(): Map<string, Bottleneck> {
    return new Map(this.limiters);
  }

  getRateLimitStats(id: string): RateLimitStats | undefined {
    const limiter = this.limiters.get(id);
    if (!limiter) return undefined;

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

  getAllRateLimitStats(): RateLimitStats[] {
    return Array.from(this.limiters.keys())
      .map(id => this.getRateLimitStats(id))
      .filter(stats => stats !== undefined) as RateLimitStats[];
  }

  // Reservoir management
  async updateReservoir(limiterId: string, reservoir: number): Promise<boolean> {
    const limiter = this.limiters.get(limiterId);
    if (!limiter) return false;

    await limiter.updateSettings({ reservoir });
    
    logger.info('Updated rate limiter reservoir', {
      limiterId,
      newReservoir: reservoir,
    });

    return true;
  }

  async incrementReservoir(limiterId: string, amount: number = 1): Promise<number | null> {
    const limiter = this.limiters.get(limiterId);
    if (!limiter) return null;

    const newReservoir = await limiter.incrementReservoir(amount);
    
    logger.debug('Incremented rate limiter reservoir', {
      limiterId,
      amount,
      newReservoir,
    });

    return newReservoir;
  }

  // Queue management
  async getQueueLength(limiterId: string): Promise<number> {
    const limiter = this.limiters.get(limiterId);
    if (!limiter) return 0;

    return limiter.queued();
  }

  async clearQueue(limiterId: string): Promise<number> {
    const limiter = this.limiters.get(limiterId);
    if (!limiter) return 0;

    const queueLength = await limiter.queued();
    await limiter.stop({ dropWaitingJobs: true });
    
    logger.info('Cleared rate limiter queue', {
      limiterId,
      clearedJobs: queueLength,
    });

    return queueLength;
  }

  // Limiter lifecycle management
  async pauseRateLimiter(limiterId: string): Promise<boolean> {
    const limiter = this.limiters.get(limiterId);
    if (!limiter) return false;

    await limiter.stop({ dropWaitingJobs: false });
    
    logger.info('Paused rate limiter', { limiterId });
    return true;
  }

  async resumeRateLimiter(limiterId: string): Promise<boolean> {
    const limiter = this.limiters.get(limiterId);
    if (!limiter) return false;

    limiter.start();
    
    logger.info('Resumed rate limiter', { limiterId });
    return true;
  }

  async removeRateLimiter(limiterId: string): Promise<boolean> {
    const limiter = this.limiters.get(limiterId);
    if (!limiter) return false;

    await limiter.stop({ dropWaitingJobs: true });
    await limiter.disconnect();
    
    this.limiters.delete(limiterId);
    
    logger.info('Removed rate limiter', { limiterId });
    return true;
  }

  // Batch operations
  async createDocumentCrawlerLimiter(maxConcurrent: number = 3, minTime: number = 1000): Promise<Bottleneck> {
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

  async createWebhookDeliveryLimiter(maxRequests: number = 100, timeWindow: number = 60000): Promise<Bottleneck> {
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

  async createAPIRateLimiter(tier: 'free' | 'starter' | 'professional' | 'enterprise'): Promise<Bottleneck> {
    const limits = config.rateLimiting.api[tier];
    
    return this.createRateLimiter({
      id: `api-${tier}`,
      strategy: 'sliding_window',
      maxRequests: limits.max === -1 ? 10000 : limits.max, // Unlimited becomes high limit
      timeWindow: this.parseTimeWindow(limits.timeWindow),
      maxConcurrent: Math.ceil(limits.max / 10), // Allow 10% of limit as concurrent
    });
  }

  private parseTimeWindow(timeWindow: string): number {
    const match = timeWindow.match(/^(\d+)([hmsd])$/);
    if (!match) return 60000; // Default 1 minute

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

  private async createDefaultLimiters(): Promise<void> {
    // Create default limiters for common operations
    await this.createDocumentCrawlerLimiter();
    await this.createWebhookDeliveryLimiter();

    // Create API limiters for different tiers
    const tiers: ('free' | 'starter' | 'professional' | 'enterprise')[] = 
      ['free', 'starter', 'professional', 'enterprise'];
    
    for (const tier of tiers) {
      await this.createAPIRateLimiter(tier);
    }

    logger.info('Created default rate limiters', {
      limiters: Array.from(this.limiters.keys()),
    });
  }

  private setupLimiterEventListeners(limiter: Bottleneck, id: string): void {
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

  private setupRetryLogic(limiter: Bottleneck, config: RateLimitConfig): void {
    // Bottleneck doesn't have built-in retry logic, so we handle it manually
    // The retry logic is implemented in executeWithRetry method
    
    logger.debug('Retry logic configured for rate limiter', {
      id: config.id,
      retryCount: config.retryCount,
      backoffType: config.backoffType,
    });
  }

  private startStatsCollection(): void {
    // Collect and emit stats every 30 seconds
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

  private stopStatsCollection(): void {
    if (this.statsCollectionInterval) {
      clearInterval(this.statsCollectionInterval);
      this.statsCollectionInterval = null;
    }
  }

  // Health check and diagnostics
  async healthCheck(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Rate limiting service not initialized');
    }

    // Test Redis connection
    await this.redis.ping();

    // Check if any limiters are unhealthy (too many failed jobs)
    const allStats = this.getAllRateLimitStats();
    const unhealthyLimiters = allStats.filter(stats => {
      const totalJobs = stats.done + stats.failed;
      const failureRate = totalJobs > 0 ? (stats.failed / totalJobs) * 100 : 0;
      return failureRate > 50; // More than 50% failure rate
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

  getHealthStatus(): {
    healthy: boolean;
    totalLimiters: number;
    unhealthyLimiters: string[];
    totalRunning: number;
    totalQueued: number;
  } {
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

  async shutdown(): Promise<void> {
    logger.info('Shutting down rate limiting service...');
    
    this.stopStatsCollection();

    // Stop all limiters
    const shutdownPromises = Array.from(this.limiters.entries()).map(async ([id, limiter]) => {
      try {
        await limiter.stop({ dropWaitingJobs: false }); // Don't drop waiting jobs
        await limiter.disconnect();
        logger.debug('Shut down rate limiter', { id });
      } catch (error) {
        logger.error('Error shutting down rate limiter', { 
          id, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    await Promise.allSettled(shutdownPromises);

    // Disconnect Redis
    await this.redis.disconnect();

    this.limiters.clear();
    this.removeAllListeners();
    this.initialized = false;
    
    logger.info('Rate limiting service shutdown complete');
  }
}

export const rateLimitingService = new RateLimitingService();