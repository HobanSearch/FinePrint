// Simple cache implementation to avoid external dependencies

interface CacheOptions {
  ttl?: number; // time to live in seconds
  maxSize?: number; // maximum number of items
}

class SimpleCache {
  private store = new Map<string, { value: any; expires: number }>();
  private maxSize: number;

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize || 1000;
  }

  async get<T>(key: string): Promise<T | null> {
    const item = this.store.get(key);
    
    if (!item) {
      return null;
    }
    
    if (Date.now() > item.expires) {
      this.store.delete(key);
      return null;
    }
    
    return item.value;
  }

  async set(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
    // Remove oldest items if we're at capacity
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) {
        this.store.delete(firstKey);
      }
    }
    
    this.store.set(key, {
      value,
      expires: Date.now() + (ttlSeconds * 1000)
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async exists(key: string): Promise<boolean> {
    const item = this.store.get(key);
    if (!item) return false;
    
    if (Date.now() > item.expires) {
      this.store.delete(key);
      return false;
    }
    
    return true;
  }

  async ttl(key: string): Promise<number> {
    const item = this.store.get(key);
    if (!item) return -1;
    
    const remaining = Math.max(0, item.expires - Date.now());
    return Math.floor(remaining / 1000);
  }
}

// Create default cache instance
export const analysisCache = new SimpleCache({ maxSize: 1000 });

// Export classes for custom instances
export { SimpleCache };

// Export types for compatibility
export interface CacheInterface {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
  exists(key: string): Promise<boolean>;
  ttl(key: string): Promise<number>;
}

// Legacy exports for compatibility
export const EnhancedCacheManager = SimpleCache;
export const CacheConfigFactory = { create: () => ({}) };
export const L1Cache = SimpleCache;
export const CompressionManager = { compress: (data: any) => data, decompress: (data: any) => data };
export const compressionPresets = {};
export const DistributedLockManager = class { async acquire() { return true; } async release() {} };
export const LockUtils = {};
export const PubSubCoordinator = class { async publish() {} async subscribe() {} };
export const PubSubUtils = {};
export const InvalidationManager = class { async invalidate() {} };
export const MetricsCollector = class { collect() {} };

// Default export
export default analysisCache;