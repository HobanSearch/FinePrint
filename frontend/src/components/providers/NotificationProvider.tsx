import React from 'react'
import { toast } from 'sonner'
import { useNotifications } from '../../stores'

interface NotificationProviderProps {
  children: React.ReactNode
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const { notifications, removeNotification, markAsRead } = useNotifications()

  // Subscribe to new notifications and show them as toasts
  React.useEffect(() => {
    const unreadNotifications = notifications.filter(n => !n.read)
    
    unreadNotifications.forEach(notification => {
      // Skip if we've already shown this notification as a toast
      if (notification.id.startsWith('toast-')) return

      const toastContent = (
        <div className="space-y-1">
          <p className="font-medium">{notification.title}</p>
          <p className="text-sm text-muted-foreground">{notification.message}</p>
          {notification.action && (
            <button
              onClick={() => {
                notification.action!.handler()
                removeNotification(notification.id)
              }}
              className="text-sm text-primary hover:text-primary/80 underline"
            >
              {notification.action.label}
            </button>
          )}
        </div>
      )

      // Show toast based on notification type
      switch (notification.type) {
        case 'success':
          toast.success(toastContent, {
            id: notification.id,
            duration: notification.persistent ? Infinity : 4000,
            onDismiss: () => {
              markAsRead(notification.id)
              if (!notification.persistent) {
                removeNotification(notification.id)
              }
            }
          })
          break

        case 'error':
          toast.error(toastContent, {
            id: notification.id,
            duration: notification.persistent ? Infinity : 6000,
            onDismiss: () => {
              markAsRead(notification.id)
              if (!notification.persistent) {
                removeNotification(notification.id)
              }
            }
          })
          break

        case 'warning':
          toast.warning(toastContent, {
            id: notification.id,
            duration: notification.persistent ? Infinity : 5000,
            onDismiss: () => {
              markAsRead(notification.id)
              if (!notification.persistent) {
                removeNotification(notification.id)
              }
            }
          })
          break

        case 'info':
        default:
          toast(toastContent, {
            id: notification.id,
            duration: notification.persistent ? Infinity : 4000,
            onDismiss: () => {
              markAsRead(notification.id)
              if (!notification.persistent) {
                removeNotification(notification.id)
              }
            }
          })
          break
      }

      // Mark as read after showing
      setTimeout(() => markAsRead(notification.id), 100)
    })
  }, [notifications, removeNotification, markAsRead])

  return <>{children}</>
}

export default NotificationProvider