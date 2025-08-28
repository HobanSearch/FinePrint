import { StateCreator } from 'zustand'
import { jwtDecode } from 'jwt-decode'
import type { RootStore, AuthState, AuthActions } from '../types'
import type { JWTPayload, UserProfile, TokenPair } from '../../../../backend/shared/types/src'
import { apiClient } from '../../lib/api-client'
import { storage } from '../../lib/storage'

const AUTH_STORAGE_KEY = 'fineprint_auth'
const REFRESH_THRESHOLD = 5 * 60 * 1000 // 5 minutes before expiry

type AuthSlice = AuthState & AuthActions

export const createAuthSlice: StateCreator<
  RootStore,
  [],
  [],
  AuthSlice
> = (set, get) => ({
  // Initial state
  user: null,
  tokens: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  // Actions
  login: async (email: string, password: string, rememberMe = false) => {
    set({ isLoading: true, error: null })
    
    try {
      const response = await apiClient.post<{
        user: UserProfile
        tokens: TokenPair
      }>('/auth/login', {
        email,
        password,
        rememberMe
      })

      const { user, tokens } = response.data
      
      // Store tokens persistently if remember me is checked
      if (rememberMe) {
        await storage.set(AUTH_STORAGE_KEY, { user, tokens })
      }

      // Set auth state
      set({
        user,
        tokens,
        isAuthenticated: true,
        isLoading: false,
        error: null
      })

      // Set up automatic token refresh
      get().auth.scheduleTokenRefresh()

      // Notify other stores
      get().notifications.addNotification({
        type: 'success',
        title: 'Welcome back!',
        message: `Logged in as ${user.email}`
      })

    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Login failed'
      set({
        isLoading: false,
        error: errorMessage,
        isAuthenticated: false,
        user: null,
        tokens: null
      })

      get().notifications.addNotification({
        type: 'error',
        title: 'Login Failed',
        message: errorMessage
      })

      throw error
    }
  },

  logout: async () => {
    const { tokens } = get().auth
    
    try {
      // Notify server about logout
      if (tokens?.refreshToken) {
        await apiClient.post('/auth/logout', {
          refreshToken: tokens.refreshToken
        })
      }
    } catch (error) {
      // Ignore logout errors, we're logging out anyway
      console.warn('Logout API call failed:', error)
    }

    // Clear local storage
    await storage.remove(AUTH_STORAGE_KEY)

    // Clear state
    set({
      user: null,
      tokens: null,
      isAuthenticated: false,
      error: null
    })

    // Disconnect WebSocket
    get().websocket.disconnect()

    // Clear sensitive data from other stores
    set({
      analysis: {
        ...get().analysis,
        analyses: {},
        currentAnalysis: null
      }
    })

    get().notifications.addNotification({
      type: 'info',
      title: 'Logged out',
      message: 'You have been successfully logged out'
    })
  },

  refreshToken: async () => {
    const { tokens } = get().auth
    
    if (!tokens?.refreshToken) {
      get().auth.logout()
      return
    }

    try {
      const response = await apiClient.post<TokenPair>('/auth/refresh', {
        refreshToken: tokens.refreshToken
      })

      const newTokens = response.data
      
      // Update stored tokens
      const storedAuth = await storage.get(AUTH_STORAGE_KEY)
      if (storedAuth) {
        await storage.set(AUTH_STORAGE_KEY, {
          ...storedAuth,
          tokens: newTokens
        })
      }

      set({
        tokens: newTokens
      })

      // Schedule next refresh
      get().auth.scheduleTokenRefresh()

    } catch (error) {
      console.error('Token refresh failed:', error)
      get().auth.logout()
    }
  },

  setUser: (user: UserProfile) => {
    set({ user })
  },

  setTokens: (tokens: TokenPair) => {
    set({ tokens })
  },

  clearError: () => {
    set({ error: null })
  },

  checkAuthStatus: async () => {
    set({ isLoading: true })

    try {
      // Check for stored auth data
      const storedAuth = await storage.get(AUTH_STORAGE_KEY)
      
      if (!storedAuth?.tokens?.accessToken) {
        set({ isLoading: false })
        return
      }

      // Decode and validate token
      const decoded = jwtDecode<JWTPayload>(storedAuth.tokens.accessToken)
      const now = Date.now() / 1000
      
      // If token is expired, try to refresh
      if (decoded.exp < now) {
        await get().auth.refreshToken()
      } else {
        // Token is valid, restore auth state
        set({
          user: storedAuth.user,
          tokens: storedAuth.tokens,
          isAuthenticated: true,
          isLoading: false
        })

        // Schedule token refresh
        get().auth.scheduleTokenRefresh()

        // Reconnect WebSocket
        get().websocket.connect()
      }

    } catch (error) {
      console.error('Auth check failed:', error)
      await storage.remove(AUTH_STORAGE_KEY)
      set({
        isLoading: false,
        isAuthenticated: false,
        user: null,
        tokens: null
      })
    }
  },

  // Helper method for scheduling token refresh (not exposed in interface)
  scheduleTokenRefresh: () => {
    const { tokens } = get().auth
    
    if (!tokens?.accessToken) return

    try {
      const decoded = jwtDecode<JWTPayload>(tokens.accessToken)
      const expiryTime = decoded.exp * 1000 // Convert to milliseconds
      const refreshTime = expiryTime - REFRESH_THRESHOLD
      const timeUntilRefresh = refreshTime - Date.now()

      if (timeUntilRefresh > 0) {
        setTimeout(() => {
          get().auth.refreshToken()
        }, timeUntilRefresh)
      } else {
        // Token expires soon, refresh immediately
        get().auth.refreshToken()
      }
    } catch (error) {
      console.error('Token scheduling failed:', error)
    }
  }
} as any) // Type assertion needed for the helper method