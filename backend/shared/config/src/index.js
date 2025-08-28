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
exports.config = exports.env = void 0;
const zod_1 = require("zod");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'staging', 'production']).default('development'),
    LOG_LEVEL: zod_1.z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    DATABASE_URL: zod_1.z.string(),
    DATABASE_POOL_SIZE: zod_1.z.string().transform(Number).default(20),
    REDIS_URL: zod_1.z.string(),
    REDIS_MAX_RETRIES: zod_1.z.string().transform(Number).default(3),
    QDRANT_URL: zod_1.z.string(),
    QDRANT_API_KEY: zod_1.z.string().optional(),
    QDRANT_COLLECTION: zod_1.z.string().default('documents'),
    OLLAMA_URL: zod_1.z.string(),
    OLLAMA_DEFAULT_MODEL: zod_1.z.string().default('mistral:7b'),
    OLLAMA_TIMEOUT: zod_1.z.string().transform(Number).default(300000),
    JWT_SECRET: zod_1.z.string(),
    JWT_ACCESS_EXPIRY: zod_1.z.string().default('15m'),
    JWT_REFRESH_EXPIRY: zod_1.z.string().default('7d'),
    KONG_ADMIN_URL: zod_1.z.string().default('http://kong:8001'),
    KONG_PROXY_URL: zod_1.z.string().default('http://kong:8000'),
    SENDGRID_API_KEY: zod_1.z.string().optional(),
    SLACK_WEBHOOK_URL: zod_1.z.string().optional(),
    TEAMS_WEBHOOK_URL: zod_1.z.string().optional(),
    PROMETHEUS_PORT: zod_1.z.string().transform(Number).default(9090),
    JAEGER_ENDPOINT: zod_1.z.string().optional(),
    AWS_ACCESS_KEY_ID: zod_1.z.string().optional(),
    AWS_SECRET_ACCESS_KEY: zod_1.z.string().optional(),
    AWS_REGION: zod_1.z.string().default('us-east-1'),
    AWS_S3_BUCKET: zod_1.z.string().optional(),
    RATE_LIMIT_MAX: zod_1.z.string().transform(Number).default(100),
    RATE_LIMIT_WINDOW: zod_1.z.string().default('15m'),
    CORS_ORIGINS: zod_1.z.string().default('http://localhost:3000'),
    ENCRYPTION_KEY: zod_1.z.string().optional(),
    QUEUE_CONCURRENCY: zod_1.z.string().transform(Number).default(5),
    QUEUE_MAX_ATTEMPTS: zod_1.z.string().transform(Number).default(3),
});
exports.env = envSchema.parse(process.env);
exports.config = {
    services: {
        analysis: {
            name: 'analysis-service',
            port: parseInt(process.env.ANALYSIS_PORT || '3001'),
            version: '1.0.0',
        },
        monitoring: {
            name: 'monitoring-service',
            port: parseInt(process.env.MONITORING_PORT || '3002'),
            version: '1.0.0',
        },
        notification: {
            name: 'notification-service',
            port: parseInt(process.env.NOTIFICATION_PORT || '3003'),
            version: '1.0.0',
        },
        action: {
            name: 'action-service',
            port: parseInt(process.env.ACTION_PORT || '3004'),
            version: '1.0.0',
        },
        user: {
            name: 'user-service',
            port: parseInt(process.env.USER_PORT || '3005'),
            version: '1.0.0',
        },
        websocket: {
            name: 'websocket-service',
            port: parseInt(process.env.WEBSOCKET_PORT || '3006'),
            version: '1.0.0',
        },
    },
    database: {
        url: exports.env.DATABASE_URL,
        poolSize: exports.env.DATABASE_POOL_SIZE,
        ssl: exports.env.NODE_ENV === 'production',
        logging: exports.env.NODE_ENV === 'development',
    },
    redis: {
        url: exports.env.REDIS_URL,
        maxRetries: exports.env.REDIS_MAX_RETRIES,
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
    },
    qdrant: {
        url: exports.env.QDRANT_URL,
        apiKey: exports.env.QDRANT_API_KEY,
        collection: exports.env.QDRANT_COLLECTION,
        vectorSize: 768,
        distance: 'cosine',
    },
    ai: {
        ollama: {
            url: exports.env.OLLAMA_URL,
            defaultModel: exports.env.OLLAMA_DEFAULT_MODEL,
            timeout: exports.env.OLLAMA_TIMEOUT,
            models: {
                fast: 'phi-2:2.7b',
                balanced: 'mistral:7b',
                advanced: 'llama2:13b',
            },
        },
    },
    auth: {
        jwt: {
            secret: exports.env.JWT_SECRET,
            accessExpiry: exports.env.JWT_ACCESS_EXPIRY,
            refreshExpiry: exports.env.JWT_REFRESH_EXPIRY,
            algorithm: 'HS256',
        },
        session: {
            maxAge: 7 * 24 * 60 * 60 * 1000,
            maxConcurrent: 5,
        },
    },
    queues: {
        analysis: {
            name: 'analysis-queue',
            concurrency: exports.env.QUEUE_CONCURRENCY,
            maxAttempts: exports.env.QUEUE_MAX_ATTEMPTS,
            defaultJobOptions: {
                removeOnComplete: 100,
                removeOnFail: 50,
                attempts: exports.env.QUEUE_MAX_ATTEMPTS,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
            },
        },
        monitoring: {
            name: 'monitoring-queue',
            concurrency: Math.ceil(exports.env.QUEUE_CONCURRENCY / 2),
            maxAttempts: exports.env.QUEUE_MAX_ATTEMPTS,
            defaultJobOptions: {
                removeOnComplete: 50,
                removeOnFail: 25,
                attempts: exports.env.QUEUE_MAX_ATTEMPTS,
                backoff: {
                    type: 'exponential',
                    delay: 5000,
                },
            },
        },
        notification: {
            name: 'notification-queue',
            concurrency: exports.env.QUEUE_CONCURRENCY * 2,
            maxAttempts: 5,
            defaultJobOptions: {
                removeOnComplete: 200,
                removeOnFail: 100,
                attempts: 5,
                backoff: {
                    type: 'exponential',
                    delay: 1000,
                },
            },
        },
    },
    rateLimiting: {
        global: {
            max: exports.env.RATE_LIMIT_MAX,
            timeWindow: exports.env.RATE_LIMIT_WINDOW,
        },
        api: {
            free: { max: 10, timeWindow: '1h' },
            starter: { max: 100, timeWindow: '1h' },
            professional: { max: 1000, timeWindow: '1h' },
            team: { max: 5000, timeWindow: '1h' },
            enterprise: { max: 50000, timeWindow: '1h' },
        },
        analysis: {
            free: { max: 3, timeWindow: '1d' },
            starter: { max: 20, timeWindow: '1d' },
            professional: { max: -1, timeWindow: '1d' },
            team: { max: -1, timeWindow: '1d' },
            enterprise: { max: -1, timeWindow: '1d' },
        },
    },
    security: {
        cors: {
            origin: exports.env.CORS_ORIGINS.split(','),
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
        },
        helmet: {
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", 'data:', 'https:'],
                },
            },
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true,
            },
        },
        bcrypt: {
            saltRounds: 12,
        },
    },
    monitoring: {
        prometheus: {
            port: exports.env.PROMETHEUS_PORT,
            path: '/metrics',
        },
        health: {
            path: '/health',
            timeout: 5000,
        },
        jaeger: {
            endpoint: exports.env.JAEGER_ENDPOINT,
            serviceName: 'fineprintai',
        },
    },
    external: {
        sendgrid: {
            apiKey: exports.env.SENDGRID_API_KEY,
            from: 'noreply@fineprintai.com',
        },
        slack: {
            webhookUrl: exports.env.SLACK_WEBHOOK_URL,
        },
        teams: {
            webhookUrl: exports.env.TEAMS_WEBHOOK_URL,
        },
        aws: {
            accessKeyId: exports.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: exports.env.AWS_SECRET_ACCESS_KEY,
            region: exports.env.AWS_REGION,
            s3Bucket: exports.env.AWS_S3_BUCKET,
        },
    },
    logging: {
        level: exports.env.LOG_LEVEL,
        format: exports.env.NODE_ENV === 'production' ? 'json' : 'pretty',
        redact: ['password', 'token', 'key', 'secret'],
    },
};
//# sourceMappingURL=index.js.map