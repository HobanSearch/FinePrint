import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Debounce function to limit the rate of function calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout)
    }
    
    timeout = setTimeout(() => {
      func(...args)
    }, wait)
  }
}

/**
 * Throttle function to limit function calls to once per interval
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let lastTime = 0
  
  return (...args: Parameters<T>) => {
    const now = Date.now()
    
    if (now - lastTime >= wait) {
      lastTime = now
      func(...args)
    }
  }
}

/**
 * Format file size in human readable format
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

/**
 * Format date in relative time format
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  if (weeks < 4) return `${weeks}w ago`
  if (months < 12) return `${months}mo ago`
  return `${years}y ago`
}

/**
 * Validate URL format
 */
export function isValidUrl(string: string): boolean {
  try {
    new URL(string)
    return true
  } catch {
    return false
  }
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname
  } catch {
    return url
  }
}

/**
 * Sanitize HTML string to prevent XSS
 */
export function sanitizeHtml(html: string): string {
  const div = document.createElement('div')
  div.textContent = html
  return div.innerHTML
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return Math.random().toString(36).substr(2, 9)
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj
  if (obj instanceof Date) return new Date(obj.getTime()) as any
  if (obj instanceof Array) return obj.map(item => deepClone(item)) as any
  if (typeof obj === 'object') {
    const cloned: any = {}
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key])
      }
    }
    return cloned
  }
  return obj
}

/**
 * Check if two objects are deeply equal
 */
export function deepEqual<T>(a: T, b: T): boolean {
  if (a === b) return true
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (!a || !b || (typeof a !== 'object' && typeof b !== 'object')) return a === b
  if (a === null || a === undefined || b === null || b === undefined) return false
  if (a.constructor !== b.constructor) return false

  let length: number
  if (a instanceof Array) {
    length = a.length
    if (length !== (b as any).length) return false
    for (let i = length; i-- !== 0;) {
      if (!deepEqual(a[i], (b as any)[i])) return false
    }
    return true
  }
  
  const keys = Object.keys(a)
  length = keys.length
  if (length !== Object.keys(b).length) return false

  for (let i = length; i-- !== 0;) {
    if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false
  }

  for (let i = length; i-- !== 0;) {
    const key = keys[i]
    if (!deepEqual((a as any)[key], (b as any)[key])) return false
  }

  return true
}

/**
 * Retry async function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let retries = 0
  
  while (retries < maxRetries) {
    try {
      return await fn()
    } catch (error) {
      retries++
      
      if (retries >= maxRetries) {
        throw error
      }
      
      const delay = baseDelay * Math.pow(2, retries - 1)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw new Error('Max retries exceeded')
}

/**
 * Convert text to slug format
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '')             // Trim - from end of text
}

/**
 * Truncate text to specified length
 */
export function truncate(text: string, length: number, suffix = '...'): string {
  if (text.length <= length) return text
  return text.substring(0, length - suffix.length) + suffix
}

/**
 * Get risk level color class based on score
 */
export function getRiskColor(score: number): string {
  if (score >= 80) return 'red'
  if (score >= 60) return 'orange'
  if (score >= 40) return 'yellow'
  return 'green'
}

/**
 * Get severity color class
 */
export function getSeverityColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'critical': return 'red'
    case 'high': return 'orange'
    case 'medium': return 'yellow'
    case 'low': return 'green'
    default: return 'gray'
  }
}

/**
 * Calculate reading time for text
 */
export function calculateReadingTime(text: string, wordsPerMinute = 200): number {
  const words = text.trim().split(/\s+/).length
  return Math.ceil(words / wordsPerMinute)
}

/**
 * Escape regex special characters
 */
export function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Check if device prefers dark mode
 */
export function prefersDarkMode(): boolean {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Check if device has reduced motion preference
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Get browser information
 */
export function getBrowserInfo(): { name: string; version: string } {
  const userAgent = navigator.userAgent
  
  if (userAgent.includes('Firefox')) {
    const match = userAgent.match(/Firefox\/(\d+)/)
    return { name: 'Firefox', version: match ? match[1] : 'Unknown' }
  }
  
  if (userAgent.includes('Edg/')) {
    const match = userAgent.match(/Edg\/(\d+)/)
    return { name: 'Edge', version: match ? match[1] : 'Unknown' }
  }
  
  if (userAgent.includes('Chrome')) {
    const match = userAgent.match(/Chrome\/(\d+)/)
    return { name: 'Chrome', version: match ? match[1] : 'Unknown' }
  }
  
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    const match = userAgent.match(/Version\/(\d+)/)
    return { name: 'Safari', version: match ? match[1] : 'Unknown' }
  }
  
  return { name: 'Unknown', version: 'Unknown' }
}

/**
 * Performance measurement utility
 */
export class PerformanceMonitor {
  private startTime: number
  private label: string
  
  constructor(label: string) {
    this.label = label
    this.startTime = performance.now()
  }
  
  end(): number {
    const duration = performance.now() - this.startTime
    console.log(`${this.label}: ${duration.toFixed(2)}ms`)
    return duration
  }
}

/**
 * Simple event emitter for extension communication
 */
export class EventEmitter {
  private events: { [key: string]: Function[] } = {}
  
  on(event: string, callback: Function): void {
    if (!this.events[event]) {
      this.events[event] = []
    }
    this.events[event].push(callback)
  }
  
  off(event: string, callback: Function): void {
    if (!this.events[event]) return
    
    const index = this.events[event].indexOf(callback)
    if (index > -1) {
      this.events[event].splice(index, 1)
    }
  }
  
  emit(event: string, ...args: any[]): void {
    if (!this.events[event]) return
    
    this.events[event].forEach(callback => {
      try {
        callback(...args)
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error)
      }
    })
  }
}