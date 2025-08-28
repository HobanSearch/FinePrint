/**
 * Memory Manager
 * Advanced memory management for optimal app performance
 */

import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';
import { performanceMonitor } from './performance';

const MEMORY_SETTINGS_KEY = 'memory_manager_settings';
const MEMORY_STATS_KEY = 'memory_stats';

export interface MemorySettings {
  enableAutomaticCleanup: boolean;
  maxCacheSize: number; // MB
  imageCacheSize: number; // MB
  cleanupInterval: number; // minutes
  lowMemoryThreshold: number; // MB
  aggressiveCleanupThreshold: number; // MB
  enableMemoryWarnings: boolean;
  enableBackgroundCleanup: boolean;
}

export interface MemoryStats {
  totalMemoryUsage: number;
  cacheSize: number;
  imagesCacheSize: number;
  documentsSize: number;
  temporaryFilesSize: number;
  lastCleanup: string;
  cleanupCount: number;
  lowMemoryEvents: number;
}

export interface CacheItem {
  key: string;
  size: number;
  lastAccessed: number;
  priority: 'low' | 'medium' | 'high';
  type: 'image' | 'document' | 'analysis' | 'other';
}

class MemoryManager {
  private settings: MemorySettings;
  private cache: Map<string, CacheItem> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private appStateSubscription: any;
  private isInitialized = false;
  private memoryWarningListener: any;

  constructor() {
    this.settings = {
      enableAutomaticCleanup: true,
      maxCacheSize: 256, // 256 MB
      imageCacheSize: 128, // 128 MB
      cleanupInterval: 30, // 30 minutes
      lowMemoryThreshold: 50, // 50 MB
      aggressiveCleanupThreshold: 20, // 20 MB
      enableMemoryWarnings: true,
      enableBackgroundCleanup: true,
    };
  }

  /**
   * Initialize memory manager
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing memory manager...');

      await this.loadSettings();
      await this.loadCacheIndex();
      
      this.setupAppStateMonitoring();
      this.setupMemoryWarnings();
      this.startCleanupTimer();

      this.isInitialized = true;
      logger.info('Memory manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize memory manager:', error);
      throw error;
    }
  }

  /**
   * Add item to cache
   */
  async addToCache(
    key: string,
    size: number,
    priority: CacheItem['priority'] = 'medium',
    type: CacheItem['type'] = 'other'
  ): Promise<void> {
    try {
      const cacheItem: CacheItem = {
        key,
        size,
        lastAccessed: Date.now(),
        priority,
        type,
      };

      this.cache.set(key, cacheItem);

      // Check if cleanup is needed
      const totalSize = this.getTotalCacheSize();
      if (totalSize > this.settings.maxCacheSize * 1024 * 1024) {
        await this.performCleanup('cache_full');
      }

      await this.saveCacheIndex();
    } catch (error) {
      logger.error('Failed to add item to cache:', error);
    }
  }

  /**
   * Remove item from cache
   */
  async removeFromCache(key: string): Promise<void> {
    try {
      this.cache.delete(key);
      await this.saveCacheIndex();
    } catch (error) {
      logger.error('Failed to remove item from cache:', error);
    }
  }

  /**
   * Update cache item access time
   */
  updateCacheAccess(key: string): void {
    const item = this.cache.get(key);
    if (item) {
      item.lastAccessed = Date.now();
    }
  }

  /**
   * Get total cache size
   */
  getTotalCacheSize(): number {
    let totalSize = 0;
    this.cache.forEach(item => {
      totalSize += item.size;
    });
    return totalSize;
  }

  /**
   * Get cache size by type
   */
  getCacheSizeByType(type: CacheItem['type']): number {
    let size = 0;
    this.cache.forEach(item => {
      if (item.type === type) {
        size += item.size;
      }
    });
    return size;
  }

  /**
   * Perform memory cleanup
   */
  async performCleanup(reason: 'manual' | 'automatic' | 'low_memory' | 'cache_full' | 'background'): Promise<{
    itemsRemoved: number;
    memoryFreed: number;
  }> {
    try {
      logger.info(`Starting memory cleanup (reason: ${reason})`);
      performanceMonitor.startTimer('memory_cleanup');

      let itemsRemoved = 0;
      let memoryFreed = 0;

      // Determine cleanup strategy based on reason
      const strategy = this.getCleanupStrategy(reason);

      // Clean cache items
      const cacheResults = await this.cleanupCache(strategy);
      itemsRemoved += cacheResults.itemsRemoved;
      memoryFreed += cacheResults.memoryFreed;

      // Clean temporary files
      const tempResults = await this.cleanupTemporaryFiles();
      itemsRemoved += tempResults.itemsRemoved;
      memoryFreed += tempResults.memoryFreed;

      // Clean old logs if aggressive cleanup
      if (strategy.cleanLogs) {
        await logger.clearLogs();
      }

      // Update stats
      await this.updateMemoryStats(itemsRemoved, memoryFreed);

      const cleanupTime = performanceMonitor.endTimer('memory_cleanup');
      logger.info(`Memory cleanup completed in ${cleanupTime}ms: ${itemsRemoved} items, ${(memoryFreed / 1024 / 1024).toFixed(2)}MB freed`);

      return { itemsRemoved, memoryFreed };
    } catch (error) {
      logger.error('Memory cleanup failed:', error);
      return { itemsRemoved: 0, memoryFreed: 0 };
    }
  }

  /**
   * Get cleanup strategy based on reason
   */
  private getCleanupStrategy(reason: string): {
    maxAge: number;
    priorityThreshold: 'low' | 'medium' | 'high';
    typePreference: CacheItem['type'][];
    aggressiveness: 'gentle' | 'moderate' | 'aggressive';
    cleanLogs: boolean;
  } {
    switch (reason) {
      case 'low_memory':
        return {
          maxAge: 30 * 60 * 1000, // 30 minutes
          priorityThreshold: 'medium',
          typePreference: ['other', 'image', 'document', 'analysis'],
          aggressiveness: 'aggressive',
          cleanLogs: true,
        };
      
      case 'cache_full':
        return {
          maxAge: 60 * 60 * 1000, // 1 hour
          priorityThreshold: 'low',
          typePreference: ['other', 'image', 'document', 'analysis'],
          aggressiveness: 'moderate',
          cleanLogs: false,
        };
      
      case 'background':
        return {
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
          priorityThreshold: 'low',
          typePreference: ['other', 'image'],
          aggressiveness: 'gentle',
          cleanLogs: false,
        };
      
      default:
        return {
          maxAge: 2 * 60 * 60 * 1000, // 2 hours
          priorityThreshold: 'low',
          typePreference: ['other', 'image', 'document'],
          aggressiveness: 'moderate',
          cleanLogs: false,
        };
    }
  }

  /**
   * Clean cache items based on strategy
   */
  private async cleanupCache(strategy: any): Promise<{
    itemsRemoved: number;
    memoryFreed: number;
  }> {
    let itemsRemoved = 0;
    let memoryFreed = 0;
    const now = Date.now();

    // Sort items by cleanup priority
    const sortedItems = Array.from(this.cache.entries()).sort((a, b) => {
      const [, itemA] = a;
      const [, itemB] = b;

      // Priority order for removal
      const priorityOrder = { low: 1, medium: 2, high: 3 };
      const typeOrder = strategy.typePreference.reduce((acc: any, type: string, index: number) => {
        acc[type] = index;
        return acc;
      }, {});

      // Sort by priority (lower priority first), then type preference, then age
      if (priorityOrder[itemA.priority] !== priorityOrder[itemB.priority]) {
        return priorityOrder[itemA.priority] - priorityOrder[itemB.priority];
      }

      if (typeOrder[itemA.type] !== typeOrder[itemB.type]) {
        return typeOrder[itemA.type] - typeOrder[itemB.type];
      }

      return itemA.lastAccessed - itemB.lastAccessed;
    });

    // Remove items based on strategy
    for (const [key, item] of sortedItems) {
      const age = now - item.lastAccessed;
      const shouldRemove = 
        age > strategy.maxAge ||
        (strategy.aggressiveness === 'aggressive' && item.priority === 'low') ||
        (strategy.aggressiveness === 'moderate' && item.priority === 'low' && age > 15 * 60 * 1000);

      if (shouldRemove) {
        this.cache.delete(key);
        itemsRemoved++;
        memoryFreed += item.size;

        // Stop if we've freed enough memory (for gentle cleanup)
        if (strategy.aggressiveness === 'gentle' && memoryFreed > 50 * 1024 * 1024) {
          break;
        }
      }
    }

    await this.saveCacheIndex();
    return { itemsRemoved, memoryFreed };
  }

  /**
   * Clean temporary files
   */
  private async cleanupTemporaryFiles(): Promise<{
    itemsRemoved: number;
    memoryFreed: number;
  }> {
    try {
      // This is a placeholder - would implement actual file cleanup
      // In a real implementation, you'd scan temp directories and remove old files
      return { itemsRemoved: 0, memoryFreed: 0 };
    } catch (error) {
      logger.error('Failed to cleanup temporary files:', error);
      return { itemsRemoved: 0, memoryFreed: 0 };
    }
  }

  /**
   * Setup app state monitoring
   */
  private setupAppStateMonitoring(): void {
    this.appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' && this.settings.enableBackgroundCleanup) {
        // Perform gentle cleanup when app goes to background
        this.performCleanup('background').catch(error => {
          logger.error('Background cleanup failed:', error);
        });
      }
    });
  }

  /**
   * Setup memory warnings
   */
  private setupMemoryWarnings(): void {
    if (!this.settings.enableMemoryWarnings) {
      return;
    }

    // Monitor memory usage periodically
    setInterval(() => {
      this.checkMemoryPressure().catch(error => {
        logger.error('Memory pressure check failed:', error);
      });
    }, 60 * 1000); // Check every minute
  }

  /**
   * Check memory pressure and trigger cleanup if needed
   */
  private async checkMemoryPressure(): Promise<void> {
    try {
      const totalSize = this.getTotalCacheSize();
      const totalSizeMB = totalSize / (1024 * 1024);

      if (totalSizeMB > this.settings.aggressiveCleanupThreshold) {
        logger.warn(`High memory usage detected: ${totalSizeMB.toFixed(2)}MB`);
        await this.performCleanup('low_memory');
      } else if (totalSizeMB > this.settings.lowMemoryThreshold) {
        logger.info(`Moderate memory usage: ${totalSizeMB.toFixed(2)}MB`);
        // Could trigger gentle cleanup here
      }
    } catch (error) {
      logger.error('Memory pressure check failed:', error);
    }
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    if (!this.settings.enableAutomaticCleanup) {
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.performCleanup('automatic').catch(error => {
        logger.error('Automatic cleanup failed:', error);
      });
    }, this.settings.cleanupInterval * 60 * 1000);
  }

  /**
   * Stop cleanup timer
   */
  private stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get memory statistics
   */
  async getMemoryStats(): Promise<MemoryStats> {
    try {
      const totalMemoryUsage = this.getTotalCacheSize();
      const imagesCacheSize = this.getCacheSizeByType('image');
      const documentsSize = this.getCacheSizeByType('document');

      const stats = await AsyncStorage.getItem(MEMORY_STATS_KEY);
      const savedStats = stats ? JSON.parse(stats) : {};

      return {
        totalMemoryUsage,
        cacheSize: totalMemoryUsage,
        imagesCacheSize,
        documentsSize,
        temporaryFilesSize: 0, // Would calculate actual temp files size
        lastCleanup: savedStats.lastCleanup || '',
        cleanupCount: savedStats.cleanupCount || 0,
        lowMemoryEvents: savedStats.lowMemoryEvents || 0,
      };
    } catch (error) {
      logger.error('Failed to get memory stats:', error);
      return {
        totalMemoryUsage: 0,
        cacheSize: 0,
        imagesCacheSize: 0,
        documentsSize: 0,
        temporaryFilesSize: 0,
        lastCleanup: '',
        cleanupCount: 0,
        lowMemoryEvents: 0,
      };
    }
  }

  /**
   * Update memory statistics
   */
  private async updateMemoryStats(itemsRemoved: number, memoryFreed: number): Promise<void> {
    try {
      const currentStats = await this.getMemoryStats();
      const updatedStats = {
        ...currentStats,
        lastCleanup: new Date().toISOString(),
        cleanupCount: currentStats.cleanupCount + 1,
      };

      await AsyncStorage.setItem(MEMORY_STATS_KEY, JSON.stringify(updatedStats));
    } catch (error) {
      logger.error('Failed to update memory stats:', error);
    }
  }

  /**
   * Storage methods
   */
  private async loadSettings(): Promise<void> {
    try {
      const settingsString = await AsyncStorage.getItem(MEMORY_SETTINGS_KEY);
      if (settingsString) {
        this.settings = { ...this.settings, ...JSON.parse(settingsString) };
      }
    } catch (error) {
      logger.error('Failed to load memory settings:', error);
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      await AsyncStorage.setItem(MEMORY_SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (error) {
      logger.error('Failed to save memory settings:', error);
    }
  }

  private async loadCacheIndex(): Promise<void> {
    try {
      const cacheString = await AsyncStorage.getItem('memory_cache_index');
      if (cacheString) {
        const cacheArray: CacheItem[] = JSON.parse(cacheString);
        this.cache.clear();
        cacheArray.forEach(item => {
          this.cache.set(item.key, item);
        });
      }
    } catch (error) {
      logger.error('Failed to load cache index:', error);
    }
  }

  private async saveCacheIndex(): Promise<void> {
    try {
      const cacheArray = Array.from(this.cache.values());
      await AsyncStorage.setItem('memory_cache_index', JSON.stringify(cacheArray));
    } catch (error) {
      logger.error('Failed to save cache index:', error);
    }
  }

  /**
   * Public methods
   */
  async updateSettings(newSettings: Partial<MemorySettings>): Promise<void> {
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();

    // Restart cleanup timer if interval changed
    if (newSettings.cleanupInterval !== undefined) {
      this.stopCleanupTimer();
      if (this.settings.enableAutomaticCleanup) {
        this.startCleanupTimer();
      }
    }
  }

  getSettings(): MemorySettings {
    return { ...this.settings };
  }

  getCacheInfo(): { totalItems: number; totalSize: number; itemsByType: Record<string, number> } {
    const itemsByType: Record<string, number> = {};
    let totalSize = 0;

    this.cache.forEach(item => {
      itemsByType[item.type] = (itemsByType[item.type] || 0) + 1;
      totalSize += item.size;
    });

    return {
      totalItems: this.cache.size,
      totalSize,
      itemsByType,
    };
  }

  /**
   * Force immediate cleanup
   */
  async forceCleanup(): Promise<{ itemsRemoved: number; memoryFreed: number }> {
    return await this.performCleanup('manual');
  }

  /**
   * Clear all cache
   */
  async clearAllCache(): Promise<void> {
    this.cache.clear();
    await this.saveCacheIndex();
    logger.info('All cache cleared');
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup(): Promise<void> {
    try {
      this.stopCleanupTimer();
      
      if (this.appStateSubscription) {
        this.appStateSubscription.remove();
      }

      if (this.memoryWarningListener) {
        this.memoryWarningListener.remove();
      }

      await this.saveSettings();
      await this.saveCacheIndex();

      logger.info('Memory manager cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup memory manager:', error);
    }
  }
}

export const memoryManager = new MemoryManager();