// WebSocket Service for Real-time Configuration Updates
// Provides hot-reload capabilities and real-time configuration notifications

import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { IncomingMessage } from 'http';
import { ConfigurationService } from './configuration';
import { FeatureFlagsService } from './feature-flags';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

export interface WebSocketConnection {
  id: string;
  ws: WebSocket;
  serviceName?: string;
  environment?: string;
  subscriptions: Set<string>;
  lastPing: Date;
  metadata: {
    userAgent?: string;
    clientIp?: string;
    version?: string;
  };
}

export interface ConfigurationUpdateMessage {
  type: 'CONFIGURATION_UPDATE';
  serviceName: string;
  environment: string;
  version: number;
  config: any;
  timestamp: string;
}

export interface FeatureFlagUpdateMessage {
  type: 'FEATURE_FLAG_UPDATE';
  flagKey: string;
  enabled: boolean;
  rolloutPercentage?: number;
  timestamp: string;
}

export interface ReloadMessage {
  type: 'CONFIGURATION_RELOAD';
  serviceName: string;
  environment: string;
  force: boolean;
  timestamp: string;
}

export type WebSocketMessage = ConfigurationUpdateMessage | FeatureFlagUpdateMessage | ReloadMessage;

export class WebSocketService extends EventEmitter {
  private wss: WebSocketServer;
  private connections = new Map<string, WebSocketConnection>();
  private configService: ConfigurationService;
  private featureFlagsService: FeatureFlagsService;
  private redis: Redis;
  private heartbeatInterval: NodeJS.Timeout;
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    configService: ConfigurationService,
    featureFlagsService: FeatureFlagsService,
    redis: Redis,
    options: {
      port?: number;
      heartbeatInterval?: number;
      connectionTimeout?: number;
    } = {}
  ) {
    super();
    
    this.configService = configService;
    this.featureFlagsService = featureFlagsService;
    this.redis = redis;

    // Create WebSocket server
    this.wss = new WebSocketServer({
      port: options.port || 8080,
      perMessageDeflate: false,
    });

    // Set up event handlers
    this.setupWebSocketServer();
    this.setupServiceEventHandlers();
    this.setupRedisSubscriptions();

    // Start heartbeat and cleanup intervals
    this.startHeartbeat(options.heartbeatInterval || 30000);
    this.startCleanup(options.connectionTimeout || 300000); // 5 minutes
  }

  // Get connection statistics
  getConnectionStats(): {
    totalConnections: number;
    connectionsByService: Record<string, number>;
    connectionsByEnvironment: Record<string, number>;
  } {
    const totalConnections = this.connections.size;
    const connectionsByService: Record<string, number> = {};
    const connectionsByEnvironment: Record<string, number> = {};

    for (const connection of this.connections.values()) {
      if (connection.serviceName) {
        connectionsByService[connection.serviceName] = 
          (connectionsByService[connection.serviceName] || 0) + 1;
      }
      if (connection.environment) {
        connectionsByEnvironment[connection.environment] = 
          (connectionsByEnvironment[connection.environment] || 0) + 1;
      }
    }

    return {
      totalConnections,
      connectionsByService,
      connectionsByEnvironment,
    };
  }

  // Broadcast message to specific service subscribers
  async broadcastToService(serviceName: string, message: WebSocketMessage): Promise<number> {
    let sentCount = 0;
    
    for (const connection of this.connections.values()) {
      if (connection.serviceName === serviceName && connection.ws.readyState === WebSocket.OPEN) {
        try {
          connection.ws.send(JSON.stringify(message));
          sentCount++;
        } catch (error) {
          console.error(`Failed to send message to connection ${connection.id}:`, error);
          this.removeConnection(connection.id);
        }
      }
    }

    return sentCount;
  }

  // Broadcast message to all connections
  async broadcastToAll(message: WebSocketMessage): Promise<number> {
    let sentCount = 0;
    
    for (const connection of this.connections.values()) {
      if (connection.ws.readyState === WebSocket.OPEN) {
        try {
          connection.ws.send(JSON.stringify(message));
          sentCount++;
        } catch (error) {
          console.error(`Failed to send message to connection ${connection.id}:`, error);
          this.removeConnection(connection.id);
        }
      }
    }

    return sentCount;
  }

  // Close all connections
  async closeAllConnections(): Promise<void> {
    for (const connection of this.connections.values()) {
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.close(1000, 'Server shutdown');
      }
    }
    
    this.connections.clear();
  }

  // Shutdown the WebSocket server
  async shutdown(): Promise<void> {
    // Clear intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Close all connections
    await this.closeAllConnections();

    // Close WebSocket server
    return new Promise((resolve) => {
      this.wss.close(() => {
        resolve();
      });
    });
  }

  // Private methods

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      const connectionId = uuidv4();
      const clientIp = request.socket.remoteAddress;
      const userAgent = request.headers['user-agent'];

      const connection: WebSocketConnection = {
        id: connectionId,
        ws,
        subscriptions: new Set(),
        lastPing: new Date(),
        metadata: {
          clientIp,
          userAgent,
        },
      };

      this.connections.set(connectionId, connection);

      console.log(`WebSocket connection established: ${connectionId}`);

      // Set up connection event handlers
      ws.on('message', (data: Buffer) => {
        this.handleMessage(connection, data);
      });

      ws.on('close', (code: number, reason: Buffer) => {
        console.log(`WebSocket connection closed: ${connectionId}, code: ${code}, reason: ${reason.toString()}`);
        this.removeConnection(connectionId);
      });

      ws.on('error', (error: Error) => {
        console.error(`WebSocket connection error: ${connectionId}`, error);
        this.removeConnection(connectionId);
      });

      ws.on('pong', () => {
        connection.lastPing = new Date();
      });

      // Send welcome message
      this.sendMessage(connection, {
        type: 'WELCOME',
        connectionId,
        timestamp: new Date().toISOString(),
      });

      this.emit('connectionEstablished', connection);
    });

    this.wss.on('error', (error: Error) => {
      console.error('WebSocket server error:', error);
      this.emit('serverError', error);
    });

    console.log(`WebSocket server started on port ${this.wss.options.port}`);
  }

  private async handleMessage(connection: WebSocketConnection, data: Buffer): Promise<void> {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'SUBSCRIBE':
          await this.handleSubscription(connection, message);
          break;
        case 'UNSUBSCRIBE':
          await this.handleUnsubscription(connection, message);
          break;
        case 'PING':
          connection.lastPing = new Date();
          this.sendMessage(connection, {
            type: 'PONG',
            timestamp: new Date().toISOString(),
          });
          break;
        case 'GET_CONFIG':
          await this.handleConfigRequest(connection, message);
          break;
        case 'EVALUATE_FLAGS':
          await this.handleFeatureFlagEvaluation(connection, message);
          break;
        default:
          this.sendMessage(connection, {
            type: 'ERROR',
            message: `Unknown message type: ${message.type}`,
            timestamp: new Date().toISOString(),
          });
      }
    } catch (error) {
      console.error(`Failed to handle WebSocket message from ${connection.id}:`, error);
      this.sendMessage(connection, {
        type: 'ERROR',
        message: 'Invalid message format',
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async handleSubscription(connection: WebSocketConnection, message: any): Promise<void> {
    const { serviceName, environment = 'production', subscriptions = [] } = message;

    connection.serviceName = serviceName;
    connection.environment = environment;

    // Add subscriptions
    for (const subscription of subscriptions) {
      connection.subscriptions.add(subscription);
    }

    // Register with configuration service
    if (serviceName) {
      await this.configService.subscribeToConfigurationChanges(serviceName, connection.id);
    }

    // Send confirmation
    this.sendMessage(connection, {
      type: 'SUBSCRIPTION_CONFIRMED',
      serviceName,
      environment,
      subscriptions: Array.from(connection.subscriptions),
      timestamp: new Date().toISOString(),
    });

    console.log(`Connection ${connection.id} subscribed to ${serviceName}:${environment}`);
  }

  private async handleUnsubscription(connection: WebSocketConnection, message: any): Promise<void> {
    const { serviceName, subscriptions = [] } = message;

    // Remove specific subscriptions
    for (const subscription of subscriptions) {
      connection.subscriptions.delete(subscription);
    }

    // If no subscriptions left, unregister from service
    if (connection.subscriptions.size === 0 && connection.serviceName) {
      await this.configService.unsubscribeFromConfigurationChanges(
        connection.serviceName,
        connection.id
      );
      connection.serviceName = undefined;
      connection.environment = undefined;
    }

    this.sendMessage(connection, {
      type: 'UNSUBSCRIPTION_CONFIRMED',
      serviceName,
      remainingSubscriptions: Array.from(connection.subscriptions),
      timestamp: new Date().toISOString(),
    });
  }

  private async handleConfigRequest(connection: WebSocketConnection, message: any): Promise<void> {
    const { serviceName, environment = 'production', version } = message;

    try {
      const config = await this.configService.getConfiguration(serviceName, environment, version);
      
      this.sendMessage(connection, {
        type: 'CONFIG_RESPONSE',
        serviceName,
        environment,
        config,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.sendMessage(connection, {
        type: 'ERROR',
        message: `Failed to retrieve configuration: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async handleFeatureFlagEvaluation(connection: WebSocketConnection, message: any): Promise<void> {
    const { flags, context } = message;

    try {
      const evaluationContext = {
        ...context,
        clientIp: connection.metadata.clientIp,
        userAgent: connection.metadata.userAgent,
      };

      const evaluations = await this.featureFlagsService.evaluateFeatureFlags(flags, evaluationContext);
      
      this.sendMessage(connection, {
        type: 'FEATURE_FLAGS_RESPONSE',
        evaluations,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.sendMessage(connection, {
        type: 'ERROR',
        message: `Failed to evaluate feature flags: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private sendMessage(connection: WebSocketConnection, message: any): void {
    if (connection.ws.readyState === WebSocket.OPEN) {
      try {
        connection.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`Failed to send message to connection ${connection.id}:`, error);
        this.removeConnection(connection.id);
      }
    }
  }

  private removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      // Unsubscribe from configuration changes
      if (connection.serviceName) {
        this.configService.unsubscribeFromConfigurationChanges(
          connection.serviceName,
          connectionId
        ).catch(error => {
          console.error('Failed to unsubscribe from configuration changes:', error);
        });
      }

      this.connections.delete(connectionId);
      this.emit('connectionClosed', connection);
    }
  }

  private setupServiceEventHandlers(): void {
    // Configuration update events
    this.configService.on('configurationUpdated', (event) => {
      const message: ConfigurationUpdateMessage = {
        type: 'CONFIGURATION_UPDATE',
        serviceName: event.serviceName,
        environment: event.environment,
        version: event.version,
        config: event.config,
        timestamp: new Date().toISOString(),
      };

      this.broadcastToService(event.serviceName, message);
    });

    this.configService.on('configurationReload', (event) => {
      const message: ReloadMessage = {
        type: 'CONFIGURATION_RELOAD',
        serviceName: event.serviceName,
        environment: event.environment,
        force: event.force,
        timestamp: event.timestamp,
      };

      this.broadcastToService(event.serviceName, message);
    });

    // Feature flag update events
    this.featureFlagsService.on('flagUpdated', (flag) => {
      const message: FeatureFlagUpdateMessage = {
        type: 'FEATURE_FLAG_UPDATE',
        flagKey: flag.key,
        enabled: flag.enabled,
        rolloutPercentage: flag.rolloutPercentage,
        timestamp: new Date().toISOString(),
      };

      this.broadcastToAll(message);
    });
  }

  private setupRedisSubscriptions(): void {
    // Subscribe to Redis pub/sub for cross-instance communication
    const subscriber = this.redis.duplicate();
    
    subscriber.psubscribe('config:*');
    subscriber.psubscribe('flags:*');
    
    subscriber.on('pmessage', (pattern, channel, message) => {
      try {
        const event = JSON.parse(message);
        
        if (channel.startsWith('config:')) {
          this.handleRedisConfigEvent(event);
        } else if (channel.startsWith('flags:')) {
          this.handleRedisFeatureFlagEvent(event);
        }
      } catch (error) {
        console.error('Failed to parse Redis message:', error);
      }
    });
  }

  private handleRedisConfigEvent(event: any): void {
    if (event.type === 'CONFIGURATION_CHANGED') {
      const message: ConfigurationUpdateMessage = {
        type: 'CONFIGURATION_UPDATE',
        serviceName: event.serviceName,
        environment: event.environment,
        version: event.version,
        config: event.config,
        timestamp: event.timestamp,
      };

      this.broadcastToService(event.serviceName, message);
    }
  }

  private handleRedisFeatureFlagEvent(event: any): void {
    if (event.type === 'FEATURE_FLAG_CHANGED') {
      const message: FeatureFlagUpdateMessage = {
        type: 'FEATURE_FLAG_UPDATE',
        flagKey: event.flagKey,
        enabled: event.enabled,
        rolloutPercentage: event.rolloutPercentage,
        timestamp: event.timestamp,
      };

      this.broadcastToAll(message);
    }
  }

  private startHeartbeat(interval: number): void {
    this.heartbeatInterval = setInterval(() => {
      for (const connection of this.connections.values()) {
        if (connection.ws.readyState === WebSocket.OPEN) {
          try {
            connection.ws.ping();
          } catch (error) {
            console.error(`Failed to ping connection ${connection.id}:`, error);
            this.removeConnection(connection.id);
          }
        }
      }
    }, interval);
  }

  private startCleanup(timeout: number): void {
    this.cleanupInterval = setInterval(() => {
      const now = new Date();
      const connectionsToRemove: string[] = [];

      for (const [id, connection] of this.connections.entries()) {
        const timeSinceLastPing = now.getTime() - connection.lastPing.getTime();
        
        if (timeSinceLastPing > timeout || connection.ws.readyState !== WebSocket.OPEN) {
          connectionsToRemove.push(id);
        }
      }

      for (const id of connectionsToRemove) {
        console.log(`Cleaning up stale connection: ${id}`);
        this.removeConnection(id);
      }
    }, timeout / 2); // Check every half of the timeout period
  }
}