import { Socket } from 'socket.io';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { cache } from '@fineprintai/shared-cache';
import { config } from '@fineprintai/shared-config';

const logger = createServiceLogger('rate-limiter');

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (socket: Socket) => string;
  onLimitReached?: (socket: Socket, info: RateLimitInfo) => void;
}

export interface RateLimitInfo {
  totalHits: number;
  totalHitsInWindow: number;
  remainingPoints: number;
  msBeforeNext: number;
  isFirstInWindow: boolean;
}

export interface RateLimitRule {
  name: string;
  config: RateLimitConfig;
  eventTypes?: string[]; // Specific events this rule applies to
  userTypes?: string[]; // User types this rule applies to (e.g., 'premium', 'free')
}

export class RateLimiter {
  private rules: Map<string, RateLimitRule> = new Map();
  private initialized = false;

  constructor() {
    this.setupDefaultRules();
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load custom rules from configuration or database
      await this.loadCustomRules();

      this.initialized = true;
      logger.info('Rate limiter initialized successfully', {
        rulesCount: this.rules.size,
        rules: Array.from(this.rules.keys()),
      });
    } catch (error) {
      logger.error('Failed to initialize rate limiter', { error });
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      // Clear all rate limit data
      const keys = await cache.keys('ratelimit:*');
      if (keys.length > 0) {
        await Promise.all(keys.map(key => cache.del(key)));
      }

      this.rules.clear();
      this.initialized = false;
      logger.info('Rate limiter shut down successfully');
    } catch (error) {
      logger.error('Error during rate limiter shutdown', { error });
    }
  }

  public async checkLimit(socket: Socket, eventType?: string): Promise<boolean> {
    try {
      // Get applicable rules for this socket/event
      const applicableRules = this.getApplicableRules(socket, eventType);
      
      // Check each rule
      for (const rule of applicableRules) {
        const allowed = await this.checkRule(socket, rule, eventType);
        if (!allowed) {
          logger.debug('Rate limit exceeded', {
            userId: socket.userId,
            socketId: socket.id,
            rule: rule.name,
            eventType,
          });
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Error checking rate limit', { error, socketId: socket.id, eventType });
      // Fail open - allow request if there's an error
      return true;
    }
  }

  public async recordRequest(
    socket: Socket, 
    eventType?: string, 
    success: boolean = true
  ): Promise<void> {
    try {
      const applicableRules = this.getApplicableRules(socket, eventType);
      
      for (const rule of applicableRules) {
        // Skip recording based on rule configuration
        if (success && rule.config.skipSuccessfulRequests) continue;
        if (!success && rule.config.skipFailedRequests) continue;

        await this.recordForRule(socket, rule, eventType);
      }
    } catch (error) {
      logger.error('Error recording request', { error, socketId: socket.id, eventType });
    }
  }

  public async getRateLimitInfo(
    socket: Socket, 
    ruleName: string
  ): Promise<RateLimitInfo | null> {
    try {
      const rule = this.rules.get(ruleName);
      if (!rule) return null;

      const key = this.generateKey(socket, rule);
      const windowStart = this.getWindowStart(rule.config.windowMs);
      const cacheKey = `${key}:${windowStart}`;

      const hits = await cache.get(cacheKey) || 0;
      const remaining = Math.max(0, rule.config.maxRequests - hits);
      const resetTime = windowStart + rule.config.windowMs;
      const msBeforeNext = Math.max(0, resetTime - Date.now());

      return {
        totalHits: hits,
        totalHitsInWindow: hits,
        remainingPoints: remaining,
        msBeforeNext,
        isFirstInWindow: hits === 0,
      };
    } catch (error) {
      logger.error('Error getting rate limit info', { error, socketId: socket.id, ruleName });
      return null;
    }
  }

  public async resetUserLimits(userId: string): Promise<void> {
    try {
      const keys = await cache.keys(`ratelimit:user:${userId}:*`);
      if (keys.length > 0) {
        await Promise.all(keys.map(key => cache.del(key)));
      }

      logger.info('User rate limits reset', { userId, keysCleared: keys.length });
    } catch (error) {
      logger.error('Error resetting user limits', { error, userId });
    }
  }

  public async getGlobalStats(): Promise<{
    totalRequests: number;
    blockedRequests: number;
    topUsers: Array<{ userId: string; requests: number }>;
    topIPs: Array<{ ip: string; requests: number }>;
  }> {
    try {
      // Get global counters
      const totalRequests = await cache.get('ratelimit:global:total') || 0;
      const blockedRequests = await cache.get('ratelimit:global:blocked') || 0;

      // Get top users and IPs (simplified - would need more sophisticated tracking)
      const userKeys = await cache.keys('ratelimit:user:*');
      const ipKeys = await cache.keys('ratelimit:ip:*');

      const topUsers = await this.getTopEntries(userKeys, 'user');
      const topIPs = await this.getTopEntries(ipKeys, 'ip');

      return {
        totalRequests,
        blockedRequests,
        topUsers,
        topIPs,
      };
    } catch (error) {
      logger.error('Error getting global stats', { error });
      return {
        totalRequests: 0,
        blockedRequests: 0,
        topUsers: [],
        topIPs: [],
      };
    }
  }

  public addRule(rule: RateLimitRule): void {
    this.rules.set(rule.name, rule);
    logger.info('Rate limit rule added', { ruleName: rule.name, config: rule.config });
  }

  public removeRule(ruleName: string): boolean {
    const removed = this.rules.delete(ruleName);
    if (removed) {
      logger.info('Rate limit rule removed', { ruleName });
    }
    return removed;
  }

  public getRules(): RateLimitRule[] {
    return Array.from(this.rules.values());
  }

  // Private methods

  private setupDefaultRules(): void {
    // Connection rate limit
    this.addRule({
      name: 'connection',
      config: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 10, // 10 connections per minute per IP
        keyGenerator: (socket) => `ip:${this.getClientIP(socket)}`,
      },
    });

    // Message rate limit for regular users
    this.addRule({
      name: 'messages_regular',
      config: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 60, // 60 messages per minute
        keyGenerator: (socket) => `user:${socket.userId}`,
      },
      userTypes: ['free', 'basic'],
    });

    // Message rate limit for premium users
    this.addRule({
      name: 'messages_premium',
      config: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 120, // 120 messages per minute
        keyGenerator: (socket) => `user:${socket.userId}`,
      },
      userTypes: ['premium', 'enterprise'],
    });

    // Subscription rate limit
    this.addRule({
      name: 'subscriptions',
      config: {
        windowMs: 5 * 60 * 1000, // 5 minutes
        maxRequests: 50, // 50 subscription changes per 5 minutes
        keyGenerator: (socket) => `user:${socket.userId}`,
      },
      eventTypes: ['subscribe', 'unsubscribe'],
    });

    // Analysis request rate limit
    this.addRule({
      name: 'analysis_requests',
      config: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 10, // 10 analysis requests per minute
        keyGenerator: (socket) => `user:${socket.userId}`,
      },
      eventTypes: ['request_analysis_status', 'start_analysis'],
    });

    // Global rate limit per IP
    this.addRule({
      name: 'global_ip',
      config: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 300, // 300 requests per minute per IP
        keyGenerator: (socket) => `ip:${this.getClientIP(socket)}`,
        onLimitReached: (socket, info) => {
          this.handleGlobalIPLimit(socket, info);
        },
      },
    });
  }

  private async loadCustomRules(): Promise<void> {
    try {
      // Load custom rules from configuration
      const customRules = config.websocket?.rateLimiting?.customRules || [];
      
      for (const ruleConfig of customRules) {
        this.addRule(ruleConfig);
      }

      logger.debug('Custom rate limit rules loaded', { count: customRules.length });
    } catch (error) {
      logger.error('Error loading custom rules', { error });
    }
  }

  private getApplicableRules(socket: Socket, eventType?: string): RateLimitRule[] {
    const applicableRules: RateLimitRule[] = [];

    for (const rule of this.rules.values()) {
      // Check if rule applies to this event type
      if (rule.eventTypes && eventType && !rule.eventTypes.includes(eventType)) {
        continue;
      }

      // Check if rule applies to this user type
      if (rule.userTypes) {
        const userType = this.getUserType(socket);
        if (!rule.userTypes.includes(userType)) {
          continue;
        }
      }

      applicableRules.push(rule);
    }

    return applicableRules;
  }

  private async checkRule(
    socket: Socket, 
    rule: RateLimitRule, 
    eventType?: string
  ): Promise<boolean> {
    const key = this.generateKey(socket, rule);
    const windowStart = this.getWindowStart(rule.config.windowMs);
    const cacheKey = `${key}:${windowStart}`;

    try {
      const currentHits = await cache.get(cacheKey) || 0;
      
      if (currentHits >= rule.config.maxRequests) {
        // Rate limit exceeded
        await this.incrementBlockedCounter(socket);
        
        if (rule.config.onLimitReached) {
          const info = await this.getRateLimitInfo(socket, rule.name);
          if (info) {
            rule.config.onLimitReached(socket, info);
          }
        }
        
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error checking rate limit rule', { error, rule: rule.name });
      return true; // Fail open
    }
  }

  private async recordForRule(
    socket: Socket, 
    rule: RateLimitRule, 
    eventType?: string
  ): Promise<void> {
    const key = this.generateKey(socket, rule);
    const windowStart = this.getWindowStart(rule.config.windowMs);
    const cacheKey = `${key}:${windowStart}`;
    const ttl = Math.ceil(rule.config.windowMs / 1000);

    try {
      await cache.increment(cacheKey);
      await cache.expire(cacheKey, ttl);

      // Update global counter
      await cache.increment('ratelimit:global:total');
    } catch (error) {
      logger.error('Error recording request for rule', { error, rule: rule.name });
    }
  }

  private generateKey(socket: Socket, rule: RateLimitRule): string {
    if (rule.config.keyGenerator) {
      return `ratelimit:${rule.config.keyGenerator(socket)}`;
    }

    // Default key generator
    return `ratelimit:user:${socket.userId}`;
  }

  private getWindowStart(windowMs: number): number {
    return Math.floor(Date.now() / windowMs) * windowMs;
  }

  private getClientIP(socket: Socket): string {
    return socket.handshake.headers['x-forwarded-for'] as string ||
           socket.handshake.headers['x-real-ip'] as string ||
           socket.handshake.address ||
           'unknown';
  }

  private getUserType(socket: Socket): string {
    // This would typically come from the user's subscription or role
    // For now, we'll use a simple check based on user properties
    if (socket.isAdmin) return 'admin';
    
    // Would check user's subscription tier from database/cache
    // For now, default to 'free'
    return 'free';
  }

  private async incrementBlockedCounter(socket: Socket): Promise<void> {
    try {
      await cache.increment('ratelimit:global:blocked');
      await cache.increment(`ratelimit:user:${socket.userId}:blocked`);
    } catch (error) {
      logger.error('Error incrementing blocked counter', { error });
    }
  }

  private async getTopEntries(
    keys: string[], 
    type: 'user' | 'ip'
  ): Promise<Array<{ userId?: string; ip?: string; requests: number }>> {
    try {
      const entries = [];
      
      for (const key of keys.slice(0, 100)) { // Limit to 100 for performance
        const requests = await cache.get(key) || 0;
        if (requests > 0) {
          const identifier = key.split(':')[2]; // Extract user ID or IP
          
          if (type === 'user') {
            entries.push({ userId: identifier, requests });
          } else {
            entries.push({ ip: identifier, requests });
          }
        }
      }

      // Sort by requests (descending) and return top 10
      return entries
        .sort((a, b) => b.requests - a.requests)
        .slice(0, 10);
    } catch (error) {
      logger.error('Error getting top entries', { error, type });
      return [];
    }
  }

  private handleGlobalIPLimit(socket: Socket, info: RateLimitInfo): void {
    const ip = this.getClientIP(socket);
    
    logger.warn('Global IP rate limit exceeded', {
      ip,
      userId: socket.userId,
      socketId: socket.id,
      totalHits: info.totalHits,
      msBeforeNext: info.msBeforeNext,
    });

    // Could implement additional actions here:
    // 1. Temporary IP ban
    // 2. CAPTCHA challenge
    // 3. Notification to security team
  }

  // Middleware for socket events
  public createEventMiddleware() {
    return async (socket: Socket, eventType: string, next: Function) => {
      try {
        const allowed = await this.checkLimit(socket, eventType);
        
        if (!allowed) {
          socket.emit('rate_limit_exceeded', {
            event: eventType,
            message: 'Rate limit exceeded',
            retryAfter: 60, // seconds
            timestamp: new Date(),
          });
          return; // Don't call next()
        }

        // Record the request
        await this.recordRequest(socket, eventType, true);
        
        next();
      } catch (error) {
        logger.error('Error in rate limit middleware', { error, socketId: socket.id, eventType });
        next(); // Continue on error
      }
    };
  }

  // Cleanup old rate limit data
  public async cleanup(): Promise<void> {
    try {
      const keys = await cache.keys('ratelimit:*');
      let cleanedCount = 0;

      for (const key of keys) {
        const ttl = await cache.ttl(key);
        if (ttl === -1) { // Keys without expiration
          await cache.del(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.info('Rate limit cleanup completed', { cleanedKeys: cleanedCount });
      }
    } catch (error) {
      logger.error('Error during rate limit cleanup', { error });
    }
  }
}