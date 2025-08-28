import React from 'react'
import { motion, ReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface AccessibilitySettings {
  reducedMotion: boolean
  highContrast: boolean
  fontSize: 'small' | 'medium' | 'large' | 'extra-large'
  screenReader: boolean
  keyboardNavigation: boolean
  focusVisible: boolean
  announcements: boolean
  autoplay: boolean
  colorBlindnessMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'monochromacy'
}

interface AccessibilityContextType {
  settings: AccessibilitySettings
  updateSettings: (updates: Partial<AccessibilitySettings>) => void
  announce: (message: string, priority?: 'polite' | 'assertive') => void
  focus: (element: HTMLElement | null) => void
  skipToContent: () => void
}

const AccessibilityContext = React.createContext<AccessibilityContextType | null>(null)

export const useAccessibility = () => {
  const context = React.useContext(AccessibilityContext)
  if (!context) {
    throw new Error('useAccessibility must be used within AccessibilityProvider')
  }
  return context
}

interface AccessibilityProviderProps {
  children: React.ReactNode
}

export const AccessibilityProvider: React.FC<AccessibilityProviderProps> = ({ children }) => {
  const [settings, setSettings] = React.useState<AccessibilitySettings>(() => {
    // Load from localStorage or detect from system preferences
    const stored = localStorage.getItem('accessibility-settings')
    if (stored) {
      try {
        return JSON.parse(stored)
      } catch {}
    }

    // Default settings with system preference detection
    return {
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      highContrast: window.matchMedia('(prefers-contrast: high)').matches,
      fontSize: 'medium',
      screenReader: detectScreenReader(),
      keyboardNavigation: true,
      focusVisible: true,
      announcements: true,
      autoplay: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      colorBlindnessMode: 'none',
    }
  })

  const announcementRef = React.useRef<HTMLDivElement>(null)
  const skipLinkRef = React.useRef<HTMLAnchorElement>(null)

  // Update settings and persist to localStorage
  const updateSettings = React.useCallback((updates: Partial<AccessibilitySettings>) => {
    setSettings(prev => {
      const newSettings = { ...prev, ...updates }
      localStorage.setItem('accessibility-settings', JSON.stringify(newSettings))
      return newSettings
    })
  }, [])

  // Announce messages to screen readers
  const announce = React.useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (!settings.announcements || !announcementRef.current) return

    const announcement = document.createElement('div')
    announcement.setAttribute('aria-live', priority)
    announcement.setAttribute('aria-atomic', 'true')
    announcement.className = 'sr-only'
    announcement.textContent = message

    announcementRef.current.appendChild(announcement)

    // Remove after announcement
    setTimeout(() => {
      if (announcementRef.current?.contains(announcement)) {
        announcementRef.current.removeChild(announcement)
      }
    }, 1000)
  }, [settings.announcements])

  // Enhanced focus management
  const focus = React.useCallback((element: HTMLElement | null) => {
    if (!element) return

    // Ensure element is focusable
    if (!element.hasAttribute('tabindex') && !isFocusableElement(element)) {
      element.setAttribute('tabindex', '-1')
    }

    element.focus()

    // Scroll into view if needed
    element.scrollIntoView({
      behavior: settings.reducedMotion ? 'auto' : 'smooth',
      block: 'center',
    })
  }, [settings.reducedMotion])

  // Skip to main content
  const skipToContent = React.useCallback(() => {
    const mainContent = document.querySelector('main, [role="main"], #main-content')
    if (mainContent instanceof HTMLElement) {
      focus(mainContent)
      announce('Skipped to main content')
    }
  }, [focus, announce])

  // Apply settings to document
  React.useEffect(() => {
    const root = document.documentElement

    // Font size
    root.style.setProperty('--accessibility-font-scale', getFontScale(settings.fontSize))

    // High contrast
    if (settings.highContrast) {
      root.classList.add('high-contrast')
    } else {
      root.classList.remove('high-contrast')
    }

    // Reduced motion
    if (settings.reducedMotion) {
      root.classList.add('reduce-motion')
    } else {
      root.classList.remove('reduce-motion')
    }

    // Color blindness filters
    root.setAttribute('data-color-filter', settings.colorBlindnessMode)

    // Focus visible
    if (settings.focusVisible) {
      root.classList.add('focus-visible')
    } else {
      root.classList.remove('focus-visible')
    }

  }, [settings])

  // Keyboard navigation setup
  React.useEffect(() => {
    if (!settings.keyboardNavigation) return

    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip links (Ctrl/Cmd + /)
      if ((event.ctrlKey || event.metaKey) && event.key === '/') {
        event.preventDefault()
        skipToContent()
        return
      }

      // Escape key - close modals/menus
      if (event.key === 'Escape') {
        const activeModal = document.querySelector('[role="dialog"][aria-modal="true"]')
        if (activeModal) {
          const closeButton = activeModal.querySelector('[aria-label*="close"], [data-close]')
          if (closeButton instanceof HTMLElement) {
            closeButton.click()
          }
        }
      }

      // Tab trapping in modals
      if (event.key === 'Tab') {
        const activeModal = document.querySelector('[role="dialog"][aria-modal="true"]')
        if (activeModal) {
          trapFocus(event, activeModal)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [settings.keyboardNavigation, skipToContent])

  // Media query listeners
  React.useEffect(() => {
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const highContrastQuery = window.matchMedia('(prefers-contrast: high)')

    const updateFromMediaQueries = () => {
      updateSettings({
        reducedMotion: reducedMotionQuery.matches,
        highContrast: highContrastQuery.matches,
      })
    }

    reducedMotionQuery.addEventListener('change', updateFromMediaQueries)
    highContrastQuery.addEventListener('change', updateFromMediaQueries)

    return () => {
      reducedMotionQuery.removeEventListener('change', updateFromMediaQueries)
      highContrastQuery.removeEventListener('change', updateFromMediaQueries)
    }
  }, [updateSettings])

  const contextValue: AccessibilityContextType = {
    settings,
    updateSettings,
    announce,
    focus,
    skipToContent,
  }

  return (
    <AccessibilityContext.Provider value={contextValue}>
      {/* Skip Link */}
      <a
        ref={skipLinkRef}
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-guardian-600 focus:text-white focus:rounded focus:no-underline"
        onClick={(e) => {
          e.preventDefault()
          skipToContent()
        }}
      >
        Skip to main content
      </a>

      {/* Live Region for Announcements */}
      <div
        ref={announcementRef}
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      />

      {/* Main Content */}
      <ReducedMotion enabled={settings.reducedMotion}>
        {children}
      </ReducedMotion>

      {/* Color Blindness Filters */}
      {settings.colorBlindnessMode !== 'none' && (
        <ColorBlindnessFilter mode={settings.colorBlindnessMode} />
      )}
    </AccessibilityContext.Provider>
  )
}

// Accessibility Settings Panel Component
export const AccessibilityPanel: React.FC<{ className?: string }> = ({ className }) => {
  const { settings, updateSettings } = useAccessibility()
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-full bg-guardian-100 dark:bg-guardian-900 text-guardian-600 hover:bg-guardian-200 dark:hover:bg-guardian-800 transition-colors"
        aria-label="Open accessibility settings"
        aria-expanded={isOpen}
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 2a8 8 0 100 16 8 8 0 000-16zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" />
        </svg>
      </button>

      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border p-4 z-50"
        >
          <h3 className="font-semibold mb-4">Accessibility Settings</h3>
          
          <div className="space-y-4">
            {/* Font Size */}
            <div>
              <label className="block text-sm font-medium mb-2">Font Size</label>
              <select
                value={settings.fontSize}
                onChange={(e) => updateSettings({ fontSize: e.target.value as any })}
                className="w-full p-2 border rounded"
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
                <option value="extra-large">Extra Large</option>
              </select>
            </div>

            {/* Toggles */}
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.reducedMotion}
                  onChange={(e) => updateSettings({ reducedMotion: e.target.checked })}
                />
                <span className="text-sm">Reduce motion</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.highContrast}
                  onChange={(e) => updateSettings({ highContrast: e.target.checked })}
                />
                <span className="text-sm">High contrast</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.announcements}
                  onChange={(e) => updateSettings({ announcements: e.target.checked })}
                />
                <span className="text-sm">Screen reader announcements</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.focusVisible}
                  onChange={(e) => updateSettings({ focusVisible: e.target.checked })}
                />
                <span className="text-sm">Enhanced focus indicators</span>
              </label>
            </div>

            {/* Color Blindness */}
            <div>
              <label className="block text-sm font-medium mb-2">Color Vision</label>
              <select
                value={settings.colorBlindnessMode}
                onChange={(e) => updateSettings({ colorBlindnessMode: e.target.value as any })}
                className="w-full p-2 border rounded"
              >
                <option value="none">Normal</option>
                <option value="protanopia">Protanopia (Red-blind)</option>
                <option value="deuteranopia">Deuteranopia (Green-blind)</option>
                <option value="tritanopia">Tritanopia (Blue-blind)</option>
                <option value="monochromacy">Monochromacy</option>
              </select>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t">
            <button
              onClick={() => setIsOpen(false)}
              className="w-full py-2 bg-guardian-600 text-white rounded hover:bg-guardian-700 transition-colors"
            >
              Close
            </button>
          </div>
        </motion.div>
      )}
    </div>
  )
}

// Utility functions
function detectScreenReader(): boolean {
  // Basic screen reader detection
  return !!(
    navigator.userAgent.match(/NVDA|JAWS|VoiceOver|TalkBack|Orca/i) ||
    window.speechSynthesis ||
    document.querySelector('[role="application"]')
  )
}

function getFontScale(fontSize: AccessibilitySettings['fontSize']): string {
  switch (fontSize) {
    case 'small': return '0.875'
    case 'large': return '1.125'
    case 'extra-large': return '1.25'
    default: return '1'
  }
}

function isFocusableElement(element: HTMLElement): boolean {
  const focusableSelectors = [
    'a[href]',
    'button',
    'input',
    'textarea',
    'select',
    'details',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ]
  
  return focusableSelectors.some(selector => element.matches(selector)) && !element.hasAttribute('disabled')
}

function trapFocus(event: KeyboardEvent, container: Element) {
  const focusableElements = container.querySelectorAll(
    'a[href], button, textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select, [tabindex]:not([tabindex="-1"])'
  )
  
  const firstElement = focusableElements[0] as HTMLElement
  const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

  if (event.shiftKey) {
    if (document.activeElement === firstElement) {
      lastElement.focus()
      event.preventDefault()
    }
  } else {
    if (document.activeElement === lastElement) {
      firstElement.focus()
      event.preventDefault()
    }
  }
}

// Color Blindness Filter Component
const ColorBlindnessFilter: React.FC<{ mode: string }> = ({ mode }) => {
  const getFilterMatrix = (mode: string) => {
    switch (mode) {
      case 'protanopia':
        return '0.567, 0.433, 0,     0, 0, 0.558, 0.442, 0,     0, 0, 0,     0.242, 0.758, 0, 0, 0,     0,     0,     1, 0'
      case 'deuteranopia':
        return '0.625, 0.375, 0,     0, 0, 0.7,   0.3,   0,     0, 0, 0,     0.3,   0.7,   0, 0, 0,     0,     0,     1, 0'
      case 'tritanopia':
        return '0.95, 0.05,  0,     0, 0, 0,     0.433, 0.567, 0, 0, 0,     0.475, 0.525, 0, 0, 0,     0,     0,     1, 0'
      case 'monochromacy':
        return '0.299, 0.587, 0.114, 0, 0, 0.299, 0.587, 0.114, 0, 0, 0.299, 0.587, 0.114, 0, 0, 0,     0,     0,     1, 0'
      default:
        return 'none'
    }
  }

  if (mode === 'none') return null

  const matrix = getFilterMatrix(mode)

  return (
    <svg className="sr-only" aria-hidden="true">
      <defs>
        <filter id={`colorblind-${mode}`}>
          <feColorMatrix type="matrix" values={matrix} />
        </filter>
      </defs>
      <style>{`
        html[data-color-filter="${mode}"] {
          filter: url(#colorblind-${mode});
        }
      `}</style>
    </svg>
  )
}

// Accessible Form Components
export const AccessibleInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    label: string
    error?: string
    description?: string
  }
>(({ label, error, description, className, ...props }, ref) => {
  const { announce } = useAccessibility()
  const id = React.useId()
  const errorId = `${id}-error`
  const descriptionId = `${id}-description`

  React.useEffect(() => {
    if (error) {
      announce(`Error in ${label}: ${error}`, 'assertive')
    }
  }, [error, label, announce])

  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {description && (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      <input
        ref={ref}
        id={id}
        aria-describedby={cn(
          description && descriptionId,
          error && errorId
        )}
        aria-invalid={!!error}
        className={cn(
          'w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-guardian-500 focus:border-guardian-500',
          error && 'border-danger-500'
        )}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-sm text-danger-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
})

AccessibleInput.displayName = 'AccessibleInput'

export default AccessibilityProvider