import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { EventEmitter } from 'events';
import {
  Integration,
  IntegrationType,
  IntegrationStatus,
  IntegrationConfiguration,
  IntegrationMetrics,
  IntegrationHook,
} from '@/types';
import { Logger } from '@/utils/logger';
import { Cache } from '@/utils/cache';
import { config } from '@/config';

export interface IntegrationEvent {
  type: string;
  source: IntegrationType;
  data: any;
  timestamp: Date;
}

export interface IntegrationHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency: number;
  errorRate: number;
  availability: number;
  lastCheck: Date;
}

export interface SyncResult {
  success: boolean;
  syncedItems: number;
  errors: string[];
  duration: number;
  timestamp: Date;
}

export class IntegrationManager extends EventEmitter {
  private readonly logger = Logger.getInstance();
  private readonly cache = new Cache('integrations');
  private readonly integrations: Map<string, Integration> = new Map();
  private readonly clients: Map<IntegrationType, AxiosInstance> = new Map();
  private readonly healthChecks: Map<IntegrationType, IntegrationHealth> = new Map();
  private syncIntervals: Map<IntegrationType, NodeJS.Timer> = new Map();

  constructor() {
    super();
    this.initializeIntegrations();
    this.setupHealthChecks();
  }

  /**
   * Initialize all integrations
   */
  private async initializeIntegrations(): Promise<void> {
    try {
      // Initialize DSPy Integration
      await this.initializeDSPyIntegration();
      
      // Initialize LoRA Integration
      await this.initializeLoRAIntegration();
      
      // Initialize Knowledge Graph Integration
      await this.initializeKnowledgeGraphIntegration();
      
      // Initialize Git Integration
      await this.initializeGitIntegration();
      
      // Initialize CI/CD Integration
      await this.initializeCICDIntegration();
      
      // Initialize Monitoring Integration
      await this.initializeMonitoringIntegration();

      this.logger.info('Integration manager initialized', {
        integrationCount: this.integrations.size,
        enabledIntegrations: Array.from(this.integrations.keys()),
      });

      // Start periodic sync for enabled integrations
      this.startPeriodicSync();
    } catch (error) {
      this.logger.error('Failed to initialize integrations', { error: error.message });
      throw error;
    }
  }

  /**
   * Get integration by type
   */
  getIntegration(type: IntegrationType): Integration | null {
    return this.integrations.get(type) || null;
  }

  /**
   * Update integration configuration
   */
  async updateIntegration(
    type: IntegrationType,
    configuration: Partial<IntegrationConfiguration>
  ): Promise<Integration> {
    try {
      const integration = this.integrations.get(type);
      if (!integration) {
        throw new Error(`Integration ${type} not found`);
      }

      // Update configuration
      integration.configuration = {
        ...integration.configuration,
        ...configuration,
      };

      // Reinitialize client if endpoint changed
      if (configuration.endpoint) {
        await this.createClient(type, integration.configuration);
      }

      // Update integration
      this.integrations.set(type, integration);

      this.logger.info('Integration updated', { type, configuration });
      this.emit('integration:updated', { type, integration });

      return integration;
    } catch (error) {
      this.logger.error('Failed to update integration', { type, error: error.message });
      throw error;
    }
  }

  /**
   * Test integration connectivity
   */
  async testIntegration(type: IntegrationType): Promise<IntegrationHealth> {
    try {
      const startTime = Date.now();
      const client = this.clients.get(type);
      
      if (!client) {
        throw new Error(`No client found for integration ${type}`);
      }

      // Perform health check based on integration type
      const result = await this.performHealthCheck(type, client);
      const latency = Date.now() - startTime;

      const health: IntegrationHealth = {
        status: result.success ? 'healthy' : 'unhealthy',
        latency,
        errorRate: result.errorRate || 0,
        availability: result.availability || (result.success ? 1 : 0),
        lastCheck: new Date(),
      };

      this.healthChecks.set(type, health);
      
      this.logger.info('Integration test completed', { type, health });
      this.emit('integration:tested', { type, health });

      return health;
    } catch (error) {
      const health: IntegrationHealth = {
        status: 'unhealthy',
        latency: 0,
        errorRate: 1,
        availability: 0,
        lastCheck: new Date(),
      };

      this.healthChecks.set(type, health);
      this.logger.error('Integration test failed', { type, error: error.message });
      
      return health;
    }
  }

  /**
   * Sync data with external system
   */
  async syncWithIntegration(
    type: IntegrationType,
    data?: any
  ): Promise<SyncResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting integration sync', { type });

      const integration = this.integrations.get(type);
      if (!integration || integration.status !== IntegrationStatus.ACTIVE) {
        throw new Error(`Integration ${type} is not available for sync`);
      }

      let result: SyncResult;

      switch (type) {
        case IntegrationType.DSPY:
          result = await this.syncWithDSPy(data);
          break;
        case IntegrationType.LORA:
          result = await this.syncWithLoRA(data);
          break;
        case IntegrationType.KNOWLEDGE_GRAPH:
          result = await this.syncWithKnowledgeGraph(data);
          break;
        case IntegrationType.GIT:
          result = await this.syncWithGit(data);
          break;
        case IntegrationType.CI_CD:
          result = await this.syncWithCICD(data);
          break;
        case IntegrationType.MONITORING:
          result = await this.syncWithMonitoring(data);
          break;
        default:
          throw new Error(`Sync not implemented for integration ${type}`);
      }

      // Update metrics
      this.updateIntegrationMetrics(type, result);

      // Execute hooks
      await this.executeHooks(type, 'sync_complete', { result, data });

      const duration = Date.now() - startTime;
      this.logger.info('Integration sync completed', { type, duration, result });
      this.emit('integration:synced', { type, result });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result: SyncResult = {
        success: false,
        syncedItems: 0,
        errors: [error.message],
        duration,
        timestamp: new Date(),
      };

      this.updateIntegrationMetrics(type, result);
      this.logger.error('Integration sync failed', { type, error: error.message, duration });
      this.emit('integration:sync_failed', { type, error });

      return result;
    }
  }

  /**
   * Send data to integration
   */
  async sendToIntegration(
    type: IntegrationType,
    endpoint: string,
    data: any,
    options?: AxiosRequestConfig
  ): Promise<any> {
    try {
      const client = this.clients.get(type);
      if (!client) {
        throw new Error(`No client found for integration ${type}`);
      }

      const response = await client.post(endpoint, data, options);
      
      // Update metrics
      const integration = this.integrations.get(type);
      if (integration) {
        integration.metrics.requestsSent++;
        integration.lastSync = new Date();
      }

      this.logger.debug('Data sent to integration', { type, endpoint, status: response.status });
      
      return response.data;
    } catch (error) {
      // Update error metrics
      const integration = this.integrations.get(type);
      if (integration) {
        integration.metrics.errorsEncountered++;
        integration.metrics.lastErrorTime = new Date();
        integration.metrics.lastErrorMessage = error.message;
      }

      this.logger.error('Failed to send data to integration', {
        type,
        endpoint,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Receive data from integration
   */
  async receiveFromIntegration(
    type: IntegrationType,
    endpoint: string,
    options?: AxiosRequestConfig
  ): Promise<any> {
    try {
      const client = this.clients.get(type);
      if (!client) {
        throw new Error(`No client found for integration ${type}`);
      }

      const response = await client.get(endpoint, options);
      
      // Update metrics
      const integration = this.integrations.get(type);
      if (integration) {
        integration.metrics.requestsReceived++;
        integration.lastSync = new Date();
      }

      this.logger.debug('Data received from integration', { type, endpoint, status: response.status });
      
      return response.data;
    } catch (error) {
      // Update error metrics
      const integration = this.integrations.get(type);
      if (integration) {
        integration.metrics.errorsEncountered++;
        integration.metrics.lastErrorTime = new Date();
        integration.metrics.lastErrorMessage = error.message;
      }

      this.logger.error('Failed to receive data from integration', {
        type,
        endpoint,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get integration health status
   */
  getIntegrationHealth(type: IntegrationType): IntegrationHealth | null {
    return this.healthChecks.get(type) || null;
  }

  /**
   * Get all integration health statuses
   */
  getAllIntegrationHealth(): Map<IntegrationType, IntegrationHealth> {
    return new Map(this.healthChecks);
  }

  /**
   * Disable integration
   */
  async disableIntegration(type: IntegrationType): Promise<void> {
    try {
      const integration = this.integrations.get(type);
      if (!integration) {
        throw new Error(`Integration ${type} not found`);
      }

      integration.status = IntegrationStatus.INACTIVE;
      
      // Stop periodic sync
      const interval = this.syncIntervals.get(type);
      if (interval) {
        clearInterval(interval);
        this.syncIntervals.delete(type);
      }

      this.logger.info('Integration disabled', { type });
      this.emit('integration:disabled', { type });
    } catch (error) {
      this.logger.error('Failed to disable integration', { type, error: error.message });
      throw error;
    }
  }

  /**
   * Enable integration
   */
  async enableIntegration(type: IntegrationType): Promise<void> {
    try {
      const integration = this.integrations.get(type);
      if (!integration) {
        throw new Error(`Integration ${type} not found`);
      }

      integration.status = IntegrationStatus.ACTIVE;
      
      // Test connectivity
      await this.testIntegration(type);
      
      // Start periodic sync
      this.startPeriodicSyncForIntegration(type);

      this.logger.info('Integration enabled', { type });
      this.emit('integration:enabled', { type });
    } catch (error) {
      this.logger.error('Failed to enable integration', { type, error: error.message });
      throw error;
    }
  }

  // Private Methods

  private async initializeDSPyIntegration(): Promise<void> {
    const integration: Integration = {
      id: 'dspy-integration',
      name: 'DSPy Integration',
      type: IntegrationType.DSPY,
      status: IntegrationStatus.ACTIVE,
      configuration: {
        endpoint: config.integrations.dspy,
        settings: {
          timeout: 30000,
          retries: 3,
          batchSize: 10,
        },
        hooks: [
          {
            event: 'code_generated',
            action: 'optimize_prompt',
            config: { enabled: true },
          },
          {
            event: 'quality_check',
            action: 'update_metrics',
            config: { enabled: true },
          },
        ],
      },
      lastSync: new Date(),
      metrics: this.createDefaultMetrics(),
    };

    this.integrations.set(IntegrationType.DSPY, integration);
    await this.createClient(IntegrationType.DSPY, integration.configuration);
  }

  private async initializeLoRAIntegration(): Promise<void> {
    const integration: Integration = {
      id: 'lora-integration',
      name: 'LoRA Integration',
      type: IntegrationType.LORA,
      status: IntegrationStatus.ACTIVE,
      configuration: {
        endpoint: config.integrations.lora,
        settings: {
          timeout: 60000,
          retries: 2,
          modelPath: '/models/lora',
        },
        hooks: [
          {
            event: 'model_update',
            action: 'refresh_cache',
            config: { enabled: true },
          },
        ],
      },
      lastSync: new Date(),
      metrics: this.createDefaultMetrics(),
    };

    this.integrations.set(IntegrationType.LORA, integration);
    await this.createClient(IntegrationType.LORA, integration.configuration);
  }

  private async initializeKnowledgeGraphIntegration(): Promise<void> {
    const integration: Integration = {
      id: 'knowledge-graph-integration',
      name: 'Knowledge Graph Integration',
      type: IntegrationType.KNOWLEDGE_GRAPH,
      status: IntegrationStatus.ACTIVE,
      configuration: {
        endpoint: config.integrations.knowledgeGraph,
        settings: {
          timeout: 45000,
          retries: 3,
          graphDatabase: 'neo4j',
        },
        hooks: [
          {
            event: 'pattern_discovered',
            action: 'update_graph',
            config: { enabled: true },
          },
          {
            event: 'code_analyzed',
            action: 'extract_entities',
            config: { enabled: true },
          },
        ],
      },
      lastSync: new Date(),
      metrics: this.createDefaultMetrics(),
    };

    this.integrations.set(IntegrationType.KNOWLEDGE_GRAPH, integration);
    await this.createClient(IntegrationType.KNOWLEDGE_GRAPH, integration.configuration);
  }

  private async initializeGitIntegration(): Promise<void> {
    const integration: Integration = {
      id: 'git-integration',
      name: 'Git Integration',
      type: IntegrationType.GIT,
      status: IntegrationStatus.ACTIVE,
      configuration: {
        endpoint: 'https://api.github.com',
        credentials: {
          token: config.env.GITHUB_TOKEN || '',
        },
        settings: {
          timeout: 30000,
          retries: 3,
          defaultBranch: 'main',
        },
        hooks: [
          {
            event: 'code_generated',
            action: 'create_pr',
            config: { enabled: false },
          },
          {
            event: 'template_created',
            action: 'commit_template',
            config: { enabled: true },
          },
        ],
      },
      lastSync: new Date(),
      metrics: this.createDefaultMetrics(),
    };

    this.integrations.set(IntegrationType.GIT, integration);
    await this.createClient(IntegrationType.GIT, integration.configuration);
  }

  private async initializeCICDIntegration(): Promise<void> {
    const integration: Integration = {
      id: 'cicd-integration',
      name: 'CI/CD Integration',
      type: IntegrationType.CI_CD,
      status: IntegrationStatus.INACTIVE, // Disabled by default
      configuration: {
        endpoint: 'https://api.github.com',
        settings: {
          timeout: 60000,
          retries: 2,
          workflowFile: '.github/workflows/deploy.yml',
        },
        hooks: [
          {
            event: 'deployment_ready',
            action: 'trigger_pipeline',
            config: { enabled: true },
          },
        ],
      },
      lastSync: new Date(),
      metrics: this.createDefaultMetrics(),
    };

    this.integrations.set(IntegrationType.CI_CD, integration);
    await this.createClient(IntegrationType.CI_CD, integration.configuration);
  }

  private async initializeMonitoringIntegration(): Promise<void> {
    const integration: Integration = {
      id: 'monitoring-integration',
      name: 'Monitoring Integration',
      type: IntegrationType.MONITORING,
      status: IntegrationStatus.ACTIVE,
      configuration: {
        endpoint: 'http://localhost:3005', // Monitoring service
        settings: {
          timeout: 15000,
          retries: 3,
          metricsInterval: 60000,
        },
        hooks: [
          {
            event: 'error_occurred',
            action: 'send_alert',
            config: { enabled: true },
          },
          {
            event: 'performance_degraded',
            action: 'log_metric',
            config: { enabled: true },
          },
        ],
      },
      lastSync: new Date(),
      metrics: this.createDefaultMetrics(),
    };

    this.integrations.set(IntegrationType.MONITORING, integration);
    await this.createClient(IntegrationType.MONITORING, integration.configuration);
  }

  private async createClient(
    type: IntegrationType,
    configuration: IntegrationConfiguration
  ): Promise<void> {
    try {
      if (!configuration.endpoint) {
        this.logger.warn('No endpoint configured for integration', { type });
        return;
      }

      const client = axios.create({
        baseURL: configuration.endpoint,
        timeout: configuration.settings?.timeout || 30000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'FinePrint-FullStack-Agent/1.0.0',
        },
      });

      // Add authentication if credentials are provided
      if (configuration.credentials?.token) {
        client.defaults.headers.Authorization = `Bearer ${configuration.credentials.token}`;
      }

      // Add request interceptor for metrics
      client.interceptors.request.use(
        (config) => {
          config.metadata = { startTime: Date.now() };
          return config;
        },
        (error) => {
          this.logger.error('Request interceptor error', { type, error: error.message });
          return Promise.reject(error);
        }
      );

      // Add response interceptor for metrics
      client.interceptors.response.use(
        (response) => {
          const duration = Date.now() - response.config.metadata.startTime;
          const integration = this.integrations.get(type);
          if (integration) {
            integration.metrics.averageResponseTime = 
              (integration.metrics.averageResponseTime + duration) / 2;
          }
          return response;
        },
        (error) => {
          const integration = this.integrations.get(type);
          if (integration) {
            integration.metrics.errorsEncountered++;
            integration.metrics.lastErrorTime = new Date();
            integration.metrics.lastErrorMessage = error.message;
          }
          return Promise.reject(error);
        }
      );

      this.clients.set(type, client);
      this.logger.debug('Integration client created', { type, endpoint: configuration.endpoint });
    } catch (error) {
      this.logger.error('Failed to create integration client', { type, error: error.message });
      throw error;
    }
  }

  private createDefaultMetrics(): IntegrationMetrics {
    return {
      requestsSent: 0,
      requestsReceived: 0,
      errorsEncountered: 0,
      averageResponseTime: 0,
    };
  }

  private setupHealthChecks(): void {
    // Perform health checks every 5 minutes
    setInterval(async () => {
      for (const [type, integration] of this.integrations) {
        if (integration.status === IntegrationStatus.ACTIVE) {
          try {
            await this.testIntegration(type);
          } catch (error) {
            this.logger.warn('Health check failed', { type, error: error.message });
          }
        }
      }
    }, 5 * 60 * 1000);
  }

  private startPeriodicSync(): void {
    for (const [type, integration] of this.integrations) {
      if (integration.status === IntegrationStatus.ACTIVE) {
        this.startPeriodicSyncForIntegration(type);
      }
    }
  }

  private startPeriodicSyncForIntegration(type: IntegrationType): void {
    const syncInterval = config.agent.integrations.syncInterval * 1000;
    
    const interval = setInterval(async () => {
      try {
        await this.syncWithIntegration(type);
      } catch (error) {
        this.logger.warn('Periodic sync failed', { type, error: error.message });
      }
    }, syncInterval);

    this.syncIntervals.set(type, interval);
    this.logger.debug('Periodic sync started', { type, interval: syncInterval });
  }

  private async performHealthCheck(
    type: IntegrationType,
    client: AxiosInstance
  ): Promise<{ success: boolean; errorRate?: number; availability?: number }> {
    try {
      let endpoint = '/health';
      
      // Use type-specific health check endpoints
      switch (type) {
        case IntegrationType.DSPY:
          endpoint = '/api/v1/health';
          break;
        case IntegrationType.KNOWLEDGE_GRAPH:
          endpoint = '/health';
          break;
        case IntegrationType.MONITORING:
          endpoint = '/health';
          break;
        default:
          endpoint = '/health';
      }

      const response = await client.get(endpoint);
      return {
        success: response.status === 200,
        errorRate: response.data?.errorRate || 0,
        availability: response.data?.availability || 1,
      };
    } catch (error) {
      return { success: false, errorRate: 1, availability: 0 };
    }
  }

  // Integration-specific sync methods

  private async syncWithDSPy(data?: any): Promise<SyncResult> {
    try {
      const client = this.clients.get(IntegrationType.DSPY);
      if (!client) throw new Error('DSPy client not available');

      // Sync prompt optimization data
      const response = await client.post('/api/v1/sync', {
        type: 'code_generation_metrics',
        data: data || {},
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        syncedItems: response.data?.syncedItems || 1,
        errors: [],
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        syncedItems: 0,
        errors: [error.message],
        duration: 0,
        timestamp: new Date(),
      };
    }
  }

  private async syncWithLoRA(data?: any): Promise<SyncResult> {
    try {
      const client = this.clients.get(IntegrationType.LORA);
      if (!client) throw new Error('LoRA client not available');

      // Sync model updates and feedback
      const response = await client.post('/api/v1/sync', {
        type: 'model_feedback',
        data: data || {},
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        syncedItems: response.data?.syncedItems || 1,
        errors: [],
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        syncedItems: 0,
        errors: [error.message],
        duration: 0,
        timestamp: new Date(),
      };
    }
  }

  private async syncWithKnowledgeGraph(data?: any): Promise<SyncResult> {
    try {
      const client = this.clients.get(IntegrationType.KNOWLEDGE_GRAPH);
      if (!client) throw new Error('Knowledge Graph client not available');

      // Sync code patterns and relationships
      const response = await client.post('/api/v1/sync', {
        type: 'code_patterns',
        data: data || {},
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        syncedItems: response.data?.syncedItems || 1,
        errors: [],
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        syncedItems: 0,
        errors: [error.message],
        duration: 0,
        timestamp: new Date(),
      };
    }
  }

  private async syncWithGit(data?: any): Promise<SyncResult> {
    // Git sync would involve template management, etc.
    return {
      success: true,
      syncedItems: 0,
      errors: [],
      duration: 0,
      timestamp: new Date(),
    };
  }

  private async syncWithCICD(data?: any): Promise<SyncResult> {
    // CI/CD sync would involve pipeline status, etc.
    return {
      success: true,
      syncedItems: 0,
      errors: [],
      duration: 0,
      timestamp: new Date(),
    };
  }

  private async syncWithMonitoring(data?: any): Promise<SyncResult> {
    try {
      const client = this.clients.get(IntegrationType.MONITORING);
      if (!client) throw new Error('Monitoring client not available');

      // Send metrics to monitoring service
      const metrics = this.collectMetrics();
      const response = await client.post('/api/v1/metrics', metrics);

      return {
        success: true,
        syncedItems: Object.keys(metrics).length,
        errors: [],
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        syncedItems: 0,
        errors: [error.message],
        duration: 0,
        timestamp: new Date(),
      };
    }
  }

  private updateIntegrationMetrics(type: IntegrationType, result: SyncResult): void {
    const integration = this.integrations.get(type);
    if (!integration) return;

    if (result.success) {
      integration.metrics.requestsSent++;
    } else {
      integration.metrics.errorsEncountered++;
      integration.metrics.lastErrorTime = new Date();
      integration.metrics.lastErrorMessage = result.errors.join('; ');
    }

    integration.lastSync = new Date();
  }

  private async executeHooks(
    type: IntegrationType,
    event: string,
    data: any
  ): Promise<void> {
    try {
      const integration = this.integrations.get(type);
      if (!integration) return;

      const relevantHooks = integration.configuration.hooks.filter(
        hook => hook.event === event && hook.config?.enabled
      );

      for (const hook of relevantHooks) {
        try {
          await this.executeHook(type, hook, data);
        } catch (error) {
          this.logger.warn('Hook execution failed', {
            type,
            event,
            action: hook.action,
            error: error.message,
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to execute hooks', { type, event, error: error.message });
    }
  }

  private async executeHook(
    type: IntegrationType,
    hook: IntegrationHook,
    data: any
  ): Promise<void> {
    this.logger.debug('Executing hook', { type, event: hook.event, action: hook.action });

    switch (hook.action) {
      case 'optimize_prompt':
        await this.optimizePromptHook(type, data);
        break;
      case 'update_metrics':
        await this.updateMetricsHook(type, data);
        break;
      case 'refresh_cache':
        await this.refreshCacheHook(type, data);
        break;
      case 'update_graph':
        await this.updateGraphHook(type, data);
        break;
      case 'extract_entities':
        await this.extractEntitiesHook(type, data);
        break;
      case 'send_alert':
        await this.sendAlertHook(type, data);
        break;
      case 'log_metric':
        await this.logMetricHook(type, data);
        break;
      default:
        this.logger.warn('Unknown hook action', { action: hook.action });
    }
  }

  // Hook implementations
  private async optimizePromptHook(type: IntegrationType, data: any): Promise<void> {
    // Implementation for prompt optimization
  }

  private async updateMetricsHook(type: IntegrationType, data: any): Promise<void> {
    // Implementation for metrics update
  }

  private async refreshCacheHook(type: IntegrationType, data: any): Promise<void> {
    await this.cache.clear('*');
  }

  private async updateGraphHook(type: IntegrationType, data: any): Promise<void> {
    // Implementation for graph update
  }

  private async extractEntitiesHook(type: IntegrationType, data: any): Promise<void> {
    // Implementation for entity extraction
  }

  private async sendAlertHook(type: IntegrationType, data: any): Promise<void> {
    this.emit('alert', { type, data });
  }

  private async logMetricHook(type: IntegrationType, data: any): Promise<void> {
    this.logger.info('Metric logged via hook', { type, data });
  }

  private collectMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};

    for (const [type, integration] of this.integrations) {
      metrics[type] = {
        status: integration.status,
        metrics: integration.metrics,
        health: this.healthChecks.get(type),
        lastSync: integration.lastSync,
      };
    }

    return metrics;
  }
}