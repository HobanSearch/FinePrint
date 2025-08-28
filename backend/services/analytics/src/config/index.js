"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.security = exports.aiAnalytics = exports.abTesting = exports.reporting = exports.processing = exports.performance = exports.privacy = exports.elasticsearch = exports.dataWarehouse = exports.productAnalytics = exports.redis = exports.database = exports.port = exports.nodeEnv = exports.config = void 0;
const zod_1 = require("zod");
const configSchema = zod_1.z.object({
    nodeEnv: zod_1.z.enum(['development', 'staging', 'production']).default('development'),
    port: zod_1.z.number().default(3007),
    database: zod_1.z.object({
        url: zod_1.z.string(),
        maxConnections: zod_1.z.number().default(10),
        connectionTimeout: zod_1.z.number().default(30000),
        idleTimeout: zod_1.z.number().default(600000)
    }),
    redis: zod_1.z.object({
        url: zod_1.z.string(),
        host: zod_1.z.string().default('localhost'),
        port: zod_1.z.number().default(6379),
        password: zod_1.z.string().optional(),
        db: zod_1.z.number().default(0),
        retryDelayOnFailover: zod_1.z.number().default(100),
        enableReadyCheck: zod_1.z.boolean().default(true)
    }),
    productAnalytics: zod_1.z.object({
        mixpanel: zod_1.z.object({
            token: zod_1.z.string(),
            secret: zod_1.z.string().optional(),
            region: zod_1.z.enum(['US', 'EU']).default('US'),
            enabled: zod_1.z.boolean().default(true)
        }),
        amplitude: zod_1.z.object({
            apiKey: zod_1.z.string(),
            secretKey: zod_1.z.string().optional(),
            enabled: zod_1.z.boolean().default(true)
        }),
        segment: zod_1.z.object({
            writeKey: zod_1.z.string().optional(),
            enabled: zod_1.z.boolean().default(false)
        })
    }),
    dataWarehouse: zod_1.z.object({
        snowflake: zod_1.z.object({
            account: zod_1.z.string().optional(),
            username: zod_1.z.string().optional(),
            password: zod_1.z.string().optional(),
            warehouse: zod_1.z.string().default('ANALYTICS_WH'),
            database: zod_1.z.string().default('FINEPRINTAI'),
            schema: zod_1.z.string().default('ANALYTICS'),
            enabled: zod_1.z.boolean().default(false)
        }),
        clickhouse: zod_1.z.object({
            host: zod_1.z.string().optional(),
            port: zod_1.z.number().default(8123),
            username: zod_1.z.string().optional(),
            password: zod_1.z.string().optional(),
            database: zod_1.z.string().default('fineprintai_analytics'),
            enabled: zod_1.z.boolean().default(false)
        })
    }),
    elasticsearch: zod_1.z.object({
        url: zod_1.z.string().optional(),
        username: zod_1.z.string().optional(),
        password: zod_1.z.string().optional(),
        index: zod_1.z.string().default('fineprintai-analytics'),
        enabled: zod_1.z.boolean().default(false)
    }),
    privacy: zod_1.z.object({
        enablePiiDetection: zod_1.z.boolean().default(true),
        enableDataAnonymization: zod_1.z.boolean().default(true),
        dataRetentionDays: zod_1.z.number().default(365),
        gdprCompliant: zod_1.z.boolean().default(true),
        ccpaCompliant: zod_1.z.boolean().default(true),
        cookieConsentRequired: zod_1.z.boolean().default(true),
        allowedCountries: zod_1.z.array(zod_1.z.string()).default([]),
        restrictedCountries: zod_1.z.array(zod_1.z.string()).default([])
    }),
    performance: zod_1.z.object({
        enableMetrics: zod_1.z.boolean().default(true),
        metricsInterval: zod_1.z.number().default(60000),
        enableTracing: zod_1.z.boolean().default(true),
        enableProfiling: zod_1.z.boolean().default(false),
        maxMemoryUsage: zod_1.z.number().default(1024 * 1024 * 1024),
        requestTimeout: zod_1.z.number().default(30000)
    }),
    processing: zod_1.z.object({
        batchSize: zod_1.z.number().default(1000),
        batchTimeout: zod_1.z.number().default(5000),
        maxRetries: zod_1.z.number().default(3),
        retryDelay: zod_1.z.number().default(1000),
        enableRealTimeProcessing: zod_1.z.boolean().default(true),
        enableBatchProcessing: zod_1.z.boolean().default(true)
    }),
    reporting: zod_1.z.object({
        enableAutomatedReports: zod_1.z.boolean().default(true),
        reportSchedule: zod_1.z.string().default('0 9 * * MON'),
        reportRetentionDays: zod_1.z.number().default(90),
        enableEmailReports: zod_1.z.boolean().default(true),
        enableSlackReports: zod_1.z.boolean().default(false)
    }),
    abTesting: zod_1.z.object({
        enabled: zod_1.z.boolean().default(true),
        defaultTrafficAllocation: zod_1.z.number().default(0.1),
        minSampleSize: zod_1.z.number().default(100),
        confidenceLevel: zod_1.z.number().default(0.95),
        enableAutoWinner: zod_1.z.boolean().default(false)
    }),
    aiAnalytics: zod_1.z.object({
        enableModelPerformanceTracking: zod_1.z.boolean().default(true),
        enableTokenUsageTracking: zod_1.z.boolean().default(true),
        enableLatencyTracking: zod_1.z.boolean().default(true),
        enableAccuracyTracking: zod_1.z.boolean().default(true),
        modelMetricsInterval: zod_1.z.number().default(300000)
    }),
    security: zod_1.z.object({
        enableApiKeyAuth: zod_1.z.boolean().default(true),
        enableJwtAuth: zod_1.z.boolean().default(true),
        enableRateLimit: zod_1.z.boolean().default(true),
        rateLimitWindow: zod_1.z.number().default(900000),
        rateLimitMax: zod_1.z.number().default(1000),
        enableCors: zod_1.z.boolean().default(true),
        allowedOrigins: zod_1.z.array(zod_1.z.string()).default([])
    })
});
function loadConfig() {
    const rawConfig = {
        nodeEnv: process.env.NODE_ENV || 'development',
        port: parseInt(process.env.PORT || '3007', 10),
        database: {
            url: process.env.DATABASE_URL || '',
            maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),
            connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000', 10),
            idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '600000', 10)
        },
        redis: {
            url: process.env.REDIS_URL || '',
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            password: process.env.REDIS_PASSWORD,
            db: parseInt(process.env.REDIS_DB || '0', 10),
            retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY || '100', 10),
            enableReadyCheck: process.env.REDIS_ENABLE_READY_CHECK !== 'false'
        },
        productAnalytics: {
            mixpanel: {
                token: process.env.MIXPANEL_TOKEN || '',
                secret: process.env.MIXPANEL_SECRET,
                region: process.env.MIXPANEL_REGION || 'US',
                enabled: process.env.MIXPANEL_ENABLED !== 'false'
            },
            amplitude: {
                apiKey: process.env.AMPLITUDE_API_KEY || '',
                secretKey: process.env.AMPLITUDE_SECRET_KEY,
                enabled: process.env.AMPLITUDE_ENABLED !== 'false'
            },
            segment: {
                writeKey: process.env.SEGMENT_WRITE_KEY,
                enabled: process.env.SEGMENT_ENABLED === 'true'
            }
        },
        dataWarehouse: {
            snowflake: {
                account: process.env.SNOWFLAKE_ACCOUNT,
                username: process.env.SNOWFLAKE_USERNAME,
                password: process.env.SNOWFLAKE_PASSWORD,
                warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'ANALYTICS_WH',
                database: process.env.SNOWFLAKE_DATABASE || 'FINEPRINTAI',
                schema: process.env.SNOWFLAKE_SCHEMA || 'ANALYTICS',
                enabled: process.env.SNOWFLAKE_ENABLED === 'true'
            },
            clickhouse: {
                host: process.env.CLICKHOUSE_HOST,
                port: parseInt(process.env.CLICKHOUSE_PORT || '8123', 10),
                username: process.env.CLICKHOUSE_USERNAME,
                password: process.env.CLICKHOUSE_PASSWORD,
                database: process.env.CLICKHOUSE_DATABASE || 'fineprintai_analytics',
                enabled: process.env.CLICKHOUSE_ENABLED === 'true'
            }
        },
        elasticsearch: {
            url: process.env.ELASTICSEARCH_URL,
            username: process.env.ELASTICSEARCH_USERNAME,
            password: process.env.ELASTICSEARCH_PASSWORD,
            index: process.env.ELASTICSEARCH_INDEX || 'fineprintai-analytics',
            enabled: process.env.ELASTICSEARCH_ENABLED === 'true'
        },
        privacy: {
            enablePiiDetection: process.env.ENABLE_PII_DETECTION !== 'false',
            enableDataAnonymization: process.env.ENABLE_DATA_ANONYMIZATION !== 'false',
            dataRetentionDays: parseInt(process.env.DATA_RETENTION_DAYS || '365', 10),
            gdprCompliant: process.env.GDPR_COMPLIANT !== 'false',
            ccpaCompliant: process.env.CCPA_COMPLIANT !== 'false',
            cookieConsentRequired: process.env.COOKIE_CONSENT_REQUIRED !== 'false',
            allowedCountries: process.env.ALLOWED_COUNTRIES?.split(',') || [],
            restrictedCountries: process.env.RESTRICTED_COUNTRIES?.split(',') || []
        },
        performance: {
            enableMetrics: process.env.ENABLE_METRICS !== 'false',
            metricsInterval: parseInt(process.env.METRICS_INTERVAL || '60000', 10),
            enableTracing: process.env.ENABLE_TRACING !== 'false',
            enableProfiling: process.env.ENABLE_PROFILING === 'true',
            maxMemoryUsage: parseInt(process.env.MAX_MEMORY_USAGE || '1073741824', 10),
            requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '30000', 10)
        },
        processing: {
            batchSize: parseInt(process.env.BATCH_SIZE || '1000', 10),
            batchTimeout: parseInt(process.env.BATCH_TIMEOUT || '5000', 10),
            maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
            retryDelay: parseInt(process.env.RETRY_DELAY || '1000', 10),
            enableRealTimeProcessing: process.env.ENABLE_REALTIME_PROCESSING !== 'false',
            enableBatchProcessing: process.env.ENABLE_BATCH_PROCESSING !== 'false'
        },
        reporting: {
            enableAutomatedReports: process.env.ENABLE_AUTOMATED_REPORTS !== 'false',
            reportSchedule: process.env.REPORT_SCHEDULE || '0 9 * * MON',
            reportRetentionDays: parseInt(process.env.REPORT_RETENTION_DAYS || '90', 10),
            enableEmailReports: process.env.ENABLE_EMAIL_REPORTS !== 'false',
            enableSlackReports: process.env.ENABLE_SLACK_REPORTS === 'true'
        },
        abTesting: {
            enabled: process.env.AB_TESTING_ENABLED !== 'false',
            defaultTrafficAllocation: parseFloat(process.env.AB_DEFAULT_TRAFFIC || '0.1'),
            minSampleSize: parseInt(process.env.AB_MIN_SAMPLE_SIZE || '100', 10),
            confidenceLevel: parseFloat(process.env.AB_CONFIDENCE_LEVEL || '0.95'),
            enableAutoWinner: process.env.AB_ENABLE_AUTO_WINNER === 'true'
        },
        aiAnalytics: {
            enableModelPerformanceTracking: process.env.ENABLE_MODEL_PERFORMANCE !== 'false',
            enableTokenUsageTracking: process.env.ENABLE_TOKEN_USAGE !== 'false',
            enableLatencyTracking: process.env.ENABLE_LATENCY_TRACKING !== 'false',
            enableAccuracyTracking: process.env.ENABLE_ACCURACY_TRACKING !== 'false',
            modelMetricsInterval: parseInt(process.env.MODEL_METRICS_INTERVAL || '300000', 10)
        },
        security: {
            enableApiKeyAuth: process.env.ENABLE_API_KEY_AUTH !== 'false',
            enableJwtAuth: process.env.ENABLE_JWT_AUTH !== 'false',
            enableRateLimit: process.env.ENABLE_RATE_LIMIT !== 'false',
            rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10),
            rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10),
            enableCors: process.env.ENABLE_CORS !== 'false',
            allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || []
        }
    };
    try {
        return configSchema.parse(rawConfig);
    }
    catch (error) {
        console.error('Configuration validation failed:', error);
        throw new Error('Invalid configuration');
    }
}
exports.config = loadConfig();
exports.nodeEnv = exports.config.nodeEnv, exports.port = exports.config.port, exports.database = exports.config.database, exports.redis = exports.config.redis, exports.productAnalytics = exports.config.productAnalytics, exports.dataWarehouse = exports.config.dataWarehouse, exports.elasticsearch = exports.config.elasticsearch, exports.privacy = exports.config.privacy, exports.performance = exports.config.performance, exports.processing = exports.config.processing, exports.reporting = exports.config.reporting, exports.abTesting = exports.config.abTesting, exports.aiAnalytics = exports.config.aiAnalytics, exports.security = exports.config.security;
//# sourceMappingURL=index.js.map