"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketService = void 0;
const socket_io_1 = require("socket.io");
const redis_adapter_1 = require("@socket.io/redis-adapter");
const redis_1 = require("redis");
const config_1 = require("@fineprintai/shared-config");
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const connectionManager_1 = require("./connectionManager");
const rateLimiter_1 = require("./rateLimiter");
const authService_1 = require("./authService");
const logger = (0, logger_1.createServiceLogger)('websocket-service');
class WebSocketService {
    io;
    pubClient;
    subClient;
    connectionManager;
    rateLimiter;
    authService;
    messageQueue;
    metrics;
    heartbeatInterval = null;
    cleanupInterval = null;
    initialized = false;
    constructor(httpServer, messageQueue, metrics) {
        this.messageQueue = messageQueue;
        this.metrics = metrics;
        this.connectionManager = new connectionManager_1.ConnectionManager();
        this.rateLimiter = new rateLimiter_1.RateLimiter();
        this.authService = new authService_1.AuthenticationService();
        this.io = new socket_io_1.Server(httpServer, {
            path: config_1.config.websocket.path || '/socket.io',
            cors: {
                origin: config_1.config.cors.origins,
                credentials: true,
                methods: ['GET', 'POST'],
            },
            transports: ['websocket', 'polling'],
            pingTimeout: config_1.config.websocket.heartbeat?.timeout || 60000,
            pingInterval: config_1.config.websocket.heartbeat?.interval || 25000,
            maxHttpBufferSize: 1e6,
            allowEIO3: true,
            connectionStateRecovery: {
                maxDisconnectionDuration: 2 * 60 * 1000,
                skipMiddlewares: true,
            },
        });
        this.setupSocketEventHandlers();
    }
    async initialize() {
        if (this.initialized)
            return;
        try {
            await this.initializeRedisAdapter();
            await this.connectionManager.initialize();
            await this.rateLimiter.initialize();
            await this.authService.initialize();
            this.startHeartbeat();
            this.startCleanupTask();
            this.initialized = true;
            logger.info('WebSocket service initialized successfully', {
                maxConnections: config_1.config.websocket.maxConnections,
                path: config_1.config.websocket.path,
                heartbeatInterval: config_1.config.websocket.heartbeat?.interval,
            });
        }
        catch (error) {
            logger.error('Failed to initialize WebSocket service', { error });
            throw error;
        }
    }
    async shutdown() {
        if (!this.initialized)
            return;
        try {
            logger.info('Shutting down WebSocket service...');
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
                this.cleanupInterval = null;
            }
            this.io.emit('system:shutdown', {
                message: 'Server is shutting down',
                timestamp: new Date(),
            });
            await new Promise(resolve => setTimeout(resolve, 1000));
            this.io.disconnectSockets(true);
            await this.connectionManager.shutdown();
            await this.rateLimiter.shutdown();
            await this.authService.shutdown();
            if (this.pubClient) {
                await this.pubClient.quit();
            }
            if (this.subClient) {
                await this.subClient.quit();
            }
            this.io.close();
            this.initialized = false;
            logger.info('WebSocket service shut down successfully');
        }
        catch (error) {
            logger.error('Error during WebSocket service shutdown', { error });
            throw error;
        }
    }
    async initializeRedisAdapter() {
        try {
            this.pubClient = (0, redis_1.createClient)({
                url: config_1.config.redis.url,
                retryDelayOnFailover: config_1.config.redis.retryDelayOnFailover,
                maxRetriesPerRequest: config_1.config.redis.maxRetriesPerRequest,
            });
            this.subClient = this.pubClient.duplicate();
            await Promise.all([
                this.pubClient.connect(),
                this.subClient.connect(),
            ]);
            this.io.adapter((0, redis_adapter_1.createAdapter)(this.pubClient, this.subClient));
            logger.info('Redis adapter initialized for WebSocket clustering');
        }
        catch (error) {
            logger.error('Failed to initialize Redis adapter', { error });
            throw error;
        }
    }
    setupSocketEventHandlers() {
        this.io.use(async (socket, next) => {
            try {
                await this.authService.authenticateSocket(socket);
                next();
            }
            catch (error) {
                logger.warn('WebSocket authentication failed', {
                    error: error.message,
                    socketId: socket.id,
                    ip: socket.handshake.address,
                });
                next(new Error('Authentication failed'));
            }
        });
        this.io.use(async (socket, next) => {
            try {
                const allowed = await this.rateLimiter.checkLimit(socket);
                if (!allowed) {
                    next(new Error('Rate limit exceeded'));
                    return;
                }
                next();
            }
            catch (error) {
                logger.error('Rate limiting error', { error });
                next(error);
            }
        });
        this.io.on('connection', (socket) => {
            this.handleConnection(socket);
        });
        this.io.on('connect_error', (error) => {
            logger.error('Socket.io connection error', { error });
            this.metrics.incrementCounter('websocket_connection_errors');
        });
        logger.info('WebSocket event handlers setup completed');
    }
    async handleConnection(socket) {
        const userId = socket.userId;
        const socketId = socket.id;
        const clientInfo = this.extractClientInfo(socket);
        logger.info('User connected via WebSocket', {
            userId,
            socketId,
            ...clientInfo,
        });
        try {
            await this.connectionManager.addConnection(socket);
            await socket.join(`user:${userId}`);
            this.metrics.incrementCounter('websocket_connections_total');
            this.metrics.recordGauge('websocket_active_connections', this.connectionManager.getConnectionCount());
            this.setupSocketHandlers(socket);
            socket.emit('connected', {
                message: 'Connected to Fine Print AI WebSocket service',
                userId,
                socketId,
                timestamp: new Date(),
                serverVersion: '1.0.0',
            });
            await this.sendQueuedMessages(userId, socket);
            await this.updateUserPresence(userId, 'online');
            socket.on('disconnect', (reason) => {
                this.handleDisconnection(socket, reason);
            });
        }
        catch (error) {
            logger.error('Error handling WebSocket connection', { error, userId, socketId });
            socket.emit('error', {
                event: 'connection',
                message: 'Connection setup failed',
                timestamp: new Date(),
            });
            socket.disconnect(true);
        }
    }
    setupSocketHandlers(socket) {
        const userId = socket.userId;
        socket.on('ping', () => {
            this.connectionManager.updateActivity(socket.id);
            socket.emit('pong', { timestamp: new Date() });
        });
        socket.on('subscribe', async (data) => {
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
            }
            catch (error) {
                logger.error('Subscribe error', { error, userId, channels: data.channels });
                socket.emit('error', { event: 'subscribe', message: error.message });
            }
        });
        socket.on('unsubscribe', async (data) => {
            try {
                for (const channel of data.channels) {
                    await socket.leave(channel);
                    logger.debug('User unsubscribed from channel', { userId, channel });
                }
                socket.emit('unsubscription:ack', {
                    channels: data.channels,
                    timestamp: new Date(),
                });
            }
            catch (error) {
                logger.error('Unsubscribe error', { error, userId, channels: data.channels });
                socket.emit('error', { event: 'unsubscribe', message: error.message });
            }
        });
        socket.on('request_analysis_status', async (data) => {
            try {
                const status = await this.getAnalysisStatus(data.analysisId);
                socket.emit('analysis_status', status);
            }
            catch (error) {
                logger.error('Request analysis status error', { error, userId, analysisId: data.analysisId });
                socket.emit('error', { event: 'request_analysis_status', message: error.message });
            }
        });
        socket.on('request_queue_stats', async () => {
            try {
                const stats = await this.getQueueStats();
                socket.emit('queue_stats', stats);
            }
            catch (error) {
                logger.error('Request queue stats error', { error, userId });
                socket.emit('error', { event: 'request_queue_stats', message: error.message });
            }
        });
        socket.on('message', async (data) => {
            try {
                await this.handleCustomMessage(socket, data);
            }
            catch (error) {
                logger.error('Custom message error', { error, userId, messageType: data.type });
                socket.emit('error', { event: 'message', message: error.message });
            }
        });
        socket.onAny(() => {
            this.connectionManager.updateActivity(socket.id);
        });
    }
    handleDisconnection(socket, reason) {
        const userId = socket.userId;
        const socketId = socket.id;
        logger.info('User disconnected from WebSocket', {
            userId,
            socketId,
            reason,
        });
        try {
            this.connectionManager.removeConnection(socketId);
            this.metrics.incrementCounter('websocket_disconnections_total');
            this.metrics.recordGauge('websocket_active_connections', this.connectionManager.getConnectionCount());
            const userConnections = this.connectionManager.getUserConnections(userId);
            if (userConnections.length === 0) {
                this.updateUserPresence(userId, 'offline');
            }
        }
        catch (error) {
            logger.error('Error handling disconnection', { error, userId, socketId });
        }
    }
    async sendAnalysisProgress(message) {
        try {
            this.io.to(`analysis:${message.payload.analysisId}`).emit('analysis_progress', message);
            const analysisInfo = await this.getAnalysisInfo(message.payload.analysisId);
            if (analysisInfo?.userId) {
                this.io.to(`user:${analysisInfo.userId}`).emit('analysis_progress', message);
            }
            this.metrics.incrementCounter('websocket_messages_sent', { type: 'analysis_progress' });
            logger.debug('Analysis progress message sent', { analysisId: message.payload.analysisId });
        }
        catch (error) {
            logger.error('Failed to send analysis progress', { error, message });
        }
    }
    async sendAnalysisComplete(message) {
        try {
            this.io.to(`analysis:${message.payload.analysisId}`).emit('analysis_complete', message);
            this.io.to(`document:${message.payload.documentId}`).emit('analysis_complete', message);
            const analysisInfo = await this.getAnalysisInfo(message.payload.analysisId);
            if (analysisInfo?.userId) {
                this.io.to(`user:${analysisInfo.userId}`).emit('analysis_complete', message);
                if (!this.connectionManager.isUserOnline(analysisInfo.userId)) {
                    await this.messageQueue.queueMessage(analysisInfo.userId, message);
                }
            }
            this.metrics.incrementCounter('websocket_messages_sent', { type: 'analysis_complete' });
            logger.debug('Analysis complete message sent', { analysisId: message.payload.analysisId });
        }
        catch (error) {
            logger.error('Failed to send analysis complete', { error, message });
        }
    }
    async sendDocumentChange(message) {
        try {
            this.io.to(`document:${message.payload.documentId}`).emit('document_change', message);
            const documentUsers = await this.getDocumentUsers(message.payload.documentId);
            for (const userId of documentUsers) {
                this.io.to(`user:${userId}`).emit('document_change', message);
                if (!this.connectionManager.isUserOnline(userId)) {
                    await this.messageQueue.queueMessage(userId, message);
                }
            }
            this.metrics.incrementCounter('websocket_messages_sent', { type: 'document_change' });
            logger.debug('Document change message sent', { documentId: message.payload.documentId });
        }
        catch (error) {
            logger.error('Failed to send document change', { error, message });
        }
    }
    async sendNotification(userId, message) {
        try {
            this.io.to(`user:${userId}`).emit('notification', message);
            if (!this.connectionManager.isUserOnline(userId)) {
                await this.messageQueue.queueMessage(userId, message);
            }
            this.metrics.incrementCounter('websocket_messages_sent', { type: 'notification' });
            logger.debug('Notification sent', { userId, notificationId: message.payload.id });
        }
        catch (error) {
            logger.error('Failed to send notification', { error, userId, message });
        }
    }
    async sendSystemAlert(message, targetUsers) {
        try {
            if (targetUsers && targetUsers.length > 0) {
                for (const userId of targetUsers) {
                    this.io.to(`user:${userId}`).emit('system_alert', message);
                    if (!this.connectionManager.isUserOnline(userId)) {
                        await this.messageQueue.queueMessage(userId, message);
                    }
                }
            }
            else {
                this.io.emit('system_alert', message);
            }
            this.metrics.incrementCounter('websocket_messages_sent', { type: 'system_alert' });
            logger.info('System alert sent', { severity: message.payload.severity, targetUsers: targetUsers?.length || 'all' });
        }
        catch (error) {
            logger.error('Failed to send system alert', { error, message });
        }
    }
    async sendUserPresence(message, targetUsers) {
        try {
            if (targetUsers && targetUsers.length > 0) {
                for (const userId of targetUsers) {
                    this.io.to(`user:${userId}`).emit('user_presence', message);
                }
            }
            else {
                const teamId = await this.getUserTeam(message.payload.userId);
                if (teamId) {
                    this.io.to(`team:${teamId}`).emit('user_presence', message);
                }
            }
            this.metrics.incrementCounter('websocket_messages_sent', { type: 'user_presence' });
        }
        catch (error) {
            logger.error('Failed to send user presence', { error, message });
        }
    }
    async sendQueueStats(message) {
        try {
            this.io.to('admin').emit('queue_stats', message);
            this.metrics.incrementCounter('websocket_messages_sent', { type: 'queue_stats' });
        }
        catch (error) {
            logger.error('Failed to send queue stats', { error, message });
        }
    }
    getConnectionStats() {
        return this.connectionManager.getStats();
    }
    getUserConnectionInfo(userId) {
        return this.connectionManager.getUserInfo(userId);
    }
    async getHealthStatus() {
        try {
            const redisHealthy = this.pubClient ? await this.checkRedisHealth() : false;
            return {
                healthy: this.initialized && redisHealthy,
                redis: redisHealthy,
                connections: this.connectionManager.getConnectionCount(),
                memory: process.memoryUsage(),
                uptime: process.uptime(),
            };
        }
        catch (error) {
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
    extractClientInfo(socket) {
        return {
            userAgent: socket.handshake.headers['user-agent'],
            ip: socket.handshake.address,
            origin: socket.handshake.headers.origin,
            referer: socket.handshake.headers.referer,
        };
    }
    isValidChannel(channel, userId) {
        const validPrefixes = ['user:', 'document:', 'analysis:', 'team:', 'admin'];
        if (!validPrefixes.some(prefix => channel.startsWith(prefix))) {
            return false;
        }
        if (channel.startsWith('user:') && channel !== `user:${userId}`) {
            return false;
        }
        return true;
    }
    async sendQueuedMessages(userId, socket) {
        try {
            const queuedMessages = await this.messageQueue.getQueuedMessages(userId);
            for (const message of queuedMessages) {
                socket.emit(message.type, message);
            }
            if (queuedMessages.length > 0) {
                await this.messageQueue.clearQueuedMessages(userId);
                logger.debug('Sent queued messages to user', { userId, count: queuedMessages.length });
            }
        }
        catch (error) {
            logger.error('Error sending queued messages', { error, userId });
        }
    }
    async updateUserPresence(userId, status) {
        try {
            await cache_1.cache.set(`presence:${userId}`, {
                status,
                lastSeen: new Date(),
                timestamp: new Date(),
            }, 300);
            const presenceMessage = {
                type: 'user_presence',
                payload: {
                    userId,
                    status,
                    lastSeen: status === 'offline' ? new Date() : undefined,
                },
                timestamp: new Date(),
            };
            await this.sendUserPresence(presenceMessage);
        }
        catch (error) {
            logger.error('Error updating user presence', { error, userId, status });
        }
    }
    async handleCustomMessage(socket, message) {
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
    async getAnalysisStatus(analysisId) {
        return await cache_1.cache.get(`analysis:status:${analysisId}`);
    }
    async getQueueStats() {
        return await this.messageQueue.getStats();
    }
    async getAnalysisInfo(analysisId) {
        return await cache_1.cache.get(`analysis:info:${analysisId}`);
    }
    async getDocumentUsers(documentId) {
        const users = await cache_1.cache.get(`document:users:${documentId}`);
        return users || [];
    }
    async getUserTeam(userId) {
        return await cache_1.cache.get(`user:team:${userId}`);
    }
    async checkRedisHealth() {
        try {
            await this.pubClient.ping();
            return true;
        }
        catch (error) {
            return false;
        }
    }
    startHeartbeat() {
        const interval = config_1.config.websocket.heartbeat?.interval || 30000;
        this.heartbeatInterval = setInterval(() => {
            this.io.emit('heartbeat', { timestamp: new Date() });
        }, interval);
        logger.debug('Heartbeat started', { interval });
    }
    startCleanupTask() {
        this.cleanupInterval = setInterval(() => {
            const cleaned = this.connectionManager.cleanupInactive(30);
            if (cleaned > 0) {
                logger.info('Cleaned up inactive connections', { count: cleaned });
            }
        }, 5 * 60 * 1000);
        logger.debug('Cleanup task started');
    }
}
exports.WebSocketService = WebSocketService;
//# sourceMappingURL=websocketService.js.map