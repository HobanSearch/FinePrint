/**
 * Fine Print AI - Quick Actions Service
 * 
 * Handles 3D Touch Quick Actions (iOS) and App Shortcuts (Android)
 * for rapid access to key app features
 */

import { Platform, DeviceEventEmitter, NativeModules } from 'react-native';
import { logger } from '../utils/logger';

export interface QuickAction {
  id: string;
  title: string;
  subtitle?: string;
  icon: string;
  type: 'scan' | 'dashboard' | 'recent' | 'settings' | 'help' | 'camera';
  payload?: Record<string, any>;
}

export interface QuickActionResponse {
  screen: string;
  params?: Record<string, any>;
}

class QuickActionsService {
  private static instance: QuickActionsService;
  private listeners: Map<string, (action: QuickAction) => void> = new Map();

  static getInstance(): QuickActionsService {
    if (!QuickActionsService.instance) {
      QuickActionsService.instance = new QuickActionsService();
    }
    return QuickActionsService.instance;
  }

  constructor() {
    this.setupEventListeners();
  }

  /**
   * Initialize Quick Actions with default set
   */
  async initialize(): Promise<void> {
    try {
      const defaultActions = this.getDefaultQuickActions();
      await this.setQuickActions(defaultActions);
      
      logger.info('Quick Actions initialized with default actions');
    } catch (error) {
      logger.error('Failed to initialize Quick Actions:', error);
    }
  }

  /**
   * Set available Quick Actions
   */
  async setQuickActions(actions: QuickAction[]): Promise<void> {
    if (Platform.OS === 'ios') {
      await this.setIOSQuickActions(actions);
    } else if (Platform.OS === 'android') {
      await this.setAndroidShortcuts(actions);
    }
  }

  /**
   * Handle Quick Action selection
   */
  handleQuickAction(action: QuickAction): QuickActionResponse {
    logger.info(`Quick Action selected: ${action.type} - ${action.title}`);

    switch (action.type) {
      case 'scan':
        return { screen: 'DocumentScanner' };
      
      case 'camera':
        return { screen: 'CameraCapture' };
      
      case 'dashboard':
        return { screen: 'Dashboard' };
      
      case 'recent':
        return { screen: 'RecentDocuments' };
      
      case 'settings':
        return { screen: 'Settings' };
      
      case 'help':
        return { screen: 'Help' };
      
      default:
        return { screen: 'Dashboard' };
    }
  }

  /**
   * Update Quick Actions based on user behavior
   */
  async updateDynamicActions(recentDocuments: any[], userPreferences: any): Promise<void> {
    try {
      const dynamicActions = this.generateDynamicActions(recentDocuments, userPreferences);
      await this.setQuickActions(dynamicActions);
      
      logger.info('Updated Quick Actions with dynamic content');
    } catch (error) {
      logger.error('Failed to update dynamic Quick Actions:', error);
    }
  }

  /**
   * Add event listener for Quick Action selection
   */
  addEventListener(id: string, callback: (action: QuickAction) => void): void {
    this.listeners.set(id, callback);
  }

  /**
   * Remove event listener
   */
  removeEventListener(id: string): void {
    this.listeners.delete(id);
  }

  /**
   * Check if Quick Actions are supported
   */
  isSupported(): boolean {
    if (Platform.OS === 'ios') {
      return NativeModules.QuickActionsManager !== undefined;
    } else if (Platform.OS === 'android') {
      return NativeModules.AndroidShortcutsManager !== undefined;
    }
    return false;
  }

  // Private methods

  private setupEventListeners(): void {
    if (Platform.OS === 'ios') {
      DeviceEventEmitter.addListener('quickActionShortcut', (data) => {
        const action: QuickAction = {
          id: data.type,
          title: data.title || '',
          type: data.type as QuickAction['type'],
          icon: data.type,
          payload: data.userInfo,
        };
        
        this.notifyListeners(action);
      });
    } else if (Platform.OS === 'android') {
      DeviceEventEmitter.addListener('androidShortcut', (data) => {
        const action: QuickAction = {
          id: data.action,
          title: data.shortLabel || '',
          type: data.action as QuickAction['type'],
          icon: data.iconResourceName || data.action,
          payload: data.extras,
        };
        
        this.notifyListeners(action);
      });
    }
  }

  private notifyListeners(action: QuickAction): void {
    this.listeners.forEach(callback => {
      try {
        callback(action);
      } catch (error) {
        logger.error('Quick Action listener error:', error);
      }
    });
  }

  private async setIOSQuickActions(actions: QuickAction[]): Promise<void> {
    if (!NativeModules.QuickActionsManager) {
      return;
    }

    try {
      const iosActions = actions.map(action => ({
        type: action.id,
        title: action.title,
        subtitle: action.subtitle,
        icon: this.getIOSIconName(action.icon),
        userInfo: action.payload || {},
      }));

      await NativeModules.QuickActionsManager.setShortcutItems(iosActions);
    } catch (error) {
      logger.error('Failed to set iOS Quick Actions:', error);
    }
  }

  private async setAndroidShortcuts(actions: QuickAction[]): Promise<void> {
    if (!NativeModules.AndroidShortcutsManager) {
      return;
    }

    try {
      const androidShortcuts = actions.map(action => ({
        id: action.id,
        shortLabel: action.title,
        longLabel: action.subtitle || action.title,
        iconResourceName: this.getAndroidIconName(action.icon),
        action: action.type,
        extras: action.payload || {},
      }));

      await NativeModules.AndroidShortcutsManager.setDynamicShortcuts(androidShortcuts);
    } catch (error) {
      logger.error('Failed to set Android Shortcuts:', error);
    }
  }

  private getDefaultQuickActions(): QuickAction[] {
    return [
      {
        id: 'scan_document',
        title: 'Scan Document',
        subtitle: 'Capture and analyze',
        icon: 'camera',
        type: 'scan',
      },
      {
        id: 'view_dashboard',
        title: 'Dashboard',
        subtitle: 'View your analyses',
        icon: 'dashboard',
        type: 'dashboard',
      },
      {
        id: 'recent_documents',
        title: 'Recent Documents',
        subtitle: 'Access recent scans',
        icon: 'recent',
        type: 'recent',
      },
      {
        id: 'camera_capture',
        title: 'Quick Capture',
        subtitle: 'Camera shortcuts',
        icon: 'camera_alt',
        type: 'camera',
      },
    ];
  }

  private generateDynamicActions(recentDocuments: any[], userPreferences: any): QuickAction[] {
    const baseActions = this.getDefaultQuickActions();
    
    // Add most recent document if available
    if (recentDocuments.length > 0) {
      const recent = recentDocuments[0];
      baseActions.push({
        id: `recent_${recent.id}`,
        title: recent.name,
        subtitle: `Risk: ${Math.round(recent.riskScore * 100)}%`,
        icon: 'document',
        type: 'recent',
        payload: { documentId: recent.id },
      });
    }

    // Add high-risk documents shortcut if user has any
    const highRiskDocs = recentDocuments.filter(doc => doc.riskScore > 0.7);
    if (highRiskDocs.length > 0) {
      baseActions.push({
        id: 'high_risk_documents',
        title: 'High Risk Documents',
        subtitle: `${highRiskDocs.length} documents need attention`,
        icon: 'warning',
        type: 'recent',
        payload: { filter: 'high-risk' },
      });
    }

    // Limit to 4 actions (iOS limitation)
    return baseActions.slice(0, 4);
  }

  private getIOSIconName(icon: string): string {
    const iconMap: Record<string, string> = {
      'camera': 'UIApplicationShortcutIconTypeCapture',
      'dashboard': 'UIApplicationShortcutIconTypeHome',
      'recent': 'UIApplicationShortcutIconTypeTask',
      'settings': 'UIApplicationShortcutIconTypeSettings',
      'help': 'UIApplicationShortcutIconTypeHelp',
      'document': 'UIApplicationShortcutIconTypeCompose',
      'warning': 'UIApplicationShortcutIconTypeAlarm',
      'camera_alt': 'UIApplicationShortcutIconTypeCapture',
    };

    return iconMap[icon] || 'UIApplicationShortcutIconTypeGeneric';
  }

  private getAndroidIconName(icon: string): string {
    const iconMap: Record<string, string> = {
      'camera': 'ic_camera_alt',
      'dashboard': 'ic_dashboard',
      'recent': 'ic_history',
      'settings': 'ic_settings',
      'help': 'ic_help',
      'document': 'ic_description',
      'warning': 'ic_warning',
      'camera_alt': 'ic_photo_camera',
    };

    return iconMap[icon] || 'ic_shortcut_default';
  }

  /**
   * Clear all dynamic shortcuts
   */
  async clearDynamicActions(): Promise<void> {
    if (Platform.OS === 'android' && NativeModules.AndroidShortcutsManager) {
      try {
        await NativeModules.AndroidShortcutsManager.removeAllDynamicShortcuts();
        logger.info('Cleared all dynamic shortcuts');
      } catch (error) {
        logger.error('Failed to clear dynamic shortcuts:', error);
      }
    }
  }

  /**
   * Add pinned shortcut (Android only)
   */
  async addPinnedShortcut(action: QuickAction): Promise<boolean> {
    if (Platform.OS !== 'android' || !NativeModules.AndroidShortcutsManager) {
      return false;
    }

    try {
      const shortcut = {
        id: action.id,
        shortLabel: action.title,
        longLabel: action.subtitle || action.title,
        iconResourceName: this.getAndroidIconName(action.icon),
        action: action.type,
        extras: action.payload || {},
      };

      return await NativeModules.AndroidShortcutsManager.requestPinShortcut(shortcut);
    } catch (error) {
      logger.error('Failed to add pinned shortcut:', error);
      return false;
    }
  }

  /**
   * Update badge count for Quick Actions (iOS)
   */
  async updateBadgeCount(count: number): Promise<void> {
    if (Platform.OS === 'ios' && NativeModules.QuickActionsManager) {
      try {
        await NativeModules.QuickActionsManager.setApplicationIconBadgeNumber(count);
      } catch (error) {
        logger.error('Failed to update badge count:', error);
      }
    }
  }
}

export default QuickActionsService;