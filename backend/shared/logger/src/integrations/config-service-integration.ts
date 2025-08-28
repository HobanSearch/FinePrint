/**
 * Configuration Service Integration for Fine Print AI Logging System
 * Integrates with the shared config service for dynamic configuration management
 */

import { EventEmitter } from 'events';
import { LoggerService } from '../services/logger-service';
import { ServiceType, Environment } from '../types';

interface ConfigServiceConfig {
  baseUrl: string;
  apiKey?: string;
  timeout: number;
  retryAttempts: number;
  enableCaching: boolean;
  cacheTTL: number; // seconds
}

interface LoggingConfiguration {
  logLevel: string;
  enableFeatures: {
    metrics: boolean;
    tracing: boolean;
    streaming: boolean;
    analytics: boolean;
    alerting: boolean;
  };
  sampling: {
    enabled: boolean;
    rate: number;
  };
  retention: {
    logs: number; // days
    metrics: number; // days
    traces: number; // days
  };
  alerting: {
    emailEnabled: boolean;
    slackEnabled: boolean;
    webhookEnabled: boolean;
  };
}

export class ConfigServiceIntegration extends EventEmitter {
  private baseUrl: string;
  private logger: LoggerService;
  private config: ConfigServiceConfig;
  private configCache: Map<string, { value: any; expiry: number }> = new Map();
  private pollInterval?: NodeJS.Timeout;
  private initialized = false;

  constructor(baseUrl: string, logger: LoggerService) {
    super();
    this.baseUrl = baseUrl;
    this.logger = logger;
    this.config = {
      baseUrl,
      timeout: 5000,
      retryAttempts: 3,
      enableCaching: true,
      cacheTTL: 300, // 5 minutes
    };
  }

  /**
   * Initialize the config service integration
   */
  async initialize(): Promise<void> {
    try {
      // Test connection to config service
      await this.testConnection();

      // Start configuration polling
      this.startConfigPolling();

      this.initialized = true;

      this.logger.info('Config service integration initialized', {
        service: 'config-integration' as ServiceType,
        environment: 'production' as Environment,
        baseUrl: this.baseUrl,
      });

      this.emit('initialized');
    } catch (error) {
      this.logger.error('Failed to initialize config service integration', {
        service: 'config-integration' as ServiceType,
        environment: 'production' as Environment,
        baseUrl: this.baseUrl,
      }, error as Error);

      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Get logging configuration from config service
   */
  async getLoggingConfiguration(): Promise<LoggingConfiguration | null> {
    try {
      const config = await this.getConfiguration('logging');
      
      if (config) {
        this.logger.debug('Retrieved logging configuration', {
          service: 'config-integration' as ServiceType,
          environment: 'production' as Environment,
          configKeys: Object.keys(config),
        });
      }

      return config as LoggingConfiguration;
    } catch (error) {
      this.logger.error('Failed to get logging configuration', {
        service: 'config-integration' as ServiceType,
        environment: 'production' as Environment,
      }, error as Error);

      return null;
    }
  }

  /**
   * Get feature flags for logging system
   */
  async getFeatureFlags(): Promise<Record<string, boolean>> {
    try {
      const flags = await this.getConfiguration('feature-flags.logging');
      
      return flags || {
        enableAdvancedAnalytics: true,
        enableRealTimeStreaming: true,
        enableMLAnomalyDetection: false,
        enableBusinessInsights: true,
        enableComplianceLogging: true,
      };
    } catch (error) {
      this.logger.error('Failed to get feature flags', {
        service: 'config-integration' as ServiceType,
        environment: 'production' as Environment,
      }, error as Error);

      return {};
    }
  }

  /**
   * Get alert configuration
   */
  async getAlertConfiguration(): Promise<any> {
    try {
      const alertConfig = await this.getConfiguration('alerting');
      
      return alertConfig || {
        defaultChannels: ['email'],
        escalationPolicies: {
          default: {
            levels: [
              { delay: 15, channels: ['email'] },
              { delay: 30, channels: ['email', 'slack'] },
              { delay: 60, channels: ['email', 'slack', 'pagerduty'] },
            ],
          },
        },
        thresholds: {
          errorRate: 0.05,
          responseTime: 5000,
          availability: 0.95,
        },
      };
    } catch (error) {
      this.logger.error('Failed to get alert configuration', {
        service: 'config-integration' as ServiceType,
        environment: 'production' as Environment,
      }, error as Error);

      return null;
    }
  }

  /**
   * Update configuration in config service
   */
  async updateConfiguration(key: string, value: any): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/api/v1/config/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
        },
      });

      if (response.ok) {
        // Invalidate cache
        this.configCache.delete(key);
        
        this.logger.info('Configuration updated', {
          service: 'config-integration' as ServiceType,
          environment: 'production' as Environment,
          configKey: key,
        });

        this.emit('config-updated', { key, value });
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error('Failed to update configuration', {
        service: 'config-integration' as ServiceType,
        environment: 'production' as Environment,
        configKey: key,
      }, error as Error);

      return false;
    }
  }

  /**
   * Subscribe to configuration changes
   */
  async subscribeToConfigChanges(keys: string[]): Promise<void> {
    try {
      // This would implement WebSocket or Server-Sent Events subscription
      // For now, we'll use polling
      
      this.logger.info('Subscribed to configuration changes', {
        service: 'config-integration' as ServiceType,
        environment: 'production' as Environment,
        keys,
      });

      this.emit('subscription-active', { keys });
    } catch (error) {
      this.logger.error('Failed to subscribe to configuration changes', {
        service: 'config-integration' as ServiceType,
        environment: 'production' as Environment,
        keys,
      }, error as Error);
    }
  }

  /**
   * Get configuration with caching
   */
  private async getConfiguration(key: string, useCache: boolean = true): Promise<any> {
    // Check cache first
    if (useCache && this.config.enableCaching) {
      const cached = this.configCache.get(key);
      if (cached && cached.expiry > Date.now()) {
        return cached.value;
      }
    }

    try {
      const response = await this.makeRequest(`/api/v1/config/${key}`, {
        method: 'GET',
        headers: {
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
        },
      });

      if (response.ok) {
        const data = await response.json();
        const value = data.value || data;

        // Cache the result
        if (this.config.enableCaching) {
          this.configCache.set(key, {
            value,
            expiry: Date.now() + (this.config.cacheTTL * 1000),
          });
        }

        return value;
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      this.logger.warn('Failed to get configuration, using cache or defaults', {
        service: 'config-integration' as ServiceType,
        environment: 'production' as Environment,
        configKey: key,
      }, error as Error);

      // Try cache even if it's expired
      const cached = this.configCache.get(key);
      if (cached) {
        return cached.value;
      }

      throw error;
    }
  }

  /**
   * Make HTTP request with retry logic
   */
  private async makeRequest(path: string, options: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeout);
        return response;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.retryAttempts) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }

  /**
   * Test connection to config service
   */
  private async testConnection(): Promise<void> {
    try {
      const response = await this.makeRequest('/health', {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Config service health check failed: ${response.status}`);
      }

      this.logger.debug('Config service connection test successful', {
        service: 'config-integration' as ServiceType,
        environment: 'production' as Environment,
        baseUrl: this.baseUrl,
      });
    } catch (error) {
      throw new Error(`Cannot connect to config service: ${error}`);
    }
  }

  /**
   * Start configuration polling for changes
   */
  private startConfigPolling(): void {
    const pollKeys = [
      'logging',
      'feature-flags.logging',
      'alerting',
      'metrics',
      'tracing',
    ];

    this.pollInterval = setInterval(async () => {
      try {
        for (const key of pollKeys) {
          const currentValue = await this.getConfiguration(key, false);
          const cachedValue = this.configCache.get(key)?.value;

          if (JSON.stringify(currentValue) !== JSON.stringify(cachedValue)) {
            this.logger.info('Configuration change detected', {
              service: 'config-integration' as ServiceType,
              environment: 'production' as Environment,
              configKey: key,
            });

            this.emit('config-changed', { key, value: currentValue, previousValue: cachedValue });
          }
        }
      } catch (error) {
        this.logger.error('Error during configuration polling', {
          service: 'config-integration' as ServiceType,
          environment: 'production' as Environment,
        }, error as Error);
      }
    }, 30000); // Poll every 30 seconds
  }

  /**
   * Clear configuration cache
   */
  clearCache(): void {
    this.configCache.clear();
    
    this.logger.debug('Configuration cache cleared', {
      service: 'config-integration' as ServiceType,
      environment: 'production' as Environment,
    });
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    keys: string[];
    hitRate: number;
  } {
    return {
      size: this.configCache.size,
      keys: Array.from(this.configCache.keys()),
      hitRate: 0, // Would need to track hits/misses for actual calculation
    };
  }

  /**
   * Shutdown the integration
   */
  async shutdown(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.logger.info('Config service integration shut down', {
      service: 'config-integration' as ServiceType,
      environment: 'production' as Environment,
    });

    this.emit('shutdown');
  }
}