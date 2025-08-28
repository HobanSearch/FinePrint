import { z } from 'zod';

const configSchema = z.object({
  // Server configuration
  port: z.number().min(1).max(65535).default(3006),
  host: z.string().default('0.0.0.0'),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  
  // CORS configuration
  corsOrigins: z.array(z.string()).default(['http://localhost:3000', 'http://localhost:5173']),
  
  // Database configuration
  databaseUrl: z.string().url(),
  redisUrl: z.string().url(),
  
  // CRM Integrations
  hubspotApiKey: z.string().optional(),
  salesforceClientId: z.string().optional(),
  salesforceClientSecret: z.string().optional(),
  salesforceUsername: z.string().optional(),
  salesforcePassword: z.string().optional(),
  pipedriveApiToken: z.string().optional(),
  
  // AI Configuration
  openaiApiKey: z.string(),
  
  // Queue Configuration
  queuePrefix: z.string().default('sales-agent'),
  
  // Email Configuration
  sendgridApiKey: z.string().optional(),
  emailFrom: z.string().email().default('sales@fineprintai.com'),
  
  // Webhook Configuration
  webhookSecret: z.string().min(32),
  
  // Rate Limiting
  rateLimitMax: z.number().positive().default(1000),
  rateLimitWindow: z.string().default('15 minutes'),
  
  // Logging
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  
  // Feature Flags
  enableLeadScoring: z.boolean().default(true),
  enableAutomation: z.boolean().default(true),
  enableForecasting: z.boolean().default(true),
  enableCrmSync: z.boolean().default(true),
});

const envConfig = {
  port: parseInt(process.env.PORT || '3006', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  
  corsOrigins: process.env.CORS_ORIGINS 
    ? process.env.CORS_ORIGINS.split(',') 
    : ['http://localhost:3000', 'http://localhost:5173'],
  
  databaseUrl: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/fineprintai',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  
  hubspotApiKey: process.env.HUBSPOT_API_KEY,
  salesforceClientId: process.env.SALESFORCE_CLIENT_ID,
  salesforceClientSecret: process.env.SALESFORCE_CLIENT_SECRET,
  salesforceUsername: process.env.SALESFORCE_USERNAME,
  salesforcePassword: process.env.SALESFORCE_PASSWORD,
  pipedriveApiToken: process.env.PIPEDRIVE_API_TOKEN,
  
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  
  queuePrefix: process.env.QUEUE_PREFIX || 'sales-agent',
  
  sendgridApiKey: process.env.SENDGRID_API_KEY,
  emailFrom: process.env.EMAIL_FROM || 'sales@fineprintai.com',
  
  webhookSecret: process.env.WEBHOOK_SECRET || 'your-webhook-secret-key-must-be-at-least-32-chars',
  
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10),
  rateLimitWindow: process.env.RATE_LIMIT_WINDOW || '15 minutes',
  
  logLevel: process.env.LOG_LEVEL || 'info',
  
  enableLeadScoring: process.env.ENABLE_LEAD_SCORING !== 'false',
  enableAutomation: process.env.ENABLE_AUTOMATION !== 'false',
  enableForecasting: process.env.ENABLE_FORECASTING !== 'false',
  enableCrmSync: process.env.ENABLE_CRM_SYNC !== 'false',
};

export const config = configSchema.parse(envConfig);

export type Config = z.infer<typeof configSchema>;