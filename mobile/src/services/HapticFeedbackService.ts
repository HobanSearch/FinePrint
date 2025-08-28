/**
 * Fine Print AI - Haptic Feedback Service
 * 
 * Provides contextual haptic feedback for enhanced user experience
 * Supports both iOS and Android haptic patterns
 */

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { logger } from '../utils/logger';

export type HapticFeedbackType = 
  | 'light' 
  | 'medium' 
  | 'heavy' 
  | 'success' 
  | 'warning' 
  | 'error' 
  | 'selection'
  | 'impactLight'
  | 'impactMedium'
  | 'impactHeavy'
  | 'notificationSuccess'
  | 'notificationWarning'
  | 'notificationError';

export interface HapticPattern {
  type: HapticFeedbackType;
  delay?: number;
  repeat?: number;
  interval?: number;
}

class HapticFeedbackService {
  private static instance: HapticFeedbackService;
  private isEnabled: boolean = true;
  private lastHapticTime: number = 0;
  private readonly HAPTIC_THROTTLE_MS = 50; // Minimum time between haptics

  static getInstance(): HapticFeedbackService {
    if (!HapticFeedbackService.instance) {
      HapticFeedbackService.instance = new HapticFeedbackService();
    }
    return HapticFeedbackService.instance;
  }

  /**
   * Enable or disable haptic feedback
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    logger.info(`Haptic feedback ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if haptic feedback is enabled
   */
  isHapticEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Trigger haptic feedback
   */
  async trigger(type: HapticFeedbackType): Promise<void> {
    if (!this.isEnabled || !this.shouldTriggerHaptic()) {
      return;
    }

    try {
      this.lastHapticTime = Date.now();

      switch (type) {
        case 'light':
        case 'impactLight':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          break;

        case 'medium':
        case 'impactMedium':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          break;

        case 'heavy':
        case 'impactHeavy':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          break;

        case 'success':
        case 'notificationSuccess':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          break;

        case 'warning':
        case 'notificationWarning':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          break;

        case 'error':
        case 'notificationError':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          break;

        case 'selection':
          await Haptics.selectionAsync();
          break;

        default:
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (error) {
      logger.error('Haptic feedback error:', error);
    }
  }

  /**
   * Trigger haptic pattern (sequence of haptics)
   */
  async triggerPattern(patterns: HapticPattern[]): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    for (const pattern of patterns) {
      // Wait for delay before triggering
      if (pattern.delay) {
        await this.delay(pattern.delay);
      }

      // Trigger haptic with optional repeat
      const repeatCount = pattern.repeat || 1;
      for (let i = 0; i < repeatCount; i++) {
        await this.trigger(pattern.type);
        
        // Wait between repeats
        if (i < repeatCount - 1 && pattern.interval) {
          await this.delay(pattern.interval);
        }
      }
    }
  }

  // Contextual haptic methods for specific app interactions

  /**
   * Document scan capture feedback
   */
  async documentCaptured(): Promise<void> {
    await this.trigger('impactMedium');
  }

  /**
   * Document processing started
   */
  async processingStarted(): Promise<void> {
    await this.trigger('impactLight');
  }

  /**
   * Analysis completed feedback
   */
  async analysisCompleted(riskScore: number): Promise<void> {
    if (riskScore < 0.3) {
      // Low risk - success feedback
      await this.trigger('success');
    } else if (riskScore < 0.7) {
      // Medium risk - warning feedback
      await this.trigger('warning');
    } else {
      // High risk - error feedback with emphasis
      await this.triggerPattern([
        { type: 'error' },
        { type: 'impactHeavy', delay: 100 }
      ]);
    }
  }

  /**
   * Risk level indicator feedback
   */
  async riskLevelIndication(riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical'): Promise<void> {
    switch (riskLevel) {
      case 'safe':
        await this.trigger('success');
        break;
      case 'low':
        await this.trigger('impactLight');
        break;
      case 'medium':
        await this.trigger('warning');
        break;
      case 'high':
        await this.trigger('error');
        break;
      case 'critical':
        await this.triggerPattern([
          { type: 'error' },
          { type: 'impactHeavy', delay: 150 },
          { type: 'impactHeavy', delay: 150 }
        ]);
        break;
    }
  }

  /**
   * Button press feedback
   */
  async buttonPressed(importance: 'primary' | 'secondary' | 'tertiary' = 'secondary'): Promise<void> {
    switch (importance) {
      case 'primary':
        await this.trigger('impactMedium');
        break;
      case 'secondary':
        await this.trigger('impactLight');
        break;
      case 'tertiary':
        await this.trigger('selection');
        break;
    }
  }

  /**
   * Navigation feedback
   */
  async navigationTransition(): Promise<void> {
    await this.trigger('selection');
  }

  /**
   * Scroll/swipe feedback
   */
  async scrollBoundary(): Promise<void> {
    await this.trigger('impactLight');
  }

  /**
   * Tab selection feedback
   */
  async tabSelected(): Promise<void> {
    await this.trigger('selection');
  }

  /**
   * Toggle switch feedback
   */
  async toggleSwitch(isOn: boolean): Promise<void> {
    if (isOn) {
      await this.trigger('impactLight');
    } else {
      await this.trigger('selection');
    }
  }

  /**
   * Pull to refresh feedback
   */
  async pullToRefresh(): Promise<void> {
    await this.trigger('impactLight');
  }

  /**
   * Long press feedback
   */
  async longPress(): Promise<void> {
    await this.trigger('impactMedium');
  }

  /**
   * Deletion/destructive action feedback
   */
  async destructiveAction(): Promise<void> {
    await this.triggerPattern([
      { type: 'warning' },
      { type: 'impactMedium', delay: 100 }
    ]);
  }

  /**
   * Loading progress feedback (at intervals)
   */
  async progressTick(): Promise<void> {
    await this.trigger('selection');
  }

  /**
   * Error state feedback
   */
  async errorOccurred(severity: 'minor' | 'major' | 'critical' = 'minor'): Promise<void> {
    switch (severity) {
      case 'minor':
        await this.trigger('warning');
        break;
      case 'major':
        await this.trigger('error');
        break;
      case 'critical':
        await this.triggerPattern([
          { type: 'error' },
          { type: 'impactHeavy', delay: 200 },
          { type: 'error', delay: 200 }
        ]);
        break;
    }
  }

  /**
   * Widget interaction feedback
   */
  async widgetInteraction(): Promise<void> {
    await this.trigger('impactLight');
  }

  /**
   * Camera focus feedback
   */
  async cameraFocused(): Promise<void> {
    await this.trigger('selection');
  }

  /**
   * Document detected (auto-capture) feedback
   */
  async documentDetected(): Promise<void> {
    await this.triggerPattern([
      { type: 'impactLight' },
      { type: 'impactLight', delay: 100 }
    ]);
  }

  /**
   * Biometric authentication feedback
   */
  async biometricSuccess(): Promise<void> {
    await this.trigger('success');
  }

  async biometricFailed(): Promise<void> {
    await this.trigger('error');
  }

  /**
   * Notification received feedback
   */
  async notificationReceived(priority: 'low' | 'normal' | 'high' = 'normal'): Promise<void> {
    switch (priority) {
      case 'low':
        await this.trigger('selection');
        break;
      case 'normal':
        await this.trigger('impactLight');
        break;
      case 'high':
        await this.triggerPattern([
          { type: 'impactMedium' },
          { type: 'impactLight', delay: 150 }
        ]);
        break;
    }
  }

  // Private helper methods

  private shouldTriggerHaptic(): boolean {
    const now = Date.now();
    return (now - this.lastHapticTime) >= this.HAPTIC_THROTTLE_MS;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if device supports haptic feedback
   */
  async isSupported(): Promise<boolean> {
    try {
      // Expo Haptics automatically handles platform differences
      return Platform.OS === 'ios' || Platform.OS === 'android';
    } catch (error) {
      logger.error('Failed to check haptic support:', error);
      return false;
    }
  }

  /**
   * Get haptic capabilities
   */
  getCapabilities(): {
    supportsImpact: boolean;
    supportsNotification: boolean;
    supportsSelection: boolean;
  } {
    return {
      supportsImpact: true,
      supportsNotification: Platform.OS === 'ios',
      supportsSelection: true,
    };
  }

  /**
   * Test haptic patterns for accessibility/preferences
   */
  async testPattern(patternName: string): Promise<void> {
    const testPatterns: Record<string, HapticPattern[]> = {
      'gentle': [{ type: 'selection' }],
      'medium': [{ type: 'impactLight' }],
      'strong': [{ type: 'impactMedium' }],
      'notification': [{ type: 'success' }],
      'alert': [{ type: 'error' }],
      'rhythm': [
        { type: 'impactLight' },
        { type: 'impactLight', delay: 200 },
        { type: 'impactMedium', delay: 200 }
      ]
    };

    const pattern = testPatterns[patternName];
    if (pattern) {
      await this.triggerPattern(pattern);
    }
  }
}

export default HapticFeedbackService;