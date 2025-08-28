"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommunicationBus = void 0;
const events_1 = require("events");
const uuid_1 = require("uuid");
const ioredis_1 = __importDefault(require("ioredis"));
const bullmq_1 = require("bullmq");
const crypto = __importStar(require("crypto"));
const zlib = __importStar(require("zlib"));
const util_1 = require("util");
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
const communication_1 = require("../types/communication");
const logger = logger_1.Logger.child({ component: 'communication-bus' });
const gzip = (0, util_1.promisify)(zlib.gzip);
const gunzip = (0, util_1.promisify)(zlib.gunzip);
class CommunicationBus extends events_1.EventEmitter {
    redis;
    queues = new Map();
    workers = new Map();
    subscribers = new Map();
    routes = new Map();
    channels = new Map();
    pendingRequests = new Map();
    messageMetrics = new Map();
    encryptionKey;
    protocol;
    constructor() {
        super();
        this.setMaxListeners(10000);
        this.encryptionKey = crypto.randomBytes(32);
        this.protocol = {
            name: 'Fineprint Agent Communication Protocol',
            version: '1.0.0',
            transport: 'websocket',
            serialization: 'json',
            compression: config_1.config.communication.compressionEnabled ? 'gzip' : undefined,
            encryption: config_1.config.communication.enableEncryption ? {
                algorithm: 'aes-256-gcm',
                keyRotation: 86400000,
            } : undefined,
            authentication: {
                type: 'jwt',
                config: {
                    secret: config_1.config.jwt.secret,
                    expiresIn: config_1.config.jwt.expiresIn,
                },
            },
            rateLimit: {
                maxRequests: 1000,
                windowMs: 60000,
            },
        };
    }
    async initialize() {
        try {
            logger.info('Initializing Communication Bus...');
            this.redis = new ioredis_1.default({
                host: config_1.config.redis.host,
                port: config_1.config.redis.port,
                password: config_1.config.redis.password,
                db: config_1.config.redis.db,
                keyPrefix: config_1.config.redis.keyPrefix,
                maxRetriesPerRequest: config_1.config.redis.maxRetries,
                retryDelayOnFailover: config_1.config.redis.retryDelayOnFailover,
                lazyConnect: true,
            });
            await this.redis.connect();
            await this.createQueue('default', { type: 'priority' });
            await this.createQueue('broadcast', { type: 'fifo' });
            await this.createQueue('requests', { type: 'priority' });
            await this.createQueue('responses', { type: 'fifo' });
            await this.createQueue('events', { type: 'fifo' });
            await this.createQueue('notifications', { type: 'priority' });
            await this.setupDefaultRoutes();
            await this.setupDefaultChannels();
            this.startMetricsCollection();
            logger.info('Communication Bus initialized successfully', {
                queues: this.queues.size,
                routes: this.routes.size,
                channels: this.channels.size,
                protocol: this.protocol.name,
            });
        }
        catch (error) {
            logger.error('Failed to initialize Communication Bus', { error: error.message });
            throw error;
        }
    }
    async stop() {
        logger.info('Stopping Communication Bus...');
        for (const [name, worker] of this.workers.entries()) {
            await worker.close();
            logger.debug('Stopped worker', { name });
        }
        this.workers.clear();
        for (const [name, queue] of this.queues.entries()) {
            await queue.close();
            logger.debug('Closed queue', { name });
        }
        this.queues.clear();
        for (const [id, request] of this.pendingRequests.entries()) {
            clearTimeout(request.timeout);
            request.reject(new Error('Communication bus shutting down'));
        }
        this.pendingRequests.clear();
        if (this.redis) {
            await this.redis.quit();
        }
        logger.info('Communication Bus stopped');
    }
    async publish(message) {
        try {
            this.validateMessage(message);
            const routedMessage = await this.applyRoutes(message);
            const processedMessage = await this.processMessage(routedMessage);
            this.recordMessageMetric(processedMessage, 'sent');
            const queueName = this.getQueueForMessage(processedMessage);
            const queue = this.queues.get(queueName);
            if (!queue) {
                throw new Error(`Queue ${queueName} not found`);
            }
            await queue.add('process_message', processedMessage, {
                priority: this.getPriorityScore(processedMessage.priority),
                delay: processedMessage.metadata?.delay || 0,
                removeOnComplete: config_1.config.queue.defaultJobOptions.removeOnComplete,
                removeOnFail: config_1.config.queue.defaultJobOptions.removeOnFail,
                attempts: processedMessage.retryPolicy?.maxRetries || config_1.config.queue.defaultJobOptions.attempts,
                backoff: {
                    type: processedMessage.retryPolicy ? 'exponential' : config_1.config.queue.defaultJobOptions.backoff.type,
                    delay: processedMessage.retryPolicy?.initialDelay || config_1.config.queue.defaultJobOptions.backoff.delay,
                },
            });
            this.emit('message:published', { message: processedMessage, queue: queueName });
            logger.debug('Message published', {
                messageId: message.id,
                type: message.type,
                subject: message.subject,
                from: message.from,
                to: message.to,
                queue: queueName,
            });
        }
        catch (error) {
            logger.error('Failed to publish message', {
                messageId: message.id,
                error: error.message,
            });
            throw error;
        }
    }
    async subscribe(pattern, handler) {
        if (!this.subscribers.has(pattern)) {
            this.subscribers.set(pattern, new Set());
        }
        this.subscribers.get(pattern).add(handler);
        const workerKey = `subscriber:${pattern}`;
        if (!this.workers.has(workerKey)) {
            await this.createSubscriberWorker(pattern);
        }
        logger.debug('Subscribed to pattern', { pattern, handlerCount: this.subscribers.get(pattern).size });
    }
    async unsubscribe(pattern, handler) {
        const handlers = this.subscribers.get(pattern);
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.subscribers.delete(pattern);
                const workerKey = `subscriber:${pattern}`;
                const worker = this.workers.get(workerKey);
                if (worker) {
                    await worker.close();
                    this.workers.delete(workerKey);
                }
            }
        }
        logger.debug('Unsubscribed from pattern', { pattern });
    }
    async request(message, timeout = 30000) {
        return new Promise(async (resolve, reject) => {
            const requestId = message.id || (0, uuid_1.v4)();
            const correlationId = message.correlationId || (0, uuid_1.v4)();
            const timeoutHandle = setTimeout(() => {
                this.pendingRequests.delete(correlationId);
                reject(new Error(`Request timeout after ${timeout}ms`));
            }, timeout);
            this.pendingRequests.set(correlationId, {
                resolve,
                reject,
                timeout: timeoutHandle,
            });
            try {
                const requestMessage = {
                    ...message,
                    id: requestId,
                    type: communication_1.MessageType.REQUEST,
                    correlationId,
                    replyTo: 'orchestration:responses',
                    timestamp: new Date(),
                };
                await this.publish(requestMessage);
                logger.debug('Request sent', {
                    requestId,
                    correlationId,
                    subject: message.subject,
                    to: message.to,
                });
            }
            catch (error) {
                clearTimeout(timeoutHandle);
                this.pendingRequests.delete(correlationId);
                reject(error);
            }
        });
    }
    async broadcast(message) {
        const broadcastMessage = {
            ...message,
            to: ['*'],
            type: communication_1.MessageType.BROADCAST,
            timestamp: new Date(),
        };
        await this.publish(broadcastMessage);
        logger.debug('Message broadcasted', {
            messageId: message.id,
            subject: message.subject,
            from: message.from,
        });
    }
    async createQueue(name, options = {}) {
        const queueOptions = {
            name,
            type: options.type || 'fifo',
            maxSize: options.maxSize || 10000,
            retention: options.retention || config_1.config.communication.messageRetention,
            deadLetterQueue: options.deadLetterQueue,
            consumers: options.consumers || [],
            metrics: {
                messageCount: 0,
                visibleMessages: 0,
                inflightMessages: 0,
                deadLetterMessages: 0,
                throughput: 0,
                averageProcessingTime: 0,
                errorRate: 0,
            },
        };
        const queue = new bullmq_1.Queue(name, {
            connection: {
                host: config_1.config.redis.host,
                port: config_1.config.redis.port,
                password: config_1.config.redis.password,
                db: config_1.config.redis.db,
            },
            defaultJobOptions: config_1.config.queue.defaultJobOptions,
        });
        this.queues.set(name, queue);
        await this.createQueueWorker(name);
        logger.info('Queue created', { name, type: queueOptions.type });
    }
    async createQueueWorker(queueName) {
        const worker = new bullmq_1.Worker(queueName, async (job) => {
            const message = job.data;
            try {
                await this.processIncomingMessage(message);
                this.recordMessageMetric(message, 'processed');
                return { success: true, messageId: message.id };
            }
            catch (error) {
                logger.error('Failed to process message', {
                    messageId: message.id,
                    queueName,
                    error: error.message,
                });
                this.recordMessageMetric(message, 'failed', error.message);
                throw error;
            }
        }, {
            connection: {
                host: config_1.config.redis.host,
                port: config_1.config.redis.port,
                password: config_1.config.redis.password,
                db: config_1.config.redis.db,
            },
            concurrency: config_1.config.queue.concurrency,
        });
        worker.on('completed', (job) => {
            logger.debug('Job completed', { jobId: job.id, queue: queueName });
        });
        worker.on('failed', (job, error) => {
            logger.warn('Job failed', {
                jobId: job?.id,
                queue: queueName,
                error: error.message,
            });
        });
        this.workers.set(queueName, worker);
    }
    async createSubscriberWorker(pattern) {
        const workerKey = `subscriber:${pattern}`;
        const queueName = 'default';
        const worker = new bullmq_1.Worker(queueName, async (job) => {
            const message = job.data;
            if (this.matchesPattern(message.subject, pattern)) {
                const handlers = this.subscribers.get(pattern);
                if (handlers) {
                    const promises = Array.from(handlers).map(async (handler) => {
                        try {
                            const result = await handler(message);
                            if (result && message.type === communication_1.MessageType.REQUEST) {
                                const response = {
                                    ...result,
                                    type: communication_1.MessageType.RESPONSE,
                                    correlationId: message.correlationId,
                                    timestamp: new Date(),
                                };
                                if (message.replyTo) {
                                    await this.publish(response);
                                }
                            }
                        }
                        catch (error) {
                            logger.error('Message handler failed', {
                                pattern,
                                messageId: message.id,
                                error: error.message,
                            });
                        }
                    });
                    await Promise.allSettled(promises);
                }
            }
        }, {
            connection: {
                host: config_1.config.redis.host,
                port: config_1.config.redis.port,
                password: config_1.config.redis.password,
                db: config_1.config.redis.db,
            },
            concurrency: 1,
        });
        this.workers.set(workerKey, worker);
    }
    async processIncomingMessage(message) {
        try {
            const decryptedMessage = await this.decryptMessage(message);
            switch (decryptedMessage.type) {
                case communication_1.MessageType.RESPONSE:
                    await this.handleResponse(decryptedMessage);
                    break;
                case communication_1.MessageType.EVENT:
                    await this.handleEvent(decryptedMessage);
                    break;
                case communication_1.MessageType.NOTIFICATION:
                    await this.handleNotification(decryptedMessage);
                    break;
                case communication_1.MessageType.BROADCAST:
                    await this.handleBroadcast(decryptedMessage);
                    break;
                default:
                    this.emit('message:received', { message: decryptedMessage });
            }
            this.recordMessageMetric(decryptedMessage, 'delivered');
        }
        catch (error) {
            logger.error('Failed to process incoming message', {
                messageId: message.id,
                error: error.message,
            });
            throw error;
        }
    }
    async handleResponse(message) {
        if (message.correlationId) {
            const pendingRequest = this.pendingRequests.get(message.correlationId);
            if (pendingRequest) {
                clearTimeout(pendingRequest.timeout);
                this.pendingRequests.delete(message.correlationId);
                pendingRequest.resolve(message);
            }
        }
    }
    async handleEvent(message) {
        this.emit('event:received', { message });
        for (const [pattern, handlers] of this.subscribers.entries()) {
            if (this.matchesPattern(message.subject, pattern)) {
                for (const handler of handlers) {
                    try {
                        await handler(message);
                    }
                    catch (error) {
                        logger.error('Event handler failed', {
                            pattern,
                            messageId: message.id,
                            error: error.message,
                        });
                    }
                }
            }
        }
    }
    async handleNotification(message) {
        this.emit('notification:received', { message });
    }
    async handleBroadcast(message) {
        this.emit('broadcast:received', { message });
        for (const [pattern, handlers] of this.subscribers.entries()) {
            for (const handler of handlers) {
                try {
                    await handler(message);
                }
                catch (error) {
                    logger.error('Broadcast handler failed', {
                        pattern,
                        messageId: message.id,
                        error: error.message,
                    });
                }
            }
        }
    }
    async processMessage(message) {
        let processed = { ...message };
        if (config_1.config.communication.compressionEnabled) {
            processed = await this.compressMessage(processed);
        }
        if (config_1.config.communication.enableEncryption) {
            processed = await this.encryptMessage(processed);
        }
        return processed;
    }
    async compressMessage(message) {
        const payload = JSON.stringify(message.payload);
        const compressed = await gzip(payload);
        return {
            ...message,
            payload: { __compressed: compressed.toString('base64') },
            metadata: {
                ...message.metadata,
                compressed: true,
                originalSize: payload.length,
                compressedSize: compressed.length,
            },
        };
    }
    async encryptMessage(message) {
        const payload = JSON.stringify(message.payload);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey);
        let encrypted = cipher.update(payload, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        return {
            ...message,
            payload: {
                __encrypted: encrypted,
                __iv: iv.toString('hex'),
                __authTag: authTag.toString('hex'),
            },
            metadata: {
                ...message.metadata,
                encrypted: true,
            },
        };
    }
    async decryptMessage(message) {
        if (!message.metadata?.encrypted) {
            return message;
        }
        try {
            const { __encrypted, __iv, __authTag } = message.payload;
            const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey);
            decipher.setAuthTag(Buffer.from(__authTag, 'hex'));
            let decrypted = decipher.update(__encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            const payload = JSON.parse(decrypted);
            return { ...message, payload };
        }
        catch (error) {
            logger.error('Failed to decrypt message', {
                messageId: message.id,
                error: error.message,
            });
            throw new Error('Message decryption failed');
        }
    }
    async applyRoutes(message) {
        let processedMessage = { ...message };
        for (const route of this.routes.values()) {
            if (route.enabled && this.matchesRoute(message, route)) {
                if (route.transform) {
                    processedMessage = await this.applyTransformation(processedMessage, route.transform);
                }
                if (route.filter && !this.passesFilter(processedMessage, route.filter)) {
                    throw new Error(`Message filtered by route ${route.id}`);
                }
            }
        }
        return processedMessage;
    }
    matchesRoute(message, route) {
        const subjectMatches = this.matchesPattern(message.subject, route.pattern);
        const fromMatches = !route.fromPattern || this.matchesPattern(message.from, route.fromPattern);
        const toMatches = !route.toPattern || (Array.isArray(message.to)
            ? message.to.some(to => this.matchesPattern(to, route.toPattern))
            : this.matchesPattern(message.to, route.toPattern));
        return subjectMatches && fromMatches && toMatches;
    }
    async applyTransformation(message, transform) {
        return message;
    }
    passesFilter(message, filter) {
        return true;
    }
    validateMessage(message) {
        if (!message.id)
            message.id = (0, uuid_1.v4)();
        if (!message.timestamp)
            message.timestamp = new Date();
        if (!message.priority)
            message.priority = communication_1.MessagePriority.NORMAL;
        if (!message.from || !message.to || !message.subject) {
            throw new Error('Message missing required fields: from, to, subject');
        }
        if (message.ttl && message.ttl < 1000) {
            throw new Error('Message TTL must be at least 1000ms');
        }
    }
    matchesPattern(text, pattern) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
        return regex.test(text);
    }
    getQueueForMessage(message) {
        switch (message.type) {
            case communication_1.MessageType.REQUEST:
                return 'requests';
            case communication_1.MessageType.RESPONSE:
                return 'responses';
            case communication_1.MessageType.EVENT:
                return 'events';
            case communication_1.MessageType.NOTIFICATION:
                return 'notifications';
            case communication_1.MessageType.BROADCAST:
                return 'broadcast';
            default:
                return 'default';
        }
    }
    getPriorityScore(priority) {
        switch (priority) {
            case communication_1.MessagePriority.CRITICAL: return 100;
            case communication_1.MessagePriority.HIGH: return 80;
            case communication_1.MessagePriority.NORMAL: return 50;
            case communication_1.MessagePriority.LOW: return 20;
            default: return 50;
        }
    }
    recordMessageMetric(message, status, error) {
        const metric = {
            messageId: message.id,
            from: message.from,
            to: Array.isArray(message.to) ? message.to.join(',') : message.to,
            type: message.type,
            subject: message.subject,
            size: JSON.stringify(message).length,
            sentAt: message.timestamp,
            retryCount: 0,
            status: status,
            error,
        };
        if (status === 'delivered') {
            metric.receivedAt = new Date();
        }
        else if (status === 'processed') {
            metric.processedAt = new Date();
            if (metric.receivedAt) {
                metric.processingTime = metric.processedAt.getTime() - metric.receivedAt.getTime();
            }
        }
        this.messageMetrics.set(message.id, metric);
        this.emit('metric:recorded', { metric });
    }
    async setupDefaultRoutes() {
        logger.debug('Setting up default message routes...');
    }
    async setupDefaultChannels() {
        logger.debug('Setting up default communication channels...');
    }
    startMetricsCollection() {
        setInterval(() => {
            const metrics = {
                totalMessages: this.messageMetrics.size,
                queueSizes: new Map(),
                throughput: this.calculateThroughput(),
                errorRate: this.calculateErrorRate(),
            };
            this.emit('metrics:collected', { metrics });
        }, config_1.config.monitoring.metricsCollectionInterval);
    }
    calculateThroughput() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        const recentMessages = Array.from(this.messageMetrics.values())
            .filter(metric => metric.sentAt.getTime() > oneMinuteAgo);
        return recentMessages.length;
    }
    calculateErrorRate() {
        const totalMessages = this.messageMetrics.size;
        if (totalMessages === 0)
            return 0;
        const failedMessages = Array.from(this.messageMetrics.values())
            .filter(metric => metric.status === 'failed').length;
        return (failedMessages / totalMessages) * 100;
    }
    getQueues() {
        return this.queues;
    }
    getRoutes() {
        return this.routes;
    }
    getChannels() {
        return this.channels;
    }
    getMetrics() {
        return this.messageMetrics;
    }
    getProtocol() {
        return this.protocol;
    }
}
exports.CommunicationBus = CommunicationBus;
//# sourceMappingURL=communication-bus.js.map