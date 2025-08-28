export interface WebSocketMessage {
    type: string;
    payload: any;
    timestamp: Date;
    id?: string;
}
export interface WebSocketResponse {
    type: string;
    payload: any;
    timestamp: Date;
    id?: string;
    error?: string;
}
export interface AnalysisProgressMessage extends WebSocketMessage {
    type: 'analysis_progress';
    payload: {
        analysisId: string;
        stage: string;
        percentage: number;
        message?: string;
    };
}
export interface AnalysisCompleteMessage extends WebSocketMessage {
    type: 'analysis_complete';
    payload: {
        analysisId: string;
        documentId: string;
        overallRiskScore: number;
        keyFindings: string[];
    };
}
export interface DocumentChangeMessage extends WebSocketMessage {
    type: 'document_change';
    payload: {
        documentId: string;
        title: string;
        changeType: 'minor' | 'major' | 'structural';
        changeSummary: string;
        riskChange: number;
    };
}
export interface NotificationMessage extends WebSocketMessage {
    type: 'notification';
    payload: {
        id: string;
        title: string;
        message: string;
        actionUrl?: string;
        severity?: 'low' | 'medium' | 'high' | 'critical';
    };
}
export interface SystemAlertMessage extends WebSocketMessage {
    type: 'system_alert';
    payload: {
        severity: 'info' | 'warning' | 'error';
        title: string;
        message: string;
        timestamp: Date;
    };
}
export interface UserPresenceMessage extends WebSocketMessage {
    type: 'user_presence';
    payload: {
        userId: string;
        status: 'online' | 'offline' | 'away';
        lastSeen?: Date;
    };
}
export interface QueueStatsMessage extends WebSocketMessage {
    type: 'queue_stats';
    payload: {
        queueName: string;
        waiting: number;
        active: number;
        completed: number;
        failed: number;
    };
}
export interface WebSocketClient {
    id: string;
    userId: string;
    teamId?: string;
    connectedAt: Date;
    lastActivity: Date;
    subscriptions: string[];
}
export interface SubscriptionRequest {
    type: 'subscribe' | 'unsubscribe';
    channels: string[];
}
export interface RoomConfig {
    name: string;
    maxClients?: number;
    requireAuth?: boolean;
    permissions?: string[];
}
export type ClientEventType = 'subscribe' | 'unsubscribe' | 'ping' | 'request_analysis_status' | 'request_queue_stats';
export type ServerEventType = 'analysis_progress' | 'analysis_complete' | 'document_change' | 'notification' | 'system_alert' | 'user_presence' | 'queue_stats' | 'pong' | 'error';
export interface WebSocketConfig {
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
}
//# sourceMappingURL=websocket.d.ts.map