import { io, Socket } from 'socket.io-client'

interface AnalysisUpdate {
  analysisId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  message?: string
  result?: any
}

interface WebSocketEvents {
  'analysis:update': (data: AnalysisUpdate) => void
  'analysis:completed': (data: AnalysisUpdate) => void
  'analysis:failed': (data: { analysisId: string; error: string }) => void
  'connection': () => void
  'disconnect': () => void
}

class WebSocketService {
  private socket: Socket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectTimeout: NodeJS.Timeout | null = null
  private listeners: Map<string, Set<Function>> = new Map()

  connect(token?: string) {
    if (this.socket?.connected) {
      return
    }

    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8002'
    
    this.socket = io(wsUrl, {
      auth: {
        token: token || localStorage.getItem('fineprintai_token')
      },
      transports: ['websocket'],
      upgrade: false,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      timeout: 20000,
    })

    this.setupEventHandlers()
  }

  private setupEventHandlers() {
    if (!this.socket) return

    this.socket.on('connect', () => {
      console.log('WebSocket connected')
      this.reconnectAttempts = 0
      this.emit('connection')
    })

    this.socket.on('disconnect', (reason: string) => {
      console.log('WebSocket disconnected:', reason)
      this.emit('disconnect')
      
      if (reason === 'io server disconnect') {
        // Server forcefully disconnected, retry connection
        this.scheduleReconnect()
      }
    })

    this.socket.on('connect_error', (error: Error) => {
      console.error('WebSocket connection error:', error)
      this.scheduleReconnect()
    })

    // Analysis events
    this.socket.on('analysis:update', (data: AnalysisUpdate) => {
      console.log('Analysis update received:', data)
      this.emit('analysis:update', data)
    })

    this.socket.on('analysis:completed', (data: AnalysisUpdate) => {
      console.log('Analysis completed:', data)
      this.emit('analysis:completed', data)
    })

    this.socket.on('analysis:failed', (data: { analysisId: string; error: string }) => {
      console.log('Analysis failed:', data)
      this.emit('analysis:failed', data)
    })
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached')
      return
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000) // Exponential backoff, max 30s
    this.reconnectAttempts++

    this.reconnectTimeout = setTimeout(() => {
      console.log(`Reconnecting... attempt ${this.reconnectAttempts}`)
      this.connect()
    }, delay)
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    this.listeners.clear()
  }

  // Event management
  on<K extends keyof WebSocketEvents>(event: K, listener: WebSocketEvents[K]) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(listener)
  }

  off<K extends keyof WebSocketEvents>(event: K, listener: WebSocketEvents[K]) {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      eventListeners.delete(listener)
    }
  }

  private emit<K extends keyof WebSocketEvents>(
    event: K,
    ...args: Parameters<WebSocketEvents[K]>
  ) {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      eventListeners.forEach((listener) => {
        try {
          // @ts-ignore
          listener(...args)
        } catch (error) {
          console.error(`Error in WebSocket event listener for ${event}:`, error)
        }
      })
    }
  }

  // Analysis subscription
  subscribeToAnalysis(analysisId: string) {
    if (this.socket?.connected) {
      this.socket.emit('subscribe:analysis', { analysisId })
    }
  }

  unsubscribeFromAnalysis(analysisId: string) {
    if (this.socket?.connected) {
      this.socket.emit('unsubscribe:analysis', { analysisId })
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false
  }

  getConnectionState(): string {
    if (!this.socket) return 'disconnected'
    return this.socket.connected ? 'connected' : 'connecting'
  }
}

// Export singleton instance
export const webSocketService = new WebSocketService()
export default webSocketService

// Export types
export type { AnalysisUpdate, WebSocketEvents }