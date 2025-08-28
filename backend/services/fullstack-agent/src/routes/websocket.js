"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketManager = void 0;
exports.default = websocketRoutes;
exports.notifyCodeGenerationProgress = notifyCodeGenerationProgress;
exports.notifyCodeGenerationComplete = notifyCodeGenerationComplete;
exports.notifyArchitectureDecisionUpdate = notifyArchitectureDecisionUpdate;
exports.notifyQualityCheckResult = notifyQualityCheckResult;
exports.notifyIntegrationStatus = notifyIntegrationStatus;
exports.broadcastSystemAlert = broadcastSystemAlert;
const ws_1 = require("ws");
const events_1 = require("events");
const logger_1 = require("@/utils/logger");
const types_1 = require("@/types");
const logger = logger_1.Logger.getInstance();
class WebSocketManager extends events_1.EventEmitter {
    connections = new Map();
    userConnections = new Map();
    addConnection(connectionId, userId, ws) {
        this.connections.set(connectionId, ws);
        if (!this.userConnections.has(userId)) {
            this.userConnections.set(userId, new Set());
        }
        this.userConnections.get(userId).add(connectionId);
        logger.info('WebSocket connection added', { connectionId, userId });
    }
    removeConnection(connectionId, userId) {
        this.connections.delete(connectionId);
        const userConnections = this.userConnections.get(userId);
        if (userConnections) {
            userConnections.delete(connectionId);
            if (userConnections.size === 0) {
                this.userConnections.delete(userId);
            }
        }
        logger.info('WebSocket connection removed', { connectionId, userId });
    }
    sendToConnection(connectionId, message) {
        const ws = this.connections.get(connectionId);
        if (ws && ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }
    sendToUser(userId, message) {
        const userConnections = this.userConnections.get(userId);
        if (userConnections) {
            userConnections.forEach(connectionId => {
                this.sendToConnection(connectionId, message);
            });
        }
    }
    broadcast(message) {
        this.connections.forEach((ws, connectionId) => {
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                ws.send(JSON.stringify(message));
            }
        });
    }
    getConnectionCount() {
        return this.connections.size;
    }
    getUserConnectionCount(userId) {
        return this.userConnections.get(userId)?.size || 0;
    }
}
const wsManager = new WebSocketManager();
exports.WebSocketManager = wsManager;
async function websocketRoutes(fastify) {
    fastify.get('/ws', { websocket: true }, async (connection, request) => {
        const connectionId = generateConnectionId();
        const userId = await getUserIdFromRequest(request);
        logger.info('WebSocket connection established', {
            connectionId,
            userId,
            ip: request.ip,
        });
        wsManager.addConnection(connectionId, userId, connection.socket);
        const welcomeMessage = {
            type: types_1.MessageType.PING,
            payload: {
                message: 'Connected to Full-Stack Development Agent',
                connectionId,
                timestamp: new Date().toISOString(),
            },
            timestamp: new Date(),
        };
        connection.socket.send(JSON.stringify(welcomeMessage));
        connection.socket.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                logger.debug('WebSocket message received', {
                    connectionId,
                    userId,
                    type: message.type,
                });
                await handleWebSocketMessage(connectionId, userId, message, connection.socket);
            }
            catch (error) {
                logger.error('WebSocket message handling failed', {
                    connectionId,
                    userId,
                    error: error.message,
                });
                const errorMessage = {
                    type: types_1.MessageType.ERROR,
                    payload: {
                        error: 'Invalid message format',
                        timestamp: new Date().toISOString(),
                    },
                    timestamp: new Date(),
                };
                connection.socket.send(JSON.stringify(errorMessage));
            }
        });
        connection.socket.on('close', (code, reason) => {
            logger.info('WebSocket connection closed', {
                connectionId,
                userId,
                code,
                reason: reason.toString(),
            });
            wsManager.removeConnection(connectionId, userId);
        });
        connection.socket.on('error', (error) => {
            logger.error('WebSocket connection error', {
                connectionId,
                userId,
                error: error.message,
            });
            wsManager.removeConnection(connectionId, userId);
        });
        const pingInterval = setInterval(() => {
            if (connection.socket.readyState === ws_1.WebSocket.OPEN) {
                const pingMessage = {
                    type: types_1.MessageType.PING,
                    payload: { timestamp: new Date().toISOString() },
                    timestamp: new Date(),
                };
                connection.socket.send(JSON.stringify(pingMessage));
            }
            else {
                clearInterval(pingInterval);
            }
        }, 30000);
    });
    fastify.get('/ws/metrics', {
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        return {
            success: true,
            data: {
                totalConnections: wsManager.getConnectionCount(),
                userConnections: wsManager.getUserConnectionCount(request.user?.id || ''),
                timestamp: new Date().toISOString(),
            },
        };
    });
}
async function handleWebSocketMessage(connectionId, userId, message, ws) {
    switch (message.type) {
        case types_1.MessageType.PING:
            await handlePingMessage(connectionId, userId, message, ws);
            break;
        case types_1.MessageType.GENERATION_PROGRESS:
            break;
        case types_1.MessageType.GENERATION_COMPLETE:
            break;
        case types_1.MessageType.DECISION_UPDATE:
            break;
        case types_1.MessageType.QUALITY_CHECK_RESULT:
            break;
        case types_1.MessageType.INTEGRATION_STATUS:
            break;
        case types_1.MessageType.WORKFLOW_UPDATE:
            break;
        default:
            logger.warn('Unknown WebSocket message type', {
                connectionId,
                userId,
                type: message.type,
            });
            const errorResponse = {
                type: types_1.MessageType.ERROR,
                payload: {
                    error: `Unknown message type: ${message.type}`,
                    timestamp: new Date().toISOString(),
                },
                timestamp: new Date(),
            };
            ws.send(JSON.stringify(errorResponse));
    }
}
async function handlePingMessage(connectionId, userId, message, ws) {
    const pongMessage = {
        type: types_1.MessageType.PONG,
        payload: {
            timestamp: new Date().toISOString(),
            requestId: message.requestId,
        },
        timestamp: new Date(),
    };
    ws.send(JSON.stringify(pongMessage));
}
function generateConnectionId() {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
async function getUserIdFromRequest(request) {
    try {
        const token = request.query?.token ||
            request.headers.authorization?.replace('Bearer ', '');
        if (token) {
            const decoded = request.server.jwt.verify(token);
            return decoded.id || 'anonymous';
        }
        return 'anonymous';
    }
    catch (error) {
        logger.warn('Failed to extract user ID from WebSocket request', { error: error.message });
        return 'anonymous';
    }
}
function notifyCodeGenerationProgress(userId, requestId, progress, status) {
    const message = {
        type: types_1.MessageType.GENERATION_PROGRESS,
        payload: {
            requestId,
            progress,
            status,
            timestamp: new Date().toISOString(),
        },
        timestamp: new Date(),
        requestId,
    };
    wsManager.sendToUser(userId, message);
}
function notifyCodeGenerationComplete(userId, requestId, result) {
    const message = {
        type: types_1.MessageType.GENERATION_COMPLETE,
        payload: {
            requestId,
            result,
            timestamp: new Date().toISOString(),
        },
        timestamp: new Date(),
        requestId,
    };
    wsManager.sendToUser(userId, message);
}
function notifyArchitectureDecisionUpdate(userId, requestId, update) {
    const message = {
        type: types_1.MessageType.DECISION_UPDATE,
        payload: {
            requestId,
            update,
            timestamp: new Date().toISOString(),
        },
        timestamp: new Date(),
        requestId,
    };
    wsManager.sendToUser(userId, message);
}
function notifyQualityCheckResult(userId, requestId, result) {
    const message = {
        type: types_1.MessageType.QUALITY_CHECK_RESULT,
        payload: {
            requestId,
            result,
            timestamp: new Date().toISOString(),
        },
        timestamp: new Date(),
        requestId,
    };
    wsManager.sendToUser(userId, message);
}
function notifyIntegrationStatus(userId, integrationType, status) {
    const message = {
        type: types_1.MessageType.INTEGRATION_STATUS,
        payload: {
            integrationType,
            status,
            timestamp: new Date().toISOString(),
        },
        timestamp: new Date(),
    };
    wsManager.sendToUser(userId, message);
}
function broadcastSystemAlert(alert) {
    const message = {
        type: types_1.MessageType.ERROR,
        payload: {
            alert,
            timestamp: new Date().toISOString(),
        },
        timestamp: new Date(),
    };
    wsManager.broadcast(message);
}
//# sourceMappingURL=websocket.js.map