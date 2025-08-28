"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketService = void 0;
exports.createWebSocketService = createWebSocketService;
const logger_1 = require("@fineprintai/shared-logger");
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("@fineprintai/shared-config");
const logger = (0, logger_1.createServiceLogger)('websocket-service');
class WebSocketService {
    io;
    connectedUsers = new Map();
    userSockets = new Map();
    analysisSubscriptions = new Map();
    monitorSubscriptions = new Map();
    constructor(httpServer) {
        this.io = new socket_io_1.Server(httpServer, {
            cors: {
                origin: config_1.config.client.urls || "*",
                methods: ["GET", "POST"],
                credentials: true
            },
            transports: ['websocket', 'polling']
        });
        this.setupMiddleware();
        this.setupEventHandlers();
        logger.info('WebSocket service initialized');
    }
    setupMiddleware() {
        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
                if (!token) {
                    return next(new Error('Authentication token required'));
                }
                const decoded = jsonwebtoken_1.default.verify(token, config_1.config.auth.jwtSecret);
                const userId = decoded.userId || decoded.sub;
                if (!userId) {
                    return next(new Error('Invalid token'));
                }
                socket.data.userId = userId;
                socket.data.teamId = decoded.teamId;
                socket.data.subscription = decoded.subscription;
                logger.debug('WebSocket client authenticated', {
                    socketId: socket.id,
                    userId,
                    userAgent: socket.handshake.headers['user-agent']
                });
                next();
            }
            catch (error) {
                logger.warn('WebSocket authentication failed', {
                    error: error.message,
                    socketId: socket.id
                });
                next(new Error('Authentication failed'));
            }
        });
    }
    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            const userId = socket.data.userId;
            logger.info('WebSocket client connected', {
                socketId: socket.id,
                userId,
                totalConnections: this.io.engine.clientsCount
            });
            this.trackUserConnection(userId, socket.id);
            socket.on('subscribe_analysis', (analysisId) => {
                this.subscribeToAnalysis(socket.id, analysisId);
            });
            socket.on('unsubscribe_analysis', (analysisId) => {
                this.unsubscribeFromAnalysis(socket.id, analysisId);
            });
            socket.on('subscribe_monitor', (monitorId) => {
                this.subscribeToMonitor(socket.id, monitorId);
            });
            socket.on('unsubscribe_monitor', (monitorId) => {
                this.unsubscribeFromMonitor(socket.id, monitorId);
            });
            socket.on('get_analysis_status', async (analysisId) => {
                try {
                    const status = await this.getAnalysisStatus(analysisId, userId);
                    socket.emit('analysis_status', { analysisId, status });
                }
                catch (error) {
                    socket.emit('error', { message: 'Failed to get analysis status', analysisId });
                }
            });
            socket.on('ping', () => {
                socket.emit('pong', { timestamp: new Date() });
            });
            socket.on('disconnect', (reason) => {
                logger.info('WebSocket client disconnected', {
                    socketId: socket.id,
                    userId,
                    reason,
                    totalConnections: this.io.engine.clientsCount
                });
                this.handleClientDisconnect(socket.id, userId);
            });
            socket.on('error', (error) => {
                logger.error('WebSocket client error', {
                    socketId: socket.id,
                    userId,
                    error: error.message
                });
            });
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
        this.io.on('error', (error) => {
            logger.error('WebSocket server error', { error: error.message });
        });
    }
    trackUserConnection(userId, socketId) {
        if (!this.connectedUsers.has(userId)) {
            this.connectedUsers.set(userId, new Set());
        }
        this.connectedUsers.get(userId).add(socketId);
        this.userSockets.set(socketId, userId);
    }
    handleClientDisconnect(socketId, userId) {
        const userSockets = this.connectedUsers.get(userId);
        if (userSockets) {
            userSockets.delete(socketId);
            if (userSockets.size === 0) {
                this.connectedUsers.delete(userId);
            }
        }
        this.userSockets.delete(socketId);
        this.cleanupSubscriptions(socketId);
    }
    cleanupSubscriptions(socketId) {
        for (const [analysisId, sockets] of this.analysisSubscriptions.entries()) {
            sockets.delete(socketId);
            if (sockets.size === 0) {
                this.analysisSubscriptions.delete(analysisId);
            }
        }
        for (const [monitorId, sockets] of this.monitorSubscriptions.entries()) {
            sockets.delete(socketId);
            if (sockets.size === 0) {
                this.monitorSubscriptions.delete(monitorId);
            }
        }
    }
    subscribeToAnalysis(socketId, analysisId) {
        if (!this.analysisSubscriptions.has(analysisId)) {
            this.analysisSubscriptions.set(analysisId, new Set());
        }
        this.analysisSubscriptions.get(analysisId).add(socketId);
        const userId = this.userSockets.get(socketId);
        logger.debug('Client subscribed to analysis', { socketId, analysisId, userId });
        this.getAnalysisStatus(analysisId, userId).then(status => {
            this.io.to(socketId).emit('analysis_status', { analysisId, status });
        }).catch(() => {
        });
    }
    unsubscribeFromAnalysis(socketId, analysisId) {
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
    subscribeToMonitor(socketId, monitorId) {
        if (!this.monitorSubscriptions.has(monitorId)) {
            this.monitorSubscriptions.set(monitorId, new Set());
        }
        this.monitorSubscriptions.get(monitorId).add(socketId);
        const userId = this.userSockets.get(socketId);
        logger.debug('Client subscribed to monitor', { socketId, monitorId, userId });
    }
    unsubscribeFromMonitor(socketId, monitorId) {
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
    sendToUser(userId, eventType, data) {
        const userSockets = this.connectedUsers.get(userId);
        if (!userSockets || userSockets.size === 0) {
            logger.debug('No connected sockets for user', { userId, eventType });
            return false;
        }
        const message = {
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
            }
            catch (error) {
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
    sendAnalysisProgress(analysisId, progress) {
        const subscribers = this.analysisSubscriptions.get(analysisId);
        if (!subscribers || subscribers.size === 0) {
            return;
        }
        const message = {
            type: 'analysis_progress',
            data: progress,
            timestamp: new Date(),
            analysisId
        };
        for (const socketId of subscribers) {
            try {
                this.io.to(socketId).emit('analysis_progress', message);
            }
            catch (error) {
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
    sendAnalysisEvent(event) {
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
                }
                catch (error) {
                    logger.warn('Failed to send analysis event to subscriber', {
                        socketId,
                        analysisId: event.analysisId,
                        eventType: event.type,
                        error: error.message
                    });
                }
            }
        }
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
    sendChangeMonitorEvent(event) {
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
                }
                catch (error) {
                    logger.warn('Failed to send monitor event to subscriber', {
                        socketId,
                        monitorId: event.monitorId,
                        eventType: event.type,
                        error: error.message
                    });
                }
            }
        }
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
    broadcastSystemNotification(notification) {
        const message = {
            type: 'system_notification',
            data: {
                ...notification,
                id: `system_${Date.now()}`,
                timestamp: new Date()
            },
            timestamp: new Date()
        };
        if (notification.targetUsers && notification.targetUsers.length > 0) {
            for (const userId of notification.targetUsers) {
                this.sendToUser(userId, 'system_notification', message.data);
            }
        }
        else {
            this.io.emit('system_notification', message);
        }
        logger.info('System notification broadcasted', {
            type: notification.type,
            severity: notification.severity,
            targetUsers: notification.targetUsers?.length || 'all',
            connectedUsers: this.connectedUsers.size
        });
    }
    getConnectionStats() {
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
    getUserConnections(userId) {
        const userSockets = this.connectedUsers.get(userId);
        return userSockets ? Array.from(userSockets) : [];
    }
    isUserConnected(userId) {
        const userSockets = this.connectedUsers.get(userId);
        return userSockets ? userSockets.size > 0 : false;
    }
    disconnectUser(userId, reason = 'Server initiated disconnect') {
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
            }
            catch (error) {
                logger.warn('Failed to disconnect socket', { socketId, userId, error: error.message });
            }
        }
        logger.info('User disconnected by server', { userId, disconnectedCount, reason });
        return disconnectedCount;
    }
    async getAnalysisStatus(analysisId, userId) {
        try {
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
        }
        catch (error) {
            logger.error('Failed to get analysis status', { error: error.message, analysisId, userId });
            throw error;
        }
    }
    async shutdown() {
        logger.info('Shutting down WebSocket service');
        this.broadcastSystemNotification({
            type: 'maintenance',
            title: 'Service Maintenance',
            message: 'The service is shutting down for maintenance. Please reconnect in a few minutes.',
            severity: 'medium'
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
        this.io.close();
        this.connectedUsers.clear();
        this.userSockets.clear();
        this.analysisSubscriptions.clear();
        this.monitorSubscriptions.clear();
        logger.info('WebSocket service shut down complete');
    }
}
exports.WebSocketService = WebSocketService;
function createWebSocketService(httpServer) {
    return new WebSocketService(httpServer);
}
//# sourceMappingURL=websocketService.js.map