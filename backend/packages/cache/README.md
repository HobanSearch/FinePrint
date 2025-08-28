# @fineprintai/cache

Enhanced multi-level caching system with distributed coordination, compression, and advanced monitoring for Fine Print AI.

## Features

- **Multi-Level Caching**: L1 (in-memory) and L2 (Redis) caching with intelligent promotion/demotion
- **Distributed Coordination**: Redis-based distributed locking and pub/sub coordination across instances
- **Tag-based Invalidation**: Efficient cache invalidation using tags and patterns
- **Compression**: Configurable compression for large values with multiple algorithms
- **Advanced Monitoring**: Comprehensive metrics, hit rate tracking, and performance monitoring
- **Refresh-Ahead**: Proactive cache refresh to prevent cache stampedes
- **Cache Warming**: Strategic pre-loading of frequently accessed data
- **Circuit Breaker**: Automatic failover protection for Redis outages
- **Performance Optimized**: Sub-200ms response times with intelligent caching strategies

## Installation

```bash
npm install @fineprintai/cache
```

## Quick Start

```typescript
import { cache, analysisCache, CacheConfigFactory } from '@fineprintai/cache';

// Initialize cache (done automatically)
await cache.initialize();

// Basic operations
await cache.set('user:123', { name: 'John', email: 'john@example.com' });
const user = await cache.get('user:123');

// With TTL and tags
await cache.set('document:456', analysisResult, {
  ttl: 3600, // 1 hour
  tags: ['document', 'analysis'],
  priority: 'high'
});

// Invalidate by tags
await cache.invalidateByTags(['document']);

// Health check
const health = await cache.healthCheck();
console.log('Cache healthy:', health.healthy);
```

## Configuration

### Environment-based Configuration

The cache automatically configures itself based on the environment:

```typescript
import { CacheConfigFactory } from '@fineprintai/cache';

// Create configuration for current environment
const config = CacheConfigFactory.createFromEnv();

// Create specialized configurations
const sessionConfig = CacheConfigFactory.createSpecialized('session');
const apiConfig = CacheConfigFactory.createSpecialized('api');
const analysisConfig = CacheConfigFactory.createSpecialized('analysis');
```

### Custom Configuration

```typescript
import { EnhancedCacheManager, CacheConfigFactory } from '@fineprintai/cache';

const customConfig = {
  l1: {
    enabled: true,
    maxSize: 10000,
    maxMemory: 128 * 1024 * 1024, // 128MB
    ttl: 3600, // 1 hour
    checkPeriod: 300 // 5 minutes
  },
  l2: {
    enabled: true,
    cluster: false,
    url: 'redis://localhost:6379',
    keyPrefix: 'myapp',
    ttl: 7200, // 2 hours
    maxRetries: 3,
    retryDelay: 100,
    compression: {
      enabled: true,
      algorithm: 'gzip',
      threshold: 1024, // 1KB
      level: 6
    }
  },
  performance: {
    batchSize: 100,
    pipelineThreshold: 10,
    refreshAheadEnabled: true,
    refreshAheadThreshold: 20, // 20% of TTL
    preloadEnabled: true,
    metricsEnabled: true
  },
  monitoring: {
    enabled: true,
    metricsInterval: 60000, // 1 minute
    slowLogThreshold: 100, // 100ms
    alertThresholds: {
      hitRateMin: 0.8, // 80%
      errorRateMax: 0.05, // 5%
      latencyMax: 200 // 200ms
    }
  }
};

const customCache = new EnhancedCacheManager(customConfig);
```

## Advanced Features

### Document Analysis Caching

Specialized caching for document analysis results with intelligent TTL based on confidence:

```typescript
import { analysisCache } from '@fineprintai/cache';

// Cache analysis result
const analysisResult = {
  result: { patterns: ['automatic-renewal'], riskScore: 0.8 },
  confidence: 0.95,
  processingTime: 2500,
  modelUsed: 'mistral-7b',
  patterns: ['automatic-renewal', 'data-sharing'],
  riskScore: 0.8,
  createdAt: Date.now()
};

await analysisCache.cacheDocumentAnalysis(
  { 
    documentId: 'doc123', 
    analysisType: 'full', 
    version: '1.0',
    model: 'mistral-7b' 
  },
  analysisResult
);

// Retrieve with fallback to different versions
const cached = await analysisCache.getDocumentAnalysis({ 
  documentId: 'doc123', 
  analysisType: 'full' 
});
```

### Distributed Locking

```typescript
// Acquire lock for critical section
const lock = await cache.acquireLock('process:document:123', 30000);
if (lock) {
  try {
    // Critical section code
    await processDocument();
  } finally {
    await cache.releaseLock(lock);
  }
}

// Use lock with automatic management
await cache.withLock('process:document:123', async () => {
  // Critical section code
  await processDocument();
});
```

### Cache Warming

```typescript
// Warm cache with frequently accessed data
const warmedCount = await cache.warmup('user:*', async (key) => {
  const userId = key.split(':')[1];
  return await loadUserFromDatabase(userId);
}, { 
  ttl: 3600,
  priority: 'high',
  tags: ['user', 'warmup']
});

console.log(`Warmed ${warmedCount} cache entries`);
```

### Batch Operations

```typescript
// Batch get operations
const keys = ['user:1', 'user:2', 'user:3'];
const results = await cache.mget(keys);

// Batch set operations
await cache.mset({
  'user:1': { name: 'Alice' },
  'user:2': { name: 'Bob' },
  'user:3': { name: 'Charlie' }
}, { ttl: 3600 });

// Batch operations with different actions
const operations = [
  { operation: 'get', key: 'user:1' },
  { operation: 'set', key: 'user:2', value: { name: 'Updated' }, options: { ttl: 1800 } },
  { operation: 'delete', key: 'user:3' }
];

const batchResults = await cache.batch(operations);
```

### Performance Monitoring

```typescript
import { CachePerformanceUtils } from '@fineprintai/cache';

// Monitor cache health
await CachePerformanceUtils.monitorHealth(cache);

// Measure operation performance
const { result, duration } = await CachePerformanceUtils.measureOperation(
  () => cache.get('expensive:operation'),
  'expensiveGet'
);

// Batch get with performance optimization
const results = await CachePerformanceUtils.batchGet(
  cache,
  largeKeyArray,
  100 // batch size
);
```

### Metrics and Statistics

```typescript
// Get current statistics
const stats = cache.getStats();
console.log('Hit rate:', stats.overall.hitRate);
console.log('L1 keys:', stats.l1.keyCount);
console.log('L2 keys:', stats.l2.keyCount);

// Get detailed metrics
const metrics = cache.getMetrics();
console.log('Top keys:', metrics.topKeys);
console.log('Slow queries:', metrics.slowQueries);

// Export Prometheus metrics
const prometheusMetrics = cache.exportPrometheusMetrics();
```

## Pre-configured Cache Instances

The package provides several pre-configured cache instances optimized for different use cases:

```typescript
import { 
  cache,        // General-purpose cache
  sessionCache, // Session data cache
  analysisCache,// Document analysis cache
  apiCache,     // API response cache
  rateLimitCache// Rate limiting cache
} from '@fineprintai/cache';

// Each instance is optimized for its specific use case
await sessionCache.set('session:abc123', sessionData, { ttl: 86400 }); // 24 hours
await apiCache.set('api:/users', userList, { ttl: 300 }); // 5 minutes
await rateLimitCache.set('rate:user:123', requestCount, { ttl: 60 }); // 1 minute
```

## Environment Variables

Configure cache behavior using environment variables:

```bash
# L1 Cache Configuration
CACHE_L1_MAX_SIZE=10000
CACHE_L1_MAX_MEMORY=134217728  # 128MB
CACHE_L1_TTL=3600

# L2 Cache Configuration
CACHE_L2_TTL=7200
CACHE_L2_CLUSTER=true

# Performance Configuration
CACHE_COMPRESSION_ENABLED=true
CACHE_MONITORING_ENABLED=true

# Redis Configuration (from @fineprintai/config)
REDIS_URL=redis://localhost:6379
REDIS_MAX_RETRIES=3
```

## Performance Benchmarks

The enhanced cache system is designed for high performance:

- **L1 Cache**: < 1ms average latency
- **L2 Cache**: < 10ms average latency (local Redis)
- **Overall**: < 200ms P95 response time
- **Throughput**: > 10,000 operations/second
- **Hit Rate**: > 85% with proper warming

Run benchmarks:

```bash
npm run benchmark
```

## Health Monitoring

Monitor cache health in production:

```bash
# Manual health check
npm run health-check

# Programmatic monitoring
import { CachePerformanceUtils } from '@fineprintai/cache';

setInterval(async () => {
  await CachePerformanceUtils.monitorHealth(cache);
}, 60000); // Every minute
```

## Legacy Compatibility

The package maintains backward compatibility with the original CacheManager:

```typescript
import { CacheManager } from '@fineprintai/cache';

const legacyCache = new CacheManager('myprefix');
await legacyCache.set('key', 'value', 3600);
const value = await legacyCache.get('key');

// Access enhanced features
const enhanced = legacyCache.getEnhanced();
const stats = enhanced.getStats();
```

## Error Handling and Circuit Breaker

The cache includes automatic circuit breaker protection:

```typescript
// Circuit breaker automatically opens on repeated failures
// and provides graceful degradation

try {
  const result = await cache.get('key');
  if (result === null) {
    // Cache miss or circuit breaker open - fallback to database
    const data = await loadFromDatabase('key');
    await cache.set('key', data); // Will be skipped if circuit breaker is open
    return data;
  }
  return result;
} catch (error) {
  // Handle cache errors gracefully
  return await loadFromDatabase('key');
}
```

## Compression

Configure compression for large values:

```typescript
import { compressionPresets } from '@fineprintai/cache';

// Use different compression presets
const archivalConfig = compressionPresets.archival; // High compression for cold storage
const balancedConfig = compressionPresets.balanced; // Balanced compression/speed
const fastConfig = compressionPresets.fast;         // Fast compression for hot data
const disabled = compressionPresets.disabled;       // No compression
```

## Best Practices

1. **Use appropriate TTLs**: Set TTL based on data freshness requirements
2. **Tag strategically**: Use tags for efficient invalidation
3. **Monitor hit rates**: Aim for >80% hit rate
4. **Warm critical paths**: Pre-load frequently accessed data
5. **Handle failures gracefully**: Always have fallback mechanisms
6. **Use batch operations**: For better performance with multiple keys
7. **Monitor performance**: Regular health checks and metrics review

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import { 
  CacheConfig, 
  CacheOptions, 
  CacheStats, 
  DocumentCacheKey,
  DocumentAnalysisCache 
} from '@fineprintai/cache';

// Strongly typed cache operations
const result = await cache.get<UserProfile>('user:123');
const analysis = await analysisCache.get<DocumentAnalysisCache>('doc:analysis');
```

## Contributing

Please refer to the main project's contributing guidelines.

## License

This package is part of the Fine Print AI project and follows the same license terms.