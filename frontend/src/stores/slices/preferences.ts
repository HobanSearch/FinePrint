import { StateCreator } from 'zustand'
import type { RootStore, UserPreferencesState, UserPreferencesActions } from '../types'
import { apiClient } from '../../lib/api-client'
import { storage } from '../../lib/storage'

const PREFERENCES_STORAGE_KEY = 'fineprint_preferences'

const defaultPreferences: UserPreferencesState = {
  theme: 'system',
  language: 'en',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  notifications: {
    email: true,
    push: true,
    analysisComplete: true,
    documentChanges: true,
    weeklyDigest: true
  },
  dashboard: {
    defaultView: 'upload',
    showQuickStats: true,
    chartsType: 'line'
  },
  analysis: {
    autoStart: false,
    showConfidenceScores: true,
    groupByCategory: true,
    defaultSeverityFilter: 'all'
  },
  accessibility: {
    reducedMotion: false,
    highContrast: false,
    fontSize: 'medium',
    screenReader: false
  }
}

type PreferencesSlice = UserPreferencesState & UserPreferencesActions

export const createPreferencesSlice: StateCreator<
  RootStore,
  [],
  [],
  PreferencesSlice
> = (set, get) => ({
  // Initial state - spread default preferences
  ...defaultPreferences,

  // Actions
  updatePreferences: async (updates: Partial<UserPreferencesState>) => {
    const currentPrefs = get().preferences
    const newPreferences = {
      ...currentPrefs,
      ...updates,
      // Handle nested object updates properly
      notifications: updates.notifications ? 
        { ...currentPrefs.notifications, ...updates.notifications } : 
        currentPrefs.notifications,
      dashboard: updates.dashboard ? 
        { ...currentPrefs.dashboard, ...updates.dashboard } : 
        currentPrefs.dashboard,
      analysis: updates.analysis ? 
        { ...currentPrefs.analysis, ...updates.analysis } : 
        currentPrefs.analysis,
      accessibility: updates.accessibility ? 
        { ...currentPrefs.accessibility, ...updates.accessibility } : 
        currentPrefs.accessibility,
    }

    // Update state
    set(newPreferences)

    // Apply theme changes immediately
    if (updates.theme) {
      get().preferences.applyTheme(updates.theme)
    }

    // Apply accessibility changes
    if (updates.accessibility) {
      get().preferences.applyAccessibilitySettings(updates.accessibility)
    }

    // Persist locally
    await storage.set(PREFERENCES_STORAGE_KEY, newPreferences)

    // Sync with server if user is authenticated
    if (get().auth.isAuthenticated) {
      get().preferences.syncPreferences()
    }

    get().notifications.addNotification({
      type: 'success',
      title: 'Preferences Updated',
      message: 'Your preferences have been saved successfully'
    })
  },

  resetPreferences: async () => {
    set(defaultPreferences)
    
    // Apply default theme and accessibility
    get().preferences.applyTheme(defaultPreferences.theme)
    get().preferences.applyAccessibilitySettings(defaultPreferences.accessibility)

    // Clear local storage
    await storage.remove(PREFERENCES_STORAGE_KEY)

    // Reset on server if authenticated
    if (get().auth.isAuthenticated) {
      try {
        await apiClient.post('/user/preferences/reset')
      } catch (error) {
        console.error('Failed to reset server preferences:', error)
      }
    }

    get().notifications.addNotification({
      type: 'info',
      title: 'Preferences Reset',
      message: 'All preferences have been reset to default values'
    })
  },

  syncPreferences: async () => {
    if (!get().auth.isAuthenticated) return

    try {
      const preferences = get().preferences

      // Upload current preferences to server
      await apiClient.put('/user/preferences', {
        theme: preferences.theme,
        language: preferences.language,
        timezone: preferences.timezone,
        notifications: preferences.notifications,
        dashboard: preferences.dashboard,
        analysis: preferences.analysis,
        accessibility: preferences.accessibility
      })

    } catch (error: any) {
      console.error('Failed to sync preferences:', error)
      
      // Don't show error notification for sync failures
      // as they're not critical to user experience
    }
  },

  setTheme: (theme: UserPreferencesState['theme']) => {
    get().preferences.updatePreferences({ theme })
  },

  setLanguage: (language: string) => {
    get().preferences.updatePreferences({ language })
  },

  // Helper methods (not exposed in interface)
  loadPreferences: async () => {
    try {
      // Load from local storage first
      const stored = await storage.get(PREFERENCES_STORAGE_KEY)
      
      if (stored) {
        // Merge with defaults to handle new preference keys
        const mergedPreferences = {
          ...defaultPreferences,
          ...stored,
          notifications: { ...defaultPreferences.notifications, ...stored.notifications },
          dashboard: { ...defaultPreferences.dashboard, ...stored.dashboard },
          analysis: { ...defaultPreferences.analysis, ...stored.analysis },
          accessibility: { ...defaultPreferences.accessibility, ...stored.accessibility }
        }

        set(mergedPreferences)
        get().preferences.applyTheme(mergedPreferences.theme)
        get().preferences.applyAccessibilitySettings(mergedPreferences.accessibility)
      }

      // If user is authenticated, fetch from server and merge
      if (get().auth.isAuthenticated) {
        try {
          const response = await apiClient.get('/user/preferences')
          const serverPrefs = response.data

          // Merge server preferences with local ones (server takes precedence)
          const finalPreferences = get().preferences
          const updatedPreferences = {
            ...finalPreferences,
            ...serverPrefs,
            notifications: { ...finalPreferences.notifications, ...serverPrefs.notifications },
            dashboard: { ...finalPreferences.dashboard, ...serverPrefs.dashboard },
            analysis: { ...finalPreferences.analysis, ...serverPrefs.analysis },
            accessibility: { ...finalPreferences.accessibility, ...serverPrefs.accessibility }
          }

          set(updatedPreferences)
          get().preferences.applyTheme(updatedPreferences.theme)
          get().preferences.applyAccessibilitySettings(updatedPreferences.accessibility)

          // Update local cache
          await storage.set(PREFERENCES_STORAGE_KEY, updatedPreferences)

        } catch (error) {
          console.error('Failed to load server preferences:', error)
        }
      }

    } catch (error) {
      console.error('Failed to load preferences:', error)
      
      // Fall back to defaults
      set(defaultPreferences)
      get().preferences.applyTheme(defaultPreferences.theme)
    }
  },

  applyTheme: (theme: UserPreferencesState['theme']) => {
    const root = document.documentElement
    
    if (theme === 'system') {
      // Use system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.classList.toggle('dark', prefersDark)
    } else {
      // Use explicit theme
      root.classList.toggle('dark', theme === 'dark')
    }

    // Listen for system theme changes if using system theme
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      
      const handleChange = (e: MediaQueryListEvent) => {
        if (get().preferences.theme === 'system') {
          root.classList.toggle('dark', e.matches)
        }
      }

      mediaQuery.removeEventListener('change', handleChange) // Remove existing listener
      mediaQuery.addEventListener('change', handleChange)
    }
  },

  applyAccessibilitySettings: (accessibility: Partial<UserPreferencesState['accessibility']>) => {
    const root = document.documentElement

    if (accessibility.reducedMotion !== undefined) {
      root.classList.toggle('reduce-motion', accessibility.reducedMotion)
    }

    if (accessibility.highContrast !== undefined) {
      root.classList.toggle('high-contrast', accessibility.highContrast)
    }

    if (accessibility.fontSize) {
      // Remove existing font size classes
      root.classList.remove('font-size-small', 'font-size-medium', 'font-size-large')
      root.classList.add(`font-size-${accessibility.fontSize}`)
    }

    // Set CSS custom properties for dynamic access
    if (accessibility.reducedMotion !== undefined) {
      root.style.setProperty('--motion-duration', accessibility.reducedMotion ? '0s' : '0.2s')
    }
  },

  // Initialize preferences on app startup
  initialize: async () => {
    await get().preferences.loadPreferences()
    
    // Set up system theme change listener
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', () => {
      if (get().preferences.theme === 'system') {
        get().preferences.applyTheme('system')
      }
    })

    // Set up prefers-reduced-motion listener
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    motionQuery.addEventListener('change', (e) => {
      if (e.matches && !get().preferences.accessibility.reducedMotion) {
        get().preferences.updatePreferences({
          accessibility: {
            ...get().preferences.accessibility,
            reducedMotion: true
          }
        })
      }
    })
  }
} as any) // Type assertion needed for helper methods