"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketService = void 0;
exports.createWebSocketService = createWebSocketService;
const socket_io_1 = require("socket.io");
const client_1 = require("@prisma/client");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("@fineprintai/shared-config");
const logger_1 = require("@fineprintai/shared-logger");
const logger = (0, logger_1.createServiceLogger)('websocket-service');
const prisma = new client_1.PrismaClient();
class WebSocketService {
    io;
    connectedUsers = new Map();
    userSockets = new Map();
    initialized = false;
    constructor(httpServer) {
        this.io = new socket_io_1.Server(httpServer, {
            cors: {
                origin: config_1.config.cors.origins,
                credentials: true,
            },
            transports: ['websocket', 'polling'],
            pingTimeout: 60000,
            pingInterval: 25000,
        });
        this.setupEventHandlers();
    }
    async initialize() {
        if (this.initialized)
            return;
        try {
            await prisma.$connect();
            this.initialized = true;
            logger.info('WebSocket service initialized successfully');
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
            this.io.disconnectSockets(true);
            this.io.close();
            this.connectedUsers.clear();
            this.userSockets.clear();
            await prisma.$disconnect();
            this.initialized = false;
            logger.info('WebSocket service shut down successfully');
        }
        catch (error) {
            logger.error('Error during WebSocket service shutdown', { error });
        }
    }
    setupEventHandlers() {
        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
                if (!token) {
                    return next(new Error('Authentication token required'));
                }
                const decoded = jsonwebtoken_1.default.verify(token, config_1.config.jwt.secret);
                const userId = decoded.userId || decoded.sub;
                if (!userId) {
                    return next(new Error('Invalid token'));
                }
                socket.userId = userId;
                socket.userEmail = decoded.email;
                socket.userName = decoded.name || decoded.displayName;
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
        this.io.on('connection', (socket) => {
            this.handleConnection(socket);
        });
        logger.info('WebSocket event handlers setup completed');
    }
    handleConnection(socket) {
        const userId = socket.userId;
        const socketId = socket.id;
        logger.info('User connected via WebSocket', {
            userId,
            socketId,
            userAgent: socket.handshake.headers['user-agent'],
            ip: socket.handshake.address,
        });
        const user = {
            userId,
            socketId,
            connectedAt: new Date(),
            lastActivity: new Date(),
        };
        this.connectedUsers.set(socketId, user);
        if (!this.userSockets.has(userId)) {
            this.userSockets.set(userId, new Set());
        }
        this.userSockets.get(userId).add(socketId);
        socket.join(`user:${userId}`);
        this.setupSocketEventHandlers(socket);
        socket.emit('connected', {
            message: 'Connected to notification service',
            userId,
            timestamp: new Date(),
        });
        this.sendUnreadNotificationsCount(socket);
        socket.on('disconnect', (reason) => {
            this.handleDisconnection(socket, reason);
        });
    }
    setupSocketEventHandlers(socket) {
        const userId = socket.userId;
        socket.on('ping', () => {
            this.updateUserActivity(socket.id);
            socket.emit('pong', { timestamp: new Date() });
        });
        socket.on('notification:read', async (data) => {
            try {
                await this.handleNotificationRead(userId, data.notificationId);
                socket.emit('notification:read:ack', {
                    notificationId: data.notificationId,
                    timestamp: new Date(),
                });
            }
            catch (error) {
                logger.error('Failed to handle notification read event', { error, userId, data });
                socket.emit('error', {
                    event: 'notification:read',
                    message: error.message,
                });
            }
        });
        socket.on('notification:click', async (data) => {
            try {
                await this.handleNotificationClick(userId, data.notificationId, data.actionUrl);
                socket.emit('notification:click:ack', {
                    notificationId: data.notificationId,
                    timestamp: new Date(),
                });
            }
            catch (error) {
                logger.error('Failed to handle notification click event', { error, userId, data });
                socket.emit('error', {
                    event: 'notification:click',
                    message: error.message,
                });
            }
        });
        socket.on('subscribe:notification', (data) => {
            socket.join(`notification:${data.notificationId}`);
            socket.emit('subscription:ack', {
                type: 'notification',
                id: data.notificationId,
                timestamp: new Date(),
            });
        });
        socket.on('unsubscribe:notification', (data) => {
            socket.leave(`notification:${data.notificationId}`);
            socket.emit('unsubscription:ack', {
                type: 'notification',
                id: data.notificationId,
                timestamp: new Date(),
            });
        });
        socket.on('preferences:update', async (data) => {
            try {
                socket.emit('preferences:update:ack', {
                    timestamp: new Date(),
                });
            }
            catch (error) {
                logger.error('Failed to handle preferences update', { error, userId, data });
                socket.emit('error', {
                    event: 'preferences:update',
                    message: error.message,
                });
            }
        });
        socket.on('notifications:history', async (data) => {
            try {
                const notifications = await this.getUserNotifications(userId, data);
                socket.emit('notifications:history:response', {
                    notifications,
                    timestamp: new Date(),
                });
            }
            catch (error) {
                logger.error('Failed to get notification history', { error, userId, data });
                socket.emit('error', {
                    event: 'notifications:history',
                    message: error.message,
                });
            }
        });
        this.updateUserActivity(socket.id);
    }
    handleDisconnection(socket, reason) {
        const userId = socket.userId;
        const socketId = socket.id;
        logger.info('User disconnected from WebSocket', {
            userId,
            socketId,
            reason,
        });
        this.connectedUsers.delete(socketId);
        const userSockets = this.userSockets.get(userId);
        if (userSockets) {
            userSockets.delete(socketId);
            if (userSockets.size === 0) {
                this.userSockets.delete(userId);
            }
        }
    }
    updateUserActivity(socketId) {
        const user = this.connectedUsers.get(socketId);
        if (user) {
            user.lastActivity = new Date();
        }
    }
    async sendNotificationUpdate(userId, update) {
        try {
            const userSockets = this.userSockets.get(userId);
            if (!userSockets || userSockets.size === 0) {
                logger.debug('No WebSocket connections for user', { userId });
                return;
            }
            this.io.to(`user:${userId}`).emit('notification:update', {
                ...update,
                timestamp: new Date(),
            });
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
        }
        catch (error) {
            logger.error('Failed to send notification update via WebSocket', { error, userId, update });
        }
    }
    async sendNewNotification(userId, notification) {
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
            this.sendUnreadNotificationsCount(userId);
            logger.debug('New notification sent via WebSocket', {
                userId,
                notificationId: notification.id,
                type: notification.type,
                connectedSockets: userSockets.size,
            });
        }
        catch (error) {
            logger.error('Failed to send new notification via WebSocket', { error, userId, notification });
        }
    }
    async sendBulkNotificationUpdate(userIds, update) {
        try {
            const connectedUserIds = userIds.filter(userId => this.userSockets.has(userId));
            if (connectedUserIds.length === 0) {
                logger.debug('No connected users for bulk update', { totalUsers: userIds.length });
                return;
            }
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
        }
        catch (error) {
            logger.error('Failed to send bulk notification update via WebSocket', { error, userIds, update });
        }
    }
    async sendSystemNotification(message) {
        try {
            const eventName = 'system:notification';
            const payload = {
                ...message,
                timestamp: new Date(),
            };
            if (message.targetUsers && message.targetUsers.length > 0) {
                const rooms = message.targetUsers
                    .filter(userId => this.userSockets.has(userId))
                    .map(userId => `user:${userId}`);
                this.io.to(rooms).emit(eventName, payload);
                logger.info('System notification sent to specific users', {
                    type: message.type,
                    targetUsers: message.targetUsers.length,
                    connectedUsers: rooms.length,
                });
            }
            else {
                this.io.emit(eventName, payload);
                logger.info('System notification broadcast to all users', {
                    type: message.type,
                    totalConnectedUsers: this.connectedUsers.size,
                });
            }
        }
        catch (error) {
            logger.error('Failed to send system notification via WebSocket', { error, message });
        }
    }
    getConnectionStats() {
        const totalConnections = this.connectedUsers.size;
        const uniqueUsers = this.userSockets.size;
        const averageConnectionsPerUser = uniqueUsers > 0 ? totalConnections / uniqueUsers : 0;
        const connectionsByRoom = {};
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
    getUserConnectionInfo(userId) {
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
    async sendUnreadNotificationsCount(socketOrUserId) {
        try {
            let userId;
            let socket;
            if (typeof socketOrUserId === 'string') {
                userId = socketOrUserId;
            }
            else {
                socket = socketOrUserId;
                userId = socket.userId;
            }
            const unreadCount = await this.getUnreadNotificationsCount(userId);
            if (socket) {
                socket.emit('notifications:unread:count', {
                    count: unreadCount,
                    timestamp: new Date(),
                });
            }
            else {
                this.io.to(`user:${userId}`).emit('notifications:unread:count', {
                    count: unreadCount,
                    timestamp: new Date(),
                });
            }
        }
        catch (error) {
            logger.error('Failed to send unread notifications count', { error, socketOrUserId });
        }
    }
    async getUnreadNotificationsCount(userId) {
        try {
            return await prisma.notification.count({
                where: {
                    userId,
                    readAt: null,
                },
            });
        }
        catch (error) {
            logger.error('Failed to get unread notifications count', { error, userId });
            return 0;
        }
    }
    async getUserNotifications(userId, options) {
        try {
            const { limit = 50, offset = 0, unreadOnly = false, } = options;
            const whereClause = { userId };
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
        }
        catch (error) {
            logger.error('Failed to get user notifications', { error, userId, options });
            return [];
        }
    }
    async handleNotificationRead(userId, notificationId) {
        try {
            await prisma.notification.update({
                where: {
                    id: notificationId,
                    userId,
                },
                data: { readAt: new Date() },
            });
            this.sendUnreadNotificationsCount(userId);
            logger.debug('Notification marked as read via WebSocket', {
                userId,
                notificationId,
            });
        }
        catch (error) {
            logger.error('Failed to mark notification as read', { error, userId, notificationId });
            throw error;
        }
    }
    async handleNotificationClick(userId, notificationId, actionUrl) {
        try {
            await prisma.notification.updateMany({
                where: {
                    id: notificationId,
                    userId,
                    readAt: null,
                },
                data: { readAt: new Date() },
            });
            this.sendUnreadNotificationsCount(userId);
            logger.debug('Notification click tracked via WebSocket', {
                userId,
                notificationId,
                actionUrl,
            });
        }
        catch (error) {
            logger.error('Failed to handle notification click', { error, userId, notificationId });
            throw error;
        }
    }
    cleanupInactiveConnections(inactiveThresholdMinutes = 30) {
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
exports.WebSocketService = WebSocketService;
function createWebSocketService(httpServer) {
    return new WebSocketService(httpServer);
}
//# sourceMappingURL=websocketService.js.map