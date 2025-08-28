import { io, Socket } from 'socket.io-client';
import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../stores/slices/auth';
import { useOfflineStore } from '../stores/slices/offline';
import { useSyncStore } from '../stores/slices/sync';
import { logger } from '../utils/logger';

interface SyncEvent {
  id: string;
  type: 'document_analyzed' | 'document_updated' | 'document_deleted' | 'risk_score_updated' | 'user_preferences_updated';
  data: any;
  timestamp: string;
  userId: string;
  deviceId: string;
}

interface ConnectionConfig {
  url: string;
  auth: {
    token: string;
    userId: string;
    deviceId: string;
  };
  reconnection: boolean;
  reconnectionDelay: number;
  reconnectionAttempts: number;
  timeout: number;
}

interface QueuedEvent {
  id: string;
  event: SyncEvent;
  timestamp: number;
  retryCount: number;
}

class RealtimeSyncService {
  private static instance: RealtimeSyncService;
  private socket: Socket | null = null;
  private isConnected: boolean = false;
  private isOnline: boolean = true;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private syncQueue: QueuedEvent[] = [];
  private deviceId: string = '';
  private userId: string = '';
  private lastHeartbeat: number = 0;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  static getInstance(): RealtimeSyncService {
    if (!RealtimeSyncService.instance) {
      RealtimeSyncService.instance = new RealtimeSyncService();
    }
    return RealtimeSyncService.instance;
  }

  /**
   * Initialize the real-time sync service
   */
  async initialize(): Promise<void> {
    try {
      // Get device ID and user ID
      this.deviceId = await this.getDeviceId();
      this.userId = useAuthStore.getState().user?.id || '';

      // Setup network monitoring
      this.setupNetworkMonitoring();

      // Load queued events from storage
      await this.loadQueuedEvents();

      // Start sync service if user is authenticated
      if (this.userId) {
        await this.connect();
      }

      logger.info('RealtimeSyncService initialized');
    } catch (error) {
      logger.error('Failed to initialize RealtimeSyncService:', error);
    }
  }

  /**
   * Connect to the WebSocket server
   */
  async connect(): Promise<void> {
    if (this.socket && this.isConnected) {
      logger.warn('Already connected to sync service');
      return;
    }

    try {
      const config = await this.getConnectionConfig();
      this.socket = io(config.url, {
        auth: config.auth,
        reconnection: config.reconnection,
        reconnectionDelay: config.reconnectionDelay,
        reconnectionAttempts: config.reconnectionAttempts,
        timeout: config.timeout,
        transports: ['websocket', 'polling'],
      });

      this.setupEventListeners();
      
      logger.info('Connecting to sync service...');
    } catch (error) {
      logger.error('Failed to connect to sync service:', error);
      throw error;
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.isConnected = false;
    this.clearHeartbeat();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    useSyncStore.getState().setConnectionStatus('disconnected');
    logger.info('Disconnected from sync service');
  }

  /**
   * Send sync event to server
   */
  async sendSyncEvent(type: SyncEvent['type'], data: any): Promise<void> {
    const event: SyncEvent = {
      id: this.generateEventId(),
      type,
      data,
      timestamp: new Date().toISOString(),
      userId: this.userId,
      deviceId: this.deviceId,
    };

    if (this.isConnected && this.socket) {
      try {
        await this.emitEvent('sync_event', event);
        logger.debug('Sync event sent:', event.type);
      } catch (error) {
        logger.error('Failed to send sync event:', error);
        await this.queueEvent(event);
      }
    } else {
      await this.queueEvent(event);
    }
  }

  /**
   * Handle incoming sync events
   */
  private handleSyncEvent(event: SyncEvent): void {
    // Ignore events from this device
    if (event.deviceId === this.deviceId) {
      return;
    }

    logger.debug('Received sync event:', event.type);

    switch (event.type) {
      case 'document_analyzed':
        this.handleDocumentAnalyzed(event.data);
        break;
      case 'document_updated':
        this.handleDocumentUpdated(event.data);
        break;
      case 'document_deleted':
        this.handleDocumentDeleted(event.data);
        break;
      case 'risk_score_updated':
        this.handleRiskScoreUpdated(event.data);
        break;
      case 'user_preferences_updated':
        this.handleUserPreferencesUpdated(event.data);
        break;
      default:
        logger.warn('Unknown sync event type:', event.type);
    }
  }

  /**
   * Setup WebSocket event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.lastHeartbeat = Date.now();
      useSyncStore.getState().setConnectionStatus('connected');
      logger.info('Connected to sync service');
      
      // Process queued events
      this.processQueuedEvents();
      
      // Start heartbeat
      this.startHeartbeat();
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      useSyncStore.getState().setConnectionStatus('disconnected');
      this.clearHeartbeat();
      logger.info('Disconnected from sync service');
      
      // Schedule reconnection if online
      if (this.isOnline) {
        this.scheduleReconnection();
      }
    });

    this.socket.on('sync_event', (event: SyncEvent) => {
      this.handleSyncEvent(event);
    });

    this.socket.on('heartbeat', () => {
      this.lastHeartbeat = Date.now();
    });

    this.socket.on('connect_error', (error: Error) => {
      logger.error('Sync service connection error:', error);
      useSyncStore.getState().setConnectionStatus('error');
    });

    this.socket.on('error', (error: Error) => {
      logger.error('Sync service error:', error);
    });
  }

  /**
   * Setup network monitoring
   */
  private setupNetworkMonitoring(): void {
    NetInfo.addEventListener(state => {
      const wasOnline = this.isOnline;
      this.isOnline = state.isConnected ?? false;

      if (!wasOnline && this.isOnline) {
        // Back online - reconnect
        logger.info('Network reconnected, attempting to sync');
        this.connect();
      } else if (wasOnline && !this.isOnline) {
        // Gone offline
        logger.info('Network disconnected');
        useSyncStore.getState().setConnectionStatus('offline');
      }
    });
  }

  /**
   * Start heartbeat to maintain connection
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.isConnected) {
        this.socket.emit('heartbeat', { timestamp: Date.now() });
        
        // Check if we haven't received a heartbeat in too long
        if (Date.now() - this.lastHeartbeat > 30000) {
          logger.warn('Heartbeat timeout, reconnecting...');
          this.reconnect();
        }
      }
    }, 15000); // Send heartbeat every 15 seconds
  }

  /**
   * Clear heartbeat interval
   */
  private clearHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnection(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      if (!this.isConnected && this.isOnline) {
        logger.info('Attempting to reconnect to sync service');
        this.connect();
      }
    }, 5000); // Retry after 5 seconds
  }

  /**
   * Force reconnection
   */
  private reconnect(): void {
    this.disconnect();
    setTimeout(() => {
      if (this.isOnline) {
        this.connect();
      }
    }, 1000);
  }

  /**
   * Queue event for later processing
   */
  private async queueEvent(event: SyncEvent): Promise<void> {
    const queuedEvent: QueuedEvent = {
      id: event.id,
      event,
      timestamp: Date.now(),
      retryCount: 0,
    };

    this.syncQueue.push(queuedEvent);
    await this.saveQueuedEvents();
    
    logger.debug('Event queued:', event.type);
  }

  /**
   * Process all queued events
   */
  private async processQueuedEvents(): Promise<void> {
    if (this.syncQueue.length === 0) {
      return;
    }

    logger.info(`Processing ${this.syncQueue.length} queued events`);

    const eventsToProcess = [...this.syncQueue];
    this.syncQueue = [];

    for (const queuedEvent of eventsToProcess) {
      try {
        await this.emitEvent('sync_event', queuedEvent.event);
        logger.debug('Queued event processed:', queuedEvent.event.type);
      } catch (error) {
        logger.error('Failed to process queued event:', error);
        
        // Retry with exponential backoff
        if (queuedEvent.retryCount < 3) {
          queuedEvent.retryCount++;
          this.syncQueue.push(queuedEvent);
        } else {
          logger.error('Max retries exceeded for event:', queuedEvent.event.type);
        }
      }
    }

    await this.saveQueuedEvents();
  }

  /**
   * Emit event to server with promise wrapper
   */
  private emitEvent(eventName: string, data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      this.socket.emit(eventName, data, (response: any) => {
        if (response && response.error) {
          reject(new Error(response.error));
        } else {
          resolve();
        }
      });
    });
  }

  // Event handlers
  private handleDocumentAnalyzed(data: any): void {
    // Update local state with new analysis
    useOfflineStore.getState().updateDocument(data.documentId, {
      analysisResult: data.analysisResult,
      riskScore: data.riskScore,
      lastAnalyzed: data.timestamp,
    });
  }

  private handleDocumentUpdated(data: any): void {
    // Update local document
    useOfflineStore.getState().updateDocument(data.documentId, data.updates);
  }

  private handleDocumentDeleted(data: any): void {
    // Remove document from local state
    useOfflineStore.getState().deleteDocument(data.documentId);
  }

  private handleRiskScoreUpdated(data: any): void {
    // Update risk scores
    useSyncStore.getState().updateRiskScores(data.riskScores);
  }

  private handleUserPreferencesUpdated(data: any): void {
    // Update user preferences
    useAuthStore.getState().updatePreferences(data.preferences);
  }

  // Helper methods
  private async getDeviceId(): Promise<string> {
    let deviceId = await AsyncStorage.getItem('deviceId');
    if (!deviceId) {
      deviceId = `${Platform.OS}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await AsyncStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
  }

  private async getConnectionConfig(): Promise<ConnectionConfig> {
    const token = useAuthStore.getState().token;
    const wsUrl = __DEV__ ? 'ws://localhost:3001' : 'wss://api.fineprintai.com';

    return {
      url: wsUrl,
      auth: {
        token: token || '',
        userId: this.userId,
        deviceId: this.deviceId,
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 10000,
    };
  }

  private generateEventId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private async saveQueuedEvents(): Promise<void> {
    try {
      await AsyncStorage.setItem('syncQueue', JSON.stringify(this.syncQueue));
    } catch (error) {
      logger.error('Failed to save queued events:', error);
    }
  }

  private async loadQueuedEvents(): Promise<void> {
    try {
      const queueData = await AsyncStorage.getItem('syncQueue');
      if (queueData) {
        this.syncQueue = JSON.parse(queueData);
        logger.info(`Loaded ${this.syncQueue.length} queued events`);
      }
    } catch (error) {
      logger.error('Failed to load queued events:', error);
      this.syncQueue = [];
    }
  }
}

export default RealtimeSyncService;