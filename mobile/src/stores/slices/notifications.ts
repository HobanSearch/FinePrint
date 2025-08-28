import type { StateCreator } from 'zustand'
import * as Notifications from 'expo-notifications'
import type { Notification, NotificationPreferences } from '@/types'

export interface NotificationSlice {
  notifications: Notification[]
  unreadCount: number
  isEnabled: boolean
  notificationPreferences: NotificationPreferences
  
  // Actions
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void
  removeNotification: (id: string) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearAll: () => void
  setEnabled: (enabled: boolean) => void
  updateNotificationPreferences: (preferences: Partial<NotificationPreferences>) => void
  clearNotifications: () => void
}

export const createNotificationSlice: StateCreator<
  NotificationSlice,
  [['zustand/immer', never], ['zustand/devtools', never], ['zustand/subscribeWithSelector', never]],
  [],
  NotificationSlice
> = (set, get) => ({
  // Initial state
  notifications: [],
  unreadCount: 0,
  isEnabled: true,
  notificationPreferences: {
    enabled: true,
    analysisComplete: true,
    documentShared: true,
    weeklyDigest: true,
    systemUpdates: true,
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00'
    }
  },

  // Actions
  addNotification: (notification) => {
    const newNotification: Notification = {
      id: generateNotificationId(),
      timestamp: new Date(),
      read: false,
      ...notification
    }

    set(state => {
      state.notifications.unshift(newNotification)
      state.unreadCount += 1
      
      // Keep only last 100 notifications
      if (state.notifications.length > 100) {
        const removed = state.notifications.splice(100)
        // Adjust unread count
        const removedUnread = removed.filter(n => !n.read).length
        state.unreadCount = Math.max(0, state.unreadCount - removedUnread)
      }
    })
  },

  removeNotification: (id: string) => {
    set(state => {
      const index = state.notifications.findIndex(n => n.id === id)
      if (index !== -1) {
        const notification = state.notifications[index]
        if (!notification.read) {
          state.unreadCount = Math.max(0, state.unreadCount - 1)
        }
        state.notifications.splice(index, 1)
      }
    })
  },

  markAsRead: (id: string) => {
    set(state => {
      const notification = state.notifications.find(n => n.id === id)
      if (notification && !notification.read) {
        notification.read = true
        state.unreadCount = Math.max(0, state.unreadCount - 1)
      }
    })
  },

  markAllAsRead: () => {
    set(state => {
      state.notifications.forEach(n => {
        n.read = true
      })
      state.unreadCount = 0
    })
  },

  clearAll: () => {
    set(state => {
      state.notifications = []
      state.unreadCount = 0
    })
  },

  setEnabled: (enabled: boolean) => {
    set(state => {
      state.isEnabled = enabled
      state.notificationPreferences.enabled = enabled
    })
  },

  updateNotificationPreferences: (preferences) => {
    set(state => {
      state.notificationPreferences = {
        ...state.notificationPreferences,
        ...preferences
      }
    })
  },

  clearNotifications: () => {
    set(state => {
      state.notifications = []
      state.unreadCount = 0
    })
  }
})

function generateNotificationId(): string {
  return `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}