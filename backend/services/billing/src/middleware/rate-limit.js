"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCustomRateLimit = exports.usageTrackingRateLimit = exports.invoiceRateLimit = exports.paymentMethodRateLimit = exports.subscriptionChangeRateLimit = exports.apiRateLimitMiddleware = exports.webhookRateLimitMiddleware = exports.strictRateLimitMiddleware = exports.rateLimitMiddleware = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const rate_limit_redis_1 = __importDefault(require("rate-limit-redis"));
const redis_1 = __importDefault(require("redis"));
const config_1 = __importDefault(require("../config"));
const logger_1 = require("../utils/logger");
const redisClient = redis_1.default.createClient({
    url: config_1.default.REDIS_URL,
});
redisClient.on('error', (err) => {
    logger_1.logger.error('Redis rate limit store error', { error: err });
});
redisClient.connect().catch((err) => {
    logger_1.logger.error('Failed to connect to Redis for rate limiting', { error: err });
});
exports.rateLimitMiddleware = (0, express_rate_limit_1.default)({
    store: new rate_limit_redis_1.default({
        client: redisClient,
        prefix: 'rl_billing:',
    }),
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
        success: false,
        error: 'Too many requests. Please try again later.',
        retryAfter: 15 * 60,
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.user?.userId || req.ip;
    },
    skip: (req) => {
        return req.path === '/health';
    },
    onLimitReached: (req) => {
        logger_1.logger.warn('Rate limit exceeded', {
            userId: req.user?.userId,
            ip: req.ip,
            path: req.path,
            method: req.method,
        });
    },
});
exports.strictRateLimitMiddleware = (0, express_rate_limit_1.default)({
    store: new rate_limit_redis_1.default({
        client: redisClient,
        prefix: 'rl_billing_strict:',
    }),
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: {
        success: false,
        error: 'Too many sensitive operations. Please try again in an hour.',
        retryAfter: 60 * 60,
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.user?.userId || req.ip;
    },
    onLimitReached: (req) => {
        logger_1.logger.warn('Strict rate limit exceeded', {
            userId: req.user?.userId,
            ip: req.ip,
            path: req.path,
            method: req.method,
        });
    },
});
exports.webhookRateLimitMiddleware = (0, express_rate_limit_1.default)({
    store: new rate_limit_redis_1.default({
        client: redisClient,
        prefix: 'rl_webhook:',
    }),
    windowMs: 1 * 60 * 1000,
    max: 1000,
    message: {
        success: false,
        error: 'Webhook rate limit exceeded',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.ip;
    },
    onLimitReached: (req) => {
        logger_1.logger.warn('Webhook rate limit exceeded', {
            ip: req.ip,
            path: req.path,
            userAgent: req.get('User-Agent'),
        });
    },
});
exports.apiRateLimitMiddleware = (0, express_rate_limit_1.default)({
    store: new rate_limit_redis_1.default({
        client: redisClient,
        prefix: 'rl_api:',
    }),
    windowMs: 60 * 1000,
    max: (req) => {
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
        logger_1.logger.warn('API rate limit exceeded', {
            userId: req.user?.userId,
            tier: req.user?.subscriptionTier,
            ip: req.ip,
            path: req.path,
        });
    },
});
exports.subscriptionChangeRateLimit = (0, express_rate_limit_1.default)({
    store: new rate_limit_redis_1.default({
        client: redisClient,
        prefix: 'rl_sub_change:',
    }),
    windowMs: 24 * 60 * 60 * 1000,
    max: 3,
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
        logger_1.logger.warn('Subscription change rate limit exceeded', {
            userId: req.user?.userId,
            ip: req.ip,
        });
    },
});
exports.paymentMethodRateLimit = (0, express_rate_limit_1.default)({
    store: new rate_limit_redis_1.default({
        client: redisClient,
        prefix: 'rl_payment:',
    }),
    windowMs: 60 * 60 * 1000,
    max: 10,
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
        logger_1.logger.warn('Payment method rate limit exceeded', {
            userId: req.user?.userId,
            ip: req.ip,
            path: req.path,
        });
    },
});
exports.invoiceRateLimit = (0, express_rate_limit_1.default)({
    store: new rate_limit_redis_1.default({
        client: redisClient,
        prefix: 'rl_invoice:',
    }),
    windowMs: 15 * 60 * 1000,
    max: 50,
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
exports.usageTrackingRateLimit = (0, express_rate_limit_1.default)({
    store: new rate_limit_redis_1.default({
        client: redisClient,
        prefix: 'rl_usage:',
    }),
    windowMs: 1 * 60 * 1000,
    max: 1000,
    message: {
        success: false,
        error: 'Usage tracking rate limit exceeded',
    },
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return `usage:${req.user?.userId}`;
    },
    skip: (req) => {
        return req.headers['x-internal-service'] === 'true';
    },
});
const createCustomRateLimit = (options) => {
    return (0, express_rate_limit_1.default)({
        store: new rate_limit_redis_1.default({
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
            logger_1.logger.warn(`Rate limit exceeded for ${options.prefix}`, {
                userId: req.user?.userId,
                ip: req.ip,
                path: req.path,
            });
        },
    });
};
exports.createCustomRateLimit = createCustomRateLimit;
exports.default = exports.rateLimitMiddleware;
//# sourceMappingURL=rate-limit.js.map