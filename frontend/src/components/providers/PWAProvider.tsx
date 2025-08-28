/**
 * PWA Provider Component
 * Orchestrates all PWA functionality including service worker, notifications, and offline state
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { usePWA } from '@/hooks/usePWA'
import { useOffline } from '@/stores'
import { initializePushNotifications, getPushNotificationManager } from '@/lib/push-notifications'
import { OfflineIndicator } from '@/components/pwa/OfflineIndicator'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'
import { UpdateBanner } from '@/components/pwa/UpdateBanner'

interface PWAContextType {
  isReady: boolean
  features: {
    serviceWorker: boolean
    pushNotifications: boolean
    installPrompt: boolean
    offlineSupport: boolean
  }
  capabilities: {
    canInstall: boolean
    canReceiveNotifications: boolean
    isOfflineCapable: boolean
    hasBackgroundSync: boolean
  }
}

const PWAContext = createContext<PWAContextType | null>(null)

export function usePWAContext() {
  const context = useContext(PWAContext)
  if (!context) {
    throw new Error('usePWAContext must be used within PWAProvider')
  }
  return context
}

interface PWAProviderProps {
  children: ReactNode
  config?: {
    enableInstallPrompt?: boolean
    enableUpdateBanner?: boolean
    enableOfflineIndicator?: boolean
    enablePushNotifications?: boolean
    vapidPublicKey?: string
    autoInitialize?: boolean
    showOnboarding?: boolean
  }
}

export function PWAProvider({ 
  children, 
  config = {} 
}: PWAProviderProps) {
  const {
    enableInstallPrompt = true,
    enableUpdateBanner = true,
    enableOfflineIndicator = true,
    enablePushNotifications = true,
    vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY,
    autoInitialize = true,
    showOnboarding = false
  } = config

  const [isReady, setIsReady] = useState(false)
  const [features, setFeatures] = useState({
    serviceWorker: false,
    pushNotifications: false,
    installPrompt: false,
    offlineSupport: false
  })
  const [capabilities, setCapabilities] = useState({
    canInstall: false,
    canReceiveNotifications: false,
    isOfflineCapable: false,
    hasBackgroundSync: false
  })

  const pwa = usePWA()
  const offline = useOffline()

  // Initialize PWA features
  useEffect(() => {
    if (!autoInitialize) return

    const initializePWA = async () => {
      try {
        // Check for service worker support
        const hasServiceWorker = 'serviceWorker' in navigator
        const hasPushNotifications = 'PushManager' in window && 'Notification' in window
        const hasInstallPrompt = 'BeforeInstallPromptEvent' in window || pwa.isInstallable
        const hasOfflineSupport = 'serviceWorker' in navigator && 'caches' in window

        setFeatures({
          serviceWorker: hasServiceWorker,
          pushNotifications: hasPushNotifications,
          installPrompt: hasInstallPrompt,
          offlineSupport: hasOfflineSupport
        })

        // Initialize push notifications if enabled
        if (enablePushNotifications && hasPushNotifications && vapidPublicKey) {
          try {
            await initializePushNotifications(vapidPublicKey)
            console.log('Push notifications initialized')
          } catch (error) {
            console.error('Failed to initialize push notifications:', error)
          }
        }

        // Set up offline state monitoring
        if (hasOfflineSupport) {
          // Monitor online/offline status
          const handleOnline = () => offline.setOnline(true)
          const handleOffline = () => offline.setOnline(false)
          
          window.addEventListener('online', handleOnline)
          window.addEventListener('offline', handleOffline)
          
          // Initialize offline state
          offline.setOnline(navigator.onLine)
          
          // Load persisted offline data
          if (offline.loadPersistedData) {
            await offline.loadPersistedData()
          }

          // Cleanup function
          return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
          }
        }

        // Check capabilities
        setCapabilities({
          canInstall: pwa.isInstallable && !pwa.isInstalled,
          canReceiveNotifications: hasPushNotifications && pwa.notificationPermission !== 'denied',
          isOfflineCapable: hasOfflineSupport && hasServiceWorker,
          hasBackgroundSync: hasServiceWorker && 'sync' in window.ServiceWorkerRegistration.prototype
        })

        setIsReady(true)
        
        // Track PWA initialization
        pwa.trackPWAEvent('pwa_initialized', {
          features,
          capabilities: {
            canInstall: pwa.isInstallable && !pwa.isInstalled,
            canReceiveNotifications: hasPushNotifications && pwa.notificationPermission !== 'denied',
            isOfflineCapable: hasOfflineSupport && hasServiceWorker,
            hasBackgroundSync: hasServiceWorker && 'sync' in window.ServiceWorkerRegistration.prototype
          },
          userAgent: navigator.userAgent,
          timestamp: Date.now()
        })

      } catch (error) {
        console.error('PWA initialization failed:', error)
        pwa.trackPWAEvent('pwa_init_error', { error: error.message })
      }
    }

    initializePWA()
  }, [autoInitialize, enablePushNotifications, vapidPublicKey, pwa, offline])

  // Handle service worker messages
  useEffect(() => {
    if (!features.serviceWorker) return

    const messageHandler = (event: MessageEvent) => {
      const { type, data } = event.data || {}

      switch (type) {
        case 'ANALYSIS_COMPLETED':
          // Handle completed analysis from background sync
          if (data?.id && data?.result) {
            offline.removeFromAnalysisQueue(data.id)
            
            // Show notification if push notifications are available
            const pushManager = getPushNotificationManager()
            if (pushManager) {
              pushManager.showLocalNotification({
                title: 'Analysis Complete',
                body: `Your document "${data.result.fileName || 'document'}" has been analyzed`,
                tag: 'analysis-complete',
                data: { 
                  type: 'analysis_complete', 
                  analysisId: data.id,
                  url: `/dashboard/analysis/${data.id}`
                }
              })
            }
          }
          break

        case 'BACKGROUND_SYNC_COMPLETE':
          // Handle background sync completion
          offline.updateMetrics()
          break

        case 'CACHE_UPDATED':
          // Handle cache updates
          offline.clearExpiredCache()
          break
      }
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', messageHandler)
      
      return () => {
        navigator.serviceWorker.removeEventListener('message', messageHandler)
      }
    }
  }, [features.serviceWorker, offline])

  // Periodic cleanup and maintenance
  useEffect(() => {
    if (!isReady) return

    const cleanupInterval = setInterval(async () => {
      try {
        // Clear expired cache
        offline.clearExpiredCache()
        
        // Update metrics
        offline.updateMetrics()
        
        // Clean up storage if needed
        const storageInfo = await offline.getStorageInfo()
        if (storageInfo.used > offline.maxCacheSize * 0.9) {
          await offline.cleanupStorage()
        }
        
      } catch (error) {
        console.error('PWA cleanup failed:', error)
      }
    }, 5 * 60 * 1000) // Every 5 minutes

    return () => clearInterval(cleanupInterval)
  }, [isReady, offline])

  // Connection quality monitoring
  useEffect(() => {
    if (!features.serviceWorker) return

    const connection = (navigator as any).connection
    if (!connection) return

    const updateConnectionQuality = () => {
      const effectiveType = connection.effectiveType
      const downlink = connection.downlink
      
      let quality: 'good' | 'poor' | 'offline'
      
      if (!navigator.onLine) {
        quality = 'offline'
      } else if (effectiveType === 'slow-2g' || effectiveType === '2g' || downlink < 0.5) {
        quality = 'poor'
      } else {
        quality = 'good'
      }
      
      offline.setConnectionQuality(quality)
    }

    updateConnectionQuality()
    connection.addEventListener('change', updateConnectionQuality)

    return () => {
      connection.removeEventListener('change', updateConnectionQuality)
    }
  }, [features.serviceWorker, offline])

  const contextValue: PWAContextType = {
    isReady,
    features,
    capabilities
  }

  return (
    <PWAContext.Provider value={contextValue}>
      {children}
      
      {/* PWA UI Components */}
      {isReady && enableOfflineIndicator && (
        <OfflineIndicator showDetails={true} />
      )}
      
      {isReady && enableInstallPrompt && (
        <InstallPrompt 
          variant="toast" 
          showFeatures={true}
          autoShow={true}
        />
      )}
      
      {isReady && enableUpdateBanner && (
        <UpdateBanner 
          variant="banner" 
          position="top"
          showProgress={true}
          autoShow={true}
        />
      )}
    </PWAContext.Provider>
  )
}

/**
 * Hook to check if PWA features are available
 */
export function usePWAFeatures() {
  const { features, capabilities } = usePWAContext()
  
  return {
    ...features,
    ...capabilities,
    isFullySupported: features.serviceWorker && features.offlineSupport,
    isInstallable: capabilities.canInstall,
    isNotificationReady: features.pushNotifications && capabilities.canReceiveNotifications
  }
}

/**
 * Hook for PWA status information
 */
export function usePWAStatus() {
  const { isReady } = usePWAContext()
  const pwa = usePWA()
  const offline = useOffline()
  
  return {
    isReady,
    isOnline: offline.isOnline,
    isInstalled: pwa.isInstalled,
    hasUpdate: pwa.hasServiceWorkerUpdate,
    queueSize: offline.analysisQueue.length,
    cacheSize: offline.cacheSize,
    lastSync: offline.metrics.lastSuccessfulSync
  }
}

export default PWAProvider