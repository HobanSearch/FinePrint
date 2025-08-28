"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsCollector = void 0;
const events_1 = require("events");
const logger_1 = require("@fineprintai/logger");
class MetricsCollector extends events_1.EventEmitter {
    pubsub;
    config;
    logger = (0, logger_1.createServiceLogger)('cache-metrics');
    l1Stats;
    l2Stats;
    operationLatencies = [];
    slowQueries = [];
    topKeys = new Map();
    metricsHistory = [];
    compressionStats = {
        totalOriginalSize: 0,
        totalCompressedSize: 0,
        compressionSaves: 0
    };
    metricsTimer;
    cleanupTimer;
    constructor(pubsub, config) {
        super();
        this.pubsub = pubsub;
        this.config = config;
        this.l1Stats = this.createEmptyStats();
        this.l2Stats = this.createEmptyStats();
        if (this.config.enabled) {
            this.startMetricsCollection();
            this.startCleanupTimer();
        }
    }
    recordHit(layer, key, duration) {
        const stats = layer === 'l1' ? this.l1Stats : this.l2Stats;
        stats.hits++;
        stats.totalOperations++;
        this.updateLatency(stats, duration);
        this.updateHitRate(stats);
        this.updateTopKeys(key);
        this.operationLatencies.push(duration);
        this.trimLatencies();
        this.emit('hit', { layer, key, duration });
    }
    recordMiss(layer, key, duration) {
        const stats = layer === 'l1' ? this.l1Stats : this.l2Stats;
        stats.misses++;
        stats.totalOperations++;
        this.updateLatency(stats, duration);
        this.updateHitRate(stats);
        this.operationLatencies.push(duration);
        this.trimLatencies();
        this.emit('miss', { layer, key, duration });
    }
    recordOperation(layer, operation, key, duration, success = true) {
        const stats = layer === 'l1' ? this.l1Stats : this.l2Stats;
        stats.totalOperations++;
        this.updateLatency(stats, duration);
        if (!success) {
            this.recordError(layer, operation, key);
        }
        if (duration > this.config.slowLogThreshold) {
            this.recordSlowQuery(key, operation, duration);
        }
        this.operationLatencies.push(duration);
        this.trimLatencies();
        this.emit('operation', { layer, operation, key, duration, success });
    }
    recordError(layer, operation, key, error) {
        const stats = layer === 'l1' ? this.l1Stats : this.l2Stats;
        const errorCount = Math.floor(stats.totalOperations * stats.errorRate) + 1;
        stats.errorRate = errorCount / stats.totalOperations;
        this.emit('error', { layer, operation, key, error });
        this.logger.error('Cache operation error', { layer, operation, key, error: error?.message });
    }
    recordMemoryUsage(bytes) {
        this.l1Stats.memoryUsage = bytes;
    }
    recordKeyCount(layer, count) {
        const stats = layer === 'l1' ? this.l1Stats : this.l2Stats;
        stats.keyCount = count;
    }
    recordEviction(layer, key) {
        const stats = layer === 'l1' ? this.l1Stats : this.l2Stats;
        if (stats.evictions !== undefined) {
            stats.evictions++;
        }
        this.emit('eviction', { layer, key });
    }
    recordCompression(originalSize, compressedSize) {
        this.compressionStats.totalOriginalSize += originalSize;
        this.compressionStats.totalCompressedSize += compressedSize;
        if (compressedSize < originalSize) {
            this.compressionStats.compressionSaves += (originalSize - compressedSize);
        }
    }
    getStats() {
        const overall = this.calculateOverallStats();
        return {
            l1: { ...this.l1Stats },
            l2: { ...this.l2Stats },
            overall
        };
    }
    getMetrics() {
        const stats = this.getStats();
        return {
            timestamp: Date.now(),
            stats,
            topKeys: this.getTopKeysArray(),
            slowQueries: [...this.slowQueries]
        };
    }
    getMetricsHistory(limit) {
        const history = [...this.metricsHistory];
        return limit ? history.slice(-limit) : history;
    }
    getPerformancePercentiles() {
        if (this.operationLatencies.length === 0) {
            return { p50: 0, p90: 0, p95: 0, p99: 0, mean: 0, min: 0, max: 0 };
        }
        const sorted = [...this.operationLatencies].sort((a, b) => a - b);
        const len = sorted.length;
        return {
            p50: this.getPercentile(sorted, 0.5),
            p90: this.getPercentile(sorted, 0.9),
            p95: this.getPercentile(sorted, 0.95),
            p99: this.getPercentile(sorted, 0.99),
            mean: sorted.reduce((sum, val) => sum + val, 0) / len,
            min: sorted[0],
            max: sorted[len - 1]
        };
    }
    resetStats() {
        this.l1Stats = this.createEmptyStats();
        this.l2Stats = this.createEmptyStats();
        this.operationLatencies = [];
        this.slowQueries = [];
        this.topKeys.clear();
        this.metricsHistory = [];
        this.compressionStats = {
            totalOriginalSize: 0,
            totalCompressedSize: 0,
            compressionSaves: 0
        };
        this.logger.info('Cache metrics reset');
    }
    exportPrometheusMetrics() {
        const stats = this.getStats();
        const timestamp = Date.now();
        const metrics = [
            `# HELP cache_hits_total Total number of cache hits`,
            `# TYPE cache_hits_total counter`,
            `cache_hits_total{layer="l1"} ${stats.l1.hits} ${timestamp}`,
            `cache_hits_total{layer="l2"} ${stats.l2.hits} ${timestamp}`,
            `# HELP cache_misses_total Total number of cache misses`,
            `# TYPE cache_misses_total counter`,
            `cache_misses_total{layer="l1"} ${stats.l1.misses} ${timestamp}`,
            `cache_misses_total{layer="l2"} ${stats.l2.misses} ${timestamp}`,
            `# HELP cache_hit_rate Cache hit rate ratio`,
            `# TYPE cache_hit_rate gauge`,
            `cache_hit_rate{layer="l1"} ${stats.l1.hitRate} ${timestamp}`,
            `cache_hit_rate{layer="l2"} ${stats.l2.hitRate} ${timestamp}`,
            `cache_hit_rate{layer="overall"} ${stats.overall.hitRate} ${timestamp}`,
            `# HELP cache_latency_ms Average operation latency in milliseconds`,
            `# TYPE cache_latency_ms gauge`,
            `cache_latency_ms{layer="l1"} ${stats.l1.averageLatency} ${timestamp}`,
            `cache_latency_ms{layer="l2"} ${stats.l2.averageLatency} ${timestamp}`,
            `cache_latency_ms{layer="overall"} ${stats.overall.averageLatency} ${timestamp}`,
            `# HELP cache_keys_total Total number of keys`,
            `# TYPE cache_keys_total gauge`,
            `cache_keys_total{layer="l1"} ${stats.l1.keyCount} ${timestamp}`,
            `cache_keys_total{layer="l2"} ${stats.l2.keyCount} ${timestamp}`,
            `# HELP cache_memory_usage_bytes Memory usage in bytes`,
            `# TYPE cache_memory_usage_bytes gauge`,
            `cache_memory_usage_bytes{layer="l1"} ${stats.l1.memoryUsage || 0} ${timestamp}`,
            `# HELP cache_evictions_total Total number of evictions`,
            `# TYPE cache_evictions_total counter`,
            `cache_evictions_total{layer="l1"} ${stats.l1.evictions || 0} ${timestamp}`,
            `# HELP cache_compression_ratio Compression ratio`,
            `# TYPE cache_compression_ratio gauge`,
            `cache_compression_ratio ${stats.overall.compressionRatio || 1} ${timestamp}`,
            `# HELP cache_network_saved_bytes Bytes saved by L1 hits`,
            `# TYPE cache_network_saved_bytes counter`,
            `cache_network_saved_bytes ${stats.overall.networkSaved} ${timestamp}`
        ];
        return metrics.join('\n') + '\n';
    }
    startMetricsCollection() {
        this.metricsTimer = setInterval(() => {
            const metrics = this.getMetrics();
            this.metricsHistory.push(metrics);
            if (this.metricsHistory.length > this.config.maxHistorySize) {
                this.metricsHistory = this.metricsHistory.slice(-this.config.maxHistorySize);
            }
            this.pubsub.publishMetrics(metrics);
            this.emit('metrics', metrics);
        }, this.config.metricsInterval);
    }
    startCleanupTimer() {
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, 300000);
    }
    cleanup() {
        const now = Date.now();
        const maxAge = 3600000;
        this.slowQueries = this.slowQueries.filter(query => (now - query.timestamp) < maxAge);
        for (const [key, data] of this.topKeys.entries()) {
            if ((now - data.lastAccessed) > maxAge) {
                this.topKeys.delete(key);
            }
        }
    }
    stop() {
        if (this.metricsTimer) {
            clearInterval(this.metricsTimer);
            this.metricsTimer = undefined;
        }
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }
    }
    createEmptyStats() {
        return {
            hits: 0,
            misses: 0,
            hitRate: 0,
            totalOperations: 0,
            averageLatency: 0,
            errorRate: 0,
            keyCount: 0,
            evictions: 0
        };
    }
    updateLatency(stats, duration) {
        const total = stats.averageLatency * (stats.totalOperations - 1);
        stats.averageLatency = (total + duration) / stats.totalOperations;
    }
    updateHitRate(stats) {
        stats.hitRate = stats.totalOperations > 0
            ? stats.hits / stats.totalOperations
            : 0;
    }
    updateTopKeys(key) {
        const existing = this.topKeys.get(key);
        if (existing) {
            existing.hits++;
            existing.lastAccessed = Date.now();
        }
        else {
            this.topKeys.set(key, { hits: 1, lastAccessed: Date.now() });
        }
        if (this.topKeys.size > this.config.maxTopKeys) {
            const entries = Array.from(this.topKeys.entries());
            entries.sort((a, b) => b[1].hits - a[1].hits);
            this.topKeys.clear();
            entries.slice(0, this.config.maxTopKeys).forEach(([k, v]) => {
                this.topKeys.set(k, v);
            });
        }
    }
    recordSlowQuery(key, operation, duration) {
        this.slowQueries.push({
            key,
            operation,
            duration,
            timestamp: Date.now()
        });
        if (this.slowQueries.length > this.config.maxSlowQueries) {
            this.slowQueries = this.slowQueries.slice(-this.config.maxSlowQueries);
        }
    }
    calculateOverallStats() {
        const totalHits = this.l1Stats.hits + this.l2Stats.hits;
        const totalMisses = this.l1Stats.misses + this.l2Stats.misses;
        const totalOperations = totalHits + totalMisses;
        const hitRate = totalOperations > 0 ? totalHits / totalOperations : 0;
        const l1HitRate = this.l1Stats.totalOperations > 0 ? this.l1Stats.hitRate : 0;
        const l2HitRate = this.l2Stats.totalOperations > 0 ? this.l2Stats.hitRate : 0;
        const avgLatency = this.operationLatencies.length > 0
            ? this.operationLatencies.reduce((sum, lat) => sum + lat, 0) / this.operationLatencies.length
            : 0;
        const compressionRatio = this.compressionStats.totalOriginalSize > 0
            ? this.compressionStats.totalCompressedSize / this.compressionStats.totalOriginalSize
            : 1;
        const avgResponseSize = 1024;
        const networkSaved = this.l1Stats.hits * avgResponseSize;
        return {
            hitRate,
            totalHits,
            totalMisses,
            totalOperations,
            averageLatency: avgLatency,
            l1HitRate,
            l2HitRate,
            compressionRatio,
            networkSaved
        };
    }
    getTopKeysArray() {
        return Array.from(this.topKeys.entries())
            .map(([key, data]) => ({ key, ...data }))
            .sort((a, b) => b.hits - a.hits);
    }
    trimLatencies() {
        const maxLatencies = 10000;
        if (this.operationLatencies.length > maxLatencies) {
            this.operationLatencies = this.operationLatencies.slice(-maxLatencies);
        }
    }
    getPercentile(sorted, percentile) {
        const index = Math.ceil(sorted.length * percentile) - 1;
        return sorted[Math.max(0, index)];
    }
}
exports.MetricsCollector = MetricsCollector;
//# sourceMappingURL=metrics-collector.js.map