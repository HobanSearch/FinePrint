import type { StateCreator } from 'zustand'
import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'
import { apiClient } from '@/services/api'
import type { UserProfile, TokenPair, MobileAuthState, BiometricAuthOptions, BiometricAuthResult } from '@/types'

export interface AuthSlice extends MobileAuthState {
  // Actions
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>
  logout: () => Promise<void>
  refreshToken: () => Promise<void>
  checkAuthStatus: () => Promise<void>
  clearAuth: () => void
  setUser: (user: UserProfile) => void
  setTokens: (tokens: TokenPair) => void
  clearError: () => void
  
  // Biometric actions
  enableBiometric: () => Promise<void>
  disableBiometric: () => Promise<void>
  authenticateWithBiometric: (options?: BiometricAuthOptions) => Promise<BiometricAuthResult>
  checkBiometricAvailability: () => Promise<void>
}

const SECURE_STORE_KEYS = {
  TOKENS: 'fineprint_tokens',
  USER: 'fineprint_user',
  BIOMETRIC_ENABLED: 'fineprint_biometric_enabled'
}

export const createAuthSlice: StateCreator<
  AuthSlice,
  [['zustand/immer', never], ['zustand/devtools', never], ['zustand/subscribeWithSelector', never]],
  [],
  AuthSlice
> = (set, get) => ({
  // Initial state
  user: null,
  tokens: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  biometricEnabled: false,
  biometricType: null,

  // Actions
  login: async (email: string, password: string, rememberMe = false) => {
    set(state => {
      state.isLoading = true
      state.error = null
    })

    try {
      const response = await apiClient.post('/auth/login', {
        email,
        password,
        rememberMe,
        deviceInfo: {
          platform: 'mobile',
          deviceId: await getDeviceId()
        }
      })

      const { user, tokens } = response.data

      // Store tokens securely
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.TOKENS, JSON.stringify(tokens))
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.USER, JSON.stringify(user))

      set(state => {
        state.user = user
        state.tokens = tokens
        state.isAuthenticated = true
        state.isLoading = false
        state.error = null
      })

      // Check if biometric authentication should be enabled
      const biometricEnabled = await SecureStore.getItemAsync(SECURE_STORE_KEYS.BIOMETRIC_ENABLED)
      if (biometricEnabled === 'true') {
        await get().checkBiometricAvailability()
      }

    } catch (error: any) {
      set(state => {
        state.isLoading = false
        state.error = error.message || 'Login failed'
        state.isAuthenticated = false
        state.user = null
        state.tokens = null
      })
      throw error
    }
  },

  logout: async () => {
    set(state => {
      state.isLoading = true
    })

    try {
      const { tokens } = get()
      
      if (tokens?.refreshToken) {
        // Notify server of logout
        await apiClient.post('/auth/logout', {
          refreshToken: tokens.refreshToken
        })
      }

      // Clear secure storage
      await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.TOKENS)
      await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.USER)

      set(state => {
        state.user = null
        state.tokens = null
        state.isAuthenticated = false
        state.isLoading = false
        state.error = null
        state.biometricEnabled = false
        state.biometricType = null
      })

    } catch (error: any) {
      console.error('Logout error:', error)
      // Still clear local state even if server request fails
      set(state => {
        state.user = null
        state.tokens = null
        state.isAuthenticated = false
        state.isLoading = false
        state.error = null
        state.biometricEnabled = false
        state.biometricType = null
      })
    }
  },

  refreshToken: async () => {
    const { tokens } = get()
    
    if (!tokens?.refreshToken) {
      throw new Error('No refresh token available')
    }

    try {
      const response = await apiClient.post('/auth/refresh', {
        refreshToken: tokens.refreshToken
      })

      const newTokens = response.data

      // Store new tokens
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.TOKENS, JSON.stringify(newTokens))

      set(state => {
        state.tokens = newTokens
        state.error = null
      })

      return newTokens

    } catch (error: any) {
      // Refresh failed, clear auth state
      await get().logout()
      throw error
    }
  },

  checkAuthStatus: async () => {
    set(state => {
      state.isLoading = true
    })

    try {
      // Check for stored tokens and user
      const storedTokens = await SecureStore.getItemAsync(SECURE_STORE_KEYS.TOKENS)
      const storedUser = await SecureStore.getItemAsync(SECURE_STORE_KEYS.USER)

      if (storedTokens && storedUser) {
        const tokens = JSON.parse(storedTokens)
        const user = JSON.parse(storedUser)

        // Check if tokens are still valid
        if (isTokenExpired(tokens.accessToken)) {
          // Try to refresh
          await get().refreshToken()
        } else {
          set(state => {
            state.user = user
            state.tokens = tokens
            state.isAuthenticated = true
            state.isLoading = false
          })
        }

        // Check biometric settings
        const biometricEnabled = await SecureStore.getItemAsync(SECURE_STORE_KEYS.BIOMETRIC_ENABLED)
        if (biometricEnabled === 'true') {
          await get().checkBiometricAvailability()
        }
      } else {
        set(state => {
          state.isLoading = false
          state.isAuthenticated = false
        })
      }

    } catch (error: any) {
      console.error('Auth status check failed:', error)
      set(state => {
        state.isLoading = false
        state.isAuthenticated = false
        state.error = error.message
      })
    }
  },

  clearAuth: () => {
    set(state => {
      state.user = null
      state.tokens = null
      state.isAuthenticated = false
      state.isLoading = false
      state.error = null
      state.biometricEnabled = false
      state.biometricType = null
    })
  },

  setUser: (user: UserProfile) => {
    set(state => {
      state.user = user
    })
  },

  setTokens: (tokens: TokenPair) => {
    set(state => {
      state.tokens = tokens
    })
  },

  clearError: () => {
    set(state => {
      state.error = null
    })
  },

  // Biometric authentication methods
  enableBiometric: async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync()
    const isEnrolled = await LocalAuthentication.isEnrolledAsync()

    if (!hasHardware || !isEnrolled) {
      throw new Error('Biometric authentication is not available on this device')
    }

    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync()
    
    // Test biometric authentication
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Enable biometric authentication for Fine Print AI',
      cancelLabel: 'Cancel',
      disableDeviceFallback: true
    })

    if (result.success) {
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.BIOMETRIC_ENABLED, 'true')
      
      set(state => {
        state.biometricEnabled = true
        state.biometricType = getBiometricType(supportedTypes)
      })
    } else {
      throw new Error('Biometric authentication failed')
    }
  },

  disableBiometric: async () => {
    await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.BIOMETRIC_ENABLED)
    
    set(state => {
      state.biometricEnabled = false
      state.biometricType = null
    })
  },

  authenticateWithBiometric: async (options = {}) => {
    const { biometricEnabled } = get()
    
    if (!biometricEnabled) {
      return { success: false, error: 'Biometric authentication is not enabled' }
    }

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: options.promptMessage || 'Authenticate with biometrics',
        cancelLabel: options.cancelButtonText || 'Cancel',
        fallbackLabel: options.fallbackLabel || 'Use passcode',
        disableDeviceFallback: options.disableDeviceFallback || false
      })

      return {
        success: result.success,
        error: result.error,
        warning: result.warning
      }

    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Biometric authentication failed'
      }
    }
  },

  checkBiometricAvailability: async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync()
      const isEnrolled = await LocalAuthentication.isEnrolledAsync()
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync()

      if (hasHardware && isEnrolled && supportedTypes.length > 0) {
        const biometricEnabled = await SecureStore.getItemAsync(SECURE_STORE_KEYS.BIOMETRIC_ENABLED)
        
        set(state => {
          state.biometricEnabled = biometricEnabled === 'true'
          state.biometricType = getBiometricType(supportedTypes)
        })
      } else {
        set(state => {
          state.biometricEnabled = false
          state.biometricType = null
        })
      }

    } catch (error) {
      console.error('Biometric availability check failed:', error)
      set(state => {
        state.biometricEnabled = false
        state.biometricType = null
      })
    }
  }
})

// Helper functions
async function getDeviceId(): Promise<string> {
  try {
    let deviceId = await SecureStore.getItemAsync('device_id')
    if (!deviceId) {
      deviceId = generateUUID()
      await SecureStore.setItemAsync('device_id', deviceId)
    }
    return deviceId
  } catch {
    return generateUUID()
  }
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    const currentTime = Math.floor(Date.now() / 1000)
    return payload.exp < currentTime
  } catch {
    return true
  }
}

function getBiometricType(supportedTypes: LocalAuthentication.AuthenticationType[]): 'fingerprint' | 'face' | 'iris' | null {
  if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return 'face'
  }
  if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return 'fingerprint'
  }
  if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return 'iris'
  }
  return null
}