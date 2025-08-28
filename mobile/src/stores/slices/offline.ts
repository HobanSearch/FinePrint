import type { StateCreator } from 'zustand'
import NetInfo from '@react-native-community/netinfo'
import { apiClient } from '@/services/api'
import type { OfflineAction, SyncState } from '@/types'

export interface OfflineSlice extends SyncState {
  // Actions
  addOfflineAction: (action: Omit<OfflineAction, 'id' | 'timestamp' | 'retryCount'>) => void
  removeOfflineAction: (id: string) => void
  syncPendingActions: () => Promise<void>
  setNetworkStatus: (isOnline: boolean) => void
  clearPendingActions: () => void
  retryFailedAction: (id: string) => Promise<void>
}

export const createOfflineSlice: StateCreator<
  OfflineSlice,
  [['zustand/immer', never], ['zustand/devtools', never], ['zustand/subscribeWithSelector', never]],
  [],
  OfflineSlice
> = (set, get) => ({
  // Initial state
  isOnline: true,
  isSync: false,
  pendingActions: [],
  lastSyncTime: null,
  syncError: null,

  // Actions
  addOfflineAction: (action) => {
    const offlineAction: OfflineAction = {
      id: generateActionId(),
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: action.maxRetries || 3,
      ...action
    }

    set(state => {
      state.pendingActions.push(offlineAction)
    })

    // If online, immediately try to sync this action
    const { isOnline } = get()
    if (isOnline) {
      get().retryFailedAction(offlineAction.id).catch(console.error)
    }
  },

  removeOfflineAction: (id: string) => {
    set(state => {
      state.pendingActions = state.pendingActions.filter(action => action.id !== id)
    })
  },

  syncPendingActions: async () => {
    const { pendingActions, isOnline } = get()

    if (!isOnline || pendingActions.length === 0) {
      return
    }

    set(state => {
      state.isSync = true
      state.syncError = null
    })

    const failedActions: string[] = []

    try {
      // Process actions in chronological order
      const sortedActions = [...pendingActions].sort((a, b) => a.timestamp - b.timestamp)

      for (const action of sortedActions) {
        try {
          await executeOfflineAction(action)
          
          // Remove successful action
          set(state => {
            state.pendingActions = state.pendingActions.filter(a => a.id !== action.id)
          })

        } catch (error) {
          console.error(`Failed to sync action ${action.id}:`, error)
          
          // Increment retry count
          set(state => {
            const actionIndex = state.pendingActions.findIndex(a => a.id === action.id)
            if (actionIndex !== -1) {
              state.pendingActions[actionIndex].retryCount += 1
              
              // Remove if max retries exceeded
              if (state.pendingActions[actionIndex].retryCount >= state.pendingActions[actionIndex].maxRetries) {
                failedActions.push(action.id)
                state.pendingActions.splice(actionIndex, 1)
              }
            }
          })
        }
      }

      set(state => {
        state.lastSyncTime = Date.now()
        state.isSync = false
        
        if (failedActions.length > 0) {
          state.syncError = `${failedActions.length} actions failed to sync after maximum retries`
        }
      })

    } catch (error: any) {
      console.error('Sync failed:', error)
      set(state => {
        state.isSync = false
        state.syncError = error.message || 'Sync failed'
      })
    }
  },

  retryFailedAction: async (id: string) => {
    const { pendingActions } = get()
    const action = pendingActions.find(a => a.id === id)

    if (!action) {
      throw new Error('Action not found')
    }

    try {
      await executeOfflineAction(action)
      
      // Remove successful action
      set(state => {
        state.pendingActions = state.pendingActions.filter(a => a.id !== id)
      })

    } catch (error: any) {
      // Increment retry count
      set(state => {
        const actionIndex = state.pendingActions.findIndex(a => a.id === id)
        if (actionIndex !== -1) {
          state.pendingActions[actionIndex].retryCount += 1
          
          // Remove if max retries exceeded
          if (state.pendingActions[actionIndex].retryCount >= state.pendingActions[actionIndex].maxRetries) {
            state.pendingActions.splice(actionIndex, 1)
          }
        }
      })
      
      throw error
    }
  },

  setNetworkStatus: (isOnline: boolean) => {
    const wasOffline = !get().isOnline

    set(state => {
      state.isOnline = isOnline
    })

    // If we just came back online, sync pending actions
    if (wasOffline && isOnline) {
      get().syncPendingActions().catch(console.error)
    }
  },

  clearPendingActions: () => {
    set(state => {
      state.pendingActions = []
      state.syncError = null
    })
  }
})

// Helper functions
function generateActionId(): string {
  return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

async function executeOfflineAction(action: OfflineAction): Promise<void> {
  switch (action.type) {
    case 'UPLOAD_DOCUMENT':
      await handleDocumentUpload(action.payload)
      break

    case 'START_ANALYSIS':
      await handleStartAnalysis(action.payload)
      break

    case 'UPDATE_PREFERENCES':
      await handleUpdatePreferences(action.payload)
      break

    case 'DELETE_DOCUMENT':
      await handleDeleteDocument(action.payload)
      break

    case 'DELETE_ANALYSIS':
      await handleDeleteAnalysis(action.payload)
      break

    case 'MARK_NOTIFICATION_READ':
      await handleMarkNotificationRead(action.payload)
      break

    default:
      throw new Error(`Unknown action type: ${action.type}`)
  }
}

async function handleDocumentUpload(payload: any): Promise<void> {
  const formData = new FormData()
  formData.append('file', payload.file)
  
  if (payload.metadata) {
    formData.append('metadata', JSON.stringify(payload.metadata))
  }

  await apiClient.post('/documents/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
}

async function handleStartAnalysis(payload: any): Promise<void> {
  await apiClient.post('/analysis/start', payload)
}

async function handleUpdatePreferences(payload: any): Promise<void> {
  await apiClient.put('/user/preferences', payload)
}

async function handleDeleteDocument(payload: any): Promise<void> {
  await apiClient.delete(`/documents/${payload.documentId}`)
}

async function handleDeleteAnalysis(payload: any): Promise<void> {
  await apiClient.delete(`/analysis/${payload.analysisId}`)
}

async function handleMarkNotificationRead(payload: any): Promise<void> {
  await apiClient.post(`/notifications/${payload.notificationId}/read`)
}

// Network status monitoring
export function initializeNetworkMonitoring() {
  return NetInfo.addEventListener(state => {
    const isOnline = state.isConnected && state.isInternetReachable
    
    // Get the store and update network status
    // Note: This requires the store to be initialized first
    try {
      const store = require('../index').useMobileStore.getState()
      store.setNetworkStatus(isOnline || false)
    } catch (error) {
      console.error('Failed to update network status:', error)
    }
  })
}