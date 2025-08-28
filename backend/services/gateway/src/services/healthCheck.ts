import { Redis } from 'ioredis';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { KongAdminService } from './kongAdmin';

const logger = createServiceLogger('health-check');

export interface HealthCheckConfig {
  kongAdmin: KongAdminService;
  services: string[];
  redisUrl: string;
  checkInterval: number;
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime?: number;
  error?: string;
  lastCheck: Date;
  consecutiveFailures: number;
  uptime?: string;
}

export interface SystemHealth {
  overall: 'healthy' | 'unhealthy' | 'degraded';
  kong: {
    status: 'healthy' | 'unhealthy';
    version?: string;
    plugins?: number;
    uptime?: number;
  };
  redis: {
    status: 'healthy' | 'unhealthy';
    latency?: number;
    memory?: string;
    connections?: number;
  };
  services: ServiceHealth[];
  lastUpdate: Date;
}

export class HealthCheckService {
  private config: HealthCheckConfig;
  private redis: Redis;
  private intervalId?: NodeJS.Timeout;
  private healthStatus: SystemHealth;
  private readonly maxConsecutiveFailures = 3;

  constructor(config: HealthCheckConfig) {
    this.config = config;
    this.redis = new Redis(config.redisUrl, {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.healthStatus = {
      overall: 'healthy',
      kong: { status: 'healthy' },
      redis: { status: 'healthy' },
      services: [],
      lastUpdate: new Date(),
    };
  }

  async initialize(): Promise<void> {
    try {
      // Connect to Redis
      await this.redis.connect();
      logger.info('Health check service connected to Redis');

      // Initialize service health tracking
      for (const serviceName of this.config.services) {
        this.healthStatus.services.push({
          name: serviceName,
          status: 'healthy',
          lastCheck: new Date(),
          consecutiveFailures: 0,
        });
      }

      // Start health check interval
      this.intervalId = setInterval(
        () => this.performHealthChecks(),
        this.config.checkInterval
      );

      // Perform initial health check
      await this.performHealthChecks();

      logger.info('Health check service initialized', {
        services: this.config.services.length,
        checkInterval: this.config.checkInterval,
      });
    } catch (error) {
      logger.error('Failed to initialize health check service', { error });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    try {
      await this.redis.quit();
      logger.info('Health check service shut down');
    } catch (error) {
      logger.error('Error during health check service shutdown', { error });
    }
  }

  private async performHealthChecks(): Promise<void> {
    try {
      const startTime = Date.now();

      // Check Kong health
      await this.checkKongHealth();

      // Check Redis health
      await this.checkRedisHealth();

      // Check backend services
      await this.checkBackendServices();

      // Update overall health status
      this.updateOverallHealth();

      // Store health status in Redis for other services
      await this.storeHealthStatus();

      this.healthStatus.lastUpdate = new Date();

      const duration = Date.now() - startTime;
      logger.debug('Health checks completed', { duration: `${duration}ms` });
    } catch (error) {
      logger.error('Error performing health checks', { error });
      this.healthStatus.overall = 'unhealthy';
    }
  }

  private async checkKongHealth(): Promise<void> {
    try {
      const startTime = Date.now();
      const status = await this.config.kongAdmin.getStatus();
      const responseTime = Date.now() - startTime;

      this.healthStatus.kong = {
        status: 'healthy',
        version: status.version,
        plugins: status.plugins?.available_on_server?.length || 0,
        uptime: status.server?.connections_handled || 0,
      };

      logger.debug('Kong health check passed', { responseTime });
    } catch (error) {
      this.healthStatus.kong = {
        status: 'unhealthy',
      };
      logger.warn('Kong health check failed', { error });
    }
  }

  private async checkRedisHealth(): Promise<void> {
    try {
      const startTime = Date.now();
      const pong = await this.redis.ping();
      const latency = Date.now() - startTime;

      if (pong === 'PONG') {
        // Get Redis info
        const info = await this.redis.info('memory');
        const memoryMatch = info.match(/used_memory_human:(.+)/);
        const memory = memoryMatch ? memoryMatch[1].trim() : 'unknown';

        const connectionsInfo = await this.redis.info('clients');
        const connectionsMatch = connectionsInfo.match(/connected_clients:(\d+)/);
        const connections = connectionsMatch ? parseInt(connectionsMatch[1]) : 0;

        this.healthStatus.redis = {
          status: 'healthy',
          latency,
          memory,
          connections,
        };

        logger.debug('Redis health check passed', { latency, memory, connections });
      } else {
        throw new Error('Invalid Redis response');
      }
    } catch (error) {
      this.healthStatus.redis = {
        status: 'unhealthy',
      };
      logger.warn('Redis health check failed', { error });
    }
  }

  private async checkBackendServices(): Promise<void> {
    const serviceChecks = this.config.services.map(async (serviceName) => {
      try {
        const startTime = Date.now();
        const response = await fetch(
          `http://${serviceName}.fineprintai-services.svc.cluster.local:${this.getServicePort(serviceName)}/health`,
          {
            timeout: 5000,
            headers: {
              'User-Agent': 'fineprintai-gateway-healthcheck/1.0',
            },
          }
        );

        const responseTime = Date.now() - startTime;
        const serviceHealth = this.healthStatus.services.find(s => s.name === serviceName);

        if (!serviceHealth) return;

        if (response.ok) {
          const data = await response.json();
          
          serviceHealth.status = 'healthy';
          serviceHealth.responseTime = responseTime;
          serviceHealth.consecutiveFailures = 0;
          serviceHealth.lastCheck = new Date();
          serviceHealth.uptime = data.uptime || 'unknown';
          serviceHealth.error = undefined;

          logger.debug(`${serviceName} health check passed`, { responseTime });
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        const serviceHealth = this.healthStatus.services.find(s => s.name === serviceName);
        if (!serviceHealth) return;

        serviceHealth.consecutiveFailures += 1;
        serviceHealth.lastCheck = new Date();
        serviceHealth.error = error instanceof Error ? error.message : 'Unknown error';

        // Determine status based on consecutive failures
        if (serviceHealth.consecutiveFailures >= this.maxConsecutiveFailures) {
          serviceHealth.status = 'unhealthy';
        } else {
          serviceHealth.status = 'degraded';
        }

        logger.warn(`${serviceName} health check failed`, {
          error: serviceHealth.error,
          consecutiveFailures: serviceHealth.consecutiveFailures,
        });
      }
    });

    await Promise.allSettled(serviceChecks);
  }

  private updateOverallHealth(): void {
    const { kong, redis, services } = this.healthStatus;

    // Check if any critical components are unhealthy
    if (kong.status === 'unhealthy' || redis.status === 'unhealthy') {
      this.healthStatus.overall = 'unhealthy';
      return;
    }

    // Check service health
    const unhealthyServices = services.filter(s => s.status === 'unhealthy').length;
    const degradedServices = services.filter(s => s.status === 'degraded').length;
    const totalServices = services.length;

    if (unhealthyServices > totalServices * 0.5) {
      // More than 50% unhealthy
      this.healthStatus.overall = 'unhealthy';
    } else if (unhealthyServices > 0 || degradedServices > totalServices * 0.3) {
      // Any unhealthy or more than 30% degraded
      this.healthStatus.overall = 'degraded';
    } else {
      this.healthStatus.overall = 'healthy';
    }
  }

  private async storeHealthStatus(): Promise<void> {
    try {
      const healthData = JSON.stringify(this.healthStatus);
      await this.redis.setex('gateway:health:status', 300, healthData); // 5 minute TTL

      // Store individual service metrics for monitoring
      for (const service of this.healthStatus.services) {
        const key = `gateway:health:service:${service.name}`;
        const serviceData = JSON.stringify({
          status: service.status,
          responseTime: service.responseTime,
          consecutiveFailures: service.consecutiveFailures,
          lastCheck: service.lastCheck,
        });
        await this.redis.setex(key, 300, serviceData);
      }
    } catch (error) {
      logger.warn('Failed to store health status in Redis', { error });
    }
  }

  private getServicePort(serviceName: string): number {
    const portMap: Record<string, number> = {
      'analysis-service': 3001,
      'monitoring-service': 3002,
      'notification-service': 3003,
      'billing-service': 3004,
      'user-service': 3005,
      'analytics-service': 3007,
    };
    return portMap[serviceName] || 3000;
  }

  // Public methods for external access
  public getHealthStatus(): SystemHealth {
    return { ...this.healthStatus };
  }

  public getServiceHealth(serviceName: string): ServiceHealth | undefined {
    return this.healthStatus.services.find(s => s.name === serviceName);
  }

  public isHealthy(): boolean {
    return this.healthStatus.overall === 'healthy';
  }

  public isReady(): boolean {
    const { kong, redis } = this.healthStatus;
    return kong.status === 'healthy' && redis.status === 'healthy';
  }

  // Manual health check trigger
  public async triggerHealthCheck(): Promise<SystemHealth> {
    await this.performHealthChecks();
    return this.getHealthStatus();
  }

  // Get health history from Redis
  public async getHealthHistory(hours: number = 24): Promise<any[]> {
    try {
      const keys = await this.redis.keys('gateway:health:history:*');
      const now = Date.now();
      const cutoff = now - (hours * 60 * 60 * 1000);

      const validKeys = keys.filter(key => {
        const timestamp = parseInt(key.split(':').pop() || '0');
        return timestamp > cutoff;
      });

      const history = await Promise.all(
        validKeys.map(async (key) => {
          const data = await this.redis.get(key);
          return data ? JSON.parse(data) : null;
        })
      );

      return history.filter(Boolean).sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    } catch (error) {
      logger.error('Failed to get health history', { error });
      return [];
    }
  }
}