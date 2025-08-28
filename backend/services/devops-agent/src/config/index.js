"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'staging', 'production']).default('development'),
    PORT: zod_1.z.string().transform(Number).default('8015'),
    HOST: zod_1.z.string().default('0.0.0.0'),
    DATABASE_URL: zod_1.z.string(),
    REDIS_URL: zod_1.z.string().default('redis://localhost:6379'),
    JWT_SECRET: zod_1.z.string(),
    JWT_EXPIRES_IN: zod_1.z.string().default('24h'),
    AWS_ACCESS_KEY_ID: zod_1.z.string().optional(),
    AWS_SECRET_ACCESS_KEY: zod_1.z.string().optional(),
    AWS_REGION: zod_1.z.string().default('us-west-2'),
    GOOGLE_APPLICATION_CREDENTIALS: zod_1.z.string().optional(),
    GOOGLE_PROJECT_ID: zod_1.z.string().optional(),
    AZURE_CLIENT_ID: zod_1.z.string().optional(),
    AZURE_CLIENT_SECRET: zod_1.z.string().optional(),
    AZURE_TENANT_ID: zod_1.z.string().optional(),
    KUBECONFIG: zod_1.z.string().optional(),
    K8S_NAMESPACE: zod_1.z.string().default('fineprintai'),
    GITHUB_TOKEN: zod_1.z.string().optional(),
    GITLAB_TOKEN: zod_1.z.string().optional(),
    TERRAFORM_VERSION: zod_1.z.string().default('1.6.0'),
    TERRAFORM_BACKEND_BUCKET: zod_1.z.string().optional(),
    PROMETHEUS_URL: zod_1.z.string().default('http://localhost:9090'),
    GRAFANA_URL: zod_1.z.string().default('http://localhost:3000'),
    GRAFANA_API_KEY: zod_1.z.string().optional(),
    SLACK_WEBHOOK_URL: zod_1.z.string().optional(),
    PAGERDUTY_INTEGRATION_KEY: zod_1.z.string().optional(),
    SENDGRID_API_KEY: zod_1.z.string().optional(),
    ENABLE_MULTI_CLOUD: zod_1.z.string().transform(Boolean).default('true'),
    ENABLE_COST_OPTIMIZATION: zod_1.z.string().transform(Boolean).default('true'),
    ENABLE_SECURITY_SCANNING: zod_1.z.string().transform(Boolean).default('true'),
    ENABLE_BACKUP_AUTOMATION: zod_1.z.string().transform(Boolean).default('true'),
    MAX_CONCURRENT_JOBS: zod_1.z.string().transform(Number).default('10'),
    JOB_TIMEOUT_MINUTES: zod_1.z.string().transform(Number).default('60'),
    WORKER_CONCURRENCY: zod_1.z.string().transform(Number).default('5'),
});
const env = envSchema.parse(process.env);
exports.config = {
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
};
//# sourceMappingURL=index.js.map