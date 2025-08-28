/**
 * WebSocket Service for Real-time Business Agent Updates
 */

import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { AgentType, WSMessage } from '../types';
import { performanceService } from './performance.service';
import { createLogger } from '../utils/logger';
import { config } from '../config';

const logger = createLogger('websocket-service');

interface WSClient {
  id: string;
  ws: WebSocket;
  subscribedAgents: Set<AgentType>;
  userId?: string;
  isAlive: boolean;
}

export class WebSocketService {
  private clients: Map<string, WSClient> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  async initialize(fastify: FastifyInstance): Promise<void> {
    // Register WebSocket support
    await fastify.register(require('@fastify/websocket'));

    // Register WebSocket route
    fastify.register(async function (fastify) {
      fastify.get('/ws/agents', { websocket: true }, (connection, req) => {
        this.handleConnection(connection, req);
      });
    });

    // Start ping interval to keep connections alive
    this.startPingInterval();

    // Subscribe to performance metrics
    this.subscribeToMetrics();

    logger.info('WebSocket service initialized');
  }

  private handleConnection(connection: any, req: any): void {
    const ws = connection.socket as WebSocket;
    const clientId = uuidv4();
    
    const client: WSClient = {
      id: clientId,
      ws,
      subscribedAgents: new Set(),
      userId: req.headers['x-user-id'],
      isAlive: true
    };

    this.clients.set(clientId, client);

    logger.info({
      clientId,
      userId: client.userId,
      msg: 'WebSocket client connected'
    });

    // Send connection confirmation
    this.sendToClient(client, {
      type: 'connection',
      data: {
        clientId,
        connected: true,
        availableAgents: Object.values(AgentType)
      },
      timestamp: new Date()
    });

    // Handle messages from client
    ws.on('message', (message: Buffer) => {
      this.handleMessage(client, message);
    });

    // Handle pong responses
    ws.on('pong', () => {
      client.isAlive = true;
    });

    // Handle client disconnect
    ws.on('close', () => {
      this.handleDisconnect(clientId);
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error({
        clientId,
        error: error.message,
        msg: 'WebSocket error'
      });
    });
  }

  private handleMessage(client: WSClient, message: Buffer): void {
    try {
      const data = JSON.parse(message.toString());

      switch (data.type) {
        case 'subscribe':
          this.handleSubscribe(client, data.agents);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(client, data.agents);
          break;
        case 'ping':
          this.sendToClient(client, {
            type: 'agent_update',
            data: { pong: true },
            timestamp: new Date()
          });
          break;
        default:
          logger.warn({
            clientId: client.id,
            type: data.type,
            msg: 'Unknown message type'
          });
      }
    } catch (error) {
      logger.error({
        clientId: client.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        msg: 'Failed to handle message'
      });
    }
  }

  private handleSubscribe(client: WSClient, agents: AgentType[]): void {
    agents.forEach(agent => {
      client.subscribedAgents.add(agent);
    });

    logger.info({
      clientId: client.id,
      agents,
      msg: 'Client subscribed to agents'
    });

    // Send current metrics for subscribed agents
    agents.forEach(agent => {
      const metrics = performanceService.getMetrics(agent);
      this.sendToClient(client, {
        type: 'performance_metric',
        agentType: agent,
        data: metrics,
        timestamp: new Date()
      });
    });
  }

  private handleUnsubscribe(client: WSClient, agents: AgentType[]): void {
    agents.forEach(agent => {
      client.subscribedAgents.delete(agent);
    });

    logger.info({
      clientId: client.id,
      agents,
      msg: 'Client unsubscribed from agents'
    });
  }

  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      logger.info({
        clientId,
        userId: client.userId,
        msg: 'WebSocket client disconnected'
      });
    }
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      this.clients.forEach((client) => {
        if (!client.isAlive) {
          client.ws.terminate();
          this.clients.delete(client.id);
          logger.info({
            clientId: client.id,
            msg: 'Terminated inactive WebSocket client'
          });
          return;
        }

        client.isAlive = false;
        client.ws.ping();
      });
    }, config.websocket.pingInterval);
  }

  private subscribeToMetrics(): void {
    // Subscribe to performance metrics
    performanceService.on('metrics', (metrics) => {
      this.broadcast({
        type: 'performance_metric',
        agentType: metrics.agentType,
        data: metrics,
        timestamp: new Date()
      }, metrics.agentType);
    });
  }

  private sendToClient(client: WSClient, message: WSMessage): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error({
          clientId: client.id,
          error: error instanceof Error ? error.message : 'Unknown error',
          msg: 'Failed to send message to client'
        });
      }
    }
  }

  broadcast(message: WSMessage, agentType?: AgentType): void {
    let targetClients = Array.from(this.clients.values());

    // Filter by agent subscription if specified
    if (agentType) {
      targetClients = targetClients.filter(client => 
        client.subscribedAgents.has(agentType)
      );
    }

    targetClients.forEach(client => {
      this.sendToClient(client, message);
    });

    if (targetClients.length > 0) {
      logger.debug({
        clientCount: targetClients.length,
        agentType,
        messageType: message.type,
        msg: 'Broadcast message sent'
      });
    }
  }

  broadcastAgentUpdate(agentType: AgentType, data: any): void {
    this.broadcast({
      type: 'agent_update',
      agentType,
      data,
      timestamp: new Date()
    }, agentType);
  }

  broadcastTestResult(agentType: AgentType, result: any): void {
    this.broadcast({
      type: 'test_result',
      agentType,
      data: result,
      timestamp: new Date()
    }, agentType);
  }

  broadcastError(agentType: AgentType, error: any): void {
    this.broadcast({
      type: 'error',
      agentType,
      data: {
        error: error.message || 'Unknown error',
        details: error
      },
      timestamp: new Date()
    }, agentType);
  }

  getConnectionStats(): {
    totalConnections: number;
    activeConnections: number;
    subscriptions: Record<AgentType, number>;
  } {
    const subscriptions: Record<AgentType, number> = {} as any;

    for (const agentType of Object.values(AgentType)) {
      subscriptions[agentType] = 0;
    }

    this.clients.forEach(client => {
      client.subscribedAgents.forEach(agent => {
        subscriptions[agent]++;
      });
    });

    return {
      totalConnections: this.clients.size,
      activeConnections: Array.from(this.clients.values()).filter(c => c.isAlive).length,
      subscriptions
    };
  }

  stop(): void {
    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Close all connections
    this.clients.forEach(client => {
      client.ws.close(1000, 'Server shutting down');
    });

    this.clients.clear();
    logger.info('WebSocket service stopped');
  }
}

export const websocketService = new WebSocketService();