"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionManager = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const logger = (0, logger_1.createServiceLogger)('connection-manager');
class ConnectionManager {
    connections = new Map();
    userConnections = new Map();
    socketToUser = new Map();
    initialized = false;
    async initialize() {
        if (this.initialized)
            return;
        try {
            await this.loadPersistedConnections();
            this.initialized = true;
            logger.info('Connection manager initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize connection manager', { error });
            throw error;
        }
    }
    async shutdown() {
        if (!this.initialized)
            return;
        try {
            await this.persistConnections();
            this.connections.clear();
            this.userConnections.clear();
            this.socketToUser.clear();
            this.initialized = false;
            logger.info('Connection manager shut down successfully');
        }
        catch (error) {
            logger.error('Error during connection manager shutdown', { error });
        }
    }
    async addConnection(socket) {
        try {
            const userId = socket.userId;
            const socketId = socket.id;
            const now = new Date();
            const client = {
                id: socketId,
                userId,
                teamId: socket.teamId,
                connectedAt: now,
                lastActivity: now,
                subscriptions: [],
            };
            this.connections.set(socketId, client);
            this.socketToUser.set(socketId, userId);
            if (!this.userConnections.has(userId)) {
                this.userConnections.set(userId, new Set());
            }
            this.userConnections.get(userId).add(socketId);
            await this.persistConnectionInfo(client);
            logger.debug('Connection added', {
                userId,
                socketId,
                totalConnections: this.connections.size,
                userConnections: this.userConnections.get(userId)?.size,
            });
        }
        catch (error) {
            logger.error('Error adding connection', { error, socketId: socket.id });
            throw error;
        }
    }
    removeConnection(socketId) {
        try {
            const client = this.connections.get(socketId);
            if (!client) {
                logger.warn('Attempted to remove non-existent connection', { socketId });
                return;
            }
            const userId = client.userId;
            this.connections.delete(socketId);
            this.socketToUser.delete(socketId);
            const userSockets = this.userConnections.get(userId);
            if (userSockets) {
                userSockets.delete(socketId);
                if (userSockets.size === 0) {
                    this.userConnections.delete(userId);
                }
            }
            this.removePersistedConnection(socketId);
            logger.debug('Connection removed', {
                userId,
                socketId,
                totalConnections: this.connections.size,
                userConnections: userSockets?.size || 0,
            });
        }
        catch (error) {
            logger.error('Error removing connection', { error, socketId });
        }
    }
    updateActivity(socketId) {
        const client = this.connections.get(socketId);
        if (client) {
            client.lastActivity = new Date();
            const now = Date.now();
            const lastUpdate = client.lastActivity.getTime();
            if (now - lastUpdate > 30000) {
                this.persistConnectionInfo(client).catch(error => {
                    logger.error('Error persisting connection activity', { error, socketId });
                });
            }
        }
    }
    addSubscription(socketId, channel) {
        const client = this.connections.get(socketId);
        if (client) {
            if (!client.subscriptions.includes(channel)) {
                client.subscriptions.push(channel);
                logger.debug('Subscription added', { socketId, channel, userId: client.userId });
            }
        }
    }
    removeSubscription(socketId, channel) {
        const client = this.connections.get(socketId);
        if (client) {
            const index = client.subscriptions.indexOf(channel);
            if (index !== -1) {
                client.subscriptions.splice(index, 1);
                logger.debug('Subscription removed', { socketId, channel, userId: client.userId });
            }
        }
    }
    isUserOnline(userId) {
        const userSockets = this.userConnections.get(userId);
        return userSockets !== undefined && userSockets.size > 0;
    }
    getUserConnections(userId) {
        const socketIds = this.userConnections.get(userId);
        if (!socketIds)
            return [];
        return Array.from(socketIds)
            .map(socketId => this.connections.get(socketId))
            .filter((client) => client !== undefined);
    }
    getConnection(socketId) {
        return this.connections.get(socketId);
    }
    getUserIdFromSocket(socketId) {
        return this.socketToUser.get(socketId);
    }
    getConnectionCount() {
        return this.connections.size;
    }
    getUniqueUserCount() {
        return this.userConnections.size;
    }
    getStats() {
        const totalConnections = this.connections.size;
        const uniqueUsers = this.userConnections.size;
        const averageConnectionsPerUser = uniqueUsers > 0 ? totalConnections / uniqueUsers : 0;
        const connectionsByRoom = {};
        for (const client of this.connections.values()) {
            const userRoom = `user:${client.userId}`;
            connectionsByRoom[userRoom] = (connectionsByRoom[userRoom] || 0) + 1;
            if (client.teamId) {
                const teamRoom = `team:${client.teamId}`;
                connectionsByRoom[teamRoom] = (connectionsByRoom[teamRoom] || 0) + 1;
            }
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
    getUserInfo(userId) {
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
                userAgent: undefined,
                ip: undefined,
            };
        });
        return {
            isConnected: true,
            connectionCount: socketIds.size,
            connections,
        };
    }
    getConnectionsByTeam(teamId) {
        const teamConnections = [];
        for (const client of this.connections.values()) {
            if (client.teamId === teamId) {
                teamConnections.push(client);
            }
        }
        return teamConnections;
    }
    getConnectionsBySubscription(channel) {
        const subscribedConnections = [];
        for (const client of this.connections.values()) {
            if (client.subscriptions.includes(channel)) {
                subscribedConnections.push(client);
            }
        }
        return subscribedConnections;
    }
    cleanupInactive(thresholdMinutes = 30) {
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
    async getDetailedStats() {
        const connectionStats = this.getStats();
        const users = Array.from(this.userConnections.keys()).map(userId => {
            const userConnections = this.getUserConnections(userId);
            const latestActivity = userConnections.reduce((latest, conn) => {
                return conn.lastActivity > latest ? conn.lastActivity : latest;
            }, new Date(0));
            const allSubscriptions = new Set();
            let teamId;
            for (const conn of userConnections) {
                if (conn.teamId)
                    teamId = conn.teamId;
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
        const teams = {};
        for (const client of this.connections.values()) {
            if (client.teamId) {
                teams[client.teamId] = (teams[client.teamId] || 0) + 1;
            }
        }
        const subscriptions = {};
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
    async persistConnectionInfo(client) {
        try {
            await cache_1.cache.set(`connection:${client.id}`, {
                id: client.id,
                userId: client.userId,
                teamId: client.teamId,
                connectedAt: client.connectedAt,
                lastActivity: client.lastActivity,
                subscriptions: client.subscriptions,
            }, 3600);
        }
        catch (error) {
            logger.error('Error persisting connection info', { error, clientId: client.id });
        }
    }
    async removePersistedConnection(socketId) {
        try {
            await cache_1.cache.del(`connection:${socketId}`);
        }
        catch (error) {
            logger.error('Error removing persisted connection', { error, socketId });
        }
    }
    async loadPersistedConnections() {
        try {
            logger.debug('Loading persisted connections...');
        }
        catch (error) {
            logger.error('Error loading persisted connections', { error });
        }
    }
    async persistConnections() {
        try {
            const connectionData = {
                totalConnections: this.connections.size,
                uniqueUsers: this.userConnections.size,
                timestamp: new Date(),
                connections: Array.from(this.connections.values()),
            };
            await cache_1.cache.set('websocket:connection_state', connectionData, 300);
            logger.debug('Connection state persisted', {
                totalConnections: connectionData.totalConnections,
                uniqueUsers: connectionData.uniqueUsers,
            });
        }
        catch (error) {
            logger.error('Error persisting connections', { error });
        }
    }
}
exports.ConnectionManager = ConnectionManager;
//# sourceMappingURL=connectionManager.js.map