/**
 * Config Service Integration
 * Connects with the shared config service for dynamic configuration
 */

import { ConfigServiceIntegration, MemoryServiceConfig } from '../types';
import { Logger } from '../utils/logger';

export class ConfigServiceIntegrationAdapter implements ConfigServiceIntegration {
  private logger: Logger;
  private configServiceUrl: string;

  constructor(configServiceUrl: string = 'http://localhost:3000') {
    this.configServiceUrl = configServiceUrl;
    this.logger = Logger.getInstance('ConfigServiceIntegration');
  }

  async getMemoryConfig(agentId: string): Promise<MemoryServiceConfig> {
    try {
      const response = await fetch(
        `${this.configServiceUrl}/api/v1/configuration/agent/${agentId}/memory`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Config service responded with ${response.status}`);
      }

      const config = await response.json();
      this.logger.debug(`Retrieved memory config for agent ${agentId}`);
      
      return config.data;
    } catch (error) {
      this.logger.error(`Failed to get memory config for agent ${agentId}:`, error);
      
      // Return default config on failure
      return this.getDefaultConfig();
    }
  }

  async updateMemoryConfig(
    agentId: string, 
    config: Partial<MemoryServiceConfig>
  ): Promise<void> {
    try {
      const response = await fetch(
        `${this.configServiceUrl}/api/v1/configuration/agent/${agentId}/memory`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ config }),
        }
      );

      if (!response.ok) {
        throw new Error(`Config service responded with ${response.status}`);
      }

      this.logger.debug(`Updated memory config for agent ${agentId}`);
    } catch (error) {
      this.logger.error(`Failed to update memory config for agent ${agentId}:`, error);
      throw error;
    }
  }

  private getDefaultConfig(): MemoryServiceConfig {
    return {
      storage: {
        redis: {
          host: 'localhost',
          port: 6379,
          db: 0,
          ttl: 3600,
          maxMemorySize: 1073741824,
          keyPrefix: 'memory:',
          compressionEnabled: false,
        },
        postgresql: {
          databaseUrl: 'postgresql://localhost:5432/fineprint_memory',
          maxConnections: 20,
          connectionTimeout: 5000,
          queryTimeout: 30000,
          enableVectorSearch: true,
          vectorDimensions: 384,
        },
        s3: {
          bucket: 'fineprint-memory',
          region: 'us-east-1',
          accessKeyId: '',
          secretAccessKey: '',
          compressionLevel: 6,
          keyPrefix: 'memories/',
          lifecycleRules: {
            transitionToIA: 30,
            transitionToGlacier: 90,
            expiration: 2555,
          },
        },
        tierMigration: {
          hotToWarmDays: 7,
          warmToColdDays: 30,
          batchSize: 100,
          migrationSchedule: '0 2 * * *',
        },
      },
      consolidation: {
        enabled: true,
        threshold: 0.8,
        schedule: '0 3 * * *',
      },
      lifecycle: {
        enabled: true,
        cleanupSchedule: '0 4 * * *',
        retentionPolicies: {},
      },
      sharing: {
        enabled: true,
        defaultPermissions: {
          canRead: true,
          canWrite: false,
          canDelete: false,
          canShare: false,
        },
      },
      security: {
        encryptionEnabled: false,
        accessLogging: true,
        auditTrail: true,
      },
    };
  }
}