import { Server as HttpServer } from 'http';
export interface WebSocketMessage {
    type: string;
    data: any;
    timestamp: Date;
    userId?: string;
    analysisId?: string;
}
export interface ProgressUpdate {
    analysisId: string;
    step: string;
    percentage: number;
    message: string;
    estimatedTimeRemaining?: number;
    stage: 'initialization' | 'extraction' | 'processing' | 'analysis' | 'completion' | 'error';
}
export interface AnalysisEvent {
    type: 'analysis_created' | 'analysis_progress' | 'analysis_completed' | 'analysis_failed' | 'analysis_cancelled';
    analysisId: string;
    userId: string;
    data: any;
}
export interface ChangeMonitorEvent {
    type: 'document_change_detected' | 'monitor_status_changed' | 'check_completed';
    monitorId: string;
    userId: string;
    data: any;
}
export declare class WebSocketService {
    private io;
    private connectedUsers;
    private userSockets;
    private analysisSubscriptions;
    private monitorSubscriptions;
    constructor(httpServer: HttpServer);
    private setupMiddleware;
    private setupEventHandlers;
    private trackUserConnection;
    private handleClientDisconnect;
    private cleanupSubscriptions;
    private subscribeToAnalysis;
    private unsubscribeFromAnalysis;
    private subscribeToMonitor;
    private unsubscribeFromMonitor;
    sendToUser(userId: string, eventType: string, data: any): boolean;
    sendAnalysisProgress(analysisId: string, progress: ProgressUpdate): void;
    sendAnalysisEvent(event: AnalysisEvent): void;
    sendChangeMonitorEvent(event: ChangeMonitorEvent): void;
    broadcastSystemNotification(notification: {
        type: 'maintenance' | 'update' | 'alert' | 'info';
        title: string;
        message: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
        targetUsers?: string[];
        expiresAt?: Date;
    }): void;
    getConnectionStats(): {
        totalConnections: number;
        connectedUsers: number;
        analysisSubscriptions: number;
        monitorSubscriptions: number;
        averageConnectionsPerUser: number;
    };
    getUserConnections(userId: string): string[];
    isUserConnected(userId: string): boolean;
    disconnectUser(userId: string, reason?: string): number;
    private getAnalysisStatus;
    shutdown(): Promise<void>;
}
export declare function createWebSocketService(httpServer: HttpServer): WebSocketService;
//# sourceMappingURL=websocketService.d.ts.map