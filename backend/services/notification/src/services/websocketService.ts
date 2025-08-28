import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';

const logger = createServiceLogger('websocket-service');
const prisma = new PrismaClient();

export interface WebSocketUser {
  userId: string;
  socketId: string;
  connectedAt: Date;
  lastActivity: Date;
}

export interface NotificationUpdate {
  notificationId: string;
  status: string;
  progress?: {
    total: number;
    sent: number;
    delivered: number;
    failed: number;
  };
  delivery?: {
    channel: string;
    status: string;
    timestamp: Date;
  };
}

export interface UserEngagementEvent {
  userId: string;
  event: 'notification_received' | 'notification_read' | 'notification_clicked';
  notificationId: string;
  timestamp: Date;
  metadata?: any;
}

export class WebSocketService {
  private io: SocketIOServer;
  private connectedUsers = new Map<string, WebSocketUser>();
  private userSockets = new Map<string, Set<string>>(); // userId -> Set<socketId>
  private initialized = false;

  constructor(httpServer: HttpServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.cors.origins,
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.setupEventHandlers();
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Test database connection
      await prisma.$connect();

      this.initialized = true;
      logger.info('WebSocket service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize WebSocket service', { error });
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      // Disconnect all clients
      this.io.disconnectSockets(true);
      
      // Close server
      this.io.close();

      // Clear connection maps
      this.connectedUsers.clear();
      this.userSockets.clear();

      await prisma.$disconnect();

      this.initialized = false;
      logger.info('WebSocket service shut down successfully');
    } catch (error) {
      logger.error('Error during WebSocket service shutdown', { error });
    }
  }

  private setupEventHandlers(): void {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, config.jwt.secret) as any;
        const userId = decoded.userId || decoded.sub;

        if (!userId) {
          return next(new Error('Invalid token'));
        }

        // Attach user info to socket
        socket.userId = userId;
        socket.userEmail = decoded.email;
        socket.userName = decoded.name || decoded.displayName;

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

    // Connection handling
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    logger.info('WebSocket event handlers setup completed');
  }

  private handleConnection(socket: Socket): void {
    const userId = socket.userId;
    const socketId = socket.id;

    logger.info('User connected via WebSocket', {
      userId,
      socketId,
      userAgent: socket.handshake.headers['user-agent'],
      ip: socket.handshake.address,
    });

    // Track connection
    const user: WebSocketUser = {
      userId,
      socketId,
      connectedAt: new Date(),
      lastActivity: new Date(),
    };

    this.connectedUsers.set(socketId, user);

    // Add to user sockets map
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);

    // Join user-specific room
    socket.join(`user:${userId}`);

    // Setup socket event handlers
    this.setupSocketEventHandlers(socket);

    // Send connection acknowledgment
    socket.emit('connected', {
      message: 'Connected to notification service',
      userId,
      timestamp: new Date(),
    });

    // Send unread notifications count
    this.sendUnreadNotificationsCount(socket);

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });
  }

  private setupSocketEventHandlers(socket: Socket): void {
    const userId = socket.userId;

    // Handle ping for keep-alive
    socket.on('ping', () => {
      this.updateUserActivity(socket.id);
      socket.emit('pong', { timestamp: new Date() });
    });

    // Handle notification read events
    socket.on('notification:read', async (data: { notificationId: string }) => {
      try {
        await this.handleNotificationRead(userId, data.notificationId);
        socket.emit('notification:read:ack', {
          notificationId: data.notificationId,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Failed to handle notification read event', { error, userId, data });
        socket.emit('error', {
          event: 'notification:read',
          message: error.message,
        });
      }
    });

    // Handle notification click events
    socket.on('notification:click', async (data: { notificationId: string; actionUrl?: string }) => {
      try {
        await this.handleNotificationClick(userId, data.notificationId, data.actionUrl);
        socket.emit('notification:click:ack', {
          notificationId: data.notificationId,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Failed to handle notification click event', { error, userId, data });
        socket.emit('error', {
          event: 'notification:click',
          message: error.message,
        });
      }
    });

    // Handle subscription to specific notification updates
    socket.on('subscribe:notification', (data: { notificationId: string }) => {
      socket.join(`notification:${data.notificationId}`);
      socket.emit('subscription:ack', {
        type: 'notification',
        id: data.notificationId,
        timestamp: new Date(),
      });
    });

    // Handle unsubscription
    socket.on('unsubscribe:notification', (data: { notificationId: string }) => {
      socket.leave(`notification:${data.notificationId}`);
      socket.emit('unsubscription:ack', {
        type: 'notification',
        id: data.notificationId,
        timestamp: new Date(),
      });
    });

    // Handle user preferences updates
    socket.on('preferences:update', async (data: any) => {
      try {
        // This would integrate with preference service
        socket.emit('preferences:update:ack', {
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Failed to handle preferences update', { error, userId, data });
        socket.emit('error', {
          event: 'preferences:update',
          message: error.message,
        });
      }
    });

    // Handle request for notification history
    socket.on('notifications:history', async (data: { 
      limit?: number; 
      offset?: number; 
      unreadOnly?: boolean;
    }) => {
      try {
        const notifications = await this.getUserNotifications(userId, data);
        socket.emit('notifications:history:response', {
          notifications,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Failed to get notification history', { error, userId, data });
        socket.emit('error', {
          event: 'notifications:history',
          message: error.message,
        });
      }
    });

    // Update activity timestamp
    this.updateUserActivity(socket.id);
  }

  private handleDisconnection(socket: Socket, reason: string): void {
    const userId = socket.userId;
    const socketId = socket.id;

    logger.info('User disconnected from WebSocket', {
      userId,
      socketId,
      reason,
    });

    // Remove from connection tracking
    this.connectedUsers.delete(socketId);

    // Remove from user sockets map
    const userSockets = this.userSockets.get(userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }
  }

  private updateUserActivity(socketId: string): void {
    const user = this.connectedUsers.get(socketId);
    if (user) {
      user.lastActivity = new Date();
    }
  }

  // Public methods for sending notifications
  public async sendNotificationUpdate(
    userId: string,
    update: NotificationUpdate
  ): Promise<void> {
    try {
      const userSockets = this.userSockets.get(userId);
      if (!userSockets || userSockets.size === 0) {
        logger.debug('No WebSocket connections for user', { userId });
        return;
      }

      // Send to user room
      this.io.to(`user:${userId}`).emit('notification:update', {
        ...update,
        timestamp: new Date(),
      });

      // Also send to specific notification room
      this.io.to(`notification:${update.notificationId}`).emit('notification:update', {
        ...update,
        timestamp: new Date(),
      });

      logger.debug('Notification update sent via WebSocket', {
        userId,
        notificationId: update.notificationId,
        status: update.status,
        connectedSockets: userSockets.size,
      });
    } catch (error) {
      logger.error('Failed to send notification update via WebSocket', { error, userId, update });
    }
  }

  public async sendNewNotification(
    userId: string,
    notification: {
      id: string;
      type: string;
      title: string;
      message: string;
      data?: any;
      actionUrl?: string;
      createdAt: Date;
    }
  ): Promise<void> {
    try {
      const userSockets = this.userSockets.get(userId);
      if (!userSockets || userSockets.size === 0) {
        logger.debug('No WebSocket connections for user', { userId });
        return;
      }

      this.io.to(`user:${userId}`).emit('notification:new', {
        ...notification,
        timestamp: new Date(),
      });

      // Also update unread count
      this.sendUnreadNotificationsCount(userId);

      logger.debug('New notification sent via WebSocket', {
        userId,
        notificationId: notification.id,
        type: notification.type,
        connectedSockets: userSockets.size,
      });
    } catch (error) {
      logger.error('Failed to send new notification via WebSocket', { error, userId, notification });
    }
  }

  public async sendBulkNotificationUpdate(
    userIds: string[],
    update: NotificationUpdate
  ): Promise<void> {
    try {
      const connectedUserIds = userIds.filter(userId => this.userSockets.has(userId));
      
      if (connectedUserIds.length === 0) {
        logger.debug('No connected users for bulk update', { totalUsers: userIds.length });
        return;
      }

      // Send to all connected users
      const rooms = connectedUserIds.map(userId => `user:${userId}`);
      this.io.to(rooms).emit('notification:update', {
        ...update,
        timestamp: new Date(),
      });

      logger.debug('Bulk notification update sent via WebSocket', {
        totalUsers: userIds.length,
        connectedUsers: connectedUserIds.length,
        notificationId: update.notificationId,
      });
    } catch (error) {
      logger.error('Failed to send bulk notification update via WebSocket', { error, userIds, update });
    }
  }

  public async sendSystemNotification(message: {
    type: 'maintenance' | 'alert' | 'info';
    title: string;
    message: string;
    targetUsers?: string[];
  }): Promise<void> {
    try {
      const eventName = 'system:notification';
      const payload = {
        ...message,
        timestamp: new Date(),
      };

      if (message.targetUsers && message.targetUsers.length > 0) {
        // Send to specific users
        const rooms = message.targetUsers
          .filter(userId => this.userSockets.has(userId))
          .map(userId => `user:${userId}`);
        
        this.io.to(rooms).emit(eventName, payload);
        
        logger.info('System notification sent to specific users', {
          type: message.type,
          targetUsers: message.targetUsers.length,
          connectedUsers: rooms.length,
        });
      } else {
        // Broadcast to all connected users
        this.io.emit(eventName, payload);
        
        logger.info('System notification broadcast to all users', {
          type: message.type,
          totalConnectedUsers: this.connectedUsers.size,
        });
      }
    } catch (error) {
      logger.error('Failed to send system notification via WebSocket', { error, message });
    }
  }

  // Analytics and monitoring
  public getConnectionStats(): {
    totalConnections: number;
    uniqueUsers: number;
    averageConnectionsPerUser: number;
    connectionsByRoom: Record<string, number>;
  } {
    const totalConnections = this.connectedUsers.size;
    const uniqueUsers = this.userSockets.size;
    const averageConnectionsPerUser = uniqueUsers > 0 ? totalConnections / uniqueUsers : 0;

    // Get room statistics
    const connectionsByRoom: Record<string, number> = {};
    for (const [roomName, sockets] of this.io.sockets.adapter.rooms) {
      if (roomName.startsWith('user:') || roomName.startsWith('notification:')) {
        connectionsByRoom[roomName] = sockets.size;
      }
    }

    return {
      totalConnections,
      uniqueUsers,
      averageConnectionsPerUser: Math.round(averageConnectionsPerUser * 100) / 100,
      connectionsByRoom,
    };
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
    const userSockets = this.userSockets.get(userId);
    
    if (!userSockets || userSockets.size === 0) {
      return {
        isConnected: false,
        connectionCount: 0,
        connections: [],
      };
    }

    const connections = Array.from(userSockets).map(socketId => {
      const user = this.connectedUsers.get(socketId);
      return {
        socketId,
        connectedAt: user?.connectedAt || new Date(),
        lastActivity: user?.lastActivity || new Date(),
      };
    });

    return {
      isConnected: true,
      connectionCount: userSockets.size,
      connections,
    };
  }

  // Private helper methods
  private async sendUnreadNotificationsCount(socketOrUserId: Socket | string): Promise<void> {
    try {
      let userId: string;
      let socket: Socket | undefined;

      if (typeof socketOrUserId === 'string') {
        userId = socketOrUserId;
      } else {
        socket = socketOrUserId;
        userId = socket.userId;
      }

      const unreadCount = await this.getUnreadNotificationsCount(userId);

      if (socket) {
        socket.emit('notifications:unread:count', {
          count: unreadCount,
          timestamp: new Date(),
        });
      } else {
        this.io.to(`user:${userId}`).emit('notifications:unread:count', {
          count: unreadCount,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      logger.error('Failed to send unread notifications count', { error, socketOrUserId });
    }
  }

  private async getUnreadNotificationsCount(userId: string): Promise<number> {
    try {
      return await prisma.notification.count({
        where: {
          userId,
          readAt: null,
        },
      });
    } catch (error) {
      logger.error('Failed to get unread notifications count', { error, userId });
      return 0;
    }
  }

  private async getUserNotifications(userId: string, options: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
  }): Promise<any[]> {
    try {
      const {
        limit = 50,
        offset = 0,
        unreadOnly = false,
      } = options;

      const whereClause: any = { userId };
      if (unreadOnly) {
        whereClause.readAt = null;
      }

      const notifications = await prisma.notification.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          data: true,
          readAt: true,
          actionUrl: true,
          expiresAt: true,
          createdAt: true,
        },
      });

      return notifications.map(notification => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data ? JSON.parse(notification.data) : null,
        readAt: notification.readAt,
        actionUrl: notification.actionUrl,
        expiresAt: notification.expiresAt,
        createdAt: notification.createdAt,
      }));
    } catch (error) {
      logger.error('Failed to get user notifications', { error, userId, options });
      return [];
    }
  }

  private async handleNotificationRead(userId: string, notificationId: string): Promise<void> {
    try {
      await prisma.notification.update({
        where: { 
          id: notificationId,
          userId, // Ensure user owns the notification
        },
        data: { readAt: new Date() },
      });

      // Update unread count
      this.sendUnreadNotificationsCount(userId);

      logger.debug('Notification marked as read via WebSocket', {
        userId,
        notificationId,
      });
    } catch (error) {
      logger.error('Failed to mark notification as read', { error, userId, notificationId });
      throw error;
    }
  }

  private async handleNotificationClick(
    userId: string,
    notificationId: string,
    actionUrl?: string
  ): Promise<void> {
    try {
      // Mark as read if not already read
      await prisma.notification.updateMany({
        where: {
          id: notificationId,
          userId,
          readAt: null,
        },
        data: { readAt: new Date() },
      });

      // Track click event for analytics
      // This would integrate with analytics service

      // Update unread count
      this.sendUnreadNotificationsCount(userId);

      logger.debug('Notification click tracked via WebSocket', {
        userId,
        notificationId,
        actionUrl,
      });
    } catch (error) {
      logger.error('Failed to handle notification click', { error, userId, notificationId });
      throw error;
    }
  }

  // Cleanup inactive connections
  public cleanupInactiveConnections(inactiveThresholdMinutes: number = 30): number {
    const thresholdTime = new Date(Date.now() - inactiveThresholdMinutes * 60 * 1000);
    let cleanedCount = 0;

    for (const [socketId, user] of this.connectedUsers) {
      if (user.lastActivity < thresholdTime) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      logger.info('Cleaned up inactive WebSocket connections', {
        count: cleanedCount,
        thresholdMinutes: inactiveThresholdMinutes,
      });
    }

    return cleanedCount;
  }
}

// Factory function to create WebSocket service
export function createWebSocketService(httpServer: HttpServer): WebSocketService {
  return new WebSocketService(httpServer);
}

// Extend Socket interface for TypeScript
declare module 'socket.io' {
  interface Socket {
    userId: string;
    userEmail: string;
    userName: string;
  }
}