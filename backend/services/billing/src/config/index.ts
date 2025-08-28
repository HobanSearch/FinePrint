import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  // Server Config
  PORT: z.string().default('3003'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Database
  DATABASE_URL: z.string(),
  
  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  
  // Stripe
  STRIPE_SECRET_KEY: z.string(),
  STRIPE_PUBLISHABLE_KEY: z.string(),
  STRIPE_WEBHOOK_SECRET: z.string(),
  STRIPE_API_VERSION: z.string().default('2023-10-16'),
  
  // JWT
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default('24h'),
  
  // Tax Services
  TAXJAR_API_KEY: z.string().optional(),
  AVATAX_API_KEY: z.string().optional(),
  
  // External Services
  SENDGRID_API_KEY: z.string(),
  HUBSPOT_API_KEY: z.string().optional(),
  
  // Security
  ENCRYPTION_KEY: z.string(),
  
  // Feature Flags
  ENABLE_TAX_CALCULATION: z.string().default('true'),
  ENABLE_DUNNING_MANAGEMENT: z.string().default('true'),
  ENABLE_MULTI_CURRENCY: z.string().default('true'),
  ENABLE_REVENUE_RECOGNITION: z.string().default('true'),
  
  // Billing Config
  TRIAL_PERIOD_DAYS: z.string().default('14'),
  GRACE_PERIOD_DAYS: z.string().default('3'),
  DUNNING_RETRY_ATTEMPTS: z.string().default('3'),
  INVOICE_PAYMENT_TERMS_DAYS: z.string().default('30'),
  
  // Usage Limits
  FREE_TIER_ANALYSES_LIMIT: z.string().default('3'),
  STARTER_TIER_ANALYSES_LIMIT: z.string().default('20'),
  OVERAGE_COST_PER_ANALYSIS: z.string().default('0.50'),
  API_OVERAGE_COST_PER_CALL: z.string().default('0.01'),
});

type Config = z.infer<typeof configSchema>;

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

let config: Config;

try {
  config = configSchema.parse(rawConfig);
} catch (error) {
  console.error('Invalid configuration:', error);
  process.exit(1);
}

// Pricing configuration
export const PRICING_TIERS = {
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
      analysesPerMonth: -1, // unlimited
      monitoring: -1, // unlimited
      browserExtension: true,
      apiAccess: 1000, // API calls per month
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
      analysesPerMonth: -1, // unlimited
      monitoring: -1, // unlimited
      browserExtension: true,
      apiAccess: 10000, // API calls per month
      teamMembers: 5,
      support: 'phone',
      customPatterns: true,
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: null, // custom pricing
    currency: 'usd',
    interval: 'month',
    features: {
      analysesPerMonth: -1, // unlimited
      monitoring: -1, // unlimited
      browserExtension: true,
      apiAccess: -1, // unlimited
      teamMembers: -1, // unlimited
      support: 'dedicated',
      customPatterns: true,
      onPremise: true,
      sla: true,
    },
  },
} as const;

export const USAGE_COSTS = {
  analysisOverage: parseFloat(config.OVERAGE_COST_PER_ANALYSIS),
  apiOverage: parseFloat(config.API_OVERAGE_COST_PER_CALL),
};

export const BILLING_CONFIG = {
  trialPeriodDays: parseInt(config.TRIAL_PERIOD_DAYS),
  gracePeriodDays: parseInt(config.GRACE_PERIOD_DAYS),
  dunningRetryAttempts: parseInt(config.DUNNING_RETRY_ATTEMPTS),
  invoicePaymentTermsDays: parseInt(config.INVOICE_PAYMENT_TERMS_DAYS),
};

export default config;