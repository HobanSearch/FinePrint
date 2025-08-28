import { createServiceLogger } from '@fineprintai/shared-logger';
import { MongoClient, Db, Collection, ChangeStream, ChangeStreamDocument } from 'mongodb';
import { EventEmitter } from 'events';
import { config } from '@fineprintai/shared-config';

const logger = createServiceLogger('mongo-change-stream-service');

interface ChangeStreamConfig {
  collection: string;
  database?: string;
  pipeline?: any[];
  options?: {
    fullDocument?: 'default' | 'updateLookup';
    resumeAfter?: any;
    startAfter?: any;
    startAtOperationTime?: any;
    maxAwaitTimeMS?: number;
    batchSize?: number;
  };
  handler: (change: ChangeStreamDocument) => Promise<void>;
}

interface ChangeStreamInfo {
  id: string;
  collection: string;
  database: string;
  isActive: boolean;
  createdAt: Date;
  lastEventAt?: Date;
  eventCount: number;
  errorCount: number;
  lastError?: string;
}

interface DocumentChangeEvent {
  operation: 'insert' | 'update' | 'delete' | 'replace';
  collection: string;
  documentId: any;
  fullDocument?: any;
  updateDescription?: {
    updatedFields: any;
    removedFields: string[];
  };
  clusterTime: any;
  timestamp: Date;
}

class MongoChangeStreamService extends EventEmitter {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private changeStreams = new Map<string, ChangeStream>();
  private streamConfigs = new Map<string, ChangeStreamConfig>();
  private streamInfo = new Map<string, ChangeStreamInfo>();
  private initialized = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing MongoDB change stream service...');
    
    try {
      // Connect to MongoDB
      await this.connect();
      
      // Setup heartbeat to monitor connection
      this.startHeartbeat();
      
      this.initialized = true;
      logger.info('MongoDB change stream service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize MongoDB change stream service', { error });
      throw error;
    }
  }

  private async connect(): Promise<void> {
    try {
      // Extract MongoDB URI from database URL (assuming it's MongoDB)
      const mongoUri = process.env.MONGODB_URL || config.database.url;
      
      this.client = new MongoClient(mongoUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        family: 4,
      });

      await this.client.connect();
      
      // Get database name from URI or use default
      const dbName = this.extractDatabaseName(mongoUri) || 'fineprintai';
      this.db = this.client.db(dbName);

      logger.info('Connected to MongoDB', { database: dbName });

      // Setup connection event listeners
      this.client.on('close', () => {
        logger.warn('MongoDB connection closed');
        this.handleConnectionLoss();
      });

      this.client.on('error', (error) => {
        logger.error('MongoDB connection error', { error });
        this.handleConnectionError(error);
      });

      this.client.on('reconnect', () => {
        logger.info('MongoDB reconnected');
        this.handleReconnection();
      });

    } catch (error) {
      logger.error('Failed to connect to MongoDB', { error });
      throw error;
    }
  }

  private extractDatabaseName(uri: string): string | null {
    try {
      const url = new URL(uri);
      return url.pathname.substring(1) || null;
    } catch {
      return null;
    }
  }

  async createChangeStream(
    streamId: string,
    config: ChangeStreamConfig
  ): Promise<ChangeStream> {
    if (!this.initialized || !this.db) {
      throw new Error('MongoDB change stream service not initialized');
    }

    if (this.changeStreams.has(streamId)) {
      throw new Error(`Change stream already exists: ${streamId}`);
    }

    const collection = this.db.collection(config.collection);
    const pipeline = config.pipeline || [];
    const options = config.options || { fullDocument: 'updateLookup' };

    logger.info('Creating change stream', {
      streamId,
      collection: config.collection,
      database: config.database || this.db.databaseName,
    });

    try {
      const changeStream = collection.watch(pipeline, options);

      // Setup change stream event handlers
      this.setupChangeStreamHandlers(streamId, changeStream, config);

      // Store stream and config
      this.changeStreams.set(streamId, changeStream);
      this.streamConfigs.set(streamId, config);
      this.streamInfo.set(streamId, {
        id: streamId,
        collection: config.collection,
        database: config.database || this.db.databaseName,
        isActive: true,
        createdAt: new Date(),
        eventCount: 0,
        errorCount: 0,
      });

      logger.info('Change stream created successfully', { streamId });
      this.emit('streamCreated', { streamId, config });

      return changeStream;

    } catch (error) {
      logger.error('Failed to create change stream', { streamId, error });
      throw error;
    }
  }

  private setupChangeStreamHandlers(
    streamId: string,
    changeStream: ChangeStream,
    config: ChangeStreamConfig
  ): void {
    changeStream.on('change', async (change: ChangeStreamDocument) => {
      const info = this.streamInfo.get(streamId)!;
      info.lastEventAt = new Date();
      info.eventCount++;

      logger.debug('Change stream event received', {
        streamId,
        operationType: change.operationType,
        collection: config.collection,
      });

      try {
        // Convert MongoDB change to our internal format
        const documentChange = this.convertChangeEvent(change, config.collection);
        
        // Call the configured handler
        await config.handler(change);

        // Emit our internal event
        this.emit('documentChange', {
          streamId,
          change: documentChange,
        });

      } catch (error) {
        info.errorCount++;
        info.lastError = error instanceof Error ? error.message : 'Unknown error';
        
        logger.error('Error processing change stream event', {
          streamId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        this.emit('streamError', {
          streamId,
          error,
          change,
        });
      }

      this.streamInfo.set(streamId, info);
    });

    changeStream.on('error', (error) => {
      const info = this.streamInfo.get(streamId);
      if (info) {
        info.errorCount++;
        info.lastError = error.message;
        this.streamInfo.set(streamId, info);
      }

      logger.error('Change stream error', {
        streamId,
        error: error.message,
      });

      this.emit('streamError', {
        streamId,
        error,
      });

      // Attempt to restart the stream
      this.restartChangeStream(streamId);
    });

    changeStream.on('close', () => {
      logger.info('Change stream closed', { streamId });
      
      const info = this.streamInfo.get(streamId);
      if (info) {
        info.isActive = false;
        this.streamInfo.set(streamId, info);
      }

      this.emit('streamClosed', { streamId });
    });

    changeStream.on('end', () => {
      logger.info('Change stream ended', { streamId });
      
      const info = this.streamInfo.get(streamId);
      if (info) {
        info.isActive = false;
        this.streamInfo.set(streamId, info);
      }

      this.emit('streamEnded', { streamId });
    });
  }

  private convertChangeEvent(
    change: ChangeStreamDocument,
    collection: string
  ): DocumentChangeEvent {
    return {
      operation: change.operationType as DocumentChangeEvent['operation'],
      collection,
      documentId: change.documentKey?._id,
      fullDocument: change.fullDocument,
      updateDescription: change.updateDescription,
      clusterTime: change.clusterTime,
      timestamp: new Date(),
    };
  }

  private async restartChangeStream(streamId: string): Promise<void> {
    logger.info('Attempting to restart change stream', { streamId });

    try {
      // Close existing stream
      await this.closeChangeStream(streamId);

      // Wait a bit before restarting
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Get original config
      const config = this.streamConfigs.get(streamId);
      if (!config) {
        logger.error('Cannot restart change stream - config not found', { streamId });
        return;
      }

      // Recreate the stream
      await this.createChangeStream(streamId, config);
      
      logger.info('Change stream restarted successfully', { streamId });

    } catch (error) {
      logger.error('Failed to restart change stream', {
        streamId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Schedule another restart attempt
      setTimeout(() => {
        this.restartChangeStream(streamId);
      }, 30000); // Retry in 30 seconds
    }
  }

  async closeChangeStream(streamId: string): Promise<boolean> {
    const changeStream = this.changeStreams.get(streamId);
    if (!changeStream) {
      return false;
    }

    try {
      await changeStream.close();
      
      this.changeStreams.delete(streamId);
      this.streamConfigs.delete(streamId);
      
      const info = this.streamInfo.get(streamId);
      if (info) {
        info.isActive = false;
        this.streamInfo.set(streamId, info);
      }

      logger.info('Change stream closed', { streamId });
      this.emit('streamClosed', { streamId });

      return true;

    } catch (error) {
      logger.error('Error closing change stream', {
        streamId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  async pauseChangeStream(streamId: string): Promise<boolean> {
    const changeStream = this.changeStreams.get(streamId);
    if (!changeStream) {
      return false;
    }

    try {
      // MongoDB change streams don't have a pause method, so we close it
      await changeStream.close();
      
      const info = this.streamInfo.get(streamId);
      if (info) {
        info.isActive = false;
        this.streamInfo.set(streamId, info);
      }

      logger.info('Change stream paused', { streamId });
      return true;

    } catch (error) {
      logger.error('Error pausing change stream', {
        streamId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  async resumeChangeStream(streamId: string): Promise<boolean> {
    const config = this.streamConfigs.get(streamId);
    if (!config) {
      logger.error('Cannot resume change stream - config not found', { streamId });
      return false;
    }

    try {
      // Close existing stream if it exists
      await this.closeChangeStream(streamId);

      // Recreate the stream
      await this.createChangeStream(streamId, config);
      
      logger.info('Change stream resumed', { streamId });
      return true;

    } catch (error) {
      logger.error('Error resuming change stream', {
        streamId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  getChangeStreamInfo(streamId: string): ChangeStreamInfo | undefined {
    return this.streamInfo.get(streamId);
  }

  getAllChangeStreamInfo(): ChangeStreamInfo[] {
    return Array.from(this.streamInfo.values());
  }

  getActiveChangeStreams(): string[] {
    return Array.from(this.streamInfo.entries())
      .filter(([_, info]) => info.isActive)
      .map(([streamId, _]) => streamId);
  }

  // Predefined change stream configurations
  async createDocumentMonitoringStream(): Promise<ChangeStream> {
    const streamId = 'document-monitoring';
    
    return this.createChangeStream(streamId, {
      collection: 'documents',
      pipeline: [
        {
          $match: {
            $or: [
              { operationType: 'insert' },
              { operationType: 'update' },
              { operationType: 'delete' }
            ]
          }
        }
      ],
      options: {
        fullDocument: 'updateLookup',
      },
      handler: async (change) => {
        logger.info('Document change detected', {
          operation: change.operationType,
          documentId: change.documentKey?._id,
        });

        // Emit event for further processing
        this.emit('documentMonitoringChange', {
          operation: change.operationType,
          documentId: change.documentKey?._id,
          document: change.fullDocument,
          updateDescription: change.updateDescription,
        });
      },
    });
  }

  async createUserActivityStream(): Promise<ChangeStream> {
    const streamId = 'user-activity';
    
    return this.createChangeStream(streamId, {
      collection: 'user_activities',
      pipeline: [
        {
          $match: {
            operationType: 'insert'
          }
        }
      ],
      handler: async (change) => {
        logger.debug('User activity logged', {
          userId: change.fullDocument?.userId,
          activity: change.fullDocument?.activity,
        });

        this.emit('userActivity', {
          userId: change.fullDocument?.userId,
          activity: change.fullDocument?.activity,
          timestamp: change.fullDocument?.timestamp,
        });
      },
    });
  }

  async createAuditLogStream(): Promise<ChangeStream> {
    const streamId = 'audit-log';
    
    return this.createChangeStream(streamId, {
      collection: 'audit_logs',
      pipeline: [
        {
          $match: {
            operationType: 'insert'
          }
        }
      ],
      handler: async (change) => {
        const auditLog = change.fullDocument;
        
        // Check for high-severity audit events
        if (auditLog?.severity === 'high' || auditLog?.severity === 'critical') {
          logger.warn('High-severity audit event', {
            event: auditLog.event,
            userId: auditLog.userId,
            severity: auditLog.severity,
          });

          this.emit('highSeverityAuditEvent', auditLog);
        }

        this.emit('auditLogCreated', auditLog);
      },
    });
  }

  // Connection management
  private handleConnectionLoss(): void {
    logger.warn('MongoDB connection lost, attempting to reconnect...');
    
    // Mark all streams as inactive
    for (const [streamId, info] of this.streamInfo.entries()) {
      info.isActive = false;
      this.streamInfo.set(streamId, info);
    }

    this.scheduleReconnection();
  }

  private handleConnectionError(error: Error): void {
    logger.error('MongoDB connection error', { error: error.message });
    this.emit('connectionError', error);
  }

  private handleReconnection(): void {
    logger.info('MongoDB reconnected, restarting change streams...');
    
    // Restart all change streams
    const streamIds = Array.from(this.streamConfigs.keys());
    streamIds.forEach(streamId => {
      this.restartChangeStream(streamId);
    });

    this.emit('reconnected');
  }

  private scheduleReconnection(): void {
    if (this.reconnectTimeout) {
      return; // Already scheduled
    }

    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.connect();
        this.reconnectTimeout = null;
        this.handleReconnection();
      } catch (error) {
        logger.error('Reconnection failed', { error });
        this.reconnectTimeout = null;
        this.scheduleReconnection(); // Try again
      }
    }, 10000); // Retry in 10 seconds
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        if (this.db) {
          await this.db.admin().ping();
        }
      } catch (error) {
        logger.error('MongoDB heartbeat failed', { error });
        this.handleConnectionLoss();
      }
    }, 30000); // Check every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // Statistics and monitoring
  getConnectionStats(): {
    connected: boolean;
    database: string | null;
    activeStreams: number;
    totalEvents: number;
    totalErrors: number;
  } {
    const allInfo = Array.from(this.streamInfo.values());
    
    return {
      connected: !!this.client && !!this.db,
      database: this.db?.databaseName || null,
      activeStreams: allInfo.filter(info => info.isActive).length,
      totalEvents: allInfo.reduce((sum, info) => sum + info.eventCount, 0),
      totalErrors: allInfo.reduce((sum, info) => sum + info.errorCount, 0),
    };
  }

  async healthCheck(): Promise<void> {
    if (!this.initialized) {
      throw new Error('MongoDB change stream service not initialized');
    }

    if (!this.client || !this.db) {
      throw new Error('MongoDB not connected');
    }

    // Test connection
    await this.db.admin().ping();

    // Check active streams
    const activeStreams = this.getActiveChangeStreams();
    if (activeStreams.length === 0) {
      logger.warn('No active change streams');
    }

    logger.info('MongoDB change stream service health check passed', {
      activeStreams: activeStreams.length,
      totalStreams: this.streamInfo.size,
    });
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down MongoDB change stream service...');
    
    this.stopHeartbeat();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Close all change streams
    const closePromises = Array.from(this.changeStreams.keys()).map(streamId =>
      this.closeChangeStream(streamId)
    );
    
    await Promise.allSettled(closePromises);

    // Disconnect from MongoDB
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }

    this.changeStreams.clear();
    this.streamConfigs.clear();
    this.streamInfo.clear();
    this.removeAllListeners();
    this.initialized = false;
    
    logger.info('MongoDB change stream service shutdown complete');
  }
}

export const mongoChangeStreamService = new MongoChangeStreamService();