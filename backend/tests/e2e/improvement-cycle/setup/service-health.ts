import axios, { AxiosInstance } from 'axios';
import Redis from 'ioredis';
import { Client as PgClient } from 'pg';
import { Kafka } from 'kafkajs';
import { io, Socket } from 'socket.io-client';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  }
});

export interface ServiceHealth {
  service: string;
  url: string;
  healthy: boolean;
  responseTime: number;
  error?: string;
  version?: string;
  dependencies?: Record<string, boolean>;
}

export interface SystemHealth {
  timestamp: Date;
  allHealthy: boolean;
  services: ServiceHealth[];
  infrastructure: {
    postgres: boolean;
    redis: boolean;
    kafka: boolean;
    temporal: boolean;
  };
  totalResponseTime: number;
}

export class HealthChecker {
  private services: Map<string, string>;
  private axiosInstance: AxiosInstance;
  private redisClient?: Redis;
  private pgClient?: PgClient;
  private kafkaClient?: Kafka;
  private webSocketClients: Map<string, Socket>;

  constructor() {
    this.services = new Map([
      ['digital-twin', 'http://localhost:3020'],
      ['business-agents', 'http://localhost:3001'],
      ['content-optimizer', 'http://localhost:3030'],
      ['improvement-orchestrator', 'http://localhost:3010'],
      ['feedback-collector', 'http://localhost:3040']
    ]);

    this.axiosInstance = axios.create({
      timeout: 5000,
      validateStatus: (status) => status < 500
    });

    this.webSocketClients = new Map();
  }

  async initialize(): Promise<void> {
    try {
      // Initialize Redis client
      this.redisClient = new Redis({
        host: 'localhost',
        port: 6380,
        retryStrategy: (times) => Math.min(times * 50, 2000)
      });

      // Initialize PostgreSQL client
      this.pgClient = new PgClient({
        host: 'localhost',
        port: 5433,
        user: 'testuser',
        password: 'testpass',
        database: 'fineprint_test'
      });
      await this.pgClient.connect();

      // Initialize Kafka client
      this.kafkaClient = new Kafka({
        clientId: 'health-checker',
        brokers: ['localhost:9093'],
        retry: {
          initialRetryTime: 100,
          retries: 5
        }
      });

      logger.info('Health checker initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize health checker');
      throw error;
    }
  }

  async checkService(name: string, url: string): Promise<ServiceHealth> {
    const startTime = Date.now();
    const health: ServiceHealth = {
      service: name,
      url,
      healthy: false,
      responseTime: 0
    };

    try {
      const response = await this.axiosInstance.get(`${url}/health`);
      const responseTime = Date.now() - startTime;

      health.healthy = response.status === 200;
      health.responseTime = responseTime;
      
      if (response.data) {
        health.version = response.data.version;
        health.dependencies = response.data.dependencies;
      }

      // Check WebSocket connectivity for services that support it
      if (['digital-twin', 'feedback-collector'].includes(name)) {
        await this.checkWebSocket(name, url);
      }

      logger.debug({ service: name, health }, 'Service health check completed');
    } catch (error: any) {
      health.error = error.message;
      health.responseTime = Date.now() - startTime;
      logger.warn({ service: name, error: error.message }, 'Service health check failed');
    }

    return health;
  }

  async checkWebSocket(name: string, url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const wsUrl = url.replace('http', 'ws');
      const socket = io(wsUrl, {
        transports: ['websocket'],
        timeout: 5000
      });

      const timeout = setTimeout(() => {
        socket.disconnect();
        resolve(false);
      }, 5000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        this.webSocketClients.set(name, socket);
        logger.debug({ service: name }, 'WebSocket connected');
        resolve(true);
      });

      socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        logger.warn({ service: name, error: error.message }, 'WebSocket connection failed');
        resolve(false);
      });
    });
  }

  async checkPostgres(): Promise<boolean> {
    try {
      if (!this.pgClient) return false;
      const result = await this.pgClient.query('SELECT NOW()');
      return !!result.rows[0];
    } catch (error) {
      logger.warn({ error }, 'PostgreSQL health check failed');
      return false;
    }
  }

  async checkRedis(): Promise<boolean> {
    try {
      if (!this.redisClient) return false;
      const result = await this.redisClient.ping();
      return result === 'PONG';
    } catch (error) {
      logger.warn({ error }, 'Redis health check failed');
      return false;
    }
  }

  async checkKafka(): Promise<boolean> {
    try {
      if (!this.kafkaClient) return false;
      const admin = this.kafkaClient.admin();
      await admin.connect();
      const topics = await admin.listTopics();
      await admin.disconnect();
      return Array.isArray(topics);
    } catch (error) {
      logger.warn({ error }, 'Kafka health check failed');
      return false;
    }
  }

  async checkTemporal(): Promise<boolean> {
    try {
      const response = await this.axiosInstance.get('http://localhost:7234/health');
      return response.status === 200;
    } catch (error) {
      logger.warn({ error }, 'Temporal health check failed');
      return false;
    }
  }

  async checkAll(): Promise<SystemHealth> {
    const startTime = Date.now();
    const serviceHealthPromises: Promise<ServiceHealth>[] = [];

    for (const [name, url] of this.services) {
      serviceHealthPromises.push(this.checkService(name, url));
    }

    const [
      serviceHealthResults,
      postgresHealthy,
      redisHealthy,
      kafkaHealthy,
      temporalHealthy
    ] = await Promise.all([
      Promise.all(serviceHealthPromises),
      this.checkPostgres(),
      this.checkRedis(),
      this.checkKafka(),
      this.checkTemporal()
    ]);

    const allServicesHealthy = serviceHealthResults.every(s => s.healthy);
    const allInfrastructureHealthy = postgresHealthy && redisHealthy && kafkaHealthy && temporalHealthy;

    const systemHealth: SystemHealth = {
      timestamp: new Date(),
      allHealthy: allServicesHealthy && allInfrastructureHealthy,
      services: serviceHealthResults,
      infrastructure: {
        postgres: postgresHealthy,
        redis: redisHealthy,
        kafka: kafkaHealthy,
        temporal: temporalHealthy
      },
      totalResponseTime: Date.now() - startTime
    };

    logger.info({ 
      allHealthy: systemHealth.allHealthy,
      totalTime: systemHealth.totalResponseTime 
    }, 'System health check completed');

    return systemHealth;
  }

  async waitForHealthy(maxRetries = 30, retryDelay = 2000): Promise<boolean> {
    logger.info({ maxRetries, retryDelay }, 'Waiting for system to be healthy...');

    for (let i = 0; i < maxRetries; i++) {
      const health = await this.checkAll();
      
      if (health.allHealthy) {
        logger.info('System is healthy!');
        return true;
      }

      logger.info({ 
        attempt: i + 1, 
        maxRetries,
        unhealthyServices: health.services.filter(s => !s.healthy).map(s => s.service),
        unhealthyInfra: Object.entries(health.infrastructure)
          .filter(([_, healthy]) => !healthy)
          .map(([name]) => name)
      }, 'System not yet healthy, retrying...');

      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }

    logger.error('System failed to become healthy within timeout');
    return false;
  }

  async cleanup(): Promise<void> {
    try {
      // Close WebSocket connections
      for (const [name, socket] of this.webSocketClients) {
        socket.disconnect();
        logger.debug({ service: name }, 'WebSocket disconnected');
      }

      // Close database connections
      if (this.pgClient) {
        await this.pgClient.end();
      }

      if (this.redisClient) {
        this.redisClient.disconnect();
      }

      logger.info('Health checker cleaned up successfully');
    } catch (error) {
      logger.error({ error }, 'Error during health checker cleanup');
    }
  }

  getWebSocketClient(service: string): Socket | undefined {
    return this.webSocketClients.get(service);
  }

  getRedisClient(): Redis | undefined {
    return this.redisClient;
  }

  getPostgresClient(): PgClient | undefined {
    return this.pgClient;
  }

  getKafkaClient(): Kafka | undefined {
    return this.kafkaClient;
  }
}

// Export singleton instance
export const healthChecker = new HealthChecker();

// Utility function for use in tests
export async function ensureSystemHealthy(): Promise<boolean> {
  await healthChecker.initialize();
  const isHealthy = await healthChecker.waitForHealthy();
  
  if (!isHealthy) {
    const health = await healthChecker.checkAll();
    console.error('System health check failed:', JSON.stringify(health, null, 2));
    throw new Error('System is not healthy');
  }

  return true;
}