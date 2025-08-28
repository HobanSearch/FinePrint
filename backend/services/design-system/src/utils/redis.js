import Redis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from './logger.js';
export class RedisClient {
    client;
    isConnected = false;
    constructor() {
        this.client = new Redis(config.redis.url, {
            keyPrefix: config.redis.keyPrefix,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
            lazyConnect: true,
        });
        this.client.on('connect', () => {
            this.isConnected = true;
            logger.info('Redis connected');
        });
        this.client.on('error', (error) => {
            this.isConnected = false;
            logger.error(error, 'Redis connection error');
        });
        this.client.on('close', () => {
            this.isConnected = false;
            logger.info('Redis connection closed');
        });
    }
    async connect() {
        try {
            await this.client.connect();
            logger.info('Redis client connected successfully');
        }
        catch (error) {
            logger.error(error, 'Failed to connect to Redis');
            throw error;
        }
    }
    async disconnect() {
        await this.client.disconnect();
        logger.info('Redis client disconnected');
    }
    async healthCheck() {
        try {
            const result = await this.client.ping();
            return result === 'PONG';
        }
        catch {
            return false;
        }
    }
    async get(key) {
        try {
            return await this.client.get(key);
        }
        catch (error) {
            logger.error({ error: error.message, key }, 'Redis GET failed');
            throw error;
        }
    }
    async set(key, value, ttl) {
        try {
            if (ttl) {
                await this.client.setex(key, ttl, value);
            }
            else {
                await this.client.set(key, value);
            }
        }
        catch (error) {
            logger.error({ error: error.message, key }, 'Redis SET failed');
            throw error;
        }
    }
    async setex(key, ttl, value) {
        try {
            await this.client.setex(key, ttl, value);
        }
        catch (error) {
            logger.error({ error: error.message, key, ttl }, 'Redis SETEX failed');
            throw error;
        }
    }
    async del(key) {
        try {
            await this.client.del(key);
        }
        catch (error) {
            logger.error({ error: error.message, key }, 'Redis DEL failed');
            throw error;
        }
    }
    async exists(key) {
        try {
            const result = await this.client.exists(key);
            return result === 1;
        }
        catch (error) {
            logger.error({ error: error.message, key }, 'Redis EXISTS failed');
            throw error;
        }
    }
    async expire(key, ttl) {
        try {
            await this.client.expire(key, ttl);
        }
        catch (error) {
            logger.error({ error: error.message, key, ttl }, 'Redis EXPIRE failed');
            throw error;
        }
    }
    async lpush(key, value) {
        try {
            await this.client.lpush(key, value);
        }
        catch (error) {
            logger.error({ error: error.message, key }, 'Redis LPUSH failed');
            throw error;
        }
    }
    async ltrim(key, start, stop) {
        try {
            await this.client.ltrim(key, start, stop);
        }
        catch (error) {
            logger.error({ error: error.message, key, start, stop }, 'Redis LTRIM failed');
            throw error;
        }
    }
    async lrange(key, start, stop) {
        try {
            return await this.client.lrange(key, start, stop);
        }
        catch (error) {
            logger.error({ error: error.message, key, start, stop }, 'Redis LRANGE failed');
            throw error;
        }
    }
    async deletePattern(pattern) {
        try {
            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
                await this.client.del(...keys);
            }
        }
        catch (error) {
            logger.error({ error: error.message, pattern }, 'Redis DELETE PATTERN failed');
            throw error;
        }
    }
    async hset(key, field, value) {
        try {
            await this.client.hset(key, field, value);
        }
        catch (error) {
            logger.error({ error: error.message, key, field }, 'Redis HSET failed');
            throw error;
        }
    }
    async hget(key, field) {
        try {
            return await this.client.hget(key, field);
        }
        catch (error) {
            logger.error({ error: error.message, key, field }, 'Redis HGET failed');
            throw error;
        }
    }
    async hgetall(key) {
        try {
            return await this.client.hgetall(key);
        }
        catch (error) {
            logger.error({ error: error.message, key }, 'Redis HGETALL failed');
            throw error;
        }
    }
    async incr(key) {
        try {
            return await this.client.incr(key);
        }
        catch (error) {
            logger.error({ error: error.message, key }, 'Redis INCR failed');
            throw error;
        }
    }
    async decr(key) {
        try {
            return await this.client.decr(key);
        }
        catch (error) {
            logger.error({ error: error.message, key }, 'Redis DECR failed');
            throw error;
        }
    }
}
//# sourceMappingURL=redis.js.map