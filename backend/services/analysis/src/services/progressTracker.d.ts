import { EventEmitter } from 'events';
export interface ProgressUpdate {
    analysisId: string;
    jobId?: string;
    userId: string;
    step: string;
    percentage: number;
    message: string;
    timestamp: Date;
    estimatedTimeRemaining?: number;
    currentOperation?: string;
    metadata?: {
        [key: string]: any;
    };
}
export interface ConnectionInfo {
    socketId: string;
    userId: string;
    connectedAt: Date;
    subscribedAnalyses: string[];
    lastActivity: Date;
}
export declare class ProgressTracker extends EventEmitter {
    private io;
    private httpServer;
    private connections;
    private analysisSubscribers;
    private userSockets;
    private port;
    private isStarted;
    private activeAnalyses;
    private analysisHistory;
    constructor(port?: number);
    start(): Promise<void>;
    stop(): Promise<void>;
    broadcastProgress(progress: ProgressUpdate): void;
    broadcastAnalysisComplete(analysisId: string, result: any): void;
    broadcastAnalysisError(analysisId: string, error: string): void;
    getAnalysisProgress(analysisId: string): ProgressUpdate | null;
    getAnalysisHistory(analysisId: string): ProgressUpdate[];
    getStats(): {
        totalConnections: number;
        activeAnalyses: number;
        totalSubscriptions: number;
        connectionsPerUser: {
            [userId: string]: number;
        };
    };
    private setupHealthEndpoint;
    private setupSocketHandlers;
    private setupQueueListeners;
    private startCleanupTasks;
    private cleanupOldHistory;
    private cleanupInactiveConnections;
    sendToUser(userId: string, event: string, data: any): boolean;
    broadcastToAll(event: string, data: any): number;
}
export declare const progressTracker: ProgressTracker;
//# sourceMappingURL=progressTracker.d.ts.map