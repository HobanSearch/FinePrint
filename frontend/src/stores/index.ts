import { create } from 'zustand'
import { devtools, subscribeWithSelector, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { RootStore } from './types'
import { createAuthSlice } from './slices/auth'
import { createAnalysisSlice } from './slices/analysis'
import { createNotificationSlice } from './slices/notifications'
import { createPreferencesSlice } from './slices/preferences'
import { createWebSocketSlice } from './slices/websocket'
import { createAppSlice } from './slices/app'
import { createOfflineSlice, offlinePersistConfig } from './slices/offline'
import { createEnterpriseSlice } from './slices/enterprise'

// Create the root store with all slices combined
export const useStore = create<RootStore>()(
  devtools(
    subscribeWithSelector(
      persist(
        immer((set, get, api) => ({
          // Combine all slices
          auth: createAuthSlice(set, get, api),
          analysis: createAnalysisSlice(set, get, api),
          notifications: createNotificationSlice(set, get, api),
          preferences: createPreferencesSlice(set, get, api),
          websocket: createWebSocketSlice(set, get, api),
          app: createAppSlice(set, get, api),
          offline: createOfflineSlice(set, get, api),
          enterprise: createEnterpriseSlice(set, get, api)
        })),
        offlinePersistConfig
      )
    ),
    {
      name: 'fine-print-store',
      enabled: import.meta.env.DEV
    }
  )
)

// Convenience hooks for accessing specific slices
export const useAuth = () => useStore(state => state.auth)
export const useAnalysis = () => useStore(state => state.analysis)
export const useNotifications = () => useStore(state => state.notifications)
export const usePreferences = () => useStore(state => state.preferences)
export const useWebSocket = () => useStore(state => state.websocket)
export const useApp = () => useStore(state => state.app)
export const useOffline = () => useStore(state => state.offline)
export const useEnterprise = () => useStore(state => state.enterprise)

// Selectors for computed values
export const useIsAuthenticated = () => useStore(state => state.auth.isAuthenticated)
export const useCurrentUser = () => useStore(state => state.auth.user)
export const useCurrentAnalysis = () => useStore(state => state.analysis.currentAnalysis)
export const useUnreadNotifications = () => useStore(state => state.notifications.unreadCount)
export const useTheme = () => useStore(state => state.preferences.theme)
export const useIsOnline = () => useStore(state => state.websocket.isConnected)

// Compound selectors
export const useAnalysisStats = () => useStore(state => ({
  total: state.analysis.cache.totalAnalyses,
  critical: state.analysis.cache.criticalIssues,
  isAnalyzing: state.analysis.isAnalyzing,
  progress: Object.values(state.analysis.analysisProgress).reduce((sum, p) => sum + p, 0) / 
            Math.max(1, Object.keys(state.analysis.analysisProgress).length)
}))

export const useAppStatus = () => useStore(state => ({
  isInitialized: state.app.isInitialized,
  isOnline: state.websocket.isConnected,
  inMaintenance: state.app.maintenance.isActive,
  version: state.app.version
}))

// Actions that work across multiple slices
export const useActions = () => {
  const store = useStore()
  
  return {
    // Auth actions
    login: store.auth.login,
    logout: store.auth.logout,
    
    // Analysis actions
    startAnalysis: store.analysis.startAnalysis,
    setCurrentAnalysis: store.analysis.setCurrentAnalysis,
    
    // Notification actions
    addNotification: store.notifications.addNotification,
    clearNotifications: store.notifications.clearAll,
    
    // Preference actions
    updatePreferences: store.preferences.updatePreferences,
    setTheme: store.preferences.setTheme,
    
    // WebSocket actions
    connectWebSocket: store.websocket.connect,
    disconnectWebSocket: store.websocket.disconnect,
    
    // App actions
    initialize: store.app.initialize
  }
}

// Initialize the store
export const initializeStore = async () => {
  // Mark performance start
  if ('performance' in window) {
    performance.mark('app-init-start')
  }

  const store = useStore.getState()
  
  try {
    await store.app.initialize()
    
    // Set up monitoring after initialization
    store.app.initializeNetworkMonitoring()
    store.app.initializeVisibilityMonitoring()
    store.app.measurePerformance()
    
  } catch (error) {
    console.error('Store initialization failed:', error)
    throw error
  }
}

// Subscribe to auth changes to manage WebSocket connection
useStore.subscribe(
  (state) => state.auth.isAuthenticated,
  (isAuthenticated, wasAuthenticated) => {
    const { websocket, analysis } = useStore.getState()
    
    if (isAuthenticated && !wasAuthenticated) {
      // User logged in - connect WebSocket and load data
      websocket.connect()
      analysis.loadAnalyses()
    } else if (!isAuthenticated && wasAuthenticated) {
      // User logged out - disconnect WebSocket
      websocket.disconnect()
    }
  }
)

// Subscribe to theme changes to update document class
useStore.subscribe(
  (state) => state.preferences.theme,
  (theme) => {
    const store = useStore.getState()
    store.preferences.applyTheme(theme)
  }
)

// Export types for use in components
export type { RootStore } from './types'
export * from './types'

// Default export
export default useStore