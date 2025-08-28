/**
 * Offline Slice for Fine Print AI Store
 * Manages offline state, sync queue, and cached data
 */

import { StateCreator } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import localforage from 'localforage'
import { RootStore } from '../types'

// Configure localforage for encrypted storage
localforage.config({
  name: 'FineePrintAI',
  storeName: 'offline_data',
  description: 'Offline data for Fine Print AI'
})

export interface AnalysisQueueItem {
  id: string
  documentId: string
  fileName: string
  fileContent: string
  fileType: string
  fileSize: number
  userId: string
  options: {
    priority: 'high' | 'medium' | 'low'
    analysisType: 'tos' | 'privacy' | 'eula' | 'contract'
    deepScan: boolean
    compareMode: boolean
  }
  timestamp: number
  retryCount: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  lastError?: string
}

export interface CachedAnalysis {
  id: string
  documentId: string
  fileName: string
  result: any
  timestamp: number
  expiresAt: number
  version: string
  checksum: string
}

export interface SyncOperation {
  id: string
  type: 'analysis' | 'notification' | 'preference' | 'user_data'
  operation: 'create' | 'update' | 'delete'
  data: any
  timestamp: number
  retryCount: number
  lastAttempt?: number
  status: 'pending' | 'syncing' | 'completed' | 'failed'
}

export interface OfflineMetrics {
  totalOperations: number
  pendingOperations: number
  failedOperations: number
  lastSyncAttempt: number
  lastSuccessfulSync: number
  avgSyncTime: number
  cacheHitRate: number
  storageUsed: number
  storageLimit: number
}

export interface OfflineSlice {
  // Connection state
  isOnline: boolean
  connectionQuality: 'good' | 'poor' | 'offline'
  lastOnlineTime: number
  offlineDuration: number
  
  // Queue management
  analysisQueue: AnalysisQueueItem[]
  syncQueue: SyncOperation[]
  
  // Cache management
  cachedAnalyses: Record<string, CachedAnalysis>
  cacheSize: number
  maxCacheSize: number
  
  // Offline capabilities
  offlineMode: boolean
  autoSync: boolean
  syncInProgress: boolean
  
  // Metrics and monitoring
  metrics: OfflineMetrics
  
  // Actions
  setOnline: (online: boolean) => void
  setConnectionQuality: (quality: 'good' | 'poor' | 'offline') => void
  
  // Queue operations
  addToAnalysisQueue: (item: Omit<AnalysisQueueItem, 'id' | 'timestamp' | 'retryCount' | 'status'>) => void
  removeFromAnalysisQueue: (id: string) => void
  updateAnalysisQueueItem: (id: string, updates: Partial<AnalysisQueueItem>) => void
  clearAnalysisQueue: () => void
  
  // Sync operations
  addToSyncQueue: (operation: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount' | 'status'>) => void
  removeFromSyncQueue: (id: string) => void
  processSyncQueue: () => Promise<void>
  
  // Cache operations
  addToCache: (analysis: Omit<CachedAnalysis, 'timestamp'>) => void
  getFromCache: (documentId: string) => CachedAnalysis | null
  removeFromCache: (documentId: string) => void
  clearExpiredCache: () => void
  clearAllCache: () => void
  
  // Offline mode
  enableOfflineMode: () => void
  disableOfflineMode: () => void
  
  // Sync management
  startSync: () => Promise<void>
  stopSync: () => void
  
  // Storage management
  getStorageInfo: () => Promise<{ used: number; available: number }>
  cleanupStorage: () => Promise<void>
  
  // Conflict resolution
  resolveConflict: (localData: any, serverData: any, strategy: 'local' | 'server' | 'merge') => any
  
  // Metrics
  updateMetrics: () => void
  getMetrics: () => OfflineMetrics
}

export const createOfflineSlice: StateCreator<
  RootStore,
  [],
  [],
  OfflineSlice
> = (set, get) => ({
  // Initial state
  isOnline: navigator.onLine,
  connectionQuality: navigator.onLine ? 'good' : 'offline',
  lastOnlineTime: Date.now(),
  offlineDuration: 0,
  
  analysisQueue: [],
  syncQueue: [],
  
  cachedAnalyses: {},
  cacheSize: 0,
  maxCacheSize: 50 * 1024 * 1024, // 50MB
  
  offlineMode: false,
  autoSync: true,
  syncInProgress: false,
  
  metrics: {
    totalOperations: 0,
    pendingOperations: 0,
    failedOperations: 0,
    lastSyncAttempt: 0,
    lastSuccessfulSync: 0,
    avgSyncTime: 0,
    cacheHitRate: 0,
    storageUsed: 0,
    storageLimit: 0
  },
  
  // Connection management
  setOnline: (online) => {
    const currentTime = Date.now()
    const state = get().offline
    
    set((state) => {
      state.offline.isOnline = online
      
      if (online) {
        state.offline.lastOnlineTime = currentTime
        state.offline.offlineDuration = 0
        state.offline.connectionQuality = 'good'
        
        // Trigger sync when coming online
        if (state.offline.autoSync && !state.offline.syncInProgress) {
          // Use setTimeout to avoid blocking the state update
          setTimeout(() => get().offline.startSync(), 100)
        }
      } else {
        state.offline.connectionQuality = 'offline'
        const offlineStart = state.offline.lastOnlineTime
        state.offline.offlineDuration = currentTime - offlineStart
      }
    })
  },
  
  setConnectionQuality: (quality) => {
    set((state) => {
      state.offline.connectionQuality = quality
    })
  },
  
  // Analysis queue management
  addToAnalysisQueue: (item) => {
    const id = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const queueItem: AnalysisQueueItem = {
      ...item,
      id,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    }
    
    set((state) => {
      state.offline.analysisQueue.push(queueItem)
      state.offline.metrics.totalOperations++
      state.offline.metrics.pendingOperations++
    })
    
    // Store in persistent storage
    get().offline.persistQueue()
    
    // Process if online
    if (get().offline.isOnline && get().offline.autoSync) {
      setTimeout(() => get().offline.startSync(), 0)
    }
  },
  
  removeFromAnalysisQueue: (id) => {
    set((state) => {
      const index = state.offline.analysisQueue.findIndex(item => item.id === id)
      if (index >= 0) {
        const item = state.offline.analysisQueue[index]
        state.offline.analysisQueue.splice(index, 1)
        
        if (item.status === 'pending') {
          state.offline.metrics.pendingOperations--
        }
      }
    })
    
    get().offline.persistQueue()
  },
  
  updateAnalysisQueueItem: (id, updates) => {
    set((state) => {
      const item = state.offline.analysisQueue.find(item => item.id === id)
      if (item) {
        const oldStatus = item.status
        Object.assign(item, updates)
        
        // Update metrics
        if (oldStatus === 'pending' && updates.status && updates.status !== 'pending') {
          state.offline.metrics.pendingOperations--
        }
        if (updates.status === 'failed') {
          state.offline.metrics.failedOperations++
        }
      }
    })
    
    get().offline.persistQueue()
  },
  
  clearAnalysisQueue: () => {
    set((state) => {
      state.offline.analysisQueue = []
      state.offline.metrics.pendingOperations = 0
    })
    
    get().offline.persistQueue()
  },
  
  // Sync queue management
  addToSyncQueue: (operation) => {
    const id = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const syncOp: SyncOperation = {
      ...operation,
      id,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    }
    
    set((state) => {
      state.offline.syncQueue.push(syncOp)
    })
    
    get().offline.persistSyncQueue()
  },
  
  removeFromSyncQueue: (id) => {
    set((state) => {
      const index = state.offline.syncQueue.findIndex(op => op.id === id)
      if (index >= 0) {
        state.offline.syncQueue.splice(index, 1)
      }
    })
    
    get().offline.persistSyncQueue()
  },
  
  processSyncQueue: async () => {
    const state = get().offline
    if (!state.isOnline || state.syncInProgress || state.syncQueue.length === 0) {
      return
    }
    
    set((state) => {
      state.offline.syncInProgress = true
      state.offline.metrics.lastSyncAttempt = Date.now()
    })
    
    const syncStartTime = Date.now()
    let successCount = 0
    let errorCount = 0
    
    try {
      const operations = [...state.syncQueue]
      
      for (const operation of operations) {
        try {
          await get().offline.processSyncOperation(operation)
          get().offline.removeFromSyncQueue(operation.id)
          successCount++
        } catch (error) {
          console.error('Sync operation failed:', error)
          errorCount++
          
          // Update retry count
          set((state) => {
            const op = state.offline.syncQueue.find(o => o.id === operation.id)
            if (op) {
              op.retryCount++
              op.lastAttempt = Date.now()
              op.status = 'failed'
              
              // Remove if max retries exceeded
              if (op.retryCount >= 3) {
                const index = state.offline.syncQueue.findIndex(o => o.id === operation.id)
                if (index >= 0) {
                  state.offline.syncQueue.splice(index, 1)
                }
              }
            }
          })
        }
      }
      
      if (successCount > 0) {
        set((state) => {
          state.offline.metrics.lastSuccessfulSync = Date.now()
        })
      }
      
    } finally {
      const syncTime = Date.now() - syncStartTime
      
      set((state) => {
        state.offline.syncInProgress = false
        
        // Update average sync time
        const currentAvg = state.offline.metrics.avgSyncTime
        state.offline.metrics.avgSyncTime = currentAvg === 0 ? syncTime : (currentAvg + syncTime) / 2
      })
      
      get().offline.persistSyncQueue()
    }
  },
  
  // Cache management
  addToCache: (analysis) => {
    const cacheItem: CachedAnalysis = {
      ...analysis,
      timestamp: Date.now()
    }
    
    set((state) => {
      state.offline.cachedAnalyses[analysis.documentId] = cacheItem
    })
    
    get().offline.persistCache()
    get().offline.updateCacheSize()
  },
  
  getFromCache: (documentId) => {
    const cached = get().offline.cachedAnalyses[documentId]
    
    if (cached && cached.expiresAt > Date.now()) {
      // Update cache hit rate
      set((state) => {
        const currentRate = state.offline.metrics.cacheHitRate
        state.offline.metrics.cacheHitRate = (currentRate + 1) / 2
      })
      
      return cached
    }
    
    return null
  },
  
  removeFromCache: (documentId) => {
    set((state) => {
      delete state.offline.cachedAnalyses[documentId]
    })
    
    get().offline.persistCache()
    get().offline.updateCacheSize()
  },
  
  clearExpiredCache: () => {
    const currentTime = Date.now()
    
    set((state) => {
      Object.keys(state.offline.cachedAnalyses).forEach(key => {
        const item = state.offline.cachedAnalyses[key]
        if (item.expiresAt <= currentTime) {
          delete state.offline.cachedAnalyses[key]
        }
      })
    })
    
    get().offline.persistCache()
    get().offline.updateCacheSize()
  },
  
  clearAllCache: () => {
    set((state) => {
      state.offline.cachedAnalyses = {}
      state.offline.cacheSize = 0
    })
    
    get().offline.persistCache()
  },
  
  // Offline mode
  enableOfflineMode: () => {
    set((state) => {
      state.offline.offlineMode = true
    })
  },
  
  disableOfflineMode: () => {
    set((state) => {
      state.offline.offlineMode = false
    })
  },
  
  // Sync management
  startSync: async () => {
    await get().offline.processSyncQueue()
    await get().offline.processAnalysisQueue()
  },
  
  stopSync: () => {
    set((state) => {
      state.offline.syncInProgress = false
    })
  },
  
  // Storage management
  getStorageInfo: async () => {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate()
        return {
          used: estimate.usage || 0,
          available: (estimate.quota || 0) - (estimate.usage || 0)
        }
      }
    } catch (error) {
      console.error('Failed to get storage info:', error)
    }
    
    return { used: 0, available: 0 }
  },
  
  cleanupStorage: async () => {
    // Clear expired cache
    get().offline.clearExpiredCache()
    
    // Remove old completed analysis queue items
    set((state) => {
      const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000) // 7 days
      state.offline.analysisQueue = state.offline.analysisQueue.filter(
        item => item.status !== 'completed' || item.timestamp > cutoff
      )
    })
    
    // Persist changes
    await Promise.all([
      get().offline.persistQueue(),
      get().offline.persistCache(),
      get().offline.persistSyncQueue()
    ])
    
    get().offline.updateMetrics()
  },
  
  // Conflict resolution
  resolveConflict: (localData, serverData, strategy) => {
    switch (strategy) {
      case 'local':
        return localData
      
      case 'server':
        return serverData
      
      case 'merge':
        // Simple merge strategy - can be enhanced
        return { ...serverData, ...localData }
      
      default:
        return serverData
    }
  },
  
  // Metrics
  updateMetrics: () => {
    const state = get().offline
    
    set((currentState) => {
      currentState.offline.metrics.pendingOperations = state.analysisQueue.filter(
        item => item.status === 'pending'
      ).length
      
      currentState.offline.metrics.failedOperations = state.analysisQueue.filter(
        item => item.status === 'failed'
      ).length
    })
  },
  
  getMetrics: () => {
    return get().offline.metrics
  },
  
  // Helper methods (would be implemented as private methods in a class)
  persistQueue: async () => {
    try {
      await localforage.setItem('analysisQueue', get().offline.analysisQueue)
    } catch (error) {
      console.error('Failed to persist analysis queue:', error)
    }
  },
  
  persistSyncQueue: async () => {
    try {
      await localforage.setItem('syncQueue', get().offline.syncQueue)
    } catch (error) {
      console.error('Failed to persist sync queue:', error)
    }
  },
  
  persistCache: async () => {
    try {
      await localforage.setItem('cachedAnalyses', get().offline.cachedAnalyses)
    } catch (error) {
      console.error('Failed to persist cache:', error)
    }
  },
  
  loadPersistedData: async () => {
    try {
      const [analysisQueue, syncQueue, cachedAnalyses] = await Promise.all([
        localforage.getItem('analysisQueue'),
        localforage.getItem('syncQueue'),
        localforage.getItem('cachedAnalyses')
      ])
      
      set((state) => {
        if (analysisQueue) state.offline.analysisQueue = analysisQueue as AnalysisQueueItem[]
        if (syncQueue) state.offline.syncQueue = syncQueue as SyncOperation[]
        if (cachedAnalyses) state.offline.cachedAnalyses = cachedAnalyses as Record<string, CachedAnalysis>
      })
      
      get().offline.updateMetrics()
      get().offline.updateCacheSize()
    } catch (error) {
      console.error('Failed to load persisted data:', error)
    }
  },
  
  updateCacheSize: () => {
    const cached = get().offline.cachedAnalyses
    const size = Object.values(cached).reduce((total, item) => {
      return total + JSON.stringify(item).length
    }, 0)
    
    set((state) => {
      state.offline.cacheSize = size
    })
  },
  
  processSyncOperation: async (operation: SyncOperation) => {
    // This would integrate with the API client
    const apiClient = get().app.apiClient
    
    switch (operation.type) {
      case 'analysis':
        if (operation.operation === 'create') {
          await apiClient.post('/api/analysis', operation.data)
        }
        break
      
      case 'notification':
        if (operation.operation === 'update') {
          await apiClient.patch(`/api/notifications/${operation.data.id}`, operation.data)
        }
        break
      
      // Add more operation types as needed
    }
  },
  
  processAnalysisQueue: async () => {
    const queue = get().offline.analysisQueue.filter(item => item.status === 'pending')
    
    for (const item of queue) {
      try {
        get().offline.updateAnalysisQueueItem(item.id, { status: 'processing' })
        
        // Process the analysis
        const result = await get().offline.processAnalysisItem(item)
        
        // Update queue and cache result
        get().offline.updateAnalysisQueueItem(item.id, { status: 'completed' })
        get().offline.addToCache({
          id: result.id,
          documentId: item.documentId,
          fileName: item.fileName,
          result,
          expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
          version: '1.0',
          checksum: item.id // Simple checksum
        })
        
      } catch (error) {
        console.error('Failed to process analysis item:', error)
        get().offline.updateAnalysisQueueItem(item.id, { 
          status: 'failed',
          lastError: error.message,
          retryCount: item.retryCount + 1
        })
      }
    }
  },
  
  processAnalysisItem: async (item: AnalysisQueueItem) => {
    const apiClient = get().app.apiClient
    
    const formData = new FormData()
    const file = new File([item.fileContent], item.fileName, { type: item.fileType })
    formData.append('file', file)
    formData.append('options', JSON.stringify(item.options))
    
    const response = await apiClient.post('/api/analysis/upload', formData)
    return response.data
  }
})

// Persistence configuration
export const offlinePersistConfig = {
  name: 'offline-storage',
  storage: createJSONStorage(() => localforage),
  partialize: (state: RootStore) => ({
    offline: {
      analysisQueue: state.offline.analysisQueue,
      syncQueue: state.offline.syncQueue,
      cachedAnalyses: state.offline.cachedAnalyses,
      offlineMode: state.offline.offlineMode,
      autoSync: state.offline.autoSync,
      metrics: state.offline.metrics
    }
  }),
  version: 1,
  migrate: (persistedState: any, version: number) => {
    // Handle migration between versions if needed
    return persistedState
  }
}