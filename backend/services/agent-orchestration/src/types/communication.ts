import { z } from 'zod';

export enum MessageType {
  REQUEST = 'request',
  RESPONSE = 'response',
  EVENT = 'event',
  BROADCAST = 'broadcast',
  NOTIFICATION = 'notification',
  HEARTBEAT = 'heartbeat',
}

export enum MessagePriority {
  LOW = 1,
  NORMAL = 5,
  HIGH = 8,
  CRITICAL = 10,
}

export enum DeliveryGuarantee {
  AT_MOST_ONCE = 'at_most_once',
  AT_LEAST_ONCE = 'at_least_once',
  EXACTLY_ONCE = 'exactly_once',
}

export const MessageSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(MessageType),
  from: z.string(),
  to: z.string().or(z.array(z.string())),
  subject: z.string().min(1).max(100),
  payload: z.record(z.any()),
  correlationId: z.string().optional(),
  replyTo: z.string().optional(),
  timestamp: z.date(),
  ttl: z.number().min(1000).optional(), // Time to live in milliseconds
  priority: z.nativeEnum(MessagePriority).default(MessagePriority.NORMAL),
  deliveryGuarantee: z.nativeEnum(DeliveryGuarantee).default(DeliveryGuarantee.AT_LEAST_ONCE),
  retryPolicy: z.object({
    maxRetries: z.number().min(0).default(3),
    backoffMultiplier: z.number().min(1).default(2),
    initialDelay: z.number().min(100).default(1000),
  }).optional(),
  metadata: z.record(z.any()).default({}),
});

export type Message = z.infer<typeof MessageSchema>;

export interface MessageRoute {
  id: string;
  pattern: string; // Subject pattern to match
  fromPattern?: string; // Source agent pattern
  toPattern?: string; // Destination agent pattern
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
  retention: number; // Retention period in milliseconds
  deadLetterQueue?: string;
  consumers: QueueConsumer[];
  metrics: QueueMetrics;
}

export interface QueueConsumer {
  id: string;
  agentId: string;
  concurrency: number;
  batchSize: number;
  visibility: number; // Visibility timeout in milliseconds
  maxReceiveCount: number;
  enabled: boolean;
}

export interface QueueMetrics {
  messageCount: number;
  visibleMessages: number;
  inflightMessages: number;
  deadLetterMessages: number;
  throughput: number; // Messages per second
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