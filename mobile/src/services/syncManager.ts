/**
 * Sync Manager
 * Handles offline/online data synchronization with conflict resolution
 */

import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import { logger } from '../utils/logger';
import { performanceMonitor } from '../utils/performance';
import { ProcessedDocument } from './documentProcessor';
import { AnalysisResult } from './offlineAnalysisEngine';

const SYNC_SETTINGS_KEY = 'sync_settings';
const SYNC_QUEUE_KEY = 'sync_queue';
const LAST_SYNC_KEY = 'last_sync_time';

export interface SyncItem {
  id: string;
  type: 'document' | 'analysis' | 'user_data' | 'settings' | 'patterns';
  action: 'create' | 'update' | 'delete';
  localId: string;
  serverId?: string;
  data: any;
  timestamp: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  attempts: number;
  maxAttempts: number;
  status: 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict';
  error?: string;
  conflictData?: any;
}

export interface SyncConflict {
  id: string;
  type: string;
  localData: any;
  serverData: any;
  timestamp: string;
  resolution?: 'use_local' | 'use_server' | 'merge' | 'manual';
}

export interface SyncSettings {
  enabled: boolean;
  autoSync: boolean;
  syncOnWifiOnly: boolean;
  syncFrequency: number; // minutes
  maxRetries: number;
  batchSize: number;
  enableConflictResolution: boolean;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
}

export interface SyncStats {
  lastSyncTime?: string;
  totalItemsSynced: number;
  pendingItems: number;
  failedItems: number;
  conflictItems: number;
  syncSuccess: boolean;
  averageSyncTime: number;
  dataTransferred: number; // bytes
}

class SyncManager {
  private db: SQLite.WebSQLDatabase | null = null;
  private settings: SyncSettings;
  private syncQueue: SyncItem[] = [];
  private isOnline = false;
  private isSyncing = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private netInfoUnsubscribe: (() => void) | null = null;

  constructor() {
    this.settings = {
      enabled: true,
      autoSync: true,
      syncOnWifiOnly: false,
      syncFrequency: 30, // 30 minutes
      maxRetries: 3,
      batchSize: 10,
      enableConflictResolution: true,
      compressionEnabled: true,
      encryptionEnabled: true,
    };
  }

  /**
   * Initialize the sync manager
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing sync manager...');

      // Initialize database
      await this.initializeDatabase();

      // Load settings and queue
      await this.loadSettings();
      await this.loadSyncQueue();

      // Set up network monitoring
      await this.setupNetworkMonitoring();

      // Start auto sync if enabled
      this.startAutoSync();

      logger.info('Sync manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize sync manager:', error);
      throw error;
    }
  }

  /**
   * Add item to sync queue
   */
  async addToSyncQueue(
    type: SyncItem['type'],
    action: SyncItem['action'],
    localId: string,
    data: any,
    options: {
      serverId?: string;
      priority?: SyncItem['priority'];
      maxAttempts?: number;
    } = {}
  ): Promise<string> {
    const syncItem: SyncItem = {
      id: `${type}_${action}_${localId}_${Date.now()}`,
      type,
      action,
      localId,
      serverId: options.serverId,
      data,
      timestamp: new Date().toISOString(),
      priority: options.priority || 'medium',
      attempts: 0,
      maxAttempts: options.maxAttempts || this.settings.maxRetries,
      status: 'pending',
    };

    this.syncQueue.push(syncItem);
    await this.saveSyncQueue();

    logger.info(`Added item ${syncItem.id} to sync queue`);

    // Trigger sync if online and auto sync is enabled
    if (this.isOnline && this.settings.autoSync && !this.isSyncing) {
      this.performSync().catch(error => {
        logger.error('Auto sync failed:', error);
      });
    }

    return syncItem.id;
  }

  /**
   * Perform synchronization
   */
  async performSync(force = false): Promise<SyncStats> {
    if (this.isSyncing && !force) {
      logger.info('Sync already in progress');
      return this.getLastSyncStats();
    }

    if (!this.isOnline && !force) {
      logger.info('Device is offline, skipping sync');
      return this.getLastSyncStats();
    }

    this.isSyncing = true;
    const startTime = Date.now();
    let totalItemsSynced = 0;
    let dataTransferred = 0;

    try {
      logger.info('Starting synchronization...');
      performanceMonitor.startTimer('sync_operation');

      // Get pending items
      const pendingItems = this.syncQueue.filter(item => item.status === 'pending');
      const prioritizedItems = this.prioritizeItems(pendingItems);

      // Process items in batches
      const batchSize = this.settings.batchSize;
      for (let i = 0; i < prioritizedItems.length; i += batchSize) {
        const batch = prioritizedItems.slice(i, i + batchSize);
        const batchResults = await this.processBatch(batch);
        
        totalItemsSynced += batchResults.synced;
        dataTransferred += batchResults.dataTransferred;

        // Update progress
        const progress = Math.min(100, ((i + batchSize) / prioritizedItems.length) * 100);
        logger.info(`Sync progress: ${progress.toFixed(1)}%`);
      }

      // Save updated queue
      await this.saveSyncQueue();
      await this.saveLastSyncTime();

      const syncTime = performanceMonitor.endTimer('sync_operation');
      
      const stats: SyncStats = {
        lastSyncTime: new Date().toISOString(),
        totalItemsSynced,
        pendingItems: this.syncQueue.filter(item => item.status === 'pending').length,
        failedItems: this.syncQueue.filter(item => item.status === 'failed').length,
        conflictItems: this.syncQueue.filter(item => item.status === 'conflict').length,
        syncSuccess: true,
        averageSyncTime: syncTime,
        dataTransferred,
      };

      await this.saveSyncStats(stats);
      logger.info(`Synchronization completed. Synced ${totalItemsSynced} items in ${syncTime}ms`);

      return stats;
    } catch (error) {
      logger.error('Synchronization failed:', error);
      
      const stats: SyncStats = {
        lastSyncTime: new Date().toISOString(),
        totalItemsSynced,
        pendingItems: this.syncQueue.filter(item => item.status === 'pending').length,
        failedItems: this.syncQueue.filter(item => item.status === 'failed').length,
        conflictItems: this.syncQueue.filter(item => item.status === 'conflict').length,
        syncSuccess: false,
        averageSyncTime: Date.now() - startTime,
        dataTransferred,
      };

      await this.saveSyncStats(stats);
      return stats;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Process a batch of sync items
   */
  private async processBatch(items: SyncItem[]): Promise<{
    synced: number;
    failed: number;
    conflicts: number;
    dataTransferred: number;
  }> {
    let synced = 0;
    let failed = 0;
    let conflicts = 0;
    let dataTransferred = 0;

    for (const item of items) {
      try {
        item.status = 'syncing';
        item.attempts++;

        const result = await this.syncItem(item);
        
        if (result.success) {
          item.status = 'synced';
          if (result.serverId) {
            item.serverId = result.serverId;
          }
          synced++;
          dataTransferred += result.dataSize || 0;
        } else if (result.conflict) {
          item.status = 'conflict';
          item.conflictData = result.conflictData;
          conflicts++;
        } else {
          throw new Error(result.error || 'Sync failed');
        }
      } catch (error) {
        item.error = error.message;
        
        if (item.attempts >= item.maxAttempts) {
          item.status = 'failed';
          failed++;
        } else {
          item.status = 'pending';
        }
        
        logger.error(`Failed to sync item ${item.id}:`, error);
      }
    }

    return { synced, failed, conflicts, dataTransferred };
  }

  /**
   * Sync individual item
   */
  private async syncItem(item: SyncItem): Promise<{
    success: boolean;
    serverId?: string;
    conflict?: boolean;
    conflictData?: any;
    error?: string;
    dataSize?: number;
  }> {
    try {
      switch (item.type) {
        case 'document':
          return await this.syncDocument(item);
        case 'analysis':
          return await this.syncAnalysis(item);
        case 'user_data':
          return await this.syncUserData(item);
        case 'settings':
          return await this.syncSettings(item);
        case 'patterns':
          return await this.syncPatterns(item);
        default:
          throw new Error(`Unknown sync item type: ${item.type}`);
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync document data
   */
  private async syncDocument(item: SyncItem): Promise<any> {
    const document: ProcessedDocument = item.data;
    
    // This would make API calls to backend
    // For now, simulate the sync process
    const apiCall = this.simulateApiCall(item.action, document);
    
    return apiCall;
  }

  /**
   * Sync analysis data
   */
  private async syncAnalysis(item: SyncItem): Promise<any> {
    const analysis: AnalysisResult = item.data;
    
    // This would make API calls to backend
    const apiCall = this.simulateApiCall(item.action, analysis);
    
    return apiCall;
  }

  /**
   * Sync user data
   */
  private async syncUserData(item: SyncItem): Promise<any> {
    const userData = item.data;
    
    const apiCall = this.simulateApiCall(item.action, userData);
    
    return apiCall;
  }

  /**
   * Sync settings
   */
  private async syncSettings(item: SyncItem): Promise<any> {
    const settings = item.data;
    
    const apiCall = this.simulateApiCall(item.action, settings);
    
    return apiCall;
  }

  /**
   * Sync patterns (download from server)
   */
  private async syncPatterns(item: SyncItem): Promise<any> {
    // This would download updated patterns from server
    const apiCall = this.simulateApiCall(item.action, item.data);
    
    return apiCall;
  }

  /**
   * Simulate API call (replace with actual backend integration)
   */
  private async simulateApiCall(action: string, data: any): Promise<any> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

    // Simulate occasional conflicts or failures
    const random = Math.random();
    
    if (random < 0.05) { // 5% chance of conflict
      return {
        success: false,
        conflict: true,
        conflictData: { ...data, modifiedAt: new Date().toISOString() },
      };
    }
    
    if (random < 0.1) { // 5% chance of failure
      throw new Error('Network error');
    }

    // Success
    return {
      success: true,
      serverId: `server_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      dataSize: JSON.stringify(data).length,
    };
  }

  /**
   * Prioritize sync items
   */
  private prioritizeItems(items: SyncItem[]): SyncItem[] {
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    
    return [...items].sort((a, b) => {
      // Sort by priority first
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Then by timestamp (older first)
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });
  }

  /**
   * Resolve sync conflict
   */
  async resolveConflict(
    itemId: string,
    resolution: 'use_local' | 'use_server' | 'merge' | 'manual',
    mergedData?: any
  ): Promise<boolean> {
    const item = this.syncQueue.find(item => item.id === itemId);
    if (!item || item.status !== 'conflict') {
      return false;
    }

    try {
      let resolvedData: any;

      switch (resolution) {
        case 'use_local':
          resolvedData = item.data;
          break;
        case 'use_server':
          resolvedData = item.conflictData;
          break;
        case 'merge':
          resolvedData = this.mergeData(item.data, item.conflictData);
          break;
        case 'manual':
          if (!mergedData) {
            throw new Error('Merged data required for manual resolution');
          }
          resolvedData = mergedData;
          break;
      }

      // Update item with resolved data
      item.data = resolvedData;
      item.status = 'pending';
      item.attempts = 0;
      delete item.conflictData;
      delete item.error;

      await this.saveSyncQueue();
      logger.info(`Conflict resolved for item ${itemId} using ${resolution}`);

      // Trigger sync
      if (this.isOnline && !this.isSyncing) {
        this.performSync().catch(error => {
          logger.error('Sync after conflict resolution failed:', error);
        });
      }

      return true;
    } catch (error) {
      logger.error(`Failed to resolve conflict for item ${itemId}:`, error);
      return false;
    }
  }

  /**
   * Simple data merging strategy
   */
  private mergeData(localData: any, serverData: any): any {
    // Simple merge strategy - in production, this would be more sophisticated
    return {
      ...serverData,
      ...localData,
      mergedAt: new Date().toISOString(),
    };
  }

  /**
   * Setup network monitoring
   */
  private async setupNetworkMonitoring(): Promise<void> {
    this.netInfoUnsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const wasOnline = this.isOnline;
      this.isOnline = state.isConnected === true;

      if (!wasOnline && this.isOnline) {
        logger.info('Device came online, triggering sync');
        this.onOnline();
      }

      // Check WiFi requirement
      if (this.settings.syncOnWifiOnly && state.type !== 'wifi') {
        logger.info('WiFi required for sync, but not connected to WiFi');
        return;
      }
    });

    // Get initial network state
    const state = await NetInfo.fetch();
    this.isOnline = state.isConnected === true;
  }

  /**
   * Handle device coming online
   */
  private onOnline(): void {
    if (this.settings.autoSync && !this.isSyncing) {
      this.performSync().catch(error => {
        logger.error('Auto sync on online failed:', error);
      });
    }
  }

  /**
   * Start auto sync timer
   */
  private startAutoSync(): void {
    if (!this.settings.autoSync) {
      return;
    }

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    const intervalMs = this.settings.syncFrequency * 60 * 1000;
    this.syncInterval = setInterval(() => {
      if (this.isOnline && !this.isSyncing) {
        this.performSync().catch(error => {
          logger.error('Scheduled sync failed:', error);
        });
      }
    }, intervalMs);

    logger.info(`Auto sync started with ${this.settings.syncFrequency} minute interval`);
  }

  /**
   * Stop auto sync timer
   */
  private stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info('Auto sync stopped');
    }
  }

  /**
   * Database and storage methods
   */
  private async initializeDatabase(): Promise<void> {
    this.db = SQLite.openDatabase('sync_manager.db');
    
    await this.executeSql(`
      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        conflict_data TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
  }

  private async executeSql(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.transaction(tx => {
        tx.executeSql(
          sql,
          params,
          (_, result) => resolve(result),
          (_, error) => {
            reject(error);
            return false;
          }
        );
      });
    });
  }

  private async loadSettings(): Promise<void> {
    try {
      const settingsString = await AsyncStorage.getItem(SYNC_SETTINGS_KEY);
      if (settingsString) {
        this.settings = { ...this.settings, ...JSON.parse(settingsString) };
      }
    } catch (error) {
      logger.error('Failed to load sync settings:', error);
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      await AsyncStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (error) {
      logger.error('Failed to save sync settings:', error);
    }
  }

  private async loadSyncQueue(): Promise<void> {
    try {
      const queueString = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
      if (queueString) {
        this.syncQueue = JSON.parse(queueString);
      }
    } catch (error) {
      logger.error('Failed to load sync queue:', error);
    }
  }

  private async saveSyncQueue(): Promise<void> {
    try {
      // Clean up old synced items
      const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
      this.syncQueue = this.syncQueue.filter(item => {
        return item.status !== 'synced' || new Date(item.timestamp).getTime() > cutoffTime;
      });

      await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(this.syncQueue));
    } catch (error) {
      logger.error('Failed to save sync queue:', error);
    }
  }

  private async saveLastSyncTime(): Promise<void> {
    try {
      await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    } catch (error) {
      logger.error('Failed to save last sync time:', error);
    }
  }

  private async saveSyncStats(stats: SyncStats): Promise<void> {
    try {
      await AsyncStorage.setItem('sync_stats', JSON.stringify(stats));
    } catch (error) {
      logger.error('Failed to save sync stats:', error);
    }
  }

  private async getLastSyncStats(): Promise<SyncStats> {
    try {
      const statsString = await AsyncStorage.getItem('sync_stats');
      if (statsString) {
        return JSON.parse(statsString);
      }
    } catch (error) {
      logger.error('Failed to get last sync stats:', error);
    }

    return {
      totalItemsSynced: 0,
      pendingItems: this.syncQueue.filter(item => item.status === 'pending').length,
      failedItems: this.syncQueue.filter(item => item.status === 'failed').length,
      conflictItems: this.syncQueue.filter(item => item.status === 'conflict').length,
      syncSuccess: false,
      averageSyncTime: 0,
      dataTransferred: 0,
    };
  }

  /**
   * Public methods
   */
  async updateSettings(newSettings: Partial<SyncSettings>): Promise<void> {
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();

    // Restart auto sync if frequency changed
    if (newSettings.autoSync !== undefined || newSettings.syncFrequency !== undefined) {
      this.stopAutoSync();
      if (this.settings.autoSync) {
        this.startAutoSync();
      }
    }
  }

  getSettings(): SyncSettings {
    return { ...this.settings };
  }

  getSyncQueue(): SyncItem[] {
    return [...this.syncQueue];
  }

  getConflicts(): SyncItem[] {
    return this.syncQueue.filter(item => item.status === 'conflict');
  }

  async getStats(): Promise<SyncStats> {
    return this.getLastSyncStats();
  }

  isConnected(): boolean {
    return this.isOnline;
  }

  isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    try {
      this.stopAutoSync();
      
      if (this.netInfoUnsubscribe) {
        this.netInfoUnsubscribe();
      }

      await this.saveSyncQueue();
      await this.saveSettings();

      logger.info('Sync manager cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup sync manager:', error);
    }
  }
}

export const syncManager = new SyncManager();