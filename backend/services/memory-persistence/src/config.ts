/**
 * Configuration for Memory Persistence Service
 */

export const config = {
  service: {
    name: 'memory-persistence',
    version: '1.0.0',
    port: parseInt(process.env.PORT || '8009'),
    host: process.env.HOST || '0.0.0.0',
  },
  database: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'fineprintai',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
  s3: {
    bucket: process.env.S3_BUCKET || 'fineprintai-memories',
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  cors: {
    origins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
  },
};