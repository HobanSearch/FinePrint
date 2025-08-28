/**
 * WebSocket subscriber for real-time experiment updates
 * Listens for winner detection and performance changes
 */

import WebSocket from 'ws';
import { ExperimentUpdate, ExperimentResult } from '../types';
import { logger } from '../utils/logger';

export class ExperimentSubscriber {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private pingInterval: NodeJS.Timeout | null = null;
  private listeners: Map<string, Set<(data: any) => void>>;

  constructor(
    private readonly config: {
      url: string;
      apiKey?: string;
      heartbeatInterval?: number;
    }
  ) {
    this.listeners = new Map();
    this.connect();
  }

  /**
   * Connect to WebSocket server
   */
  private connect(): void {
    try {
      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      this.ws = new WebSocket(this.config.url, { headers });

      this.ws.on('open', () => {
        logger.info('WebSocket connected to experiment updates');
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.subscribe();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error) => {
        logger.error({ error }, 'WebSocket error');
      });

      this.ws.on('close', (code, reason) => {
        logger.warn({ code, reason: reason.toString() }, 'WebSocket closed');
        this.stopHeartbeat();
        this.handleReconnect();
      });

      this.ws.on('ping', () => {
        this.ws?.pong();
      });

    } catch (error) {
      logger.error({ error }, 'Failed to connect WebSocket');
      this.handleReconnect();
    }
  }

  /**
   * Subscribe to experiment updates
   */
  private subscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const subscribeMessage = {
      type: 'subscribe',
      channels: [
        'experiment.winner',
        'experiment.update',
        'experiment.complete',
        'variant.performance'
      ]
    };

    this.ws.send(JSON.stringify(subscribeMessage));
    logger.debug('Subscribed to experiment channels');
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());
      
      logger.debug({ type: message.type }, 'Received WebSocket message');

      switch (message.type) {
        case 'experiment.winner':
          this.handleWinnerDetected(message.data);
          break;
        
        case 'experiment.update':
          this.handleExperimentUpdate(message.data);
          break;
        
        case 'experiment.complete':
          this.handleExperimentComplete(message.data);
          break;
        
        case 'variant.performance':
          this.handleVariantPerformance(message.data);
          break;
        
        case 'pong':
          // Heartbeat response
          break;
        
        default:
          logger.warn({ type: message.type }, 'Unknown message type');
      }

      // Notify all listeners for this message type
      const listeners = this.listeners.get(message.type);
      if (listeners) {
        for (const listener of listeners) {
          try {
            listener(message.data);
          } catch (error) {
            logger.error({ error, type: message.type }, 'Listener error');
          }
        }
      }

    } catch (error) {
      logger.error({ error, data: data.toString() }, 'Failed to parse WebSocket message');
    }
  }

  /**
   * Handle winner detection event
   */
  private handleWinnerDetected(data: ExperimentResult): void {
    logger.info({ 
      experimentId: data.experimentId,
      winner: data.winnerVariantId,
      confidence: data.confidence 
    }, 'Experiment winner detected');

    // Notify all winner listeners
    this.emit('winner', data);
  }

  /**
   * Handle experiment update event
   */
  private handleExperimentUpdate(data: ExperimentUpdate): void {
    logger.debug({ 
      experimentId: data.experimentId,
      variantId: data.variantId 
    }, 'Experiment update received');

    // Notify update listeners
    this.emit('update', data);
  }

  /**
   * Handle experiment completion event
   */
  private handleExperimentComplete(data: any): void {
    logger.info({ 
      experimentId: data.experimentId 
    }, 'Experiment completed');

    // Notify completion listeners
    this.emit('complete', data);
  }

  /**
   * Handle variant performance update
   */
  private handleVariantPerformance(data: any): void {
    logger.debug({ 
      variantId: data.variantId,
      metrics: data.metrics 
    }, 'Variant performance update');

    // Notify performance listeners
    this.emit('performance', data);
  }

  /**
   * Register event listener
   */
  on(event: string, callback: (data: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Remove event listener
   */
  off(event: string, callback: (data: any) => void): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Emit event to listeners
   */
  private emit(event: string, data: any): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(data);
        } catch (error) {
          logger.error({ error, event }, 'Event listener error');
        }
      }
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    const interval = this.config.heartbeatInterval || 30000;
    
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, interval);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    logger.info({ 
      attempt: this.reconnectAttempts,
      delay 
    }, 'Attempting to reconnect');

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Send message through WebSocket
   */
  send(message: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('WebSocket not connected, message not sent');
      return;
    }

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Close WebSocket connection
   */
  close(): void {
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.listeners.clear();
    logger.info('WebSocket connection closed');
  }

  /**
   * Get connection state
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    connected: boolean;
    reconnectAttempts: number;
    listeners: number;
  } {
    let totalListeners = 0;
    for (const listeners of this.listeners.values()) {
      totalListeners += listeners.size;
    }

    return {
      connected: this.isConnected(),
      reconnectAttempts: this.reconnectAttempts,
      listeners: totalListeners
    };
  }
}