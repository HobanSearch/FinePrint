"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheConfigFactory = void 0;
const config_1 = require("@fineprintai/config");
const compression_1 = require("./compression");
class CacheConfigFactory {
    static createDefault() {
        return {
            l1: {
                enabled: true,
                maxSize: 10000,
                maxMemory: 128 * 1024 * 1024,
                ttl: 3600,
                checkPeriod: 300
            },
            l2: {
                enabled: true,
                cluster: false,
                url: config_1.config.redis.url || 'redis://localhost:6379',
                keyPrefix: 'fpa',
                ttl: 7200,
                maxRetries: 3,
                retryDelay: 100,
                compression: compression_1.compressionPresets.balanced
            },
            performance: {
                batchSize: 100,
                pipelineThreshold: 10,
                refreshAheadEnabled: true,
                refreshAheadThreshold: 20,
                preloadEnabled: true,
                metricsEnabled: true
            },
            monitoring: {
                enabled: true,
                metricsInterval: 60000,
                slowLogThreshold: 100,
                alertThresholds: {
                    hitRateMin: 0.8,
                    errorRateMax: 0.05,
                    latencyMax: 200
                }
            }
        };
    }
    static createHighPerformance() {
        const base = this.createDefault();
        return {
            ...base,
            l1: {
                ...base.l1,
                maxSize: 50000,
                maxMemory: 512 * 1024 * 1024,
                ttl: 1800,
                checkPeriod: 60
            },
            l2: {
                ...base.l2,
                ttl: 3600,
                compression: compression_1.compressionPresets.fast
            },
            performance: {
                ...base.performance,
                batchSize: 1000,
                pipelineThreshold: 5,
                refreshAheadThreshold: 30
            },
            monitoring: {
                ...base.monitoring,
                slowLogThreshold: 50,
                alertThresholds: {
                    hitRateMin: 0.9,
                    errorRateMax: 0.01,
                    latencyMax: 100
                }
            }
        };
    }
    static createMemoryOptimized() {
        const base = this.createDefault();
        return {
            ...base,
            l1: {
                ...base.l1,
                maxSize: 5000,
                maxMemory: 64 * 1024 * 1024,
                ttl: 1800,
                checkPeriod: 120
            },
            l2: {
                ...base.l2,
                ttl: 14400,
                compression: compression_1.compressionPresets.archival
            },
            performance: {
                ...base.performance,
                batchSize: 50,
                refreshAheadThreshold: 10
            }
        };
    }
    static createSessionCache() {
        const base = this.createDefault();
        return {
            ...base,
            l1: {
                ...base.l1,
                maxSize: 20000,
                ttl: 1800,
            },
            l2: {
                ...base.l2,
                keyPrefix: 'session',
                ttl: 86400,
                compression: compression_1.compressionPresets.balanced
            },
            performance: {
                ...base.performance,
                refreshAheadEnabled: false
            }
        };
    }
    static createApiCache() {
        const base = this.createDefault();
        return {
            ...base,
            l1: {
                ...base.l1,
                maxSize: 15000,
                ttl: 300,
            },
            l2: {
                ...base.l2,
                keyPrefix: 'api',
                ttl: 900,
                compression: compression_1.compressionPresets.fast
            },
            performance: {
                ...base.performance,
                refreshAheadEnabled: true,
                refreshAheadThreshold: 25
            },
            monitoring: {
                ...base.monitoring,
                slowLogThreshold: 50,
            }
        };
    }
    static createAnalysisCache() {
        const base = this.createDefault();
        return {
            ...base,
            l1: {
                ...base.l1,
                maxSize: 5000,
                maxMemory: 256 * 1024 * 1024,
                ttl: 3600,
            },
            l2: {
                ...base.l2,
                keyPrefix: 'analysis',
                ttl: 7200,
                compression: compression_1.compressionPresets.balanced
            },
            performance: {
                ...base.performance,
                refreshAheadEnabled: true,
                refreshAheadThreshold: 15,
                preloadEnabled: true
            }
        };
    }
    static createRateLimitCache() {
        const base = this.createDefault();
        return {
            ...base,
            l1: {
                ...base.l1,
                maxSize: 100000,
                maxMemory: 32 * 1024 * 1024,
                ttl: 60,
                checkPeriod: 30
            },
            l2: {
                ...base.l2,
                keyPrefix: 'ratelimit',
                ttl: 300,
                compression: compression_1.compressionPresets.disabled
            },
            performance: {
                ...base.performance,
                refreshAheadEnabled: false,
                preloadEnabled: false
            },
            monitoring: {
                ...base.monitoring,
                slowLogThreshold: 10,
            }
        };
    }
    static createDevelopment() {
        const base = this.createDefault();
        return {
            ...base,
            l1: {
                ...base.l1,
                maxSize: 1000,
                maxMemory: 16 * 1024 * 1024,
                ttl: 300,
                checkPeriod: 60
            },
            l2: {
                ...base.l2,
                ttl: 600,
                compression: compression_1.compressionPresets.disabled
            },
            performance: {
                ...base.performance,
                refreshAheadEnabled: false,
                preloadEnabled: false
            },
            monitoring: {
                ...base.monitoring,
                metricsInterval: 30000,
                slowLogThreshold: 200,
            }
        };
    }
    static createProduction() {
        const base = this.createDefault();
        return {
            ...base,
            l1: {
                ...base.l1,
                maxSize: 100000,
                maxMemory: 1024 * 1024 * 1024,
                ttl: 7200,
                checkPeriod: 600
            },
            l2: {
                ...base.l2,
                cluster: true,
                ttl: 14400,
                maxRetries: 5,
                retryDelay: 200,
                compression: compression_1.compressionPresets.balanced
            },
            performance: {
                ...base.performance,
                batchSize: 1000,
                pipelineThreshold: 5,
                refreshAheadEnabled: true,
                refreshAheadThreshold: 15,
                preloadEnabled: true,
                metricsEnabled: true
            },
            monitoring: {
                ...base.monitoring,
                metricsInterval: 300000,
                slowLogThreshold: 50,
                alertThresholds: {
                    hitRateMin: 0.85,
                    errorRateMax: 0.02,
                    latencyMax: 150
                }
            }
        };
    }
    static createForEnvironment(env = process.env.NODE_ENV || 'development') {
        switch (env) {
            case 'production':
                return this.createProduction();
            case 'staging':
                return this.createDefault();
            case 'development':
            case 'test':
                return this.createDevelopment();
            default:
                return this.createDefault();
        }
    }
    static createSpecialized(type) {
        switch (type) {
            case 'session':
                return this.createSessionCache();
            case 'api':
                return this.createApiCache();
            case 'analysis':
                return this.createAnalysisCache();
            case 'ratelimit':
                return this.createRateLimitCache();
            case 'high-performance':
                return this.createHighPerformance();
            case 'memory-optimized':
                return this.createMemoryOptimized();
            default:
                return this.createDefault();
        }
    }
    static validate(config) {
        const errors = [];
        if (config.l1.enabled) {
            if (config.l1.maxSize <= 0) {
                errors.push('L1 maxSize must be greater than 0');
            }
            if (config.l1.maxMemory <= 0) {
                errors.push('L1 maxMemory must be greater than 0');
            }
            if (config.l1.ttl < 0) {
                errors.push('L1 TTL cannot be negative');
            }
            if (config.l1.checkPeriod <= 0) {
                errors.push('L1 checkPeriod must be greater than 0');
            }
        }
        if (config.l2.enabled) {
            if (!config.l2.url && !config.l2.nodes) {
                errors.push('L2 cache requires either url or nodes configuration');
            }
            if (config.l2.ttl < 0) {
                errors.push('L2 TTL cannot be negative');
            }
            if (config.l2.maxRetries < 0) {
                errors.push('L2 maxRetries cannot be negative');
            }
            if (config.l2.retryDelay < 0) {
                errors.push('L2 retryDelay cannot be negative');
            }
        }
        if (config.performance.batchSize <= 0) {
            errors.push('Performance batchSize must be greater than 0');
        }
        if (config.performance.pipelineThreshold <= 0) {
            errors.push('Performance pipelineThreshold must be greater than 0');
        }
        if (config.performance.refreshAheadThreshold < 0 || config.performance.refreshAheadThreshold > 100) {
            errors.push('Performance refreshAheadThreshold must be between 0 and 100');
        }
        if (config.monitoring.enabled) {
            if (config.monitoring.metricsInterval <= 0) {
                errors.push('Monitoring metricsInterval must be greater than 0');
            }
            if (config.monitoring.slowLogThreshold < 0) {
                errors.push('Monitoring slowLogThreshold cannot be negative');
            }
            const thresholds = config.monitoring.alertThresholds;
            if (thresholds.hitRateMin < 0 || thresholds.hitRateMin > 1) {
                errors.push('Alert hitRateMin must be between 0 and 1');
            }
            if (thresholds.errorRateMax < 0 || thresholds.errorRateMax > 1) {
                errors.push('Alert errorRateMax must be between 0 and 1');
            }
            if (thresholds.latencyMax <= 0) {
                errors.push('Alert latencyMax must be greater than 0');
            }
        }
        return {
            valid: errors.length === 0,
            errors
        };
    }
    static merge(base, override) {
        return {
            l1: { ...base.l1, ...override.l1 },
            l2: { ...base.l2, ...override.l2 },
            performance: { ...base.performance, ...override.performance },
            monitoring: { ...base.monitoring, ...override.monitoring }
        };
    }
    static createFromEnv() {
        const base = this.createForEnvironment();
        const envOverrides = {};
        if (process.env.CACHE_L1_MAX_SIZE) {
            envOverrides.l1 = { ...envOverrides.l1, maxSize: parseInt(process.env.CACHE_L1_MAX_SIZE) };
        }
        if (process.env.CACHE_L1_MAX_MEMORY) {
            envOverrides.l1 = { ...envOverrides.l1, maxMemory: parseInt(process.env.CACHE_L1_MAX_MEMORY) };
        }
        if (process.env.CACHE_L1_TTL) {
            envOverrides.l1 = { ...envOverrides.l1, ttl: parseInt(process.env.CACHE_L1_TTL) };
        }
        if (process.env.CACHE_L2_TTL) {
            envOverrides.l2 = { ...envOverrides.l2, ttl: parseInt(process.env.CACHE_L2_TTL) };
        }
        if (process.env.CACHE_L2_CLUSTER === 'true') {
            envOverrides.l2 = { ...envOverrides.l2, cluster: true };
        }
        if (process.env.CACHE_COMPRESSION_ENABLED === 'false') {
            envOverrides.l2 = {
                ...envOverrides.l2,
                compression: { ...base.l2.compression, enabled: false }
            };
        }
        if (process.env.CACHE_MONITORING_ENABLED === 'false') {
            envOverrides.monitoring = { ...envOverrides.monitoring, enabled: false };
        }
        return Object.keys(envOverrides).length > 0 ? this.merge(base, envOverrides) : base;
    }
}
exports.CacheConfigFactory = CacheConfigFactory;
//# sourceMappingURL=config-factory.js.map