"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.progressTracker = exports.ProgressTracker = void 0;
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const logger_1 = require("@fineprintai/shared-logger");
const queueManager_1 = require("./queueManager");
const events_1 = require("events");
const logger = (0, logger_1.createServiceLogger)('progress-tracker');
class ProgressTracker extends events_1.EventEmitter {
    io;
    httpServer;
    connections = new Map();
    analysisSubscribers = new Map();
    userSockets = new Map();
    port;
    isStarted = false;
    activeAnalyses = new Map();
    analysisHistory = new Map();
    constructor(port = 8001) {
        super();
        this.port = port;
        this.httpServer = (0, http_1.createServer)();
        this.io = new socket_io_1.Server(this.httpServer, {
            cors: {
                origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
                methods: ['GET', 'POST'],
                credentials: true
            },
            transports: ['websocket', 'polling']
        });
        this.setupHealthEndpoint();
        this.setupSocketHandlers();
        this.setupQueueListeners();
    }
    async start() {
        if (this.isStarted) {
            logger.warn('Progress Tracker already started');
            return;
        }
        try {
            await new Promise((resolve, reject) => {
                this.httpServer.listen(this.port, '0.0.0.0', (err) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
            });
            this.isStarted = true;
            this.startCleanupTasks();
            logger.info('Progress Tracker started successfully', {
                port: this.port,
                transports: ['websocket', 'polling']
            });
        }
        catch (error) {
            logger.error('Failed to start Progress Tracker', { error: error.message });
            throw error;
        }
    }
    async stop() {
        if (!this.isStarted)
            return;
        logger.info('Stopping Progress Tracker');
        this.io.close();
        await new Promise((resolve) => {
            this.httpServer.close(() => resolve());
        });
        this.isStarted = false;
        this.connections.clear();
        this.analysisSubscribers.clear();
        this.userSockets.clear();
        logger.info('Progress Tracker stopped');
    }
    broadcastProgress(progress) {
        const subscribers = this.analysisSubscribers.get(progress.analysisId);
        if (!subscribers || subscribers.size === 0) {
            logger.debug('No subscribers for analysis', { analysisId: progress.analysisId });
            return;
        }
        this.activeAnalyses.set(progress.analysisId, progress);
        if (!this.analysisHistory.has(progress.analysisId)) {
            this.analysisHistory.set(progress.analysisId, []);
        }
        this.analysisHistory.get(progress.analysisId).push(progress);
        const message = {
            type: 'analysis_progress',
            data: {
                ...progress,
                timestamp: progress.timestamp.toISOString()
            }
        };
        let broadcastCount = 0;
        subscribers.forEach(socketId => {
            const socket = this.io.sockets.sockets.get(socketId);
            if (socket) {
                socket.emit('analysis_progress', message);
                broadcastCount++;
            }
            else {
                subscribers.delete(socketId);
            }
        });
        logger.debug('Progress broadcasted', {
            analysisId: progress.analysisId,
            step: progress.step,
            percentage: progress.percentage,
            subscribersNotified: broadcastCount
        });
        this.emit('progressBroadcast', { progress, subscribersNotified: broadcastCount });
    }
    broadcastAnalysisComplete(analysisId, result) {
        const subscribers = this.analysisSubscribers.get(analysisId);
        if (subscribers && subscribers.size > 0) {
            const message = {
                type: 'analysis_complete',
                data: {
                    analysisId,
                    result,
                    timestamp: new Date().toISOString()
                }
            };
            subscribers.forEach(socketId => {
                const socket = this.io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.emit('analysis_complete', message);
                }
            });
            logger.info('Analysis completion broadcasted', {
                analysisId,
                subscribersNotified: subscribers.size
            });
        }
        this.activeAnalyses.delete(analysisId);
        this.analysisSubscribers.delete(analysisId);
    }
    broadcastAnalysisError(analysisId, error) {
        const subscribers = this.analysisSubscribers.get(analysisId);
        if (subscribers && subscribers.size > 0) {
            const message = {
                type: 'analysis_error',
                data: {
                    analysisId,
                    error,
                    timestamp: new Date().toISOString()
                }
            };
            subscribers.forEach(socketId => {
                const socket = this.io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.emit('analysis_error', message);
                }
            });
            logger.warn('Analysis error broadcasted', {
                analysisId,
                error,
                subscribersNotified: subscribers.size
            });
        }
        this.activeAnalyses.delete(analysisId);
        this.analysisSubscribers.delete(analysisId);
    }
    getAnalysisProgress(analysisId) {
        return this.activeAnalyses.get(analysisId) || null;
    }
    getAnalysisHistory(analysisId) {
        return this.analysisHistory.get(analysisId) || [];
    }
    getStats() {
        const connectionsPerUser = {};
        this.connections.forEach(conn => {
            connectionsPerUser[conn.userId] = (connectionsPerUser[conn.userId] || 0) + 1;
        });
        return {
            totalConnections: this.connections.size,
            activeAnalyses: this.activeAnalyses.size,
            totalSubscriptions: Array.from(this.analysisSubscribers.values())
                .reduce((sum, subs) => sum + subs.size, 0),
            connectionsPerUser
        };
    }
    setupHealthEndpoint() {
        this.httpServer.on('request', (req, res) => {
            if (req.url === '/health' && req.method === 'GET') {
                const stats = this.getStats();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    service: 'progress-tracker',
                    stats
                }));
                return;
            }
            if (req.url === '/metrics' && req.method === 'GET') {
                const stats = this.getStats();
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(`# HELP fineprintai_websocket_connections Total WebSocket connections
# TYPE fineprintai_websocket_connections gauge
fineprintai_websocket_connections ${stats.totalConnections}

# HELP fineprintai_active_analyses Active analysis sessions
# TYPE fineprintai_active_analyses gauge
fineprintai_active_analyses ${stats.activeAnalyses}

# HELP fineprintai_total_subscriptions Total analysis subscriptions
# TYPE fineprintai_total_subscriptions gauge
fineprintai_total_subscriptions ${stats.totalSubscriptions}
`);
                return;
            }
            res.writeHead(404);
            res.end('Not found');
        });
    }
    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            logger.info('Client connected', { socketId: socket.id });
            socket.on('authenticate', (data) => {
                try {
                    const { userId } = data;
                    if (!userId) {
                        socket.emit('auth_error', { message: 'User ID required' });
                        return;
                    }
                    const connectionInfo = {
                        socketId: socket.id,
                        userId,
                        connectedAt: new Date(),
                        subscribedAnalyses: [],
                        lastActivity: new Date()
                    };
                    this.connections.set(socket.id, connectionInfo);
                    if (!this.userSockets.has(userId)) {
                        this.userSockets.set(userId, new Set());
                    }
                    this.userSockets.get(userId).add(socket.id);
                    socket.emit('authenticated', {
                        userId,
                        socketId: socket.id,
                        timestamp: new Date().toISOString()
                    });
                    logger.info('Client authenticated', { socketId: socket.id, userId });
                }
                catch (error) {
                    logger.error('Authentication failed', {
                        socketId: socket.id,
                        error: error.message
                    });
                    socket.emit('auth_error', { message: 'Authentication failed' });
                }
            });
            socket.on('subscribe_analysis', (data) => {
                const connection = this.connections.get(socket.id);
                if (!connection) {
                    socket.emit('error', { message: 'Not authenticated' });
                    return;
                }
                const { analysisId } = data;
                if (!this.analysisSubscribers.has(analysisId)) {
                    this.analysisSubscribers.set(analysisId, new Set());
                }
                this.analysisSubscribers.get(analysisId).add(socket.id);
                connection.subscribedAnalyses.push(analysisId);
                connection.lastActivity = new Date();
                const currentProgress = this.getAnalysisProgress(analysisId);
                if (currentProgress) {
                    socket.emit('analysis_progress', {
                        type: 'analysis_progress',
                        data: {
                            ...currentProgress,
                            timestamp: currentProgress.timestamp.toISOString()
                        }
                    });
                }
                socket.emit('subscribed', { analysisId });
                logger.info('Client subscribed to analysis', {
                    socketId: socket.id,
                    userId: connection.userId,
                    analysisId
                });
            });
            socket.on('unsubscribe_analysis', (data) => {
                const connection = this.connections.get(socket.id);
                if (!connection)
                    return;
                const { analysisId } = data;
                const subscribers = this.analysisSubscribers.get(analysisId);
                if (subscribers) {
                    subscribers.delete(socket.id);
                    if (subscribers.size === 0) {
                        this.analysisSubscribers.delete(analysisId);
                    }
                }
                const index = connection.subscribedAnalyses.indexOf(analysisId);
                if (index > -1) {
                    connection.subscribedAnalyses.splice(index, 1);
                }
                connection.lastActivity = new Date();
                socket.emit('unsubscribed', { analysisId });
                logger.info('Client unsubscribed from analysis', {
                    socketId: socket.id,
                    userId: connection.userId,
                    analysisId
                });
            });
            socket.on('get_analysis_history', (data) => {
                const connection = this.connections.get(socket.id);
                if (!connection) {
                    socket.emit('error', { message: 'Not authenticated' });
                    return;
                }
                const history = this.getAnalysisHistory(data.analysisId);
                socket.emit('analysis_history', {
                    analysisId: data.analysisId,
                    history: history.map(h => ({
                        ...h,
                        timestamp: h.timestamp.toISOString()
                    }))
                });
            });
            socket.on('ping', () => {
                const connection = this.connections.get(socket.id);
                if (connection) {
                    connection.lastActivity = new Date();
                }
                socket.emit('pong', { timestamp: new Date().toISOString() });
            });
            socket.on('disconnect', (reason) => {
                const connection = this.connections.get(socket.id);
                if (connection) {
                    connection.subscribedAnalyses.forEach(analysisId => {
                        const subscribers = this.analysisSubscribers.get(analysisId);
                        if (subscribers) {
                            subscribers.delete(socket.id);
                            if (subscribers.size === 0) {
                                this.analysisSubscribers.delete(analysisId);
                            }
                        }
                    });
                    const userSockets = this.userSockets.get(connection.userId);
                    if (userSockets) {
                        userSockets.delete(socket.id);
                        if (userSockets.size === 0) {
                            this.userSockets.delete(connection.userId);
                        }
                    }
                    this.connections.delete(socket.id);
                    logger.info('Client disconnected', {
                        socketId: socket.id,
                        userId: connection.userId,
                        reason,
                        connectionDuration: Date.now() - connection.connectedAt.getTime()
                    });
                }
            });
            socket.emit('connected', {
                message: 'Connected to Fine Print AI Progress Tracker',
                socketId: socket.id,
                timestamp: new Date().toISOString(),
                serverTime: new Date().toISOString()
            });
        });
    }
    setupQueueListeners() {
        queueManager_1.queueManager.on('jobStarted', (job) => {
            this.broadcastProgress({
                analysisId: job.analysisId,
                jobId: job.id,
                userId: job.userId,
                step: 'started',
                percentage: 0,
                message: 'Analysis started',
                timestamp: new Date(),
                estimatedTimeRemaining: job.estimatedDuration,
                currentOperation: 'Initializing analysis'
            });
        });
        queueManager_1.queueManager.on('jobProgress', (data) => {
            this.broadcastProgress({
                analysisId: data.jobId,
                userId: '',
                step: data.step,
                percentage: data.percentage,
                message: data.message,
                timestamp: new Date(),
                currentOperation: data.step
            });
        });
        queueManager_1.queueManager.on('jobCompleted', (job) => {
            this.broadcastAnalysisComplete(job.analysisId, job.result);
        });
        queueManager_1.queueManager.on('jobFailed', (job) => {
            this.broadcastAnalysisError(job.analysisId, job.error || 'Analysis failed');
        });
        logger.info('Queue event listeners setup completed');
    }
    startCleanupTasks() {
        setInterval(() => {
            this.cleanupOldHistory();
        }, 60 * 60 * 1000);
        setInterval(() => {
            this.cleanupInactiveConnections();
        }, 5 * 60 * 1000);
    }
    cleanupOldHistory() {
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        let cleanedAnalyses = 0;
        for (const [analysisId, history] of this.analysisHistory.entries()) {
            const filteredHistory = history.filter(h => h.timestamp.getTime() > oneDayAgo);
            if (filteredHistory.length === 0) {
                this.analysisHistory.delete(analysisId);
                cleanedAnalyses++;
            }
            else if (filteredHistory.length < history.length) {
                this.analysisHistory.set(analysisId, filteredHistory);
            }
        }
        if (cleanedAnalyses > 0) {
            logger.info('Cleaned up old analysis history', { cleanedAnalyses });
        }
    }
    cleanupInactiveConnections() {
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        const toRemove = [];
        for (const [socketId, connection] of this.connections.entries()) {
            if (connection.lastActivity.getTime() < fiveMinutesAgo) {
                const socket = this.io.sockets.sockets.get(socketId);
                if (!socket || !socket.connected) {
                    toRemove.push(socketId);
                }
            }
        }
        toRemove.forEach(socketId => {
            const connection = this.connections.get(socketId);
            if (connection) {
                connection.subscribedAnalyses.forEach(analysisId => {
                    const subscribers = this.analysisSubscribers.get(analysisId);
                    if (subscribers) {
                        subscribers.delete(socketId);
                        if (subscribers.size === 0) {
                            this.analysisSubscribers.delete(analysisId);
                        }
                    }
                });
                this.connections.delete(socketId);
            }
        });
        if (toRemove.length > 0) {
            logger.info('Cleaned up inactive connections', { count: toRemove.length });
        }
    }
    sendToUser(userId, event, data) {
        const userSockets = this.userSockets.get(userId);
        if (!userSockets || userSockets.size === 0) {
            return false;
        }
        let sent = 0;
        userSockets.forEach(socketId => {
            const socket = this.io.sockets.sockets.get(socketId);
            if (socket) {
                socket.emit(event, data);
                sent++;
            }
        });
        return sent > 0;
    }
    broadcastToAll(event, data) {
        let sent = 0;
        this.connections.forEach((connection, socketId) => {
            const socket = this.io.sockets.sockets.get(socketId);
            if (socket) {
                socket.emit(event, data);
                sent++;
            }
        });
        return sent;
    }
}
exports.ProgressTracker = ProgressTracker;
exports.progressTracker = new ProgressTracker();
//# sourceMappingURL=progressTracker.js.map