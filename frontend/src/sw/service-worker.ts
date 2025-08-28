/**
 * Fine Print AI Service Worker
 * Handles offline functionality, background sync, and push notifications
 */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { BackgroundSync } from 'workbox-background-sync'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { skipWaiting, clientsClaim } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope

// Types for our custom events
interface SyncEvent extends Event {
  tag: string
  lastChance: boolean
}

interface BackgroundSyncOptions {
  name: string
  url: string
  method: string
  headers: Record<string, string>
  body?: string
  metadata?: Record<string, any>
}

interface AnalysisQueueItem {
  id: string
  documentId: string
  file: File
  options: {
    priority: 'high' | 'medium' | 'low'
    type: 'tos' | 'privacy' | 'eula' | 'contract'
  }
  timestamp: number
  retryCount: number
  userId: string
}

// Configuration
const CACHE_NAMES = {
  STATIC: 'fineprint-static-v1',
  DYNAMIC: 'fineprint-dynamic-v1',
  ANALYSIS: 'fineprint-analysis-v1',
  IMAGES: 'fineprint-images-v1',
  FONTS: 'fineprint-fonts-v1',
  OFFLINE_FALLBACK: 'fineprint-offline-v1'
}

const OFFLINE_FALLBACK_URL = '/offline.html'
const CACHE_MAX_ENTRIES = {
  DYNAMIC: 50,
  ANALYSIS: 100,
  IMAGES: 50,
  FONTS: 10
}

// Enable navigation preload for faster loading
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if ('navigationPreload' in self.registration) {
        await self.registration.navigationPreload.enable()
      }
    })()
  )
})

// Skip waiting and claim clients immediately
skipWaiting()
clientsClaim()

// Precache static assets
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Background sync for analysis requests
const analysisQueue = new BackgroundSync('analysis-queue', {
  maxRetentionTime: 24 * 60, // 24 hours in minutes
  onSync: async ({ queue }) => {
    let entry
    while ((entry = await queue.shiftRequest())) {
      try {
        await handleOfflineAnalysis(entry)
      } catch (error) {
        console.error('Failed to process analysis queue item:', error)
        // Re-add to queue for retry
        await queue.unshiftRequest(entry)
        throw error
      }
    }
  }
})

// Network-first strategy for API calls
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: CACHE_NAMES.DYNAMIC,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200]
      }),
      new ExpirationPlugin({
        maxEntries: CACHE_MAX_ENTRIES.DYNAMIC,
        maxAgeSeconds: 5 * 60 // 5 minutes
      })
    ],
    networkTimeoutSeconds: 10
  }),
  'GET'
)

// Cache-first for static assets
registerRoute(
  ({ request }) => 
    request.destination === 'image' ||
    request.destination === 'font' ||
    request.destination === 'style' ||
    request.destination === 'script',
  new CacheFirst({
    cacheName: CACHE_NAMES.STATIC,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
      })
    ]
  })
)

// Stale-while-revalidate for fonts
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new StaleWhileRevalidate({
    cacheName: CACHE_NAMES.FONTS,
    plugins: [
      new ExpirationPlugin({
        maxEntries: CACHE_MAX_ENTRIES.FONTS,
        maxAgeSeconds: 365 * 24 * 60 * 60 // 1 year
      })
    ]
  })
)

// Special handling for analysis endpoints
registerRoute(
  ({ url }) => url.pathname.includes('/api/analysis'),
  new NetworkFirst({
    cacheName: CACHE_NAMES.ANALYSIS,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200]
      }),
      new ExpirationPlugin({
        maxEntries: CACHE_MAX_ENTRIES.ANALYSIS,
        maxAgeSeconds: 60 * 60 // 1 hour
      })
    ],
    networkTimeoutSeconds: 30 // Longer timeout for analysis
  })
)

// Navigation fallback
const navigationRoute = new NavigationRoute(
  new NetworkFirst({
    cacheName: CACHE_NAMES.DYNAMIC,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  }),
  {
    denylist: [/^\/_/, /\/[^/?]+\.[^/]+$/]
  }
)

registerRoute(navigationRoute)

// Offline fallback for navigation
registerRoute(
  ({ request }) => request.mode === 'navigate',
  async ({ event }) => {
    try {
      const response = await navigationRoute.handler.handle({ event, request: event.request })
      return response || Response.redirect('/offline')
    } catch {
      const cache = await caches.open(CACHE_NAMES.OFFLINE_FALLBACK)
      return await cache.match(OFFLINE_FALLBACK_URL) || Response.redirect('/offline')
    }
  }
)

// Handle fetch events for offline analysis
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/analysis') && event.request.method === 'POST') {
    event.respondWith(handleAnalysisRequest(event.request))
  }
})

// Background sync event listener
self.addEventListener('sync', (event: SyncEvent) => {
  if (event.tag === 'analysis-sync') {
    event.waitUntil(processAnalysisQueue())
  } else if (event.tag === 'notification-sync') {
    event.waitUntil(syncNotifications())
  }
})

// Push notification handler
self.addEventListener('push', (event) => {
  if (!event.data) return

  const data = event.data.json()
  const options: NotificationOptions = {
    body: data.body,
    icon: '/pwa-192x192.png',
    badge: '/badge-96x96.png',
    image: data.image,
    data: data.data,
    actions: data.actions || [
      {
        action: 'view',
        title: 'View Details',
        icon: '/icons/view.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/icons/dismiss.png'
      }
    ],
    tag: data.tag || 'fineprint-notification',
    renotify: true,
    requireInteraction: data.requireInteraction || false,
    silent: false,
    timestamp: Date.now(),
    vibrate: [200, 100, 200]
  }

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  )
})

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const action = event.action
  const data = event.notification.data

  if (action === 'view' || !action) {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clientList => {
        // Try to focus existing window
        for (const client of clientList) {
          if (client.url.includes('/dashboard') && 'focus' in client) {
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              data
            })
            return client.focus()
          }
        }
        
        // Open new window
        if (clients.openWindow) {
          const url = data?.url || '/dashboard'
          return clients.openWindow(url)
        }
      })
    )
  }
})

// Message handler for client communication
self.addEventListener('message', (event) => {
  const { type, payload } = event.data

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting()
      break
    
    case 'GET_VERSION':
      event.ports[0].postMessage({
        version: '1.0.0',
        buildTime: __BUILD_TIME__
      })
      break
    
    case 'CACHE_ANALYSIS':
      event.waitUntil(cacheAnalysisResult(payload))
      break
    
    case 'CLEAR_CACHE':
      event.waitUntil(clearAllCaches())
      break
    
    case 'SYNC_ANALYSIS':
      event.waitUntil(queueAnalysisForSync(payload))
      break
  }
})

// Helper functions
async function handleAnalysisRequest(request: Request): Promise<Response> {
  try {
    // Try network first
    const response = await fetch(request.clone())
    
    if (response.ok) {
      // Cache the successful response
      const cache = await caches.open(CACHE_NAMES.ANALYSIS)
      await cache.put(request.clone(), response.clone())
    }
    
    return response
  } catch (error) {
    // Network failed, queue for background sync
    const requestData = await request.clone().json()
    await analysisQueue.pushRequest({ request: request.clone() })
    
    // Return a pending response
    return new Response(
      JSON.stringify({
        status: 'queued',
        message: 'Analysis queued for processing when online',
        id: generateAnalysisId()
      }),
      {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

async function handleOfflineAnalysis(entry: any): Promise<void> {
  const { request } = entry
  const response = await fetch(request.clone())
  
  if (!response.ok) {
    throw new Error(`Analysis request failed: ${response.status}`)
  }
  
  // Notify client of completion
  const clients = await self.clients.matchAll()
  clients.forEach(client => {
    client.postMessage({
      type: 'ANALYSIS_COMPLETED',
      data: response.json()
    })
  })
}

async function processAnalysisQueue(): Promise<void> {
  const queueData = await getStoredAnalysisQueue()
  
  for (const item of queueData) {
    try {
      await processAnalysisItem(item)
      await removeFromAnalysisQueue(item.id)
    } catch (error) {
      console.error('Failed to process analysis item:', error)
      item.retryCount++
      
      if (item.retryCount < 3) {
        await updateAnalysisQueueItem(item)
      } else {
        await removeFromAnalysisQueue(item.id)
      }
    }
  }
}

async function processAnalysisItem(item: AnalysisQueueItem): Promise<void> {
  const formData = new FormData()
  formData.append('file', item.file)
  formData.append('options', JSON.stringify(item.options))
  
  const response = await fetch('/api/analysis/upload', {
    method: 'POST',
    body: formData,
    headers: {
      'Authorization': `Bearer ${await getStoredAuthToken()}`
    }
  })
  
  if (!response.ok) {
    throw new Error(`Analysis failed: ${response.status}`)
  }
  
  const result = await response.json()
  
  // Store result and notify client
  await storeAnalysisResult(item.id, result)
  await notifyClientOfCompletion(item.id, result)
}

async function syncNotifications(): Promise<void> {
  try {
    const response = await fetch('/api/notifications/sync', {
      headers: {
        'Authorization': `Bearer ${await getStoredAuthToken()}`
      }
    })
    
    if (response.ok) {
      const notifications = await response.json()
      await storeNotifications(notifications)
    }
  } catch (error) {
    console.error('Failed to sync notifications:', error)
  }
}

async function cacheAnalysisResult(payload: any): Promise<void> {
  const cache = await caches.open(CACHE_NAMES.ANALYSIS)
  const response = new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' }
  })
  await cache.put(`/analysis/${payload.id}`, response)
}

async function clearAllCaches(): Promise<void> {
  const cacheNames = await caches.keys()
  await Promise.all(
    cacheNames.map(cacheName => caches.delete(cacheName))
  )
}

async function queueAnalysisForSync(payload: AnalysisQueueItem): Promise<void> {
  const queue = await getStoredAnalysisQueue()
  queue.push(payload)
  await storeAnalysisQueue(queue)
  
  // Register for background sync
  await self.registration.sync.register('analysis-sync')
}

// Storage helpers using IndexedDB
async function getStoredAnalysisQueue(): Promise<AnalysisQueueItem[]> {
  // Implementation would use IndexedDB
  return []
}

async function storeAnalysisQueue(queue: AnalysisQueueItem[]): Promise<void> {
  // Implementation would use IndexedDB
}

async function removeFromAnalysisQueue(id: string): Promise<void> {
  // Implementation would use IndexedDB
}

async function updateAnalysisQueueItem(item: AnalysisQueueItem): Promise<void> {
  // Implementation would use IndexedDB
}

async function getStoredAuthToken(): Promise<string> {
  // Implementation would retrieve from IndexedDB
  return ''
}

async function storeAnalysisResult(id: string, result: any): Promise<void> {
  // Implementation would use IndexedDB
}

async function storeNotifications(notifications: any[]): Promise<void> {
  // Implementation would use IndexedDB
}

async function notifyClientOfCompletion(id: string, result: any): Promise<void> {
  const clients = await self.clients.matchAll()
  clients.forEach(client => {
    client.postMessage({
      type: 'ANALYSIS_COMPLETED',
      data: { id, result }
    })
  })
}

function generateAnalysisId(): string {
  return `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Performance monitoring
self.addEventListener('install', (event) => {
  console.log('Service Worker installed')
  
  // Force immediate activation
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  console.log('Service Worker activated')
  
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      cleanupOutdatedCaches()
    ])
  )
})

// Error handling
self.addEventListener('error', (event) => {
  console.error('Service Worker error:', event.error)
})

self.addEventListener('unhandledrejection', (event) => {
  console.error('Service Worker unhandled rejection:', event.reason)
})

export {}