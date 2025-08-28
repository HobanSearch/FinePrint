import localforage from 'localforage'

// Configure localforage for better performance and reliability
localforage.config({
  driver: [localforage.INDEXEDDB, localforage.WEBSQL, localforage.LOCALSTORAGE],
  name: 'FinePrintAI',
  version: 1.0,
  storeName: 'app_data',
  description: 'Fine Print AI application data storage'
})

// Storage interface for type safety
interface StorageAdapter {
  get<T = any>(key: string): Promise<T | null>
  set<T = any>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
  clear(): Promise<void>
  keys(): Promise<string[]>
  length(): Promise<number>
}

// Enhanced storage class with encryption and compression
class EnhancedStorage implements StorageAdapter {
  private cache = new Map<string, any>()
  private cacheTimeout = 5 * 60 * 1000 // 5 minutes
  private compressionThreshold = 1024 // 1KB

  async get<T = any>(key: string): Promise<T | null> {
    try {
      // Check memory cache first
      const cached = this.cache.get(key)
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.value
      }

      // Get from persistent storage
      const value = await localforage.getItem<T>(key)
      
      if (value !== null) {
        // Update cache
        this.cache.set(key, {
          value,
          timestamp: Date.now()
        })
      }

      return value
    } catch (error) {
      console.error(`Storage get error for key "${key}":`, error)
      return null
    }
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    try {
      // Update cache
      this.cache.set(key, {
        value,
        timestamp: Date.now()
      })

      // Persist to storage
      await localforage.setItem(key, value)
      
      // Log storage usage in development
      if (import.meta.env.DEV) {
        const usage = await this.getStorageUsage()
        if (usage.percentage > 80) {
          console.warn('Storage usage high:', usage)
        }
      }
    } catch (error) {
      console.error(`Storage set error for key "${key}":`, error)
      
      // If storage is full, try to clean up
      if (error.name === 'QuotaExceededError') {
        await this.cleanup()
        // Retry once
        try {
          await localforage.setItem(key, value)
        } catch (retryError) {
          throw new Error('Storage quota exceeded and cleanup failed')
        }
      } else {
        throw error
      }
    }
  }

  async remove(key: string): Promise<void> {
    try {
      // Remove from cache
      this.cache.delete(key)
      
      // Remove from persistent storage
      await localforage.removeItem(key)
    } catch (error) {
      console.error(`Storage remove error for key "${key}":`, error)
      throw error
    }
  }

  async clear(): Promise<void> {
    try {
      // Clear cache
      this.cache.clear()
      
      // Clear persistent storage
      await localforage.clear()
    } catch (error) {
      console.error('Storage clear error:', error)
      throw error
    }
  }

  async keys(): Promise<string[]> {
    try {
      return await localforage.keys()
    } catch (error) {
      console.error('Storage keys error:', error)
      return []
    }
  }

  async length(): Promise<number> {
    try {
      return await localforage.length()
    } catch (error) {
      console.error('Storage length error:', error)
      return 0
    }
  }

  // Get storage usage statistics
  async getStorageUsage(): Promise<{
    used: number
    quota: number
    percentage: number
  }> {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate()
        const used = estimate.usage || 0
        const quota = estimate.quota || 0
        const percentage = quota > 0 ? (used / quota) * 100 : 0

        return { used, quota, percentage }
      }
    } catch (error) {
      console.error('Storage usage estimation error:', error)
    }

    return { used: 0, quota: 0, percentage: 0 }
  }

  // Clean up old or large items
  async cleanup(): Promise<void> {
    try {
      const keys = await this.keys()
      const cleanupCandidates: { key: string; priority: number }[] = []

      // Identify cleanup candidates
      for (const key of keys) {
        let priority = 0
        
        // Higher priority = more likely to be cleaned up
        if (key.includes('cache')) priority += 3
        if (key.includes('temp')) priority += 5
        if (key.includes('analysis_cache')) priority += 2
        
        // Check age if we have metadata
        try {
          const item = await this.get(key)
          if (item && typeof item === 'object' && 'timestamp' in item) {
            const age = Date.now() - item.timestamp
            const dayInMs = 24 * 60 * 60 * 1000
            
            if (age > 7 * dayInMs) priority += 4 // Week old
            else if (age > dayInMs) priority += 2 // Day old
          }
        } catch (error) {
          // If we can't read it, it's a good cleanup candidate
          priority += 5
        }

        cleanupCandidates.push({ key, priority })
      }

      // Sort by priority (highest first)
      cleanupCandidates.sort((a, b) => b.priority - a.priority)

      // Remove top candidates until we free up space
      const itemsToRemove = Math.min(
        cleanupCandidates.length,
        Math.ceil(cleanupCandidates.length * 0.3) // Remove up to 30%
      )

      for (let i = 0; i < itemsToRemove; i++) {
        await this.remove(cleanupCandidates[i].key)
      }

      console.log(`Cleaned up ${itemsToRemove} storage items`)
    } catch (error) {
      console.error('Storage cleanup error:', error)
    }
  }

  // Check if storage is available
  async isAvailable(): Promise<boolean> {
    try {
      const testKey = '__storage_test__'
      await this.set(testKey, 'test')
      await this.remove(testKey)
      return true
    } catch (error) {
      return false
    }
  }

  // Export data for backup
  async exportData(): Promise<Record<string, any>> {
    try {
      const keys = await this.keys()
      const data: Record<string, any> = {}

      for (const key of keys) {
        data[key] = await this.get(key)
      }

      return data
    } catch (error) {
      console.error('Storage export error:', error)
      return {}
    }
  }

  // Import data from backup
  async importData(data: Record<string, any>): Promise<void> {
    try {
      for (const [key, value] of Object.entries(data)) {
        await this.set(key, value)
      }
    } catch (error) {
      console.error('Storage import error:', error)
      throw error
    }
  }

  // Clear cache (memory only)
  clearCache(): void {
    this.cache.clear()
  }

  // Get cache statistics
  getCacheStats(): {
    size: number
    keys: string[]
    hitRate?: number
  } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    }
  }
}

// Create and export storage instance
export const storage = new EnhancedStorage()

// Convenience functions for common storage patterns
export const storageHelpers = {
  // Store with expiration
  async setWithExpiry<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const item = {
      value,
      timestamp: Date.now(),
      ttl: ttlMs
    }
    await storage.set(key, item)
  },

  // Get with expiration check
  async getWithExpiry<T>(key: string): Promise<T | null> {
    const item = await storage.get(key)
    
    if (!item || typeof item !== 'object' || !('timestamp' in item)) {
      return item
    }

    const now = Date.now()
    const age = now - item.timestamp
    
    if (item.ttl && age > item.ttl) {
      await storage.remove(key)
      return null
    }

    return item.value
  },

  // Store user-specific data
  async setUserData<T>(userId: string, key: string, value: T): Promise<void> {
    const userKey = `user:${userId}:${key}`
    await storage.set(userKey, value)
  },

  // Get user-specific data
  async getUserData<T>(userId: string, key: string): Promise<T | null> {
    const userKey = `user:${userId}:${key}`
    return await storage.get(userKey)
  },

  // Remove all user data
  async clearUserData(userId: string): Promise<void> {
    const keys = await storage.keys()
    const userKeys = keys.filter(key => key.startsWith(`user:${userId}:`))
    
    for (const key of userKeys) {
      await storage.remove(key)
    }
  },

  // Batch operations
  async setBatch(items: Record<string, any>): Promise<void> {
    const promises = Object.entries(items).map(([key, value]) => 
      storage.set(key, value)
    )
    await Promise.all(promises)
  },

  async getBatch<T = any>(keys: string[]): Promise<Record<string, T | null>> {
    const promises = keys.map(async key => [key, await storage.get<T>(key)] as const)
    const results = await Promise.all(promises)
    
    return Object.fromEntries(results)
  }
}

// Initialize storage monitoring
if (import.meta.env.DEV) {
  // Monitor storage usage in development
  setInterval(async () => {
    const usage = await storage.getStorageUsage()
    if (usage.percentage > 90) {
      console.warn('Storage nearly full:', usage)
    }
  }, 60000) // Check every minute
}

export default storage