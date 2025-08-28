import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'redis';
import config from '../config';
import { logger } from '../utils/logger';

// Create Redis client for rate limiting
const redisClient = Redis.createClient({
  url: config.REDIS_URL,
});

redisClient.on('error', (err) => {
  logger.error('Redis rate limit store error', { error: err });
});

redisClient.connect().catch((err) => {
  logger.error('Failed to connect to Redis for rate limiting', { error: err });
});

/**
 * Standard rate limiting for billing endpoints
 */
export const rateLimitMiddleware = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl_billing:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window per IP
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
    retryAfter: 15 * 60, // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    return req.user?.userId || req.ip;
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  },
  onLimitReached: (req) => {
    logger.warn('Rate limit exceeded', {
      userId: req.user?.userId,
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
  },
});

/**
 * Strict rate limiting for sensitive operations
 */
export const strictRateLimitMiddleware = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl_billing_strict:',
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per hour
  message: {
    success: false,
    error: 'Too many sensitive operations. Please try again in an hour.',
    retryAfter: 60 * 60, // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.userId || req.ip;
  },
  onLimitReached: (req) => {
    logger.warn('Strict rate limit exceeded', {
      userId: req.user?.userId,
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
  },
});

/**
 * Rate limiting for webhook endpoints
 */
export const webhookRateLimitMiddleware = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl_webhook:',
  }),
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // 1000 webhook requests per minute
  message: {
    success: false,
    error: 'Webhook rate limit exceeded',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use source IP for webhooks
    return req.ip;
  },
  onLimitReached: (req) => {
    logger.warn('Webhook rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent'),
    });
  },
});

/**
 * API rate limiting for external integrations
 */
export const apiRateLimitMiddleware = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl_api:',
  }),
  windowMs: 60 * 1000, // 1 minute
  max: (req) => {
    // Different limits based on subscription tier
    const tier = req.user?.subscriptionTier;
    switch (tier) {
      case 'enterprise':
        return 1000;
      case 'team':
        return 500;
      case 'professional':
        return 200;
      case 'starter':
        return 100;
      case 'free':
      default:
        return 50;
    }
  },
  message: (req) => ({
    success: false,
    error: 'API rate limit exceeded for your subscription tier',
    tier: req.user?.subscriptionTier,
    upgradeUrl: `${process.env.FRONTEND_URL}/billing/upgrade`,
  }),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.userId || req.ip;
  },
  onLimitReached: (req) => {
    logger.warn('API rate limit exceeded', {
      userId: req.user?.userId,
      tier: req.user?.subscriptionTier,
      ip: req.ip,
      path: req.path,
    });
  },
});

/**
 * Custom rate limiting for subscription changes
 */
export const subscriptionChangeRateLimit = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl_sub_change:',
  }),
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3, // 3 subscription changes per day
  message: {
    success: false,
    error: 'Too many subscription changes. Please contact support for assistance.',
    supportUrl: `${process.env.FRONTEND_URL}/support`,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return `sub_change:${req.user?.userId}`;
  },
  onLimitReached: (req) => {
    logger.warn('Subscription change rate limit exceeded', {
      userId: req.user?.userId,
      ip: req.ip,
    });
  },
});

/**
 * Custom rate limiting for payment method operations
 */
export const paymentMethodRateLimit = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl_payment:',
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 payment method operations per hour
  message: {
    success: false,
    error: 'Too many payment method operations. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return `payment:${req.user?.userId}`;
  },
  onLimitReached: (req) => {
    logger.warn('Payment method rate limit exceeded', {
      userId: req.user?.userId,
      ip: req.ip,
      path: req.path,
    });
  },
});

/**
 * Rate limiting for invoice operations
 */
export const invoiceRateLimit = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl_invoice:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 invoice operations per 15 minutes
  message: {
    success: false,
    error: 'Too many invoice requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return `invoice:${req.user?.userId}`;
  },
});

/**
 * Usage tracking rate limiting
 */
export const usageTrackingRateLimit = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl_usage:',
  }),
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // 1000 usage tracking requests per minute
  message: {
    success: false,
    error: 'Usage tracking rate limit exceeded',
  },
  standardHeaders: false, // Don't expose rate limit headers for internal usage
  legacyHeaders: false,
  keyGenerator: (req) => {
    return `usage:${req.user?.userId}`;
  },
  skip: (req) => {
    // Allow higher limits for internal service calls
    return req.headers['x-internal-service'] === 'true';
  },
});

/**
 * Middleware to create custom rate limiters
 */
export const createCustomRateLimit = (options: {
  prefix: string;
  windowMs: number;
  max: number | ((req: any) => number);
  message?: string | ((req: any) => any);
  keyGenerator?: (req: any) => string;
  skip?: (req: any) => boolean;
}) => {
  return rateLimit({
    store: new RedisStore({
      client: redisClient,
      prefix: `rl_${options.prefix}:`,
    }),
    windowMs: options.windowMs,
    max: options.max,
    message: options.message || {
      success: false,
      error: 'Rate limit exceeded',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: options.keyGenerator || ((req) => req.user?.userId || req.ip),
    skip: options.skip,
    onLimitReached: (req) => {
      logger.warn(`Rate limit exceeded for ${options.prefix}`, {
        userId: req.user?.userId,
        ip: req.ip,
        path: req.path,
      });
    },
  });
};

export default rateLimitMiddleware;