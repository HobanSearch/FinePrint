/**
 * Rate Limiting Middleware for Business Agents API
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { UserTier } from '../types';
import { config } from '../config';
import { AuthenticatedRequest } from './auth.middleware';
import { createLogger } from '../utils/logger';
import Redis from 'ioredis';

const logger = createLogger('rate-limit-middleware');

class RateLimiter {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      keyPrefix: 'rate-limit:'
    });
  }

  async checkLimit(
    key: string,
    limit: number,
    window: string
  ): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
    const windowSeconds = this.parseWindow(window);
    const now = Date.now();
    const windowStart = now - (windowSeconds * 1000);

    // Use Redis sorted set for sliding window rate limiting
    const redisKey = `${key}:${Math.floor(now / (windowSeconds * 1000))}`;

    try {
      // Remove old entries
      await this.redis.zremrangebyscore(redisKey, '-inf', windowStart);

      // Count current requests in window
      const currentCount = await this.redis.zcard(redisKey);

      if (currentCount >= limit) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date(now + (windowSeconds * 1000))
        };
      }

      // Add current request
      await this.redis.zadd(redisKey, now, `${now}-${Math.random()}`);
      await this.redis.expire(redisKey, windowSeconds);

      return {
        allowed: true,
        remaining: limit - currentCount - 1,
        resetAt: new Date(now + (windowSeconds * 1000))
      };
    } catch (error) {
      logger.error('Rate limit check failed:', error);
      // On error, allow the request but log it
      return {
        allowed: true,
        remaining: limit,
        resetAt: new Date(now + (windowSeconds * 1000))
      };
    }
  }

  private parseWindow(window: string): number {
    const match = window.match(/(\d+)([smhd])/);
    if (!match) {
      return 3600; // Default to 1 hour
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return 3600;
    }
  }
}

const rateLimiter = new RateLimiter();

export async function rateLimitMiddleware(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const user = request.user;
    const tier = user?.tier || UserTier.FREE;
    const limits = config.rateLimits[tier];

    if (!limits) {
      logger.warn(`No rate limits configured for tier: ${tier}`);
      return;
    }

    // Create rate limit key
    const identifier = user?.id || request.ip;
    const endpoint = `${request.method}:${request.routerPath}`;
    const key = `${tier}:${identifier}:${endpoint}`;

    // Check rate limit
    const result = await rateLimiter.checkLimit(
      key,
      limits.requests,
      limits.window
    );

    // Set headers
    reply.header('X-RateLimit-Limit', limits.requests);
    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', result.resetAt.toISOString());
    reply.header('X-RateLimit-Tier', tier);

    if (!result.allowed) {
      logger.warn({
        userId: user?.id,
        tier,
        endpoint,
        msg: 'Rate limit exceeded'
      });

      return reply.code(429).send({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        tier,
        limit: limits.requests,
        window: limits.window,
        resetAt: result.resetAt
      });
    }

    // Log if approaching limit
    if (result.remaining < limits.requests * 0.1) {
      logger.info({
        userId: user?.id,
        tier,
        endpoint,
        remaining: result.remaining,
        msg: 'Approaching rate limit'
      });
    }
  } catch (error) {
    logger.error('Rate limit middleware error:', error);
    // On error, allow the request but log it
  }
}

export function createEndpointRateLimit(
  requests: number,
  window: string
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const identifier = request.ip;
    const endpoint = `${request.method}:${request.routerPath}`;
    const key = `endpoint:${endpoint}:${identifier}`;

    const result = await rateLimiter.checkLimit(key, requests, window);

    reply.header('X-RateLimit-Limit', requests);
    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', result.resetAt.toISOString());

    if (!result.allowed) {
      logger.warn({
        ip: identifier,
        endpoint,
        msg: 'Endpoint rate limit exceeded'
      });

      return reply.code(429).send({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests to this endpoint',
        limit: requests,
        window,
        resetAt: result.resetAt
      });
    }
  };
}