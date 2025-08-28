/**
 * Cross-Service Synchronization for AI Memory and Learning
 * Ensures consistent memory and learning data across all AI services
 */

import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { WebSocket } from 'ws';
import { createServiceLogger } from '../logger';
import { MemoryPersistenceEngine, MemoryEntry } from './memory-persistence-engine';
import { LearningHistoryService, LearningEvent } from './learning-history-service';

const logger = createServiceLogger('cross-service-sync');

export interface SyncEvent {
  id: string;
  type: 'memory' | 'learning' | 'model' | 'configuration';
  action: 'create' | 'update' | 'delete' | 'sync';
  source: string;
  target?: string;
  data: any;
  timestamp: Date;
  correlationId?: string;
}

export interface ServiceConnection {
  serviceId: string;
  serviceName: string;
  domain: string;
  endpoint: string;
  status: 'connected' | 'disconnected' | 'error';
  lastSeen: Date;
  websocket?: WebSocket;
}

export interface SyncConfiguration {
  enabled: boolean;
  syncInterval: number; // milliseconds
  retryAttempts: number;
  retryDelay: number;
  services: {
    [key: string]: {
      endpoint: string;
      domains: string[];
      syncTypes: ('memory' | 'learning' | 'model' | 'configuration')[];
    };
  };
}

export class CrossServiceSync extends EventEmitter {
  private redis: Redis;
  private redisPub: Redis;
  private redisSub: Redis;
  private memoryEngine: MemoryPersistenceEngine;
  private learningHistory: LearningHistoryService;
  private connections: Map<string, ServiceConnection> = new Map();
  private syncQueue: Map<string, SyncEvent[]> = new Map();
  private syncConfiguration: SyncConfiguration;
  private syncInterval?: NodeJS.Timeout;
  private initialized: boolean = false;

  constructor(
    memoryEngine?: MemoryPersistenceEngine,
    learningHistory?: LearningHistoryService
  ) {
    super();
    
    // Services will be injected during initialization
    this.memoryEngine = memoryEngine!;
    this.learningHistory = learningHistory!;

    // Initialize Redis connections
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: 5, // Dedicated DB for sync
    });

    this.redisPub = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    });

    this.redisSub = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    });

    // Default configuration
    this.syncConfiguration = {
      enabled: true,
      syncInterval: 5000, // 5 seconds
      retryAttempts: 3,
      retryDelay: 1000,
      services: {
        dspy: {
          endpoint: 'ws://localhost:8006/ws',
          domains: ['legal_analysis', 'marketing_content', 'sales_communication', 'customer_support'],
          syncTypes: ['memory', 'learning', 'configuration'],
        },
        lora: {
          endpoint: 'ws://localhost:8007/ws',
          domains: ['legal_analysis', 'marketing_content', 'sales_communication', 'customer_support'],
          syncTypes: ['learning', 'model'],
        },
        knowledge_graph: {
          endpoint: 'ws://localhost:8008/ws',
          domains: ['legal_analysis', 'marketing_content', 'sales_communication', 'customer_support'],
          syncTypes: ['memory', 'configuration'],
        },
      },
    };
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Cross-Service Sync...');

      // Test Redis connections
      await this.redis.ping();
      await this.redisPub.ping();
      await this.redisSub.ping();

      // Subscribe to Redis channels
      await this.setupRedisSubscriptions();

      // Connect to configured services
      await this.connectToServices();

      // Start sync process
      if (this.syncConfiguration.enabled) {
        this.startSyncProcess();
      }

      // Set up event listeners
      this.setupEventListeners();

      this.initialized = true;
      logger.info('Cross-Service Sync initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Cross-Service Sync', { error });
      throw error;
    }
  }

  /**
   * Sync memory across services
   */
  async syncMemory(memory: MemoryEntry, targetServices?: string[]): Promise<void> {
    const syncEvent: SyncEvent = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'memory',
      action: 'create',
      source: 'memory-persistence',
      data: memory,
      timestamp: new Date(),
      correlationId: memory.metadata.correlationId,
    };

    try {
      // Determine target services
      const targets = targetServices || this.getServicesForDomain(memory.domain, 'memory');

      for (const target of targets) {
        syncEvent.target = target;
        await this.queueSyncEvent(target, syncEvent);
      }

      // Publish to Redis for real-time sync
      await this.publishSyncEvent(syncEvent);

      logger.debug('Memory sync initiated', {
        memoryId: memory.id,
        domain: memory.domain,
        targets: targets.length,
      });
    } catch (error) {
      logger.error('Failed to sync memory', { error, memoryId: memory.id });
      throw error;
    }
  }

  /**
   * Sync learning event across services
   */
  async syncLearningEvent(event: LearningEvent, targetServices?: string[]): Promise<void> {
    const syncEvent: SyncEvent = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'learning',
      action: 'create',
      source: 'memory-persistence',
      data: event,
      timestamp: new Date(),
      correlationId: event.metadata.sessionId,
    };

    try {
      const targets = targetServices || this.getServicesForDomain(event.domain, 'learning');

      for (const target of targets) {
        syncEvent.target = target;
        await this.queueSyncEvent(target, syncEvent);
      }

      await this.publishSyncEvent(syncEvent);

      logger.debug('Learning event sync initiated', {
        eventId: event.id,
        domain: event.domain,
        targets: targets.length,
      });
    } catch (error) {
      logger.error('Failed to sync learning event', { error, eventId: event.id });
      throw error;
    }
  }

  /**
   * Broadcast configuration update
   */
  async syncConfiguration(
    configType: string,
    configuration: any,
    targetServices?: string[]
  ): Promise<void> {
    const syncEvent: SyncEvent = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'configuration',
      action: 'update',
      source: 'memory-persistence',
      data: {
        configType,
        configuration,
      },
      timestamp: new Date(),
    };

    try {
      const targets = targetServices || Array.from(this.connections.keys());

      for (const target of targets) {
        syncEvent.target = target;
        await this.queueSyncEvent(target, syncEvent);
      }

      await this.publishSyncEvent(syncEvent);

      logger.info('Configuration sync initiated', {
        configType,
        targets: targets.length,
      });
    } catch (error) {
      logger.error('Failed to sync configuration', { error, configType });
      throw error;
    }
  }

  /**
   * Request full sync from a service
   */
  async requestFullSync(
    serviceId: string,
    syncType: 'memory' | 'learning',
    domain?: string
  ): Promise<void> {
    const connection = this.connections.get(serviceId);
    if (!connection || connection.status !== 'connected') {
      throw new Error(`Service ${serviceId} not connected`);
    }

    const syncRequest: SyncEvent = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: syncType,
      action: 'sync',
      source: 'memory-persistence',
      target: serviceId,
      data: {
        domain,
        full: true,
        since: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      },
      timestamp: new Date(),
    };

    await this.sendToService(serviceId, syncRequest);

    logger.info('Full sync requested', {
      serviceId,
      syncType,
      domain,
    });
  }

  /**
   * Get sync status
   */
  getSyncStatus(): {
    services: Array<{
      serviceId: string;
      status: string;
      lastSeen: Date;
      queueSize: number;
    }>;
    totalQueued: number;
    syncEnabled: boolean;
  } {
    const services = Array.from(this.connections.entries()).map(([id, conn]) => ({
      serviceId: id,
      status: conn.status,
      lastSeen: conn.lastSeen,
      queueSize: this.syncQueue.get(id)?.length || 0,
    }));

    const totalQueued = Array.from(this.syncQueue.values())
      .reduce((sum, queue) => sum + queue.length, 0);

    return {
      services,
      totalQueued,
      syncEnabled: this.syncConfiguration.enabled,
    };
  }

  /**
   * Handle incoming sync event from another service
   */
  async handleIncomingSyncEvent(event: SyncEvent): Promise<void> {
    try {
      logger.debug('Handling incoming sync event', {
        type: event.type,
        action: event.action,
        source: event.source,
      });

      switch (event.type) {
        case 'memory':
          await this.handleMemorySync(event);
          break;
        case 'learning':
          await this.handleLearningSync(event);
          break;
        case 'model':
          await this.handleModelSync(event);
          break;
        case 'configuration':
          await this.handleConfigurationSync(event);
          break;
        default:
          logger.warn('Unknown sync event type', { type: event.type });
      }

      // Acknowledge successful sync
      await this.acknowledgeSyncEvent(event);

    } catch (error) {
      logger.error('Failed to handle sync event', { error, event });
      await this.reportSyncError(event, error as Error);
    }
  }

  // Private helper methods

  private async setupRedisSubscriptions(): Promise<void> {
    // Subscribe to sync channels
    await this.redisSub.subscribe('sync:broadcast', 'sync:direct:memory-persistence');

    this.redisSub.on('message', async (channel, message) => {
      try {
        const event = JSON.parse(message) as SyncEvent;
        
        // Don't process our own events
        if (event.source === 'memory-persistence') {
          return;
        }

        await this.handleIncomingSyncEvent(event);
      } catch (error) {
        logger.error('Failed to process Redis message', { error, channel });
      }
    });
  }

  private async connectToServices(): Promise<void> {
    for (const [serviceId, config] of Object.entries(this.syncConfiguration.services)) {
      try {
        await this.connectToService(serviceId, config);
      } catch (error) {
        logger.error('Failed to connect to service', { serviceId, error });
      }
    }
  }

  private async connectToService(
    serviceId: string,
    config: SyncConfiguration['services'][string]
  ): Promise<void> {
    const connection: ServiceConnection = {
      serviceId,
      serviceName: serviceId,
      domain: config.domains.join(','),
      endpoint: config.endpoint,
      status: 'disconnected',
      lastSeen: new Date(),
    };

    this.connections.set(serviceId, connection);

    try {
      const ws = new WebSocket(config.endpoint);

      ws.on('open', () => {
        connection.status = 'connected';
        connection.lastSeen = new Date();
        connection.websocket = ws;

        logger.info('Connected to service', { serviceId });
        this.emit('service:connected', { serviceId });

        // Send identification
        ws.send(JSON.stringify({
          type: 'identify',
          serviceId: 'memory-persistence',
          capabilities: ['memory', 'learning', 'analytics'],
        }));
      });

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'sync') {
            await this.handleIncomingSyncEvent(message);
          }
        } catch (error) {
          logger.error('Failed to process WebSocket message', { error, serviceId });
        }
      });

      ws.on('close', () => {
        connection.status = 'disconnected';
        logger.warn('Service disconnected', { serviceId });
        this.emit('service:disconnected', { serviceId });

        // Attempt reconnection
        setTimeout(() => {
          this.connectToService(serviceId, config);
        }, this.syncConfiguration.retryDelay);
      });

      ws.on('error', (error) => {
        connection.status = 'error';
        logger.error('WebSocket error', { serviceId, error });
      });

    } catch (error) {
      logger.error('Failed to establish WebSocket connection', { serviceId, error });
      
      // Retry connection
      setTimeout(() => {
        this.connectToService(serviceId, config);
      }, this.syncConfiguration.retryDelay);
    }
  }

  private getServicesForDomain(
    domain: string,
    syncType: 'memory' | 'learning' | 'model' | 'configuration'
  ): string[] {
    const services: string[] = [];

    for (const [serviceId, config] of Object.entries(this.syncConfiguration.services)) {
      if (config.domains.includes(domain) && config.syncTypes.includes(syncType)) {
        services.push(serviceId);
      }
    }

    return services;
  }

  private async queueSyncEvent(serviceId: string, event: SyncEvent): Promise<void> {
    if (!this.syncQueue.has(serviceId)) {
      this.syncQueue.set(serviceId, []);
    }

    this.syncQueue.get(serviceId)!.push(event);

    // Store in Redis for persistence
    const queueKey = `sync:queue:${serviceId}`;
    await this.redis.lpush(queueKey, JSON.stringify(event));
    await this.redis.expire(queueKey, 3600); // 1 hour expiry
  }

  private async publishSyncEvent(event: SyncEvent): Promise<void> {
    // Broadcast to all services
    await this.redisPub.publish('sync:broadcast', JSON.stringify(event));

    // Direct publish to specific service if target is set
    if (event.target) {
      await this.redisPub.publish(`sync:direct:${event.target}`, JSON.stringify(event));
    }
  }

  private async sendToService(serviceId: string, event: SyncEvent): Promise<void> {
    const connection = this.connections.get(serviceId);
    
    if (!connection || connection.status !== 'connected' || !connection.websocket) {
      await this.queueSyncEvent(serviceId, event);
      return;
    }

    try {
      connection.websocket.send(JSON.stringify(event));
      connection.lastSeen = new Date();
    } catch (error) {
      logger.error('Failed to send to service', { serviceId, error });
      connection.status = 'error';
      await this.queueSyncEvent(serviceId, event);
    }
  }

  private startSyncProcess(): void {
    this.syncInterval = setInterval(async () => {
      await this.processSyncQueues();
    }, this.syncConfiguration.syncInterval);

    logger.info('Sync process started', {
      interval: this.syncConfiguration.syncInterval,
    });
  }

  private async processSyncQueues(): Promise<void> {
    for (const [serviceId, queue] of this.syncQueue.entries()) {
      if (queue.length === 0) continue;

      const connection = this.connections.get(serviceId);
      if (!connection || connection.status !== 'connected') {
        continue;
      }

      // Process up to 10 events at a time
      const batch = queue.splice(0, 10);
      
      for (const event of batch) {
        try {
          await this.sendToService(serviceId, event);
          
          // Remove from Redis queue
          const queueKey = `sync:queue:${serviceId}`;
          await this.redis.lrem(queueKey, 1, JSON.stringify(event));
        } catch (error) {
          logger.error('Failed to process sync event', { serviceId, error });
          // Re-queue the event
          queue.unshift(event);
          break;
        }
      }
    }
  }

  private async handleMemorySync(event: SyncEvent): Promise<void> {
    const memory = event.data as MemoryEntry;

    switch (event.action) {
      case 'create':
      case 'update':
        await this.memoryEngine.storeMemory(memory);
        break;
      case 'delete':
        // Memory deletion not implemented yet
        logger.warn('Memory deletion not implemented');
        break;
      case 'sync':
        // Handle full sync request
        await this.performMemorySync(event.source, event.data);
        break;
    }
  }

  private async handleLearningSync(event: SyncEvent): Promise<void> {
    const learningEvent = event.data as LearningEvent;

    switch (event.action) {
      case 'create':
        await this.learningHistory.recordLearningEvent(learningEvent);
        break;
      case 'sync':
        // Handle full sync request
        await this.performLearningSync(event.source, event.data);
        break;
    }
  }

  private async handleModelSync(event: SyncEvent): Promise<void> {
    // Forward model sync events to appropriate handlers
    this.emit('sync:model', event);
  }

  private async handleConfigurationSync(event: SyncEvent): Promise<void> {
    // Forward configuration sync events
    this.emit('sync:configuration', event);
  }

  private async performMemorySync(
    targetService: string,
    criteria: any
  ): Promise<void> {
    const memories = await this.memoryEngine.queryMemories({
      domain: criteria.domain,
      startDate: criteria.since,
      limit: 1000,
    });

    // Send memories in batches
    const batchSize = 50;
    for (let i = 0; i < memories.length; i += batchSize) {
      const batch = memories.slice(i, i + batchSize);
      
      const syncEvent: SyncEvent = {
        id: `sync_${Date.now()}_${i}`,
        type: 'memory',
        action: 'create',
        source: 'memory-persistence',
        target: targetService,
        data: batch,
        timestamp: new Date(),
      };

      await this.sendToService(targetService, syncEvent);
    }

    logger.info('Memory sync completed', {
      targetService,
      totalMemories: memories.length,
    });
  }

  private async performLearningSync(
    targetService: string,
    criteria: any
  ): Promise<void> {
    const events = await this.learningHistory.getLearningHistory({
      domain: criteria.domain,
      startDate: criteria.since,
      limit: 1000,
    });

    // Send events in batches
    const batchSize = 50;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      
      const syncEvent: SyncEvent = {
        id: `sync_${Date.now()}_${i}`,
        type: 'learning',
        action: 'create',
        source: 'memory-persistence',
        target: targetService,
        data: batch,
        timestamp: new Date(),
      };

      await this.sendToService(targetService, syncEvent);
    }

    logger.info('Learning sync completed', {
      targetService,
      totalEvents: events.length,
    });
  }

  private async acknowledgeSyncEvent(event: SyncEvent): Promise<void> {
    if (event.source) {
      const ackEvent: SyncEvent = {
        id: `ack_${event.id}`,
        type: event.type,
        action: 'sync',
        source: 'memory-persistence',
        target: event.source,
        data: {
          originalEventId: event.id,
          status: 'success',
          timestamp: new Date(),
        },
        timestamp: new Date(),
        correlationId: event.correlationId,
      };

      await this.publishSyncEvent(ackEvent);
    }
  }

  private async reportSyncError(event: SyncEvent, error: Error): Promise<void> {
    if (event.source) {
      const errorEvent: SyncEvent = {
        id: `error_${event.id}`,
        type: event.type,
        action: 'sync',
        source: 'memory-persistence',
        target: event.source,
        data: {
          originalEventId: event.id,
          status: 'error',
          error: error.message,
          timestamp: new Date(),
        },
        timestamp: new Date(),
        correlationId: event.correlationId,
      };

      await this.publishSyncEvent(errorEvent);
    }

    // Log error for monitoring
    logger.error('Sync error reported', {
      eventId: event.id,
      source: event.source,
      error: error.message,
    });
  }

  private setupEventListeners(): void {
    // Listen for memory storage events
    if (this.memoryEngine) {
      this.memoryEngine.on('memory:stored', async (data) => {
        // Get the full memory entry
        const memory = await this.memoryEngine.getMemory(data.id);
        if (memory) {
          await this.syncMemory(memory);
        }
      });
    }

    // Listen for learning events
    if (this.learningHistory) {
      this.learningHistory.on('learning:event_recorded', async (data) => {
        // Get the full learning event
        const events = await this.learningHistory.getLearningHistory({
          limit: 1,
        });
        if (events.length > 0) {
          await this.syncLearningEvent(events[0]);
        }
      });
    }
  }

  /**
   * Update sync configuration
   */
  updateConfiguration(config: Partial<SyncConfiguration>): void {
    this.syncConfiguration = { ...this.syncConfiguration, ...config };

    // Restart sync process if interval changed
    if (config.syncInterval && this.syncInterval) {
      clearInterval(this.syncInterval);
      this.startSyncProcess();
    }

    logger.info('Sync configuration updated', config);
  }

  /**
   * Get service health status
   */
  isHealthy(): boolean {
    if (!this.initialized) return false;

    // Check if at least one service is connected
    const connectedServices = Array.from(this.connections.values())
      .filter(conn => conn.status === 'connected').length;

    return connectedServices > 0;
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    // Stop sync process
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Close WebSocket connections
    for (const connection of this.connections.values()) {
      if (connection.websocket) {
        connection.websocket.close();
      }
    }

    // Unsubscribe from Redis
    await this.redisSub.unsubscribe();

    // Save pending sync events
    for (const [serviceId, queue] of this.syncQueue.entries()) {
      if (queue.length > 0) {
        const queueKey = `sync:queue:${serviceId}:pending`;
        for (const event of queue) {
          await this.redis.lpush(queueKey, JSON.stringify(event));
        }
        await this.redis.expire(queueKey, 86400); // 24 hours
      }
    }

    // Close Redis connections
    this.redis.disconnect();
    this.redisPub.disconnect();
    this.redisSub.disconnect();

    logger.info('Cross-Service Sync shutdown complete');
  }
}