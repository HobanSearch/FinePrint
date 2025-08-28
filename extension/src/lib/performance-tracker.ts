/**
 * Fine Print AI - Extension Performance Tracker
 * 
 * Comprehensive performance tracking for browser extensions including:
 * - Content script injection performance
 * - Background script memory usage
 * - Page load impact measurement
 * - Document analysis performance
 * - Extension-specific metrics
 * - Cross-browser compatibility tracking
 */

import { PerformanceMetric, ExtensionPerformanceMetric } from '@fineprintai/shared-types';
import { storage } from './storage';

interface ExtensionPerformanceConfig {
  enabled: boolean;
  sampleRate: number;
  bufferSize: number;
  flushInterval: number;
  enableContentScriptTracking: boolean;
  enableBackgroundTracking: boolean;
  enablePageImpactTracking: boolean;
  enableAnalysisTracking: boolean;
  enableMemoryTracking: boolean;
}

class ExtensionPerformanceTracker {
  private config: ExtensionPerformanceConfig;
  private metricsBuffer: PerformanceMetric[] = [];
  private flushTimer?: NodeJS.Timeout;
  private memoryTimer?: NodeJS.Timeout;
  private userId?: string;
  private sessionId: string;
  private isInitialized = false;
  private contentScriptStartTime?: number;
  private pageLoadStartTime?: number;
  private analysisStartTimes: Map<string, number> = new Map();

  constructor(config: Partial<ExtensionPerformanceConfig> = {}) {
    this.config = {
      enabled: true,
      sampleRate: 1.0,
      bufferSize: 30,
      flushInterval: 30000, // 30 seconds
      enableContentScriptTracking: true,
      enableBackgroundTracking: true,
      enablePageImpactTracking: true,
      enableAnalysisTracking: true,
      enableMemoryTracking: true,
      ...config
    };

    this.sessionId = this.generateSessionId();
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (!this.config.enabled || this.isInitialized) return;

    try {
      // Load user ID from storage
      const storedUserId = await storage.get('userId');
      if (storedUserId) {
        this.userId = storedUserId;
      }

      // Initialize content script tracking
      if (this.config.enableContentScriptTracking) {
        this.initializeContentScriptTracking();
      }

      // Initialize background script tracking
      if (this.config.enableBackgroundTracking && this.isBackgroundScript()) {
        this.initializeBackgroundTracking();
      }

      // Initialize page impact tracking
      if (this.config.enablePageImpactTracking && this.isContentScript()) {
        this.initializePageImpactTracking();
      }

      // Initialize analysis tracking
      if (this.config.enableAnalysisTracking) {
        this.initializeAnalysisTracking();
      }

      // Initialize memory tracking
      if (this.config.enableMemoryTracking) {
        this.startMemoryTracking();
      }

      // Start periodic flushing
      this.startPeriodicFlush();

      this.isInitialized = true;
      console.log('Extension Performance Tracker initialized');
    } catch (error) {
      console.error('Failed to initialize Extension Performance Tracker:', error);
    }
  }

  setUserId(userId: string): void {
    this.userId = userId;
    storage.set('userId', userId);
  }

  private initializeContentScriptTracking(): void {
    if (!this.isContentScript()) return;

    // Track content script injection time
    this.contentScriptStartTime = performance.now();
    
    // Track when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.trackContentScriptInjection();
      });
    } else {
      this.trackContentScriptInjection();
    }

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      this.addToBuffer({
        id: this.generateId(),
        userId: this.userId || 'anonymous',
        platform: 'extension',
        metricType: 'page_visibility_change',
        value: document.hidden ? 0 : 1,
        timestamp: new Date(),
        context: {
          url: window.location.href,
          visibility: document.hidden ? 'hidden' : 'visible',
          sessionId: this.sessionId
        }
      });
    });
  }

  private initializeBackgroundTracking(): void {
    if (!this.isBackgroundScript()) return;

    // Track background script startup
    this.addToBuffer({
      id: this.generateId(),
      userId: this.userId || 'anonymous',
      platform: 'extension',
      metricType: 'background_script_startup',
      value: performance.now(),
      timestamp: new Date(),
      context: {
        browser: this.getBrowserInfo().name,
        version: this.getBrowserInfo().version,
        sessionId: this.sessionId
      }
    });

    // Track extension events
    this.trackExtensionEvents();
  }

  private initializePageImpactTracking(): void {
    if (!this.isContentScript()) return;

    this.pageLoadStartTime = performance.now();

    // Track page load impact
    window.addEventListener('load', () => {
      if (this.pageLoadStartTime) {
        const pageLoadTime = performance.now() - this.pageLoadStartTime;
        
        this.addToBuffer({
          id: this.generateId(),
          userId: this.userId || 'anonymous',
          platform: 'extension',
          metricType: 'page_load_impact',
          value: pageLoadTime,
          timestamp: new Date(),
          context: {
            url: window.location.href,
            pageSize: this.getPageSize(),
            resourcesCount: performance.getEntriesByType('resource').length,
            sessionId: this.sessionId
          }
        });
      }
    });

    // Track DOM manipulation impact
    this.trackDOMImpact();
  }

  private initializeAnalysisTracking(): void {
    // Listen for analysis start/end events
    if (this.isContentScript()) {
      window.addEventListener('fineprintAnalysisStart', ((event: CustomEvent) => {
        const analysisId = event.detail.analysisId;
        this.analysisStartTimes.set(analysisId, performance.now());
      }) as EventListener);

      window.addEventListener('fineprintAnalysisEnd', ((event: CustomEvent) => {
        const analysisId = event.detail.analysisId;
        const startTime = this.analysisStartTimes.get(analysisId);
        
        if (startTime) {
          const analysisTime = performance.now() - startTime;
          this.trackAnalysisPerformance(analysisId, analysisTime, event.detail);
          this.analysisStartTimes.delete(analysisId);
        }
      }) as EventListener);
    }
  }

  private startMemoryTracking(): void {
    this.memoryTimer = setInterval(async () => {
      try {
        const memoryInfo = await this.getMemoryInfo();
        
        this.addToBuffer({
          id: this.generateId(),
          userId: this.userId || 'anonymous',
          platform: 'extension',
          metricType: this.isBackgroundScript() ? 'background_memory' : 'content_memory',
          value: memoryInfo.usedJSHeapSize,
          timestamp: new Date(),
          context: {
            totalJSHeapSize: memoryInfo.totalJSHeapSize,
            jsHeapSizeLimit: memoryInfo.jsHeapSizeLimit,
            tabsCount: await this.getTabsCount(),
            sessionId: this.sessionId
          }
        });
      } catch (error) {
        console.error('Failed to track memory usage:', error);
      }
    }, 30000); // Every 30 seconds
  }

  private trackContentScriptInjection(): void {
    if (!this.contentScriptStartTime) return;

    const injectionTime = performance.now() - this.contentScriptStartTime;
    
    this.addToBuffer({
      id: this.generateId(),
      userId: this.userId || 'anonymous',
      platform: 'extension',
      metricType: 'content_script_injection',
      value: injectionTime,
      timestamp: new Date(),
      context: {
        url: window.location.href,
        browser: this.getBrowserInfo().name,
        version: this.getBrowserInfo().version,
        domReady: document.readyState,
        sessionId: this.sessionId
      }
    });
  }

  private trackAnalysisPerformance(analysisId: string, duration: number, details: any): void {
    this.addToBuffer({
      id: this.generateId(),
      userId: this.userId || 'anonymous',
      platform: 'extension',
      metricType: 'analysis_time',
      value: duration,
      timestamp: new Date(),
      context: {
        analysisId,
        documentType: details.documentType,
        documentSize: details.documentSize,
        patternsFound: details.patternsFound,
        riskScore: details.riskScore,
        url: window.location.href,
        sessionId: this.sessionId
      }
    });
  }

  private trackExtensionEvents(): void {
    if (!chrome.runtime) return;

    // Track extension install/update
    chrome.runtime.onInstalled.addListener((details) => {
      this.addToBuffer({
        id: this.generateId(),
        userId: this.userId || 'anonymous',
        platform: 'extension',
        metricType: 'extension_event',
        value: 1,
        timestamp: new Date(),
        context: {
          reason: details.reason,
          previousVersion: details.previousVersion,
          sessionId: this.sessionId
        }
      });
    });

    // Track tab events
    if (chrome.tabs && chrome.tabs.onCreated) {
      chrome.tabs.onCreated.addListener(() => {
        this.addToBuffer({
          id: this.generateId(),
          userId: this.userId || 'anonymous',
          platform: 'extension',
          metricType: 'tab_created',
          value: 1,
          timestamp: new Date(),
          context: { sessionId: this.sessionId }
        });
      });
    }
  }

  private trackDOMImpact(): void {
    let mutationCount = 0;
    const startTime = performance.now();

    const observer = new MutationObserver((mutations) => {
      mutationCount += mutations.length;
      
      // Report every 100 mutations or after 5 seconds
      if (mutationCount >= 100 || performance.now() - startTime > 5000) {
        this.addToBuffer({
          id: this.generateId(),
          userId: this.userId || 'anonymous',
          platform: 'extension',
          metricType: 'dom_mutations',
          value: mutationCount,
          timestamp: new Date(),
          context: {
            timeSpan: performance.now() - startTime,
            url: window.location.href,
            sessionId: this.sessionId
          }
        });
        
        mutationCount = 0;
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });

    // Disconnect observer after 30 seconds
    setTimeout(() => observer.disconnect(), 30000);
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
      // Send metrics to analytics service
      await fetch(`${this.getAPIBaseURL()}/api/v1/analytics/performance/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': await this.getAuthToken()
        },
        body: JSON.stringify({
          metrics,
          platform: 'extension',
          sessionId: this.sessionId
        })
      });
      
      console.debug(`Flushed ${metrics.length} extension performance metrics`);
    } catch (error) {
      console.error('Failed to flush performance metrics:', error);
      // Re-add metrics to buffer for retry
      this.metricsBuffer.unshift(...metrics);
    }
  }

  // Utility methods
  private isContentScript(): boolean {
    return typeof window !== 'undefined' && window.location;
  }

  private isBackgroundScript(): boolean {
    return typeof chrome !== 'undefined' && chrome.runtime && !this.isContentScript();
  }

  private getBrowserInfo(): { name: string; version: string } {
    const userAgent = navigator.userAgent;
    
    if (userAgent.includes('Chrome')) {
      const match = userAgent.match(/Chrome\/(\d+)/);
      return { name: 'chrome', version: match ? match[1] : 'unknown' };
    } else if (userAgent.includes('Firefox')) {
      const match = userAgent.match(/Firefox\/(\d+)/);
      return { name: 'firefox', version: match ? match[1] : 'unknown' };
    } else if (userAgent.includes('Safari')) {
      const match = userAgent.match(/Version\/(\d+)/);
      return { name: 'safari', version: match ? match[1] : 'unknown' };
    } else if (userAgent.includes('Edge')) {
      const match = userAgent.match(/Edge\/(\d+)/);
      return { name: 'edge', version: match ? match[1] : 'unknown' };
    } else {
      return { name: 'unknown', version: 'unknown' };
    }
  }

  private getPageSize(): number {
    try {
      return document.documentElement.outerHTML.length;
    } catch {
      return 0;
    }
  }

  private async getMemoryInfo(): Promise<any> {
    if ('memory' in performance) {
      return (performance as any).memory;
    }
    return {
      usedJSHeapSize: 0,
      totalJSHeapSize: 0,
      jsHeapSizeLimit: 0
    };
  }

  private async getTabsCount(): Promise<number> {
    try {
      if (chrome.tabs && chrome.tabs.query) {
        return new Promise((resolve) => {
          chrome.tabs.query({}, (tabs) => {
            resolve(tabs.length);
          });
        });
      }
    } catch {
      // Ignore errors
    }
    return 0;
  }

  private async getAuthToken(): Promise<string> {
    try {
      const token = await storage.get('authToken');
      return token ? `Bearer ${token}` : '';
    } catch {
      return '';
    }
  }

  private getAPIBaseURL(): string {
    return process.env.API_BASE_URL || 'https://api.fineprintai.com';
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
      platform: 'extension',
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
   * Track popup performance
   */
  trackPopupPerformance(renderTime: number, context?: any): void {
    this.addToBuffer({
      id: this.generateId(),
      userId: this.userId || 'anonymous',
      platform: 'extension',
      metricType: 'popup_render_time',
      value: renderTime,
      timestamp: new Date(),
      context: {
        ...context,
        sessionId: this.sessionId
      }
    });
  }

  /**
   * Track options page performance
   */
  trackOptionsPerformance(renderTime: number, context?: any): void {
    this.addToBuffer({
      id: this.generateId(),
      userId: this.userId || 'anonymous',
      platform: 'extension',
      metricType: 'options_render_time',
      value: renderTime,
      timestamp: new Date(),
      context: {
        ...context,
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
        const duration = performance.now() - startTime;
        this.trackCustomMetric('action_duration', duration, { actionName });
      }
    };
  }

  /**
   * Track extension performance metrics
   */
  async trackExtensionPerformance(): Promise<void> {
    try {
      const browserInfo = this.getBrowserInfo();
      const memoryInfo = await this.getMemoryInfo();
      const tabsCount = await this.getTabsCount();

      const extensionMetric: ExtensionPerformanceMetric = {
        browser: browserInfo.name as any,
        version: browserInfo.version,
        url: this.isContentScript() ? window.location.href : 'background',
        contentScriptInjectionTime: 0, // Will be set by content script tracking
        backgroundScriptMemory: memoryInfo.usedJSHeapSize,
        pageLoadImpact: 0, // Will be set by page impact tracking
        analysisTime: 0, // Will be set by analysis tracking
        documentType: 'unknown',
        documentSize: this.isContentScript() ? this.getPageSize() : 0,
        activeTabsCount: tabsCount,
        pageSize: this.isContentScript() ? this.getPageSize() : 0
      };

      // This would be called from the appropriate tracking methods
      // Just showing the structure here
    } catch (error) {
      console.error('Failed to track extension performance:', error);
    }
  }

  /**
   * Get current performance summary
   */
  async getPerformanceSummary(): Promise<any> {
    try {
      const browserInfo = this.getBrowserInfo();
      const memoryInfo = await this.getMemoryInfo();
      const tabsCount = await this.getTabsCount();

      return {
        browser: browserInfo,
        memory: {
          used: memoryInfo.usedJSHeapSize,
          total: memoryInfo.totalJSHeapSize,
          limit: memoryInfo.jsHeapSizeLimit
        },
        tabs: {
          count: tabsCount
        },
        page: this.isContentScript() ? {
          url: window.location.href,
          size: this.getPageSize()
        } : null,
        session: {
          id: this.sessionId,
          metricsBuffered: this.metricsBuffer.length
        }
      };
    } catch (error) {
      console.error('Failed to get performance summary:', error);
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

    this.isInitialized = false;
  }
}

// Export singleton instance
export const extensionPerformanceTracker = new ExtensionPerformanceTracker();
export { ExtensionPerformanceTracker };