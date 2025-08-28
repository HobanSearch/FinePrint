import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient as createRedisClient } from 'redis';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { cache } from '@fineprintai/shared-cache';
import { 
  WebSocketMessage, 
  WebSocketResponse, 
  WebSocketClient,
  AnalysisProgressMessage,
  AnalysisCompleteMessage,
  DocumentChangeMessage,
  NotificationMessage,
  SystemAlertMessage,
  UserPresenceMessage,
  QueueStatsMessage,
  ClientEventType,
  ServerEventType
} from '@fineprintai/shared-types';

import { MessageQueueService } from './messageQueueService';
import { MetricsService } from './metricsService';
import { ConnectionManager } from './connectionManager';
import { RateLimiter } from './rateLimiter';
import { AuthenticationService } from './authService';

const logger = createServiceLogger('websocket-service');

export interface WebSocketServiceConfig {
  port: number;
  path: string;
  cors: {
    origin: string[];
    credentials: boolean;
  };
  auth: {
    required: boolean;
    timeout: number;
  };
  heartbeat: {
    interval: number;
    timeout: number;
  };
  maxConnections: number;
  rateLimiting: {
    maxRequests: number;
    window: number;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
}

export class WebSocketService {
  private io: SocketIOServer;
  private pubClient: any;
  private subClient: any;
  private connectionManager: ConnectionManager;
  private rateLimiter: RateLimiter;
  private authService: AuthenticationService;
  private messageQueue: MessageQueueService;
  private metrics: MetricsService;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private initialized = false;

  constructor(
    httpServer: HttpServer,
    messageQueue: MessageQueueService,
    metrics: MetricsService
  ) {
    this.messageQueue = messageQueue;
    this.metrics = metrics;
    this.connectionManager = new ConnectionManager();
    this.rateLimiter = new RateLimiter();
    this.authService = new AuthenticationService();

    // Initialize Socket.io server
    this.io = new SocketIOServer(httpServer, {
      path: config.websocket.path || '/socket.io',
      cors: {
        origin: config.cors.origins,
        credentials: true,
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
      pingTimeout: config.websocket.heartbeat?.timeout || 60000,
      pingInterval: config.websocket.heartbeat?.interval || 25000,
      maxHttpBufferSize: 1e6, // 1MB
      allowEIO3: true,
      connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
        skipMiddlewares: true,
      },
    });

    this.setupSocketEventHandlers();
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize Redis adapter for clustering
      await this.initializeRedisAdapter();

      // Initialize sub-services
      await this.connectionManager.initialize();
      await this.rateLimiter.initialize();
      await this.authService.initialize();

      // Start periodic tasks
      this.startHeartbeat();
      this.startCleanupTask();

      this.initialized = true;
      logger.info('WebSocket service initialized successfully', {
        maxConnections: config.websocket.maxConnections,
        path: config.websocket.path,
        heartbeatInterval: config.websocket.heartbeat?.interval,
      });
    } catch (error) {
      logger.error('Failed to initialize WebSocket service', { error });
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      logger.info('Shutting down WebSocket service...');

      // Stop periodic tasks
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }

      // Disconnect all clients gracefully
      this.io.emit('system:shutdown', {
        message: 'Server is shutting down',
        timestamp: new Date(),
      });

      // Wait a moment for clients to receive the message
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Force disconnect all sockets
      this.io.disconnectSockets(true);

      // Shutdown sub-services
      await this.connectionManager.shutdown();
      await this.rateLimiter.shutdown();
      await this.authService.shutdown();

      // Close Redis connections
      if (this.pubClient) {
        await this.pubClient.quit();
      }
      if (this.subClient) {
        await this.subClient.quit();
      }

      // Close Socket.io server
      this.io.close();

      this.initialized = false;
      logger.info('WebSocket service shut down successfully');
    } catch (error) {
      logger.error('Error during WebSocket service shutdown', { error });
      throw error;
    }
  }

  private async initializeRedisAdapter(): Promise<void> {
    try {
      // Create Redis clients for pub/sub
      this.pubClient = createRedisClient({
        url: config.redis.url,
        retryDelayOnFailover: config.redis.retryDelayOnFailover,
        maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
      });

      this.subClient = this.pubClient.duplicate();

      // Connect Redis clients
      await Promise.all([
        this.pubClient.connect(),
        this.subClient.connect(),
      ]);

      // Setup Redis adapter for Socket.io clustering
      this.io.adapter(createAdapter(this.pubClient, this.subClient));

      logger.info('Redis adapter initialized for WebSocket clustering');
    } catch (error) {
      logger.error('Failed to initialize Redis adapter', { error });
      throw error;
    }
  }

  private setupSocketEventHandlers(): void {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        await this.authService.authenticateSocket(socket);
        next();
      } catch (error) {
        logger.warn('WebSocket authentication failed', {
          error: error.message,
          socketId: socket.id,
          ip: socket.handshake.address,
        });
        next(new Error('Authentication failed'));
      }
    });

    // Rate limiting middleware
    this.io.use(async (socket, next) => {
      try {
        const allowed = await this.rateLimiter.checkLimit(socket);
        if (!allowed) {
          next(new Error('Rate limit exceeded'));
          return;
        }
        next();
      } catch (error) {
        logger.error('Rate limiting error', { error });
        next(error);
      }
    });

    // Connection handling
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    // Error handling
    this.io.on('connect_error', (error) => {
      logger.error('Socket.io connection error', { error });
      this.metrics.incrementCounter('websocket_connection_errors');
    });

    logger.info('WebSocket event handlers setup completed');
  }

  private async handleConnection(socket: Socket): Promise<void> {
    const userId = socket.userId;
    const socketId = socket.id;
    const clientInfo = this.extractClientInfo(socket);

    logger.info('User connected via WebSocket', {
      userId,
      socketId,
      ...clientInfo,
    });

    try {
      // Register connection
      await this.connectionManager.addConnection(socket);

      // Join user-specific room
      await socket.join(`user:${userId}`);

      // Track metrics
      this.metrics.incrementCounter('websocket_connections_total');
      this.metrics.recordGauge('websocket_active_connections', this.connectionManager.getConnectionCount());

      // Setup socket event handlers
      this.setupSocketHandlers(socket);

      // Send connection acknowledgment
      socket.emit('connected', {
        message: 'Connected to Fine Print AI WebSocket service',
        userId,
        socketId,
        timestamp: new Date(),
        serverVersion: '1.0.0',
      });

      // Send any queued messages for offline user
      await this.sendQueuedMessages(userId, socket);

      // Update user presence
      await this.updateUserPresence(userId, 'online');

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        this.handleDisconnection(socket, reason);
      });

    } catch (error) {
      logger.error('Error handling WebSocket connection', { error, userId, socketId });
      socket.emit('error', {
        event: 'connection',
        message: 'Connection setup failed',
        timestamp: new Date(),
      });
      socket.disconnect(true);
    }
  }

  private setupSocketHandlers(socket: Socket): void {
    const userId = socket.userId;

    // Ping/pong for keep-alive
    socket.on('ping', () => {
      this.connectionManager.updateActivity(socket.id);
      socket.emit('pong', { timestamp: new Date() });
    });

    // Subscribe to channels
    socket.on('subscribe', async (data: { channels: string[] }) => {
      try {
        for (const channel of data.channels) {
          if (this.isValidChannel(channel, userId)) {
            await socket.join(channel);
            logger.debug('User subscribed to channel', { userId, channel });
          }
        }
        socket.emit('subscription:ack', {
          channels: data.channels,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Subscribe error', { error, userId, channels: data.channels });
        socket.emit('error', { event: 'subscribe', message: error.message });
      }
    });

    // Unsubscribe from channels
    socket.on('unsubscribe', async (data: { channels: string[] }) => {
      try {
        for (const channel of data.channels) {
          await socket.leave(channel);
          logger.debug('User unsubscribed from channel', { userId, channel });
        }
        socket.emit('unsubscription:ack', {
          channels: data.channels,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Unsubscribe error', { error, userId, channels: data.channels });
        socket.emit('error', { event: 'unsubscribe', message: error.message });
      }
    });

    // Request analysis status
    socket.on('request_analysis_status', async (data: { analysisId: string }) => {
      try {
        const status = await this.getAnalysisStatus(data.analysisId);
        socket.emit('analysis_status', status);
      } catch (error) {
        logger.error('Request analysis status error', { error, userId, analysisId: data.analysisId });
        socket.emit('error', { event: 'request_analysis_status', message: error.message });
      }
    });

    // Request queue stats
    socket.on('request_queue_stats', async () => {
      try {
        const stats = await this.getQueueStats();
        socket.emit('queue_stats', stats);
      } catch (error) {
        logger.error('Request queue stats error', { error, userId });
        socket.emit('error', { event: 'request_queue_stats', message: error.message });
      }
    });

    // Handle custom message events
    socket.on('message', async (data: WebSocketMessage) => {
      try {
        await this.handleCustomMessage(socket, data);
      } catch (error) {
        logger.error('Custom message error', { error, userId, messageType: data.type });
        socket.emit('error', { event: 'message', message: error.message });
      }
    });

    // Update activity on any event
    socket.onAny(() => {
      this.connectionManager.updateActivity(socket.id);
    });
  }

  private handleDisconnection(socket: Socket, reason: string): void {
    const userId = socket.userId;
    const socketId = socket.id;

    logger.info('User disconnected from WebSocket', {
      userId,
      socketId,
      reason,
    });

    try {
      // Remove connection
      this.connectionManager.removeConnection(socketId);

      // Update metrics
      this.metrics.incrementCounter('websocket_disconnections_total');
      this.metrics.recordGauge('websocket_active_connections', this.connectionManager.getConnectionCount());

      // Update user presence if no other connections
      const userConnections = this.connectionManager.getUserConnections(userId);
      if (userConnections.length === 0) {
        this.updateUserPresence(userId, 'offline');
      }

    } catch (error) {
      logger.error('Error handling disconnection', { error, userId, socketId });
    }
  }

  // Public methods for sending messages

  public async sendAnalysisProgress(message: AnalysisProgressMessage): Promise<void> {
    try {
      // Send to analysis-specific room
      this.io.to(`analysis:${message.payload.analysisId}`).emit('analysis_progress', message);
      
      // Also send to user room if available
      const analysisInfo = await this.getAnalysisInfo(message.payload.analysisId);
      if (analysisInfo?.userId) {
        this.io.to(`user:${analysisInfo.userId}`).emit('analysis_progress', message);
      }

      this.metrics.incrementCounter('websocket_messages_sent', { type: 'analysis_progress' });
      logger.debug('Analysis progress message sent', { analysisId: message.payload.analysisId });
    } catch (error) {
      logger.error('Failed to send analysis progress', { error, message });
    }
  }

  public async sendAnalysisComplete(message: AnalysisCompleteMessage): Promise<void> {
    try {
      // Send to analysis-specific room
      this.io.to(`analysis:${message.payload.analysisId}`).emit('analysis_complete', message);
      
      // Send to document room
      this.io.to(`document:${message.payload.documentId}`).emit('analysis_complete', message);

      // Send to user room
      const analysisInfo = await this.getAnalysisInfo(message.payload.analysisId);
      if (analysisInfo?.userId) {
        this.io.to(`user:${analysisInfo.userId}`).emit('analysis_complete', message);
        
        // Queue message if user is offline
        if (!this.connectionManager.isUserOnline(analysisInfo.userId)) {
          await this.messageQueue.queueMessage(analysisInfo.userId, message);
        }
      }

      this.metrics.incrementCounter('websocket_messages_sent', { type: 'analysis_complete' });
      logger.debug('Analysis complete message sent', { analysisId: message.payload.analysisId });
    } catch (error) {
      logger.error('Failed to send analysis complete', { error, message });
    }
  }

  public async sendDocumentChange(message: DocumentChangeMessage): Promise<void> {
    try {
      // Send to document-specific room
      this.io.to(`document:${message.payload.documentId}`).emit('document_change', message);

      // Send to all users who have this document
      const documentUsers = await this.getDocumentUsers(message.payload.documentId);
      for (const userId of documentUsers) {
        this.io.to(`user:${userId}`).emit('document_change', message);
        
        // Queue for offline users
        if (!this.connectionManager.isUserOnline(userId)) {
          await this.messageQueue.queueMessage(userId, message);
        }
      }

      this.metrics.incrementCounter('websocket_messages_sent', { type: 'document_change' });
      logger.debug('Document change message sent', { documentId: message.payload.documentId });
    } catch (error) {
      logger.error('Failed to send document change', { error, message });
    }
  }

  public async sendNotification(userId: string, message: NotificationMessage): Promise<void> {
    try {
      this.io.to(`user:${userId}`).emit('notification', message);

      // Queue for offline users
      if (!this.connectionManager.isUserOnline(userId)) {
        await this.messageQueue.queueMessage(userId, message);
      }

      this.metrics.incrementCounter('websocket_messages_sent', { type: 'notification' });
      logger.debug('Notification sent', { userId, notificationId: message.payload.id });
    } catch (error) {
      logger.error('Failed to send notification', { error, userId, message });
    }
  }

  public async sendSystemAlert(message: SystemAlertMessage, targetUsers?: string[]): Promise<void> {
    try {
      if (targetUsers && targetUsers.length > 0) {
        for (const userId of targetUsers) {
          this.io.to(`user:${userId}`).emit('system_alert', message);
          
          // Queue for offline users
          if (!this.connectionManager.isUserOnline(userId)) {
            await this.messageQueue.queueMessage(userId, message);
          }
        }
      } else {
        // Broadcast to all connected users
        this.io.emit('system_alert', message);
      }

      this.metrics.incrementCounter('websocket_messages_sent', { type: 'system_alert' });
      logger.info('System alert sent', { severity: message.payload.severity, targetUsers: targetUsers?.length || 'all' });
    } catch (error) {
      logger.error('Failed to send system alert', { error, message });
    }
  }

  public async sendUserPresence(message: UserPresenceMessage, targetUsers?: string[]): Promise<void> {
    try {
      if (targetUsers && targetUsers.length > 0) {
        for (const userId of targetUsers) {
          this.io.to(`user:${userId}`).emit('user_presence', message);
        }
      } else {
        // Send to all users in same organization/team
        const teamId = await this.getUserTeam(message.payload.userId);
        if (teamId) {
          this.io.to(`team:${teamId}`).emit('user_presence', message);
        }
      }

      this.metrics.incrementCounter('websocket_messages_sent', { type: 'user_presence' });
    } catch (error) {
      logger.error('Failed to send user presence', { error, message });
    }
  }

  public async sendQueueStats(message: QueueStatsMessage): Promise<void> {
    try {
      // Send to admin users only
      this.io.to('admin').emit('queue_stats', message);

      this.metrics.incrementCounter('websocket_messages_sent', { type: 'queue_stats' });
    } catch (error) {
      logger.error('Failed to send queue stats', { error, message });
    }
  }

  // Connection and health status methods

  public getConnectionStats(): {
    totalConnections: number;
    uniqueUsers: number;
    averageConnectionsPerUser: number;
    connectionsByRoom: Record<string, number>;
  } {
    return this.connectionManager.getStats();
  }

  public getUserConnectionInfo(userId: string): {
    isConnected: boolean;
    connectionCount: number;
    connections: Array<{
      socketId: string;
      connectedAt: Date;
      lastActivity: Date;
    }>;
  } {
    return this.connectionManager.getUserInfo(userId);
  }

  public async getHealthStatus(): Promise<{
    healthy: boolean;
    redis: boolean;
    connections: number;
    memory: NodeJS.MemoryUsage;
    uptime: number;
  }> {
    try {
      const redisHealthy = this.pubClient ? await this.checkRedisHealth() : false;
      
      return {
        healthy: this.initialized && redisHealthy,
        redis: redisHealthy,
        connections: this.connectionManager.getConnectionCount(),
        memory: process.memoryUsage(),
        uptime: process.uptime(),
      };
    } catch (error) {
      logger.error('Error getting health status', { error });
      return {
        healthy: false,
        redis: false,
        connections: 0,
        memory: process.memoryUsage(),
        uptime: process.uptime(),
      };
    }
  }

  // Private helper methods

  private extractClientInfo(socket: Socket) {
    return {
      userAgent: socket.handshake.headers['user-agent'],
      ip: socket.handshake.address,
      origin: socket.handshake.headers.origin,
      referer: socket.handshake.headers.referer,
    };
  }

  private isValidChannel(channel: string, userId: string): boolean {
    // Define channel validation rules
    const validPrefixes = ['user:', 'document:', 'analysis:', 'team:', 'admin'];
    
    if (!validPrefixes.some(prefix => channel.startsWith(prefix))) {
      return false;
    }

    // User can only subscribe to their own user channel
    if (channel.startsWith('user:') && channel !== `user:${userId}`) {
      return false;
    }

    // Additional authorization checks can be added here
    return true;
  }

  private async sendQueuedMessages(userId: string, socket: Socket): Promise<void> {
    try {
      const queuedMessages = await this.messageQueue.getQueuedMessages(userId);
      
      for (const message of queuedMessages) {
        socket.emit(message.type, message);
      }

      if (queuedMessages.length > 0) {
        await this.messageQueue.clearQueuedMessages(userId);
        logger.debug('Sent queued messages to user', { userId, count: queuedMessages.length });
      }
    } catch (error) {
      logger.error('Error sending queued messages', { error, userId });
    }
  }

  private async updateUserPresence(userId: string, status: 'online' | 'offline' | 'away'): Promise<void> {
    try {
      await cache.set(`presence:${userId}`, {
        status,
        lastSeen: new Date(),
        timestamp: new Date(),
      }, 300); // 5 minutes TTL

      // Notify team members
      const presenceMessage: UserPresenceMessage = {
        type: 'user_presence',
        payload: {
          userId,
          status,
          lastSeen: status === 'offline' ? new Date() : undefined,
        },
        timestamp: new Date(),
      };

      await this.sendUserPresence(presenceMessage);
    } catch (error) {
      logger.error('Error updating user presence', { error, userId, status });
    }
  }

  private async handleCustomMessage(socket: Socket, message: WebSocketMessage): Promise<void> {
    // Handle custom message types
    switch (message.type) {
      case 'ping':
        socket.emit('pong', { timestamp: new Date() });
        break;
      
      default:
        logger.warn('Unknown message type', { type: message.type, userId: socket.userId });
        socket.emit('error', {
          event: 'message',
          message: `Unknown message type: ${message.type}`,
        });
    }
  }

  private async getAnalysisStatus(analysisId: string): Promise<any> {
    // Implementation would fetch from database or cache
    return await cache.get(`analysis:status:${analysisId}`);
  }

  private async getQueueStats(): Promise<any> {
    // Implementation would fetch queue statistics
    return await this.messageQueue.getStats();
  }

  private async getAnalysisInfo(analysisId: string): Promise<{ userId: string } | null> {
    // Implementation would fetch analysis info from database
    return await cache.get(`analysis:info:${analysisId}`);
  }

  private async getDocumentUsers(documentId: string): Promise<string[]> {
    // Implementation would fetch users who have access to the document
    const users = await cache.get(`document:users:${documentId}`);
    return users || [];
  }

  private async getUserTeam(userId: string): Promise<string | null> {
    // Implementation would fetch user's team ID
    return await cache.get(`user:team:${userId}`);
  }

  private async checkRedisHealth(): Promise<boolean> {
    try {
      await this.pubClient.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  private startHeartbeat(): void {
    const interval = config.websocket.heartbeat?.interval || 30000;
    
    this.heartbeatInterval = setInterval(() => {
      this.io.emit('heartbeat', { timestamp: new Date() });
    }, interval);

    logger.debug('Heartbeat started', { interval });
  }

  private startCleanupTask(): void {
    // Clean up inactive connections every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const cleaned = this.connectionManager.cleanupInactive(30); // 30 minutes threshold
      if (cleaned > 0) {
        logger.info('Cleaned up inactive connections', { count: cleaned });
      }
    }, 5 * 60 * 1000);

    logger.debug('Cleanup task started');
  }
}

// Extend Socket interface for TypeScript
declare module 'socket.io' {
  interface Socket {
    userId: string;
    userEmail: string;
    userName: string;
    teamId?: string;
    isAdmin?: boolean;
  }
}