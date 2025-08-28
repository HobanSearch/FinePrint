import { WebSocketService } from './services/websocketService';
import { MessageQueueService } from './services/messageQueueService';
import { MetricsService } from './services/metricsService';
declare let wsService: WebSocketService;
declare let messageQueueService: MessageQueueService;
declare let metricsService: MetricsService;
export declare function getHealthStatus(): Promise<{
    healthy: boolean;
    timestamp: string;
    services: {
        websocket: {
            healthy: boolean;
            redis: boolean;
            connections: number;
            memory: NodeJS.MemoryUsage;
            uptime: number;
        } | {
            healthy: boolean;
        };
        messageQueue: {
            healthy: boolean;
            details?: any;
        };
        metrics: {
            healthy: boolean;
            details?: any;
        };
    };
    uptime: number;
    memory: NodeJS.MemoryUsage;
    connections: {
        totalConnections: number;
        uniqueUsers: number;
        averageConnectionsPerUser: number;
        connectionsByRoom: Record<string, number>;
    } | {
        total: number;
        unique: number;
    };
    error?: undefined;
} | {
    healthy: boolean;
    error: any;
    timestamp: string;
    services?: undefined;
    uptime?: undefined;
    memory?: undefined;
    connections?: undefined;
}>;
export { wsService, messageQueueService, metricsService };
//# sourceMappingURL=index.d.ts.map