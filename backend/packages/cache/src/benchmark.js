"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheBenchmark = void 0;
const index_1 = require("./index");
const logger_1 = require("@fineprintai/logger");
const logger = (0, logger_1.createServiceLogger)('cache-benchmark');
class CacheBenchmark {
    cache;
    testData = {};
    constructor() {
        const config = index_1.CacheConfigFactory.createHighPerformance();
        this.cache = new index_1.EnhancedCacheManager(config, 'benchmark');
        this.generateTestData();
    }
    async initialize() {
        await this.cache.initialize();
        logger.info('Cache initialized for benchmarking');
    }
    generateTestData() {
        for (let i = 0; i < 10000; i++) {
            this.testData[`small:${i}`] = { id: i, value: `test-${i}` };
            if (i < 1000) {
                this.testData[`medium:${i}`] = {
                    id: i,
                    data: Array(100).fill(0).map((_, j) => ({ field: `value-${i}-${j}` }))
                };
            }
            if (i < 100) {
                this.testData[`large:${i}`] = {
                    id: i,
                    payload: Array(1000).fill(0).map((_, j) => ({
                        id: j,
                        content: `Large content block ${i}-${j} with substantial data`,
                        metadata: { created: Date.now(), version: 1, tags: [`tag-${j}`] }
                    }))
                };
            }
        }
        logger.info('Generated test data', {
            smallItems: 10000,
            mediumItems: 1000,
            largeItems: 100
        });
    }
    async benchmarkL1Performance() {
        logger.info('Starting L1 cache benchmark...');
        const iterations = 10000;
        const keys = Object.keys(this.testData).slice(0, iterations);
        const setStart = Date.now();
        for (const key of keys) {
            await this.cache.set(key, this.testData[key], { ttl: 3600 });
        }
        const setDuration = Date.now() - setStart;
        const getStart = Date.now();
        let hits = 0;
        for (const key of keys) {
            const result = await this.cache.get(key);
            if (result !== null)
                hits++;
        }
        const getDuration = Date.now() - getStart;
        logger.info('L1 Cache Benchmark Results', {
            operations: iterations,
            setDuration,
            getDuration,
            setOpsPerSec: Math.round(iterations / (setDuration / 1000)),
            getOpsPerSec: Math.round(iterations / (getDuration / 1000)),
            avgSetLatency: setDuration / iterations,
            avgGetLatency: getDuration / iterations,
            hitRate: hits / iterations
        });
    }
    async benchmarkBatchOperations() {
        logger.info('Starting batch operations benchmark...');
        const batchSize = 100;
        const batches = 100;
        const totalOps = batchSize * batches;
        const batchData = {};
        for (let i = 0; i < totalOps; i++) {
            batchData[`batch:${i}`] = { id: i, data: `batch-data-${i}` };
        }
        const setBatchStart = Date.now();
        for (let batch = 0; batch < batches; batch++) {
            const batchItems = {};
            for (let i = 0; i < batchSize; i++) {
                const key = `batch:${batch * batchSize + i}`;
                n;
                batchItems[key] = batchData[key];
                n;
            }
            n;
            await this.cache.mset(batchItems, { ttl: 3600 });
            n;
        }
        n;
        const setBatchDuration = Date.now() - setBatchStart;
        n;
        n;
    }
}
exports.CacheBenchmark = CacheBenchmark;
//# sourceMappingURL=benchmark.js.map