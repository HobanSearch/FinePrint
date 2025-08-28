/**
 * Fine Print AI - Data Aggregation Service Configuration
 */

export const config = {
  // Server configuration
  host: process.env['HOST'] || '0.0.0.0',
  port: parseInt(process.env['PORT'] || '3005'),
  
  // Logging
  logLevel: process.env['LOG_LEVEL'] || 'info',
  
  // Database
  databaseUrl: process.env['DATABASE_URL'] || 'postgresql://user:password@localhost:5432/fineprintai',
  
  // Redis (for Bull queue)
  redis: {
    host: process.env['REDIS_HOST'] || 'localhost',
    port: parseInt(process.env['REDIS_PORT'] || '6379'),
    password: process.env['REDIS_PASSWORD'],
  },
  
  // Crawling configuration
  crawling: {
    userAgent: process.env['USER_AGENT'] || 'FinePrintAI-Bot/1.0 (+https://fineprintai.com/bot)',
    rateLimitDelay: parseInt(process.env['RATE_LIMIT_DELAY'] || '2000'), // ms
    requestTimeout: parseInt(process.env['REQUEST_TIMEOUT'] || '30000'), // ms
    maxRetries: parseInt(process.env['MAX_RETRIES'] || '3'),
    concurrentRequests: parseInt(process.env['CONCURRENT_REQUESTS'] || '2'),
  },
  
  // Processing configuration
  processing: {
    concurrency: parseInt(process.env['PROCESSING_CONCURRENCY'] || '3'),
    jobTimeout: parseInt(process.env['JOB_TIMEOUT'] || '300000'), // 5 minutes
    queueCleanupInterval: parseInt(process.env['QUEUE_CLEANUP_INTERVAL'] || '3600000'), // 1 hour
  },
  
  // AI Services
  ollama: {
    baseUrl: process.env['OLLAMA_BASE_URL'] || 'http://localhost:11434',
    defaultModel: process.env['OLLAMA_DEFAULT_MODEL'] || 'llama2',
    timeout: parseInt(process.env['OLLAMA_TIMEOUT'] || '60000'),
  },
  
  // Authentication
  serviceAuthToken: process.env['SERVICE_AUTH_TOKEN'] || 'dev-token-change-in-production',
  
  // Monitoring
  monitoring: {
    healthCheckInterval: parseInt(process.env['HEALTH_CHECK_INTERVAL'] || '30000'),
    metricsPort: parseInt(process.env['METRICS_PORT'] || '9090'),
  },
  
  // Feature flags
  features: {
    enableTrendAnalysis: process.env['ENABLE_TREND_ANALYSIS'] !== 'false',
    enableComplianceMonitoring: process.env['ENABLE_COMPLIANCE_MONITORING'] !== 'false',
    enablePublicApi: process.env['ENABLE_PUBLIC_API'] !== 'false',
  },
  
  // External services
  external: {
    analysisServiceUrl: process.env['ANALYSIS_SERVICE_URL'] || 'http://localhost:3002',
    notificationServiceUrl: process.env['NOTIFICATION_SERVICE_URL'] || 'http://localhost:3006',
  },
  
  // Data retention
  dataRetention: {
    documentVersions: parseInt(process.env['DOCUMENT_VERSION_RETENTION'] || '10'),
    analysisHistoryDays: parseInt(process.env['ANALYSIS_HISTORY_DAYS'] || '365'),
    alertHistoryDays: parseInt(process.env['ALERT_HISTORY_DAYS'] || '90'),
  },
};