import { create } from 'zustand'
import { subscribeWithSelector, devtools, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { MMKV } from 'react-native-mmkv'

// Import store slices
import { createAuthSlice, type AuthSlice } from './slices/auth'
import { createAnalysisSlice, type AnalysisSlice } from './slices/analysis'
import { createOfflineSlice, type OfflineSlice } from './slices/offline'
import { createNotificationSlice, type NotificationSlice } from './slices/notifications'
import { createPreferencesSlice, type PreferencesSlice } from './slices/preferences'
import { createDocumentSlice, type DocumentSlice } from './slices/documents'
import { createSyncSlice, type SyncSlice } from './slices/sync'
import { createCameraSlice, type CameraSlice } from './slices/camera'
import { createBiometricSlice, type BiometricSlice } from './slices/biometric'

// Initialize MMKV for high-performance storage
const mmkv = new MMKV({
  id: 'fineprint-mobile',
  encryptionKey: 'fineprint-encryption-key-2024'
})

// Custom storage interface for Zustand
const mmkvStorage = {
  getItem: (name: string) => {
    const value = mmkv.getString(name)
    return value ?? null
  },
  setItem: (name: string, value: string) => {
    mmkv.set(name, value)
  },
  removeItem: (name: string) => {
    mmkv.delete(name)
  }
}

// Combined store type
export interface MobileStore extends 
  AuthSlice,
  AnalysisSlice,
  OfflineSlice,
  NotificationSlice,
  PreferencesSlice,
  DocumentSlice,
  SyncSlice,
  CameraSlice,
  BiometricSlice {}

// Create the main store
export const useMobileStore = create<MobileStore>()(
  devtools(
    subscribeWithSelector(
      immer(
        persist(
          (set, get, api) => ({
            // Combine all slices
            ...createAuthSlice(set, get, api),
            ...createAnalysisSlice(set, get, api),
            ...createOfflineSlice(set, get, api),
            ...createNotificationSlice(set, get, api),
            ...createPreferencesSlice(set, get, api),
            ...createDocumentSlice(set, get, api),
            ...createSyncSlice(set, get, api),
            ...createCameraSlice(set, get, api),
            ...createBiometricSlice(set, get, api)
          }),
          {
            name: 'fineprint-mobile-store',
            storage: mmkvStorage,
            // Persist only necessary data
            partialize: (state) => ({
              auth: {
                user: state.user,
                tokens: state.tokens,
                isAuthenticated: state.isAuthenticated,
                biometricEnabled: state.biometricEnabled,
                biometricType: state.biometricType
              },
              preferences: state.preferences,
              documents: {
                documents: state.documents,
                recentDocuments: state.recentDocuments
              },
              analyses: {
                analyses: state.analyses,
                recentAnalyses: state.recentAnalyses
              },
              offline: {
                pendingActions: state.pendingActions,
                lastSyncTime: state.lastSyncTime
              }
            }),
            // Merge persisted state
            merge: (persistedState, currentState) => ({
              ...currentState,
              ...persistedState
            }),
            version: 1,
            migrate: (persistedState: any, version: number) => {
              // Handle migration between versions
              if (version === 0) {
                // Migration from version 0 to 1
                return {
                  ...persistedState,
                  // Add any migration logic here
                }
              }
              return persistedState
            }
          }
        )
      )
    ),
    {
      name: 'fineprint-mobile-store'
    }
  )
)

// Selector hooks for performance optimization
export const useAuth = () => useMobileStore(state => ({
  user: state.user,
  tokens: state.tokens,
  isAuthenticated: state.isAuthenticated,
  isLoading: state.isLoading,
  error: state.error,
  biometricEnabled: state.biometricEnabled,
  biometricType: state.biometricType,
  login: state.login,
  logout: state.logout,
  refreshToken: state.refreshToken,
  enableBiometric: state.enableBiometric,
  authenticateWithBiometric: state.authenticateWithBiometric
}))

export const useAnalysis = () => useMobileStore(state => ({
  analyses: state.analyses,
  currentAnalysis: state.currentAnalysis,
  isAnalyzing: state.isAnalyzing,
  uploadProgress: state.uploadProgress,
  analysisProgress: state.analysisProgress,
  recentAnalyses: state.recentAnalyses,
  startAnalysis: state.startAnalysis,
  setAnalysisProgress: state.setAnalysisProgress,
  setCurrentAnalysis: state.setCurrentAnalysis,
  deleteAnalysis: state.deleteAnalysis
}))

export const useDocuments = () => useMobileStore(state => ({
  documents: state.documents,
  recentDocuments: state.recentDocuments,
  isUploading: state.isUploading,
  uploadProgress: state.uploadProgress,
  addDocument: state.addDocument,
  removeDocument: state.removeDocument,
  updateDocument: state.updateDocument
}))

export const useOffline = () => useMobileStore(state => ({
  isOnline: state.isOnline,
  isSync: state.isSync,
  pendingActions: state.pendingActions,
  lastSyncTime: state.lastSyncTime,
  syncError: state.syncError,
  addOfflineAction: state.addOfflineAction,
  removeOfflineAction: state.removeOfflineAction,
  syncPendingActions: state.syncPendingActions,
  setNetworkStatus: state.setNetworkStatus
}))

export const useNotifications = () => useMobileStore(state => ({
  notifications: state.notifications,
  unreadCount: state.unreadCount,
  isEnabled: state.isEnabled,
  preferences: state.notificationPreferences,
  addNotification: state.addNotification,
  removeNotification: state.removeNotification,
  markAsRead: state.markAsRead,
  updatePreferences: state.updateNotificationPreferences
}))

export const usePreferences = () => useMobileStore(state => ({
  preferences: state.preferences,
  updatePreferences: state.updatePreferences,
  resetPreferences: state.resetPreferences,
  syncPreferences: state.syncPreferences
}))

export const useCamera = () => useMobileStore(state => ({
  isEnabled: state.isCameraEnabled,
  hasPermission: state.hasCameraPermission,
  isCapturing: state.isCapturing,
  lastCapture: state.lastCapture,
  requestPermission: state.requestCameraPermission,
  captureDocument: state.captureDocument,
  processOCR: state.processOCR
}))

export const useBiometric = () => useMobileStore(state => ({
  isAvailable: state.isBiometricAvailable,
  supportedTypes: state.supportedBiometricTypes,
  isEnabled: state.biometricEnabled,
  checkAvailability: state.checkBiometricAvailability,
  authenticate: state.authenticateWithBiometric,
  enable: state.enableBiometric,
  disable: state.disableBiometric
}))

// Global actions
export const useStoreActions = () => useMobileStore(state => ({
  initialize: async () => {
    // Initialize all store slices
    await state.checkBiometricAvailability()
    await state.requestCameraPermission()
    state.setNetworkStatus(true) // Will be updated by network listener
    await state.syncPreferences()
  },
  reset: () => {
    // Reset all store data (useful for logout)
    state.clearAuth()
    state.clearAnalyses()
    state.clearDocuments()
    state.clearNotifications()
    state.clearPendingActions()
  }
}))

export * from './slices/auth'
export * from './slices/analysis'
export * from './slices/offline'
export * from './slices/notifications'
export * from './slices/preferences'
export * from './slices/documents'
export * from './slices/sync'
export * from './slices/camera'
export * from './slices/biometric'