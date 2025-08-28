import { Server as HttpServer } from 'http';
import { AnalysisProgressMessage, AnalysisCompleteMessage, DocumentChangeMessage, NotificationMessage, SystemAlertMessage, UserPresenceMessage, QueueStatsMessage } from '@fineprintai/shared-types';
import { MessageQueueService } from './messageQueueService';
import { MetricsService } from './metricsService';
export interface WebSocketServiceConfig {
    port: number;
    path: string;
    cors: {
        origin: string[];
        credentials: boolean;
    };
    auth: {
        required: boolean;
        timeout: number;
    };
    heartbeat: {
        interval: number;
        timeout: number;
    };
    maxConnections: number;
    rateLimiting: {
        maxRequests: number;
        window: number;
    };
    redis: {
        host: string;
        port: number;
        password?: string;
        db?: number;
    };
}
export declare class WebSocketService {
    private io;
    private pubClient;
    private subClient;
    private connectionManager;
    private rateLimiter;
    private authService;
    private messageQueue;
    private metrics;
    private heartbeatInterval;
    private cleanupInterval;
    private initialized;
    constructor(httpServer: HttpServer, messageQueue: MessageQueueService, metrics: MetricsService);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    private initializeRedisAdapter;
    private setupSocketEventHandlers;
    private handleConnection;
    private setupSocketHandlers;
    private handleDisconnection;
    sendAnalysisProgress(message: AnalysisProgressMessage): Promise<void>;
    sendAnalysisComplete(message: AnalysisCompleteMessage): Promise<void>;
    sendDocumentChange(message: DocumentChangeMessage): Promise<void>;
    sendNotification(userId: string, message: NotificationMessage): Promise<void>;
    sendSystemAlert(message: SystemAlertMessage, targetUsers?: string[]): Promise<void>;
    sendUserPresence(message: UserPresenceMessage, targetUsers?: string[]): Promise<void>;
    sendQueueStats(message: QueueStatsMessage): Promise<void>;
    getConnectionStats(): {
        totalConnections: number;
        uniqueUsers: number;
        averageConnectionsPerUser: number;
        connectionsByRoom: Record<string, number>;
    };
    getUserConnectionInfo(userId: string): {
        isConnected: boolean;
        connectionCount: number;
        connections: Array<{
            socketId: string;
            connectedAt: Date;
            lastActivity: Date;
        }>;
    };
    getHealthStatus(): Promise<{
        healthy: boolean;
        redis: boolean;
        connections: number;
        memory: NodeJS.MemoryUsage;
        uptime: number;
    }>;
    private extractClientInfo;
    private isValidChannel;
    private sendQueuedMessages;
    private updateUserPresence;
    private handleCustomMessage;
    private getAnalysisStatus;
    private getQueueStats;
    private getAnalysisInfo;
    private getDocumentUsers;
    private getUserTeam;
    private checkRedisHealth;
    private startHeartbeat;
    private startCleanupTask;
}
declare module 'socket.io' {
    interface Socket {
        userId: string;
        userEmail: string;
        userName: string;
        teamId?: string;
        isAdmin?: boolean;
    }
}
//# sourceMappingURL=websocketService.d.ts.map