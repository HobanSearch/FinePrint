import { z } from 'zod';
export declare enum MessageType {
    REQUEST = "request",
    RESPONSE = "response",
    EVENT = "event",
    BROADCAST = "broadcast",
    NOTIFICATION = "notification",
    HEARTBEAT = "heartbeat"
}
export declare enum MessagePriority {
    LOW = 1,
    NORMAL = 5,
    HIGH = 8,
    CRITICAL = 10
}
export declare enum DeliveryGuarantee {
    AT_MOST_ONCE = "at_most_once",
    AT_LEAST_ONCE = "at_least_once",
    EXACTLY_ONCE = "exactly_once"
}
export declare const MessageSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodNativeEnum<typeof MessageType>;
    from: z.ZodString;
    to: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>;
    subject: z.ZodString;
    payload: z.ZodRecord<z.ZodString, z.ZodAny>;
    correlationId: z.ZodOptional<z.ZodString>;
    replyTo: z.ZodOptional<z.ZodString>;
    timestamp: z.ZodDate;
    ttl: z.ZodOptional<z.ZodNumber>;
    priority: z.ZodDefault<z.ZodNativeEnum<typeof MessagePriority>>;
    deliveryGuarantee: z.ZodDefault<z.ZodNativeEnum<typeof DeliveryGuarantee>>;
    retryPolicy: z.ZodOptional<z.ZodObject<{
        maxRetries: z.ZodDefault<z.ZodNumber>;
        backoffMultiplier: z.ZodDefault<z.ZodNumber>;
        initialDelay: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        maxRetries: number;
        backoffMultiplier: number;
        initialDelay: number;
    }, {
        maxRetries?: number | undefined;
        backoffMultiplier?: number | undefined;
        initialDelay?: number | undefined;
    }>>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: MessageType;
    to: string | string[];
    subject: string;
    payload: Record<string, any>;
    priority: MessagePriority;
    timestamp: Date;
    metadata: Record<string, any>;
    from: string;
    deliveryGuarantee: DeliveryGuarantee;
    retryPolicy?: {
        maxRetries: number;
        backoffMultiplier: number;
        initialDelay: number;
    } | undefined;
    correlationId?: string | undefined;
    replyTo?: string | undefined;
    ttl?: number | undefined;
}, {
    id: string;
    type: MessageType;
    to: string | string[];
    subject: string;
    payload: Record<string, any>;
    timestamp: Date;
    from: string;
    priority?: MessagePriority | undefined;
    retryPolicy?: {
        maxRetries?: number | undefined;
        backoffMultiplier?: number | undefined;
        initialDelay?: number | undefined;
    } | undefined;
    metadata?: Record<string, any> | undefined;
    correlationId?: string | undefined;
    replyTo?: string | undefined;
    ttl?: number | undefined;
    deliveryGuarantee?: DeliveryGuarantee | undefined;
}>;
export type Message = z.infer<typeof MessageSchema>;
export interface MessageRoute {
    id: string;
    pattern: string;
    fromPattern?: string;
    toPattern?: string;
    transform?: MessageTransformation;
    filter?: MessageFilter;
    priority: number;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface MessageTransformation {
    type: 'javascript' | 'jq' | 'template';
    script: string;
    inputSchema?: Record<string, any>;
    outputSchema?: Record<string, any>;
}
export interface MessageFilter {
    conditions: Array<{
        field: string;
        operator: 'equals' | 'not_equals' | 'contains' | 'matches' | 'exists';
        value: any;
    }>;
    logic: 'and' | 'or';
}
export interface MessageQueue {
    name: string;
    type: 'fifo' | 'priority' | 'delay';
    maxSize: number;
    retention: number;
    deadLetterQueue?: string;
    consumers: QueueConsumer[];
    metrics: QueueMetrics;
}
export interface QueueConsumer {
    id: string;
    agentId: string;
    concurrency: number;
    batchSize: number;
    visibility: number;
    maxReceiveCount: number;
    enabled: boolean;
}
export interface QueueMetrics {
    messageCount: number;
    visibleMessages: number;
    inflightMessages: number;
    deadLetterMessages: number;
    throughput: number;
    averageProcessingTime: number;
    errorRate: number;
}
export interface MessageBus {
    publish(message: Message): Promise<void>;
    subscribe(pattern: string, handler: MessageHandler): Promise<void>;
    unsubscribe(pattern: string, handler: MessageHandler): Promise<void>;
    request(message: Message, timeout?: number): Promise<Message>;
    broadcast(message: Omit<Message, 'to'>): Promise<void>;
}
export type MessageHandler = (message: Message) => Promise<void | Message>;
export interface CommunicationProtocol {
    name: string;
    version: string;
    transport: 'websocket' | 'http' | 'grpc' | 'amqp';
    serialization: 'json' | 'protobuf' | 'avro';
    compression?: 'gzip' | 'lz4' | 'snappy';
    encryption?: {
        algorithm: string;
        keyRotation: number;
    };
    authentication: {
        type: 'jwt' | 'oauth2' | 'mutual_tls';
        config: Record<string, any>;
    };
    rateLimit?: {
        maxRequests: number;
        windowMs: number;
    };
}
export interface MessageMetrics {
    messageId: string;
    from: string;
    to: string;
    type: MessageType;
    subject: string;
    size: number;
    sentAt: Date;
    receivedAt?: Date;
    processedAt?: Date;
    ackAt?: Date;
    retryCount: number;
    processingTime?: number;
    status: 'sent' | 'delivered' | 'processed' | 'failed' | 'expired';
    error?: string;
}
export interface EventSchema {
    name: string;
    version: string;
    schema: Record<string, any>;
    examples: Array<Record<string, any>>;
    description: string;
    producers: string[];
    consumers: string[];
}
export interface MessageChannel {
    id: string;
    name: string;
    type: 'point_to_point' | 'publish_subscribe' | 'request_reply';
    participants: string[];
    configuration: {
        maxMessageSize: number;
        retentionPolicy: {
            type: 'time' | 'size' | 'count';
            value: number;
        };
        ordering: 'fifo' | 'none';
        durability: boolean;
    };
    metrics: ChannelMetrics;
    createdAt: Date;
    updatedAt: Date;
}
export interface ChannelMetrics {
    totalMessages: number;
    throughput: number;
    averageLatency: number;
    errorRate: number;
    activeConnections: number;
}
//# sourceMappingURL=communication.d.ts.map