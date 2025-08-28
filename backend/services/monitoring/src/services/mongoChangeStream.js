"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mongoChangeStreamService = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const mongodb_1 = require("mongodb");
const events_1 = require("events");
const config_1 = require("@fineprintai/shared-config");
const logger = (0, logger_1.createServiceLogger)('mongo-change-stream-service');
class MongoChangeStreamService extends events_1.EventEmitter {
    client = null;
    db = null;
    changeStreams = new Map();
    streamConfigs = new Map();
    streamInfo = new Map();
    initialized = false;
    reconnectTimeout = null;
    heartbeatInterval = null;
    constructor() {
        super();
    }
    async initialize() {
        if (this.initialized)
            return;
        logger.info('Initializing MongoDB change stream service...');
        try {
            await this.connect();
            this.startHeartbeat();
            this.initialized = true;
            logger.info('MongoDB change stream service initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize MongoDB change stream service', { error });
            throw error;
        }
    }
    async connect() {
        try {
            const mongoUri = process.env.MONGODB_URL || config_1.config.database.url;
            this.client = new mongodb_1.MongoClient(mongoUri, {
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
                family: 4,
            });
            await this.client.connect();
            const dbName = this.extractDatabaseName(mongoUri) || 'fineprintai';
            this.db = this.client.db(dbName);
            logger.info('Connected to MongoDB', { database: dbName });
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
        }
        catch (error) {
            logger.error('Failed to connect to MongoDB', { error });
            throw error;
        }
    }
    extractDatabaseName(uri) {
        try {
            const url = new URL(uri);
            return url.pathname.substring(1) || null;
        }
        catch {
            return null;
        }
    }
    async createChangeStream(streamId, config) {
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
            this.setupChangeStreamHandlers(streamId, changeStream, config);
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
        }
        catch (error) {
            logger.error('Failed to create change stream', { streamId, error });
            throw error;
        }
    }
    setupChangeStreamHandlers(streamId, changeStream, config) {
        changeStream.on('change', async (change) => {
            const info = this.streamInfo.get(streamId);
            info.lastEventAt = new Date();
            info.eventCount++;
            logger.debug('Change stream event received', {
                streamId,
                operationType: change.operationType,
                collection: config.collection,
            });
            try {
                const documentChange = this.convertChangeEvent(change, config.collection);
                await config.handler(change);
                this.emit('documentChange', {
                    streamId,
                    change: documentChange,
                });
            }
            catch (error) {
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
    convertChangeEvent(change, collection) {
        return {
            operation: change.operationType,
            collection,
            documentId: change.documentKey?._id,
            fullDocument: change.fullDocument,
            updateDescription: change.updateDescription,
            clusterTime: change.clusterTime,
            timestamp: new Date(),
        };
    }
    async restartChangeStream(streamId) {
        logger.info('Attempting to restart change stream', { streamId });
        try {
            await this.closeChangeStream(streamId);
            await new Promise(resolve => setTimeout(resolve, 5000));
            const config = this.streamConfigs.get(streamId);
            if (!config) {
                logger.error('Cannot restart change stream - config not found', { streamId });
                return;
            }
            await this.createChangeStream(streamId, config);
            logger.info('Change stream restarted successfully', { streamId });
        }
        catch (error) {
            logger.error('Failed to restart change stream', {
                streamId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            setTimeout(() => {
                this.restartChangeStream(streamId);
            }, 30000);
        }
    }
    async closeChangeStream(streamId) {
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
        }
        catch (error) {
            logger.error('Error closing change stream', {
                streamId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return false;
        }
    }
    async pauseChangeStream(streamId) {
        const changeStream = this.changeStreams.get(streamId);
        if (!changeStream) {
            return false;
        }
        try {
            await changeStream.close();
            const info = this.streamInfo.get(streamId);
            if (info) {
                info.isActive = false;
                this.streamInfo.set(streamId, info);
            }
            logger.info('Change stream paused', { streamId });
            return true;
        }
        catch (error) {
            logger.error('Error pausing change stream', {
                streamId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return false;
        }
    }
    async resumeChangeStream(streamId) {
        const config = this.streamConfigs.get(streamId);
        if (!config) {
            logger.error('Cannot resume change stream - config not found', { streamId });
            return false;
        }
        try {
            await this.closeChangeStream(streamId);
            await this.createChangeStream(streamId, config);
            logger.info('Change stream resumed', { streamId });
            return true;
        }
        catch (error) {
            logger.error('Error resuming change stream', {
                streamId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return false;
        }
    }
    getChangeStreamInfo(streamId) {
        return this.streamInfo.get(streamId);
    }
    getAllChangeStreamInfo() {
        return Array.from(this.streamInfo.values());
    }
    getActiveChangeStreams() {
        return Array.from(this.streamInfo.entries())
            .filter(([_, info]) => info.isActive)
            .map(([streamId, _]) => streamId);
    }
    async createDocumentMonitoringStream() {
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
                this.emit('documentMonitoringChange', {
                    operation: change.operationType,
                    documentId: change.documentKey?._id,
                    document: change.fullDocument,
                    updateDescription: change.updateDescription,
                });
            },
        });
    }
    async createUserActivityStream() {
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
    async createAuditLogStream() {
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
    handleConnectionLoss() {
        logger.warn('MongoDB connection lost, attempting to reconnect...');
        for (const [streamId, info] of this.streamInfo.entries()) {
            info.isActive = false;
            this.streamInfo.set(streamId, info);
        }
        this.scheduleReconnection();
    }
    handleConnectionError(error) {
        logger.error('MongoDB connection error', { error: error.message });
        this.emit('connectionError', error);
    }
    handleReconnection() {
        logger.info('MongoDB reconnected, restarting change streams...');
        const streamIds = Array.from(this.streamConfigs.keys());
        streamIds.forEach(streamId => {
            this.restartChangeStream(streamId);
        });
        this.emit('reconnected');
    }
    scheduleReconnection() {
        if (this.reconnectTimeout) {
            return;
        }
        this.reconnectTimeout = setTimeout(async () => {
            try {
                await this.connect();
                this.reconnectTimeout = null;
                this.handleReconnection();
            }
            catch (error) {
                logger.error('Reconnection failed', { error });
                this.reconnectTimeout = null;
                this.scheduleReconnection();
            }
        }, 10000);
    }
    startHeartbeat() {
        this.heartbeatInterval = setInterval(async () => {
            try {
                if (this.db) {
                    await this.db.admin().ping();
                }
            }
            catch (error) {
                logger.error('MongoDB heartbeat failed', { error });
                this.handleConnectionLoss();
            }
        }, 30000);
    }
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
    getConnectionStats() {
        const allInfo = Array.from(this.streamInfo.values());
        return {
            connected: !!this.client && !!this.db,
            database: this.db?.databaseName || null,
            activeStreams: allInfo.filter(info => info.isActive).length,
            totalEvents: allInfo.reduce((sum, info) => sum + info.eventCount, 0),
            totalErrors: allInfo.reduce((sum, info) => sum + info.errorCount, 0),
        };
    }
    async healthCheck() {
        if (!this.initialized) {
            throw new Error('MongoDB change stream service not initialized');
        }
        if (!this.client || !this.db) {
            throw new Error('MongoDB not connected');
        }
        await this.db.admin().ping();
        const activeStreams = this.getActiveChangeStreams();
        if (activeStreams.length === 0) {
            logger.warn('No active change streams');
        }
        logger.info('MongoDB change stream service health check passed', {
            activeStreams: activeStreams.length,
            totalStreams: this.streamInfo.size,
        });
    }
    async shutdown() {
        logger.info('Shutting down MongoDB change stream service...');
        this.stopHeartbeat();
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        const closePromises = Array.from(this.changeStreams.keys()).map(streamId => this.closeChangeStream(streamId));
        await Promise.allSettled(closePromises);
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
exports.mongoChangeStreamService = new MongoChangeStreamService();
//# sourceMappingURL=mongoChangeStream.js.map