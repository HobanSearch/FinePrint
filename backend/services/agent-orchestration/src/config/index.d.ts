import { z } from 'zod';
declare const ConfigSchema: z.ZodObject<{
    host: z.ZodDefault<z.ZodString>;
    port: z.ZodDefault<z.ZodNumber>;
    environment: z.ZodDefault<z.ZodEnum<["development", "staging", "production"]>>;
    version: z.ZodDefault<z.ZodString>;
    jwt: z.ZodObject<{
        secret: z.ZodString;
        expiresIn: z.ZodDefault<z.ZodString>;
        issuer: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        secret: string;
        expiresIn: string;
        issuer: string;
    }, {
        secret: string;
        expiresIn?: string | undefined;
        issuer?: string | undefined;
    }>;
    cors: z.ZodObject<{
        origins: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        credentials: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        origins: string[];
        credentials: boolean;
    }, {
        origins?: string[] | undefined;
        credentials?: boolean | undefined;
    }>;
    rateLimit: z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        max: z.ZodDefault<z.ZodNumber>;
        timeWindow: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        max: number;
        timeWindow: string;
    }, {
        enabled?: boolean | undefined;
        max?: number | undefined;
        timeWindow?: string | undefined;
    }>;
    docs: z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        path: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        enabled: boolean;
    }, {
        path?: string | undefined;
        enabled?: boolean | undefined;
    }>;
    redis: z.ZodObject<{
        host: z.ZodDefault<z.ZodString>;
        port: z.ZodDefault<z.ZodNumber>;
        password: z.ZodOptional<z.ZodString>;
        db: z.ZodDefault<z.ZodNumber>;
        keyPrefix: z.ZodDefault<z.ZodString>;
        maxRetries: z.ZodDefault<z.ZodNumber>;
        retryDelayOnFailover: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        port: number;
        host: string;
        db: number;
        keyPrefix: string;
        maxRetries: number;
        retryDelayOnFailover: number;
        password?: string | undefined;
    }, {
        port?: number | undefined;
        host?: string | undefined;
        password?: string | undefined;
        db?: number | undefined;
        keyPrefix?: string | undefined;
        maxRetries?: number | undefined;
        retryDelayOnFailover?: number | undefined;
    }>;
    database: z.ZodObject<{
        url: z.ZodString;
        maxConnections: z.ZodDefault<z.ZodNumber>;
        connectionTimeoutMs: z.ZodDefault<z.ZodNumber>;
        idleTimeoutMs: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        url: string;
        maxConnections: number;
        connectionTimeoutMs: number;
        idleTimeoutMs: number;
    }, {
        url: string;
        maxConnections?: number | undefined;
        connectionTimeoutMs?: number | undefined;
        idleTimeoutMs?: number | undefined;
    }>;
    queue: z.ZodObject<{
        defaultJobOptions: z.ZodObject<{
            removeOnComplete: z.ZodDefault<z.ZodNumber>;
            removeOnFail: z.ZodDefault<z.ZodNumber>;
            attempts: z.ZodDefault<z.ZodNumber>;
            backoff: z.ZodObject<{
                type: z.ZodDefault<z.ZodString>;
                delay: z.ZodDefault<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                type: string;
                delay: number;
            }, {
                type?: string | undefined;
                delay?: number | undefined;
            }>;
        }, "strip", z.ZodTypeAny, {
            removeOnComplete: number;
            removeOnFail: number;
            attempts: number;
            backoff: {
                type: string;
                delay: number;
            };
        }, {
            backoff: {
                type?: string | undefined;
                delay?: number | undefined;
            };
            removeOnComplete?: number | undefined;
            removeOnFail?: number | undefined;
            attempts?: number | undefined;
        }>;
        concurrency: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        defaultJobOptions: {
            removeOnComplete: number;
            removeOnFail: number;
            attempts: number;
            backoff: {
                type: string;
                delay: number;
            };
        };
        concurrency: number;
    }, {
        defaultJobOptions: {
            backoff: {
                type?: string | undefined;
                delay?: number | undefined;
            };
            removeOnComplete?: number | undefined;
            removeOnFail?: number | undefined;
            attempts?: number | undefined;
        };
        concurrency?: number | undefined;
    }>;
    monitoring: z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        healthCheckInterval: z.ZodDefault<z.ZodNumber>;
        metricsCollectionInterval: z.ZodDefault<z.ZodNumber>;
        alertingEnabled: z.ZodDefault<z.ZodBoolean>;
        prometheusEndpoint: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        healthCheckInterval: number;
        metricsCollectionInterval: number;
        alertingEnabled: boolean;
        prometheusEndpoint: string;
    }, {
        enabled?: boolean | undefined;
        healthCheckInterval?: number | undefined;
        metricsCollectionInterval?: number | undefined;
        alertingEnabled?: boolean | undefined;
        prometheusEndpoint?: string | undefined;
    }>;
    workflow: z.ZodObject<{
        maxConcurrentExecutions: z.ZodDefault<z.ZodNumber>;
        defaultTimeout: z.ZodDefault<z.ZodNumber>;
        retentionDays: z.ZodDefault<z.ZodNumber>;
        enableVisualBuilder: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        maxConcurrentExecutions: number;
        defaultTimeout: number;
        retentionDays: number;
        enableVisualBuilder: boolean;
    }, {
        maxConcurrentExecutions?: number | undefined;
        defaultTimeout?: number | undefined;
        retentionDays?: number | undefined;
        enableVisualBuilder?: boolean | undefined;
    }>;
    communication: z.ZodObject<{
        maxMessageSize: z.ZodDefault<z.ZodNumber>;
        messageRetention: z.ZodDefault<z.ZodNumber>;
        enableEncryption: z.ZodDefault<z.ZodBoolean>;
        compressionEnabled: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        maxMessageSize: number;
        messageRetention: number;
        enableEncryption: boolean;
        compressionEnabled: boolean;
    }, {
        maxMessageSize?: number | undefined;
        messageRetention?: number | undefined;
        enableEncryption?: boolean | undefined;
        compressionEnabled?: boolean | undefined;
    }>;
    resources: z.ZodObject<{
        allocationStrategy: z.ZodDefault<z.ZodEnum<["balanced", "cost_optimized", "performance_optimized"]>>;
        autoScalingEnabled: z.ZodDefault<z.ZodBoolean>;
        resourcePooling: z.ZodDefault<z.ZodBoolean>;
        costTrackingEnabled: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        allocationStrategy: "balanced" | "cost_optimized" | "performance_optimized";
        autoScalingEnabled: boolean;
        resourcePooling: boolean;
        costTrackingEnabled: boolean;
    }, {
        allocationStrategy?: "balanced" | "cost_optimized" | "performance_optimized" | undefined;
        autoScalingEnabled?: boolean | undefined;
        resourcePooling?: boolean | undefined;
        costTrackingEnabled?: boolean | undefined;
    }>;
    decisions: z.ZodObject<{
        defaultStrategy: z.ZodDefault<z.ZodEnum<["round_robin", "least_loaded", "capability_based"]>>;
        conflictResolutionTimeout: z.ZodDefault<z.ZodNumber>;
        escalationEnabled: z.ZodDefault<z.ZodBoolean>;
        auditEnabled: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        defaultStrategy: "round_robin" | "least_loaded" | "capability_based";
        conflictResolutionTimeout: number;
        escalationEnabled: boolean;
        auditEnabled: boolean;
    }, {
        defaultStrategy?: "round_robin" | "least_loaded" | "capability_based" | undefined;
        conflictResolutionTimeout?: number | undefined;
        escalationEnabled?: boolean | undefined;
        auditEnabled?: boolean | undefined;
    }>;
    businessProcesses: z.ZodObject<{
        templateLibraryEnabled: z.ZodDefault<z.ZodBoolean>;
        customProcessesEnabled: z.ZodDefault<z.ZodBoolean>;
        processAnalyticsEnabled: z.ZodDefault<z.ZodBoolean>;
        slaMonitoringEnabled: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        templateLibraryEnabled: boolean;
        customProcessesEnabled: boolean;
        processAnalyticsEnabled: boolean;
        slaMonitoringEnabled: boolean;
    }, {
        templateLibraryEnabled?: boolean | undefined;
        customProcessesEnabled?: boolean | undefined;
        processAnalyticsEnabled?: boolean | undefined;
        slaMonitoringEnabled?: boolean | undefined;
    }>;
    integrations: z.ZodObject<{
        prometheus: z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            pushGateway: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            pushGateway?: string | undefined;
        }, {
            enabled?: boolean | undefined;
            pushGateway?: string | undefined;
        }>;
        grafana: z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            url: z.ZodOptional<z.ZodString>;
            apiKey: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            apiKey?: string | undefined;
            url?: string | undefined;
        }, {
            apiKey?: string | undefined;
            url?: string | undefined;
            enabled?: boolean | undefined;
        }>;
        slack: z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            webhookUrl: z.ZodOptional<z.ZodString>;
            botToken: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            webhookUrl?: string | undefined;
            botToken?: string | undefined;
        }, {
            enabled?: boolean | undefined;
            webhookUrl?: string | undefined;
            botToken?: string | undefined;
        }>;
        datadog: z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            apiKey: z.ZodOptional<z.ZodString>;
            site: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            site: string;
            apiKey?: string | undefined;
        }, {
            apiKey?: string | undefined;
            enabled?: boolean | undefined;
            site?: string | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        prometheus: {
            enabled: boolean;
            pushGateway?: string | undefined;
        };
        grafana: {
            enabled: boolean;
            apiKey?: string | undefined;
            url?: string | undefined;
        };
        slack: {
            enabled: boolean;
            webhookUrl?: string | undefined;
            botToken?: string | undefined;
        };
        datadog: {
            enabled: boolean;
            site: string;
            apiKey?: string | undefined;
        };
    }, {
        prometheus: {
            enabled?: boolean | undefined;
            pushGateway?: string | undefined;
        };
        grafana: {
            apiKey?: string | undefined;
            url?: string | undefined;
            enabled?: boolean | undefined;
        };
        slack: {
            enabled?: boolean | undefined;
            webhookUrl?: string | undefined;
            botToken?: string | undefined;
        };
        datadog: {
            apiKey?: string | undefined;
            enabled?: boolean | undefined;
            site?: string | undefined;
        };
    }>;
    security: z.ZodObject<{
        enableRBAC: z.ZodDefault<z.ZodBoolean>;
        auditLogging: z.ZodDefault<z.ZodBoolean>;
        encryptionAtRest: z.ZodDefault<z.ZodBoolean>;
        sessionTimeout: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        enableRBAC: boolean;
        auditLogging: boolean;
        encryptionAtRest: boolean;
        sessionTimeout: number;
    }, {
        enableRBAC?: boolean | undefined;
        auditLogging?: boolean | undefined;
        encryptionAtRest?: boolean | undefined;
        sessionTimeout?: number | undefined;
    }>;
    performance: z.ZodObject<{
        cacheEnabled: z.ZodDefault<z.ZodBoolean>;
        cacheTTL: z.ZodDefault<z.ZodNumber>;
        compressionEnabled: z.ZodDefault<z.ZodBoolean>;
        enableConnectionPooling: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        compressionEnabled: boolean;
        cacheEnabled: boolean;
        cacheTTL: number;
        enableConnectionPooling: boolean;
    }, {
        compressionEnabled?: boolean | undefined;
        cacheEnabled?: boolean | undefined;
        cacheTTL?: number | undefined;
        enableConnectionPooling?: boolean | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    communication: {
        maxMessageSize: number;
        messageRetention: number;
        enableEncryption: boolean;
        compressionEnabled: boolean;
    };
    decisions: {
        defaultStrategy: "round_robin" | "least_loaded" | "capability_based";
        conflictResolutionTimeout: number;
        escalationEnabled: boolean;
        auditEnabled: boolean;
    };
    resources: {
        allocationStrategy: "balanced" | "cost_optimized" | "performance_optimized";
        autoScalingEnabled: boolean;
        resourcePooling: boolean;
        costTrackingEnabled: boolean;
    };
    monitoring: {
        enabled: boolean;
        healthCheckInterval: number;
        metricsCollectionInterval: number;
        alertingEnabled: boolean;
        prometheusEndpoint: string;
    };
    version: string;
    environment: "development" | "staging" | "production";
    port: number;
    docs: {
        path: string;
        enabled: boolean;
    };
    host: string;
    jwt: {
        secret: string;
        expiresIn: string;
        issuer: string;
    };
    cors: {
        origins: string[];
        credentials: boolean;
    };
    rateLimit: {
        enabled: boolean;
        max: number;
        timeWindow: string;
    };
    redis: {
        port: number;
        host: string;
        db: number;
        keyPrefix: string;
        maxRetries: number;
        retryDelayOnFailover: number;
        password?: string | undefined;
    };
    database: {
        url: string;
        maxConnections: number;
        connectionTimeoutMs: number;
        idleTimeoutMs: number;
    };
    queue: {
        defaultJobOptions: {
            removeOnComplete: number;
            removeOnFail: number;
            attempts: number;
            backoff: {
                type: string;
                delay: number;
            };
        };
        concurrency: number;
    };
    workflow: {
        maxConcurrentExecutions: number;
        defaultTimeout: number;
        retentionDays: number;
        enableVisualBuilder: boolean;
    };
    businessProcesses: {
        templateLibraryEnabled: boolean;
        customProcessesEnabled: boolean;
        processAnalyticsEnabled: boolean;
        slaMonitoringEnabled: boolean;
    };
    integrations: {
        prometheus: {
            enabled: boolean;
            pushGateway?: string | undefined;
        };
        grafana: {
            enabled: boolean;
            apiKey?: string | undefined;
            url?: string | undefined;
        };
        slack: {
            enabled: boolean;
            webhookUrl?: string | undefined;
            botToken?: string | undefined;
        };
        datadog: {
            enabled: boolean;
            site: string;
            apiKey?: string | undefined;
        };
    };
    security: {
        enableRBAC: boolean;
        auditLogging: boolean;
        encryptionAtRest: boolean;
        sessionTimeout: number;
    };
    performance: {
        compressionEnabled: boolean;
        cacheEnabled: boolean;
        cacheTTL: number;
        enableConnectionPooling: boolean;
    };
}, {
    communication: {
        maxMessageSize?: number | undefined;
        messageRetention?: number | undefined;
        enableEncryption?: boolean | undefined;
        compressionEnabled?: boolean | undefined;
    };
    decisions: {
        defaultStrategy?: "round_robin" | "least_loaded" | "capability_based" | undefined;
        conflictResolutionTimeout?: number | undefined;
        escalationEnabled?: boolean | undefined;
        auditEnabled?: boolean | undefined;
    };
    resources: {
        allocationStrategy?: "balanced" | "cost_optimized" | "performance_optimized" | undefined;
        autoScalingEnabled?: boolean | undefined;
        resourcePooling?: boolean | undefined;
        costTrackingEnabled?: boolean | undefined;
    };
    monitoring: {
        enabled?: boolean | undefined;
        healthCheckInterval?: number | undefined;
        metricsCollectionInterval?: number | undefined;
        alertingEnabled?: boolean | undefined;
        prometheusEndpoint?: string | undefined;
    };
    docs: {
        path?: string | undefined;
        enabled?: boolean | undefined;
    };
    jwt: {
        secret: string;
        expiresIn?: string | undefined;
        issuer?: string | undefined;
    };
    cors: {
        origins?: string[] | undefined;
        credentials?: boolean | undefined;
    };
    rateLimit: {
        enabled?: boolean | undefined;
        max?: number | undefined;
        timeWindow?: string | undefined;
    };
    redis: {
        port?: number | undefined;
        host?: string | undefined;
        password?: string | undefined;
        db?: number | undefined;
        keyPrefix?: string | undefined;
        maxRetries?: number | undefined;
        retryDelayOnFailover?: number | undefined;
    };
    database: {
        url: string;
        maxConnections?: number | undefined;
        connectionTimeoutMs?: number | undefined;
        idleTimeoutMs?: number | undefined;
    };
    queue: {
        defaultJobOptions: {
            backoff: {
                type?: string | undefined;
                delay?: number | undefined;
            };
            removeOnComplete?: number | undefined;
            removeOnFail?: number | undefined;
            attempts?: number | undefined;
        };
        concurrency?: number | undefined;
    };
    workflow: {
        maxConcurrentExecutions?: number | undefined;
        defaultTimeout?: number | undefined;
        retentionDays?: number | undefined;
        enableVisualBuilder?: boolean | undefined;
    };
    businessProcesses: {
        templateLibraryEnabled?: boolean | undefined;
        customProcessesEnabled?: boolean | undefined;
        processAnalyticsEnabled?: boolean | undefined;
        slaMonitoringEnabled?: boolean | undefined;
    };
    integrations: {
        prometheus: {
            enabled?: boolean | undefined;
            pushGateway?: string | undefined;
        };
        grafana: {
            apiKey?: string | undefined;
            url?: string | undefined;
            enabled?: boolean | undefined;
        };
        slack: {
            enabled?: boolean | undefined;
            webhookUrl?: string | undefined;
            botToken?: string | undefined;
        };
        datadog: {
            apiKey?: string | undefined;
            enabled?: boolean | undefined;
            site?: string | undefined;
        };
    };
    security: {
        enableRBAC?: boolean | undefined;
        auditLogging?: boolean | undefined;
        encryptionAtRest?: boolean | undefined;
        sessionTimeout?: number | undefined;
    };
    performance: {
        compressionEnabled?: boolean | undefined;
        cacheEnabled?: boolean | undefined;
        cacheTTL?: number | undefined;
        enableConnectionPooling?: boolean | undefined;
    };
    version?: string | undefined;
    environment?: "development" | "staging" | "production" | undefined;
    port?: number | undefined;
    host?: string | undefined;
}>;
type Config = z.infer<typeof ConfigSchema>;
export declare const config: {
    communication: {
        maxMessageSize: number;
        messageRetention: number;
        enableEncryption: boolean;
        compressionEnabled: boolean;
    };
    decisions: {
        defaultStrategy: "round_robin" | "least_loaded" | "capability_based";
        conflictResolutionTimeout: number;
        escalationEnabled: boolean;
        auditEnabled: boolean;
    };
    resources: {
        allocationStrategy: "balanced" | "cost_optimized" | "performance_optimized";
        autoScalingEnabled: boolean;
        resourcePooling: boolean;
        costTrackingEnabled: boolean;
    };
    monitoring: {
        enabled: boolean;
        healthCheckInterval: number;
        metricsCollectionInterval: number;
        alertingEnabled: boolean;
        prometheusEndpoint: string;
    };
    version: string;
    environment: "development" | "staging" | "production";
    port: number;
    docs: {
        path: string;
        enabled: boolean;
    };
    host: string;
    jwt: {
        secret: string;
        expiresIn: string;
        issuer: string;
    };
    cors: {
        origins: string[];
        credentials: boolean;
    };
    rateLimit: {
        enabled: boolean;
        max: number;
        timeWindow: string;
    };
    redis: {
        port: number;
        host: string;
        db: number;
        keyPrefix: string;
        maxRetries: number;
        retryDelayOnFailover: number;
        password?: string | undefined;
    };
    database: {
        url: string;
        maxConnections: number;
        connectionTimeoutMs: number;
        idleTimeoutMs: number;
    };
    queue: {
        defaultJobOptions: {
            removeOnComplete: number;
            removeOnFail: number;
            attempts: number;
            backoff: {
                type: string;
                delay: number;
            };
        };
        concurrency: number;
    };
    workflow: {
        maxConcurrentExecutions: number;
        defaultTimeout: number;
        retentionDays: number;
        enableVisualBuilder: boolean;
    };
    businessProcesses: {
        templateLibraryEnabled: boolean;
        customProcessesEnabled: boolean;
        processAnalyticsEnabled: boolean;
        slaMonitoringEnabled: boolean;
    };
    integrations: {
        prometheus: {
            enabled: boolean;
            pushGateway?: string | undefined;
        };
        grafana: {
            enabled: boolean;
            apiKey?: string | undefined;
            url?: string | undefined;
        };
        slack: {
            enabled: boolean;
            webhookUrl?: string | undefined;
            botToken?: string | undefined;
        };
        datadog: {
            enabled: boolean;
            site: string;
            apiKey?: string | undefined;
        };
    };
    security: {
        enableRBAC: boolean;
        auditLogging: boolean;
        encryptionAtRest: boolean;
        sessionTimeout: number;
    };
    performance: {
        compressionEnabled: boolean;
        cacheEnabled: boolean;
        cacheTTL: number;
        enableConnectionPooling: boolean;
    };
};
export type { Config };
//# sourceMappingURL=index.d.ts.map