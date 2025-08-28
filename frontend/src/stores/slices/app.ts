import { StateCreator } from 'zustand'
import type { RootStore, AppState, AppActions } from '../types'
import { apiClient } from '../../lib/api-client'

type AppSlice = AppState & AppActions

export const createAppSlice: StateCreator<
  RootStore,
  [],
  [],
  AppSlice
> = (set, get) => ({
  // Initial state
  isInitialized: false,
  version: '1.0.0',
  buildInfo: {
    version: '1.0.0',
    buildTime: new Date().toISOString(),
    gitCommit: 'dev'
  },
  features: {
    realTimeUpdates: true,
    advancedAnalysis: true,
    bulkUpload: false,
    apiAccess: true,
    teamCollaboration: false
  },
  maintenance: {
    isActive: false
  },

  // Actions
  initialize: async () => {
    try {
      // Load build info from environment or API
      const buildInfo = {
        version: import.meta.env.VITE_APP_VERSION || '1.0.0',
        buildTime: import.meta.env.VITE_BUILD_TIME || new Date().toISOString(),
        gitCommit: import.meta.env.VITE_GIT_COMMIT || 'dev'
      }

      set({
        buildInfo,
        version: buildInfo.version
      })

      // Check authentication status
      await get().auth.checkAuthStatus()

      // Load user preferences
      await get().preferences.initialize()

      // Load persisted notifications
      await get().notifications.loadPersistedNotifications()

      // Connect WebSocket if authenticated
      if (get().auth.isAuthenticated) {
        get().websocket.connect()
      }

      // Load analyses if authenticated
      if (get().auth.isAuthenticated) {
        await get().analysis.loadAnalyses()
      }

      // Fetch feature flags and system status
      try {
        const response = await apiClient.get('/system/status')
        const { features, maintenance } = response.data

        set({
          features: { ...get().app.features, ...features },
          maintenance
        })
      } catch (error) {
        console.warn('Failed to fetch system status:', error)
      }

      set({ isInitialized: true })

      // Initialize WebSocket token refresh listener
      get().websocket.initializeTokenRefresh()

    } catch (error: any) {
      console.error('App initialization failed:', error)
      
      get().notifications.addNotification({
        type: 'error',
        title: 'Initialization Error',
        message: 'There was a problem starting the application. Please refresh and try again.',
        persistent: true
      })

      set({ isInitialized: true }) // Still mark as initialized to prevent infinite loading
    }
  },

  setFeatureFlag: (feature: string, enabled: boolean) => {
    set(state => ({
      features: {
        ...state.features,
        [feature]: enabled
      }
    }))

    // Notify about feature changes
    get().notifications.addNotification({
      type: 'info',
      title: 'Feature Updated',
      message: `${feature} has been ${enabled ? 'enabled' : 'disabled'}`
    })
  },

  setMaintenanceMode: (active: boolean, message?: string, duration?: string) => {
    set({
      maintenance: {
        isActive: active,
        message,
        estimatedDuration: duration
      }
    })

    if (active) {
      get().notifications.addNotification({
        type: 'warning',
        title: 'Maintenance Mode',
        message: message || 'The system is currently undergoing maintenance.',
        persistent: true
      })

      // Disconnect WebSocket during maintenance
      get().websocket.disconnect()
    } else {
      get().notifications.addNotification({
        type: 'success',
        title: 'Maintenance Complete',
        message: 'The system is back online.'
      })

      // Reconnect WebSocket after maintenance
      if (get().auth.isAuthenticated) {
        get().websocket.connect()
      }
    }
  },

  // Helper methods (not exposed in interface)
  checkSystemHealth: async () => {
    try {
      const response = await apiClient.get('/health')
      return response.data.status === 'healthy'
    } catch (error) {
      console.error('Health check failed:', error)
      return false
    }
  },

  handleVersionUpdate: (newVersion: string) => {
    const currentVersion = get().app.version
    
    if (newVersion !== currentVersion) {
      get().notifications.addNotification({
        type: 'info',
        title: 'Update Available',
        message: `A new version (${newVersion}) is available. Please refresh to update.`,
        persistent: true,
        action: {
          label: 'Refresh',
          handler: () => window.location.reload()
        }
      })
    }
  },

  // Monitor for network status changes
  initializeNetworkMonitoring: () => {
    const handleOnline = () => {
      get().notifications.addNotification({
        type: 'success',
        title: 'Back Online',
        message: 'Your internet connection has been restored.'
      })

      // Reconnect WebSocket if authenticated
      if (get().auth.isAuthenticated && !get().websocket.isConnected) {
        get().websocket.connect()
      }
    }

    const handleOffline = () => {
      get().notifications.addNotification({
        type: 'warning',
        title: 'Connection Lost',
        message: 'You are currently offline. Some features may not work.',
        persistent: true
      })
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Check initial state
    if (!navigator.onLine) {
      handleOffline()
    }

    // Cleanup function (if needed)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  },

  // Handle visibility changes (tab focus/blur)
  initializeVisibilityMonitoring: () => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is hidden - reduce activity
        console.log('App hidden - reducing activity')
      } else {
        // Tab is visible - resume full activity
        console.log('App visible - resuming activity')
        
        // Check for updates when tab becomes visible
        if (get().auth.isAuthenticated) {
          get().analysis.loadAnalyses()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  },

  // Performance monitoring
  measurePerformance: () => {
    if ('performance' in window && 'measure' in performance) {
      // Measure app initialization time
      performance.mark('app-init-end')
      
      try {
        performance.measure('app-initialization', 'app-init-start', 'app-init-end')
        const measure = performance.getEntriesByName('app-initialization')[0]
        
        console.log(`App initialization took ${measure.duration.toFixed(2)}ms`)
        
        // Report to analytics if configured
        if (import.meta.env.VITE_ANALYTICS_ENABLED === 'true') {
          // Analytics call would go here
        }
      } catch (error) {
        console.warn('Performance measurement failed:', error)
      }
    }
  }
} as any) // Type assertion needed for helper methods