import { createServiceLogger } from '@fineprintai/shared-logger';
import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { authenticateToken } from '@fineprintai/shared-middleware';
import jwt from 'jsonwebtoken';
import { config } from '@fineprintai/shared-config';

const logger = createServiceLogger('websocket-service');

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: Date;
  userId?: string;
  analysisId?: string;
}

export interface ProgressUpdate {
  analysisId: string;
  step: string;
  percentage: number;
  message: string;
  estimatedTimeRemaining?: number;
  stage: 'initialization' | 'extraction' | 'processing' | 'analysis' | 'completion' | 'error';
}

export interface AnalysisEvent {
  type: 'analysis_created' | 'analysis_progress' | 'analysis_completed' | 'analysis_failed' | 'analysis_cancelled';
  analysisId: string;
  userId: string;
  data: any;
}

export interface ChangeMonitorEvent {
  type: 'document_change_detected' | 'monitor_status_changed' | 'check_completed';
  monitorId: string;
  userId: string;
  data: any;
}

export class WebSocketService {
  private io: SocketIOServer;
  private connectedUsers = new Map<string, Set<string>>(); // userId -> Set of socketIds
  private userSockets = new Map<string, string>(); // socketId -> userId
  private analysisSubscriptions = new Map<string, Set<string>>(); // analysisId -> Set of socketIds
  private monitorSubscriptions = new Map<string, Set<string>>(); // monitorId -> Set of socketIds

  constructor(httpServer: HttpServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.client.urls || "*",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    
    logger.info('WebSocket service initialized');
  }

  private setupMiddleware(): void {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, config.auth.jwtSecret) as any;
        const userId = decoded.userId || decoded.sub;
        
        if (!userId) {
          return next(new Error('Invalid token'));
        }

        // Attach user info to socket
        socket.data.userId = userId;
        socket.data.teamId = decoded.teamId;
        socket.data.subscription = decoded.subscription;
        
        logger.debug('WebSocket client authenticated', { 
          socketId: socket.id, 
          userId,
          userAgent: socket.handshake.headers['user-agent']
        });
        
        next();
      } catch (error) {
        logger.warn('WebSocket authentication failed', { 
          error: error.message,
          socketId: socket.id
        });
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      const userId = socket.data.userId;
      
      logger.info('WebSocket client connected', { 
        socketId: socket.id, 
        userId,
        totalConnections: this.io.engine.clientsCount
      });

      // Track user connection
      this.trackUserConnection(userId, socket.id);

      // Handle client events
      socket.on('subscribe_analysis', (analysisId: string) => {
        this.subscribeToAnalysis(socket.id, analysisId);
      });

      socket.on('unsubscribe_analysis', (analysisId: string) => {
        this.unsubscribeFromAnalysis(socket.id, analysisId);
      });

      socket.on('subscribe_monitor', (monitorId: string) => {
        this.subscribeToMonitor(socket.id, monitorId);
      });

      socket.on('unsubscribe_monitor', (monitorId: string) => {
        this.unsubscribeFromMonitor(socket.id, monitorId);
      });

      socket.on('get_analysis_status', async (analysisId: string) => {
        try {
          const status = await this.getAnalysisStatus(analysisId, userId);
          socket.emit('analysis_status', { analysisId, status });
        } catch (error) {
          socket.emit('error', { message: 'Failed to get analysis status', analysisId });
        }
      });

      socket.on('ping', () => {
        socket.emit('pong', { timestamp: new Date() });
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        logger.info('WebSocket client disconnected', { 
          socketId: socket.id, 
          userId, 
          reason,
          totalConnections: this.io.engine.clientsCount 
        });
        
        this.handleClientDisconnect(socket.id, userId);
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error('WebSocket client error', { 
          socketId: socket.id, 
          userId, 
          error: error.message 
        });
      });

      // Send welcome message
      socket.emit('connected', {
        message: 'Connected to FinePrint AI analysis service',
        userId,
        socketId: socket.id,
        timestamp: new Date(),
        features: [
          'real-time-analysis-progress',
          'change-monitoring-alerts',
          'system-notifications'
        ]
      });
    });

    // Handle server errors
    this.io.on('error', (error) => {
      logger.error('WebSocket server error', { error: error.message });
    });
  }

  private trackUserConnection(userId: string, socketId: string): void {
    // Track user connections
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, new Set());
    }
    this.connectedUsers.get(userId)!.add(socketId);
    this.userSockets.set(socketId, userId);
  }

  private handleClientDisconnect(socketId: string, userId: string): void {
    // Clean up user connections
    const userSockets = this.connectedUsers.get(userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        this.connectedUsers.delete(userId);
      }
    }
    this.userSockets.delete(socketId);

    // Clean up subscriptions
    this.cleanupSubscriptions(socketId);
  }

  private cleanupSubscriptions(socketId: string): void {
    // Remove from analysis subscriptions
    for (const [analysisId, sockets] of this.analysisSubscriptions.entries()) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.analysisSubscriptions.delete(analysisId);
      }
    }

    // Remove from monitor subscriptions
    for (const [monitorId, sockets] of this.monitorSubscriptions.entries()) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.monitorSubscriptions.delete(monitorId);
      }
    }
  }

  private subscribeToAnalysis(socketId: string, analysisId: string): void {
    if (!this.analysisSubscriptions.has(analysisId)) {
      this.analysisSubscriptions.set(analysisId, new Set());
    }
    this.analysisSubscriptions.get(analysisId)!.add(socketId);

    const userId = this.userSockets.get(socketId);
    logger.debug('Client subscribed to analysis', { socketId, analysisId, userId });

    // Send current status if available
    this.getAnalysisStatus(analysisId, userId!).then(status => {
      this.io.to(socketId).emit('analysis_status', { analysisId, status });
    }).catch(() => {
      // Ignore errors for status updates
    });
  }

  private unsubscribeFromAnalysis(socketId: string, analysisId: string): void {
    const subscribers = this.analysisSubscriptions.get(analysisId);
    if (subscribers) {
      subscribers.delete(socketId);
      if (subscribers.size === 0) {
        this.analysisSubscriptions.delete(analysisId);
      }
    }

    const userId = this.userSockets.get(socketId);
    logger.debug('Client unsubscribed from analysis', { socketId, analysisId, userId });
  }

  private subscribeToMonitor(socketId: string, monitorId: string): void {
    if (!this.monitorSubscriptions.has(monitorId)) {
      this.monitorSubscriptions.set(monitorId, new Set());
    }
    this.monitorSubscriptions.get(monitorId)!.add(socketId);

    const userId = this.userSockets.get(socketId);
    logger.debug('Client subscribed to monitor', { socketId, monitorId, userId });
  }

  private unsubscribeFromMonitor(socketId: string, monitorId: string): void {
    const subscribers = this.monitorSubscriptions.get(monitorId);
    if (subscribers) {
      subscribers.delete(socketId);
      if (subscribers.size === 0) {
        this.monitorSubscriptions.delete(monitorId);
      }
    }

    const userId = this.userSockets.get(socketId);
    logger.debug('Client unsubscribed from monitor', { socketId, monitorId, userId });
  }

  // Public methods for sending messages

  public sendToUser(userId: string, eventType: string, data: any): boolean {
    const userSockets = this.connectedUsers.get(userId);
    if (!userSockets || userSockets.size === 0) {
      logger.debug('No connected sockets for user', { userId, eventType });
      return false;
    }

    const message: WebSocketMessage = {
      type: eventType,
      data,
      timestamp: new Date(),
      userId
    };

    let sent = false;
    for (const socketId of userSockets) {
      try {
        this.io.to(socketId).emit(eventType, message);
        sent = true;
      } catch (error) {
        logger.warn('Failed to send message to socket', { 
          socketId, 
          userId, 
          eventType, 
          error: error.message 
        });
      }
    }

    if (sent) {
      logger.debug('Message sent to user', { userId, eventType, socketCount: userSockets.size });
    }

    return sent;
  }

  public sendAnalysisProgress(analysisId: string, progress: ProgressUpdate): void {
    const subscribers = this.analysisSubscriptions.get(analysisId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const message: WebSocketMessage = {
      type: 'analysis_progress',
      data: progress,
      timestamp: new Date(),
      analysisId
    };

    for (const socketId of subscribers) {
      try {
        this.io.to(socketId).emit('analysis_progress', message);
      } catch (error) {
        logger.warn('Failed to send analysis progress', { 
          socketId, 
          analysisId, 
          error: error.message 
        });
      }
    }

    logger.debug('Analysis progress sent', { 
      analysisId, 
      stage: progress.stage, 
      percentage: progress.percentage,
      subscriberCount: subscribers.size 
    });
  }

  public sendAnalysisEvent(event: AnalysisEvent): void {
    // Send to analysis subscribers
    const analysisSubscribers = this.analysisSubscriptions.get(event.analysisId);
    if (analysisSubscribers) {
      for (const socketId of analysisSubscribers) {
        try {
          this.io.to(socketId).emit(event.type, {
            type: event.type,
            data: event.data,
            timestamp: new Date(),
            analysisId: event.analysisId
          });
        } catch (error) {
          logger.warn('Failed to send analysis event to subscriber', { 
            socketId, 
            analysisId: event.analysisId, 
            eventType: event.type,
            error: error.message 
          });
        }
      }
    }

    // Also send to user directly
    this.sendToUser(event.userId, event.type, {
      analysisId: event.analysisId,
      ...event.data
    });

    logger.debug('Analysis event sent', { 
      eventType: event.type, 
      analysisId: event.analysisId, 
      userId: event.userId 
    });
  }

  public sendChangeMonitorEvent(event: ChangeMonitorEvent): void {
    // Send to monitor subscribers
    const monitorSubscribers = this.monitorSubscriptions.get(event.monitorId);
    if (monitorSubscribers) {
      for (const socketId of monitorSubscribers) {
        try {
          this.io.to(socketId).emit(event.type, {
            type: event.type,
            data: event.data,
            timestamp: new Date(),
            monitorId: event.monitorId
          });
        } catch (error) {
          logger.warn('Failed to send monitor event to subscriber', { 
            socketId, 
            monitorId: event.monitorId, 
            eventType: event.type,
            error: error.message 
          });
        }
      }
    }

    // Also send to user directly
    this.sendToUser(event.userId, event.type, {
      monitorId: event.monitorId,
      ...event.data
    });

    logger.debug('Change monitor event sent', { 
      eventType: event.type, 
      monitorId: event.monitorId, 
      userId: event.userId 
    });
  }

  public broadcastSystemNotification(notification: {
    type: 'maintenance' | 'update' | 'alert' | 'info';
    title: string;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    targetUsers?: string[];
    expiresAt?: Date;
  }): void {
    const message: WebSocketMessage = {
      type: 'system_notification',
      data: {
        ...notification,
        id: `system_${Date.now()}`,
        timestamp: new Date()
      },
      timestamp: new Date()
    };

    if (notification.targetUsers && notification.targetUsers.length > 0) {
      // Send to specific users
      for (const userId of notification.targetUsers) {
        this.sendToUser(userId, 'system_notification', message.data);
      }
    } else {
      // Broadcast to all connected users
      this.io.emit('system_notification', message);
    }

    logger.info('System notification broadcasted', { 
      type: notification.type, 
      severity: notification.severity,
      targetUsers: notification.targetUsers?.length || 'all',
      connectedUsers: this.connectedUsers.size
    });
  }

  public getConnectionStats(): {
    totalConnections: number;
    connectedUsers: number;
    analysisSubscriptions: number;
    monitorSubscriptions: number;
    averageConnectionsPerUser: number;
  } {
    const totalConnections = this.io.engine.clientsCount;
    const connectedUsers = this.connectedUsers.size;
    const analysisSubscriptions = this.analysisSubscriptions.size;
    const monitorSubscriptions = this.monitorSubscriptions.size;
    const averageConnectionsPerUser = connectedUsers > 0 ? totalConnections / connectedUsers : 0;

    return {
      totalConnections,
      connectedUsers,
      analysisSubscriptions,
      monitorSubscriptions,
      averageConnectionsPerUser: Math.round(averageConnectionsPerUser * 100) / 100
    };
  }

  public getUserConnections(userId: string): string[] {
    const userSockets = this.connectedUsers.get(userId);
    return userSockets ? Array.from(userSockets) : [];
  }

  public isUserConnected(userId: string): boolean {
    const userSockets = this.connectedUsers.get(userId);
    return userSockets ? userSockets.size > 0 : false;
  }

  public disconnectUser(userId: string, reason: string = 'Server initiated disconnect'): number {
    const userSockets = this.connectedUsers.get(userId);
    if (!userSockets) {
      return 0;
    }

    let disconnectedCount = 0;
    for (const socketId of userSockets) {
      try {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
          disconnectedCount++;
        }
      } catch (error) {
        logger.warn('Failed to disconnect socket', { socketId, userId, error: error.message });
      }
    }

    logger.info('User disconnected by server', { userId, disconnectedCount, reason });
    return disconnectedCount;
  }

  private async getAnalysisStatus(analysisId: string, userId: string): Promise<any> {
    try {
      // This would integrate with the analysis service to get current status
      // For now, return a placeholder
      return {
        id: analysisId,
        status: 'processing',
        progress: {
          percentage: 45,
          stage: 'analysis',
          message: 'Analyzing document content'
        },
        estimatedTimeRemaining: 15000
      };
    } catch (error) {
      logger.error('Failed to get analysis status', { error: error.message, analysisId, userId });
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down WebSocket service');
    
    // Send shutdown notification to all clients
    this.broadcastSystemNotification({
      type: 'maintenance',
      title: 'Service Maintenance',
      message: 'The service is shutting down for maintenance. Please reconnect in a few minutes.',
      severity: 'medium'
    });

    // Wait a bit for the message to be sent
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Close all connections
    this.io.close();
    
    // Clear all tracking data
    this.connectedUsers.clear();
    this.userSockets.clear();
    this.analysisSubscriptions.clear();
    this.monitorSubscriptions.clear();

    logger.info('WebSocket service shut down complete');
  }
}

// Factory function to create WebSocketService
export function createWebSocketService(httpServer: HttpServer): WebSocketService {
  return new WebSocketService(httpServer);
}