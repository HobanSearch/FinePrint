import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { WebSocketMessage } from '@/types';
declare class WebSocketManager extends EventEmitter {
    private connections;
    private userConnections;
    addConnection(connectionId: string, userId: string, ws: WebSocket): void;
    removeConnection(connectionId: string, userId: string): void;
    sendToConnection(connectionId: string, message: WebSocketMessage): void;
    sendToUser(userId: string, message: WebSocketMessage): void;
    broadcast(message: WebSocketMessage): void;
    getConnectionCount(): number;
    getUserConnectionCount(userId: string): number;
}
declare const wsManager: WebSocketManager;
export default function websocketRoutes(fastify: FastifyInstance): Promise<void>;
export { wsManager as WebSocketManager };
export declare function notifyCodeGenerationProgress(userId: string, requestId: string, progress: number, status: string): void;
export declare function notifyCodeGenerationComplete(userId: string, requestId: string, result: any): void;
export declare function notifyArchitectureDecisionUpdate(userId: string, requestId: string, update: any): void;
export declare function notifyQualityCheckResult(userId: string, requestId: string, result: any): void;
export declare function notifyIntegrationStatus(userId: string, integrationType: string, status: any): void;
export declare function broadcastSystemAlert(alert: any): void;
//# sourceMappingURL=websocket.d.ts.map