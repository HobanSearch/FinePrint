import { Socket } from 'socket.io';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { cache } from '@fineprintai/shared-cache';
import { WebSocketClient } from '@fineprintai/shared-types';

const logger = createServiceLogger('connection-manager');

export interface ConnectionStats {
  totalConnections: number;
  uniqueUsers: number;
  averageConnectionsPerUser: number;
  connectionsByRoom: Record<string, number>;
}

export interface UserConnectionInfo {
  isConnected: boolean;
  connectionCount: number;
  connections: Array<{
    socketId: string;
    connectedAt: Date;
    lastActivity: Date;
    userAgent?: string;
    ip?: string;
  }>;
}

export class ConnectionManager {
  private connections = new Map<string, WebSocketClient>(); // socketId -> client info
  private userConnections = new Map<string, Set<string>>(); // userId -> Set<socketId>
  private socketToUser = new Map<string, string>(); // socketId -> userId
  private initialized = false;

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load persisted connection data if available
      await this.loadPersistedConnections();

      this.initialized = true;
      logger.info('Connection manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize connection manager', { error });
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      // Persist connection data for recovery
      await this.persistConnections();

      // Clear all connection data
      this.connections.clear();
      this.userConnections.clear();
      this.socketToUser.clear();

      this.initialized = false;
      logger.info('Connection manager shut down successfully');
    } catch (error) {
      logger.error('Error during connection manager shutdown', { error });
    }
  }

  public async addConnection(socket: Socket): Promise<void> {
    try {
      const userId = socket.userId;
      const socketId = socket.id;
      const now = new Date();

      // Create client info
      const client: WebSocketClient = {
        id: socketId,
        userId,
        teamId: socket.teamId,
        connectedAt: now,
        lastActivity: now,
        subscriptions: [],
      };

      // Store connection
      this.connections.set(socketId, client);
      this.socketToUser.set(socketId, userId);

      // Add to user connections
      if (!this.userConnections.has(userId)) {
        this.userConnections.set(userId, new Set());
      }
      this.userConnections.get(userId)!.add(socketId);

      // Store in cache for persistence
      await this.persistConnectionInfo(client);

      logger.debug('Connection added', {
        userId,
        socketId,
        totalConnections: this.connections.size,
        userConnections: this.userConnections.get(userId)?.size,
      });

    } catch (error) {
      logger.error('Error adding connection', { error, socketId: socket.id });
      throw error;
    }
  }

  public removeConnection(socketId: string): void {
    try {
      const client = this.connections.get(socketId);
      if (!client) {
        logger.warn('Attempted to remove non-existent connection', { socketId });
        return;
      }

      const userId = client.userId;

      // Remove from connections
      this.connections.delete(socketId);
      this.socketToUser.delete(socketId);

      // Remove from user connections
      const userSockets = this.userConnections.get(userId);
      if (userSockets) {
        userSockets.delete(socketId);
        if (userSockets.size === 0) {
          this.userConnections.delete(userId);
        }
      }

      // Remove from cache
      this.removePersistedConnection(socketId);

      logger.debug('Connection removed', {
        userId,
        socketId,
        totalConnections: this.connections.size,
        userConnections: userSockets?.size || 0,
      });

    } catch (error) {
      logger.error('Error removing connection', { error, socketId });
    }
  }

  public updateActivity(socketId: string): void {
    const client = this.connections.get(socketId);
    if (client) {
      client.lastActivity = new Date();
      
      // Update in cache periodically (every 30 seconds to avoid too many writes)
      const now = Date.now();
      const lastUpdate = client.lastActivity.getTime();
      if (now - lastUpdate > 30000) {
        this.persistConnectionInfo(client).catch(error => {
          logger.error('Error persisting connection activity', { error, socketId });
        });
      }
    }
  }

  public addSubscription(socketId: string, channel: string): void {
    const client = this.connections.get(socketId);
    if (client) {
      if (!client.subscriptions.includes(channel)) {
        client.subscriptions.push(channel);
        logger.debug('Subscription added', { socketId, channel, userId: client.userId });
      }
    }
  }

  public removeSubscription(socketId: string, channel: string): void {
    const client = this.connections.get(socketId);
    if (client) {
      const index = client.subscriptions.indexOf(channel);
      if (index !== -1) {
        client.subscriptions.splice(index, 1);
        logger.debug('Subscription removed', { socketId, channel, userId: client.userId });
      }
    }
  }

  public isUserOnline(userId: string): boolean {
    const userSockets = this.userConnections.get(userId);
    return userSockets !== undefined && userSockets.size > 0;
  }

  public getUserConnections(userId: string): WebSocketClient[] {
    const socketIds = this.userConnections.get(userId);
    if (!socketIds) return [];

    return Array.from(socketIds)
      .map(socketId => this.connections.get(socketId))
      .filter((client): client is WebSocketClient => client !== undefined);
  }

  public getConnection(socketId: string): WebSocketClient | undefined {
    return this.connections.get(socketId);
  }

  public getUserIdFromSocket(socketId: string): string | undefined {
    return this.socketToUser.get(socketId);
  }

  public getConnectionCount(): number {
    return this.connections.size;
  }

  public getUniqueUserCount(): number {
    return this.userConnections.size;
  }

  public getStats(): ConnectionStats {
    const totalConnections = this.connections.size;
    const uniqueUsers = this.userConnections.size;
    const averageConnectionsPerUser = uniqueUsers > 0 ? totalConnections / uniqueUsers : 0;

    // Calculate connections by room (approximate based on subscriptions)
    const connectionsByRoom: Record<string, number> = {};
    
    for (const client of this.connections.values()) {
      // Add user room
      const userRoom = `user:${client.userId}`;
      connectionsByRoom[userRoom] = (connectionsByRoom[userRoom] || 0) + 1;

      // Add team room if available
      if (client.teamId) {
        const teamRoom = `team:${client.teamId}`;
        connectionsByRoom[teamRoom] = (connectionsByRoom[teamRoom] || 0) + 1;
      }

      // Add subscription rooms
      for (const subscription of client.subscriptions) {
        connectionsByRoom[subscription] = (connectionsByRoom[subscription] || 0) + 1;
      }
    }

    return {
      totalConnections,
      uniqueUsers,
      averageConnectionsPerUser: Math.round(averageConnectionsPerUser * 100) / 100,
      connectionsByRoom,
    };
  }

  public getUserInfo(userId: string): UserConnectionInfo {
    const socketIds = this.userConnections.get(userId);
    
    if (!socketIds || socketIds.size === 0) {
      return {
        isConnected: false,
        connectionCount: 0,
        connections: [],
      };
    }

    const connections = Array.from(socketIds).map(socketId => {
      const client = this.connections.get(socketId);
      return {
        socketId,
        connectedAt: client?.connectedAt || new Date(),
        lastActivity: client?.lastActivity || new Date(),
        userAgent: undefined, // Would need to store this in client info
        ip: undefined, // Would need to store this in client info
      };
    });

    return {
      isConnected: true,
      connectionCount: socketIds.size,
      connections,
    };
  }

  public getConnectionsByTeam(teamId: string): WebSocketClient[] {
    const teamConnections: WebSocketClient[] = [];
    
    for (const client of this.connections.values()) {
      if (client.teamId === teamId) {
        teamConnections.push(client);
      }
    }

    return teamConnections;
  }

  public getConnectionsBySubscription(channel: string): WebSocketClient[] {
    const subscribedConnections: WebSocketClient[] = [];
    
    for (const client of this.connections.values()) {
      if (client.subscriptions.includes(channel)) {
        subscribedConnections.push(client);
      }
    }

    return subscribedConnections;
  }

  public cleanupInactive(thresholdMinutes: number = 30): number {
    const thresholdTime = new Date(Date.now() - thresholdMinutes * 60 * 1000);
    let cleanedCount = 0;

    for (const [socketId, client] of this.connections) {
      if (client.lastActivity < thresholdTime) {
        this.removeConnection(socketId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('Cleaned up inactive connections', {
        count: cleanedCount,
        thresholdMinutes,
        remainingConnections: this.connections.size,
      });
    }

    return cleanedCount;
  }

  public async getDetailedStats(): Promise<{
    connections: ConnectionStats;
    users: Array<{
      userId: string;
      connectionCount: number;
      lastActivity: Date;
      teamId?: string;
      subscriptions: string[];
    }>;
    teams: Record<string, number>;
    subscriptions: Record<string, number>;
  }> {
    const connectionStats = this.getStats();
    
    // User details
    const users = Array.from(this.userConnections.keys()).map(userId => {
      const userConnections = this.getUserConnections(userId);
      const latestActivity = userConnections.reduce((latest, conn) => {
        return conn.lastActivity > latest ? conn.lastActivity : latest;
      }, new Date(0));

      const allSubscriptions = new Set<string>();
      let teamId: string | undefined;

      for (const conn of userConnections) {
        if (conn.teamId) teamId = conn.teamId;
        for (const sub of conn.subscriptions) {
          allSubscriptions.add(sub);
        }
      }

      return {
        userId,
        connectionCount: userConnections.length,
        lastActivity: latestActivity,
        teamId,
        subscriptions: Array.from(allSubscriptions),
      };
    });

    // Team stats
    const teams: Record<string, number> = {};
    for (const client of this.connections.values()) {
      if (client.teamId) {
        teams[client.teamId] = (teams[client.teamId] || 0) + 1;
      }
    }

    // Subscription stats
    const subscriptions: Record<string, number> = {};
    for (const client of this.connections.values()) {
      for (const subscription of client.subscriptions) {
        subscriptions[subscription] = (subscriptions[subscription] || 0) + 1;
      }
    }

    return {
      connections: connectionStats,
      users,
      teams,
      subscriptions,
    };
  }

  // Private methods for persistence

  private async persistConnectionInfo(client: WebSocketClient): Promise<void> {
    try {
      await cache.set(
        `connection:${client.id}`,
        {
          id: client.id,
          userId: client.userId,
          teamId: client.teamId,
          connectedAt: client.connectedAt,
          lastActivity: client.lastActivity,
          subscriptions: client.subscriptions,
        },
        3600 // 1 hour TTL
      );
    } catch (error) {
      logger.error('Error persisting connection info', { error, clientId: client.id });
    }
  }

  private async removePersistedConnection(socketId: string): Promise<void> {
    try {
      await cache.del(`connection:${socketId}`);
    } catch (error) {
      logger.error('Error removing persisted connection', { error, socketId });
    }
  }

  private async loadPersistedConnections(): Promise<void> {
    try {
      // This would be used for connection recovery after restart
      // Implementation depends on how we want to handle reconnections
      logger.debug('Loading persisted connections...');
      
      // For now, we start fresh on each restart
      // In a production system, you might want to implement connection recovery
      
    } catch (error) {
      logger.error('Error loading persisted connections', { error });
    }
  }

  private async persistConnections(): Promise<void> {
    try {
      // Persist current connection state for potential recovery
      const connectionData = {
        totalConnections: this.connections.size,
        uniqueUsers: this.userConnections.size,
        timestamp: new Date(),
        connections: Array.from(this.connections.values()),
      };

      await cache.set('websocket:connection_state', connectionData, 300); // 5 minutes
      
      logger.debug('Connection state persisted', {
        totalConnections: connectionData.totalConnections,
        uniqueUsers: connectionData.uniqueUsers,
      });
    } catch (error) {
      logger.error('Error persisting connections', { error });
    }
  }
}