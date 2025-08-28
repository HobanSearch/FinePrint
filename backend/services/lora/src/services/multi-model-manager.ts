/**
 * Multi-Model Manager for Business Domain-Specific Models
 * Handles model lifecycle, version control, and intelligent model selection
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createServiceLogger } from '../mocks/shared-logger';
import { PythonLoRAIntegration, AdapterInfo } from './python-integration';

const logger = createServiceLogger('multi-model-manager');

export interface ModelVersion {
  version: string;
  adapterPath: string;
  baseModel: string;
  createdAt: Date;
  performance: {
    accuracy: number;
    latency: number;
    throughput: number;
    errorRate: number;
  };
  metadata: {
    trainingDataSize: number;
    epochs: number;
    finalLoss: number;
    parameters: number;
  };
  status: 'active' | 'inactive' | 'testing' | 'deprecated';
  deploymentInfo?: {
    modelName: string;
    deployedAt: Date;
    endpoint?: string;
  };
}

export interface DomainModelConfig {
  domain: string;
  activeVersion: string;
  versions: ModelVersion[];
  selectionStrategy: 'latest' | 'best_performance' | 'lowest_latency' | 'ab_test';
  abTestConfig?: {
    enabled: boolean;
    distribution: Record<string, number>; // version -> percentage
    metrics: string[];
  };
  fallbackVersion?: string;
  autoUpdate: boolean;
  performanceThresholds: {
    minAccuracy: number;
    maxLatency: number;
    maxErrorRate: number;
  };
}

export interface ModelSelectionContext {
  domain: string;
  userTier?: string;
  requestPriority?: 'low' | 'medium' | 'high';
  latencyRequirement?: number;
  accuracyRequirement?: number;
  sessionId?: string;
}

export interface ModelUsageMetrics {
  modelVersion: string;
  domain: string;
  requestCount: number;
  successCount: number;
  errorCount: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  lastUsed: Date;
}

export class MultiModelManager extends EventEmitter {
  private domainConfigs: Map<string, DomainModelConfig> = new Map();
  private modelRegistry: Map<string, ModelVersion> = new Map();
  private usageMetrics: Map<string, ModelUsageMetrics> = new Map();
  private pythonIntegration: PythonLoRAIntegration;
  private modelStoragePath: string;
  private metricsInterval?: NodeJS.Timeout;

  constructor(
    pythonIntegration: PythonLoRAIntegration,
    modelStoragePath: string = '/app/models'
  ) {
    super();
    this.pythonIntegration = pythonIntegration;
    this.modelStoragePath = modelStoragePath;
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Multi-Model Manager...');

    // Create model storage directory
    await this.ensureDirectoryExists(this.modelStoragePath);

    // Load existing model configurations
    await this.loadModelConfigurations();

    // Sync with Python backend for available adapters
    await this.syncAdaptersFromBackend();

    // Start metrics collection
    this.startMetricsCollection();

    // Set up event listeners
    this.setupEventListeners();

    logger.info('Multi-Model Manager initialized', {
      domains: Array.from(this.domainConfigs.keys()),
      totalModels: this.modelRegistry.size
    });
  }

  /**
   * Register a new model version for a domain
   */
  async registerModel(
    domain: string,
    adapterInfo: AdapterInfo,
    makeActive: boolean = false
  ): Promise<ModelVersion> {
    logger.info('Registering new model', {
      domain,
      jobId: adapterInfo.job_id,
      makeActive
    });

    // Create model version
    const version = this.generateVersionId(domain, adapterInfo.created_at);
    const modelVersion: ModelVersion = {
      version,
      adapterPath: adapterInfo.adapter_path,
      baseModel: adapterInfo.base_model,
      createdAt: new Date(adapterInfo.created_at),
      performance: {
        accuracy: 0.9, // Default, will be updated after evaluation
        latency: 100,
        throughput: 10,
        errorRate: 0.01
      },
      metadata: {
        trainingDataSize: 0,
        epochs: 3,
        finalLoss: adapterInfo.performance_metrics.final_loss || 0,
        parameters: adapterInfo.performance_metrics.parameters_added || 0
      },
      status: makeActive ? 'active' : 'testing'
    };

    // Register in model registry
    const modelId = `${domain}:${version}`;
    this.modelRegistry.set(modelId, modelVersion);

    // Update domain configuration
    let domainConfig = this.domainConfigs.get(domain);
    if (!domainConfig) {
      domainConfig = this.createDefaultDomainConfig(domain);
      this.domainConfigs.set(domain, domainConfig);
    }

    domainConfig.versions.push(modelVersion);
    
    if (makeActive) {
      domainConfig.activeVersion = version;
      modelVersion.status = 'active';
    }

    // Save configuration
    await this.saveDomainConfiguration(domain, domainConfig);

    // Emit event
    this.emit('model:registered', {
      domain,
      version,
      modelId,
      active: makeActive
    });

    return modelVersion;
  }

  /**
   * Select the best model for a given context
   */
  async selectModel(context: ModelSelectionContext): Promise<ModelVersion | null> {
    const domainConfig = this.domainConfigs.get(context.domain);
    if (!domainConfig || domainConfig.versions.length === 0) {
      logger.warn('No models available for domain', { domain: context.domain });
      return null;
    }

    let selectedVersion: ModelVersion | null = null;

    switch (domainConfig.selectionStrategy) {
      case 'latest':
        selectedVersion = this.selectLatestModel(domainConfig);
        break;

      case 'best_performance':
        selectedVersion = this.selectBestPerformanceModel(domainConfig, context);
        break;

      case 'lowest_latency':
        selectedVersion = this.selectLowestLatencyModel(domainConfig, context);
        break;

      case 'ab_test':
        selectedVersion = this.selectABTestModel(domainConfig, context);
        break;

      default:
        selectedVersion = this.getActiveModel(domainConfig);
    }

    if (selectedVersion) {
      // Update usage metrics
      this.updateUsageMetrics(context.domain, selectedVersion.version);
      
      logger.debug('Model selected', {
        domain: context.domain,
        version: selectedVersion.version,
        strategy: domainConfig.selectionStrategy
      });
    }

    return selectedVersion;
  }

  /**
   * Update model performance metrics based on real usage
   */
  async updateModelPerformance(
    domain: string,
    version: string,
    metrics: Partial<ModelVersion['performance']>
  ): Promise<void> {
    const modelId = `${domain}:${version}`;
    const model = this.modelRegistry.get(modelId);
    
    if (!model) {
      logger.warn('Model not found for performance update', { modelId });
      return;
    }

    // Update performance metrics with exponential moving average
    const alpha = 0.3; // Smoothing factor
    model.performance = {
      accuracy: metrics.accuracy !== undefined 
        ? alpha * metrics.accuracy + (1 - alpha) * model.performance.accuracy
        : model.performance.accuracy,
      latency: metrics.latency !== undefined
        ? alpha * metrics.latency + (1 - alpha) * model.performance.latency
        : model.performance.latency,
      throughput: metrics.throughput !== undefined
        ? alpha * metrics.throughput + (1 - alpha) * model.performance.throughput
        : model.performance.throughput,
      errorRate: metrics.errorRate !== undefined
        ? alpha * metrics.errorRate + (1 - alpha) * model.performance.errorRate
        : model.performance.errorRate
    };

    // Check if model meets performance thresholds
    const domainConfig = this.domainConfigs.get(domain);
    if (domainConfig) {
      await this.checkPerformanceThresholds(domain, version, model, domainConfig);
    }

    // Save updated metrics
    await this.saveModelMetrics(modelId, model);
  }

  /**
   * Promote a model version to active status
   */
  async promoteModel(domain: string, version: string): Promise<void> {
    const domainConfig = this.domainConfigs.get(domain);
    if (!domainConfig) {
      throw new Error(`Domain ${domain} not found`);
    }

    const modelToPromote = domainConfig.versions.find(v => v.version === version);
    if (!modelToPromote) {
      throw new Error(`Model version ${version} not found in domain ${domain}`);
    }

    // Deactivate current active model
    const currentActive = domainConfig.versions.find(v => v.status === 'active');
    if (currentActive) {
      currentActive.status = 'inactive';
    }

    // Promote new model
    modelToPromote.status = 'active';
    domainConfig.activeVersion = version;

    // Deploy to Ollama if needed
    if (!modelToPromote.deploymentInfo) {
      await this.deployModel(domain, version);
    }

    await this.saveDomainConfiguration(domain, domainConfig);

    logger.info('Model promoted to active', { domain, version });
    
    this.emit('model:promoted', {
      domain,
      version,
      previousVersion: currentActive?.version
    });
  }

  /**
   * Deploy a model to Ollama for inference
   */
  async deployModel(domain: string, version: string): Promise<void> {
    const modelId = `${domain}:${version}`;
    const model = this.modelRegistry.get(modelId);
    
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    const modelName = `fineprintai-${domain}-${version}`;
    
    try {
      const deploymentInfo = await this.pythonIntegration.deployAdapter(
        model.adapterPath,
        modelName
      );

      model.deploymentInfo = {
        modelName: deploymentInfo.model_name,
        deployedAt: new Date(deploymentInfo.deployed_at),
        endpoint: `ollama://localhost:11434/api/generate/${modelName}`
      };

      await this.saveModelMetrics(modelId, model);

      logger.info('Model deployed successfully', {
        domain,
        version,
        modelName
      });

      this.emit('model:deployed', {
        domain,
        version,
        modelName,
        endpoint: model.deploymentInfo.endpoint
      });

    } catch (error) {
      logger.error('Failed to deploy model', {
        domain,
        version,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Rollback to a previous model version
   */
  async rollbackModel(domain: string, targetVersion?: string): Promise<void> {
    const domainConfig = this.domainConfigs.get(domain);
    if (!domainConfig) {
      throw new Error(`Domain ${domain} not found`);
    }

    let versionToRollback: string;

    if (targetVersion) {
      // Rollback to specific version
      const targetModel = domainConfig.versions.find(v => v.version === targetVersion);
      if (!targetModel) {
        throw new Error(`Target version ${targetVersion} not found`);
      }
      versionToRollback = targetVersion;
    } else {
      // Rollback to fallback version or previous active
      if (domainConfig.fallbackVersion) {
        versionToRollback = domainConfig.fallbackVersion;
      } else {
        // Find the previous active version
        const versions = domainConfig.versions
          .filter(v => v.status !== 'deprecated')
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        
        if (versions.length < 2) {
          throw new Error('No previous version available for rollback');
        }
        
        versionToRollback = versions[1].version;
      }
    }

    await this.promoteModel(domain, versionToRollback);

    logger.info('Model rolled back', {
      domain,
      rolledBackTo: versionToRollback,
      from: domainConfig.activeVersion
    });
  }

  /**
   * Get A/B test results for a domain
   */
  async getABTestResults(domain: string): Promise<Record<string, any>> {
    const domainConfig = this.domainConfigs.get(domain);
    if (!domainConfig || !domainConfig.abTestConfig?.enabled) {
      return {};
    }

    const results: Record<string, any> = {};

    for (const version of domainConfig.versions) {
      const metricsKey = `${domain}:${version.version}:usage`;
      const usage = this.usageMetrics.get(metricsKey);
      
      if (usage) {
        results[version.version] = {
          requestCount: usage.requestCount,
          successRate: usage.successCount / usage.requestCount,
          errorRate: usage.errorCount / usage.requestCount,
          averageLatency: usage.averageLatency,
          p95Latency: usage.p95Latency,
          p99Latency: usage.p99Latency,
          performance: version.performance
        };
      }
    }

    return results;
  }

  // Private helper methods

  private async loadModelConfigurations(): Promise<void> {
    try {
      const configPath = path.join(this.modelStoragePath, 'configurations');
      await this.ensureDirectoryExists(configPath);

      const files = await fs.readdir(configPath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const domain = file.replace('.json', '');
          const content = await fs.readFile(path.join(configPath, file), 'utf-8');
          const config = JSON.parse(content) as DomainModelConfig;
          
          // Restore Date objects
          config.versions.forEach(v => {
            v.createdAt = new Date(v.createdAt);
            if (v.deploymentInfo) {
              v.deploymentInfo.deployedAt = new Date(v.deploymentInfo.deployedAt);
            }
          });

          this.domainConfigs.set(domain, config);

          // Register models in registry
          for (const version of config.versions) {
            const modelId = `${domain}:${version.version}`;
            this.modelRegistry.set(modelId, version);
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to load model configurations', { error: error.message });
    }
  }

  private async syncAdaptersFromBackend(): Promise<void> {
    try {
      const adapters = await this.pythonIntegration.listAdapters();
      
      for (const adapter of adapters) {
        const modelId = `${adapter.domain}:${adapter.job_id}`;
        
        // Check if already registered
        if (!this.modelRegistry.has(modelId)) {
          await this.registerModel(adapter.domain, adapter, false);
        }
      }
    } catch (error) {
      logger.error('Failed to sync adapters from backend', { error: error.message });
    }
  }

  private createDefaultDomainConfig(domain: string): DomainModelConfig {
    return {
      domain,
      activeVersion: '',
      versions: [],
      selectionStrategy: 'latest',
      autoUpdate: true,
      performanceThresholds: {
        minAccuracy: 0.8,
        maxLatency: 200,
        maxErrorRate: 0.05
      }
    };
  }

  private generateVersionId(domain: string, createdAt: string): string {
    const date = new Date(createdAt);
    const timestamp = date.getTime();
    return `v${timestamp}-${domain.substring(0, 3)}`;
  }

  private selectLatestModel(config: DomainModelConfig): ModelVersion | null {
    const activeModels = config.versions
      .filter(v => v.status === 'active' || v.status === 'testing')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    return activeModels[0] || null;
  }

  private selectBestPerformanceModel(
    config: DomainModelConfig,
    context: ModelSelectionContext
  ): ModelVersion | null {
    const eligibleModels = config.versions.filter(v => 
      v.status === 'active' &&
      v.performance.accuracy >= (context.accuracyRequirement || config.performanceThresholds.minAccuracy) &&
      v.performance.latency <= (context.latencyRequirement || config.performanceThresholds.maxLatency)
    );

    if (eligibleModels.length === 0) {
      return this.getActiveModel(config);
    }

    // Score models based on weighted performance metrics
    const scored = eligibleModels.map(model => ({
      model,
      score: (
        model.performance.accuracy * 0.5 +
        (1 - model.performance.errorRate) * 0.3 +
        (1 / model.performance.latency) * 0.2
      )
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored[0].model;
  }

  private selectLowestLatencyModel(
    config: DomainModelConfig,
    context: ModelSelectionContext
  ): ModelVersion | null {
    const eligibleModels = config.versions.filter(v =>
      v.status === 'active' &&
      v.performance.accuracy >= (context.accuracyRequirement || config.performanceThresholds.minAccuracy)
    );

    if (eligibleModels.length === 0) {
      return this.getActiveModel(config);
    }

    eligibleModels.sort((a, b) => a.performance.latency - b.performance.latency);
    return eligibleModels[0];
  }

  private selectABTestModel(
    config: DomainModelConfig,
    context: ModelSelectionContext
  ): ModelVersion | null {
    if (!config.abTestConfig?.enabled || !config.abTestConfig.distribution) {
      return this.getActiveModel(config);
    }

    // Use session ID for consistent model selection per user
    const sessionHash = context.sessionId ? 
      this.hashString(context.sessionId) % 100 : 
      Math.random() * 100;

    let cumulative = 0;
    for (const [version, percentage] of Object.entries(config.abTestConfig.distribution)) {
      cumulative += percentage;
      if (sessionHash <= cumulative) {
        const model = config.versions.find(v => v.version === version);
        if (model && model.status === 'active') {
          return model;
        }
      }
    }

    return this.getActiveModel(config);
  }

  private getActiveModel(config: DomainModelConfig): ModelVersion | null {
    return config.versions.find(v => v.version === config.activeVersion) || null;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private async checkPerformanceThresholds(
    domain: string,
    version: string,
    model: ModelVersion,
    config: DomainModelConfig
  ): Promise<void> {
    const thresholds = config.performanceThresholds;
    const violations = [];

    if (model.performance.accuracy < thresholds.minAccuracy) {
      violations.push(`accuracy (${model.performance.accuracy} < ${thresholds.minAccuracy})`);
    }

    if (model.performance.latency > thresholds.maxLatency) {
      violations.push(`latency (${model.performance.latency}ms > ${thresholds.maxLatency}ms)`);
    }

    if (model.performance.errorRate > thresholds.maxErrorRate) {
      violations.push(`error rate (${model.performance.errorRate} > ${thresholds.maxErrorRate})`);
    }

    if (violations.length > 0) {
      logger.warn('Model performance threshold violations', {
        domain,
        version,
        violations
      });

      this.emit('model:performance_degraded', {
        domain,
        version,
        violations,
        metrics: model.performance
      });

      // Auto-rollback if this is the active model and auto-update is enabled
      if (model.status === 'active' && config.autoUpdate) {
        logger.info('Auto-rolling back due to performance degradation', {
          domain,
          version
        });
        await this.rollbackModel(domain);
      }
    }
  }

  private updateUsageMetrics(domain: string, version: string): void {
    const metricsKey = `${domain}:${version}:usage`;
    let metrics = this.usageMetrics.get(metricsKey);

    if (!metrics) {
      metrics = {
        modelVersion: version,
        domain,
        requestCount: 0,
        successCount: 0,
        errorCount: 0,
        averageLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        lastUsed: new Date()
      };
      this.usageMetrics.set(metricsKey, metrics);
    }

    metrics.requestCount++;
    metrics.lastUsed = new Date();
  }

  private startMetricsCollection(): void {
    // Collect metrics every minute
    this.metricsInterval = setInterval(() => {
      this.collectAndPersistMetrics();
    }, 60000);
  }

  private async collectAndPersistMetrics(): Promise<void> {
    try {
      const metricsPath = path.join(this.modelStoragePath, 'metrics');
      await this.ensureDirectoryExists(metricsPath);

      const timestamp = new Date().toISOString();
      const metricsData = {
        timestamp,
        usage: Array.from(this.usageMetrics.entries()).map(([key, metrics]) => ({
          key,
          ...metrics
        })),
        models: Array.from(this.modelRegistry.entries()).map(([id, model]) => ({
          id,
          performance: model.performance,
          status: model.status
        }))
      };

      const filename = `metrics-${timestamp.split('T')[0]}.json`;
      await fs.writeFile(
        path.join(metricsPath, filename),
        JSON.stringify(metricsData, null, 2)
      );
    } catch (error) {
      logger.error('Failed to persist metrics', { error: error.message });
    }
  }

  private async saveDomainConfiguration(domain: string, config: DomainModelConfig): Promise<void> {
    const configPath = path.join(this.modelStoragePath, 'configurations');
    await this.ensureDirectoryExists(configPath);

    await fs.writeFile(
      path.join(configPath, `${domain}.json`),
      JSON.stringify(config, null, 2)
    );
  }

  private async saveModelMetrics(modelId: string, model: ModelVersion): Promise<void> {
    const metricsPath = path.join(this.modelStoragePath, 'models');
    await this.ensureDirectoryExists(metricsPath);

    await fs.writeFile(
      path.join(metricsPath, `${modelId.replace(':', '_')}.json`),
      JSON.stringify(model, null, 2)
    );
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  private setupEventListeners(): void {
    // Listen for new model training completions
    this.pythonIntegration.on('training_completed', async (data) => {
      logger.info('Training completed event received', data);
      
      // Auto-register new models if enabled
      const domain = data.domain;
      const domainConfig = this.domainConfigs.get(domain);
      
      if (domainConfig?.autoUpdate) {
        try {
          const adapters = await this.pythonIntegration.listAdapters();
          const newAdapter = adapters.find(a => a.job_id === data.job_id);
          
          if (newAdapter) {
            await this.registerModel(domain, newAdapter, false);
            
            // Evaluate the new model
            await this.evaluateNewModel(domain, newAdapter);
          }
        } catch (error) {
          logger.error('Failed to auto-register new model', {
            domain,
            jobId: data.job_id,
            error: error.message
          });
        }
      }
    });
  }

  private async evaluateNewModel(domain: string, adapter: AdapterInfo): Promise<void> {
    // This would typically run evaluation tests on the new model
    // For now, we'll simulate with random performance metrics
    const modelId = `${domain}:${adapter.job_id}`;
    const model = this.modelRegistry.get(modelId);
    
    if (model) {
      await this.updateModelPerformance(domain, model.version, {
        accuracy: 0.85 + Math.random() * 0.1,
        latency: 80 + Math.random() * 40,
        throughput: 8 + Math.random() * 4,
        errorRate: Math.random() * 0.02
      });
    }
  }

  /**
   * Get domain configuration
   */
  async getDomainConfig(domain: string): Promise<DomainModelConfig | null> {
    return this.domainConfigs.get(domain) || null;
  }

  /**
   * Update domain configuration
   */
  async updateDomainConfig(domain: string, updates: Partial<DomainModelConfig>): Promise<void> {
    const config = this.domainConfigs.get(domain);
    if (!config) {
      throw new Error(`Domain ${domain} not found`);
    }

    // Update configuration
    Object.assign(config, updates);

    // Save updated configuration
    await this.saveDomainConfiguration(domain, config);

    logger.info('Domain configuration updated', { domain, updates });
  }

  /**
   * Get all domain configurations
   */
  getAllDomainConfigs(): Map<string, DomainModelConfig> {
    return new Map(this.domainConfigs);
  }

  /**
   * Get model by ID
   */
  getModel(domain: string, version: string): ModelVersion | null {
    const modelId = `${domain}:${version}`;
    return this.modelRegistry.get(modelId) || null;
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    
    // Save final metrics
    await this.collectAndPersistMetrics();
    
    logger.info('Multi-Model Manager shutdown complete');
  }
}