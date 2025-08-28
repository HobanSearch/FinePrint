/**
 * PWA Hook for Fine Print AI
 * Manages service worker, install prompts, offline state, and updates
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

interface PWAState {
  // Installation
  isInstallable: boolean
  isInstalled: boolean
  showInstallPrompt: boolean
  
  // Service Worker
  isServiceWorkerRegistered: boolean
  isServiceWorkerUpdating: boolean
  hasServiceWorkerUpdate: boolean
  
  // Offline/Online
  isOnline: boolean
  wasOffline: boolean
  
  // Notifications
  areNotificationsSupported: boolean
  notificationPermission: NotificationPermission
  
  // Performance
  connectionType: string
  effectiveType: string
  downlink: number
  
  // Cache
  cacheSize: number
  lastCacheUpdate: Date | null
}

interface PWAActions {
  // Installation
  promptInstall: () => Promise<boolean>
  dismissInstallPrompt: () => void
  
  // Service Worker
  updateServiceWorker: () => Promise<void>
  skipWaiting: () => void
  
  // Notifications
  requestNotificationPermission: () => Promise<NotificationPermission>
  
  // Cache Management
  clearCache: () => Promise<void>
  getCacheSize: () => Promise<number>
  
  // Analytics
  trackPWAEvent: (event: string, data?: Record<string, any>) => void
}

interface PWAHookReturn extends PWAState, PWAActions {
  registerSW: ReturnType<typeof useRegisterSW>
}

// Extended Navigator interface for PWA features
interface ExtendedNavigator extends Navigator {
  connection?: {
    effectiveType: string
    type: string
    downlink: number
    rtt: number
    saveData: boolean
  }
  standalone?: boolean
  getInstalledRelatedApps?: () => Promise<any[]>
}

export function usePWA(): PWAHookReturn {
  // State management
  const [state, setState] = useState<PWAState>({
    isInstallable: false,
    isInstalled: false,
    showInstallPrompt: false,
    isServiceWorkerRegistered: false,
    isServiceWorkerUpdating: false,
    hasServiceWorkerUpdate: false,
    isOnline: navigator.onLine,
    wasOffline: false,
    areNotificationsSupported: 'Notification' in window,
    notificationPermission: 'Notification' in window ? Notification.permission : 'denied',
    connectionType: 'unknown',
    effectiveType: 'unknown',
    downlink: 0,
    cacheSize: 0,
    lastCacheUpdate: null
  })

  // Refs for event handlers
  const deferredPromptRef = useRef<Event | null>(null)
  const lastOnlineRef = useRef<Date>(new Date())
  const performanceObserverRef = useRef<PerformanceObserver | null>(null)

  // Service Worker registration hook
  const registerSW = useRegisterSW({
    onRegistered(registration) {
      console.log('SW Registered:', registration)
      setState(prev => ({
        ...prev,
        isServiceWorkerRegistered: true
      }))
      
      // Check for updates periodically
      setInterval(() => {
        registration?.update()
      }, 60000) // Check every minute
    },
    
    onRegisterError(error) {
      console.error('SW registration error:', error)
    },
    
    onNeedRefresh() {
      setState(prev => ({
        ...prev,
        hasServiceWorkerUpdate: true
      }))
    },
    
    onOfflineReady() {
      console.log('App ready to work offline')
      trackPWAEvent('offline_ready')
    }
  })

  // Install prompt handling
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      deferredPromptRef.current = e
      
      setState(prev => ({
        ...prev,
        isInstallable: true,
        showInstallPrompt: !prev.isInstalled && !localStorage.getItem('pwa-install-dismissed')
      }))
      
      trackPWAEvent('install_prompt_shown')
    }

    const handleAppInstalled = () => {
      setState(prev => ({
        ...prev,
        isInstalled: true,
        isInstallable: false,
        showInstallPrompt: false
      }))
      
      trackPWAEvent('app_installed')
      localStorage.setItem('pwa-installed', 'true')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    // Check if already installed
    const checkInstallStatus = async () => {
      const nav = navigator as ExtendedNavigator
      
      // Check for standalone mode
      if (nav.standalone || window.matchMedia('(display-mode: standalone)').matches) {
        setState(prev => ({ ...prev, isInstalled: true }))
      }
      
      // Check for related apps (if supported)
      if (nav.getInstalledRelatedApps) {
        try {
          const relatedApps = await nav.getInstalledRelatedApps()
          if (relatedApps.length > 0) {
            setState(prev => ({ ...prev, isInstalled: true }))
          }
        } catch (error) {
          console.warn('getInstalledRelatedApps not supported:', error)
        }
      }
    }

    checkInstallStatus()

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  // Online/Offline handling
  useEffect(() => {
    const handleOnline = () => {
      const wasOffline = !state.isOnline
      lastOnlineRef.current = new Date()
      
      setState(prev => ({
        ...prev,
        isOnline: true,
        wasOffline: false
      }))
      
      if (wasOffline) {
        trackPWAEvent('connection_restored', {
          offline_duration: Date.now() - lastOnlineRef.current.getTime()
        })
      }
    }

    const handleOffline = () => {
      setState(prev => ({
        ...prev,
        isOnline: false,
        wasOffline: true
      }))
      
      trackPWAEvent('connection_lost')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [state.isOnline])

  // Network information monitoring
  useEffect(() => {
    const nav = navigator as ExtendedNavigator
    
    if (nav.connection) {
      const updateConnectionInfo = () => {
        setState(prev => ({
          ...prev,
          connectionType: nav.connection?.type || 'unknown',
          effectiveType: nav.connection?.effectiveType || 'unknown',
          downlink: nav.connection?.downlink || 0
        }))
      }
      
      updateConnectionInfo()
      nav.connection.addEventListener('change', updateConnectionInfo)
      
      return () => {
        nav.connection?.removeEventListener('change', updateConnectionInfo)
      }
    }
  }, [])

  // Performance monitoring
  useEffect(() => {
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        
        entries.forEach((entry) => {
          if (entry.entryType === 'navigation') {
            trackPWAEvent('navigation_timing', {
              load_time: entry.loadEventEnd - entry.loadEventStart,
              dom_content_loaded: entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart,
              first_paint: entry.loadEventStart
            })
          }
          
          if (entry.entryType === 'largest-contentful-paint') {
            trackPWAEvent('lcp', { value: entry.startTime })
          }
          
          if (entry.entryType === 'first-input') {
            trackPWAEvent('fid', { value: entry.processingStart - entry.startTime })
          }
          
          if (entry.entryType === 'layout-shift' && !entry.hadRecentInput) {
            trackPWAEvent('cls', { value: entry.value })
          }
        })
      })
      
      observer.observe({ entryTypes: ['navigation', 'largest-contentful-paint', 'first-input', 'layout-shift'] })
      performanceObserverRef.current = observer
      
      return () => {
        observer.disconnect()
      }
    }
  }, [])

  // Cache size monitoring
  useEffect(() => {
    const updateCacheSize = async () => {
      const size = await getCacheSize()
      setState(prev => ({
        ...prev,
        cacheSize: size,
        lastCacheUpdate: new Date()
      }))
    }
    
    updateCacheSize()
    
    // Update cache size every 5 minutes
    const interval = setInterval(updateCacheSize, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Actions
  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPromptRef.current) {
      return false
    }

    try {
      const event = deferredPromptRef.current as any
      await event.prompt()
      
      const { outcome } = await event.userChoice
      
      if (outcome === 'accepted') {
        trackPWAEvent('install_accepted')
        return true
      } else {
        trackPWAEvent('install_dismissed')
        return false
      }
    } catch (error) {
      console.error('Install prompt error:', error)
      trackPWAEvent('install_error', { error: error.message })
      return false
    } finally {
      deferredPromptRef.current = null
      setState(prev => ({ 
        ...prev, 
        isInstallable: false,
        showInstallPrompt: false 
      }))
    }
  }, [])

  const dismissInstallPrompt = useCallback(() => {
    setState(prev => ({ ...prev, showInstallPrompt: false }))
    localStorage.setItem('pwa-install-dismissed', 'true')
    trackPWAEvent('install_prompt_dismissed')
  }, [])

  const updateServiceWorker = useCallback(async () => {
    setState(prev => ({ ...prev, isServiceWorkerUpdating: true }))
    
    try {
      await registerSW.updateSW(true)
      trackPWAEvent('sw_updated')
    } catch (error) {
      console.error('Service Worker update error:', error)
      trackPWAEvent('sw_update_error', { error: error.message })
    } finally {
      setState(prev => ({ ...prev, isServiceWorkerUpdating: false }))
    }
  }, [registerSW])

  const skipWaiting = useCallback(() => {
    registerSW.updateSW(true)
    trackPWAEvent('sw_skip_waiting')
  }, [registerSW])

  const requestNotificationPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!('Notification' in window)) {
      return 'denied'
    }

    try {
      const permission = await Notification.requestPermission()
      setState(prev => ({ ...prev, notificationPermission: permission }))
      
      trackPWAEvent('notification_permission_requested', { permission })
      
      return permission
    } catch (error) {
      console.error('Notification permission error:', error)
      return 'denied'
    }
  }, [])

  const clearCache = useCallback(async () => {
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'CLEAR_CACHE'
        })
      }
      
      // Also clear browser caches we can access
      const cacheNames = await caches.keys()
      await Promise.all(
        cacheNames.map(name => caches.delete(name))
      )
      
      setState(prev => ({
        ...prev,
        cacheSize: 0,
        lastCacheUpdate: new Date()
      }))
      
      trackPWAEvent('cache_cleared')
    } catch (error) {
      console.error('Cache clear error:', error)
      trackPWAEvent('cache_clear_error', { error: error.message })
    }
  }, [])

  const getCacheSize = useCallback(async (): Promise<number> => {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate()
        return estimate.usage || 0
      }
      return 0
    } catch (error) {
      console.error('Cache size estimation error:', error)
      return 0
    }
  }, [])

  const trackPWAEvent = useCallback((event: string, data?: Record<string, any>) => {
    // Integration with analytics
    if (window.gtag) {
      window.gtag('event', event, {
        event_category: 'PWA',
        event_label: event,
        ...data
      })
    }
    
    // Console log for development
    if (import.meta.env.DEV) {
      console.log(`PWA Event: ${event}`, data)
    }
  }, [])

  return {
    // State
    ...state,
    
    // Actions
    promptInstall,
    dismissInstallPrompt,
    updateServiceWorker,
    skipWaiting,
    requestNotificationPermission,
    clearCache,
    getCacheSize,
    trackPWAEvent,
    
    // Service Worker registration
    registerSW
  }
}

// Helper hook for PWA install banner
export function useInstallBanner() {
  const { 
    isInstallable, 
    showInstallPrompt, 
    promptInstall, 
    dismissInstallPrompt,
    isInstalled 
  } = usePWA()
  
  return {
    shouldShow: showInstallPrompt && isInstallable && !isInstalled,
    install: promptInstall,
    dismiss: dismissInstallPrompt
  }
}

// Helper hook for offline indicator
export function useOfflineIndicator() {
  const { isOnline, wasOffline } = usePWA()
  
  return {
    isOffline: !isOnline,
    justCameOnline: isOnline && wasOffline,
    shouldShowIndicator: !isOnline || (isOnline && wasOffline)
  }
}

// Helper hook for update banner
export function useUpdateBanner() {
  const { 
    hasServiceWorkerUpdate, 
    isServiceWorkerUpdating, 
    updateServiceWorker 
  } = usePWA()
  
  return {
    shouldShow: hasServiceWorkerUpdate,
    isUpdating: isServiceWorkerUpdating,
    update: updateServiceWorker
  }
}

export default usePWA