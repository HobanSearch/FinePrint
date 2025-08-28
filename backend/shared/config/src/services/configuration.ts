// Configuration Management Service
// Handles dynamic configuration loading, validation, and hot-reloading

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { ConfigurationSchema } from '../schemas';
import { z } from 'zod';

export interface ConfigurationOptions {
  serviceName: string;
  environment: string;
  config: Record<string, any>;
  description?: string;
  tags?: string[];
  updatedBy?: string;
}

export interface ServiceRegistration {
  serviceName: string;
  displayName: string;
  description?: string;
  version: string;
  endpoints: string[];
  healthCheck?: string;
  requiredConfigs: string[];
  optionalConfigs: string[];
  environment: string;
  tags: string[];
}

export class ConfigurationService extends EventEmitter {
  private prisma: PrismaClient;
  private redis: Redis;
  private cachePrefix = 'config:';
  private cacheTTL = 300; // 5 minutes
  private subscriptions = new Map<string, Set<string>>(); // serviceName -> connectionIds

  constructor(prisma: PrismaClient, redis: Redis) {
    super();
    this.prisma = prisma;
    this.redis = redis;

    // Set up Redis pub/sub for configuration changes
    this.setupConfigurationChangeSubscription();
  }

  // Get configuration for a service
  async getConfiguration(
    serviceName: string,
    environment: string,
    version?: number
  ): Promise<any | null> {
    const cacheKey = `${this.cachePrefix}${serviceName}:${environment}${version ? `:${version}` : ''}`;
    
    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Query database
    const where: any = {
      serviceName,
      environment,
      isActive: true,
    };

    if (version) {
      where.version = version;
    }

    const config = await this.prisma.configuration.findFirst({
      where,
      orderBy: { version: 'desc' },
      include: {
        secrets: false, // Secrets handled separately
      },
    });

    if (!config) {
      return null;
    }

    const result = {
      id: config.id,
      serviceName: config.serviceName,
      environment: config.environment,
      version: config.version,
      config: config.config,
      description: config.description,
      tags: config.tags,
      isActive: config.isActive,
      isValid: config.isValid,
      validationErrors: config.validationErrors,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };

    // Cache the result
    await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));

    return result;
  }

  // Update configuration for a service
  async updateConfiguration(
    serviceName: string,
    environment: string,
    config: Record<string, any>,
    options: {
      description?: string;
      tags?: string[];
      updatedBy?: string;
      validate?: boolean;
    } = {}
  ): Promise<any> {
    const { description, tags, updatedBy, validate = true } = options;

    // Validate configuration if requested
    let validationErrors = null;
    let isValid = true;

    if (validate) {
      try {
        // Get service schema for validation
        const service = await this.prisma.serviceRegistry.findUnique({
          where: { serviceName },
        });

        if (service?.configSchema) {
          const schema = z.object(service.configSchema as any);
          schema.parse(config);
        } else {
          // Use default configuration schema
          ConfigurationSchema.parse(config);
        }
      } catch (error) {
        isValid = false;
        validationErrors = error instanceof z.ZodError ? error.errors : { message: String(error) };
      }
    }

    // Get current version
    const currentConfig = await this.prisma.configuration.findFirst({
      where: {
        serviceName,
        environment,
        isActive: true,
      },
      orderBy: { version: 'desc' },
    });

    // Deactivate previous version
    if (currentConfig) {
      await this.prisma.configuration.update({
        where: { id: currentConfig.id },
        data: { isActive: false },
      });
    }

    // Create new configuration version
    const newVersion = (currentConfig?.version || 0) + 1;

    const newConfig = await this.prisma.configuration.create({
      data: {
        serviceName,
        environment,
        version: newVersion,
        config,
        description,
        tags: tags || [],
        isActive: true,
        isValid,
        validationErrors,
        updatedBy,
      },
    });

    // Create audit log
    await this.createAuditLog(
      newConfig.id,
      'UPDATE',
      currentConfig,
      newConfig,
      updatedBy
    );

    // Clear cache
    await this.clearConfigurationCache(serviceName, environment);

    // Notify subscribers of configuration change
    await this.notifyConfigurationChange(serviceName, environment, newConfig);

    // Emit event for WebSocket updates
    this.emit('configurationUpdated', {
      serviceName,
      environment,
      version: newVersion,
      config: newConfig,
    });

    return newConfig;
  }

  // Trigger configuration reload for a service
  async triggerConfigurationReload(
    serviceName: string,
    environment: string,
    force: boolean = false
  ): Promise<void> {
    // Clear cache to force fresh load
    await this.clearConfigurationCache(serviceName, environment);

    // Publish reload event
    const reloadEvent = {
      type: 'CONFIGURATION_RELOAD',
      serviceName,
      environment,
      timestamp: new Date().toISOString(),
      force,
    };

    await this.redis.publish(`config:reload:${serviceName}:${environment}`, JSON.stringify(reloadEvent));

    // Emit event for WebSocket updates
    this.emit('configurationReload', reloadEvent);
  }

  // Get configuration history
  async getConfigurationHistory(
    serviceName: string,
    environment: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<any[]> {
    const configurations = await this.prisma.configuration.findMany({
      where: {
        serviceName,
        environment,
      },
      orderBy: { version: 'desc' },
      take: limit,
      skip: offset,
      include: {
        auditLogs: {
          take: 1,
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    return configurations.map(config => ({
      id: config.id,
      version: config.version,
      description: config.description,
      tags: config.tags,
      isActive: config.isActive,
      isValid: config.isValid,
      validationErrors: config.validationErrors,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      createdBy: config.createdBy,
      updatedBy: config.updatedBy,
      lastAuditLog: config.auditLogs[0] || null,
    }));
  }

  // Register a service
  async registerService(
    registration: ServiceRegistration,
    registeredBy?: string
  ): Promise<any> {
    const existingService = await this.prisma.serviceRegistry.findUnique({
      where: { serviceName: registration.serviceName },
    });

    let service;
    if (existingService) {
      // Update existing service
      service = await this.prisma.serviceRegistry.update({
        where: { serviceName: registration.serviceName },
        data: {
          displayName: registration.displayName,
          description: registration.description,
          version: registration.version,
          endpoints: registration.endpoints,
          healthCheck: registration.healthCheck,
          requiredConfigs: registration.requiredConfigs,
          optionalConfigs: registration.optionalConfigs,
          tags: registration.tags,
          lastSeen: new Date(),
        },
      });
    } else {
      // Create new service
      service = await this.prisma.serviceRegistry.create({
        data: {
          serviceName: registration.serviceName,
          displayName: registration.displayName,
          description: registration.description,
          version: registration.version,
          endpoints: registration.endpoints,
          healthCheck: registration.healthCheck,
          requiredConfigs: registration.requiredConfigs,
          optionalConfigs: registration.optionalConfigs,
          environment: registration.environment,
          tags: registration.tags,
          registeredBy,
        },
      });
    }

    // Emit service registration event
    this.emit('serviceRegistered', service);

    return service;
  }

  // Get all registered services
  async getRegisteredServices(environment?: string): Promise<any[]> {
    const where: any = {
      isActive: true,
    };

    if (environment) {
      where.environment = environment;
    }

    return await this.prisma.serviceRegistry.findMany({
      where,
      orderBy: { lastSeen: 'desc' },
    });
  }

  // Subscribe to configuration changes
  async subscribeToConfigurationChanges(
    serviceName: string,
    connectionId: string
  ): Promise<void> {
    if (!this.subscriptions.has(serviceName)) {
      this.subscriptions.set(serviceName, new Set());
    }
    this.subscriptions.get(serviceName)!.add(connectionId);

    // Store subscription in database for persistence
    await this.prisma.configurationSubscription.upsert({
      where: { connectionId },
      update: {
        serviceName,
        lastPing: new Date(),
        isActive: true,
      },
      create: {
        serviceName,
        connectionId,
        endpoint: '', // Will be set by WebSocket handler
        environment: 'production', // Default
        isActive: true,
      },
    });
  }

  // Unsubscribe from configuration changes
  async unsubscribeFromConfigurationChanges(
    serviceName: string,
    connectionId: string
  ): Promise<void> {
    const subscribers = this.subscriptions.get(serviceName);
    if (subscribers) {
      subscribers.delete(connectionId);
      if (subscribers.size === 0) {
        this.subscriptions.delete(serviceName);
      }
    }

    // Mark subscription as inactive
    await this.prisma.configurationSubscription.updateMany({
      where: { connectionId },
      data: { isActive: false },
    });
  }

  // Health check
  async healthCheck(): Promise<{ healthy: boolean; details?: any }> {
    try {
      // Test database connection
      await this.prisma.$queryRaw`SELECT 1`;
      
      // Test Redis connection
      await this.redis.ping();

      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: String(error),
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  // Private helper methods

  private async setupConfigurationChangeSubscription(): Promise<void> {
    // Subscribe to configuration change events from Redis
    const subscriber = this.redis.duplicate();
    
    await subscriber.psubscribe('config:*');
    
    subscriber.on('pmessage', (pattern, channel, message) => {
      try {
        const event = JSON.parse(message);
        this.emit('configurationChangeNotification', event);
      } catch (error) {
        console.error('Failed to parse configuration change event:', error);
      }
    });
  }

  private async notifyConfigurationChange(
    serviceName: string,
    environment: string,
    config: any
  ): Promise<void> {
    const changeEvent = {
      type: 'CONFIGURATION_CHANGED',
      serviceName,
      environment,
      version: config.version,
      timestamp: new Date().toISOString(),
      config: config.config,
    };

    // Publish to Redis for other instances
    await this.redis.publish(
      `config:change:${serviceName}:${environment}`,
      JSON.stringify(changeEvent)
    );
  }

  private async clearConfigurationCache(
    serviceName: string,
    environment: string
  ): Promise<void> {
    const pattern = `${this.cachePrefix}${serviceName}:${environment}*`;
    const keys = await this.redis.keys(pattern);
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  private async createAuditLog(
    configurationId: string,
    action: string,
    previousValue: any,
    newValue: any,
    performedBy?: string
  ): Promise<void> {
    await this.prisma.configurationAuditLog.create({
      data: {
        configurationId,
        action,
        previousValue: previousValue ? JSON.stringify(previousValue) : null,
        newValue: newValue ? JSON.stringify(newValue) : null,
        changes: this.calculateChanges(previousValue, newValue),
        environment: newValue?.environment || 'production',
        performedBy,
      },
    });
  }

  private calculateChanges(oldValue: any, newValue: any): any {
    if (!oldValue || !newValue) return null;

    const changes: Record<string, any> = {};
    const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);

    for (const key of allKeys) {
      if (JSON.stringify(oldValue[key]) !== JSON.stringify(newValue[key])) {
        changes[key] = {
          from: oldValue[key],
          to: newValue[key],
        };
      }
    }

    return Object.keys(changes).length > 0 ? changes : null;
  }
}