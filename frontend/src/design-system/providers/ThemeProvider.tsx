/**
 * Fine Print AI - Theme Provider
 * React context provider for theme management with accessibility support
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { 
  Theme, 
  ThemeName, 
  themes, 
  lightTheme, 
  darkTheme, 
  highContrastLightTheme, 
  highContrastDarkTheme,
  generateCSSVariables 
} from '../theme'

// =============================================================================
// TYPES
// =============================================================================

export interface ThemeContextValue {
  theme: Theme
  themeName: ThemeName
  setTheme: (themeName: ThemeName) => void
  toggleTheme: () => void
  isDark: boolean
  isHighContrast: boolean
  supportsSystemTheme: boolean
  systemTheme: 'light' | 'dark' | null
}

export interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: ThemeName
  storageKey?: string
  enableSystemTheme?: boolean
  enableHighContrast?: boolean
  respectReducedMotion?: boolean
}

// =============================================================================
// CONTEXT
// =============================================================================

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

// =============================================================================
// HOOKS
// =============================================================================

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

// =============================================================================
// UTILITIES
// =============================================================================

function getSystemTheme(): 'light' | 'dark' | null {
  if (typeof window === 'undefined') return null
  
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  return null
}

function getSystemHighContrast(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-contrast: high)').matches
}

function getReducedMotionPreference(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function getStoredTheme(storageKey: string): ThemeName | null {
  if (typeof window === 'undefined') return null
  
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored && Object.keys(themes).includes(stored)) {
      return stored as ThemeName
    }
  } catch (error) {
    console.warn('Failed to read theme from localStorage:', error)
  }
  
  return null
}

function storeTheme(storageKey: string, theme: ThemeName): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.setItem(storageKey, theme)
  } catch (error) {
    console.warn('Failed to store theme in localStorage:', error)
  }
}

function determineInitialTheme(
  defaultTheme: ThemeName,
  storageKey: string,
  enableSystemTheme: boolean,
  enableHighContrast: boolean
): ThemeName {
  // First, check for stored preference
  const storedTheme = getStoredTheme(storageKey)
  if (storedTheme) return storedTheme
  
  // Check for high contrast preference
  if (enableHighContrast && getSystemHighContrast()) {
    const systemTheme = getSystemTheme()
    if (systemTheme === 'dark') return 'high-contrast-dark'
    return 'high-contrast-light'
  }
  
  // Check for system theme preference
  if (enableSystemTheme) {
    const systemTheme = getSystemTheme()
    if (systemTheme === 'dark') return 'dark'
    if (systemTheme === 'light') return 'light'
  }
  
  return defaultTheme
}

// =============================================================================
// THEME PROVIDER COMPONENT
// =============================================================================

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultTheme = 'light',
  storageKey = 'fineprint-theme',
  enableSystemTheme = true,
  enableHighContrast = true,
  respectReducedMotion = true,
}) => {
  const [themeName, setThemeNameState] = useState<ThemeName>(() =>
    determineInitialTheme(defaultTheme, storageKey, enableSystemTheme, enableHighContrast)
  )
  
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark' | null>(() =>
    enableSystemTheme ? getSystemTheme() : null
  )
  
  const [isHighContrast, setIsHighContrast] = useState(() =>
    enableHighContrast ? getSystemHighContrast() : false
  )
  
  const [supportsSystemTheme] = useState(() =>
    typeof window !== 'undefined' && 
    window.matchMedia && 
    enableSystemTheme
  )

  const theme = themes[themeName]

  // =============================================================================
  // THEME MANAGEMENT
  // =============================================================================

  const setTheme = useCallback((newThemeName: ThemeName) => {
    setThemeNameState(newThemeName)
    storeTheme(storageKey, newThemeName)
  }, [storageKey])

  const toggleTheme = useCallback(() => {
    if (isHighContrast) {
      setTheme(themeName === 'high-contrast-dark' ? 'high-contrast-light' : 'high-contrast-dark')
    } else {
      setTheme(themeName === 'dark' ? 'light' : 'dark')
    }
  }, [themeName, isHighContrast, setTheme])

  // =============================================================================
  // SYSTEM PREFERENCES MONITORING
  // =============================================================================

  useEffect(() => {
    if (!supportsSystemTheme) return

    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const lightModeQuery = window.matchMedia('(prefers-color-scheme: light)')

    const handleSystemThemeChange = () => {
      const newSystemTheme = getSystemTheme()
      setSystemTheme(newSystemTheme)
      
      // Auto-update theme if user hasn't manually selected one
      const storedTheme = getStoredTheme(storageKey)
      if (!storedTheme && enableSystemTheme) {
        if (isHighContrast) {
          setThemeNameState(newSystemTheme === 'dark' ? 'high-contrast-dark' : 'high-contrast-light')
        } else {
          setThemeNameState(newSystemTheme === 'dark' ? 'dark' : 'light')
        }
      }
    }

    darkModeQuery.addEventListener('change', handleSystemThemeChange)
    lightModeQuery.addEventListener('change', handleSystemThemeChange)

    return () => {
      darkModeQuery.removeEventListener('change', handleSystemThemeChange)
      lightModeQuery.removeEventListener('change', handleSystemThemeChange)
    }
  }, [storageKey, enableSystemTheme, isHighContrast, supportsSystemTheme])

  useEffect(() => {
    if (!enableHighContrast || typeof window === 'undefined') return

    const contrastQuery = window.matchMedia('(prefers-contrast: high)')

    const handleContrastChange = () => {
      const newIsHighContrast = getSystemHighContrast()
      setIsHighContrast(newIsHighContrast)
      
      // Auto-update to high contrast theme
      if (newIsHighContrast) {
        setTheme(themeName.includes('dark') ? 'high-contrast-dark' : 'high-contrast-light')
      } else {
        setTheme(themeName.includes('dark') ? 'dark' : 'light')
      }
    }

    contrastQuery.addEventListener('change', handleContrastChange)

    return () => {
      contrastQuery.removeEventListener('change', handleContrastChange)
    }
  }, [themeName, enableHighContrast, setTheme])

  // =============================================================================
  // CSS VARIABLES APPLICATION
  // =============================================================================

  useEffect(() => {
    if (typeof document === 'undefined') return

    const cssVariables = generateCSSVariables(theme)
    const root = document.documentElement

    // Apply CSS variables
    Object.entries(cssVariables).forEach(([property, value]) => {
      root.style.setProperty(property, value)
    })

    // Apply theme class to document
    root.className = root.className.replace(/theme-\w+/g, '')
    root.classList.add(`theme-${themeName}`)

    // Apply color scheme for browser UI
    root.style.colorScheme = theme.isDark ? 'dark' : 'light'

    // Apply reduced motion if preference is set
    if (respectReducedMotion && getReducedMotionPreference()) {
      root.classList.add('reduce-motion')
    }

    return () => {
      // Cleanup is handled by the next effect run
    }
  }, [theme, themeName, respectReducedMotion])

  // =============================================================================
  // CONTEXT VALUE
  // =============================================================================

  const contextValue: ThemeContextValue = {
    theme,
    themeName,
    setTheme,
    toggleTheme,
    isDark: theme.isDark,
    isHighContrast: themeName.includes('high-contrast'),
    supportsSystemTheme,
    systemTheme,
  }

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  )
}

// =============================================================================
// THEME DETECTION HOOK
// =============================================================================

export function useSystemTheme() {
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark' | null>(() =>
    typeof window !== 'undefined' ? getSystemTheme() : null
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const lightModeQuery = window.matchMedia('(prefers-color-scheme: light)')

    const handleChange = () => {
      setSystemTheme(getSystemTheme())
    }

    darkModeQuery.addEventListener('change', handleChange)
    lightModeQuery.addEventListener('change', handleChange)

    return () => {
      darkModeQuery.removeEventListener('change', handleChange)
      lightModeQuery.removeEventListener('change', handleChange)
    }
  }, [])

  return systemTheme
}

// =============================================================================
// ACCESSIBILITY PREFERENCES HOOK
// =============================================================================

export function useAccessibilityPreferences() {
  const [preferences, setPreferences] = useState(() => ({
    prefersReducedMotion: typeof window !== 'undefined' ? getReducedMotionPreference() : false,
    prefersHighContrast: typeof window !== 'undefined' ? getSystemHighContrast() : false,
  }))

  useEffect(() => {
    if (typeof window === 'undefined') return

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const contrastQuery = window.matchMedia('(prefers-contrast: high)')

    const handleChange = () => {
      setPreferences({
        prefersReducedMotion: getReducedMotionPreference(),
        prefersHighContrast: getSystemHighContrast(),
      })
    }

    motionQuery.addEventListener('change', handleChange)
    contrastQuery.addEventListener('change', handleChange)

    return () => {
      motionQuery.removeEventListener('change', handleChange)
      contrastQuery.removeEventListener('change', handleChange)
    }
  }, [])

  return preferences
}

export default ThemeProvider