import type { StateCreator } from 'zustand'
import { apiClient } from '@/services/api'
import type { MobilePreferences } from '@/types'

export interface PreferencesSlice {
  preferences: MobilePreferences
  
  // Actions
  updatePreferences: (updates: Partial<MobilePreferences>) => void
  resetPreferences: () => void
  syncPreferences: () => Promise<void>
}

const defaultPreferences: MobilePreferences = {
  theme: 'system',
  language: 'en',
  fontSize: 'medium',
  animations: true,
  hapticFeedback: true,
  autoUpload: false,
  wifiOnly: true,
  keepScreenOn: false,
  notifications: {
    enabled: true,
    analysisComplete: true,
    documentShared: true,
    weeklyDigest: true,
    systemUpdates: true,
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00'
    }
  },
  security: {
    biometricLogin: false,
    autoLockTime: 5,
    requireBiometricForActions: false
  },
  analytics: {
    allowCrashReporting: true,
    allowUsageAnalytics: true,
    allowPerformanceTracking: true
  }
}

export const createPreferencesSlice: StateCreator<
  PreferencesSlice,
  [['zustand/immer', never], ['zustand/devtools', never], ['zustand/subscribeWithSelector', never]],
  [],
  PreferencesSlice
> = (set, get) => ({
  // Initial state
  preferences: defaultPreferences,

  // Actions
  updatePreferences: (updates) => {
    set(state => {
      state.preferences = {
        ...state.preferences,
        ...updates
      }
    })
    
    // Sync with server if online
    get().syncPreferences().catch(console.error)
  },

  resetPreferences: () => {
    set(state => {
      state.preferences = { ...defaultPreferences }
    })
    
    // Sync with server if online
    get().syncPreferences().catch(console.error)
  },

  syncPreferences: async () => {
    try {
      const { preferences } = get()
      
      // Upload preferences to server
      await apiClient.put('/user/preferences', {
        mobilePreferences: preferences
      })
      
    } catch (error) {
      console.error('Failed to sync preferences:', error)
      // Don't throw error to avoid breaking the app
    }
  }
})