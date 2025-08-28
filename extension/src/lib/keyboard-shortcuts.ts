/**
 * Keyboard shortcuts manager for Fine Print AI extension
 */

interface ShortcutAction {
  id: string
  keys: string[]
  description: string
  action: () => void | Promise<void>
  context?: 'page' | 'popup' | 'options' | 'global'
}

export class KeyboardShortcuts {
  private shortcuts: Map<string, ShortcutAction> = new Map()
  private pressedKeys: Set<string> = new Set()
  private isEnabled = true

  constructor() {
    this.setupEventListeners()
    this.registerDefaultShortcuts()
  }

  private setupEventListeners() {
    document.addEventListener('keydown', this.handleKeyDown.bind(this))
    document.addEventListener('keyup', this.handleKeyUp.bind(this))
    
    // Reset pressed keys when window loses focus
    window.addEventListener('blur', () => {
      this.pressedKeys.clear()
    })
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (!this.isEnabled) return

    // Don't trigger shortcuts when typing in input fields
    if (this.isTypingInInput(event.target as Element)) return

    const key = this.normalizeKey(event)
    this.pressedKeys.add(key)

    // Check for matching shortcuts
    for (const [shortcutId, shortcut] of this.shortcuts) {
      if (this.isShortcutMatch(shortcut.keys)) {
        event.preventDefault()
        event.stopPropagation()
        
        try {
          shortcut.action()
        } catch (error) {
          console.error(`Error executing shortcut ${shortcutId}:`, error)
        }
        
        this.pressedKeys.clear()
        break
      }
    }
  }

  private handleKeyUp(event: KeyboardEvent) {
    const key = this.normalizeKey(event)
    this.pressedKeys.delete(key)
  }

  private normalizeKey(event: KeyboardEvent): string {
    const modifiers = []
    
    if (event.ctrlKey || event.metaKey) modifiers.push('mod')
    if (event.altKey) modifiers.push('alt')
    if (event.shiftKey) modifiers.push('shift')
    
    const key = event.key.toLowerCase()
    
    return [...modifiers, key].join('+')
  }

  private isShortcutMatch(keys: string[]): boolean {
    const currentCombo = Array.from(this.pressedKeys).sort().join('|')
    
    return keys.some(shortcut => {
      const shortcutKeys = shortcut.split('+').sort().join('|')
      return currentCombo === shortcutKeys
    })
  }

  private isTypingInInput(target: Element | null): boolean {
    if (!target) return false

    const tagName = target.tagName.toLowerCase()
    const isContentEditable = (target as HTMLElement).contentEditable === 'true'
    
    return (
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      isContentEditable
    )
  }

  private registerDefaultShortcuts() {
    // Global shortcuts
    this.register({
      id: 'analyze-page',
      keys: ['mod+shift+a'],
      description: 'Analyze current page',
      context: 'global',
      action: async () => {
        await this.triggerPageAnalysis()
      }
    })

    this.register({
      id: 'toggle-highlights',
      keys: ['mod+shift+h'],
      description: 'Toggle highlights on page',
      context: 'page',
      action: async () => {
        await this.toggleHighlights()
      }
    })

    this.register({
      id: 'open-popup',
      keys: ['mod+shift+f'],
      description: 'Open Fine Print AI popup',
      context: 'global',
      action: async () => {
        await this.openPopup()
      }
    })

    this.register({
      id: 'open-options',
      keys: ['mod+shift+o'],
      description: 'Open extension options',
      context: 'global',
      action: async () => {
        await this.openOptions()
      }
    })

    // Popup-specific shortcuts
    this.register({
      id: 'popup-close',
      keys: ['escape'],
      description: 'Close popup',
      context: 'popup',
      action: () => {
        window.close()
      }
    })

    this.register({
      id: 'popup-refresh',
      keys: ['mod+r', 'f5'],
      description: 'Refresh analysis',
      context: 'popup',
      action: async () => {
        await this.refreshAnalysis()
      }
    })

    // Navigation shortcuts
    this.register({
      id: 'next-finding',
      keys: ['mod+shift+arrowdown'],
      description: 'Go to next finding',
      context: 'page',
      action: () => {
        this.navigateToNextFinding()
      }
    })

    this.register({
      id: 'prev-finding',
      keys: ['mod+shift+arrowup'],
      description: 'Go to previous finding',
      context: 'page',
      action: () => {
        this.navigateToPrevFinding()
      }
    })

    // Quick actions
    this.register({
      id: 'copy-report-url',
      keys: ['mod+shift+c'],
      description: 'Copy report URL to clipboard',
      context: 'popup',
      action: async () => {
        await this.copyReportUrl()
      }
    })

    this.register({
      id: 'export-findings',
      keys: ['mod+shift+e'],
      description: 'Export findings as JSON',
      context: 'popup',
      action: async () => {
        await this.exportFindings()
      }
    })
  }

  /**
   * Register a new keyboard shortcut
   */
  register(shortcut: ShortcutAction): void {
    this.shortcuts.set(shortcut.id, shortcut)
  }

  /**
   * Unregister a keyboard shortcut
   */
  unregister(shortcutId: string): void {
    this.shortcuts.delete(shortcutId)
  }

  /**
   * Enable or disable all shortcuts
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled
  }

  /**
   * Get all registered shortcuts
   */
  getShortcuts(): ShortcutAction[] {
    return Array.from(this.shortcuts.values())
  }

  /**
   * Get shortcuts for a specific context
   */
  getShortcutsForContext(context: string): ShortcutAction[] {
    return Array.from(this.shortcuts.values())
      .filter(shortcut => !shortcut.context || shortcut.context === context || shortcut.context === 'global')
  }

  // Action implementations
  private async triggerPageAnalysis(): Promise<void> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab.id) return

      await chrome.tabs.sendMessage(tab.id, {
        type: 'START_MANUAL_ANALYSIS'
      })
    } catch (error) {
      console.error('Failed to trigger page analysis:', error)
    }
  }

  private async toggleHighlights(): Promise<void> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab.id) return

      await chrome.tabs.sendMessage(tab.id, {
        type: 'TOGGLE_HIGHLIGHTS'
      })
    } catch (error) {
      console.error('Failed to toggle highlights:', error)
    }
  }

  private async openPopup(): Promise<void> {
    try {
      await chrome.action.openPopup()
    } catch (error) {
      // Fallback for browsers that don't support openPopup
      console.log('Opening popup via keyboard shortcut not supported')
    }
  }

  private async openOptions(): Promise<void> {
    try {
      await chrome.runtime.openOptionsPage()
    } catch (error) {
      console.error('Failed to open options page:', error)
    }
  }

  private async refreshAnalysis(): Promise<void> {
    try {
      // Trigger page reload or re-analysis
      window.location.reload()
    } catch (error) {
      console.error('Failed to refresh analysis:', error)
    }
  }

  private navigateToNextFinding(): void {
    const findings = document.querySelectorAll('.fineprint-highlight')
    if (findings.length === 0) return

    const current = document.querySelector('.fineprint-highlight.active')
    let nextIndex = 0

    if (current) {
      const currentIndex = Array.from(findings).indexOf(current)
      nextIndex = (currentIndex + 1) % findings.length
      current.classList.remove('active')
    }

    const nextFinding = findings[nextIndex] as HTMLElement
    nextFinding.classList.add('active')
    nextFinding.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  private navigateToPrevFinding(): void {
    const findings = document.querySelectorAll('.fineprint-highlight')
    if (findings.length === 0) return

    const current = document.querySelector('.fineprint-highlight.active')
    let prevIndex = findings.length - 1

    if (current) {
      const currentIndex = Array.from(findings).indexOf(current)
      prevIndex = currentIndex === 0 ? findings.length - 1 : currentIndex - 1
      current.classList.remove('active')
    }

    const prevFinding = findings[prevIndex] as HTMLElement
    prevFinding.classList.add('active')
    prevFinding.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  private async copyReportUrl(): Promise<void> {
    try {
      // Get current analysis data
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab.url) return

      // Construct report URL (this would depend on your backend setup)
      const reportUrl = `${window.location.origin}/report?url=${encodeURIComponent(tab.url)}`
      
      await navigator.clipboard.writeText(reportUrl)
      
      // Show confirmation
      this.showNotification('Report URL copied to clipboard')
    } catch (error) {
      console.error('Failed to copy report URL:', error)
    }
  }

  private async exportFindings(): Promise<void> {
    try {
      // Get current analysis data from storage or content script
      // This is a simplified implementation
      const findings = Array.from(document.querySelectorAll('.fineprint-highlight')).map(el => ({
        text: el.textContent,
        severity: el.className.match(/risk-(\w+)/)?.[1] || 'unknown'
      }))

      const data = {
        url: window.location.href,
        timestamp: new Date().toISOString(),
        findings
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      
      const a = document.createElement('a')
      a.href = url
      a.download = `fineprint-findings-${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      
      URL.revokeObjectURL(url)
      
      this.showNotification('Findings exported successfully')
    } catch (error) {
      console.error('Failed to export findings:', error)
    }
  }

  private showNotification(message: string): void {
    // Simple toast notification
    const toast = document.createElement('div')
    toast.className = 'fineprint-toast'
    toast.textContent = message
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #333;
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      z-index: 999999;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: fadeInOut 3s forwards;
    `

    const style = document.createElement('style')
    style.textContent = `
      @keyframes fadeInOut {
        0% { opacity: 0; transform: translateY(-10px); }
        10%, 90% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-10px); }
      }
    `
    document.head.appendChild(style)
    document.body.appendChild(toast)

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast)
      }
      if (style.parentNode) {
        style.parentNode.removeChild(style)
      }
    }, 3000)
  }
}

// Global instance
let keyboardShortcuts: KeyboardShortcuts | null = null

export function initializeKeyboardShortcuts(): KeyboardShortcuts {
  if (!keyboardShortcuts) {
    keyboardShortcuts = new KeyboardShortcuts()
  }
  return keyboardShortcuts
}

export function getKeyboardShortcuts(): KeyboardShortcuts | null {
  return keyboardShortcuts
}