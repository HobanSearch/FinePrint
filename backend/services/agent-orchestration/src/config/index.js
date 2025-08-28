"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const zod_1 = require("zod");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const ConfigSchema = zod_1.z.object({
    host: zod_1.z.string().default('0.0.0.0'),
    port: zod_1.z.number().default(3010),
    environment: zod_1.z.enum(['development', 'staging', 'production']).default('development'),
    version: zod_1.z.string().default('1.0.0'),
    jwt: zod_1.z.object({
        secret: zod_1.z.string().min(32),
        expiresIn: zod_1.z.string().default('24h'),
        issuer: zod_1.z.string().default('fine-print-ai'),
    }),
    cors: zod_1.z.object({
        origins: zod_1.z.array(zod_1.z.string()).default(['http://localhost:3000', 'http://localhost:5173']),
        credentials: zod_1.z.boolean().default(true),
    }),
    rateLimit: zod_1.z.object({
        enabled: zod_1.z.boolean().default(true),
        max: zod_1.z.number().default(1000),
        timeWindow: zod_1.z.string().default('1 minute'),
    }),
    docs: zod_1.z.object({
        enabled: zod_1.z.boolean().default(true),
        path: zod_1.z.string().default('/docs'),
    }),
    redis: zod_1.z.object({
        host: zod_1.z.string().default('localhost'),
        port: zod_1.z.number().default(6379),
        password: zod_1.z.string().optional(),
        db: zod_1.z.number().default(0),
        keyPrefix: zod_1.z.string().default('orchestration:'),
        maxRetries: zod_1.z.number().default(3),
        retryDelayOnFailover: zod_1.z.number().default(100),
    }),
    database: zod_1.z.object({
        url: zod_1.z.string(),
        maxConnections: zod_1.z.number().default(20),
        connectionTimeoutMs: zod_1.z.number().default(5000),
        idleTimeoutMs: zod_1.z.number().default(10000),
    }),
    queue: zod_1.z.object({
        defaultJobOptions: zod_1.z.object({
            removeOnComplete: zod_1.z.number().default(100),
            removeOnFail: zod_1.z.number().default(50),
            attempts: zod_1.z.number().default(3),
            backoff: zod_1.z.object({
                type: zod_1.z.string().default('exponential'),
                delay: zod_1.z.number().default(2000),
            }),
        }),
        concurrency: zod_1.z.number().default(10),
    }),
    monitoring: zod_1.z.object({
        enabled: zod_1.z.boolean().default(true),
        healthCheckInterval: zod_1.z.number().default(30000),
        metricsCollectionInterval: zod_1.z.number().default(10000),
        alertingEnabled: zod_1.z.boolean().default(true),
        prometheusEndpoint: zod_1.z.string().default('/metrics'),
    }),
    workflow: zod_1.z.object({
        maxConcurrentExecutions: zod_1.z.number().default(100),
        defaultTimeout: zod_1.z.number().default(3600000),
        retentionDays: zod_1.z.number().default(30),
        enableVisualBuilder: zod_1.z.boolean().default(true),
    }),
    communication: zod_1.z.object({
        maxMessageSize: zod_1.z.number().default(5 * 1024 * 1024),
        messageRetention: zod_1.z.number().default(86400000),
        enableEncryption: zod_1.z.boolean().default(true),
        compressionEnabled: zod_1.z.boolean().default(true),
    }),
    resources: zod_1.z.object({
        allocationStrategy: zod_1.z.enum(['balanced', 'cost_optimized', 'performance_optimized']).default('balanced'),
        autoScalingEnabled: zod_1.z.boolean().default(true),
        resourcePooling: zod_1.z.boolean().default(true),
        costTrackingEnabled: zod_1.z.boolean().default(true),
    }),
    decisions: zod_1.z.object({
        defaultStrategy: zod_1.z.enum(['round_robin', 'least_loaded', 'capability_based']).default('capability_based'),
        conflictResolutionTimeout: zod_1.z.number().default(30000),
        escalationEnabled: zod_1.z.boolean().default(true),
        auditEnabled: zod_1.z.boolean().default(true),
    }),
    businessProcesses: zod_1.z.object({
        templateLibraryEnabled: zod_1.z.boolean().default(true),
        customProcessesEnabled: zod_1.z.boolean().default(true),
        processAnalyticsEnabled: zod_1.z.boolean().default(true),
        slaMonitoringEnabled: zod_1.z.boolean().default(true),
    }),
    integrations: zod_1.z.object({
        prometheus: zod_1.z.object({
            enabled: zod_1.z.boolean().default(true),
            pushGateway: zod_1.z.string().optional(),
        }),
        grafana: zod_1.z.object({
            enabled: zod_1.z.boolean().default(true),
            url: zod_1.z.string().optional(),
            apiKey: zod_1.z.string().optional(),
        }),
        slack: zod_1.z.object({
            enabled: zod_1.z.boolean().default(false),
            webhookUrl: zod_1.z.string().optional(),
            botToken: zod_1.z.string().optional(),
        }),
        datadog: zod_1.z.object({
            enabled: zod_1.z.boolean().default(false),
            apiKey: zod_1.z.string().optional(),
            site: zod_1.z.string().default('datadoghq.com'),
        }),
    }),
    security: zod_1.z.object({
        enableRBAC: zod_1.z.boolean().default(true),
        auditLogging: zod_1.z.boolean().default(true),
        encryptionAtRest: zod_1.z.boolean().default(true),
        sessionTimeout: zod_1.z.number().default(86400000),
    }),
    performance: zod_1.z.object({
        cacheEnabled: zod_1.z.boolean().default(true),
        cacheTTL: zod_1.z.number().default(300000),
        compressionEnabled: zod_1.z.boolean().default(true),
        enableConnectionPooling: zod_1.z.boolean().default(true),
    }),
});
function loadConfig() {
    const rawConfig = {
        host: process.env.HOST,
        port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
        environment: process.env.NODE_ENV,
        version: process.env.VERSION || process.env.npm_package_version,
        jwt: {
            secret: process.env.JWT_SECRET,
            expiresIn: process.env.JWT_EXPIRES_IN,
            issuer: process.env.JWT_ISSUER,
        },
        cors: {
            origins: process.env.CORS_ORIGINS?.split(','),
            credentials: process.env.CORS_CREDENTIALS === 'true',
        },
        rateLimit: {
            enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
            max: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX, 10) : undefined,
            timeWindow: process.env.RATE_LIMIT_TIME_WINDOW,
        },
        docs: {
            enabled: process.env.DOCS_ENABLED !== 'false',
            path: process.env.DOCS_PATH,
        },
        redis: {
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : undefined,
            password: process.env.REDIS_PASSWORD,
            db: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : undefined,
            keyPrefix: process.env.REDIS_KEY_PREFIX,
            maxRetries: process.env.REDIS_MAX_RETRIES ? parseInt(process.env.REDIS_MAX_RETRIES, 10) : undefined,
            retryDelayOnFailover: process.env.REDIS_RETRY_DELAY ? parseInt(process.env.REDIS_RETRY_DELAY, 10) : undefined,
        },
        database: {
            url: process.env.DATABASE_URL,
            maxConnections: process.env.DB_MAX_CONNECTIONS ? parseInt(process.env.DB_MAX_CONNECTIONS, 10) : undefined,
            connectionTimeoutMs: process.env.DB_CONNECTION_TIMEOUT ? parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) : undefined,
            idleTimeoutMs: process.env.DB_IDLE_TIMEOUT ? parseInt(process.env.DB_IDLE_TIMEOUT, 10) : undefined,
        },
        queue: {
            defaultJobOptions: {
                removeOnComplete: process.env.QUEUE_REMOVE_ON_COMPLETE ? parseInt(process.env.QUEUE_REMOVE_ON_COMPLETE, 10) : undefined,
                removeOnFail: process.env.QUEUE_REMOVE_ON_FAIL ? parseInt(process.env.QUEUE_REMOVE_ON_FAIL, 10) : undefined,
                attempts: process.env.QUEUE_ATTEMPTS ? parseInt(process.env.QUEUE_ATTEMPTS, 10) : undefined,
                backoff: {
                    type: process.env.QUEUE_BACKOFF_TYPE,
                    delay: process.env.QUEUE_BACKOFF_DELAY ? parseInt(process.env.QUEUE_BACKOFF_DELAY, 10) : undefined,
                },
            },
            concurrency: process.env.QUEUE_CONCURRENCY ? parseInt(process.env.QUEUE_CONCURRENCY, 10) : undefined,
        },
        monitoring: {
            enabled: process.env.MONITORING_ENABLED !== 'false',
            healthCheckInterval: process.env.HEALTH_CHECK_INTERVAL ? parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) : undefined,
            metricsCollectionInterval: process.env.METRICS_INTERVAL ? parseInt(process.env.METRICS_INTERVAL, 10) : undefined,
            alertingEnabled: process.env.ALERTING_ENABLED !== 'false',
            prometheusEndpoint: process.env.PROMETHEUS_ENDPOINT,
        },
        workflow: {
            maxConcurrentExecutions: process.env.WORKFLOW_MAX_CONCURRENT ? parseInt(process.env.WORKFLOW_MAX_CONCURRENT, 10) : undefined,
            defaultTimeout: process.env.WORKFLOW_DEFAULT_TIMEOUT ? parseInt(process.env.WORKFLOW_DEFAULT_TIMEOUT, 10) : undefined,
            retentionDays: process.env.WORKFLOW_RETENTION_DAYS ? parseInt(process.env.WORKFLOW_RETENTION_DAYS, 10) : undefined,
            enableVisualBuilder: process.env.WORKFLOW_VISUAL_BUILDER !== 'false',
        },
        communication: {
            maxMessageSize: process.env.COMM_MAX_MESSAGE_SIZE ? parseInt(process.env.COMM_MAX_MESSAGE_SIZE, 10) : undefined,
            messageRetention: process.env.COMM_MESSAGE_RETENTION ? parseInt(process.env.COMM_MESSAGE_RETENTION, 10) : undefined,
            enableEncryption: process.env.COMM_ENCRYPTION !== 'false',
            compressionEnabled: process.env.COMM_COMPRESSION !== 'false',
        },
        resources: {
            allocationStrategy: process.env.RESOURCE_ALLOCATION_STRATEGY,
            autoScalingEnabled: process.env.RESOURCE_AUTO_SCALING !== 'false',
            resourcePooling: process.env.RESOURCE_POOLING !== 'false',
            costTrackingEnabled: process.env.RESOURCE_COST_TRACKING !== 'false',
        },
        decisions: {
            defaultStrategy: process.env.DECISION_DEFAULT_STRATEGY,
            conflictResolutionTimeout: process.env.DECISION_CONFLICT_TIMEOUT ? parseInt(process.env.DECISION_CONFLICT_TIMEOUT, 10) : undefined,
            escalationEnabled: process.env.DECISION_ESCALATION !== 'false',
            auditEnabled: process.env.DECISION_AUDIT !== 'false',
        },
        businessProcesses: {
            templateLibraryEnabled: process.env.BP_TEMPLATE_LIBRARY !== 'false',
            customProcessesEnabled: process.env.BP_CUSTOM_PROCESSES !== 'false',
            processAnalyticsEnabled: process.env.BP_ANALYTICS !== 'false',
            slaMonitoringEnabled: process.env.BP_SLA_MONITORING !== 'false',
        },
        integrations: {
            prometheus: {
                enabled: process.env.PROMETHEUS_ENABLED !== 'false',
                pushGateway: process.env.PROMETHEUS_PUSH_GATEWAY,
            },
            grafana: {
                enabled: process.env.GRAFANA_ENABLED !== 'false',
                url: process.env.GRAFANA_URL,
                apiKey: process.env.GRAFANA_API_KEY,
            },
            slack: {
                enabled: process.env.SLACK_ENABLED === 'true',
                webhookUrl: process.env.SLACK_WEBHOOK_URL,
                botToken: process.env.SLACK_BOT_TOKEN,
            },
            datadog: {
                enabled: process.env.DATADOG_ENABLED === 'true',
                apiKey: process.env.DATADOG_API_KEY,
                site: process.env.DATADOG_SITE,
            },
        },
        security: {
            enableRBAC: process.env.SECURITY_RBAC !== 'false',
            auditLogging: process.env.SECURITY_AUDIT_LOGGING !== 'false',
            encryptionAtRest: process.env.SECURITY_ENCRYPTION_AT_REST !== 'false',
            sessionTimeout: process.env.SECURITY_SESSION_TIMEOUT ? parseInt(process.env.SECURITY_SESSION_TIMEOUT, 10) : undefined,
        },
        performance: {
            cacheEnabled: process.env.PERF_CACHE !== 'false',
            cacheTTL: process.env.PERF_CACHE_TTL ? parseInt(process.env.PERF_CACHE_TTL, 10) : undefined,
            compressionEnabled: process.env.PERF_COMPRESSION !== 'false',
            enableConnectionPooling: process.env.PERF_CONNECTION_POOLING !== 'false',
        },
    };
    const cleanConfig = JSON.parse(JSON.stringify(rawConfig, (key, value) => {
        return value === undefined ? undefined : value;
    }));
    try {
        return ConfigSchema.parse(cleanConfig);
    }
    catch (error) {
        console.error('Configuration validation failed:', error);
        throw new Error('Invalid configuration');
    }
}
exports.config = loadConfig();
//# sourceMappingURL=index.js.map