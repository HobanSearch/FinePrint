"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PubSubUtils = exports.PubSubCoordinator = void 0;
const ioredis_1 = require("ioredis");
const events_1 = require("events");
const crypto_1 = require("crypto");
const logger_1 = require("@fineprintai/logger");
class PubSubCoordinator extends events_1.EventEmitter {
    config;
    publisher;
    subscriber;
    instanceId;
    isConnected = false;
    messageHandlers = new Map();
    logger = (0, logger_1.createServiceLogger)('cache-pubsub');
    constructor(redisConfig, config) {
        super();
        this.config = config;
        this.instanceId = config.instanceId || `cache-${(0, crypto_1.randomBytes)(4).toString('hex')}`;
        this.publisher = new ioredis_1.Redis({
            ...redisConfig,
            lazyConnect: true,
            maxRetriesPerRequest: null,
        });
        this.subscriber = new ioredis_1.Redis({
            ...redisConfig,
            lazyConnect: true,
            maxRetriesPerRequest: null,
        });
        this.setupEventHandlers();
    }
    async initialize() {
        try {
            await Promise.all([
                this.publisher.connect(),
                this.subscriber.connect()
            ]);
            if (this.config.enabled) {
                await this.setupSubscriptions();
            }
            this.isConnected = true;
            this.logger.info('PubSub coordinator initialized', {
                instanceId: this.instanceId,
                enabled: this.config.enabled
            });
        }
        catch (error) {
            this.logger.error('Failed to initialize PubSub coordinator', { error });
            throw error;
        }
    }
    async publishInvalidation(key, pattern, tags) {
        if (!this.config.enabled || !this.isConnected)
            return;
        const message = {
            type: 'invalidate',
            key,
            pattern,
            tags,
            timestamp: Date.now(),
            instanceId: this.instanceId
        };
        try {
            await this.publisher.publish(this.config.channels.invalidation, JSON.stringify(message));
            this.logger.debug('Published invalidation message', {
                key,
                pattern,
                tags,
                instanceId: this.instanceId
            });
        }
        catch (error) {
            this.logger.error('Failed to publish invalidation message', { error, key, pattern, tags });
        }
    }
    async publishRefresh(key, data) {
        if (!this.config.enabled || !this.isConnected)
            return;
        const message = {
            type: 'refresh',
            key,
            data,
            timestamp: Date.now(),
            instanceId: this.instanceId
        };
        try {
            await this.publisher.publish(this.config.channels.coordination, JSON.stringify(message));
            this.logger.debug('Published refresh message', {
                key,
                instanceId: this.instanceId
            });
        }
        catch (error) {
            this.logger.error('Failed to publish refresh message', { error, key });
        }
    }
    async publishSet(key, data) {
        if (!this.config.enabled || !this.isConnected)
            return;
        const message = {
            type: 'set',
            key,
            data,
            timestamp: Date.now(),
            instanceId: this.instanceId
        };
        try {
            await this.publisher.publish(this.config.channels.coordination, JSON.stringify(message));
            this.logger.debug('Published set message', {
                key,
                instanceId: this.instanceId
            });
        }
        catch (error) {
            this.logger.error('Failed to publish set message', { error, key });
        }
    }
    async publishDelete(key) {
        if (!this.config.enabled || !this.isConnected)
            return;
        const message = {
            type: 'delete',
            key,
            timestamp: Date.now(),
            instanceId: this.instanceId
        };
        try {
            await this.publisher.publish(this.config.channels.invalidation, JSON.stringify(message));
            this.logger.debug('Published delete message', {
                key,
                instanceId: this.instanceId
            });
        }
        catch (error) {
            this.logger.error('Failed to publish delete message', { error, key });
        }
    }
    async publishMetrics(metrics) {
        if (!this.config.enabled || !this.isConnected)
            return;
        const message = {
            type: 'invalidate',
            data: metrics,
            timestamp: Date.now(),
            instanceId: this.instanceId
        };
        try {
            await this.publisher.publish(this.config.channels.metrics, JSON.stringify(message));
            this.logger.debug('Published metrics', {
                instanceId: this.instanceId
            });
        }
        catch (error) {
            this.logger.error('Failed to publish metrics', { error });
        }
    }
    onInvalidation(handler) {
        this.addMessageHandler(this.config.channels.invalidation, handler);
    }
    onCoordination(handler) {
        this.addMessageHandler(this.config.channels.coordination, handler);
    }
    onMetrics(handler) {
        this.addMessageHandler(this.config.channels.metrics, handler);
    }
    removeHandler(channel, handler) {
        const handlers = this.messageHandlers.get(channel);
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.messageHandlers.delete(channel);
            }
        }
    }
    isReady() {
        return this.isConnected &&
            this.publisher.status === 'ready' &&
            this.subscriber.status === 'ready';
    }
    getInstanceId() {
        return this.instanceId;
    }
    async getSubscriberInfo() {
        if (!this.isConnected) {
            return { channels: [], patterns: [] };
        }
        try {
            const channels = await this.subscriber.pubsub('channels');
            const patterns = await this.subscriber.pubsub('numpat');
            return {
                channels: channels || [],
                patterns: Array.isArray(patterns) ? patterns : []
            };
        }
        catch (error) {
            this.logger.error('Failed to get subscriber info', { error });
            return { channels: [], patterns: [] };
        }
    }
    async disconnect() {
        try {
            this.isConnected = false;
            await Promise.all([
                this.publisher.disconnect(),
                this.subscriber.disconnect()
            ]);
            this.messageHandlers.clear();
            this.logger.info('PubSub coordinator disconnected', {
                instanceId: this.instanceId
            });
        }
        catch (error) {
            this.logger.error('Error disconnecting PubSub coordinator', { error });
        }
    }
    setupEventHandlers() {
        this.publisher.on('connect', () => {
            this.logger.info('Publisher connected');
        });
        this.publisher.on('error', (error) => {
            this.logger.error('Publisher error', { error });
            this.emit('error', error);
        });
        this.publisher.on('close', () => {
            this.logger.warn('Publisher connection closed');
            this.isConnected = false;
        });
        this.subscriber.on('connect', () => {
            this.logger.info('Subscriber connected');
        });
        this.subscriber.on('error', (error) => {
            this.logger.error('Subscriber error', { error });
            this.emit('error', error);
        });
        this.subscriber.on('close', () => {
            this.logger.warn('Subscriber connection closed');
            this.isConnected = false;
        });
        this.subscriber.on('message', (channel, message) => {
            this.handleMessage(channel, message);
        });
        this.subscriber.on('pmessage', (pattern, channel, message) => {
            this.handleMessage(channel, message, pattern);
        });
    }
    async setupSubscriptions() {
        const channels = Object.values(this.config.channels);
        try {
            await this.subscriber.subscribe(...channels);
            this.logger.info('Subscribed to channels', {
                channels,
                instanceId: this.instanceId
            });
        }
        catch (error) {
            this.logger.error('Failed to setup subscriptions', { error, channels });
            throw error;
        }
    }
    handleMessage(channel, message, pattern) {
        try {
            const parsedMessage = JSON.parse(message);
            if (parsedMessage.instanceId === this.instanceId) {
                return;
            }
            const handlers = this.messageHandlers.get(channel);
            if (handlers) {
                handlers.forEach(handler => {
                    try {
                        handler(parsedMessage);
                    }
                    catch (error) {
                        this.logger.error('Error in message handler', { error, channel, message: parsedMessage });
                    }
                });
            }
            this.emit('message', { channel, message: parsedMessage, pattern });
            this.logger.debug('Processed message', {
                channel,
                type: parsedMessage.type,
                fromInstance: parsedMessage.instanceId,
                pattern
            });
        }
        catch (error) {
            this.logger.error('Failed to parse message', { error, channel, message });
        }
    }
    addMessageHandler(channel, handler) {
        let handlers = this.messageHandlers.get(channel);
        if (!handlers) {
            handlers = new Set();
            this.messageHandlers.set(channel, handlers);
        }
        handlers.add(handler);
    }
}
exports.PubSubCoordinator = PubSubCoordinator;
class PubSubUtils {
    static createDefaultConfig(instanceId) {
        return {
            enabled: true,
            channels: {
                invalidation: 'fpa:cache:invalidate',
                coordination: 'fpa:cache:coordinate',
                metrics: 'fpa:cache:metrics'
            },
            instanceId: instanceId || `cache-${(0, crypto_1.randomBytes)(4).toString('hex')}`
        };
    }
    static validateConfig(config) {
        const errors = [];
        if (!config.instanceId || config.instanceId.length === 0) {
            errors.push('Instance ID is required');
        }
        if (!config.channels) {
            errors.push('Channels configuration is required');
        }
        else {
            if (!config.channels.invalidation)
                errors.push('Invalidation channel is required');
            if (!config.channels.coordination)
                errors.push('Coordination channel is required');
            if (!config.channels.metrics)
                errors.push('Metrics channel is required');
        }
        return {
            valid: errors.length === 0,
            errors
        };
    }
    static generateChannelName(namespace, type) {
        return `${namespace}:cache:${type}`;
    }
    static isRecentMessage(message, maxAgeMs = 30000) {
        return (Date.now() - message.timestamp) <= maxAgeMs;
    }
    static createInvalidationMessage(instanceId, key, pattern, tags) {
        return {
            type: 'invalidate',
            key,
            pattern,
            tags,
            timestamp: Date.now(),
            instanceId
        };
    }
}
exports.PubSubUtils = PubSubUtils;
//# sourceMappingURL=pubsub-coordinator.js.map