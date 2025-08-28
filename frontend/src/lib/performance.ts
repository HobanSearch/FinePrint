/**
 * Performance Optimization Utilities for Fine Print AI
 * Handles lazy loading, code splitting, image optimization, and Core Web Vitals
 */

import { lazy, ComponentType, LazyExoticComponent } from 'react'

// Performance metrics interface
export interface PerformanceMetrics {
  LCP: number | null // Largest Contentful Paint
  FID: number | null // First Input Delay
  CLS: number | null // Cumulative Layout Shift
  FCP: number | null // First Contentful Paint
  TTFB: number | null // Time to First Byte
  loadTime: number
  domContentLoaded: number
  resourceLoadTime: Record<string, number>
}

// Resource loading priorities
export type LoadPriority = 'high' | 'low' | 'auto'

// Lazy loading configuration
interface LazyLoadConfig {
  threshold?: number
  rootMargin?: string
  preload?: boolean
  priority?: LoadPriority
}

/**
 * Enhanced lazy loading with preloading and priority hints
 */
export function createLazyComponent<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  config: LazyLoadConfig = {}
): LazyExoticComponent<T> {
  const { preload = false, priority = 'auto' } = config
  
  const LazyComponent = lazy(importFn)
  
  // Add preloading capability
  if (preload) {
    // Preload after a short delay
    setTimeout(() => {
      importFn().catch(console.error)
    }, 100)
  }
  
  // Add resource hints for high priority components
  if (priority === 'high' && typeof document !== 'undefined') {
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'script'
    document.head.appendChild(link)
  }
  
  return LazyComponent
}

/**
 * Intersection Observer for lazy loading with enhanced options
 */
export class LazyLoadObserver {
  private observer: IntersectionObserver
  private loadedElements = new Set<Element>()
  
  constructor(config: LazyLoadConfig = {}) {
    const { threshold = 0.1, rootMargin = '50px' } = config
    
    this.observer = new IntersectionObserver(
      this.handleIntersection.bind(this),
      { threshold, rootMargin }
    )
  }
  
  private handleIntersection(entries: IntersectionObserverEntry[]) {
    entries.forEach(entry => {
      if (entry.isIntersecting && !this.loadedElements.has(entry.target)) {
        this.loadElement(entry.target)
        this.loadedElements.add(entry.target)
        this.observer.unobserve(entry.target)
      }
    })
  }
  
  private loadElement(element: Element) {
    if (element instanceof HTMLImageElement) {
      this.loadImage(element)
    } else if (element instanceof HTMLIFrameElement) {
      this.loadIframe(element)
    } else {
      // Generic lazy loading
      const src = element.getAttribute('data-src')
      if (src) {
        element.setAttribute('src', src)
        element.removeAttribute('data-src')
      }
    }
  }
  
  private loadImage(img: HTMLImageElement) {
    const src = img.getAttribute('data-src')
    const srcset = img.getAttribute('data-srcset')
    
    if (src) {
      // Create a new image to preload
      const imageLoader = new Image()
      
      imageLoader.onload = () => {
        img.src = src
        if (srcset) img.srcset = srcset
        img.classList.remove('lazy-loading')
        img.classList.add('lazy-loaded')
        
        // Trigger custom event
        img.dispatchEvent(new CustomEvent('lazyloaded'))
      }
      
      imageLoader.onerror = () => {
        img.classList.add('lazy-error')
      }
      
      img.classList.add('lazy-loading')
      imageLoader.src = src
    }
  }
  
  private loadIframe(iframe: HTMLIFrameElement) {
    const src = iframe.getAttribute('data-src')
    if (src) {
      iframe.src = src
      iframe.removeAttribute('data-src')
    }
  }
  
  observe(element: Element) {
    this.observer.observe(element)
  }
  
  unobserve(element: Element) {
    this.observer.unobserve(element)
    this.loadedElements.delete(element)
  }
  
  disconnect() {
    this.observer.disconnect()
    this.loadedElements.clear()
  }
}

/**
 * Image optimization utilities
 */
export class ImageOptimizer {
  private static supportedFormats: string[] = []
  
  static async initialize() {
    this.supportedFormats = await this.detectSupportedFormats()
  }
  
  private static async detectSupportedFormats(): Promise<string[]> {
    const formats = ['webp', 'avif', 'jpeg', 'png']
    const supported: string[] = []
    
    for (const format of formats) {
      if (await this.canUseFormat(format)) {
        supported.push(format)
      }
    }
    
    return supported
  }
  
  private static canUseFormat(format: string): Promise<boolean> {
    return new Promise(resolve => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      
      const dataURL = canvas.toDataURL(`image/${format}`)
      const img = new Image()
      
      img.onload = () => resolve(true)
      img.onerror = () => resolve(false)
      img.src = dataURL
    })
  }
  
  static getOptimalSrc(baseSrc: string, options: {
    width?: number
    height?: number
    quality?: number
    format?: string
  } = {}): string {
    const { width, height, quality = 80, format } = options
    
    // Use the best supported format
    const optimalFormat = format || this.supportedFormats[0] || 'jpeg'
    
    // Build optimized URL (this would integrate with your image service)
    const params = new URLSearchParams()
    if (width) params.set('w', width.toString())
    if (height) params.set('h', height.toString())
    params.set('q', quality.toString())
    params.set('f', optimalFormat)
    
    return `${baseSrc}?${params.toString()}`
  }
  
  static generateResponsiveSrcSet(baseSrc: string, sizes: number[]): string {
    return sizes
      .map(size => `${this.getOptimalSrc(baseSrc, { width: size })} ${size}w`)
      .join(', ')
  }
}

/**
 * Performance metrics collection and monitoring
 */
export class PerformanceMonitor {
  private metrics: Partial<PerformanceMetrics> = {}
  private observers: PerformanceObserver[] = []
  
  constructor() {
    this.initializeObservers()
  }
  
  private initializeObservers() {
    // Largest Contentful Paint
    if ('PerformanceObserver' in window) {
      try {
        const lcpObserver = new PerformanceObserver(list => {
          const entries = list.getEntries()
          const lastEntry = entries[entries.length - 1] as any
          this.metrics.LCP = lastEntry.startTime
        })
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] })
        this.observers.push(lcpObserver)
      } catch (e) {
        console.warn('LCP observer not supported')
      }
      
      // First Input Delay
      try {
        const fidObserver = new PerformanceObserver(list => {
          const entries = list.getEntries()
          entries.forEach(entry => {
            this.metrics.FID = (entry as any).processingStart - entry.startTime
          })
        })
        fidObserver.observe({ entryTypes: ['first-input'] })
        this.observers.push(fidObserver)
      } catch (e) {
        console.warn('FID observer not supported')
      }
      
      // Cumulative Layout Shift
      try {
        const clsObserver = new PerformanceObserver(list => {
          let clsValue = 0
          list.getEntries().forEach(entry => {
            if (!(entry as any).hadRecentInput) {
              clsValue += (entry as any).value
            }
          })
          this.metrics.CLS = clsValue
        })
        clsObserver.observe({ entryTypes: ['layout-shift'] })
        this.observers.push(clsObserver)
      } catch (e) {
        console.warn('CLS observer not supported')
      }
      
      // Navigation timing
      this.collectNavigationMetrics()
    }
  }
  
  private collectNavigationMetrics() {
    if ('performance' in window && performance.timing) {
      const timing = performance.timing
      this.metrics.loadTime = timing.loadEventEnd - timing.navigationStart
      this.metrics.domContentLoaded = timing.domContentLoadedEventEnd - timing.navigationStart
      this.metrics.TTFB = timing.responseStart - timing.navigationStart
    }
    
    // Modern Navigation API
    if ('performance' in window && performance.getEntriesByType) {
      const navigation = performance.getEntriesByType('navigation')[0] as any
      if (navigation) {
        this.metrics.FCP = navigation.loadEventEnd - navigation.loadEventStart
        this.metrics.TTFB = navigation.responseStart
      }
    }
  }
  
  getMetrics(): Partial<PerformanceMetrics> {
    return { ...this.metrics }
  }
  
  async reportMetrics(endpoint: string = '/api/analytics/performance') {
    try {
      const metrics = this.getMetrics()
      
      // Add additional context
      const report = {
        ...metrics,
        url: window.location.href,
        userAgent: navigator.userAgent,
        connection: (navigator as any).connection?.effectiveType,
        timestamp: Date.now()
      }
      
      // Send to analytics endpoint
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(report)
      })
    } catch (error) {
      console.error('Failed to report performance metrics:', error)
    }
  }
  
  disconnect() {
    this.observers.forEach(observer => observer.disconnect())
    this.observers = []
  }
}

/**
 * Resource preloading utilities
 */
export class ResourcePreloader {
  private preloadedResources = new Set<string>()
  
  preloadScript(src: string, priority: LoadPriority = 'low'): Promise<void> {
    if (this.preloadedResources.has(src)) {
      return Promise.resolve()
    }
    
    return new Promise((resolve, reject) => {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'script'
      link.href = src
      
      if (priority === 'high') {
        link.setAttribute('fetchpriority', 'high')
      }
      
      link.onload = () => {
        this.preloadedResources.add(src)
        resolve()
      }
      link.onerror = reject
      
      document.head.appendChild(link)
    })
  }
  
  preloadStyle(href: string): Promise<void> {
    if (this.preloadedResources.has(href)) {
      return Promise.resolve()
    }
    
    return new Promise((resolve, reject) => {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'style'
      link.href = href
      
      link.onload = () => {
        this.preloadedResources.add(href)
        resolve()
      }
      link.onerror = reject
      
      document.head.appendChild(link)
    })
  }
  
  preloadImage(src: string, crossOrigin?: string): Promise<void> {
    if (this.preloadedResources.has(src)) {
      return Promise.resolve()
    }
    
    return new Promise((resolve, reject) => {
      const img = new Image()
      
      if (crossOrigin) {
        img.crossOrigin = crossOrigin
      }
      
      img.onload = () => {
        this.preloadedResources.add(src)
        resolve()
      }
      img.onerror = reject
      img.src = src
    })
  }
  
  preloadFont(href: string, type: string = 'font/woff2'): Promise<void> {
    if (this.preloadedResources.has(href)) {
      return Promise.resolve()
    }
    
    return new Promise((resolve, reject) => {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'font'
      link.type = type
      link.href = href
      link.crossOrigin = 'anonymous'
      
      link.onload = () => {
        this.preloadedResources.add(href)
        resolve()
      }
      link.onerror = reject
      
      document.head.appendChild(link)
    })
  }
}

/**
 * Bundle size optimization utilities
 */
export class BundleOptimizer {
  static measureBundleSize(): Promise<{ total: number; gzipped: number }> {
    return new Promise(resolve => {
      // This is a simplified measurement
      // In a real implementation, you'd get this from build tools
      const scripts = Array.from(document.querySelectorAll('script[src]'))
      const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      
      Promise.all([
        ...scripts.map(s => this.getResourceSize((s as HTMLScriptElement).src)),
        ...styles.map(s => this.getResourceSize((s as HTMLLinkElement).href))
      ]).then(sizes => {
        const total = sizes.reduce((sum, size) => sum + size, 0)
        resolve({ total, gzipped: total * 0.7 }) // Rough estimate
      })
    })
  }
  
  private static async getResourceSize(url: string): Promise<number> {
    try {
      const response = await fetch(url, { method: 'HEAD' })
      const contentLength = response.headers.get('content-length')
      return contentLength ? parseInt(contentLength, 10) : 0
    } catch {
      return 0
    }
  }
  
  static analyzeUnusedCode(): Promise<string[]> {
    // This would integrate with tools like webpack-bundle-analyzer
    // For now, return a placeholder
    return Promise.resolve([])
  }
}

/**
 * Critical resource identification
 */
export function identifyCriticalResources(): string[] {
  const critical: string[] = []
  
  // App shell resources
  critical.push('/main.js', '/main.css')
  
  // Above-the-fold images
  const images = Array.from(document.querySelectorAll('img'))
  const viewportHeight = window.innerHeight
  
  images.forEach(img => {
    const rect = img.getBoundingClientRect()
    if (rect.top < viewportHeight) {
      critical.push(img.src)
    }
  })
  
  return critical
}

/**
 * Initialization function for performance optimizations
 */
export async function initializePerformanceOptimizations() {
  // Initialize image format detection
  await ImageOptimizer.initialize()
  
  // Set up performance monitoring
  const monitor = new PerformanceMonitor()
  
  // Report metrics after page load
  window.addEventListener('load', () => {
    setTimeout(() => {
      monitor.reportMetrics()
    }, 1000)
  })
  
  // Set up lazy loading
  const lazyLoadObserver = new LazyLoadObserver({
    threshold: 0.1,
    rootMargin: '50px'
  })
  
  // Observe all lazy-loadable elements
  document.querySelectorAll('[data-src]').forEach(element => {
    lazyLoadObserver.observe(element)
  })
  
  // Preload critical resources
  const preloader = new ResourcePreloader()
  const criticalResources = identifyCriticalResources()
  
  criticalResources.forEach(resource => {
    if (resource.endsWith('.js')) {
      preloader.preloadScript(resource, 'high')
    } else if (resource.endsWith('.css')) {
      preloader.preloadStyle(resource)
    } else if (resource.match(/\.(jpg|jpeg|png|webp|avif)$/)) {
      preloader.preloadImage(resource)
    }
  })
  
  return {
    monitor,
    lazyLoadObserver,
    preloader
  }
}

// Global instance
let performanceUtils: {
  monitor: PerformanceMonitor
  lazyLoadObserver: LazyLoadObserver
  preloader: ResourcePreloader
} | null = null

export function getPerformanceUtils() {
  return performanceUtils
}

export function setPerformanceUtils(utils: typeof performanceUtils) {
  performanceUtils = utils
}

export default {
  createLazyComponent,
  LazyLoadObserver,
  ImageOptimizer,
  PerformanceMonitor,
  ResourcePreloader,
  BundleOptimizer,
  initializePerformanceOptimizations
}