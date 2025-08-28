/**
 * Push Notifications Manager for Fine Print AI
 * Handles push notification registration, subscription management, and message handling
 */

export interface PushSubscriptionData {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
  userId?: string
  deviceId?: string
  userAgent: string
  subscriptionTime: number
}

export interface NotificationPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  image?: string
  tag?: string
  data?: any
  actions?: Array<{
    action: string
    title: string
    icon?: string
  }>
  requireInteraction?: boolean
  silent?: boolean
  vibrate?: number[]
  timestamp?: number
}

export interface NotificationPreferences {
  enabled: boolean
  analysisComplete: boolean
  documentChanges: boolean
  systemMaintenance: boolean
  weeklyDigest: boolean
  criticalAlerts: boolean
  quietHours: {
    enabled: boolean
    start: string // HH:MM format
    end: string   // HH:MM format
  }
  deviceSettings: {
    sound: boolean
    vibration: boolean
    badge: boolean
  }
}

export class PushNotificationManager {
  private subscription: PushSubscription | null = null
  private vapidPublicKey: string
  private serverEndpoint: string
  private preferences: NotificationPreferences
  private isSupported: boolean
  private permissionStatus: NotificationPermission = 'default'

  constructor(vapidPublicKey: string, serverEndpoint: string = '/api/notifications') {
    this.vapidPublicKey = vapidPublicKey
    this.serverEndpoint = serverEndpoint
    this.isSupported = this.checkSupport()
    this.preferences = this.getDefaultPreferences()
    
    if (this.isSupported) {
      this.permissionStatus = Notification.permission
      this.initializeServiceWorkerListener()
    }
  }

  private checkSupport(): boolean {
    return !!(
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    )
  }

  private getDefaultPreferences(): NotificationPreferences {
    return {
      enabled: false,
      analysisComplete: true,
      documentChanges: true,
      systemMaintenance: true,
      weeklyDigest: false,
      criticalAlerts: true,
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '08:00'
      },
      deviceSettings: {
        sound: true,
        vibration: true,
        badge: true
      }
    }
  }

  private initializeServiceWorkerListener(): void {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'NOTIFICATION_CLICKED') {
          this.handleNotificationClick(event.data.payload)
        }
      })
    }
  }

  /**
   * Check if push notifications are supported
   */
  public isSupported_(): boolean {
    return this.isSupported
  }

  /**
   * Get current permission status
   */
  public getPermissionStatus(): NotificationPermission {
    return this.permissionStatus
  }

  /**
   * Request notification permission
   */
  public async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported) {
      throw new Error('Push notifications are not supported')
    }

    try {
      this.permissionStatus = await Notification.requestPermission()
      
      // Track permission request result
      this.trackEvent('permission_requested', {
        result: this.permissionStatus,
        timestamp: Date.now()
      })
      
      return this.permissionStatus
    } catch (error) {
      console.error('Failed to request notification permission:', error)
      throw error
    }
  }

  /**
   * Subscribe to push notifications
   */
  public async subscribe(userId?: string): Promise<PushSubscriptionData | null> {
    if (!this.isSupported) {
      throw new Error('Push notifications are not supported')
    }

    if (this.permissionStatus !== 'granted') {
      const permission = await this.requestPermission()
      if (permission !== 'granted') {
        return null
      }
    }

    try {
      const registration = await navigator.serviceWorker.ready
      
      // Check for existing subscription
      const existingSubscription = await registration.pushManager.getSubscription()
      if (existingSubscription) {
        this.subscription = existingSubscription
        return this.serializeSubscription(existingSubscription, userId)
      }

      // Create new subscription
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey)
      })

      this.subscription = subscription
      const subscriptionData = this.serializeSubscription(subscription, userId)

      // Send subscription to server
      await this.sendSubscriptionToServer(subscriptionData)

      // Update preferences to enabled
      this.preferences.enabled = true
      await this.savePreferences()

      this.trackEvent('subscription_created', {
        userId,
        timestamp: Date.now()
      })

      return subscriptionData
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error)
      throw error
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  public async unsubscribe(): Promise<void> {
    if (!this.subscription) {
      return
    }

    try {
      const success = await this.subscription.unsubscribe()
      
      if (success) {
        // Notify server
        await this.removeSubscriptionFromServer()
        
        this.subscription = null
        this.preferences.enabled = false
        await this.savePreferences()
        
        this.trackEvent('subscription_removed', {
          timestamp: Date.now()
        })
      }
    } catch (error) {
      console.error('Failed to unsubscribe from push notifications:', error)
      throw error
    }
  }

  /**
   * Get current subscription
   */
  public async getSubscription(): Promise<PushSubscription | null> {
    if (!this.isSupported) {
      return null
    }

    try {
      const registration = await navigator.serviceWorker.ready
      this.subscription = await registration.pushManager.getSubscription()
      return this.subscription
    } catch (error) {
      console.error('Failed to get subscription:', error)
      return null
    }
  }

  /**
   * Update notification preferences
   */
  public async updatePreferences(preferences: Partial<NotificationPreferences>): Promise<void> {
    this.preferences = { ...this.preferences, ...preferences }
    await this.savePreferences()
    
    // Send updated preferences to server
    await this.sendPreferencesToServer()
    
    this.trackEvent('preferences_updated', {
      preferences: this.preferences,
      timestamp: Date.now()
    })
  }

  /**
   * Get current preferences
   */
  public getPreferences(): NotificationPreferences {
    return { ...this.preferences }
  }

  /**
   * Check if notifications should be shown based on quiet hours
   */
  public shouldShowNotification(notificationType: keyof NotificationPreferences): boolean {
    if (!this.preferences.enabled || !this.preferences[notificationType]) {
      return false
    }

    // Check quiet hours
    if (this.preferences.quietHours.enabled) {
      const now = new Date()
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
      
      const { start, end } = this.preferences.quietHours
      
      // Handle quiet hours that span midnight
      if (start > end) {
        if (currentTime >= start || currentTime <= end) {
          return false
        }
      } else {
        if (currentTime >= start && currentTime <= end) {
          return false
        }
      }
    }

    return true
  }

  /**
   * Show a local notification (fallback for when push is not available)
   */
  public async showLocalNotification(payload: NotificationPayload): Promise<void> {
    if (!this.isSupported || this.permissionStatus !== 'granted') {
      return
    }

    try {
      const options: NotificationOptions = {
        body: payload.body,
        icon: payload.icon || '/pwa-192x192.png',
        badge: payload.badge || '/badge-96x96.png',
        image: payload.image,
        tag: payload.tag,
        data: payload.data,
        actions: payload.actions,
        requireInteraction: payload.requireInteraction || false,
        silent: payload.silent || false,
        vibrate: payload.vibrate || [200, 100, 200],
        timestamp: payload.timestamp || Date.now()
      }

      const notification = new Notification(payload.title, options)
      
      notification.onclick = () => {
        this.handleNotificationClick(payload)
        notification.close()
      }

      // Auto-close after 10 seconds unless requireInteraction is true
      if (!payload.requireInteraction) {
        setTimeout(() => {
          notification.close()
        }, 10000)
      }

      this.trackEvent('local_notification_shown', {
        tag: payload.tag,
        timestamp: Date.now()
      })
    } catch (error) {
      console.error('Failed to show local notification:', error)
    }
  }

  /**
   * Test push notification functionality
   */
  public async testNotification(): Promise<void> {
    const testPayload: NotificationPayload = {
      title: 'Fine Print AI Test',
      body: 'Push notifications are working correctly!',
      tag: 'test-notification',
      data: { type: 'test' }
    }

    await this.showLocalNotification(testPayload)
  }

  /**
   * Handle notification click events
   */
  private handleNotificationClick(payload: NotificationPayload): void {
    // Focus or open the app window
    if ('clients' in self) {
      // This will be handled by the service worker
      return
    }

    // Handle in main thread
    const data = payload.data
    
    if (data?.url) {
      window.open(data.url, '_blank')
    } else if (data?.type === 'analysis_complete' && data?.analysisId) {
      // Navigate to analysis page
      window.location.href = `/dashboard/analysis/${data.analysisId}`
    } else {
      // Default action - focus the app
      window.focus()
    }

    this.trackEvent('notification_clicked', {
      tag: payload.tag,
      type: data?.type,
      timestamp: Date.now()
    })
  }

  /**
   * Convert VAPID key to Uint8Array
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    
    return outputArray
  }

  /**
   * Serialize subscription for server
   */
  private serializeSubscription(subscription: PushSubscription, userId?: string): PushSubscriptionData {
    const keys = subscription.getKey ? {
      p256dh: this.arrayBufferToBase64(subscription.getKey('p256dh')),
      auth: this.arrayBufferToBase64(subscription.getKey('auth'))
    } : { p256dh: '', auth: '' }

    return {
      endpoint: subscription.endpoint,
      keys,
      userId,
      deviceId: this.getDeviceId(),
      userAgent: navigator.userAgent,
      subscriptionTime: Date.now()
    }
  }

  /**
   * Convert ArrayBuffer to base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer | null): string {
    if (!buffer) return ''
    
    const bytes = new Uint8Array(buffer)
    let binary = ''
    
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    
    return window.btoa(binary)
  }

  /**
   * Get or generate device ID
   */
  private getDeviceId(): string {
    let deviceId = localStorage.getItem('fineprint-device-id')
    
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      localStorage.setItem('fineprint-device-id', deviceId)
    }
    
    return deviceId
  }

  /**
   * Send subscription to server
   */
  private async sendSubscriptionToServer(subscriptionData: PushSubscriptionData): Promise<void> {
    try {
      const response = await fetch(`${this.serverEndpoint}/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify(subscriptionData)
      })

      if (!response.ok) {
        throw new Error(`Failed to send subscription: ${response.status}`)
      }
    } catch (error) {
      console.error('Failed to send subscription to server:', error)
      throw error
    }
  }

  /**
   * Remove subscription from server
   */
  private async removeSubscriptionFromServer(): Promise<void> {
    if (!this.subscription) return

    try {
      const response = await fetch(`${this.serverEndpoint}/unsubscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({
          endpoint: this.subscription.endpoint,
          deviceId: this.getDeviceId()
        })
      })

      if (!response.ok) {
        console.warn(`Failed to remove subscription from server: ${response.status}`)
      }
    } catch (error) {
      console.error('Failed to remove subscription from server:', error)
    }
  }

  /**
   * Send preferences to server
   */
  private async sendPreferencesToServer(): Promise<void> {
    try {
      const response = await fetch(`${this.serverEndpoint}/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({
          deviceId: this.getDeviceId(),
          preferences: this.preferences
        })
      })

      if (!response.ok) {
        console.warn(`Failed to send preferences to server: ${response.status}`)
      }
    } catch (error) {
      console.error('Failed to send preferences to server:', error)
    }
  }

  /**
   * Save preferences to local storage
   */
  private async savePreferences(): Promise<void> {
    try {
      localStorage.setItem('fineprint-notification-preferences', JSON.stringify(this.preferences))
    } catch (error) {
      console.error('Failed to save preferences to localStorage:', error)
    }
  }

  /**
   * Load preferences from local storage
   */
  private loadPreferences(): void {
    try {
      const stored = localStorage.getItem('fineprint-notification-preferences')
      if (stored) {
        this.preferences = { ...this.getDefaultPreferences(), ...JSON.parse(stored) }
      }
    } catch (error) {
      console.error('Failed to load preferences from localStorage:', error)
      this.preferences = this.getDefaultPreferences()
    }
  }

  /**
   * Get auth token for API calls
   */
  private getAuthToken(): string | null {
    // This would integrate with your auth system
    return localStorage.getItem('auth-token')
  }

  /**
   * Track analytics events
   */
  private trackEvent(event: string, data: any): void {
    if (window.gtag) {
      window.gtag('event', event, {
        event_category: 'Push Notifications',
        event_label: event,
        ...data
      })
    }

    if (import.meta.env.DEV) {
      console.log(`Push Notification Event: ${event}`, data)
    }
  }

  /**
   * Initialize the notification manager
   */
  public async initialize(): Promise<void> {
    if (!this.isSupported) {
      console.warn('Push notifications are not supported in this browser')
      return
    }

    this.loadPreferences()
    
    // Get current subscription status
    await this.getSubscription()
    
    // Set up periodic subscription check
    this.setupSubscriptionMonitoring()
  }

  /**
   * Set up periodic monitoring of subscription status
   */
  private setupSubscriptionMonitoring(): void {
    // Check subscription status every 30 minutes
    setInterval(async () => {
      try {
        const currentSub = await this.getSubscription()
        
        if (this.preferences.enabled && !currentSub) {
          console.warn('Push subscription lost, attempting to resubscribe')
          // Attempt to resubscribe
          await this.subscribe()
        }
      } catch (error) {
        console.error('Subscription monitoring error:', error)
      }
    }, 30 * 60 * 1000) // 30 minutes
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    // Clean up any intervals or listeners
    if (this.subscription) {
      this.subscription = null
    }
  }
}

// Singleton instance
let pushManager: PushNotificationManager | null = null

/**
 * Get the push notification manager instance
 */
export function getPushNotificationManager(): PushNotificationManager | null {
  return pushManager
}

/**
 * Initialize push notifications
 */
export async function initializePushNotifications(vapidPublicKey: string): Promise<PushNotificationManager> {
  if (!pushManager) {
    pushManager = new PushNotificationManager(vapidPublicKey)
    await pushManager.initialize()
  }
  
  return pushManager
}

/**
 * Cleanup push notifications
 */
export function cleanupPushNotifications(): void {
  if (pushManager) {
    pushManager.destroy()
    pushManager = null
  }
}

export default PushNotificationManager