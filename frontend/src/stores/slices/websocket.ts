import { StateCreator } from 'zustand'
import { io, Socket } from 'socket.io-client'
import type { RootStore, WebSocketState, WebSocketActions } from '../types'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080'
const RECONNECT_INTERVAL = 5000
const MAX_RECONNECT_ATTEMPTS = 10

type WebSocketSlice = WebSocketState & WebSocketActions

export const createWebSocketSlice: StateCreator<
  RootStore,
  [],
  [],
  WebSocketSlice
> = (set, get) => {
  let socket: Socket | null = null
  let reconnectTimer: NodeJS.Timeout | null = null

  return {
    // Initial state
    isConnected: false,
    isConnecting: false,
    error: null,
    lastActivity: null,
    reconnectAttempts: 0,
    subscriptions: [],

    // Actions
    connect: () => {
      const { isConnected, isConnecting } = get().websocket
      
      if (isConnected || isConnecting) {
        return
      }

      const { tokens } = get().auth
      
      if (!tokens?.accessToken) {
        console.warn('Cannot connect to WebSocket: No access token')
        return
      }

      set({ 
        isConnecting: true, 
        error: null 
      })

      try {
        socket = io(WS_URL, {
          auth: {
            token: tokens.accessToken
          },
          transports: ['websocket'],
          upgrade: false,
          rememberUpgrade: false,
          timeout: 10000
        })

        // Connection successful
        socket.on('connect', () => {
          set({
            isConnected: true,
            isConnecting: false,
            error: null,
            reconnectAttempts: 0,
            lastActivity: new Date()
          })

          // Resubscribe to channels
          const { subscriptions } = get().websocket
          if (subscriptions.length > 0) {
            socket?.emit('subscribe', { channels: subscriptions })
          }

          get().notifications.addNotification({
            type: 'success',
            title: 'Connected',
            message: 'Real-time updates are now active'
          })
        })

        // Connection error
        socket.on('connect_error', (error) => {
          set({
            isConnected: false,
            isConnecting: false,
            error: error.message
          })

          get().websocket.scheduleReconnect()
        })

        // Disconnection
        socket.on('disconnect', (reason) => {
          set({
            isConnected: false,
            isConnecting: false,
            error: reason
          })

          // Only attempt reconnect if it wasn't a manual disconnect
          if (reason !== 'io client disconnect') {
            get().websocket.scheduleReconnect()
          }
        })

        // Handle various message types
        socket.on('analysis_progress', (data) => {
          get().analysis.setAnalysisProgress(data.analysisId, data.percentage)
          set({ lastActivity: new Date() })
        })

        socket.on('analysis_complete', (data) => {
          get().analysis.fetchAnalysisResult(data.analysisId)
          get().notifications.handleWebSocketNotification({
            type: 'analysis_complete',
            payload: data
          })
          set({ lastActivity: new Date() })
        })

        socket.on('document_change', (data) => {
          get().notifications.handleWebSocketNotification({
            type: 'document_change',
            payload: data
          })
          set({ lastActivity: new Date() })
        })

        socket.on('notification', (data) => {
          get().notifications.handleWebSocketNotification({
            type: 'notification',
            payload: data
          })
          set({ lastActivity: new Date() })
        })

        socket.on('system_alert', (data) => {
          get().notifications.handleWebSocketNotification({
            type: 'system_alert',
            payload: data
          })
          set({ lastActivity: new Date() })
        })

        socket.on('user_presence', (data) => {
          // Handle user presence updates if needed
          set({ lastActivity: new Date() })
        })

        socket.on('queue_stats', (data) => {
          // Handle queue statistics updates
          set({ lastActivity: new Date() })
        })

        // Handle pong responses
        socket.on('pong', () => {
          set({ lastActivity: new Date() })
        })

        // Handle subscription confirmations
        socket.on('subscribed', (data) => {
          console.log('Subscribed to channels:', data.channels)
        })

        socket.on('unsubscribed', (data) => {
          console.log('Unsubscribed from channels:', data.channels)
        })

        // Handle errors
        socket.on('error', (error) => {
          console.error('WebSocket error:', error)
          set({ error: error.message })
        })

      } catch (error: any) {
        set({
          isConnected: false,
          isConnecting: false,
          error: error.message
        })
      }
    },

    disconnect: () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }

      if (socket) {
        socket.disconnect()
        socket = null
      }

      set({
        isConnected: false,
        isConnecting: false,
        error: null,
        subscriptions: []
      })
    },

    subscribe: (channels: string[]) => {
      set(state => ({
        subscriptions: [...new Set([...state.subscriptions, ...channels])]
      }))

      if (socket?.connected) {
        socket.emit('subscribe', { channels })
      }
    },

    unsubscribe: (channels: string[]) => {
      set(state => ({
        subscriptions: state.subscriptions.filter(sub => !channels.includes(sub))
      }))

      if (socket?.connected) {
        socket.emit('unsubscribe', { channels })
      }
    },

    send: (type: string, payload: any) => {
      if (!socket?.connected) {
        console.warn('Cannot send message: WebSocket not connected')
        return
      }

      socket.emit(type, payload)
      set({ lastActivity: new Date() })
    },

    clearError: () => {
      set({ error: null })
    },

    // Helper methods (not exposed in interface)
    scheduleReconnect: () => {
      const { reconnectAttempts } = get().websocket
      
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        set({ error: 'Maximum reconnection attempts reached' })
        get().notifications.addNotification({
          type: 'error',
          title: 'Connection Lost',
          message: 'Unable to reconnect to real-time updates. Please refresh the page.',
          persistent: true
        })
        return
      }

      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }

      const delay = Math.min(RECONNECT_INTERVAL * Math.pow(2, reconnectAttempts), 30000)
      
      reconnectTimer = setTimeout(() => {
        set(state => ({
          reconnectAttempts: state.reconnectAttempts + 1
        }))
        
        get().websocket.connect()
      }, delay)
    },

    // Heartbeat to keep connection alive
    startHeartbeat: () => {
      const heartbeatInterval = setInterval(() => {
        if (socket?.connected) {
          socket.emit('ping')
        } else {
          clearInterval(heartbeatInterval)
        }
      }, 30000) // Ping every 30 seconds
    },

    // Initialize token refresh listener
    initializeTokenRefresh: () => {
      // Listen for token refresh events
      const originalRefreshToken = get().auth.refreshToken
      
      // Override refresh token to update WebSocket auth
      get().auth.refreshToken = async () => {
        await originalRefreshToken()
        
        // Reconnect with new token
        if (get().websocket.isConnected) {
          get().websocket.disconnect()
          setTimeout(() => {
            get().websocket.connect()
          }, 100)
        }
      }
    }
  } as any // Type assertion needed for helper methods
}