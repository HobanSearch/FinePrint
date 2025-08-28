import * as crypto from 'crypto';
import { CacheManager } from '@fineprintai/cache';
import { createServiceLogger } from '@fineprintai/logger';
import {
  RateLimitConfig,
  RateLimitRule,
  RateLimitRequest,
  RateLimitInfo,
  RateLimitAttempt,
  RateLimitBucket,
  RateLimitStats,
  DynamicRateLimit,
  SuspiciousActivityPattern
} from './types';

const logger = createServiceLogger('rate-limiter');

export class AuthRateLimiter {
  private cache: CacheManager;
  private config: RateLimitConfig;
  private rules: Map<string, RateLimitRule> = new Map();
  private suspiciousActivityPatterns: SuspiciousActivityPattern[] = [];

  constructor(cache: CacheManager, config: RateLimitConfig) {
    this.cache = cache;
    this.config = config;
    this.initializeRules();
    this.initializeSuspiciousActivityPatterns();
  }

  /**
   * Initialize rate limiting rules
   */
  private initializeRules(): void {
    for (const rule of this.config.rules) {
      this.rules.set(rule.id, rule);
    }

    logger.info('Rate limiting rules initialized', {
      ruleCount: this.rules.size
    });
  }

  /**
   * Initialize suspicious activity detection patterns
   */
  private initializeSuspiciousActivityPatterns(): void {
    this.suspiciousActivityPatterns = [
      {
        id: 'rapid-fire-requests',
        name: 'Rapid Fire Requests',
        description: 'Too many requests in very short time',
        detector: (attempts) => {
          const recent = attempts.filter(a => 
            Date.now() - a.timestamp.getTime() < 10000 // Last 10 seconds
          );
          return recent.length >= 20;
        },
        severity: 'high',
        action: 'block',
        blockDuration: 300000 // 5 minutes
      },
      {
        id: 'pattern-brute-force',
        name: 'Brute Force Pattern',
        description: 'Systematic password attempts',
        detector: (attempts, context) => {
          const failed = attempts.filter(a => !a.success);
          const recent = failed.filter(a => 
            Date.now() - a.timestamp.getTime() < 300000 // Last 5 minutes
          );
          return recent.length >= 10;
        },
        severity: 'critical',
        action: 'escalate',
        blockDuration: 900000 // 15 minutes
      },
      {
        id: 'distributed-attack',
        name: 'Distributed Attack',
        description: 'Attack from multiple IPs with same pattern',
        detector: (attempts, context) => {
          // This would need cross-IP analysis
          return false; // Placeholder
        },
        severity: 'critical',
        action: 'alert',
        blockDuration: 1800000 // 30 minutes
      },
      {
        id: 'credential-stuffing',
        name: 'Credential Stuffing',
        description: 'Using leaked credentials',
        detector: (attempts, context) => {
          // Look for high failure rate with varied user agents
          const uniqueUserAgents = new Set(
            attempts.map(a => a.metadata?.userAgent).filter(Boolean)
          );
          const failureRate = attempts.filter(a => !a.success).length / attempts.length;
          
          return uniqueUserAgents.size > 5 && failureRate > 0.8;
        },
        severity: 'high',
        action: 'block',
        blockDuration: 600000 // 10 minutes
      }
    ];

    logger.info('Suspicious activity patterns initialized', {
      patternCount: this.suspiciousActivityPatterns.length
    });
  }

  /**
   * Check if request should be rate limited
   */
  async checkRateLimit(request: RateLimitRequest): Promise<RateLimitInfo> {
    try {
      // Find applicable rule
      const rule = this.findApplicableRule(request);
      if (!rule) {
        return this.createPassInfo(request);
      }

      // Check if request should be skipped
      if (this.shouldSkipRequest(request, rule)) {
        return this.createPassInfo(request, rule);
      }

      // Generate cache key
      const key = this.generateKey(request, rule);

      // Get or create bucket
      const bucket = await this.getBucket(key, rule);

      // Check if currently blocked
      if (bucket.blocked && bucket.blockedUntil && bucket.blockedUntil > new Date()) {
        return this.createBlockedInfo(bucket, rule, key);
      }

      // Calculate current window
      const now = new Date();
      const windowStart = new Date(now.getTime() - rule.windowMs);

      // Filter attempts within current window
      const windowAttempts = bucket.attempts.filter(
        attempt => attempt.timestamp >= windowStart
      );

      // Calculate total weight in current window
      const currentWeight = windowAttempts.reduce((sum, attempt) => sum + attempt.weight, 0);

      // Check if limit would be exceeded
      const requestWeight = this.calculateRequestWeight(request, rule);
      
      if (currentWeight + requestWeight > rule.max) {
        // Block the bucket if configured
        if (rule.blockDuration) {
          bucket.blocked = true;
          bucket.blockedUntil = new Date(now.getTime() + rule.blockDuration);
        }

        await this.updateBucket(key, bucket, rule);
        
        // Check for suspicious patterns
        await this.checkSuspiciousActivity(key, bucket, request);

        return this.createLimitExceededInfo(bucket, rule, key, windowAttempts);
      }

      // Allow request - update bucket
      const attempt: RateLimitAttempt = {
        timestamp: now,
        success: true, // Will be updated later if needed
        weight: requestWeight,
        metadata: {
          userAgent: request.userAgent,
          path: request.path,
          userId: request.userId
        }
      };

      bucket.attempts.push(attempt);
      bucket.totalAttempts++;
      bucket.totalWeight += requestWeight;
      bucket.lastAttempt = now;

      // Keep only attempts within the window (plus some buffer for analysis)
      const analysisWindow = Math.max(rule.windowMs * 2, 3600000); // At least 1 hour for analysis
      const analysisStart = new Date(now.getTime() - analysisWindow);
      bucket.attempts = bucket.attempts.filter(a => a.timestamp >= analysisStart);

      await this.updateBucket(key, bucket, rule);

      return this.createAllowedInfo(bucket, rule, key, windowAttempts, requestWeight);
    } catch (error) {
      logger.error('Rate limit check failed', { error, request: request.path });
      // Fail open - allow request if rate limiter fails
      return this.createPassInfo(request);
    }
  }

  /**
   * Record the result of a request (success/failure)
   */
  async recordResult(key: string, success: boolean, metadata?: Record<string, any>): Promise<void> {
    try {
      const bucket = await this.cache.get<RateLimitBucket>(`rate-limit:${key}`);
      if (!bucket || bucket.attempts.length === 0) {
        return;
      }

      // Update the most recent attempt
      const lastAttempt = bucket.attempts[bucket.attempts.length - 1];
      lastAttempt.success = success;
      if (metadata) {
        lastAttempt.metadata = { ...lastAttempt.metadata, ...metadata };
      }

      // Find the rule to get TTL
      const rule = this.rules.get(bucket.rule);
      if (rule) {
        await this.updateBucket(key.replace('rate-limit:', ''), bucket, rule);
      }

      logger.debug('Request result recorded', { key, success });
    } catch (error) {
      logger.error('Failed to record request result', { error, key, success });
    }
  }

  /**
   * Apply dynamic rate limit for specific user
   */
  async applyDynamicRateLimit(
    userId: string,
    multiplier: number,
    duration: number,
    reason: string
  ): Promise<void> {
    try {
      const dynamicLimit: DynamicRateLimit = {
        userId,
        multiplier,
        expires: new Date(Date.now() + duration),
        reason
      };

      await this.cache.set(
        `dynamic-rate-limit:${userId}`,
        dynamicLimit,
        Math.floor(duration / 1000)
      );

      logger.info('Dynamic rate limit applied', {
        userId: userId.substring(0, 8) + '...',
        multiplier,
        duration,
        reason
      });
    } catch (error) {
      logger.error('Failed to apply dynamic rate limit', { error, userId });
    }
  }

  /**
   * Remove dynamic rate limit for user
   */
  async removeDynamicRateLimit(userId: string): Promise<void> {
    try {
      await this.cache.del(`dynamic-rate-limit:${userId}`);
      
      logger.info('Dynamic rate limit removed', {
        userId: userId.substring(0, 8) + '...'
      });
    } catch (error) {
      logger.error('Failed to remove dynamic rate limit', { error, userId });
    }
  }

  /**
   * Block IP address globally
   */
  async blockIP(
    ip: string,
    duration: number,
    reason: string,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): Promise<void> {
    try {
      const blockInfo = {
        ip,
        reason,
        severity,
        blockedAt: new Date(),
        expiresAt: new Date(Date.now() + duration)
      };

      await this.cache.set(
        `ip-block:${ip}`,
        blockInfo,
        Math.floor(duration / 1000)
      );

      logger.warn('IP address blocked', {
        ip,
        duration,
        reason,
        severity
      });
    } catch (error) {
      logger.error('Failed to block IP address', { error, ip });
    }
  }

  /**
   * Unblock IP address
   */
  async unblockIP(ip: string): Promise<void> {
    try {
      await this.cache.del(`ip-block:${ip}`);
      
      logger.info('IP address unblocked', { ip });
    } catch (error) {
      logger.error('Failed to unblock IP address', { error, ip });
    }
  }

  /**
   * Check if IP is blocked
   */
  async isIPBlocked(ip: string): Promise<boolean> {
    try {
      const blockInfo = await this.cache.get(`ip-block:${ip}`);
      return !!blockInfo;
    } catch (error) {
      logger.error('Failed to check IP block status', { error, ip });
      return false;
    }
  }

  /**
   * Get rate limit statistics
   */
  async getStats(): Promise<RateLimitStats> {
    try {
      const bucketKeys = await this.cache.keys('rate-limit:*');
      
      let totalRequests = 0;
      let blockedRequests = 0;
      const ruleStats: Record<string, { requests: number; blocked: number; averageWeight: number }> = {};
      const ipCounts: Record<string, number> = {};
      const endpointCounts: Record<string, number> = {};

      for (const key of bucketKeys) {
        const bucket = await this.cache.get<RateLimitBucket>(key);
        if (!bucket) continue;

        totalRequests += bucket.totalAttempts;
        
        if (bucket.blocked) {
          blockedRequests++;
        }

        // Rule stats
        if (!ruleStats[bucket.rule]) {
          ruleStats[bucket.rule] = { requests: 0, blocked: 0, averageWeight: 0 };
        }
        
        ruleStats[bucket.rule].requests += bucket.totalAttempts;
        if (bucket.blocked) {
          ruleStats[bucket.rule].blocked++;
        }
        
        const totalWeight = bucket.attempts.reduce((sum, a) => sum + a.weight, 0);
        ruleStats[bucket.rule].averageWeight = totalWeight / bucket.attempts.length || 0;

        // Extract IP and endpoint from key for top lists
        const keyParts = key.split(':');
        if (keyParts.length >= 3) {
          const ip = keyParts[keyParts.length - 1];
          ipCounts[ip] = (ipCounts[ip] || 0) + (bucket.blocked ? 1 : 0);
        }
      }

      // Get top blocked IPs
      const topBlockedIPs = Object.entries(ipCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([ip, count]) => ({ ip, count }));

      // Get top blocked endpoints (from rule names)
      const topBlockedEndpoints = Object.entries(ruleStats)
        .sort(([, a], [, b]) => b.blocked - a.blocked)
        .slice(0, 10)
        .map(([endpoint, stats]) => ({ endpoint, count: stats.blocked }));

      return {
        totalRequests,
        blockedRequests,
        ruleStats,
        topBlockedIPs,
        topBlockedEndpoints
      };
    } catch (error) {
      logger.error('Failed to get rate limit stats', { error });
      return {
        totalRequests: 0,
        blockedRequests: 0,
        ruleStats: {},
        topBlockedIPs: [],
        topBlockedEndpoints: []
      };
    }
  }

  /**
   * Find applicable rule for request
   */
  private findApplicableRule(request: RateLimitRequest): RateLimitRule | null {
    for (const rule of this.rules.values()) {
      if (this.matchesRule(request, rule)) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Check if request matches rule
   */
  private matchesRule(request: RateLimitRequest, rule: RateLimitRule): boolean {
    // Check endpoint pattern
    if (typeof rule.endpoint === 'string') {
      if (!request.path.includes(rule.endpoint)) {
        return false;
      }
    } else if (rule.endpoint instanceof RegExp) {
      if (!rule.endpoint.test(request.path)) {
        return false;
      }
    }

    // Check method
    if (rule.method) {
      const methods = Array.isArray(rule.method) ? rule.method : [rule.method];
      if (!methods.includes(request.method)) {
        return false;
      }
    }

    // Check condition
    if (rule.condition && !rule.condition(request)) {
      return false;
    }

    return true;
  }

  /**
   * Check if request should be skipped
   */
  private shouldSkipRequest(request: RateLimitRequest, rule: RateLimitRule): boolean {
    // Global skip function
    if (this.config.skipFunction && this.config.skipFunction(request)) {
      return true;
    }

    // Check if IP is globally blocked
    // Note: We'll check this separately in the middleware
    
    return false;
  }

  /**
   * Generate cache key for rate limiting
   */
  private generateKey(request: RateLimitRequest, rule: RateLimitRule): string {
    // Use rule-specific key generator if available
    if (rule.keyGenerator) {
      return rule.keyGenerator(request);
    }

    // Use global key generator
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(request);
    }

    // Default key generation
    const parts = [rule.id];
    
    // Add user ID if available (user-specific limits)
    if (request.userId) {
      parts.push(`user:${request.userId}`);
    } else {
      // Fall back to IP-based limiting
      parts.push(`ip:${request.ip}`);
    }

    return parts.join(':');
  }

  /**
   * Get or create rate limit bucket
   */
  private async getBucket(key: string, rule: RateLimitRule): Promise<RateLimitBucket> {
    const cacheKey = `rate-limit:${key}`;
    let bucket = await this.cache.get<RateLimitBucket>(cacheKey);

    if (!bucket) {
      bucket = {
        attempts: [],
        totalAttempts: 0,
        totalWeight: 0,
        blocked: false,
        createdAt: new Date(),
        lastAttempt: new Date(),
        rule: rule.id
      };
    }

    return bucket;
  }

  /**
   * Update rate limit bucket in cache
   */
  private async updateBucket(key: string, bucket: RateLimitBucket, rule: RateLimitRule): Promise<void> {
    const cacheKey = `rate-limit:${key}`;
    const ttl = Math.max(
      Math.floor(rule.windowMs / 1000),
      Math.floor((rule.blockDuration || 0) / 1000),
      3600 // At least 1 hour for analysis
    );
    
    await this.cache.set(cacheKey, bucket, ttl);
  }

  /**
   * Calculate weight for request
   */
  private calculateRequestWeight(request: RateLimitRequest, rule: RateLimitRule): number {
    let weight = 1;

    // Apply rule-specific weights
    if (rule.weights) {
      if (request.path && rule.weights[request.path]) {
        weight = rule.weights[request.path];
      } else if (request.method && rule.weights[request.method]) {
        weight = rule.weights[request.method];
      }
    }

    // Apply dynamic rate limit multiplier if exists
    if (request.userId) {
      // This would be checked asynchronously in practice
      // For now, just return the base weight
    }

    return weight;
  }

  /**
   * Check for suspicious activity patterns
   */
  private async checkSuspiciousActivity(
    key: string,
    bucket: RateLimitBucket,
    request: RateLimitRequest
  ): Promise<void> {
    try {
      for (const pattern of this.suspiciousActivityPatterns) {
        const context = {
          ip: request.ip,
          userId: request.userId,
          path: request.path,
          userAgent: request.userAgent
        };

        if (pattern.detector(bucket.attempts, context)) {
          logger.warn('Suspicious activity pattern detected', {
            pattern: pattern.name,
            severity: pattern.severity,
            key,
            ip: request.ip,
            userId: request.userId?.substring(0, 8) + '...'
          });

          // Take action based on pattern
          switch (pattern.action) {
            case 'block':
              await this.blockIP(request.ip, pattern.blockDuration, pattern.name, pattern.severity);
              break;

            case 'alert':
              // In production, send alert to security team
              logger.error('Security alert triggered', {
                pattern: pattern.name,
                severity: pattern.severity,
                context
              });
              break;

            case 'escalate':
              // Block and alert
              await this.blockIP(request.ip, pattern.blockDuration, pattern.name, pattern.severity);
              logger.error('Security escalation triggered', {
                pattern: pattern.name,
                severity: pattern.severity,
                context
              });
              break;
          }

          // Log to audit trail
          await this.cache.lpush('audit:suspicious-activity', {
            pattern: pattern.name,
            severity: pattern.severity,
            action: pattern.action,
            context,
            timestamp: new Date()
          });

          break; // Only apply first matching pattern
        }
      }
    } catch (error) {
      logger.error('Failed to check suspicious activity', { error, key });
    }
  }

  /**
   * Create rate limit info for allowed request
   */
  private createAllowedInfo(
    bucket: RateLimitBucket,
    rule: RateLimitRule,
    key: string,
    windowAttempts: RateLimitAttempt[],
    requestWeight: number
  ): RateLimitInfo {
    const currentWeight = windowAttempts.reduce((sum, attempt) => sum + attempt.weight, 0);
    const remaining = Math.max(0, rule.max - currentWeight - requestWeight);
    const reset = new Date(Date.now() + rule.windowMs);

    return {
      total: rule.max,
      remaining,
      reset,
      blocked: false,
      rule,
      key
    };
  }

  /**
   * Create rate limit info for blocked request
   */
  private createBlockedInfo(bucket: RateLimitBucket, rule: RateLimitRule, key: string): RateLimitInfo {
    const retryAfter = bucket.blockedUntil 
      ? Math.ceil((bucket.blockedUntil.getTime() - Date.now()) / 1000)
      : Math.ceil(rule.windowMs / 1000);

    return {
      total: rule.max,
      remaining: 0,
      reset: bucket.blockedUntil || new Date(Date.now() + rule.windowMs),
      retryAfter,
      blocked: true,
      rule,
      key
    };
  }

  /**
   * Create rate limit info for limit exceeded
   */
  private createLimitExceededInfo(
    bucket: RateLimitBucket,
    rule: RateLimitRule,
    key: string,
    windowAttempts: RateLimitAttempt[]
  ): RateLimitInfo {
    const retryAfter = rule.blockDuration
      ? Math.ceil(rule.blockDuration / 1000)
      : Math.ceil(rule.windowMs / 1000);

    return {
      total: rule.max,
      remaining: 0,
      reset: new Date(Date.now() + rule.windowMs),
      retryAfter,
      blocked: true,
      rule,
      key
    };
  }

  /**
   * Create rate limit info for passed request (no applicable rule)
   */
  private createPassInfo(request: RateLimitRequest, rule?: RateLimitRule): RateLimitInfo {
    return {
      total: Infinity,
      remaining: Infinity,
      reset: new Date(Date.now() + 3600000), // 1 hour from now
      blocked: false,
      rule: rule || {
        id: 'none',
        name: 'No Limit',
        endpoint: request.path,
        windowMs: 3600000,
        max: Infinity
      },
      key: 'pass'
    };
  }

  /**
   * Cleanup expired buckets and perform maintenance
   */
  async performMaintenance(): Promise<void> {
    try {
      logger.info('Starting rate limiter maintenance');

      const bucketKeys = await this.cache.keys('rate-limit:*');
      let cleanedBuckets = 0;
      let cleanedAttempts = 0;

      for (const key of bucketKeys) {
        const bucket = await this.cache.get<RateLimitBucket>(key);
        if (!bucket) continue;

        const rule = this.rules.get(bucket.rule);
        if (!rule) {
          // Rule no longer exists, remove bucket
          await this.cache.del(key);
          cleanedBuckets++;
          continue;
        }

        // Clean old attempts
        const cutoff = new Date(Date.now() - (rule.windowMs * 2));
        const originalLength = bucket.attempts.length;
        bucket.attempts = bucket.attempts.filter(a => a.timestamp > cutoff);
        
        if (bucket.attempts.length !== originalLength) {
          cleanedAttempts += originalLength - bucket.attempts.length;
          await this.updateBucket(key.replace('rate-limit:', ''), bucket, rule);
        }

        // Remove expired blocks
        if (bucket.blocked && bucket.blockedUntil && bucket.blockedUntil < new Date()) {
          bucket.blocked = false;
          bucket.blockedUntil = undefined;
          await this.updateBucket(key.replace('rate-limit:', ''), bucket, rule);
        }
      }

      // Clean up expired IP blocks
      const ipBlockKeys = await this.cache.keys('ip-block:*');
      let cleanedIPBlocks = 0;

      for (const key of ipBlockKeys) {
        const blockInfo = await this.cache.get(key);
        if (blockInfo && blockInfo.expiresAt < new Date()) {
          await this.cache.del(key);
          cleanedIPBlocks++;
        }
      }

      logger.info('Rate limiter maintenance completed', {
        cleanedBuckets,
        cleanedAttempts,
        cleanedIPBlocks
      });
    } catch (error) {
      logger.error('Rate limiter maintenance failed', { error });
    }
  }
}