import { Storage } from '@plasmohq/storage';
import type { ExtensionSettings, AnalysisCache, StorageData } from '@/types';

// Storage instance using Plasmo's storage abstraction
const storage = new Storage({
  area: 'sync' // Sync across devices
});

const localStorage = new Storage({
  area: 'local' // Local storage for cache
});

// Default settings
export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  autoAnalyze: true,
  highlightFindings: true,
  showNotifications: true,
  analysisThreshold: 'medium',
  theme: 'auto',
};

export class ExtensionStorage {
  // Settings management
  static async getSettings(): Promise<ExtensionSettings> {
    const stored = await storage.get('settings');
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  static async setSettings(settings: Partial<ExtensionSettings>): Promise<void> {
    const current = await this.getSettings();
    const updated = { ...current, ...settings };
    await storage.set('settings', updated);
    
    // Notify all tabs about settings change
    await this.broadcastMessage({
      type: 'SETTINGS_UPDATED',
      payload: updated
    });
  }

  static async updateSetting<K extends keyof ExtensionSettings>(
    key: K,
    value: ExtensionSettings[K]
  ): Promise<void> {
    const settings = await this.getSettings();
    settings[key] = value;
    await this.setSettings(settings);
  }

  // Cache management
  static async getCache(): Promise<AnalysisCache> {
    const cache = await localStorage.get('analysisCache');
    return cache || {};
  }

  static async setCacheEntry(url: string, result: any, hash: string): Promise<void> {
    const cache = await this.getCache();
    cache[url] = {
      result,
      timestamp: Date.now(),
      hash
    };
    
    // Cleanup old entries (keep only last 100)
    const entries = Object.entries(cache);
    if (entries.length > 100) {
      const sorted = entries.sort(([,a], [,b]) => b.timestamp - a.timestamp);
      const newCache = Object.fromEntries(sorted.slice(0, 100));
      await localStorage.set('analysisCache', newCache);
    } else {
      await localStorage.set('analysisCache', cache);
    }
  }

  static async getCacheEntry(url: string): Promise<any | null> {
    const cache = await this.getCache();
    const entry = cache[url];
    
    if (!entry) return null;
    
    // Check if entry is still valid (24 hours)
    const isExpired = Date.now() - entry.timestamp > 24 * 60 * 60 * 1000;
    if (isExpired) {
      await this.removeCacheEntry(url);
      return null;
    }
    
    return entry.result;
  }

  static async removeCacheEntry(url: string): Promise<void> {
    const cache = await this.getCache();
    delete cache[url];
    await localStorage.set('analysisCache', cache);
  }

  static async clearCache(): Promise<void> {
    await localStorage.remove('analysisCache');
  }

  // User authentication
  static async setUserCredentials(apiKey: string, userId: string): Promise<void> {
    await storage.set('apiKey', apiKey);
    await storage.set('userId', userId);
    await storage.set('lastSync', Date.now());
  }

  static async getUserCredentials(): Promise<{ apiKey?: string; userId?: string }> {
    const [apiKey, userId] = await Promise.all([
      storage.get('apiKey'),
      storage.get('userId')
    ]);
    
    return { apiKey, userId };
  }

  static async clearUserCredentials(): Promise<void> {
    await Promise.all([
      storage.remove('apiKey'),
      storage.remove('userId'),
      storage.remove('lastSync')
    ]);
  }

  // API endpoint configuration
  static async setApiEndpoint(endpoint: string): Promise<void> {
    await storage.set('apiEndpoint', endpoint);
  }

  static async getApiEndpoint(): Promise<string | undefined> {
    return await storage.get('apiEndpoint');
  }

  // Full storage data export/import
  static async exportData(): Promise<StorageData> {
    const [settings, cache, lastSync, userId, apiToken] = await Promise.all([
      this.getSettings(),
      this.getCache(),
      storage.get('lastSync'),
      storage.get('userId'),
      storage.get('apiKey')
    ]);

    return {
      settings,
      cache,
      lastSync: lastSync || 0,
      userId,
      apiToken
    };
  }

  static async importData(data: Partial<StorageData>): Promise<void> {
    const promises: Promise<void>[] = [];

    if (data.settings) {
      promises.push(this.setSettings(data.settings));
    }

    if (data.cache) {
      promises.push(localStorage.set('analysisCache', data.cache));
    }

    if (data.userId) {
      promises.push(storage.set('userId', data.userId));
    }

    if (data.apiToken) {
      promises.push(storage.set('apiKey', data.apiToken));
    }

    if (data.lastSync) {
      promises.push(storage.set('lastSync', data.lastSync));
    }

    await Promise.all(promises);
  }

  // Messaging helpers
  static async broadcastMessage(message: any): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({});
      
      await Promise.all(
        tabs.map(async (tab) => {
          if (tab.id) {
            try {
              await chrome.tabs.sendMessage(tab.id, message);
            } catch {
              // Tab might not have content script, ignore
            }
          }
        })
      );
    } catch (error) {
      console.error('Failed to broadcast message:', error);
    }
  }

  // Storage event listeners
  static async onChanged(callback: (changes: Record<string, chrome.storage.StorageChange>) => void): Promise<void> {
    storage.watch(callback);
  }

  // Utility methods
  static async getStorageUsage(): Promise<{ bytesInUse: number; quota: number }> {
    try {
      const bytesInUse = await chrome.storage.sync.getBytesInUse();
      return {
        bytesInUse,
        quota: chrome.storage.sync.QUOTA_BYTES
      };
    } catch {
      return { bytesInUse: 0, quota: 0 };
    }
  }

  static async clearAllData(): Promise<void> {
    await Promise.all([
      storage.clear(),
      localStorage.clear()
    ]);
  }
}

export default ExtensionStorage;