import { ChangeStream, ChangeStreamDocument } from 'mongodb';
import { EventEmitter } from 'events';
interface ChangeStreamConfig {
    collection: string;
    database?: string;
    pipeline?: any[];
    options?: {
        fullDocument?: 'default' | 'updateLookup';
        resumeAfter?: any;
        startAfter?: any;
        startAtOperationTime?: any;
        maxAwaitTimeMS?: number;
        batchSize?: number;
    };
    handler: (change: ChangeStreamDocument) => Promise<void>;
}
interface ChangeStreamInfo {
    id: string;
    collection: string;
    database: string;
    isActive: boolean;
    createdAt: Date;
    lastEventAt?: Date;
    eventCount: number;
    errorCount: number;
    lastError?: string;
}
declare class MongoChangeStreamService extends EventEmitter {
    private client;
    private db;
    private changeStreams;
    private streamConfigs;
    private streamInfo;
    private initialized;
    private reconnectTimeout;
    private heartbeatInterval;
    constructor();
    initialize(): Promise<void>;
    private connect;
    private extractDatabaseName;
    createChangeStream(streamId: string, config: ChangeStreamConfig): Promise<ChangeStream>;
    private setupChangeStreamHandlers;
    private convertChangeEvent;
    private restartChangeStream;
    closeChangeStream(streamId: string): Promise<boolean>;
    pauseChangeStream(streamId: string): Promise<boolean>;
    resumeChangeStream(streamId: string): Promise<boolean>;
    getChangeStreamInfo(streamId: string): ChangeStreamInfo | undefined;
    getAllChangeStreamInfo(): ChangeStreamInfo[];
    getActiveChangeStreams(): string[];
    createDocumentMonitoringStream(): Promise<ChangeStream>;
    createUserActivityStream(): Promise<ChangeStream>;
    createAuditLogStream(): Promise<ChangeStream>;
    private handleConnectionLoss;
    private handleConnectionError;
    private handleReconnection;
    private scheduleReconnection;
    private startHeartbeat;
    private stopHeartbeat;
    getConnectionStats(): {
        connected: boolean;
        database: string | null;
        activeStreams: number;
        totalEvents: number;
        totalErrors: number;
    };
    healthCheck(): Promise<void>;
    shutdown(): Promise<void>;
}
export declare const mongoChangeStreamService: MongoChangeStreamService;
export {};
//# sourceMappingURL=mongoChangeStream.d.ts.map