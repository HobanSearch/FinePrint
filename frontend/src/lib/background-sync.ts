/**
 * Background Sync Manager for Fine Print AI
 * Handles offline document analysis and sync operations
 */

import localforage from 'localforage'

// Configure storage for background sync
const syncStorage = localforage.createInstance({
  name: 'FinePrintAI',
  storeName: 'background_sync',
  description: 'Background sync operations'
})

const analysisStorage = localforage.createInstance({
  name: 'FinePrintAI',
  storeName: 'offline_analysis',
  description: 'Offline analysis data'
})

export interface SyncOperation {
  id: string
  type: 'analysis' | 'user_data' | 'notification' | 'preference'
  operation: 'create' | 'update' | 'delete'
  data: any
  timestamp: number
  retryCount: number
  maxRetries: number
  priority: 'high' | 'medium' | 'low'
  status: 'pending' | 'syncing' | 'completed' | 'failed'
  lastAttempt?: number
  errorMessage?: string
}

export interface AnalysisJob {
  id: string
  file: File | ArrayBuffer
  fileName: string
  fileType: string
  fileSize: number
  options: {
    analysisType: 'tos' | 'privacy' | 'eula' | 'contract'
    deepScan: boolean
    priority: 'high' | 'medium' | 'low'
  }
  timestamp: number
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progress: number
  result?: any
  error?: string
  userId: string
}

export class BackgroundSyncManager {
  private syncWorker: Worker | null = null
  private isProcessing = false
  private syncInterval: number | null = null
  private eventListeners: Map<string, Set<Function>> = new Map()

  constructor() {
    this.initializeWorker()
    this.setupPeriodicSync()
    this.setupVisibilityListener()
  }

  private initializeWorker() {
    // Initialize web worker for background processing
    if ('Worker' in window) {
      try {
        this.syncWorker = new Worker('/sync-worker.js')
        
        this.syncWorker.onmessage = (event) => {
          this.handleWorkerMessage(event.data)
        }
        
        this.syncWorker.onerror = (error) => {
          console.error('Sync worker error:', error)
        }
      } catch (error) {
        console.warn('Web worker not available, using main thread fallback')
      }
    }
  }

  private handleWorkerMessage(message: any) {
    const { type, payload } = message
    
    switch (type) {
      case 'ANALYSIS_COMPLETE':
        this.handleAnalysisComplete(payload)
        break
      
      case 'SYNC_COMPLETE':
        this.handleSyncComplete(payload)
        break
      
      case 'SYNC_ERROR':
        this.handleSyncError(payload)
        break
      
      case 'PROGRESS_UPDATE':
        this.handleProgressUpdate(payload)
        break
    }
  }

  private setupPeriodicSync() {
    // Sync every 5 minutes when online
    this.syncInterval = window.setInterval(() => {
      if (navigator.onLine && !this.isProcessing) {
        this.processSyncQueue()
      }
    }, 5 * 60 * 1000)
  }

  private setupVisibilityListener() {
    // Trigger sync when app becomes visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && navigator.onLine && !this.isProcessing) {
        this.processSyncQueue()
      }
    })

    // Trigger sync when coming online
    window.addEventListener('online', () => {
      if (!this.isProcessing) {
        this.processSyncQueue()
      }
    })
  }

  /**
   * Queue a document for offline analysis
   */
  async queueAnalysis(job: Omit<AnalysisJob, 'id' | 'timestamp' | 'status' | 'progress'>): Promise<string> {
    const analysisJob: AnalysisJob = {
      ...job,
      id: `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      status: 'queued',
      progress: 0
    }

    // Store the job
    await analysisStorage.setItem(analysisJob.id, analysisJob)

    // If online, try to process immediately
    if (navigator.onLine) {
      this.processAnalysisJob(analysisJob)
    } else {
      // Queue for background sync
      await this.queueSyncOperation({
        type: 'analysis',
        operation: 'create',
        data: analysisJob,
        priority: job.options.priority,
        maxRetries: 3
      })
    }

    this.emit('analysis_queued', analysisJob)
    return analysisJob.id
  }

  /**
   * Queue a sync operation
   */
  async queueSyncOperation(
    operation: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount' | 'status'>
  ): Promise<string> {
    const syncOp: SyncOperation = {
      ...operation,
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    }

    await syncStorage.setItem(syncOp.id, syncOp)
    this.emit('sync_queued', syncOp)
    
    return syncOp.id
  }

  /**
   * Process the sync queue
   */
  async processSyncQueue(): Promise<void> {
    if (this.isProcessing || !navigator.onLine) {
      return
    }

    this.isProcessing = true
    this.emit('sync_started')

    try {
      const operations = await this.getPendingSyncOperations()
      
      // Sort by priority and timestamp
      operations.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 }
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority]
        return priorityDiff !== 0 ? priorityDiff : a.timestamp - b.timestamp
      })

      const concurrentLimit = 3
      const batches: SyncOperation[][] = []
      
      for (let i = 0; i < operations.length; i += concurrentLimit) {
        batches.push(operations.slice(i, i + concurrentLimit))
      }

      for (const batch of batches) {
        await Promise.allSettled(
          batch.map(operation => this.processSyncOperation(operation))
        )
      }

    } catch (error) {
      console.error('Sync queue processing failed:', error)
      this.emit('sync_error', error)
    } finally {
      this.isProcessing = false
      this.emit('sync_completed')
    }
  }

  /**
   * Process a single sync operation
   */
  private async processSyncOperation(operation: SyncOperation): Promise<void> {
    try {
      // Update status
      operation.status = 'syncing'
      operation.lastAttempt = Date.now()
      await syncStorage.setItem(operation.id, operation)

      let result: any

      switch (operation.type) {
        case 'analysis':
          result = await this.syncAnalysisOperation(operation)
          break
        
        case 'user_data':
          result = await this.syncUserDataOperation(operation)
          break
        
        case 'notification':
          result = await this.syncNotificationOperation(operation)
          break
        
        case 'preference':
          result = await this.syncPreferenceOperation(operation)
          break
        
        default:
          throw new Error(`Unknown sync operation type: ${operation.type}`)
      }

      // Mark as completed
      operation.status = 'completed'
      await syncStorage.setItem(operation.id, operation)
      
      this.emit('sync_operation_completed', { operation, result })

      // Clean up completed operation after 24 hours
      setTimeout(() => {
        syncStorage.removeItem(operation.id)
      }, 24 * 60 * 60 * 1000)

    } catch (error) {
      operation.retryCount++
      operation.errorMessage = error.message

      if (operation.retryCount >= operation.maxRetries) {
        operation.status = 'failed'
        this.emit('sync_operation_failed', { operation, error })
      } else {
        operation.status = 'pending'
        // Exponential backoff for retries
        const delay = Math.pow(2, operation.retryCount) * 1000
        setTimeout(() => {
          this.processSyncOperation(operation)
        }, delay)
      }

      await syncStorage.setItem(operation.id, operation)
      throw error
    }
  }

  /**
   * Process an analysis job
   */
  private async processAnalysisJob(job: AnalysisJob): Promise<void> {
    try {
      job.status = 'processing'
      await analysisStorage.setItem(job.id, job)
      this.emit('analysis_started', job)

      // Use web worker if available
      if (this.syncWorker) {
        this.syncWorker.postMessage({
          type: 'PROCESS_ANALYSIS',
          payload: job
        })
      } else {
        // Fallback to main thread processing
        const result = await this.performAnalysis(job)
        await this.handleAnalysisComplete({ jobId: job.id, result })
      }

    } catch (error) {
      job.status = 'failed'
      job.error = error.message
      await analysisStorage.setItem(job.id, job)
      this.emit('analysis_failed', { job, error })
    }
  }

  /**
   * Perform document analysis (simplified version for offline)
   */
  private async performAnalysis(job: AnalysisJob): Promise<any> {
    // This is a simplified offline analysis
    // In a real implementation, you'd use a local AI model or cached patterns
    
    const mockAnalysisDelay = Math.random() * 3000 + 2000 // 2-5 seconds
    
    return new Promise((resolve) => {
      setTimeout(() => {
        const result = {
          id: job.id,
          fileName: job.fileName,
          fileType: job.fileType,
          analysisType: job.options.analysisType,
          findings: [
            {
              id: 'mock_finding_1',
              category: 'privacy',
              severity: 'medium',
              title: 'Data Collection Notice',
              description: 'Document contains data collection clauses',
              excerpt: 'We collect personal information...',
              recommendation: 'Review data collection practices',
              confidence: 0.85
            }
          ],
          riskScore: 65,
          summary: 'Offline analysis complete. Full analysis will be performed when online.',
          isOfflineAnalysis: true,
          timestamp: Date.now()
        }
        
        resolve(result)
      }, mockAnalysisDelay)
    })
  }

  /**
   * Handle analysis completion
   */
  private async handleAnalysisComplete(payload: { jobId: string; result: any }) {
    const { jobId, result } = payload
    const job = await analysisStorage.getItem<AnalysisJob>(jobId)
    
    if (job) {
      job.status = 'completed'
      job.progress = 100
      job.result = result
      
      await analysisStorage.setItem(jobId, job)
      this.emit('analysis_completed', { job, result })

      // Queue for server sync if needed
      if (navigator.onLine) {
        await this.queueSyncOperation({
          type: 'analysis',
          operation: 'create',
          data: result,
          priority: 'medium',
          maxRetries: 3
        })
      }
    }
  }

  /**
   * Sync operation implementations
   */
  private async syncAnalysisOperation(operation: SyncOperation): Promise<any> {
    const { data } = operation
    
    const response = await fetch('/api/analysis/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getAuthToken()}`
      },
      body: JSON.stringify(data)
    })

    if (!response.ok) {
      throw new Error(`Analysis sync failed: ${response.status}`)
    }

    return response.json()
  }

  private async syncUserDataOperation(operation: SyncOperation): Promise<any> {
    const { data, operation: op } = operation
    
    const method = op === 'create' ? 'POST' : op === 'update' ? 'PUT' : 'DELETE'
    const url = `/api/user/${op === 'delete' ? data.id : ''}`
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getAuthToken()}`
      },
      body: op !== 'delete' ? JSON.stringify(data) : undefined
    })

    if (!response.ok) {
      throw new Error(`User data sync failed: ${response.status}`)
    }

    return response.json()
  }

  private async syncNotificationOperation(operation: SyncOperation): Promise<any> {
    const { data } = operation
    
    const response = await fetch('/api/notifications/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getAuthToken()}`
      },
      body: JSON.stringify(data)
    })

    if (!response.ok) {
      throw new Error(`Notification sync failed: ${response.status}`)
    }

    return response.json()
  }

  private async syncPreferenceOperation(operation: SyncOperation): Promise<any> {
    const { data } = operation
    
    const response = await fetch('/api/preferences', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getAuthToken()}`
      },
      body: JSON.stringify(data)
    })

    if (!response.ok) {
      throw new Error(`Preference sync failed: ${response.status}`)
    }

    return response.json()
  }

  /**
   * Event handling
   */
  on(event: string, callback: Function) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(callback)
  }

  off(event: string, callback: Function) {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.delete(callback)
    }
  }

  private emit(event: string, data?: any) {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error('Event listener error:', error)
        }
      })
    }
  }

  /**
   * Utility methods
   */
  private async getPendingSyncOperations(): Promise<SyncOperation[]> {
    const keys = await syncStorage.keys()
    const operations: SyncOperation[] = []
    
    for (const key of keys) {
      const operation = await syncStorage.getItem<SyncOperation>(key)
      if (operation && operation.status === 'pending') {
        operations.push(operation)
      }
    }
    
    return operations
  }

  private getAuthToken(): string | null {
    return localStorage.getItem('auth-token')
  }

  async getQueueStatus(): Promise<{
    analyses: { queued: number; processing: number; completed: number; failed: number }
    syncOperations: { pending: number; syncing: number; completed: number; failed: number }
  }> {
    const analysisKeys = await analysisStorage.keys()
    const syncKeys = await syncStorage.keys()
    
    const analyses = { queued: 0, processing: 0, completed: 0, failed: 0 }
    const syncOperations = { pending: 0, syncing: 0, completed: 0, failed: 0 }
    
    for (const key of analysisKeys) {
      const job = await analysisStorage.getItem<AnalysisJob>(key)
      if (job) {
        analyses[job.status as keyof typeof analyses]++
      }
    }
    
    for (const key of syncKeys) {
      const operation = await syncStorage.getItem<SyncOperation>(key)
      if (operation) {
        syncOperations[operation.status as keyof typeof syncOperations]++
      }
    }
    
    return { analyses, syncOperations }
  }

  async clearCompletedOperations(): Promise<void> {
    const syncKeys = await syncStorage.keys()
    const analysisKeys = await analysisStorage.keys()
    
    for (const key of syncKeys) {
      const operation = await syncStorage.getItem<SyncOperation>(key)
      if (operation && (operation.status === 'completed' || operation.status === 'failed')) {
        await syncStorage.removeItem(key)
      }
    }
    
    for (const key of analysisKeys) {
      const job = await analysisStorage.getItem<AnalysisJob>(key)
      if (job && (job.status === 'completed' || job.status === 'failed')) {
        await analysisStorage.removeItem(key)
      }
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
    }
    
    if (this.syncWorker) {
      this.syncWorker.terminate()
    }
    
    this.eventListeners.clear()
  }
}

// Singleton instance
let backgroundSyncManager: BackgroundSyncManager | null = null

export function getBackgroundSyncManager(): BackgroundSyncManager {
  if (!backgroundSyncManager) {
    backgroundSyncManager = new BackgroundSyncManager()
  }
  return backgroundSyncManager
}

export function initializeBackgroundSync(): BackgroundSyncManager {
  return getBackgroundSyncManager()
}

export default BackgroundSyncManager