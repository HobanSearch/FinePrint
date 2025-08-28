import type { StateCreator } from 'zustand'
import * as LocalAuthentication from 'expo-local-authentication'
import type { BiometricAuthOptions, BiometricAuthResult } from '@/types'

export interface BiometricSlice {
  isBiometricAvailable: boolean
  supportedBiometricTypes: LocalAuthentication.AuthenticationType[]
  biometricEnabled: boolean
  
  // Actions
  checkBiometricAvailability: () => Promise<void>
  authenticateWithBiometric: (options?: BiometricAuthOptions) => Promise<BiometricAuthResult>
  enableBiometric: () => Promise<void>
  disableBiometric: () => Promise<void>
}

export const createBiometricSlice: StateCreator<
  BiometricSlice,
  [['zustand/immer', never], ['zustand/devtools', never], ['zustand/subscribeWithSelector', never]],
  [],
  BiometricSlice
> = (set, get) => ({
  // Initial state
  isBiometricAvailable: false,
  supportedBiometricTypes: [],
  biometricEnabled: false,

  // Actions
  checkBiometricAvailability: async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync()
      const isEnrolled = await LocalAuthentication.isEnrolledAsync()
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync()
      
      const isAvailable = hasHardware && isEnrolled && supportedTypes.length > 0
      
      set(state => {
        state.isBiometricAvailable = isAvailable
        state.supportedBiometricTypes = supportedTypes
      })
      
    } catch (error) {
      console.error('Biometric availability check failed:', error)
      set(state => {
        state.isBiometricAvailable = false
        state.supportedBiometricTypes = []
      })
    }
  },

  authenticateWithBiometric: async (options = {}) => {
    const { isBiometricAvailable } = get()
    
    if (!isBiometricAvailable) {
      return { success: false, error: 'Biometric authentication is not available' }
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

  enableBiometric: async () => {
    const { isBiometricAvailable } = get()
    
    if (!isBiometricAvailable) {
      throw new Error('Biometric authentication is not available')
    }

    const result = await get().authenticateWithBiometric({
      promptMessage: 'Enable biometric authentication for Fine Print AI'
    })

    if (result.success) {
      set(state => {
        state.biometricEnabled = true
      })
    } else {
      throw new Error(result.error || 'Failed to enable biometric authentication')
    }
  },

  disableBiometric: async () => {
    set(state => {
      state.biometricEnabled = false
    })
  }
})