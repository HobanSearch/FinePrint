/**
 * Configuration for External Integrations Service
 */

export const config = {
  service: {
    name: 'external-integrations',
    version: '1.0.0',
    port: parseInt(process.env.PORT || '8010'),
    host: process.env.HOST || '0.0.0.0',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    apiVersion: '2023-10-16',
  },
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY,
    webhookSecret: process.env.SENDGRID_WEBHOOK_SECRET,
    fromEmail: process.env.FROM_EMAIL || 'noreply@fineprintai.com',
    fromName: process.env.FROM_NAME || 'Fine Print AI',
    replyToEmail: process.env.REPLY_TO_EMAIL || 'support@fineprintai.com',
  },
  social: {
    twitter: {
      apiKey: process.env.TWITTER_API_KEY,
      apiSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    },
    linkedin: {
      clientId: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    },
    facebook: {
      appId: process.env.FACEBOOK_APP_ID,
      appSecret: process.env.FACEBOOK_APP_SECRET,
    },
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
  cors: {
    origins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
  },
};