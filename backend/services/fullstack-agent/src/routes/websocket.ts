import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { Logger } from '@/utils/logger';
import { WebSocketMessage, MessageType } from '@/types';

const logger = Logger.getInstance();

// WebSocket connection manager
class WebSocketManager extends EventEmitter {
  private connections: Map<string, WebSocket> = new Map();
  private userConnections: Map<string, Set<string>> = new Map();

  addConnection(connectionId: string, userId: string, ws: WebSocket): void {
    this.connections.set(connectionId, ws);
    
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(connectionId);

    logger.info('WebSocket connection added', { connectionId, userId });
  }

  removeConnection(connectionId: string, userId: string): void {
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

  sendToConnection(connectionId: string, message: WebSocketMessage): void {
    const ws = this.connections.get(connectionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendToUser(userId: string, message: WebSocketMessage): void {
    const userConnections = this.userConnections.get(userId);
    if (userConnections) {
      userConnections.forEach(connectionId => {
        this.sendToConnection(connectionId, message);
      });
    }
  }

  broadcast(message: WebSocketMessage): void {
    this.connections.forEach((ws, connectionId) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getUserConnectionCount(userId: string): number {
    return this.userConnections.get(userId)?.size || 0;
  }
}

const wsManager = new WebSocketManager();

export default async function websocketRoutes(fastify: FastifyInstance): Promise<void> {
  
  /**
   * WebSocket endpoint for real-time updates
   */
  fastify.get('/ws', { websocket: true }, async (connection, request) => {
    const connectionId = generateConnectionId();
    const userId = await getUserIdFromRequest(request);
    
    logger.info('WebSocket connection established', { 
      connectionId, 
      userId,
      ip: request.ip,
    });

    // Add connection to manager
    wsManager.addConnection(connectionId, userId, connection.socket);

    // Send welcome message
    const welcomeMessage: WebSocketMessage = {
      type: MessageType.PING,
      payload: {
        message: 'Connected to Full-Stack Development Agent',
        connectionId,
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date(),
    };
    connection.socket.send(JSON.stringify(welcomeMessage));

    // Handle incoming messages
    connection.socket.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        
        logger.debug('WebSocket message received', {
          connectionId,
          userId,
          type: message.type,
        });

        await handleWebSocketMessage(connectionId, userId, message, connection.socket);
      } catch (error) {
        logger.error('WebSocket message handling failed', {
          connectionId,
          userId,
          error: error.message,
        });

        const errorMessage: WebSocketMessage = {
          type: MessageType.ERROR,
          payload: {
            error: 'Invalid message format',
            timestamp: new Date().toISOString(),
          },
          timestamp: new Date(),
        };
        connection.socket.send(JSON.stringify(errorMessage));
      }
    });

    // Handle connection close
    connection.socket.on('close', (code: number, reason: Buffer) => {
      logger.info('WebSocket connection closed', {
        connectionId,
        userId,
        code,
        reason: reason.toString(),
      });

      wsManager.removeConnection(connectionId, userId);
    });

    // Handle connection error
    connection.socket.on('error', (error: Error) => {
      logger.error('WebSocket connection error', {
        connectionId,
        userId,
        error: error.message,
      });

      wsManager.removeConnection(connectionId, userId);
    });

    // Setup periodic ping
    const pingInterval = setInterval(() => {
      if (connection.socket.readyState === WebSocket.OPEN) {
        const pingMessage: WebSocketMessage = {
          type: MessageType.PING,
          payload: { timestamp: new Date().toISOString() },
          timestamp: new Date(),
        };
        connection.socket.send(JSON.stringify(pingMessage));
      } else {
        clearInterval(pingInterval);
      }
    }, 30000); // 30 seconds
  });

  /**
   * WebSocket metrics endpoint
   */
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

// Message handlers
async function handleWebSocketMessage(
  connectionId: string,
  userId: string,
  message: WebSocketMessage,
  ws: WebSocket
): Promise<void> {
  switch (message.type) {
    case MessageType.PING:
      await handlePingMessage(connectionId, userId, message, ws);
      break;
    
    case MessageType.GENERATION_PROGRESS:
      // This would be sent from code generation service
      break;
    
    case MessageType.GENERATION_COMPLETE:
      // This would be sent from code generation service
      break;
    
    case MessageType.DECISION_UPDATE:
      // This would be sent from architecture decision service
      break;
    
    case MessageType.QUALITY_CHECK_RESULT:
      // This would be sent from quality assurance service
      break;
    
    case MessageType.INTEGRATION_STATUS:
      // This would be sent from integration manager
      break;
    
    case MessageType.WORKFLOW_UPDATE:
      // This would be sent from workflow engine
      break;
    
    default:
      logger.warn('Unknown WebSocket message type', {
        connectionId,
        userId,
        type: message.type,
      });

      const errorResponse: WebSocketMessage = {
        type: MessageType.ERROR,
        payload: {
          error: `Unknown message type: ${message.type}`,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date(),
      };
      ws.send(JSON.stringify(errorResponse));
  }
}

async function handlePingMessage(
  connectionId: string,
  userId: string,
  message: WebSocketMessage,
  ws: WebSocket
): Promise<void> {
  const pongMessage: WebSocketMessage = {
    type: MessageType.PONG,
    payload: {
      timestamp: new Date().toISOString(),
      requestId: message.requestId,
    },
    timestamp: new Date(),
  };

  ws.send(JSON.stringify(pongMessage));
}

// Utility functions
function generateConnectionId(): string {
  return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function getUserIdFromRequest(request: FastifyRequest): Promise<string> {
  try {
    // Extract user ID from query params or headers
    const token = request.query?.token as string || 
                  request.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      // Verify token and extract user ID
      // This would use the same JWT verification as REST endpoints
      const decoded = (request.server as any).jwt.verify(token);
      return decoded.id || 'anonymous';
    }
    
    return 'anonymous';
  } catch (error) {
    logger.warn('Failed to extract user ID from WebSocket request', { error: error.message });
    return 'anonymous';
  }
}

// Export WebSocket manager for use in other services
export { wsManager as WebSocketManager };

// Service integration functions
export function notifyCodeGenerationProgress(
  userId: string,
  requestId: string,
  progress: number,
  status: string
): void {
  const message: WebSocketMessage = {
    type: MessageType.GENERATION_PROGRESS,
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

export function notifyCodeGenerationComplete(
  userId: string,
  requestId: string,
  result: any
): void {
  const message: WebSocketMessage = {
    type: MessageType.GENERATION_COMPLETE,
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

export function notifyArchitectureDecisionUpdate(
  userId: string,
  requestId: string,
  update: any
): void {
  const message: WebSocketMessage = {
    type: MessageType.DECISION_UPDATE,
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

export function notifyQualityCheckResult(
  userId: string,
  requestId: string,
  result: any
): void {
  const message: WebSocketMessage = {
    type: MessageType.QUALITY_CHECK_RESULT,
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

export function notifyIntegrationStatus(
  userId: string,
  integrationType: string,
  status: any
): void {
  const message: WebSocketMessage = {
    type: MessageType.INTEGRATION_STATUS,
    payload: {
      integrationType,
      status,
      timestamp: new Date().toISOString(),
    },
    timestamp: new Date(),
  };

  wsManager.sendToUser(userId, message);
}

export function broadcastSystemAlert(alert: any): void {
  const message: WebSocketMessage = {
    type: MessageType.ERROR,
    payload: {
      alert,
      timestamp: new Date().toISOString(),
    },
    timestamp: new Date(),
  };

  wsManager.broadcast(message);
}