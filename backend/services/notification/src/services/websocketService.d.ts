import { Server as HttpServer } from 'http';
export interface WebSocketUser {
    userId: string;
    socketId: string;
    connectedAt: Date;
    lastActivity: Date;
}
export interface NotificationUpdate {
    notificationId: string;
    status: string;
    progress?: {
        total: number;
        sent: number;
        delivered: number;
        failed: number;
    };
    delivery?: {
        channel: string;
        status: string;
        timestamp: Date;
    };
}
export interface UserEngagementEvent {
    userId: string;
    event: 'notification_received' | 'notification_read' | 'notification_clicked';
    notificationId: string;
    timestamp: Date;
    metadata?: any;
}
export declare class WebSocketService {
    private io;
    private connectedUsers;
    private userSockets;
    private initialized;
    constructor(httpServer: HttpServer);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    private setupEventHandlers;
    private handleConnection;
    private setupSocketEventHandlers;
    private handleDisconnection;
    private updateUserActivity;
    sendNotificationUpdate(userId: string, update: NotificationUpdate): Promise<void>;
    sendNewNotification(userId: string, notification: {
        id: string;
        type: string;
        title: string;
        message: string;
        data?: any;
        actionUrl?: string;
        createdAt: Date;
    }): Promise<void>;
    sendBulkNotificationUpdate(userIds: string[], update: NotificationUpdate): Promise<void>;
    sendSystemNotification(message: {
        type: 'maintenance' | 'alert' | 'info';
        title: string;
        message: string;
        targetUsers?: string[];
    }): Promise<void>;
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
    private sendUnreadNotificationsCount;
    private getUnreadNotificationsCount;
    private getUserNotifications;
    private handleNotificationRead;
    private handleNotificationClick;
    cleanupInactiveConnections(inactiveThresholdMinutes?: number): number;
}
export declare function createWebSocketService(httpServer: HttpServer): WebSocketService;
declare module 'socket.io' {
    interface Socket {
        userId: string;
        userEmail: string;
        userName: string;
    }
}
//# sourceMappingURL=websocketService.d.ts.map