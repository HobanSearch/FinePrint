import type { 
  BrowserCapabilities, 
  PlatformAdapter 
} from "@/types"

export class PlatformAdapterManager {
  private currentAdapter: PlatformAdapter | null = null

  /**
   * Initialize platform adapter based on current browser
   */
  async initialize(): Promise<PlatformAdapter> {
    const adapter = await this.detectPlatform()
    this.currentAdapter = adapter
    
    // Apply platform-specific configurations
    await this.applyPlatformConfig(adapter)
    
    return adapter
  }

  /**
   * Get current platform adapter
   */
  getCurrentAdapter(): PlatformAdapter | null {
    return this.currentAdapter
  }

  /**
   * Check if feature is supported on current platform
   */
  isSupported(feature: keyof BrowserCapabilities): boolean {
    if (!this.currentAdapter) return false
    return this.currentAdapter.capabilities[feature] as boolean
  }

  /**
   * Get storage quota limit for current platform
   */
  getStorageLimit(): number {
    return this.currentAdapter?.capabilities.storageQuotaLimit || 5242880 // 5MB default
  }

  /**
   * Map API call to platform-specific implementation
   */
  mapAPI(apiName: string): string {
    if (!this.currentAdapter) return apiName
    return this.currentAdapter.apiMappings[apiName] || apiName
  }

  /**
   * Detect current browser platform
   */
  private async detectPlatform(): Promise<PlatformAdapter> {
    // Check if we're in Chrome/Chromium
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
      const manifest = chrome.runtime.getManifest()
      
      if (manifest.manifest_version === 3) {
        return this.getChromeAdapter()
      } else if (manifest.manifest_version === 2) {
        // Could be Firefox or older Chrome
        if (typeof browser !== 'undefined') {
          return this.getFirefoxAdapter()
        }
        return this.getChromeMV2Adapter()
      }
    }

    // Check for Firefox
    if (typeof browser !== 'undefined' && browser.runtime) {
      return this.getFirefoxAdapter()
    }

    // Check for Safari
    if (typeof safari !== 'undefined') {
      return this.getSafariAdapter()
    }

    // Default to Chrome MV3
    return this.getChromeAdapter()
  }

  /**
   * Get Chrome Manifest V3 adapter
   */
  private getChromeAdapter(): PlatformAdapter {
    return {
      browser: 'chrome',
      version: this.getBrowserVersion(),
      capabilities: {
        manifestVersion: 3,
        supportsServiceWorker: true,
        supportsDeclarativeNetRequest: true,
        supportsDynamicContentScripts: true,
        storageQuotaLimit: 10485760 // 10MB
      },
      apiMappings: {
        'storage.local': 'chrome.storage.local',
        'storage.sync': 'chrome.storage.sync',
        'tabs.query': 'chrome.tabs.query',
        'tabs.sendMessage': 'chrome.tabs.sendMessage',
        'runtime.sendMessage': 'chrome.runtime.sendMessage',
        'notifications.create': 'chrome.notifications.create',
        'contextMenus.create': 'chrome.contextMenus.create',
        'alarms.create': 'chrome.alarms.create'
      }
    }
  }

  /**
   * Get Chrome Manifest V2 adapter (legacy)
   */
  private getChromeMV2Adapter(): PlatformAdapter {
    return {
      browser: 'chrome',
      version: this.getBrowserVersion(),
      capabilities: {
        manifestVersion: 2,
        supportsServiceWorker: false,
        supportsDeclarativeNetRequest: false,
        supportsDynamicContentScripts: false,
        storageQuotaLimit: 5242880 // 5MB
      },
      apiMappings: {
        'storage.local': 'chrome.storage.local',
        'storage.sync': 'chrome.storage.sync',
        'tabs.query': 'chrome.tabs.query',
        'tabs.sendMessage': 'chrome.tabs.sendMessage',
        'runtime.sendMessage': 'chrome.runtime.sendMessage',
        'notifications.create': 'chrome.notifications.create',
        'contextMenus.create': 'chrome.contextMenus.create',
        'alarms.create': 'chrome.alarms.create'
      }
    }
  }

  /**
   * Get Firefox adapter
   */
  private getFirefoxAdapter(): PlatformAdapter {
    return {
      browser: 'firefox',
      version: this.getBrowserVersion(),
      capabilities: {
        manifestVersion: 2,
        supportsServiceWorker: false,
        supportsDeclarativeNetRequest: false,
        supportsDynamicContentScripts: true,
        storageQuotaLimit: 5242880 // 5MB
      },
      apiMappings: {
        'storage.local': 'browser.storage.local',
        'storage.sync': 'browser.storage.sync',
        'tabs.query': 'browser.tabs.query',
        'tabs.sendMessage': 'browser.tabs.sendMessage',
        'runtime.sendMessage': 'browser.runtime.sendMessage',
        'notifications.create': 'browser.notifications.create',
        'contextMenus.create': 'browser.contextMenus.create',
        'alarms.create': 'browser.alarms.create'
      }
    }
  }

  /**
   * Get Safari adapter
   */
  private getSafariAdapter(): PlatformAdapter {
    return {
      browser: 'safari',
      version: this.getBrowserVersion(),
      capabilities: {
        manifestVersion: 2,
        supportsServiceWorker: false,
        supportsDeclarativeNetRequest: false,
        supportsDynamicContentScripts: true,
        storageQuotaLimit: 2621440 // 2.5MB
      },
      apiMappings: {
        'storage.local': 'safari.extension.storage.local',
        'storage.sync': 'safari.extension.storage.sync',
        'tabs.query': 'safari.application.activeBrowserWindow.tabs',
        'tabs.sendMessage': 'safari.extension.dispatchMessage',
        'runtime.sendMessage': 'safari.extension.dispatchMessage',
        'notifications.create': 'safari.extension.createNotification',
        'contextMenus.create': 'safari.extension.addContextMenuItem',
        'alarms.create': 'safari.extension.createAlarm'
      }
    }
  }

  /**
   * Get browser version
   */
  private getBrowserVersion(): string {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        const manifest = chrome.runtime.getManifest()
        return manifest.version || '1.0.0'
      }
      if (typeof browser !== 'undefined' && browser.runtime) {
        return browser.runtime.getManifest().version || '1.0.0'
      }
      return '1.0.0'
    } catch {
      return '1.0.0'
    }
  }

  /**
   * Apply platform-specific configurations
   */
  private async applyPlatformConfig(adapter: PlatformAdapter): Promise<void> {
    switch (adapter.browser) {
      case 'chrome':
        await this.applyChromeConfig(adapter)
        break
      case 'firefox':
        await this.applyFirefoxConfig(adapter)
        break
      case 'safari':
        await this.applySafariConfig(adapter)
        break
      default:
        console.warn('Unknown browser platform:', adapter.browser)
    }
  }

  /**
   * Apply Chrome-specific configurations
   */
  private async applyChromeConfig(adapter: PlatformAdapter): Promise<void> {
    if (adapter.capabilities.manifestVersion === 3) {
      // Manifest V3 specific setup
      if (adapter.capabilities.supportsServiceWorker) {
        // Service worker is already handled by Plasmo
      }
      
      if (adapter.capabilities.supportsDeclarativeNetRequest) {
        // Setup declarative net request rules if needed
      }
    }
  }

  /**
   * Apply Firefox-specific configurations
   */
  private async applyFirefoxConfig(adapter: PlatformAdapter): Promise<void> {
    // Firefox-specific polyfills and configurations
    if (typeof chrome === 'undefined' && typeof browser !== 'undefined') {
      // Use browser API instead of chrome API
      (globalThis as any).chrome = browser
    }
  }

  /**
   * Apply Safari-specific configurations
   */
  private async applySafariConfig(adapter: PlatformAdapter): Promise<void> {
    // Safari-specific configurations
    // Note: Safari extension development requires different approach
    console.warn('Safari support is experimental')
  }

  /**
   * Get platform-specific storage API
   */
  getStorageAPI(): any {
    if (!this.currentAdapter) return chrome?.storage || browser?.storage

    switch (this.currentAdapter.browser) {
      case 'chrome':
        return chrome.storage
      case 'firefox':
        return browser.storage
      case 'safari':
        return (safari as any)?.extension?.storage
      default:
        return chrome?.storage || browser?.storage
    }
  }

  /**
   * Get platform-specific tabs API
   */
  getTabsAPI(): any {
    if (!this.currentAdapter) return chrome?.tabs || browser?.tabs

    switch (this.currentAdapter.browser) {
      case 'chrome':
        return chrome.tabs
      case 'firefox':
        return browser.tabs
      case 'safari':
        return (safari as any)?.application?.activeBrowserWindow?.tabs
      default:
        return chrome?.tabs || browser?.tabs
    }
  }

  /**
   * Get platform-specific runtime API
   */
  getRuntimeAPI(): any {
    if (!this.currentAdapter) return chrome?.runtime || browser?.runtime

    switch (this.currentAdapter.browser) {
      case 'chrome':
        return chrome.runtime
      case 'firefox':
        return browser.runtime
      case 'safari':
        return (safari as any)?.extension
      default:
        return chrome?.runtime || browser?.runtime
    }
  }

  /**
   * Check if current platform supports feature
   */
  checkFeatureSupport(feature: string): boolean {
    if (!this.currentAdapter) return false

    switch (feature) {
      case 'bulk-analysis':
        return this.currentAdapter.capabilities.storageQuotaLimit >= 5242880 // 5MB
      
      case 'site-monitoring':
        return this.currentAdapter.capabilities.manifestVersion >= 2
      
      case 'background-sync':
        return this.currentAdapter.capabilities.supportsServiceWorker
      
      case 'declarative-net-request':
        return this.currentAdapter.capabilities.supportsDeclarativeNetRequest
      
      case 'dynamic-content-scripts':
        return this.currentAdapter.capabilities.supportsDynamicContentScripts
      
      default:
        return true
    }
  }

  /**
   * Get platform-specific limitations
   */
  getPlatformLimitations(): string[] {
    if (!this.currentAdapter) return []

    const limitations: string[] = []

    if (!this.currentAdapter.capabilities.supportsServiceWorker) {
      limitations.push('Background processing may be limited')
    }

    if (!this.currentAdapter.capabilities.supportsDeclarativeNetRequest) {
      limitations.push('Advanced request filtering not available')
    }

    if (this.currentAdapter.capabilities.storageQuotaLimit < 10485760) {
      limitations.push('Limited storage capacity for bulk analysis')
    }

    if (this.currentAdapter.browser === 'safari') {
      limitations.push('Some features may not be fully supported in Safari')
    }

    return limitations
  }

  /**
   * Get store submission requirements for current platform
   */
  getSubmissionRequirements(): {
    manifestVersion: number;
    requiredPermissions: string[];
    optionalPermissions: string[];
    hostPermissions: string[];
    contentSecurityPolicy?: string;
    additionalRequirements: string[];
  } {
    if (!this.currentAdapter) {
      throw new Error('Platform adapter not initialized')
    }

    switch (this.currentAdapter.browser) {
      case 'chrome':
        return {
          manifestVersion: 3,
          requiredPermissions: [
            'storage',
            'activeTab',
            'scripting',
            'notifications',
            'contextMenus',
            'alarms'
          ],
          optionalPermissions: [
            'tabs',
            'bookmarks'
          ],
          hostPermissions: [
            'http://*/*',
            'https://*/*'
          ],
          contentSecurityPolicy: "script-src 'self'; object-src 'self'",
          additionalRequirements: [
            'Privacy policy required',
            'Content security policy must be restrictive',
            'All permissions must be justified',
            'Store listing must be complete with screenshots'
          ]
        }

      case 'firefox':
        return {
          manifestVersion: 2,
          requiredPermissions: [
            'storage',
            'activeTab',
            'notifications',
            'contextMenus',
            'alarms',
            'http://*/*',
            'https://*/*'
          ],
          optionalPermissions: [
            'tabs',
            'bookmarks'
          ],
          hostPermissions: [],
          additionalRequirements: [
            'Source code review required',
            'Privacy policy required',
            'All third-party libraries must be justified',
            'Self-hosted or CDN libraries preferred'
          ]
        }

      case 'safari':
        return {
          manifestVersion: 2,
          requiredPermissions: [
            'storage',
            'activeTab',
            'notifications'
          ],
          optionalPermissions: [
            'tabs'
          ],
          hostPermissions: [
            'http://*/*',
            'https://*/*'
          ],
          additionalRequirements: [
            'Mac App Store distribution required',
            'Code signing certificate required',
            'App sandbox compliance required',
            'Native app wrapper required'
          ]
        }

      default:
        throw new Error(`Unknown browser: ${this.currentAdapter.browser}`)
    }
  }
}

// Export singleton instance
export const platformAdapter = new PlatformAdapterManager()