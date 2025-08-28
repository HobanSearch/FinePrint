import { useEffect, useRef, useState, useCallback } from 'react'
import { useStore } from '@/stores'

export interface WebSocketMessage {
  type: 'experiment_update' | 'metric_update' | 'model_update' | 'alert' | 'connection'
  data: any
  timestamp: string
}

export interface WebSocketOptions {
  url: string
  reconnect?: boolean
  reconnectInterval?: number
  reconnectAttempts?: number
  heartbeatInterval?: number
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: Event) => void
  onMessage?: (message: WebSocketMessage) => void
}

export enum WebSocketState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

export const useWebSocket = (options: WebSocketOptions) => {
  const {
    url,
    reconnect = true,
    reconnectInterval = 3000,
    reconnectAttempts = 5,
    heartbeatInterval = 30000,
    onOpen,
    onClose,
    onError,
    onMessage,
  } = options

  const [readyState, setReadyState] = useState<WebSocketState>(WebSocketState.CLOSED)
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
  const [messageHistory, setMessageHistory] = useState<WebSocketMessage[]>([])
  const [reconnectCount, setReconnectCount] = useState(0)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>()
  const heartbeatIntervalRef = useRef<NodeJS.Timeout>()

  const connect = useCallback(() => {
    try {
      if (wsRef.current?.readyState === WebSocketState.OPEN) {
        return
      }

      console.log(`[WebSocket] Connecting to ${url}...`)
      wsRef.current = new WebSocket(url)
      setReadyState(WebSocketState.CONNECTING)

      wsRef.current.onopen = () => {
        console.log('[WebSocket] Connected')
        setReadyState(WebSocketState.OPEN)
        setReconnectCount(0)
        onOpen?.()

        // Start heartbeat
        if (heartbeatInterval > 0) {
          heartbeatIntervalRef.current = setInterval(() => {
            if (wsRef.current?.readyState === WebSocketState.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'ping' }))
            }
          }, heartbeatInterval)
        }
      }

      wsRef.current.onclose = () => {
        console.log('[WebSocket] Disconnected')
        setReadyState(WebSocketState.CLOSED)
        onClose?.()

        // Clear heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current)
        }

        // Attempt reconnection
        if (reconnect && reconnectCount < reconnectAttempts) {
          console.log(`[WebSocket] Reconnecting in ${reconnectInterval}ms... (attempt ${reconnectCount + 1}/${reconnectAttempts})`)
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectCount(prev => prev + 1)
            connect()
          }, reconnectInterval)
        }
      }

      wsRef.current.onerror = (error) => {
        console.error('[WebSocket] Error:', error)
        onError?.(error)
      }

      wsRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          
          // Ignore pong messages
          if (message.type === 'pong') {
            return
          }

          setLastMessage(message)
          setMessageHistory(prev => [...prev.slice(-99), message]) // Keep last 100 messages
          onMessage?.(message)
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error)
        }
      }
    } catch (error) {
      console.error('[WebSocket] Connection error:', error)
      setReadyState(WebSocketState.CLOSED)
    }
  }, [url, reconnect, reconnectInterval, reconnectAttempts, reconnectCount, heartbeatInterval, onOpen, onClose, onError, onMessage])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
    }

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    setReadyState(WebSocketState.CLOSED)
  }, [])

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocketState.OPEN) {
      wsRef.current.send(JSON.stringify(message))
      return true
    }
    console.warn('[WebSocket] Cannot send message - not connected')
    return false
  }, [])

  const clearHistory = useCallback(() => {
    setMessageHistory([])
  }, [])

  useEffect(() => {
    connect()

    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  return {
    readyState,
    lastMessage,
    messageHistory,
    sendMessage,
    clearHistory,
    reconnect: connect,
    disconnect,
    isConnected: readyState === WebSocketState.OPEN,
    isConnecting: readyState === WebSocketState.CONNECTING,
    reconnectCount,
  }
}

// Specialized hook for experiment updates
export const useExperimentWebSocket = () => {
  const [experiments, setExperiments] = useState<any[]>([])
  const [metrics, setMetrics] = useState<any>({})

  const handleMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'experiment_update':
        setExperiments(message.data.experiments || [])
        break
      case 'metric_update':
        setMetrics(prev => ({
          ...prev,
          [message.data.metric]: message.data.value
        }))
        break
      default:
        break
    }
  }, [])

  const ws = useWebSocket({
    url: 'ws://localhost:3020/ws',
    onMessage: handleMessage,
  })

  return {
    ...ws,
    experiments,
    metrics,
  }
}