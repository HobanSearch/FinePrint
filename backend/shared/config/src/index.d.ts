export declare const env: {
    NODE_ENV: "development" | "staging" | "production";
    JWT_SECRET: string;
    DATABASE_URL: string;
    CORS_ORIGINS: string;
    RATE_LIMIT_MAX: number;
    REDIS_MAX_RETRIES: number;
    QUEUE_CONCURRENCY: number;
    REDIS_URL: string;
    RATE_LIMIT_WINDOW: string;
    LOG_LEVEL: "error" | "info" | "warn" | "debug";
    OLLAMA_DEFAULT_MODEL: string;
    OLLAMA_TIMEOUT: number;
    OLLAMA_URL: string;
    KONG_ADMIN_URL: string;
    DATABASE_POOL_SIZE: number;
    QDRANT_URL: string;
    QDRANT_COLLECTION: string;
    JWT_ACCESS_EXPIRY: string;
    JWT_REFRESH_EXPIRY: string;
    KONG_PROXY_URL: string;
    PROMETHEUS_PORT: number;
    AWS_REGION: string;
    QUEUE_MAX_ATTEMPTS: number;
    SLACK_WEBHOOK_URL?: string | undefined;
    SENDGRID_API_KEY?: string | undefined;
    ENCRYPTION_KEY?: string | undefined;
    QDRANT_API_KEY?: string | undefined;
    TEAMS_WEBHOOK_URL?: string | undefined;
    JAEGER_ENDPOINT?: string | undefined;
    AWS_ACCESS_KEY_ID?: string | undefined;
    AWS_SECRET_ACCESS_KEY?: string | undefined;
    AWS_S3_BUCKET?: string | undefined;
};
export declare const config: {
    readonly services: {
        readonly analysis: {
            readonly name: "analysis-service";
            readonly port: number;
            readonly version: "1.0.0";
        };
        readonly monitoring: {
            readonly name: "monitoring-service";
            readonly port: number;
            readonly version: "1.0.0";
        };
        readonly notification: {
            readonly name: "notification-service";
            readonly port: number;
            readonly version: "1.0.0";
        };
        readonly action: {
            readonly name: "action-service";
            readonly port: number;
            readonly version: "1.0.0";
        };
        readonly user: {
            readonly name: "user-service";
            readonly port: number;
            readonly version: "1.0.0";
        };
        readonly websocket: {
            readonly name: "websocket-service";
            readonly port: number;
            readonly version: "1.0.0";
        };
    };
    readonly database: {
        readonly url: string;
        readonly poolSize: number;
        readonly ssl: boolean;
        readonly logging: boolean;
    };
    readonly redis: {
        readonly url: string;
        readonly maxRetries: number;
        readonly retryDelayOnFailover: 100;
        readonly enableReadyCheck: true;
        readonly maxRetriesPerRequest: 3;
    };
    readonly qdrant: {
        readonly url: string;
        readonly apiKey: string | undefined;
        readonly collection: string;
        readonly vectorSize: 768;
        readonly distance: "cosine";
    };
    readonly ai: {
        readonly ollama: {
            readonly url: string;
            readonly defaultModel: string;
            readonly timeout: number;
            readonly models: {
                readonly fast: "phi-2:2.7b";
                readonly balanced: "mistral:7b";
                readonly advanced: "llama2:13b";
            };
        };
    };
    readonly auth: {
        readonly jwt: {
            readonly secret: string;
            readonly accessExpiry: string;
            readonly refreshExpiry: string;
            readonly algorithm: "HS256";
        };
        readonly session: {
            readonly maxAge: number;
            readonly maxConcurrent: 5;
        };
    };
    readonly queues: {
        readonly analysis: {
            readonly name: "analysis-queue";
            readonly concurrency: number;
            readonly maxAttempts: number;
            readonly defaultJobOptions: {
                readonly removeOnComplete: 100;
                readonly removeOnFail: 50;
                readonly attempts: number;
                readonly backoff: {
                    readonly type: "exponential";
                    readonly delay: 2000;
                };
            };
        };
        readonly monitoring: {
            readonly name: "monitoring-queue";
            readonly concurrency: number;
            readonly maxAttempts: number;
            readonly defaultJobOptions: {
                readonly removeOnComplete: 50;
                readonly removeOnFail: 25;
                readonly attempts: number;
                readonly backoff: {
                    readonly type: "exponential";
                    readonly delay: 5000;
                };
            };
        };
        readonly notification: {
            readonly name: "notification-queue";
            readonly concurrency: number;
            readonly maxAttempts: 5;
            readonly defaultJobOptions: {
                readonly removeOnComplete: 200;
                readonly removeOnFail: 100;
                readonly attempts: 5;
                readonly backoff: {
                    readonly type: "exponential";
                    readonly delay: 1000;
                };
            };
        };
    };
    readonly rateLimiting: {
        readonly global: {
            readonly max: number;
            readonly timeWindow: string;
        };
        readonly api: {
            readonly free: {
                readonly max: 10;
                readonly timeWindow: "1h";
            };
            readonly starter: {
                readonly max: 100;
                readonly timeWindow: "1h";
            };
            readonly professional: {
                readonly max: 1000;
                readonly timeWindow: "1h";
            };
            readonly team: {
                readonly max: 5000;
                readonly timeWindow: "1h";
            };
            readonly enterprise: {
                readonly max: 50000;
                readonly timeWindow: "1h";
            };
        };
        readonly analysis: {
            readonly free: {
                readonly max: 3;
                readonly timeWindow: "1d";
            };
            readonly starter: {
                readonly max: 20;
                readonly timeWindow: "1d";
            };
            readonly professional: {
                readonly max: -1;
                readonly timeWindow: "1d";
            };
            readonly team: {
                readonly max: -1;
                readonly timeWindow: "1d";
            };
            readonly enterprise: {
                readonly max: -1;
                readonly timeWindow: "1d";
            };
        };
    };
    readonly security: {
        readonly cors: {
            readonly origin: string[];
            readonly credentials: true;
            readonly methods: readonly ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
            readonly allowedHeaders: readonly ["Content-Type", "Authorization", "X-API-Key"];
        };
        readonly helmet: {
            readonly contentSecurityPolicy: {
                readonly directives: {
                    readonly defaultSrc: readonly ["'self'"];
                    readonly styleSrc: readonly ["'self'", "'unsafe-inline'"];
                    readonly scriptSrc: readonly ["'self'"];
                    readonly imgSrc: readonly ["'self'", "data:", "https:"];
                };
            };
            readonly hsts: {
                readonly maxAge: 31536000;
                readonly includeSubDomains: true;
                readonly preload: true;
            };
        };
        readonly bcrypt: {
            readonly saltRounds: 12;
        };
    };
    readonly monitoring: {
        readonly prometheus: {
            readonly port: number;
            readonly path: "/metrics";
        };
        readonly health: {
            readonly path: "/health";
            readonly timeout: 5000;
        };
        readonly jaeger: {
            readonly endpoint: string | undefined;
            readonly serviceName: "fineprintai";
        };
    };
    readonly external: {
        readonly sendgrid: {
            readonly apiKey: string | undefined;
            readonly from: "noreply@fineprintai.com";
        };
        readonly slack: {
            readonly webhookUrl: string | undefined;
        };
        readonly teams: {
            readonly webhookUrl: string | undefined;
        };
        readonly aws: {
            readonly accessKeyId: string | undefined;
            readonly secretAccessKey: string | undefined;
            readonly region: string;
            readonly s3Bucket: string | undefined;
        };
    };
    readonly logging: {
        readonly level: "error" | "info" | "warn" | "debug";
        readonly format: "json" | "pretty";
        readonly redact: readonly ["password", "token", "key", "secret"];
    };
};
export type Config = typeof config;
//# sourceMappingURL=index.d.ts.map