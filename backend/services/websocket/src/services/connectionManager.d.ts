import { Socket } from 'socket.io';
import { WebSocketClient } from '@fineprintai/shared-types';
export interface ConnectionStats {
    totalConnections: number;
    uniqueUsers: number;
    averageConnectionsPerUser: number;
    connectionsByRoom: Record<string, number>;
}
export interface UserConnectionInfo {
    isConnected: boolean;
    connectionCount: number;
    connections: Array<{
        socketId: string;
        connectedAt: Date;
        lastActivity: Date;
        userAgent?: string;
        ip?: string;
    }>;
}
export declare class ConnectionManager {
    private connections;
    private userConnections;
    private socketToUser;
    private initialized;
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    addConnection(socket: Socket): Promise<void>;
    removeConnection(socketId: string): void;
    updateActivity(socketId: string): void;
    addSubscription(socketId: string, channel: string): void;
    removeSubscription(socketId: string, channel: string): void;
    isUserOnline(userId: string): boolean;
    getUserConnections(userId: string): WebSocketClient[];
    getConnection(socketId: string): WebSocketClient | undefined;
    getUserIdFromSocket(socketId: string): string | undefined;
    getConnectionCount(): number;
    getUniqueUserCount(): number;
    getStats(): ConnectionStats;
    getUserInfo(userId: string): UserConnectionInfo;
    getConnectionsByTeam(teamId: string): WebSocketClient[];
    getConnectionsBySubscription(channel: string): WebSocketClient[];
    cleanupInactive(thresholdMinutes?: number): number;
    getDetailedStats(): Promise<{
        connections: ConnectionStats;
        users: Array<{
            userId: string;
            connectionCount: number;
            lastActivity: Date;
            teamId?: string;
            subscriptions: string[];
        }>;
        teams: Record<string, number>;
        subscriptions: Record<string, number>;
    }>;
    private persistConnectionInfo;
    private removePersistedConnection;
    private loadPersistedConnections;
    private persistConnections;
}
//# sourceMappingURL=connectionManager.d.ts.map