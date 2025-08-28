"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const zod_1 = require("zod");
const configSchema = zod_1.z.object({
    port: zod_1.z.number().min(1).max(65535).default(3006),
    host: zod_1.z.string().default('0.0.0.0'),
    nodeEnv: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    corsOrigins: zod_1.z.array(zod_1.z.string()).default(['http://localhost:3000', 'http://localhost:5173']),
    databaseUrl: zod_1.z.string().url(),
    redisUrl: zod_1.z.string().url(),
    hubspotApiKey: zod_1.z.string().optional(),
    salesforceClientId: zod_1.z.string().optional(),
    salesforceClientSecret: zod_1.z.string().optional(),
    salesforceUsername: zod_1.z.string().optional(),
    salesforcePassword: zod_1.z.string().optional(),
    pipedriveApiToken: zod_1.z.string().optional(),
    openaiApiKey: zod_1.z.string(),
    queuePrefix: zod_1.z.string().default('sales-agent'),
    sendgridApiKey: zod_1.z.string().optional(),
    emailFrom: zod_1.z.string().email().default('sales@fineprintai.com'),
    webhookSecret: zod_1.z.string().min(32),
    rateLimitMax: zod_1.z.number().positive().default(1000),
    rateLimitWindow: zod_1.z.string().default('15 minutes'),
    logLevel: zod_1.z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    enableLeadScoring: zod_1.z.boolean().default(true),
    enableAutomation: zod_1.z.boolean().default(true),
    enableForecasting: zod_1.z.boolean().default(true),
    enableCrmSync: zod_1.z.boolean().default(true),
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
exports.config = configSchema.parse(envConfig);
//# sourceMappingURL=index.js.map