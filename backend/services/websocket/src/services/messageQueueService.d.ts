import { WebSocketMessage } from '@fineprintai/shared-types';
export interface QueuedMessage extends WebSocketMessage {
    userId: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    expiresAt?: Date;
    retries?: number;
    metadata?: {
        queuedAt: Date;
        attempts: number;
        lastAttempt?: Date;
        failureReason?: string;
    };
}
export interface QueueStats {
    name: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: boolean;
}
export interface MessageDeliveryOptions {
    priority?: 'low' | 'medium' | 'high' | 'critical';
    delay?: number;
    attempts?: number;
    backoff?: 'exponential' | 'fixed';
    removeOnComplete?: number;
    removeOnFail?: number;
    ttl?: number;
}
export declare class MessageQueueService {
    private messageQueue;
    private deliveryQueue;
    private deadLetterQueue;
    private initialized;
    private readonly MAX_MESSAGE_SIZE;
    private readonly MAX_QUEUE_SIZE;
    private readonly DEFAULT_TTL;
    constructor();
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    queueMessage(userId: string, message: WebSocketMessage, options?: MessageDeliveryOptions): Promise<string>;
    queueBulkMessages(messages: Array<{
        userId: string;
        message: WebSocketMessage;
        options?: MessageDeliveryOptions;
    }>): Promise<string[]>;
    getQueuedMessages(userId: string, limit?: number): Promise<QueuedMessage[]>;
    clearQueuedMessages(userId: string): Promise<number>;
    getUserQueueSize(userId: string): Promise<number>;
    getQueueStats(): Promise<QueueStats[]>;
    getDetailedStats(): Promise<{
        queues: QueueStats[];
        users: Array<{
            userId: string;
            queueSize: number;
            oldestMessage?: Date;
            newestMessage?: Date;
        }>;
        totalMessages: number;
        messageTypes: Record<string, number>;
    }>;
    getHealthStatus(): Promise<{
        healthy: boolean;
        details?: any;
    }>;
    private setupQueueProcessors;
    private setupQueueEventHandlers;
    private startQueueMonitoring;
    private startCleanupJob;
    private cleanupExpiredMessages;
    private removeOldestMessages;
    private getPriorityValue;
}
//# sourceMappingURL=messageQueueService.d.ts.map