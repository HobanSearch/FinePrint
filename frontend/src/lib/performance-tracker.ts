/**
 * Fine Print AI - Web Performance Tracker
 * 
 * Comprehensive performance tracking for the web application including:
 * - Core Web Vitals monitoring
 * - Bundle size and loading performance
 * - User interaction performance
 * - Memory usage tracking
 * - Network performance monitoring
 * - Error tracking and reporting
 */

import { analyticsLogger } from './utils';
import { apiClient } from './api-client';
import { WebVitalsMetric, PerformanceMetric } from '@fineprintai/shared-types';

interface PerformanceConfig {
  enabled: boolean;
  sampleRate: number;
  bufferSize: number;
  flushInterval: number;
  enableWebVitals: boolean;
  enableResourceTiming: boolean;
  enableNavigationTiming: boolean;
  enableMemoryTracking: boolean;
  enableErrorTracking: boolean;
}

class WebPerformanceTracker {
  private config: PerformanceConfig;
  private metricsBuffer: PerformanceMetric[] = [];
  private observer?: PerformanceObserver;
  private flushTimer?: NodeJS.Timeout;
  private userId?: string;
  private sessionId: string;
  private isInitialized = false;

  constructor(config: Partial<PerformanceConfig> = {}) {
    this.config = {
      enabled: true,
      sampleRate: 1.0,
      bufferSize: 100,
      flushInterval: 30000, // 30 seconds
      enableWebVitals: true,
      enableResourceTiming: true,
      enableNavigationTiming: true,
      enableMemoryTracking: true,
      enableErrorTracking: true,
      ...config
    };

    this.sessionId = crypto.randomUUID();
    this.initialize();
  }

  private initialize(): void {
    if (!this.config.enabled || this.isInitialized) return;

    try {
      // Initialize Web Vitals tracking
      if (this.config.enableWebVitals) {
        this.initializeWebVitals();
      }

      // Initialize Resource Timing tracking
      if (this.config.enableResourceTiming) {
        this.initializeResourceTiming();
      }

      // Initialize Navigation Timing tracking
      if (this.config.enableNavigationTiming) {
        this.initializeNavigationTiming();
      }

      // Initialize Memory tracking
      if (this.config.enableMemoryTracking) {
        this.initializeMemoryTracking();
      }

      // Initialize Error tracking
      if (this.config.enableErrorTracking) {
        this.initializeErrorTracking();
      }

      // Start periodic flushing
      this.startPeriodicFlush();

      // Track page visibility changes
      this.initializeVisibilityTracking();

      // Track user interactions
      this.initializeInteractionTracking();

      this.isInitialized = true;
      console.log('Web Performance Tracker initialized');
    } catch (error) {
      console.error('Failed to initialize Web Performance Tracker:', error);
    }
  }

  setUserId(userId: string): void {
    this.userId = userId;
  }

  private initializeWebVitals(): void {
    // Track Core Web Vitals using the web-vitals library approach
    if ('PerformanceObserver' in window) {
      // First Contentful Paint (FCP)
      this.observePerformanceEntry('paint', (entries) => {
        for (const entry of entries) {
          if (entry.name === 'first-contentful-paint') {
            this.trackWebVital('FCP', entry.startTime, window.location.href);
          }
        }
      });

      // Largest Contentful Paint (LCP)
      this.observePerformanceEntry('largest-contentful-paint', (entries) => {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          this.trackWebVital('LCP', lastEntry.startTime, window.location.href);
        }
      });

      // First Input Delay (FID)
      this.observePerformanceEntry('first-input', (entries) => {
        for (const entry of entries) {
          const fid = entry.processingStart - entry.startTime;
          this.trackWebVital('FID', fid, window.location.href);
        }
      });

      // Cumulative Layout Shift (CLS)
      let clsValue = 0;
      this.observePerformanceEntry('layout-shift', (entries) => {
        for (const entry of entries) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
          }
        }
        this.trackWebVital('CLS', clsValue, window.location.href);
      });

      // Time to Interactive (TTI) - Estimated
      this.estimateTimeToInteractive();
    }
  }

  private observePerformanceEntry(
    type: string, 
    callback: (entries: PerformanceEntry[]) => void
  ): void {
    try {
      const observer = new PerformanceObserver((list) => {
        callback(list.getEntries());
      });
      observer.observe({ type, buffered: true });
    } catch (error) {
      console.warn(`Failed to observe ${type} performance entries:`, error);
    }
  }

  private trackWebVital(name: WebVitalsMetric['name'], value: number, url: string): void {
    if (Math.random() > this.config.sampleRate) return;

    const metric: WebVitalsMetric = {
      name,
      value,
      url,
      userAgent: navigator.userAgent,
      connection: this.getConnectionInfo(),
      deviceType: this.getDeviceType(),
      viewportSize: `${window.innerWidth}x${window.innerHeight}`
    };

    this.addToBuffer({
      id: crypto.randomUUID(),
      userId: this.userId || 'anonymous',
      platform: 'web',
      metricType: name.toLowerCase(),
      value,
      timestamp: new Date(),
      context: {
        url,
        userAgent: navigator.userAgent,
        connection: metric.connection,
        deviceType: metric.deviceType,
        viewportSize: metric.viewportSize,
        sessionId: this.sessionId
      }
    });
  }

  private initializeResourceTiming(): void {
    // Track resource loading performance
    this.observePerformanceEntry('resource', (entries) => {
      for (const entry of entries) {
        const resourceEntry = entry as PerformanceResourceTiming;
        
        // Track slow resources
        if (resourceEntry.duration > 1000) { // > 1 second
          this.addToBuffer({
            id: crypto.randomUUID(),
            userId: this.userId || 'anonymous',
            platform: 'web',
            metricType: 'slow_resource',
            value: resourceEntry.duration,
            timestamp: new Date(),
            context: {
              resourceName: resourceEntry.name,
              resourceType: this.getResourceType(resourceEntry.name),
              transferSize: resourceEntry.transferSize,
              sessionId: this.sessionId
            }
          });
        }

        // Track resource cache performance
        if (resourceEntry.transferSize === 0 && resourceEntry.decodedBodySize > 0) {
          this.addToBuffer({
            id: crypto.randomUUID(),
            userId: this.userId || 'anonymous',
            platform: 'web',
            metricType: 'cached_resource',
            value: resourceEntry.duration,
            timestamp: new Date(),
            context: {
              resourceName: resourceEntry.name,
              resourceType: this.getResourceType(resourceEntry.name),
              sessionId: this.sessionId
            }
          });
        }
      }
    });
  }

  private initializeNavigationTiming(): void {
    // Track navigation performance
    window.addEventListener('load', () => {
      setTimeout(() => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (navigation) {
          // DNS Lookup Time
          this.addToBuffer({
            id: crypto.randomUUID(),
            userId: this.userId || 'anonymous',
            platform: 'web',
            metricType: 'dns_lookup_time',
            value: navigation.domainLookupEnd - navigation.domainLookupStart,
            timestamp: new Date(),
            context: { sessionId: this.sessionId }
          });

          // Connection Time
          this.addToBuffer({
            id: crypto.randomUUID(),
            userId: this.userId || 'anonymous',
            platform: 'web',
            metricType: 'connection_time',
            value: navigation.connectEnd - navigation.connectStart,
            timestamp: new Date(),
            context: { sessionId: this.sessionId }
          });

          // Server Response Time
          this.addToBuffer({
            id: crypto.randomUUID(),
            userId: this.userId || 'anonymous',
            platform: 'web',
            metricType: 'server_response_time',
            value: navigation.responseStart - navigation.requestStart,
            timestamp: new Date(),
            context: { sessionId: this.sessionId }
          });

          // DOM Content Loaded
          this.addToBuffer({
            id: crypto.randomUUID(),
            userId: this.userId || 'anonymous',
            platform: 'web',
            metricType: 'dom_content_loaded',
            value: navigation.domContentLoadedEventEnd - navigation.navigationStart,
            timestamp: new Date(),
            context: { sessionId: this.sessionId }
          });

          // Full Page Load
          this.addToBuffer({
            id: crypto.randomUUID(),
            userId: this.userId || 'anonymous',
            platform: 'web',
            metricType: 'page_load_time',
            value: navigation.loadEventEnd - navigation.navigationStart,
            timestamp: new Date(),
            context: { sessionId: this.sessionId }
          });
        }
      }, 0);
    });
  }

  private initializeMemoryTracking(): void {
    if ('memory' in performance) {
      const trackMemory = () => {
        const memory = (performance as any).memory;
        
        this.addToBuffer({
          id: crypto.randomUUID(),
          userId: this.userId || 'anonymous',
          platform: 'web',
          metricType: 'memory_usage',
          value: memory.usedJSHeapSize,
          timestamp: new Date(),
          context: {
            totalJSHeapSize: memory.totalJSHeapSize,
            jsHeapSizeLimit: memory.jsHeapSizeLimit,
            sessionId: this.sessionId
          }
        });
      };

      // Track memory every 30 seconds
      setInterval(trackMemory, 30000);
      
      // Track memory on page visibility change
      document.addEventListener('visibilitychange', trackMemory);
    }
  }

  private initializeErrorTracking(): void {
    // Track JavaScript errors
    window.addEventListener('error', (event) => {
      this.addToBuffer({
        id: crypto.randomUUID(),
        userId: this.userId || 'anonymous',
        platform: 'web',
        metricType: 'javascript_error',
        value: 1,
        timestamp: new Date(),
        context: {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
          sessionId: this.sessionId
        }
      });
    });

    // Track unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.addToBuffer({
        id: crypto.randomUUID(),
        userId: this.userId || 'anonymous',
        platform: 'web',
        metricType: 'unhandled_rejection',
        value: 1,
        timestamp: new Date(),
        context: {
          reason: event.reason?.toString(),
          stack: event.reason?.stack,
          sessionId: this.sessionId
        }
      });
    });
  }

  private initializeVisibilityTracking(): void {
    let visibilityStart = Date.now();
    
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Page became hidden
        const visibleTime = Date.now() - visibilityStart;
        this.addToBuffer({
          id: crypto.randomUUID(),
          userId: this.userId || 'anonymous',
          platform: 'web',
          metricType: 'page_visible_time',
          value: visibleTime,
          timestamp: new Date(),
          context: { sessionId: this.sessionId }
        });
      } else {
        // Page became visible
        visibilityStart = Date.now();
      }
    });

    // Track page unload
    window.addEventListener('beforeunload', () => {
      const visibleTime = Date.now() - visibilityStart;
      this.addToBuffer({
        id: crypto.randomUUID(),
        userId: this.userId || 'anonymous',
        platform: 'web',
        metricType: 'session_duration',
        value: visibleTime,
        timestamp: new Date(),
        context: { sessionId: this.sessionId }
      });
      
      // Flush remaining metrics
      this.flush();
    });
  }

  private initializeInteractionTracking(): void {
    // Track click responsiveness
    document.addEventListener('click', (event) => {
      const startTime = performance.now();
      
      requestAnimationFrame(() => {
        const responseTime = performance.now() - startTime;
        
        if (responseTime > 100) { // > 100ms is considered slow
          this.addToBuffer({
            id: crypto.randomUUID(),
            userId: this.userId || 'anonymous',
            platform: 'web',
            metricType: 'slow_interaction',
            value: responseTime,
            timestamp: new Date(),
            context: {
              elementType: (event.target as Element)?.tagName,
              elementId: (event.target as Element)?.id,
              sessionId: this.sessionId
            }
          });
        }
      });
    });

    // Track scroll performance
    let scrollStartTime = 0;
    let isScrolling = false;
    
    window.addEventListener('scroll', () => {
      if (!isScrolling) {
        scrollStartTime = performance.now();
        isScrolling = true;
      }
    }, { passive: true });

    window.addEventListener('scrollend', () => {
      if (isScrolling) {
        const scrollDuration = performance.now() - scrollStartTime;
        this.addToBuffer({
          id: crypto.randomUUID(),
          userId: this.userId || 'anonymous',
          platform: 'web',
          metricType: 'scroll_performance',
          value: scrollDuration,
          timestamp: new Date(),
          context: { sessionId: this.sessionId }
        });
        isScrolling = false;
      }
    });
  }

  private estimateTimeToInteractive(): void {
    // Simplified TTI estimation based on network activity and long tasks
    window.addEventListener('load', () => {
      setTimeout(() => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const longTasks = performance.getEntriesByType('longtask');
        
        // Estimate TTI as DOMContentLoaded + last long task
        let tti = navigation.domContentLoadedEventEnd;
        
        if (longTasks.length > 0) {
          const lastLongTask = longTasks[longTasks.length - 1];
          tti = Math.max(tti, lastLongTask.startTime + lastLongTask.duration);
        }

        this.trackWebVital('TTI', tti - navigation.navigationStart, window.location.href);
      }, 10000); // Wait 10 seconds to collect long tasks
    });
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
        platform: 'web',
        sessionId: this.sessionId
      });
      
      analyticsLogger.debug(`Flushed ${metrics.length} performance metrics`);
    } catch (error) {
      console.error('Failed to flush performance metrics:', error);
      // Re-add metrics to buffer for retry
      this.metricsBuffer.unshift(...metrics);
    }
  }

  // Utility methods
  private getConnectionInfo(): string {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      return `${connection.effectiveType || 'unknown'}-${connection.downlink || 'unknown'}mbps`;
    }
    return 'unknown';
  }

  private getDeviceType(): string {
    const userAgent = navigator.userAgent;
    if (/tablet|ipad|playbook|silk/i.test(userAgent)) {
      return 'tablet';
    }
    if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(userAgent)) {
      return 'mobile';
    }
    return 'desktop';
  }

  private getResourceType(url: string): string {
    const extension = url.split('.').pop()?.toLowerCase() || '';
    
    if (['js', 'jsx', 'ts', 'tsx'].includes(extension)) return 'javascript';
    if (['css', 'scss', 'sass', 'less'].includes(extension)) return 'stylesheet';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension)) return 'image';
    if (['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(extension)) return 'font';
    if (['mp4', 'webm', 'ogg', 'avi', 'mov'].includes(extension)) return 'video';
    if (['mp3', 'wav', 'ogg', 'aac'].includes(extension)) return 'audio';
    if (url.includes('/api/')) return 'api';
    
    return 'other';
  }

  /**
   * Track custom performance metric
   */
  trackCustomMetric(metricType: string, value: number, context?: any): void {
    this.addToBuffer({
      id: crypto.randomUUID(),
      userId: this.userId || 'anonymous',
      platform: 'web',
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
   * Track feature performance
   */
  trackFeaturePerformance(featureName: string, startTime: number, endTime?: number): void {
    const duration = (endTime || performance.now()) - startTime;
    
    this.addToBuffer({
      id: crypto.randomUUID(),
      userId: this.userId || 'anonymous',
      platform: 'web',
      metricType: 'feature_performance',
      value: duration,
      timestamp: new Date(),
      context: {
        featureName,
        sessionId: this.sessionId
      }
    });
  }

  /**
   * Start tracking a user action
   */
  startTracking(actionName: string): { end: () => void } {
    const startTime = performance.now();
    
    return {
      end: () => {
        this.trackFeaturePerformance(actionName, startTime);
      }
    };
  }

  /**
   * Get current performance summary
   */
  getPerformanceSummary(): any {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const memory = (performance as any).memory;
    
    return {
      navigation: navigation ? {
        dnsLookup: navigation.domainLookupEnd - navigation.domainLookupStart,
        connection: navigation.connectEnd - navigation.connectStart,
        serverResponse: navigation.responseStart - navigation.requestStart,
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.navigationStart,
        pageLoad: navigation.loadEventEnd - navigation.navigationStart
      } : null,
      memory: memory ? {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit
      } : null,
      connection: this.getConnectionInfo(),
      deviceType: this.getDeviceType()
    };
  }

  /**
   * Destroy the tracker
   */
  destroy(): void {
    this.flush();
    
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    if (this.observer) {
      this.observer.disconnect();
    }

    this.isInitialized = false;
  }
}

// Export singleton instance
export const webPerformanceTracker = new WebPerformanceTracker();
export { WebPerformanceTracker };