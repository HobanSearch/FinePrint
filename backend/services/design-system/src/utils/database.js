import { Pool } from 'pg';
import { config } from '../config/index.js';
import { logger } from './logger.js';
export class DatabaseClient {
    pool = null;
    isConnected = false;
    constructor() {
        this.pool = new Pool({
            connectionString: config.database.url,
            max: config.database.maxConnections,
            connectionTimeoutMillis: config.database.connectionTimeout,
            idleTimeoutMillis: 30000,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        });
        this.pool.on('error', (err) => {
            logger.error(err, 'Database pool error');
        });
    }
    async connect() {
        if (!this.pool) {
            throw new Error('Database pool not initialized');
        }
        try {
            await this.pool.query('SELECT 1');
            this.isConnected = true;
            logger.info('Database connected successfully');
        }
        catch (error) {
            logger.error(error, 'Failed to connect to database');
            throw error;
        }
    }
    async disconnect() {
        if (this.pool) {
            await this.pool.end();
            this.isConnected = false;
            logger.info('Database disconnected');
        }
    }
    async healthCheck() {
        try {
            if (!this.pool)
                return false;
            await this.pool.query('SELECT 1');
            return true;
        }
        catch {
            return false;
        }
    }
    async query(text, params) {
        if (!this.pool) {
            throw new Error('Database not connected');
        }
        try {
            const start = Date.now();
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;
            logger.debug({
                query: text.substring(0, 100),
                duration,
                rows: result.rowCount,
            }, 'Database query executed');
            return result;
        }
        catch (error) {
            logger.error({
                error: error.message,
                query: text.substring(0, 100),
                params: params?.slice(0, 5),
            }, 'Database query failed');
            throw error;
        }
    }
    async transaction(callback) {
        if (!this.pool) {
            throw new Error('Database not connected');
        }
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
}
//# sourceMappingURL=database.js.map