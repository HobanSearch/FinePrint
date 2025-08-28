/**
 * DevOps Agent Configuration
 * Centralized configuration management for all DevOps automation features
 */

import { z } from 'zod';

// Environment validation schema
const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.string().transform(Number).default('8015'),
  HOST: z.string().default('0.0.0.0'),
  
  // Database Configuration
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  
  // Authentication
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default('24h'),
  
  // Cloud Providers
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-west-2'),
  
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  GOOGLE_PROJECT_ID: z.string().optional(),
  
  AZURE_CLIENT_ID: z.string().optional(),
  AZURE_CLIENT_SECRET: z.string().optional(),
  AZURE_TENANT_ID: z.string().optional(),
  
  // Kubernetes Configuration
  KUBECONFIG: z.string().optional(),
  K8S_NAMESPACE: z.string().default('fineprintai'),
  
  // Git Configuration
  GITHUB_TOKEN: z.string().optional(),
  GITLAB_TOKEN: z.string().optional(),
  
  // Terraform Configuration
  TERRAFORM_VERSION: z.string().default('1.6.0'),
  TERRAFORM_BACKEND_BUCKET: z.string().optional(),
  
  // Monitoring Configuration
  PROMETHEUS_URL: z.string().default('http://localhost:9090'),
  GRAFANA_URL: z.string().default('http://localhost:3000'),
  GRAFANA_API_KEY: z.string().optional(),
  
  // Notification Configuration
  SLACK_WEBHOOK_URL: z.string().optional(),
  PAGERDUTY_INTEGRATION_KEY: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  
  // Feature Flags
  ENABLE_MULTI_CLOUD: z.string().transform(Boolean).default('true'),
  ENABLE_COST_OPTIMIZATION: z.string().transform(Boolean).default('true'),
  ENABLE_SECURITY_SCANNING: z.string().transform(Boolean).default('true'),
  ENABLE_BACKUP_AUTOMATION: z.string().transform(Boolean).default('true'),
  
  // Performance Configuration
  MAX_CONCURRENT_JOBS: z.string().transform(Number).default('10'),
  JOB_TIMEOUT_MINUTES: z.string().transform(Number).default('60'),
  WORKER_CONCURRENCY: z.string().transform(Number).default('5'),
});

// Parse and validate environment variables
const env = envSchema.parse(process.env);

export const config = {
  app: {
    name: 'devops-agent',
    version: process.env.npm_package_version || '1.0.0',
    environment: env.NODE_ENV,
  },
  
  server: {
    port: env.PORT,
    host: env.HOST,
  },
  
  database: {
    url: env.DATABASE_URL,
  },
  
  redis: {
    url: env.REDIS_URL,
  },
  
  auth: {
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
  },
  
  cloud: {
    aws: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      region: env.AWS_REGION,
    },
    
    gcp: {
      credentialsPath: env.GOOGLE_APPLICATION_CREDENTIALS,
      projectId: env.GOOGLE_PROJECT_ID,
    },
    
    azure: {
      clientId: env.AZURE_CLIENT_ID,
      clientSecret: env.AZURE_CLIENT_SECRET,
      tenantId: env.AZURE_TENANT_ID,
    },
  },
  
  kubernetes: {
    configPath: env.KUBECONFIG,
    namespace: env.K8S_NAMESPACE,
  },
  
  git: {
    githubToken: env.GITHUB_TOKEN,
    gitlabToken: env.GITLAB_TOKEN,
  },
  
  terraform: {
    version: env.TERRAFORM_VERSION,
    backendBucket: env.TERRAFORM_BACKEND_BUCKET,
  },
  
  monitoring: {
    prometheusUrl: env.PROMETHEUS_URL,
    grafanaUrl: env.GRAFANA_URL,
    grafanaApiKey: env.GRAFANA_API_KEY,
  },
  
  notifications: {
    slackWebhookUrl: env.SLACK_WEBHOOK_URL,
    pagerDutyIntegrationKey: env.PAGERDUTY_INTEGRATION_KEY,
    sendGridApiKey: env.SENDGRID_API_KEY,
  },
  
  features: {
    multiCloud: env.ENABLE_MULTI_CLOUD,
    costOptimization: env.ENABLE_COST_OPTIMIZATION,
    securityScanning: env.ENABLE_SECURITY_SCANNING,
    backupAutomation: env.ENABLE_BACKUP_AUTOMATION,
  },
  
  performance: {
    maxConcurrentJobs: env.MAX_CONCURRENT_JOBS,
    jobTimeoutMinutes: env.JOB_TIMEOUT_MINUTES,
    workerConcurrency: env.WORKER_CONCURRENCY,
  },
} as const;

export type Config = typeof config;