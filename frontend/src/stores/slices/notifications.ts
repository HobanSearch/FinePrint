import { StateCreator } from 'zustand'
import type { RootStore, NotificationState, NotificationActions, Notification } from '../types'
import { storage } from '../../lib/storage'

const NOTIFICATION_STORAGE_KEY = 'fineprint_notifications'
const MAX_NOTIFICATIONS = 100
const AUTO_DISMISS_TIMEOUT = 5000

type NotificationSlice = NotificationState & NotificationActions

export const createNotificationSlice: StateCreator<
  RootStore,
  [],
  [],
  NotificationSlice
> = (set, get) => ({
  // Initial state
  notifications: [],
  unreadCount: 0,
  isEnabled: true,

  // Actions
  addNotification: (notificationData: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const { isEnabled } = get().notifications
    
    if (!isEnabled && notificationData.type !== 'error') {
      return // Don't show notifications if disabled (except errors)
    }

    const notification: Notification = {
      ...notificationData,
      id: crypto.randomUUID(),
      timestamp: new Date(),
      read: false
    }

    set(state => {
      const newNotifications = [notification, ...state.notifications]
        .slice(0, MAX_NOTIFICATIONS) // Keep only recent notifications

      return {
        notifications: newNotifications,
        unreadCount: state.unreadCount + 1
      }
    })

    // Auto-dismiss non-persistent notifications
    if (!notification.persistent) {
      setTimeout(() => {
        get().notifications.removeNotification(notification.id)
      }, AUTO_DISMISS_TIMEOUT)
    }

    // Store to persistence
    get().notifications.persistNotifications()

    // Show browser notification for important messages
    if (notification.type === 'error' || notification.type === 'warning') {
      get().notifications.showBrowserNotification(notification)
    }
  },

  removeNotification: (id: string) => {
    set(state => {
      const notification = state.notifications.find(n => n.id === id)
      const wasUnread = notification && !notification.read

      return {
        notifications: state.notifications.filter(n => n.id !== id),
        unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount
      }
    })

    get().notifications.persistNotifications()
  },

  markAsRead: (id: string) => {
    set(state => {
      const notifications = state.notifications.map(notification => {
        if (notification.id === id && !notification.read) {
          return { ...notification, read: true }
        }
        return notification
      })

      const unreadCount = Math.max(0, state.unreadCount - 1)

      return {
        notifications,
        unreadCount
      }
    })

    get().notifications.persistNotifications()
  },

  markAllAsRead: () => {
    set(state => ({
      notifications: state.notifications.map(notification => ({
        ...notification,
        read: true
      })),
      unreadCount: 0
    }))

    get().notifications.persistNotifications()
  },

  clearAll: () => {
    set({
      notifications: [],
      unreadCount: 0
    })

    get().notifications.persistNotifications()
  },

  setEnabled: (enabled: boolean) => {
    set({ isEnabled: enabled })
    
    // Update user preferences
    get().preferences.updatePreferences({
      notifications: {
        ...get().preferences.notifications,
        push: enabled
      }
    })
  },

  // Helper methods (not exposed in interface)
  persistNotifications: async () => {
    const { notifications } = get().notifications
    
    // Only persist recent notifications to avoid storage bloat
    const recentNotifications = notifications.slice(0, 20)
    
    await storage.set(NOTIFICATION_STORAGE_KEY, {
      notifications: recentNotifications,
      timestamp: Date.now()
    })
  },

  loadPersistedNotifications: async () => {
    try {
      const stored = await storage.get(NOTIFICATION_STORAGE_KEY)
      
      if (stored?.notifications) {
        // Only load notifications from the last 24 hours
        const dayAgo = Date.now() - (24 * 60 * 60 * 1000)
        const recentNotifications = stored.notifications.filter(
          (n: Notification) => new Date(n.timestamp).getTime() > dayAgo
        )

        const unreadCount = recentNotifications.filter((n: Notification) => !n.read).length

        set({
          notifications: recentNotifications,
          unreadCount
        })
      }
    } catch (error) {
      console.error('Failed to load persisted notifications:', error)
    }
  },

  showBrowserNotification: async (notification: Notification) => {
    // Check if browser notifications are supported and permitted
    if (!('Notification' in window)) {
      return
    }

    let permission = Notification.permission
    
    if (permission === 'default') {
      permission = await Notification.requestPermission()
    }

    if (permission === 'granted') {
      const browserNotification = new Notification(notification.title, {
        body: notification.message,
        icon: '/favicon.ico',
        badge: '/badge-icon.png',
        tag: notification.id,
        requireInteraction: notification.type === 'error'
      })

      // Handle notification click
      browserNotification.onclick = () => {
        window.focus()
        
        if (notification.action) {
          notification.action.handler()
        }
        
        browserNotification.close()
      }

      // Auto-close after 5 seconds for non-error notifications
      if (notification.type !== 'error') {
        setTimeout(() => {
          browserNotification.close()
        }, 5000)
      }
    }
  },

  // Method to handle WebSocket notification messages
  handleWebSocketNotification: (message: any) => {
    const { type, payload } = message

    switch (type) {
      case 'analysis_complete':
        get().notifications.addNotification({
          type: 'success',
          title: 'Analysis Complete',
          message: `Your document analysis is ready with ${payload.keyFindings.length} findings.`,
          action: {
            label: 'View Results',
            handler: () => {
              // Navigate to analysis results
              window.location.href = `/analysis/${payload.analysisId}`
            }
          }
        })
        break

      case 'document_change':
        get().notifications.addNotification({
          type: 'warning',
          title: 'Document Updated',
          message: `${payload.title} has been updated with ${payload.changeType} changes.`,
          action: {
            label: 'Review Changes',
            handler: () => {
              window.location.href = `/documents/${payload.documentId}/changes`
            }
          }
        })
        break

      case 'system_alert':
        get().notifications.addNotification({
          type: payload.severity === 'error' ? 'error' : 'warning',
          title: payload.title,
          message: payload.message,
          persistent: payload.severity === 'error'
        })
        break

      case 'notification':
        get().notifications.addNotification({
          type: payload.severity || 'info',
          title: payload.title,
          message: payload.message,
          action: payload.actionUrl ? {
            label: 'View',
            handler: () => {
              window.location.href = payload.actionUrl
            }
          } : undefined
        })
        break

      default:
        console.warn('Unknown notification type:', type)
    }
  }
} as any) // Type assertion needed for helper methods