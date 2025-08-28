// Advanced Rate Limiting Implementation
// Multi-layer rate limiting with sliding window, distributed counters, and threat detection

import { FastifyRequest, FastifyReply } from 'fastify';
import * as Redis from 'ioredis';
import { RateLimitError, SecurityUtils } from '../index';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (request: FastifyRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  onLimitReached?: (request: FastifyRequest) => void;
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
}

export interface RateLimitRule {
  name: string;
  path?: string | RegExp;
  method?: string | string[];
  condition?: (request: FastifyRequest) => boolean;
  config: RateLimitConfig;
  priority: number;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
  retryAfter?: number;
}

export interface SlidingWindowEntry {
  count: number;
  windowStart: number;
  requests: number[];
}

export interface ThreatMetrics {
  suspiciousIPs: Set<string>;
  blockedIPs: Set<string>;
  rateLimitViolations: Map<string, number>;
  lastViolation: Map<string, number>;
}

export class AdvancedRateLimiter {
  private redis: Redis;
  private rules: RateLimitRule[] = [];
  private threatMetrics: ThreatMetrics;
  private readonly keyPrefix = 'ratelimit:';
  private readonly threatKeyPrefix = 'threat:';

  constructor(redisClient: Redis) {
    this.redis = redisClient;
    this.threatMetrics = {
      suspiciousIPs: new Set(),
      blockedIPs: new Set(),
      rateLimitViolations: new Map(),
      lastViolation: new Map()
    };

    // Initialize default rules
    this.initializeDefaultRules();
    
    // Start cleanup job
    this.startCleanupJob();
  }

  /**
   * Add rate limiting rule
   */
  addRule(rule: RateLimitRule): void {
    // Insert rule in priority order
    const insertIndex = this.rules.findIndex(r => r.priority > rule.priority);
    if (insertIndex === -1) {
      this.rules.push(rule);
    } else {
      this.rules.splice(insertIndex, 0, rule);
    }
  }

  /**
   * Create rate limiting middleware
   */
  middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      // Find applicable rules
      const applicableRules = this.findApplicableRules(request);
      
      // Check if IP is blocked
      const clientIP = SecurityUtils.extractClientIP(request);
      if (this.threatMetrics.blockedIPs.has(clientIP)) {
        throw new RateLimitError('IP address is blocked due to suspicious activity');
      }

      // Apply rules in priority order
      for (const rule of applicableRules) {
        await this.applyRule(request, reply, rule);
      }

      // Update threat metrics
      await this.updateThreatMetrics(clientIP, false);
    };
  }

  /**
   * Apply rate limiting rule
   */
  private async applyRule(
    request: FastifyRequest, 
    reply: FastifyReply, 
    rule: RateLimitRule
  ): Promise<void> {
    const key = this.generateKey(request, rule);
    const now = Date.now();
    const windowStart = now - rule.config.windowMs;

    try {
      // Use sliding window counter with Redis
      const result = await this.slidingWindowCheck(
        key,
        rule.config.maxRequests,
        rule.config.windowMs,
        now
      );

      const rateLimitInfo: RateLimitInfo = {
        limit: rule.config.maxRequests,
        remaining: Math.max(0, rule.config.maxRequests - result.count),
        reset: new Date(result.windowStart + rule.config.windowMs),
        retryAfter: result.count >= rule.config.maxRequests 
          ? Math.ceil((result.windowStart + rule.config.windowMs - now) / 1000)
          : undefined
      };

      // Set standard headers
      if (rule.config.standardHeaders !== false) {
        reply.header('RateLimit-Limit', rateLimitInfo.limit.toString());
        reply.header('RateLimit-Remaining', rateLimitInfo.remaining.toString());
        reply.header('RateLimit-Reset', Math.ceil(rateLimitInfo.reset.getTime() / 1000).toString());
      }

      // Set legacy headers
      if (rule.config.legacyHeaders) {
        reply.header('X-RateLimit-Limit', rateLimitInfo.limit.toString());
        reply.header('X-RateLimit-Remaining', rateLimitInfo.remaining.toString());
        reply.header('X-RateLimit-Reset', Math.ceil(rateLimitInfo.reset.getTime() / 1000).toString());
      }

      // Check if limit exceeded
      if (result.count > rule.config.maxRequests) {
        // Update threat metrics
        const clientIP = SecurityUtils.extractClientIP(request);
        await this.updateThreatMetrics(clientIP, true);

        // Call limit reached callback
        if (rule.config.onLimitReached) {
          rule.config.onLimitReached(request);
        }

        // Set retry-after header
        if (rateLimitInfo.retryAfter) {
          reply.header('Retry-After', rateLimitInfo.retryAfter.toString());
        }

        // Log rate limit violation
        request.log.warn('Rate limit exceeded', {
          rule: rule.name,
          clientIP,
          userAgent: request.headers['user-agent'],
          path: request.url,
          method: request.method,
          count: result.count,
          limit: rule.config.maxRequests
        });

        throw new RateLimitError(rule.config.message || 'Too many requests');
      }

    } catch (error) {
      if (error instanceof RateLimitError) {
        throw error;
      }
      
      // Log Redis errors but don't block requests
      request.log.error('Rate limiter error', { error, rule: rule.name });
    }
  }

  /**
   * Sliding window rate limiting with Redis
   */
  private async slidingWindowCheck(
    key: string,
    limit: number,
    windowMs: number,
    now: number
  ): Promise<SlidingWindowEntry> {
    const windowStart = now - windowMs;
    const redisKey = `${this.keyPrefix}${key}`;

    // Lua script for atomic sliding window check
    const luaScript = `
      local key = KEYS[1]
      local window_start = tonumber(ARGV[1])
      local window_ms = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local limit = tonumber(ARGV[4])
      
      -- Remove expired entries
      redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
      
      -- Get current count
      local count = redis.call('ZCARD', key)
      
      -- Add current request
      redis.call('ZADD', key, now, now .. ':' .. math.random())
      
      -- Set expiration
      redis.call('EXPIRE', key, math.ceil(window_ms / 1000))
      
      -- Return count and window info
      return {count + 1, window_start}
    `;

    const result = await this.redis.eval(
      luaScript,
      1,
      redisKey,
      windowStart.toString(),
      windowMs.toString(),
      now.toString(),
      limit.toString()
    ) as [number, number];

    return {
      count: result[0],
      windowStart: result[1],
      requests: [] // Not needed for this implementation
    };
  }

  /**
   * Generate rate limit key
   */
  private generateKey(request: FastifyRequest, rule: RateLimitRule): string {
    if (rule.config.keyGenerator) {
      return rule.config.keyGenerator(request);
    }

    // Default key: IP + User Agent hash + Rule name
    const clientIP = SecurityUtils.extractClientIP(request);
    const userAgent = request.headers['user-agent'] || '';
    const userAgentHash = require('crypto')
      .createHash('md5')
      .update(userAgent)
      .digest('hex')
      .substring(0, 8);

    return `${rule.name}:${clientIP}:${userAgentHash}`;
  }

  /**
   * Find applicable rules for request
   */
  private findApplicableRules(request: FastifyRequest): RateLimitRule[] {
    return this.rules.filter(rule => {
      // Check path match
      if (rule.path) {
        if (typeof rule.path === 'string') {
          if (!request.url.startsWith(rule.path)) return false;
        } else if (rule.path instanceof RegExp) {
          if (!rule.path.test(request.url)) return false;
        }
      }

      // Check method match
      if (rule.method) {
        const methods = Array.isArray(rule.method) ? rule.method : [rule.method];
        if (!methods.includes(request.method)) return false;
      }

      // Check custom condition
      if (rule.condition && !rule.condition(request)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Update threat metrics
   */
  private async updateThreatMetrics(clientIP: string, isViolation: boolean): Promise<void> {
    const now = Date.now();

    if (isViolation) {
      // Increment violation count
      const currentCount = this.threatMetrics.rateLimitViolations.get(clientIP) || 0;
      this.threatMetrics.rateLimitViolations.set(clientIP, currentCount + 1);
      this.threatMetrics.lastViolation.set(clientIP, now);

      // Check if IP should be marked as suspicious
      if (currentCount >= 3) {
        this.threatMetrics.suspiciousIPs.add(clientIP);
      }

      // Check if IP should be blocked
      if (currentCount >= 10) {
        this.threatMetrics.blockedIPs.add(clientIP);
        
        // Store in Redis for distributed blocking
        await this.redis.setex(
          `${this.threatKeyPrefix}blocked:${clientIP}`,
          3600, // 1 hour block
          now.toString()
        );
      }
    }
  }

  /**
   * Initialize default rate limiting rules
   */
  private initializeDefaultRules(): void {
    // Global rate limit
    this.addRule({
      name: 'global',
      config: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 1000,
        message: 'Too many requests from this IP'
      },
      priority: 1000
    });

    // API rate limit
    this.addRule({
      name: 'api',
      path: '/api',
      config: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 100,
        message: 'API rate limit exceeded'
      },
      priority: 900
    });

    // Authentication endpoints
    this.addRule({
      name: 'auth',
      path: '/api/auth',
      config: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 10,
        message: 'Too many authentication attempts'
      },
      priority: 100
    });

    // Login specific
    this.addRule({
      name: 'login',
      path: '/api/auth/login',
      method: 'POST',
      config: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 5,
        message: 'Too many login attempts'
      },
      priority: 50
    });

    // Password reset
    this.addRule({
      name: 'password-reset',
      path: '/api/auth/reset-password',
      method: 'POST',
      config: {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 3,
        message: 'Too many password reset attempts'
      },
      priority: 50
    });

    // Analysis endpoints (resource intensive)
    this.addRule({
      name: 'analysis',
      path: '/api/analysis',
      method: 'POST',
      config: {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 50,
        message: 'Analysis rate limit exceeded'
      },
      priority: 200
    });

    // File upload
    this.addRule({
      name: 'upload',
      path: '/api/documents/upload',
      method: 'POST',
      config: {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 20,
        message: 'Upload rate limit exceeded'
      },
      priority: 200
    });
  }

  /**
   * Get rate limit status for a request
   */
  async getRateLimitStatus(request: FastifyRequest): Promise<{ [ruleName: string]: RateLimitInfo }> {
    const applicableRules = this.findApplicableRules(request);
    const status: { [ruleName: string]: RateLimitInfo } = {};

    for (const rule of applicableRules) {
      const key = this.generateKey(request, rule);
      const now = Date.now();

      try {
        const result = await this.slidingWindowCheck(
          key,
          rule.config.maxRequests,
          rule.config.windowMs,
          now
        );

        status[rule.name] = {
          limit: rule.config.maxRequests,
          remaining: Math.max(0, rule.config.maxRequests - result.count),
          reset: new Date(result.windowStart + rule.config.windowMs)
        };
      } catch (error) {
        // Skip failed checks
      }
    }

    return status;
  }

  /**
   * Manually block IP address
   */
  async blockIP(ip: string, durationMs: number = 3600000): Promise<void> {
    this.threatMetrics.blockedIPs.add(ip);
    await this.redis.setex(
      `${this.threatKeyPrefix}blocked:${ip}`,
      Math.ceil(durationMs / 1000),
      Date.now().toString()
    );
  }

  /**
   * Unblock IP address
   */
  async unblockIP(ip: string): Promise<void> {
    this.threatMetrics.blockedIPs.delete(ip);
    this.threatMetrics.suspiciousIPs.delete(ip);
    this.threatMetrics.rateLimitViolations.delete(ip);
    this.threatMetrics.lastViolation.delete(ip);
    
    await this.redis.del(`${this.threatKeyPrefix}blocked:${ip}`);
  }

  /**
   * Get threat metrics
   */
  getThreatMetrics(): ThreatMetrics {
    return {
      suspiciousIPs: new Set(this.threatMetrics.suspiciousIPs),
      blockedIPs: new Set(this.threatMetrics.blockedIPs),
      rateLimitViolations: new Map(this.threatMetrics.rateLimitViolations),
      lastViolation: new Map(this.threatMetrics.lastViolation)
    };
  }

  /**
   * Reset rate limit for key
   */
  async resetRateLimit(key: string): Promise<void> {
    await this.redis.del(`${this.keyPrefix}${key}`);
  }

  /**
   * Start cleanup job for expired data
   */
  private startCleanupJob(): void {
    setInterval(async () => {
      try {
        // Clean up expired blocked IPs
        const blockedKeys = await this.redis.keys(`${this.threatKeyPrefix}blocked:*`);
        const pipeline = this.redis.pipeline();
        
        for (const key of blockedKeys) {
          const ttl = await this.redis.ttl(key);
          if (ttl <= 0) {
            const ip = key.replace(`${this.threatKeyPrefix}blocked:`, '');
            this.threatMetrics.blockedIPs.delete(ip);
            pipeline.del(key);
          }
        }
        
        await pipeline.exec();

        // Clean up old violation records
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        for (const [ip, lastViolation] of this.threatMetrics.lastViolation.entries()) {
          if (lastViolation < oneHourAgo) {
            this.threatMetrics.rateLimitViolations.delete(ip);
            this.threatMetrics.lastViolation.delete(ip);
            this.threatMetrics.suspiciousIPs.delete(ip);
          }
        }
      } catch (error) {
        console.error('Rate limiter cleanup error:', error);
      }
    }, 5 * 60 * 1000); // Run every 5 minutes
  }

  /**
   * Create IP-based rate limiter for specific endpoint
   */
  createIPLimiter(config: RateLimitConfig): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const rule: RateLimitRule = {
        name: 'custom-ip-limiter',
        config: {
          ...config,
          keyGenerator: config.keyGenerator || ((req) => SecurityUtils.extractClientIP(req))
        },
        priority: 500
      };

      await this.applyRule(request, reply, rule);
    };
  }

  /**
   * Create user-based rate limiter
   */
  createUserLimiter(config: RateLimitConfig): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const rule: RateLimitRule = {
        name: 'custom-user-limiter',
        config: {
          ...config,
          keyGenerator: config.keyGenerator || ((req) => {
            const authHeader = req.headers.authorization;
            if (authHeader) {
              try {
                const token = authHeader.split(' ')[1];
                const jwt = require('jsonwebtoken');
                const decoded = jwt.decode(token) as any;
                return decoded?.sub || SecurityUtils.extractClientIP(req);
              } catch {
                return SecurityUtils.extractClientIP(req);
              }
            }
            return SecurityUtils.extractClientIP(req);
          })
        },
        priority: 500
      };

      await this.applyRule(request, reply, rule);
    };
  }
}

// Export factory function
export function createRateLimiter(redisClient: Redis): AdvancedRateLimiter {
  return new AdvancedRateLimiter(redisClient);
}