/**
 * Push Notification Service
 * Firebase Cloud Messaging integration with rich notifications and background handling
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import messaging from '@react-native-firebase/messaging';
import analytics from '@react-native-firebase/analytics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { logger } from '../utils/logger';
import { performanceMonitor } from '../utils/performance';

const NOTIFICATION_SETTINGS_KEY = 'notification_settings';
const FCM_TOKEN_KEY = 'fcm_token';
const NOTIFICATION_HISTORY_KEY = 'notification_history';

export interface NotificationSettings {
  enabled: boolean;
  categories: {
    analysis_complete: boolean;
    sync_updates: boolean;
    security_alerts: boolean;
    app_updates: boolean;
    promotional: boolean;
  };
  quietHours: {
    enabled: boolean;
    startTime: string; // HH:MM format
    endTime: string;
  };
  sound: boolean;
  vibration: boolean;
  badge: boolean;
  showPreviews: boolean;
}

export interface NotificationData {
  id: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  category: string;
  priority: 'low' | 'normal' | 'high';
  imageUrl?: string;
  actionButtons?: NotificationAction[];
  deepLink?: string;
  scheduledFor?: string;
}

export interface NotificationAction {
  id: string;
  title: string;
  icon?: string;
  destructive?: boolean;
  authenticationRequired?: boolean;
}

export interface NotificationHistory {
  id: string;
  title: string;
  body: string;
  category: string;
  receivedAt: string;
  opened: boolean;
  openedAt?: string;
  data?: Record<string, any>;
}

export interface NotificationStats {
  totalSent: number;
  totalReceived: number;
  totalOpened: number;
  openRate: number;
  categoryStats: Record<string, {
    sent: number;
    received: number;
    opened: number;
  }>;
  lastUpdated: string;
}

class PushNotificationService {
  private settings: NotificationSettings;
  private fcmToken: string | null = null;
  private notificationHistory: NotificationHistory[] = [];
  private isInitialized = false;
  private backgroundMessageHandler: (() => void) | null = null;

  constructor() {
    this.settings = {
      enabled: true,
      categories: {
        analysis_complete: true,
        sync_updates: true,
        security_alerts: true,
        app_updates: true,
        promotional: false,
      },
      quietHours: {
        enabled: false,
        startTime: '22:00',
        endTime: '08:00',
      },
      sound: true,
      vibration: true,
      badge: true,
      showPreviews: true,
    };
  }

  /**
   * Initialize push notification service
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing push notification service...');

      // Load settings and history
      await this.loadSettings();
      await this.loadNotificationHistory();

      // Configure notifications
      await this.configureNotifications();

      // Request permissions
      await this.requestPermissions();

      // Initialize Firebase messaging
      await this.initializeFirebaseMessaging();

      // Set up notification handlers
      this.setupNotificationHandlers();

      this.isInitialized = true;
      logger.info('Push notification service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize push notification service:', error);
      throw error;
    }
  }

  /**
   * Configure notification behavior
   */
  private async configureNotifications(): Promise<void> {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const category = notification.request.content.data?.category;
        
        // Check if notifications are enabled for this category
        if (!this.settings.enabled || !this.isCategoryEnabled(category)) {
          return {
            shouldShowAlert: false,
            shouldPlaySound: false,
            shouldSetBadge: false,
          };
        }

        // Check quiet hours
        if (this.isInQuietHours()) {
          return {
            shouldShowAlert: false,
            shouldPlaySound: false,
            shouldSetBadge: this.settings.badge,
          };
        }

        return {
          shouldShowAlert: true,
          shouldPlaySound: this.settings.sound,
          shouldSetBadge: this.settings.badge,
        };
      },
    });
  }

  /**
   * Request notification permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      if (!Device.isDevice) {
        logger.warn('Must use physical device for push notifications');
        return false;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        logger.warn('Push notification permissions not granted');
        return false;
      }

      // Configure notification channel for Android
      if (Platform.OS === 'android') {
        await this.createNotificationChannels();
      }

      logger.info('Push notification permissions granted');
      return true;
    } catch (error) {
      logger.error('Failed to request notification permissions:', error);
      return false;
    }
  }

  /**
   * Create notification channels for Android
   */
  private async createNotificationChannels(): Promise<void> {
    const channels = [
      {
        id: 'analysis_complete',
        name: 'Analysis Complete',
        description: 'Notifications when document analysis is complete',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      },
      {
        id: 'sync_updates',
        name: 'Sync Updates',
        description: 'Data synchronization notifications',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      },
      {
        id: 'security_alerts',
        name: 'Security Alerts',
        description: 'Important security notifications',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      },
      {
        id: 'app_updates',
        name: 'App Updates',
        description: 'Application update notifications',
        importance: Notifications.AndroidImportance.DEFAULT,
      },
      {
        id: 'promotional',
        name: 'Promotional',
        description: 'Marketing and promotional notifications',
        importance: Notifications.AndroidImportance.LOW,
      },
    ];

    for (const channel of channels) {
      await Notifications.setNotificationChannelAsync(channel.id, channel);
    }
  }

  /**
   * Initialize Firebase messaging
   */
  private async initializeFirebaseMessaging(): Promise<void> {
    try {
      // Check if user has given messaging permissions
      const authStatus = await messaging().requestPermission();
      const enabled = 
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (!enabled) {
        logger.warn('Firebase messaging permissions not granted');
        return;
      }

      // Get FCM token
      await this.getFCMToken();

      // Listen for token refresh
      messaging().onTokenRefresh(async (token) => {
        logger.info('FCM token refreshed');
        this.fcmToken = token;
        await this.saveFCMToken(token);
        await this.registerToken(token);
      });

      // Set up background message handler
      this.backgroundMessageHandler = messaging().setBackgroundMessageHandler(
        async (remoteMessage) => {
          logger.info('Background message received:', remoteMessage);
          await this.handleBackgroundMessage(remoteMessage);
        }
      );

      logger.info('Firebase messaging initialized');
    } catch (error) {
      logger.error('Failed to initialize Firebase messaging:', error);
    }
  }

  /**
   * Get FCM token
   */
  private async getFCMToken(): Promise<void> {
    try {
      const token = await messaging().getToken();
      if (token) {
        this.fcmToken = token;
        await this.saveFCMToken(token);
        await this.registerToken(token);
        logger.info('FCM token obtained');
      }
    } catch (error) {
      logger.error('Failed to get FCM token:', error);
    }
  }

  /**
   * Register token with backend
   */
  private async registerToken(token: string): Promise<void> {
    try {
      // This would register the token with your backend
      // For now, just log it
      logger.info(`Registering FCM token: ${token.substring(0, 20)}...`);
      
      // Track token registration
      await analytics().logEvent('fcm_token_registered', {
        platform: Platform.OS,
        app_version: '1.0.0', // Get from app config
      });
    } catch (error) {
      logger.error('Failed to register FCM token:', error);
    }
  }

  /**
   * Set up notification event handlers
   */
  private setupNotificationHandlers(): void {
    // Handle notification received while app is in foreground
    Notifications.addNotificationReceivedListener((notification) => {
      logger.info('Notification received in foreground:', notification);
      this.handleNotificationReceived(notification);
    });

    // Handle notification tap
    Notifications.addNotificationResponseReceivedListener((response) => {
      logger.info('Notification tapped:', response);
      this.handleNotificationTapped(response);
    });

    // Handle Firebase foreground messages
    messaging().onMessage(async (remoteMessage) => {
      logger.info('Foreground message received:', remoteMessage);
      await this.handleForegroundMessage(remoteMessage);
    });

    // Handle notification opened from background/quit state
    messaging().onNotificationOpenedApp((remoteMessage) => {
      logger.info('Notification opened app from background:', remoteMessage);
      this.handleNotificationOpened(remoteMessage);
    });

    // Check if app was opened from a notification (when app was quit)
    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage) {
          logger.info('App opened from quit state by notification:', remoteMessage);
          this.handleNotificationOpened(remoteMessage);
        }
      });
  }

  /**
   * Handle notification received in foreground
   */
  private async handleNotificationReceived(notification: Notifications.Notification): Promise<void> {
    try {
      const notificationData = this.extractNotificationData(notification);
      await this.addToHistory(notificationData, false);
      
      // Track analytics
      await analytics().logEvent('notification_received', {
        category: notificationData.category,
        platform: Platform.OS,
      });
    } catch (error) {
      logger.error('Failed to handle notification received:', error);
    }
  }

  /**
   * Handle notification tapped
   */
  private async handleNotificationTapped(response: Notifications.NotificationResponse): Promise<void> {
    try {
      const notificationData = this.extractNotificationData(response.notification);
      await this.markAsOpened(notificationData.id);
      
      // Handle deep link
      if (notificationData.deepLink) {
        await this.handleDeepLink(notificationData.deepLink);
      }

      // Handle action buttons
      if (response.actionIdentifier && response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
        await this.handleNotificationAction(response.actionIdentifier, notificationData);
      }

      // Track analytics
      await analytics().logEvent('notification_opened', {
        category: notificationData.category,
        action: response.actionIdentifier,
        platform: Platform.OS,
      });
    } catch (error) {
      logger.error('Failed to handle notification tap:', error);
    }
  }

  /**
   * Handle Firebase foreground message
   */
  private async handleForegroundMessage(remoteMessage: any): Promise<void> {
    try {
      const notificationData = this.convertFirebaseMessage(remoteMessage);
      
      // Show local notification
      await this.showLocalNotification(notificationData);
      
      await this.addToHistory(notificationData, false);
    } catch (error) {
      logger.error('Failed to handle foreground message:', error);
    }
  }

  /**
   * Handle Firebase background message
   */
  private async handleBackgroundMessage(remoteMessage: any): Promise<void> {
    try {
      const notificationData = this.convertFirebaseMessage(remoteMessage);
      await this.addToHistory(notificationData, false);
      
      logger.info('Background message processed:', notificationData.title);
    } catch (error) {
      logger.error('Failed to handle background message:', error);
    }
  }

  /**
   * Handle notification opened
   */
  private async handleNotificationOpened(remoteMessage: any): Promise<void> {
    try {
      const notificationData = this.convertFirebaseMessage(remoteMessage);
      await this.markAsOpened(notificationData.id);
      
      if (notificationData.deepLink) {
        await this.handleDeepLink(notificationData.deepLink);
      }
    } catch (error) {
      logger.error('Failed to handle notification opened:', error);
    }
  }

  /**
   * Show local notification
   */
  async showLocalNotification(notificationData: NotificationData): Promise<void> {
    try {
      if (!this.settings.enabled || !this.isCategoryEnabled(notificationData.category)) {
        return;
      }

      const content: Notifications.NotificationContentInput = {
        title: notificationData.title,
        body: notificationData.body,
        data: notificationData.data,
        sound: this.settings.sound ? 'default' : undefined,
        badge: this.settings.badge ? 1 : undefined,
      };

      // Add image if provided
      if (notificationData.imageUrl) {
        content.attachments = [{
          identifier: 'image',
          url: notificationData.imageUrl,
          typeHint: 'public.image',
        }];
      }

      // Add action buttons
      if (notificationData.actionButtons && notificationData.actionButtons.length > 0) {
        content.categoryIdentifier = `category_${notificationData.category}`;
        
        // Create category with actions
        await Notifications.setNotificationCategoryAsync(
          content.categoryIdentifier,
          notificationData.actionButtons.map(action => ({
            identifier: action.id,
            buttonTitle: action.title,
            options: {
              isDestructive: action.destructive,
              isAuthenticationRequired: action.authenticationRequired,
            },
          }))
        );
      }

      const trigger = notificationData.scheduledFor 
        ? { date: new Date(notificationData.scheduledFor) }
        : undefined;

      await Notifications.scheduleNotificationAsync({
        content,
        trigger,
      });

      logger.info(`Local notification scheduled: ${notificationData.title}`);
    } catch (error) {
      logger.error('Failed to show local notification:', error);
    }
  }

  /**
   * Handle deep linking
   */
  private async handleDeepLink(deepLink: string): Promise<void> {
    try {
      // This would navigate to the appropriate screen
      logger.info(`Handling deep link: ${deepLink}`);
      
      // Track deep link usage
      await analytics().logEvent('notification_deeplink', {
        url: deepLink,
        platform: Platform.OS,
      });
    } catch (error) {
      logger.error('Failed to handle deep link:', error);
    }
  }

  /**
   * Handle notification action
   */
  private async handleNotificationAction(
    actionId: string,
    notificationData: NotificationData
  ): Promise<void> {
    try {
      logger.info(`Handling notification action: ${actionId}`);
      
      // Handle specific actions
      switch (actionId) {
        case 'view_document':
          // Navigate to document view
          break;
        case 'dismiss':
          // Just dismiss
          break;
        case 'mark_read':
          // Mark as read
          break;
        default:
          logger.warn(`Unknown notification action: ${actionId}`);
      }

      // Track action usage
      await analytics().logEvent('notification_action', {
        action_id: actionId,
        category: notificationData.category,
        platform: Platform.OS,
      });
    } catch (error) {
      logger.error('Failed to handle notification action:', error);
    }
  }

  /**
   * Utility methods
   */
  private extractNotificationData(notification: Notifications.Notification): NotificationData {
    const request = notification.request;
    const content = request.content;
    
    return {
      id: request.identifier,
      title: content.title || '',
      body: content.body || '',
      data: content.data,
      category: content.data?.category || 'general',
      priority: content.data?.priority || 'normal',
      imageUrl: content.data?.imageUrl,
      deepLink: content.data?.deepLink,
    };
  }

  private convertFirebaseMessage(remoteMessage: any): NotificationData {
    return {
      id: remoteMessage.messageId || Date.now().toString(),
      title: remoteMessage.notification?.title || '',
      body: remoteMessage.notification?.body || '',
      data: remoteMessage.data,
      category: remoteMessage.data?.category || 'general',
      priority: remoteMessage.data?.priority || 'normal',
      imageUrl: remoteMessage.notification?.imageUrl || remoteMessage.data?.imageUrl,
      deepLink: remoteMessage.data?.deepLink,
    };
  }

  private isCategoryEnabled(category: string): boolean {
    return this.settings.categories[category as keyof typeof this.settings.categories] !== false;
  }

  private isInQuietHours(): boolean {
    if (!this.settings.quietHours.enabled) {
      return false;
    }

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const startTime = this.settings.quietHours.startTime;
    const endTime = this.settings.quietHours.endTime;

    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    if (startTime > endTime) {
      return currentTime >= startTime || currentTime <= endTime;
    } else {
      return currentTime >= startTime && currentTime <= endTime;
    }
  }

  /**
   * History management
   */
  private async addToHistory(notificationData: NotificationData, opened: boolean): Promise<void> {
    const historyItem: NotificationHistory = {
      id: notificationData.id,
      title: notificationData.title,
      body: notificationData.body,
      category: notificationData.category,
      receivedAt: new Date().toISOString(),
      opened,
      data: notificationData.data,
    };

    this.notificationHistory.unshift(historyItem);
    
    // Keep only last 100 notifications
    this.notificationHistory = this.notificationHistory.slice(0, 100);
    
    await this.saveNotificationHistory();
  }

  private async markAsOpened(notificationId: string): Promise<void> {
    const notification = this.notificationHistory.find(n => n.id === notificationId);
    if (notification && !notification.opened) {
      notification.opened = true;
      notification.openedAt = new Date().toISOString();
      await this.saveNotificationHistory();
    }
  }

  /**
   * Storage methods
   */
  private async loadSettings(): Promise<void> {
    try {
      const settingsString = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
      if (settingsString) {
        this.settings = { ...this.settings, ...JSON.parse(settingsString) };
      }
    } catch (error) {
      logger.error('Failed to load notification settings:', error);
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (error) {
      logger.error('Failed to save notification settings:', error);
    }
  }

  private async saveFCMToken(token: string): Promise<void> {
    try {
      await AsyncStorage.setItem(FCM_TOKEN_KEY, token);
    } catch (error) {
      logger.error('Failed to save FCM token:', error);
    }
  }

  private async loadNotificationHistory(): Promise<void> {
    try {
      const historyString = await AsyncStorage.getItem(NOTIFICATION_HISTORY_KEY);
      if (historyString) {
        this.notificationHistory = JSON.parse(historyString);
      }
    } catch (error) {
      logger.error('Failed to load notification history:', error);
    }
  }

  private async saveNotificationHistory(): Promise<void> {
    try {
      await AsyncStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify(this.notificationHistory));
    } catch (error) {
      logger.error('Failed to save notification history:', error);
    }
  }

  /**
   * Public methods
   */
  async updateSettings(newSettings: Partial<NotificationSettings>): Promise<void> {
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();
    
    // Reconfigure notifications if enabled status changed
    if (newSettings.enabled !== undefined) {
      await this.configureNotifications();
    }
  }

  getSettings(): NotificationSettings {
    return { ...this.settings };
  }

  getHistory(): NotificationHistory[] {
    return [...this.notificationHistory];
  }

  async getStats(): Promise<NotificationStats> {
    const totalReceived = this.notificationHistory.length;
    const totalOpened = this.notificationHistory.filter(n => n.opened).length;
    const openRate = totalReceived > 0 ? (totalOpened / totalReceived) * 100 : 0;

    const categoryStats: Record<string, any> = {};
    this.notificationHistory.forEach(notification => {
      if (!categoryStats[notification.category]) {
        categoryStats[notification.category] = {
          sent: 0,
          received: 0,
          opened: 0,
        };
      }
      categoryStats[notification.category].received++;
      if (notification.opened) {
        categoryStats[notification.category].opened++;
      }
    });

    return {
      totalSent: 0, // Would track from backend
      totalReceived,
      totalOpened,
      openRate,
      categoryStats,
      lastUpdated: new Date().toISOString(),
    };
  }

  getFCMToken(): string | null {
    return this.fcmToken;
  }

  async clearHistory(): Promise<void> {
    this.notificationHistory = [];
    await this.saveNotificationHistory();
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    try {
      await this.saveSettings();
      await this.saveNotificationHistory();
      
      if (this.backgroundMessageHandler) {
        this.backgroundMessageHandler();
      }

      logger.info('Push notification service cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup push notification service:', error);
    }
  }
}

export const pushNotificationService = new PushNotificationService();