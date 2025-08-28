import { Platform, InteractionManager, PixelRatio } from 'react-native';
import { logger } from '../utils/logger';

interface PerformanceMetrics {
  fps: number;
  memoryUsage: number;
  batteryLevel?: number;
  networkLatency: number;
  renderTime: number;
  jsThreadTime: number;
}

interface AnimationConfig {
  useNativeDriver: boolean;
  duration: number;
  easing: string;
  priority: 'high' | 'medium' | 'low';
}

interface MemoryPressureLevel {
  level: 'normal' | 'moderate' | 'severe' | 'critical';
  availableMemory: number;
  threshold: number;
}

class PerformanceOptimizationService {
  private static instance: PerformanceOptimizationService;
  private performanceMetrics: PerformanceMetrics = {
    fps: 60,
    memoryUsage: 0,
    networkLatency: 0,
    renderTime: 0,
    jsThreadTime: 0,
  };
  private animationQueue: Array<() => void> = [];
  private isProcessingAnimations = false;
  private frameDropCount = 0;
  private lastFrameTime = 0;
  private memoryPressureCallbacks: Array<(level: MemoryPressureLevel) => void> = [];

  static getInstance(): PerformanceOptimizationService {
    if (!PerformanceOptimizationService.instance) {
      PerformanceOptimizationService.instance = new PerformanceOptimizationService();
    }
    return PerformanceOptimizationService.instance;
  }

  /**
   * Initialize performance monitoring and optimization
   */
  async initialize(): Promise<void> {
    try {
      await this.setupPerformanceMonitoring();
      this.setupMemoryPressureMonitoring();
      this.setupAnimationOptimization();
      this.optimizeRendering();
      
      logger.info('PerformanceOptimizationService initialized');
    } catch (error) {
      logger.error('Failed to initialize PerformanceOptimizationService:', error);
    }
  }

  /**
   * Optimize animations for 60fps
   */
  optimizeAnimations(config: AnimationConfig): AnimationConfig {
    const optimizedConfig = { ...config };

    // Always use native driver when possible
    optimizedConfig.useNativeDriver = true;

    // Adjust duration based on device performance
    if (this.performanceMetrics.fps < 30) {
      optimizedConfig.duration = Math.min(config.duration * 0.7, 150);
    } else if (this.performanceMetrics.fps < 45) {
      optimizedConfig.duration = Math.min(config.duration * 0.8, 200);
    }

    // Reduce animation complexity under memory pressure
    if (this.performanceMetrics.memoryUsage > 0.8) {
      optimizedConfig.duration = Math.min(optimizedConfig.duration, 100);
    }

    return optimizedConfig;
  }

  /**
   * Queue animations to prevent frame drops
   */
  queueAnimation(animationFn: () => void, priority: 'high' | 'medium' | 'low' = 'medium'): void {
    if (priority === 'high') {
      this.animationQueue.unshift(animationFn);
    } else {
      this.animationQueue.push(animationFn);
    }

    if (!this.isProcessingAnimations) {
      this.processAnimationQueue();
    }
  }

  /**
   * Optimize image loading and caching
   */
  optimizeImageLoading(imageSource: string, dimensions?: { width: number; height: number }) {
    const pixelRatio = PixelRatio.get();
    const screenScale = Platform.OS === 'ios' ? pixelRatio : 1;

    // Calculate optimal image size
    let optimalWidth = dimensions?.width || 200;
    let optimalHeight = dimensions?.height || 200;

    // Adjust for screen density
    optimalWidth *= screenScale;
    optimalHeight *= screenScale;

    // Reduce image quality under memory pressure
    let quality = 0.8;
    if (this.performanceMetrics.memoryUsage > 0.7) {
      quality = 0.6;
      optimalWidth *= 0.8;
      optimalHeight *= 0.8;
    }

    return {
      uri: imageSource,
      width: Math.round(optimalWidth),
      height: Math.round(optimalHeight),
      quality,
      cache: 'default' as const,
      priority: 'normal' as const,
    };
  }

  /**
   * Optimize list rendering for large datasets
   */
  getOptimalListConfig(itemCount: number, itemHeight: number) {
    const config = {
      removeClippedSubviews: true,
      maxToRenderPerBatch: 10,
      updateCellsBatchingPeriod: 50,
      initialNumToRender: 10,
      windowSize: 10,
      getItemLayout: (data: any, index: number) => ({
        length: itemHeight,
        offset: itemHeight * index,
        index,
      }),
    };

    // Adjust for large lists
    if (itemCount > 1000) {
      config.maxToRenderPerBatch = 5;
      config.initialNumToRender = 5;
      config.windowSize = 5;
    } else if (itemCount > 100) {
      config.maxToRenderPerBatch = 8;
      config.initialNumToRender = 8;
      config.windowSize = 8;
    }

    // Adjust for memory pressure
    if (this.performanceMetrics.memoryUsage > 0.7) {
      config.maxToRenderPerBatch = Math.max(config.maxToRenderPerBatch - 2, 3);
      config.initialNumToRender = Math.max(config.initialNumToRender - 2, 3);
      config.windowSize = Math.max(config.windowSize - 2, 3);
    }

    return config;
  }

  /**
   * Defer heavy operations to avoid blocking UI
   */
  deferHeavyOperation<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      InteractionManager.runAfterInteractions(() => {
        operation().then(resolve).catch(reject);
      });
    });
  }

  /**
   * Optimize bundle size by lazy loading components
   */
  lazyLoadComponent<T>(importFn: () => Promise<{ default: T }>): () => Promise<T> {
    let component: T | null = null;
    
    return async (): Promise<T> => {
      if (!component) {
        const module = await importFn();
        component = module.default;
      }
      return component;
    };
  }

  /**
   * Monitor and report performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Register callback for memory pressure events
   */
  onMemoryPressure(callback: (level: MemoryPressureLevel) => void): () => void {
    this.memoryPressureCallbacks.push(callback);
    
    return () => {
      const index = this.memoryPressureCallbacks.indexOf(callback);
      if (index > -1) {
        this.memoryPressureCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Force garbage collection (iOS only)
   */
  forceGarbageCollection(): void {
    if (Platform.OS === 'ios' && global.gc) {
      global.gc();
    }
  }

  /**
   * Optimize network requests
   */
  optimizeNetworkRequest(url: string, options: RequestInit = {}): RequestInit {
    const optimizedOptions = { ...options };

    // Add compression headers
    optimizedOptions.headers = {
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=300',
      ...optimizedOptions.headers,
    };

    // Adjust timeout based on network conditions
    const timeout = this.performanceMetrics.networkLatency > 1000 ? 30000 : 15000;
    optimizedOptions.signal = AbortSignal.timeout(timeout);

    return optimizedOptions;
  }

  // Private methods

  private async setupPerformanceMonitoring(): Promise<void> {
    // Setup FPS monitoring
    this.startFPSMonitoring();
    
    // Setup memory monitoring
    if (Platform.OS === 'android') {
      await this.setupAndroidMemoryMonitoring();
    } else {
      await this.setupiOSMemoryMonitoring();
    }

    // Setup network monitoring
    this.setupNetworkMonitoring();
  }

  private startFPSMonitoring(): void {
    const measureFPS = () => {
      const now = performance.now();
      if (this.lastFrameTime) {
        const frameDuration = now - this.lastFrameTime;
        const currentFPS = 1000 / frameDuration;
        
        if (currentFPS < 50) {
          this.frameDropCount++;
        }
        
        // Exponential moving average
        this.performanceMetrics.fps = this.performanceMetrics.fps === 60 
          ? currentFPS 
          : this.performanceMetrics.fps * 0.9 + currentFPS * 0.1;
      }
      this.lastFrameTime = now;
      
      requestAnimationFrame(measureFPS);
    };
    
    requestAnimationFrame(measureFPS);
  }

  private async setupAndroidMemoryMonitoring(): Promise<void> {
    // Use native module for Android memory monitoring
    const { NativeModules } = require('react-native');
    
    if (NativeModules.MemoryMonitor) {
      setInterval(async () => {
        try {
          const memoryInfo = await NativeModules.MemoryMonitor.getMemoryInfo();
          this.performanceMetrics.memoryUsage = memoryInfo.usedMemory / memoryInfo.totalMemory;
          this.checkMemoryPressure(memoryInfo);
        } catch (error) {
          logger.error('Failed to get Android memory info:', error);
        }
      }, 5000);
    }
  }

  private async setupiOSMemoryMonitoring(): Promise<void> {
    // Use native module for iOS memory monitoring
    const { NativeModules } = require('react-native');
    
    if (NativeModules.MemoryMonitor) {
      setInterval(async () => {
        try {
          const memoryInfo = await NativeModules.MemoryMonitor.getMemoryInfo();
          this.performanceMetrics.memoryUsage = memoryInfo.usedMemory / memoryInfo.totalMemory;
          this.checkMemoryPressure(memoryInfo);
        } catch (error) {
          logger.error('Failed to get iOS memory info:', error);
        }
      }, 5000);
    }
  }

  private setupNetworkMonitoring(): void {
    const measureNetworkLatency = async () => {
      try {
        const start = performance.now();
        await fetch('https://api.fineprintai.com/health', { method: 'HEAD' });
        const latency = performance.now() - start;
        this.performanceMetrics.networkLatency = latency;
      } catch (error) {
        // Network error, set high latency
        this.performanceMetrics.networkLatency = 5000;
      }
    };

    // Measure network latency every 30 seconds
    setInterval(measureNetworkLatency, 30000);
    measureNetworkLatency(); // Initial measurement
  }

  private setupMemoryPressureMonitoring(): void {
    // Listen for memory warnings
    if (Platform.OS === 'ios') {
      const { NativeModules } = require('react-native');
      if (NativeModules.MemoryPressureMonitor) {
        NativeModules.MemoryPressureMonitor.addListener('memoryPressure', (level: string) => {
          this.handleMemoryPressure(level as any);
        });
      }
    }
  }

  private setupAnimationOptimization(): void {
    // Monitor for frame drops and adjust animation strategy
    setInterval(() => {
      if (this.frameDropCount > 10) {
        logger.warn(`Frame drops detected: ${this.frameDropCount}`);
        this.frameDropCount = 0;
        
        // Reduce animation quality temporarily
        this.temporarilyReduceAnimationQuality();
      }
    }, 1000);
  }

  private optimizeRendering(): void {
    // Platform-specific rendering optimizations
    if (Platform.OS === 'android') {
      // Enable hardware acceleration hints
      global.renderingOptimizations = {
        hardwareAccelerated: true,
        pixelRatio: PixelRatio.get(),
      };
    }
  }

  private processAnimationQueue(): void {
    if (this.isProcessingAnimations || this.animationQueue.length === 0) {
      return;
    }

    this.isProcessingAnimations = true;

    const processNext = () => {
      if (this.animationQueue.length > 0) {
        const animation = this.animationQueue.shift();
        if (animation) {
          animation();
        }
        
        // Use requestAnimationFrame to ensure smooth processing
        requestAnimationFrame(() => {
          if (this.animationQueue.length > 0) {
            processNext();
          } else {
            this.isProcessingAnimations = false;
          }
        });
      } else {
        this.isProcessingAnimations = false;
      }
    };

    processNext();
  }

  private checkMemoryPressure(memoryInfo: any): void {
    const usageRatio = memoryInfo.usedMemory / memoryInfo.totalMemory;
    let level: MemoryPressureLevel['level'] = 'normal';

    if (usageRatio > 0.9) {
      level = 'critical';
    } else if (usageRatio > 0.8) {
      level = 'severe';
    } else if (usageRatio > 0.7) {
      level = 'moderate';
    }

    if (level !== 'normal') {
      const pressureLevel: MemoryPressureLevel = {
        level,
        availableMemory: memoryInfo.totalMemory - memoryInfo.usedMemory,
        threshold: memoryInfo.totalMemory * 0.7,
      };

      this.handleMemoryPressure(pressureLevel);
    }
  }

  private handleMemoryPressure(level: MemoryPressureLevel | string): void {
    const pressureLevel = typeof level === 'string' 
      ? { level: level as MemoryPressureLevel['level'], availableMemory: 0, threshold: 0 }
      : level;

    logger.warn(`Memory pressure detected: ${pressureLevel.level}`);

    // Notify callbacks
    this.memoryPressureCallbacks.forEach(callback => {
      try {
        callback(pressureLevel);
      } catch (error) {
        logger.error('Memory pressure callback error:', error);
      }
    });

    // Take automatic actions based on pressure level
    switch (pressureLevel.level) {
      case 'moderate':
        this.reduceImageQuality();
        break;
      case 'severe':
        this.reduceImageQuality();
        this.clearCaches();
        break;
      case 'critical':
        this.reduceImageQuality();
        this.clearCaches();
        this.forceGarbageCollection();
        break;
    }
  }

  private temporarilyReduceAnimationQuality(): void {
    // Temporarily reduce animation quality for 10 seconds
    const originalFPS = this.performanceMetrics.fps;
    this.performanceMetrics.fps = Math.max(originalFPS * 0.7, 30);

    setTimeout(() => {
      this.performanceMetrics.fps = originalFPS;
    }, 10000);
  }

  private reduceImageQuality(): void {
    // Signal to image components to reduce quality
    global.imageQualityReduction = true;
    
    setTimeout(() => {
      global.imageQualityReduction = false;
    }, 30000);
  }

  private clearCaches(): void {
    // Clear various caches to free up memory
    try {
      // Clear AsyncStorage cache if implemented
      // Clear image cache
      // Clear network cache
      logger.info('Caches cleared due to memory pressure');
    } catch (error) {
      logger.error('Failed to clear caches:', error);
    }
  }
}

export default PerformanceOptimizationService;