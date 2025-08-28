"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BILLING_CONFIG = exports.USAGE_COSTS = exports.PRICING_TIERS = void 0;
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const configSchema = zod_1.z.object({
    PORT: zod_1.z.string().default('3003'),
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    DATABASE_URL: zod_1.z.string(),
    REDIS_URL: zod_1.z.string().default('redis://localhost:6379'),
    STRIPE_SECRET_KEY: zod_1.z.string(),
    STRIPE_PUBLISHABLE_KEY: zod_1.z.string(),
    STRIPE_WEBHOOK_SECRET: zod_1.z.string(),
    STRIPE_API_VERSION: zod_1.z.string().default('2023-10-16'),
    JWT_SECRET: zod_1.z.string(),
    JWT_EXPIRES_IN: zod_1.z.string().default('24h'),
    TAXJAR_API_KEY: zod_1.z.string().optional(),
    AVATAX_API_KEY: zod_1.z.string().optional(),
    SENDGRID_API_KEY: zod_1.z.string(),
    HUBSPOT_API_KEY: zod_1.z.string().optional(),
    ENCRYPTION_KEY: zod_1.z.string(),
    ENABLE_TAX_CALCULATION: zod_1.z.string().default('true'),
    ENABLE_DUNNING_MANAGEMENT: zod_1.z.string().default('true'),
    ENABLE_MULTI_CURRENCY: zod_1.z.string().default('true'),
    ENABLE_REVENUE_RECOGNITION: zod_1.z.string().default('true'),
    TRIAL_PERIOD_DAYS: zod_1.z.string().default('14'),
    GRACE_PERIOD_DAYS: zod_1.z.string().default('3'),
    DUNNING_RETRY_ATTEMPTS: zod_1.z.string().default('3'),
    INVOICE_PAYMENT_TERMS_DAYS: zod_1.z.string().default('30'),
    FREE_TIER_ANALYSES_LIMIT: zod_1.z.string().default('3'),
    STARTER_TIER_ANALYSES_LIMIT: zod_1.z.string().default('20'),
    OVERAGE_COST_PER_ANALYSIS: zod_1.z.string().default('0.50'),
    API_OVERAGE_COST_PER_CALL: zod_1.z.string().default('0.01'),
});
const rawConfig = {
    PORT: process.env.PORT,
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_API_VERSION: process.env.STRIPE_API_VERSION,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
    TAXJAR_API_KEY: process.env.TAXJAR_API_KEY,
    AVATAX_API_KEY: process.env.AVATAX_API_KEY,
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    HUBSPOT_API_KEY: process.env.HUBSPOT_API_KEY,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    ENABLE_TAX_CALCULATION: process.env.ENABLE_TAX_CALCULATION,
    ENABLE_DUNNING_MANAGEMENT: process.env.ENABLE_DUNNING_MANAGEMENT,
    ENABLE_MULTI_CURRENCY: process.env.ENABLE_MULTI_CURRENCY,
    ENABLE_REVENUE_RECOGNITION: process.env.ENABLE_REVENUE_RECOGNITION,
    TRIAL_PERIOD_DAYS: process.env.TRIAL_PERIOD_DAYS,
    GRACE_PERIOD_DAYS: process.env.GRACE_PERIOD_DAYS,
    DUNNING_RETRY_ATTEMPTS: process.env.DUNNING_RETRY_ATTEMPTS,
    INVOICE_PAYMENT_TERMS_DAYS: process.env.INVOICE_PAYMENT_TERMS_DAYS,
    FREE_TIER_ANALYSES_LIMIT: process.env.FREE_TIER_ANALYSES_LIMIT,
    STARTER_TIER_ANALYSES_LIMIT: process.env.STARTER_TIER_ANALYSES_LIMIT,
    OVERAGE_COST_PER_ANALYSIS: process.env.OVERAGE_COST_PER_ANALYSIS,
    API_OVERAGE_COST_PER_CALL: process.env.API_OVERAGE_COST_PER_CALL,
};
let config;
try {
    config = configSchema.parse(rawConfig);
}
catch (error) {
    console.error('Invalid configuration:', error);
    process.exit(1);
}
exports.PRICING_TIERS = {
    free: {
        id: 'free',
        name: 'Free',
        price: 0,
        currency: 'usd',
        interval: null,
        features: {
            analysesPerMonth: parseInt(config.FREE_TIER_ANALYSES_LIMIT),
            monitoring: false,
            browserExtension: false,
            apiAccess: false,
            teamMembers: 1,
            support: 'community',
            customPatterns: false,
        },
    },
    starter: {
        id: 'starter',
        name: 'Starter',
        price: 9.00,
        currency: 'usd',
        interval: 'month',
        stripeProductId: process.env.STRIPE_STARTER_PRODUCT_ID,
        stripePriceId: process.env.STRIPE_STARTER_PRICE_ID,
        features: {
            analysesPerMonth: parseInt(config.STARTER_TIER_ANALYSES_LIMIT),
            monitoring: 5,
            browserExtension: false,
            apiAccess: false,
            teamMembers: 1,
            support: 'standard',
            customPatterns: false,
        },
    },
    professional: {
        id: 'professional',
        name: 'Professional',
        price: 29.00,
        currency: 'usd',
        interval: 'month',
        stripeProductId: process.env.STRIPE_PROFESSIONAL_PRODUCT_ID,
        stripePriceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID,
        features: {
            analysesPerMonth: -1,
            monitoring: -1,
            browserExtension: true,
            apiAccess: 1000,
            teamMembers: 1,
            support: 'priority',
            customPatterns: false,
        },
    },
    team: {
        id: 'team',
        name: 'Team',
        price: 99.00,
        currency: 'usd',
        interval: 'month',
        stripeProductId: process.env.STRIPE_TEAM_PRODUCT_ID,
        stripePriceId: process.env.STRIPE_TEAM_PRICE_ID,
        features: {
            analysesPerMonth: -1,
            monitoring: -1,
            browserExtension: true,
            apiAccess: 10000,
            teamMembers: 5,
            support: 'phone',
            customPatterns: true,
        },
    },
    enterprise: {
        id: 'enterprise',
        name: 'Enterprise',
        price: null,
        currency: 'usd',
        interval: 'month',
        features: {
            analysesPerMonth: -1,
            monitoring: -1,
            browserExtension: true,
            apiAccess: -1,
            teamMembers: -1,
            support: 'dedicated',
            customPatterns: true,
            onPremise: true,
            sla: true,
        },
    },
};
exports.USAGE_COSTS = {
    analysisOverage: parseFloat(config.OVERAGE_COST_PER_ANALYSIS),
    apiOverage: parseFloat(config.API_OVERAGE_COST_PER_CALL),
};
exports.BILLING_CONFIG = {
    trialPeriodDays: parseInt(config.TRIAL_PERIOD_DAYS),
    gracePeriodDays: parseInt(config.GRACE_PERIOD_DAYS),
    dunningRetryAttempts: parseInt(config.DUNNING_RETRY_ATTEMPTS),
    invoicePaymentTermsDays: parseInt(config.INVOICE_PAYMENT_TERMS_DAYS),
};
exports.default = config;
//# sourceMappingURL=index.js.map