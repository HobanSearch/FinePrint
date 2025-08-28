/**
 * Fine Print AI - Mobile Performance Tracker
 * 
 * Comprehensive performance tracking for React Native applications including:
 * - App startup time monitoring
 * - Memory usage tracking
 * - Battery drain monitoring
 * - Frame drop detection
 * - Network performance tracking
 * - Crash and error reporting
 * - Native performance metrics
 */

import { Platform, DeviceInfo } from 'react-native';
import { PerformanceMetric, MobilePerformanceMetric } from '@fineprintai/shared-types';
import { apiClient } from '../api';
import { logger } from '../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import DeviceInfo from 'react-native-device-info';
import { getBatteryLevel, getBatteryState } from 'react-native-device-info';

interface MobilePerformanceConfig {
  enabled: boolean;
  sampleRate: number;
  bufferSize: number;
  flushInterval: number;
  enableAppStartTracking: boolean;
  enableMemoryTracking: boolean;
  enableBatteryTracking: boolean;
  enableFrameTracking: boolean;
  enableNetworkTracking: boolean;
  enableCrashTracking: boolean;
}

class MobilePerformanceTracker {
  private config: MobilePerformanceConfig;
  private metricsBuffer: PerformanceMetric[] = [];
  private flushTimer?: NodeJS.Timeout;
  private memoryTimer?: NodeJS.Timeout;
  private batteryTimer?: NodeJS.Timeout;
  private userId?: string;
  private sessionId: string;
  private appStartTime: number;
  private isInitialized = false;
  private frameDropCount = 0;
  private totalFrames = 0;
  private lastFrameTime = 0;

  constructor(config: Partial<MobilePerformanceConfig> = {}) {
    this.config = {
      enabled: true,
      sampleRate: 1.0,
      bufferSize: 50,
      flushInterval: 30000, // 30 seconds
      enableAppStartTracking: true,
      enableMemoryTracking: true,
      enableBatteryTracking: true,
      enableFrameTracking: true,
      enableNetworkTracking: true,
      enableCrashTracking: true,
      ...config
    };

    this.sessionId = this.generateSessionId();
    this.appStartTime = Date.now();
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (!this.config.enabled || this.isInitialized) return;

    try {
      // Track app start time
      if (this.config.enableAppStartTracking) {
        this.trackAppStartTime();
      }

      // Initialize memory tracking
      if (this.config.enableMemoryTracking) {
        this.startMemoryTracking();
      }

      // Initialize battery tracking
      if (this.config.enableBatteryTracking) {
        this.startBatteryTracking();
      }

      // Initialize frame tracking
      if (this.config.enableFrameTracking) {
        this.startFrameTracking();
      }

      // Initialize network tracking
      if (this.config.enableNetworkTracking) {
        this.startNetworkTracking();
      }

      // Initialize crash tracking
      if (this.config.enableCrashTracking) {
        this.startCrashTracking();
      }

      // Start periodic flushing
      this.startPeriodicFlush();

      // Track app state changes
      this.trackAppStateChanges();

      this.isInitialized = true;
      logger.info('Mobile Performance Tracker initialized');
    } catch (error) {
      logger.error('Failed to initialize Mobile Performance Tracker:', error);
    }
  }

  setUserId(userId: string): void {
    this.userId = userId;
  }

  private async trackAppStartTime(): Promise<void> {
    try {
      // Get stored app start time from native side if available
      const storedStartTime = await AsyncStorage.getItem('app_start_time');
      const actualStartTime = storedStartTime ? parseInt(storedStartTime) : this.appStartTime;
      const currentTime = Date.now();
      const startupDuration = currentTime - actualStartTime;

      const deviceInfo = await this.getDeviceInfo();
      
      const mobileMetric: MobilePerformanceMetric = {
        platform: Platform.OS as 'ios' | 'android',
        osVersion: deviceInfo.systemVersion,
        deviceModel: deviceInfo.model,
        appStartTime: startupDuration,
        memoryUsage: 0, // Will be filled by memory tracking
        availableMemory: 0,
        totalMemory: deviceInfo.totalMemory,
        batteryLevel: await getBatteryLevel(),
        batteryDrain: 0,
        isCharging: (await getBatteryState()) === 'charging',
        frameDropRate: 0,
        screen: `${deviceInfo.screenWidth}x${deviceInfo.screenHeight}`
      };

      await this.trackMobilePerformance(mobileMetric);

      // Clean up stored start time
      await AsyncStorage.removeItem('app_start_time');
    } catch (error) {
      logger.error('Failed to track app start time:', error);
    }
  }

  private startMemoryTracking(): void {
    this.memoryTimer = setInterval(async () => {
      try {
        const memoryInfo = await this.getMemoryInfo();
        
        this.addToBuffer({
          id: this.generateId(),
          userId: this.userId || 'anonymous',
          platform: 'mobile',
          metricType: 'memory_usage',
          value: memoryInfo.usedMemory,
          timestamp: new Date(),
          context: {
            availableMemory: memoryInfo.availableMemory,
            totalMemory: memoryInfo.totalMemory,
            memoryPressure: memoryInfo.memoryPressure,
            platform: Platform.OS,
            sessionId: this.sessionId
          }
        });

        // Alert on high memory usage
        if (memoryInfo.memoryPressure && memoryInfo.memoryPressure > 0.8) {
          this.addToBuffer({
            id: this.generateId(),
            userId: this.userId || 'anonymous',
            platform: 'mobile',
            metricType: 'memory_warning',
            value: memoryInfo.memoryPressure,
            timestamp: new Date(),
            context: {
              usedMemory: memoryInfo.usedMemory,
              availableMemory: memoryInfo.availableMemory,
              sessionId: this.sessionId
            }
          });
        }
      } catch (error) {
        logger.error('Failed to track memory usage:', error);
      }
    }, 10000); // Every 10 seconds
  }

  private startBatteryTracking(): void {
    let lastBatteryLevel: number;
    
    this.batteryTimer = setInterval(async () => {
      try {
        const currentBatteryLevel = await getBatteryLevel();
        const batteryState = await getBatteryState();
        
        if (lastBatteryLevel !== undefined && batteryState !== 'charging') {
          const batteryDrain = lastBatteryLevel - currentBatteryLevel;
          
          if (batteryDrain > 0) {
            this.addToBuffer({
              id: this.generateId(),
              userId: this.userId || 'anonymous',
              platform: 'mobile',
              metricType: 'battery_drain',
              value: batteryDrain,
              timestamp: new Date(),
              context: {
                batteryLevel: currentBatteryLevel,
                batteryState,
                timeInterval: 30, // 30 seconds
                sessionId: this.sessionId
              }
            });
          }
        }
        
        lastBatteryLevel = currentBatteryLevel;

        // Track battery state changes
        this.addToBuffer({
          id: this.generateId(),
          userId: this.userId || 'anonymous',
          platform: 'mobile',
          metricType: 'battery_level',
          value: currentBatteryLevel,
          timestamp: new Date(),
          context: {
            batteryState,
            isCharging: batteryState === 'charging',
            sessionId: this.sessionId
          }
        });
      } catch (error) {
        logger.error('Failed to track battery:', error);
      }
    }, 30000); // Every 30 seconds
  }

  private startFrameTracking(): void {
    // Use InteractionManager to track frame drops
    const { InteractionManager } = require('react-native');
    
    const trackFrame = () => {
      const frameTime = Date.now();
      
      if (this.lastFrameTime > 0) {
        const frameDelta = frameTime - this.lastFrameTime;
        const expectedFrameTime = 1000 / 60; // 60 FPS
        
        if (frameDelta > expectedFrameTime * 1.5) {
          this.frameDropCount++;
        }
        
        this.totalFrames++;
      }
      
      this.lastFrameTime = frameTime;
      
      // Report frame drop rate every 5 seconds
      if (this.totalFrames % 300 === 0 && this.totalFrames > 0) {
        const frameDropRate = (this.frameDropCount / this.totalFrames) * 100;
        
        this.addToBuffer({
          id: this.generateId(),
          userId: this.userId || 'anonymous',
          platform: 'mobile',
          metricType: 'frame_drop_rate',
          value: frameDropRate,
          timestamp: new Date(),
          context: {
            totalFrames: this.totalFrames,
            droppedFrames: this.frameDropCount,
            sessionId: this.sessionId
          }
        });
        
        // Reset counters
        this.frameDropCount = 0;
        this.totalFrames = 0;
      }
      
      // Continue tracking
      InteractionManager.runAfterInteractions(trackFrame);
    };
    
    InteractionManager.runAfterInteractions(trackFrame);
  }

  private startNetworkTracking(): void {
    // Track network state changes
    const unsubscribe = NetInfo.addEventListener(state => {
      this.addToBuffer({
        id: this.generateId(),
        userId: this.userId || 'anonymous',
        platform: 'mobile',
        metricType: 'network_change',
        value: state.isConnected ? 1 : 0,
        timestamp: new Date(),
        context: {
          type: state.type,
          isConnected: state.isConnected,
          isInternetReachable: state.isInternetReachable,
          details: state.details,
          sessionId: this.sessionId
        }
      });
    });

    // Store unsubscribe function for cleanup
    (this as any).networkUnsubscribe = unsubscribe;
  }

  private startCrashTracking(): void {
    // Track JavaScript errors
    const originalConsoleError = console.error;
    console.error = (...args) => {
      this.addToBuffer({
        id: this.generateId(),
        userId: this.userId || 'anonymous',
        platform: 'mobile',
        metricType: 'javascript_error',
        value: 1,
        timestamp: new Date(),
        context: {
          error: args.join(' '),
          platform: Platform.OS,
          sessionId: this.sessionId
        }
      });
      
      originalConsoleError.apply(console, args);
    };

    // Track unhandled promise rejections
    const originalUnhandledRejection = global.Promise.prototype.catch;
    // Note: This is a simplified approach. In production, use proper crash reporting tools
  }

  private trackAppStateChanges(): void {
    const { AppState } = require('react-native');
    let appStateStartTime = Date.now();
    
    AppState.addEventListener('change', (nextAppState: string) => {
      const now = Date.now();
      const duration = now - appStateStartTime;
      
      this.addToBuffer({
        id: this.generateId(),
        userId: this.userId || 'anonymous',
        platform: 'mobile',
        metricType: 'app_state_change',
        value: duration,
        timestamp: new Date(),
        context: {
          nextAppState,
          duration,
          sessionId: this.sessionId
        }
      });
      
      appStateStartTime = now;
    });
  }

  private async trackMobilePerformance(metrics: MobilePerformanceMetric): Promise<void> {
    if (Math.random() > this.config.sampleRate) return;

    const performanceMetrics: PerformanceMetric[] = [
      {
        id: this.generateId(),
        userId: this.userId || 'anonymous',
        platform: 'mobile',
        metricType: 'app_start_time',
        value: metrics.appStartTime,
        timestamp: new Date(),
        context: {
          platform: metrics.platform,
          osVersion: metrics.osVersion,
          deviceModel: metrics.deviceModel,
          sessionId: this.sessionId
        }
      }
    ];

    for (const metric of performanceMetrics) {
      this.addToBuffer(metric);
    }
  }

  private addToBuffer(metric: PerformanceMetric): void {
    this.metricsBuffer.push(metric);
    
    if (this.metricsBuffer.length >= this.config.bufferSize) {
      this.flush();
    }
  }

  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval);
  }

  private async flush(): Promise<void> {
    if (this.metricsBuffer.length === 0) return;

    const metrics = [...this.metricsBuffer];
    this.metricsBuffer = [];

    try {
      await apiClient.post('/api/v1/analytics/performance/batch', {
        metrics,
        platform: 'mobile',
        sessionId: this.sessionId
      });
      
      logger.debug(`Flushed ${metrics.length} mobile performance metrics`);
    } catch (error) {
      logger.error('Failed to flush performance metrics:', error);
      // Re-add metrics to buffer for retry
      this.metricsBuffer.unshift(...metrics);
    }
  }

  // Utility methods
  private async getDeviceInfo(): Promise<any> {
    return {
      model: await DeviceInfo.getModel(),
      systemVersion: await DeviceInfo.getSystemVersion(),
      totalMemory: await DeviceInfo.getTotalMemory(),
      screenWidth: await DeviceInfo.getDeviceWidth(),
      screenHeight: await DeviceInfo.getDeviceHeight(),
      brand: await DeviceInfo.getBrand(),
      manufacturer: await DeviceInfo.getManufacturer()
    };
  }

  private async getMemoryInfo(): Promise<any> {
    try {
      const totalMemory = await DeviceInfo.getTotalMemory();
      const usedMemory = await DeviceInfo.getUsedMemory();
      const availableMemory = totalMemory - usedMemory;
      const memoryPressure = usedMemory / totalMemory;

      return {
        totalMemory,
        usedMemory,
        availableMemory,
        memoryPressure
      };
    } catch (error) {
      logger.error('Failed to get memory info:', error);
      return {
        totalMemory: 0,
        usedMemory: 0,
        availableMemory: 0,
        memoryPressure: 0
      };
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private generateSessionId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Track custom performance metric
   */
  trackCustomMetric(metricType: string, value: number, context?: any): void {
    this.addToBuffer({
      id: this.generateId(),
      userId: this.userId || 'anonymous',
      platform: 'mobile',
      metricType,
      value,
      timestamp: new Date(),
      context: {
        ...context,
        sessionId: this.sessionId
      }
    });
  }

  /**
   * Track screen performance
   */
  trackScreenPerformance(screenName: string, renderTime: number, context?: any): void {
    this.addToBuffer({
      id: this.generateId(),
      userId: this.userId || 'anonymous',
      platform: 'mobile',
      metricType: 'screen_render_time',
      value: renderTime,
      timestamp: new Date(),
      context: {
        screenName,
        ...context,
        sessionId: this.sessionId
      }
    });
  }

  /**
   * Track animation performance
   */
  trackAnimationPerformance(animationName: string, duration: number, fps?: number): void {
    this.addToBuffer({
      id: this.generateId(),
      userId: this.userId || 'anonymous',
      platform: 'mobile',
      metricType: 'animation_performance',
      value: duration,
      timestamp: new Date(),
      context: {
        animationName,
        fps,
        sessionId: this.sessionId
      }
    });
  }

  /**
   * Track API performance
   */
  trackAPIPerformance(endpoint: string, duration: number, status: number, size: number): void {
    this.addToBuffer({
      id: this.generateId(),
      userId: this.userId || 'anonymous',
      platform: 'mobile',
      metricType: 'api_performance',
      value: duration,
      timestamp: new Date(),
      context: {
        endpoint,
        status,
        responseSize: size,
        sessionId: this.sessionId
      }
    });
  }

  /**
   * Start tracking a user action
   */
  startTracking(actionName: string): { end: () => void } {
    const startTime = Date.now();
    
    return {
      end: () => {
        const duration = Date.now() - startTime;
        this.trackCustomMetric('user_action_duration', duration, { actionName });
      }
    };
  }

  /**
   * Get current performance summary
   */
  async getPerformanceSummary(): Promise<any> {
    try {
      const deviceInfo = await this.getDeviceInfo();
      const memoryInfo = await this.getMemoryInfo();
      const batteryLevel = await getBatteryLevel();
      const networkState = await NetInfo.fetch();

      return {
        device: {
          model: deviceInfo.model,
          osVersion: deviceInfo.systemVersion,
          totalMemory: deviceInfo.totalMemory,
          brand: deviceInfo.brand
        },
        memory: {
          used: memoryInfo.usedMemory,
          available: memoryInfo.availableMemory,
          total: memoryInfo.totalMemory,
          pressure: memoryInfo.memoryPressure
        },
        battery: {
          level: batteryLevel,
          state: await getBatteryState()
        },
        network: {
          type: networkState.type,
          isConnected: networkState.isConnected,
          isInternetReachable: networkState.isInternetReachable
        },
        performance: {
          frameDropRate: this.totalFrames > 0 ? (this.frameDropCount / this.totalFrames) * 100 : 0,
          totalFrames: this.totalFrames,
          sessionId: this.sessionId
        }
      };
    } catch (error) {
      logger.error('Failed to get performance summary:', error);
      return null;
    }
  }

  /**
   * Destroy the tracker
   */
  destroy(): void {
    this.flush();
    
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    if (this.memoryTimer) {
      clearInterval(this.memoryTimer);
    }
    
    if (this.batteryTimer) {
      clearInterval(this.batteryTimer);
    }

    if ((this as any).networkUnsubscribe) {
      (this as any).networkUnsubscribe();
    }

    this.isInitialized = false;
  }
}

// Export singleton instance
export const mobilePerformanceTracker = new MobilePerformanceTracker();
export { MobilePerformanceTracker };