/**
 * Comprehensive StreamingService for Fine Print AI
 * Provides real-time log streaming via WebSockets and message queues
 */

import { EventEmitter } from 'events';
import { WebSocket, WebSocketServer } from 'ws';
import { createServer, Server } from 'http';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import {
  LogEntry,
  MetricData,
  TraceSpan,
  AlertData,
  StreamMessage,
  WebSocketMessage,
  ServiceType,
  Environment,
  LogLevel,
  EventCategory,
} from '../types';
import { LoggerService } from './logger-service';

interface StreamingConfig {
  serviceName: string;
  environment: Environment;
  wsPort: number;
  enableWebSockets: boolean;
  enableRedisStreams: boolean;
  redisUrl?: string;
  maxConnections: number;
  heartbeatInterval: number; // seconds
  bufferSize: number;
  enableMessageCompression: boolean;
  enableAuthentication: boolean;
  rateLimitPerMinute: number;
}

interface ClientConnection {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>;
  authenticated: boolean;
  lastActivity: Date;
  rateLimitCount: number;
  rateLimitResetTime: Date;
  metadata: {
    userAgent?: string;
    ipAddress?: string;
    userId?: string;
    sessionId?: string;
  };
}

interface StreamChannel {
  name: string;
  subscribers: Set<string>;
  messageCount: number;
  lastMessage?: Date;
  retention: number; // hours
  rateLimit: number; // messages per minute
}

export class StreamingService extends EventEmitter {
  private config: StreamingConfig;
  private logger?: LoggerService;
  private wss?: WebSocketServer;
  private httpServer?: Server;
  private redis?: Redis;
  private redisSubscriber?: Redis;
  private connections: Map<string, ClientConnection> = new Map();
  private channels: Map<string, StreamChannel> = new Map();
  private messageBuffer: Map<string, StreamMessage[]> = new Map();
  private heartbeatInterval?: NodeJS.Timeout;
  private rateLimitResetInterval?: NodeJS.Timeout;
  private initialized = false;

  constructor(config: StreamingConfig) {
    super();
    this.config = config;
    this.setupChannels();
  }

  /**
   * Initialize the streaming service
   */
  async initialize(logger?: LoggerService): Promise<void> {
    this.logger = logger;

    try {
      // Initialize Redis if enabled
      if (this.config.enableRedisStreams) {
        await this.initializeRedis();
      }

      // Initialize WebSocket server if enabled
      if (this.config.enableWebSockets) {
        await this.initializeWebSocketServer();
      }

      // Setup intervals
      this.setupHeartbeat();
      this.setupRateLimitReset();

      this.initialized = true;

      this.logger?.info('Streaming service initialized', {
        service: 'streaming-service' as ServiceType,
        environment: this.config.environment,
        wsPort: this.config.wsPort,
        enabledFeatures: {
          webSockets: this.config.enableWebSockets,
          redisStreams: this.config.enableRedisStreams,
          authentication: this.config.enableAuthentication,
          compression: this.config.enableMessageCompression,
        },
      });

      this.emit('initialized');
    } catch (error) {
      this.logger?.error('Failed to initialize streaming service', {
        service: 'streaming-service' as ServiceType,
        environment: this.config.environment,
      }, error as Error);

      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stream a log entry to subscribed clients
   */
  streamLog(logEntry: LogEntry): void {
    if (!this.initialized) return;

    const message: StreamMessage = {
      id: uuidv4(),
      type: 'log',
      timestamp: new Date(),
      data: logEntry,
      channel: this.getLogChannel(logEntry),
      priority: this.getLogPriority(logEntry),
    };

    this.broadcastMessage(message);
  }

  /**
   * Stream a metric data point to subscribed clients
   */
  streamMetric(metricData: MetricData): void {
    if (!this.initialized) return;

    const message: StreamMessage = {
      id: uuidv4(),
      type: 'metric',
      timestamp: new Date(),
      data: metricData,
      channel: 'metrics',
      priority: 'normal',
    };

    this.broadcastMessage(message);
  }

  /**
   * Stream a trace span to subscribed clients
   */
  streamTrace(traceSpan: TraceSpan): void {
    if (!this.initialized) return;

    const message: StreamMessage = {
      id: uuidv4(),
      type: 'trace',
      timestamp: new Date(),
      data: traceSpan,
      channel: 'traces',
      priority: traceSpan.status === 'error' ? 'high' : 'normal',
    };

    this.broadcastMessage(message);
  }

  /**
   * Stream an alert to subscribed clients
   */
  streamAlert(alertData: AlertData): void {
    if (!this.initialized) return;

    const message: StreamMessage = {
      id: uuidv4(),
      type: 'alert',
      timestamp: new Date(),
      data: alertData,
      channel: `alerts.${alertData.severity}`,
      priority: this.getAlertPriority(alertData.severity),
    };

    this.broadcastMessage(message);
  }

  /**
   * Create a custom stream channel
   */
  createChannel(
    name: string,
    options: {
      retention?: number;
      rateLimit?: number;
    } = {}
  ): void {
    const channel: StreamChannel = {
      name,
      subscribers: new Set(),
      messageCount: 0,
      retention: options.retention || 24, // 24 hours default
      rateLimit: options.rateLimit || 1000, // 1000 messages per minute default
    };

    this.channels.set(name, channel);
    this.messageBuffer.set(name, []);

    this.logger?.debug(`Stream channel created: ${name}`, {
      service: 'streaming-service' as ServiceType,
      environment: this.config.environment,
      channel: name,
      retention: channel.retention,
      rateLimit: channel.rateLimit,
    });
  }

  /**
   * Get channel statistics
   */
  getChannelStats(): Record<string, any> {
    const stats: Record<string, any> = {};

    this.channels.forEach((channel, name) => {
      stats[name] = {
        subscribers: channel.subscribers.size,
        messageCount: channel.messageCount,
        lastMessage: channel.lastMessage,
        retention: channel.retention,
        rateLimit: channel.rateLimit,
      };
    });

    return stats;
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    totalConnections: number;
    authenticatedConnections: number;
    activeConnections: number;
    channelSubscriptions: Record<string, number>;
  } {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    let authenticatedCount = 0;
    let activeCount = 0;
    const channelSubscriptions: Record<string, number> = {};

    this.connections.forEach((connection) => {
      if (connection.authenticated) {
        authenticatedCount++;
      }
      if (connection.lastActivity > fiveMinutesAgo) {
        activeCount++;
      }

      connection.subscriptions.forEach((channel) => {
        channelSubscriptions[channel] = (channelSubscriptions[channel] || 0) + 1;
      });
    });

    return {
      totalConnections: this.connections.size,
      authenticatedConnections: authenticatedCount,
      activeConnections: activeCount,
      channelSubscriptions,
    };
  }

  /**
   * Initialize Redis for stream publishing
   */
  private async initializeRedis(): Promise<void> {
    this.redis = new Redis(this.config.redisUrl || 'redis://localhost:6379');
    this.redisSubscriber = new Redis(this.config.redisUrl || 'redis://localhost:6379');

    await this.redis.ping();

    this.logger?.debug('Redis streams initialized', {
      service: 'streaming-service' as ServiceType,
      environment: this.config.environment,
      redisUrl: this.config.redisUrl || 'redis://localhost:6379',
    });
  }

  /**
   * Initialize WebSocket server
   */
  private async initializeWebSocketServer(): Promise<void> {
    this.httpServer = createServer();
    this.wss = new WebSocketServer({ 
      server: this.httpServer,
      maxPayload: 1024 * 1024, // 1MB max payload
    });

    this.wss.on('connection', (ws, request) => {
      this.handleConnection(ws, request);
    });

    return new Promise((resolve, reject) => {
      this.httpServer!.listen(this.config.wsPort, (error?: Error) => {
        if (error) {
          reject(error);
        } else {
          this.logger?.info(`WebSocket server listening on port ${this.config.wsPort}`, {
            service: 'streaming-service' as ServiceType,
            environment: this.config.environment,
            port: this.config.wsPort,
          });
          resolve();
        }
      });
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, request: any): void {
    const connectionId = uuidv4();
    const connection: ClientConnection = {
      id: connectionId,
      ws,
      subscriptions: new Set(),
      authenticated: !this.config.enableAuthentication, // Auto-authenticate if disabled
      lastActivity: new Date(),
      rateLimitCount: 0,
      rateLimitResetTime: new Date(Date.now() + 60000), // Reset in 1 minute
      metadata: {
        userAgent: request.headers['user-agent'],
        ipAddress: request.socket.remoteAddress,
      },
    };

    this.connections.set(connectionId, connection);

    // Check connection limit
    if (this.connections.size > this.config.maxConnections) {
      ws.close(1013, 'Maximum connections exceeded');
      this.connections.delete(connectionId);
      return;
    }

    this.logger?.debug('WebSocket connection established', {
      service: 'streaming-service' as ServiceType,
      environment: this.config.environment,
      connectionId,
      totalConnections: this.connections.size,
      metadata: connection.metadata,
    });

    // Setup message handler
    ws.on('message', (data) => {
      this.handleMessage(connectionId, data);
    });

    // Setup close handler
    ws.on('close', (code, reason) => {
      this.handleDisconnection(connectionId, code, reason);
    });

    // Setup error handler
    ws.on('error', (error) => {
      this.logger?.error('WebSocket connection error', {
        service: 'streaming-service' as ServiceType,
        environment: this.config.environment,
        connectionId,
      }, error);
    });

    // Send welcome message
    this.sendMessage(connectionId, {
      type: 'heartbeat',
      data: {
        message: 'Connected to Fine Print AI Streaming Service',
        connectionId,
        timestamp: new Date(),
        authenticated: connection.authenticated,
      },
    });

    this.emit('connection', { connectionId, metadata: connection.metadata });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(connectionId: string, data: any): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Update last activity
    connection.lastActivity = new Date();

    // Check rate limit
    if (!this.checkRateLimit(connection)) {
      this.sendMessage(connectionId, {
        type: 'error',
        data: {
          error: 'Rate limit exceeded',
          rateLimitPerMinute: this.config.rateLimitPerMinute,
        },
      });
      return;
    }

    try {
      const message: WebSocketMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'subscribe':
          this.handleSubscription(connectionId, message.channel!);
          break;

        case 'unsubscribe':
          this.handleUnsubscription(connectionId, message.channel!);
          break;

        case 'heartbeat':
          this.sendMessage(connectionId, {
            type: 'heartbeat',
            timestamp: new Date(),
          });
          break;

        default:
          this.sendMessage(connectionId, {
            type: 'error',
            data: { error: `Unknown message type: ${message.type}` },
          });
      }
    } catch (error) {
      this.sendMessage(connectionId, {
        type: 'error',
        data: { error: 'Invalid JSON message' },
      });
    }
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(connectionId: string, code: number, reason: Buffer): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Remove from all channel subscriptions
    connection.subscriptions.forEach((channelName) => {
      const channel = this.channels.get(channelName);
      if (channel) {
        channel.subscribers.delete(connectionId);
      }
    });

    this.connections.delete(connectionId);

    this.logger?.debug('WebSocket connection closed', {
      service: 'streaming-service' as ServiceType,
      environment: this.config.environment,
      connectionId,
      code,
      reason: reason.toString(),
      totalConnections: this.connections.size,
    });

    this.emit('disconnection', { connectionId, code, reason: reason.toString() });
  }

  /**
   * Handle channel subscription
   */
  private handleSubscription(connectionId: string, channelName: string): void {
    const connection = this.connections.get(connectionId);
    const channel = this.channels.get(channelName);

    if (!connection || !channel) {
      this.sendMessage(connectionId, {
        type: 'error',
        data: { error: `Channel not found: ${channelName}` },
      });
      return;
    }

    if (!connection.authenticated) {
      this.sendMessage(connectionId, {
        type: 'error',
        data: { error: 'Authentication required' },
      });
      return;
    }

    connection.subscriptions.add(channelName);
    channel.subscribers.add(connectionId);

    this.sendMessage(connectionId, {
      type: 'subscribe',
      channel: channelName,
      data: { 
        message: `Subscribed to ${channelName}`,
        subscriberCount: channel.subscribers.size,
      },
    });

    this.logger?.debug('Client subscribed to channel', {
      service: 'streaming-service' as ServiceType,
      environment: this.config.environment,
      connectionId,
      channel: channelName,
      subscriberCount: channel.subscribers.size,
    });
  }

  /**
   * Handle channel unsubscription
   */
  private handleUnsubscription(connectionId: string, channelName: string): void {
    const connection = this.connections.get(connectionId);
    const channel = this.channels.get(channelName);

    if (!connection || !channel) return;

    connection.subscriptions.delete(channelName);
    channel.subscribers.delete(connectionId);

    this.sendMessage(connectionId, {
      type: 'unsubscribe',
      channel: channelName,
      data: { 
        message: `Unsubscribed from ${channelName}`,
        subscriberCount: channel.subscribers.size,
      },
    });

    this.logger?.debug('Client unsubscribed from channel', {
      service: 'streaming-service' as ServiceType,
      environment: this.config.environment,
      connectionId,
      channel: channelName,
      subscriberCount: channel.subscribers.size,
    });
  }

  /**
   * Send message to a specific connection
   */
  private sendMessage(connectionId: string, message: WebSocketMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) return;

    try {
      const data = JSON.stringify(message);
      connection.ws.send(data);
    } catch (error) {
      this.logger?.error('Failed to send WebSocket message', {
        service: 'streaming-service' as ServiceType,
        environment: this.config.environment,
        connectionId,
      }, error as Error);
    }
  }

  /**
   * Broadcast message to all subscribers of a channel
   */
  private broadcastMessage(streamMessage: StreamMessage): void {
    const channel = this.channels.get(streamMessage.channel);
    if (!channel) return;

    // Update channel stats
    channel.messageCount++;
    channel.lastMessage = new Date();

    // Check channel rate limit
    if (channel.messageCount > channel.rateLimit) {
      return; // Skip message due to rate limit
    }

    // Buffer message for replay
    this.bufferMessage(streamMessage);

    // Broadcast to WebSocket subscribers
    channel.subscribers.forEach((connectionId) => {
      this.sendMessage(connectionId, {
        type: streamMessage.type,
        channel: streamMessage.channel,
        data: streamMessage.data,
        timestamp: streamMessage.timestamp,
      });
    });

    // Publish to Redis stream if enabled
    if (this.redis) {
      this.publishToRedis(streamMessage);
    }

    this.emit('message-broadcast', {
      channel: streamMessage.channel,
      subscriberCount: channel.subscribers.size,
      messageId: streamMessage.id,
    });
  }

  /**
   * Buffer message for replay functionality
   */
  private bufferMessage(message: StreamMessage): void {
    const buffer = this.messageBuffer.get(message.channel);
    if (!buffer) return;

    buffer.push(message);

    // Keep buffer size under limit
    if (buffer.length > this.config.bufferSize) {
      buffer.shift();
    }

    // Remove old messages based on retention policy
    const channel = this.channels.get(message.channel);
    if (channel) {
      const cutoffTime = new Date(Date.now() - channel.retention * 60 * 60 * 1000);
      const filteredBuffer = buffer.filter(msg => msg.timestamp > cutoffTime);
      this.messageBuffer.set(message.channel, filteredBuffer);
    }
  }

  /**
   * Publish message to Redis stream
   */
  private publishToRedis(message: StreamMessage): void {
    if (!this.redis) return;

    const streamName = `fineprint:stream:${message.channel}`;
    const fields = {
      id: message.id,
      type: message.type,
      timestamp: message.timestamp.toISOString(),
      priority: message.priority,
      data: JSON.stringify(message.data),
    };

    this.redis.xadd(streamName, '*', ...Object.entries(fields).flat()).catch((error) => {
      this.logger?.error('Failed to publish to Redis stream', {
        service: 'streaming-service' as ServiceType,
        environment: this.config.environment,
        stream: streamName,
      }, error);
    });
  }

  /**
   * Check rate limit for connection
   */
  private checkRateLimit(connection: ClientConnection): boolean {
    const now = new Date();
    
    if (now > connection.rateLimitResetTime) {
      connection.rateLimitCount = 0;
      connection.rateLimitResetTime = new Date(now.getTime() + 60000); // Reset in 1 minute
    }

    if (connection.rateLimitCount >= this.config.rateLimitPerMinute) {
      return false;
    }

    connection.rateLimitCount++;
    return true;
  }

  /**
   * Get log channel based on log entry
   */
  private getLogChannel(logEntry: LogEntry): string {
    if (logEntry.level === 'error' || logEntry.level === 'fatal') {
      return 'logs.errors';
    }
    
    if (logEntry.category === 'business') {
      return 'logs.business';
    }
    
    if (logEntry.category === 'security') {
      return 'logs.security';
    }
    
    return `logs.${logEntry.context.service}`;
  }

  /**
   * Get log priority based on log entry
   */
  private getLogPriority(logEntry: LogEntry): 'low' | 'normal' | 'high' | 'urgent' {
    if (logEntry.level === 'fatal') return 'urgent';
    if (logEntry.level === 'error') return 'high';
    if (logEntry.level === 'warn') return 'normal';
    return 'low';
  }

  /**
   * Get alert priority based on severity
   */
  private getAlertPriority(severity: string): 'low' | 'normal' | 'high' | 'urgent' {
    switch (severity) {
      case 'critical': return 'urgent';
      case 'error': return 'high';
      case 'warning': return 'normal';
      default: return 'low';
    }
  }

  /**
   * Setup default channels
   */
  private setupChannels(): void {
    const defaultChannels = [
      { name: 'logs.all', retention: 24, rateLimit: 1000 },
      { name: 'logs.errors', retention: 168, rateLimit: 500 }, // 7 days
      { name: 'logs.business', retention: 72, rateLimit: 100 }, // 3 days
      { name: 'logs.security', retention: 720, rateLimit: 200 }, // 30 days
      { name: 'metrics', retention: 24, rateLimit: 2000 },
      { name: 'traces', retention: 12, rateLimit: 500 },
      { name: 'alerts.info', retention: 24, rateLimit: 100 },
      { name: 'alerts.warning', retention: 72, rateLimit: 200 },
      { name: 'alerts.error', retention: 168, rateLimit: 300 },
      { name: 'alerts.critical', retention: 720, rateLimit: 500 },
    ];

    defaultChannels.forEach(({ name, retention, rateLimit }) => {
      this.createChannel(name, { retention, rateLimit });
    });
  }

  /**
   * Setup heartbeat interval
   */
  private setupHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const heartbeatMessage: WebSocketMessage = {
        type: 'heartbeat',
        timestamp: now,
      };

      this.connections.forEach((connection, connectionId) => {
        if (connection.ws.readyState === WebSocket.OPEN) {
          this.sendMessage(connectionId, heartbeatMessage);
        }
      });
    }, this.config.heartbeatInterval * 1000);
  }

  /**
   * Setup rate limit reset interval
   */
  private setupRateLimitReset(): void {
    this.rateLimitResetInterval = setInterval(() => {
      this.channels.forEach((channel) => {
        channel.messageCount = 0;
      });
    }, 60000); // Reset every minute
  }

  /**
   * Shutdown streaming service
   */
  async shutdown(): Promise<void> {
    this.logger?.info('Streaming service shutting down', {
      service: 'streaming-service' as ServiceType,
      environment: this.config.environment,
    });

    // Clear intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.rateLimitResetInterval) {
      clearInterval(this.rateLimitResetInterval);
    }

    // Close all WebSocket connections
    this.connections.forEach((connection) => {
      connection.ws.close(1001, 'Service shutting down');
    });

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
    }

    // Close HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
    }

    // Close Redis connections
    if (this.redis) {
      await this.redis.quit();
    }
    if (this.redisSubscriber) {
      await this.redisSubscriber.quit();
    }

    this.emit('shutdown');
  }
}