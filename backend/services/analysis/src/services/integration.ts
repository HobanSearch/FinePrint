import { createServiceLogger } from '@fineprintai/shared-logger';
import { modelManager } from './modelManager';
import { textProcessor } from './textProcessor';
import { patternLibrary } from './patterns';
import { embeddingService } from './embeddings';
import { riskScoringEngine } from './riskScoring';
import { enhancedAnalysisEngine, AnalysisRequest } from './enhancedAnalysis';
import { queueManager } from './queueManager';
import { progressTracker } from './progressTracker';
import { performanceMonitor } from './performanceMonitor';
import { AnalysisService } from './analysis';

const logger = createServiceLogger('integration-service');

export interface IntegrationConfig {
  maxConcurrentJobs?: number;
  cacheEnabled?: boolean;
  monitoringEnabled?: boolean;
  websocketPort?: number;
  defaultModelPreference?: 'speed' | 'accuracy' | 'balanced';
  enableEmbeddings?: boolean;
  enableProgressTracking?: boolean;
}

export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  lastCheck: Date;
  responseTime?: number;
  metadata?: any;
}

export interface SystemStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: ServiceHealth[];
  lastUpdate: Date;
  version: string;
  uptime: number;
}

export class IntegrationService {
  private config: IntegrationConfig;
  private isInitialized = false;
  private startTime: Date;
  private analysisService: AnalysisService;
  private healthCheckIntervalId?: NodeJS.Timeout;

  constructor(config: IntegrationConfig = {}) {
    this.config = {
      maxConcurrentJobs: 5,
      cacheEnabled: true,
      monitoringEnabled: true,
      websocketPort: 8001,
      defaultModelPreference: 'balanced',
      enableEmbeddings: true,
      enableProgressTracking: true,
      ...config
    };

    this.startTime = new Date();
    this.analysisService = new AnalysisService();

    logger.info('Integration Service created', { config: this.config });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Integration Service already initialized');
      return;
    }

    logger.info('Initializing Fine Print AI Analysis System');

    try {
      // Initialize services in dependency order
      logger.info('Step 1/8: Initializing Model Manager');
      await modelManager.initialize();

      logger.info('Step 2/8: Initializing Embedding Service');
      await embeddingService.initialize();

      logger.info('Step 3/8: Initializing Enhanced Analysis Engine');
      await enhancedAnalysisEngine.initialize();

      logger.info('Step 4/8: Initializing Queue Manager');
      await queueManager.initialize();

      if (this.config.enableProgressTracking) {
        logger.info('Step 5/8: Starting Progress Tracker');
        await progressTracker.start();
      } else {
        logger.info('Step 5/8: Progress tracking disabled, skipping');
      }

      if (this.config.monitoringEnabled) {
        logger.info('Step 6/8: Starting Performance Monitor');
        await performanceMonitor.start();
      } else {
        logger.info('Step 6/8: Performance monitoring disabled, skipping');
      }

      logger.info('Step 7/8: Setting up service integrations');
      await this.setupServiceIntegrations();

      logger.info('Step 8/8: Starting health monitoring');
      this.startHealthMonitoring();

      this.isInitialized = true;

      logger.info('Fine Print AI Analysis System initialized successfully', {
        initializationTime: Date.now() - this.startTime.getTime(),
        enabledServices: this.getEnabledServices(),
        config: this.config
      });

    } catch (error) {
      logger.error('Failed to initialize Integration Service', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      logger.warn('Integration Service not initialized, nothing to shutdown');
      return;
    }

    logger.info('Shutting down Fine Print AI Analysis System');

    try {
      // Stop health monitoring
      if (this.healthCheckIntervalId) {
        clearInterval(this.healthCheckIntervalId);
      }

      // Shutdown services in reverse order
      if (this.config.monitoringEnabled) {
        logger.info('Stopping Performance Monitor');
        await performanceMonitor.stop();
      }

      if (this.config.enableProgressTracking) {
        logger.info('Stopping Progress Tracker');
        await progressTracker.stop();
      }

      logger.info('Stopping Queue Manager');
      await queueManager.shutdown();

      logger.info('System shutdown completed');
      this.isInitialized = false;

    } catch (error) {
      logger.error('Error during shutdown', { error: error.message });
      throw error;
    }
  }

  // Main analysis entry point
  async analyzeDocument(request: AnalysisRequest): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Integration Service not initialized');
    }

    logger.info('Starting document analysis', {
      analysisId: request.analysisId,
      documentId: request.documentId,
      userId: request.userId,
      hasContent: !!request.content,
      hasFile: !!request.fileBuffer,
      hasUrl: !!request.url
    });

    try {
      // Add job to queue
      const jobId = await queueManager.addJob(
        request.analysisId,
        request.documentId,
        request.userId,
        request,
        this.determinePriority(request)
      );

      logger.info('Analysis job queued', {
        jobId,
        analysisId: request.analysisId,
        queuePosition: this.getQueuePosition(jobId)
      });

      return jobId;

    } catch (error) {
      logger.error('Failed to queue analysis', {
        error: error.message,
        analysisId: request.analysisId
      });

      // Track error
      if (this.config.monitoringEnabled) {
        performanceMonitor.trackError('queueing', error.message);
      }

      throw error;
    }
  }

  // Batch analysis
  async analyzeBatch(requests: Array<{
    analysisId: string;
    documentId: string;
    userId: string;
    request: AnalysisRequest;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  }>): Promise<string[]> {
    if (!this.isInitialized) {
      throw new Error('Integration Service not initialized');
    }

    logger.info('Starting batch analysis', {
      batchSize: requests.length,
      userIds: [...new Set(requests.map(r => r.userId))]
    });

    try {
      const jobIds = await queueManager.addBatchJobs({
        jobs: requests,
        maxConcurrency: this.config.maxConcurrentJobs
      });

      logger.info('Batch analysis jobs queued', {
        batchSize: requests.length,
        jobIds: jobIds.length
      });

      return jobIds;

    } catch (error) {
      logger.error('Failed to queue batch analysis', {
        error: error.message,
        batchSize: requests.length
      });

      throw error;
    }
  }

  // Get analysis status
  async getAnalysisStatus(analysisId: string, userId: string): Promise<{
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress?: any;
    result?: any;
    error?: string;
  }> {
    try {
      // First check the database
      const analysis = await this.analysisService.getAnalysisById(analysisId, userId);
      
      if (analysis) {
        return {
          status: analysis.status,
          result: analysis.status === 'completed' ? analysis : undefined,
          error: analysis.status === 'failed' ? 'Analysis failed' : undefined
        };
      }

      // Then check the queue
      const queueJobs = queueManager.getJobsByAnalysis(analysisId);
      const userJob = queueJobs.find(job => job.userId === userId);

      if (userJob) {
        const progress = this.config.enableProgressTracking 
          ? progressTracker.getAnalysisProgress(analysisId)
          : null;

        return {
          status: userJob.status,
          progress,
          result: userJob.result,
          error: userJob.error
        };
      }

      // Not found
      return {
        status: 'failed',
        error: 'Analysis not found'
      };

    } catch (error) {
      logger.error('Failed to get analysis status', {
        error: error.message,
        analysisId,
        userId
      });

      return {
        status: 'failed',
        error: error.message
      };
    }
  }

  // Cancel analysis
  async cancelAnalysis(analysisId: string, userId: string): Promise<boolean> {
    try {
      const queueJobs = queueManager.getJobsByAnalysis(analysisId);
      const userJob = queueJobs.find(job => job.userId === userId);

      if (userJob) {
        const cancelled = await queueManager.cancelJob(userJob.id);
        
        if (cancelled) {
          logger.info('Analysis cancelled', { analysisId, userId });
          return true;
        }
      }

      return false;

    } catch (error) {
      logger.error('Failed to cancel analysis', {
        error: error.message,
        analysisId,
        userId
      });
      return false;
    }
  }

  // System health and status
  async getSystemStatus(): Promise<SystemStatus> {
    const services: ServiceHealth[] = [];

    // Check Model Manager
    try {
      const modelStatus = modelManager.getModelStatus();
      const availableModels = Object.keys(modelStatus).length;
      
      services.push({
        service: 'Model Manager',
        status: availableModels > 0 ? 'healthy' : 'degraded',
        message: `${availableModels} models available`,
        lastCheck: new Date(),
        metadata: { availableModels, modelStatus }
      });
    } catch (error) {
      services.push({
        service: 'Model Manager',
        status: 'unhealthy',
        message: error.message,
        lastCheck: new Date()
      });
    }

    // Check Embedding Service
    try {
      const startTime = Date.now();
      const isHealthy = await embeddingService.healthCheck();
      const responseTime = Date.now() - startTime;
      
      services.push({
        service: 'Embedding Service',
        status: isHealthy ? 'healthy' : 'unhealthy',
        message: isHealthy ? 'Service operational' : 'Service unavailable',
        lastCheck: new Date(),
        responseTime,
        metadata: await embeddingService.getEmbeddingStats()
      });
    } catch (error) {
      services.push({
        service: 'Embedding Service',
        status: 'unhealthy',
        message: error.message,
        lastCheck: new Date()
      });
    }

    // Check Queue Manager
    try {
      const queueStats = queueManager.getStats();
      const status = queueStats.currentLoad > 0.9 ? 'degraded' : 'healthy';
      
      services.push({
        service: 'Queue Manager',
        status,
        message: `${queueStats.processingJobs}/${queueStats.totalJobs} jobs, ${Math.round(queueStats.currentLoad * 100)}% load`,
        lastCheck: new Date(),
        metadata: queueStats
      });
    } catch (error) {
      services.push({
        service: 'Queue Manager',
        status: 'unhealthy',
        message: error.message,
        lastCheck: new Date()
      });
    }

    // Check Progress Tracker (if enabled)
    if (this.config.enableProgressTracking) {
      try {
        const trackerStats = progressTracker.getStats();
        
        services.push({
          service: 'Progress Tracker',
          status: 'healthy',
          message: `${trackerStats.totalConnections} active connections`,
          lastCheck: new Date(),
          metadata: trackerStats
        });
      } catch (error) {
        services.push({
          service: 'Progress Tracker',
          status: 'unhealthy',
          message: error.message,
          lastCheck: new Date()
        });
      }
    }

    // Check Performance Monitor (if enabled)
    if (this.config.monitoringEnabled) {
      try {
        const healthStatus = performanceMonitor.getHealthStatus();
        
        services.push({
          service: 'Performance Monitor',
          status: healthStatus.status === 'healthy' ? 'healthy' : 
                   healthStatus.status === 'warning' ? 'degraded' : 'unhealthy',
          message: `${Object.keys(healthStatus.checks).length} health checks`,
          lastCheck: new Date(),
          metadata: healthStatus
        });
      } catch (error) {
        services.push({
          service: 'Performance Monitor',
          status: 'unhealthy',
          message: error.message,
          lastCheck: new Date()
        });
      }
    }

    // Determine overall status
    const unhealthyCount = services.filter(s => s.status === 'unhealthy').length;
    const degradedCount = services.filter(s => s.status === 'degraded').length;
    
    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (unhealthyCount > 0) {
      overall = 'unhealthy';
    } else if (degradedCount > 0) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }

    return {
      overall,
      services,
      lastUpdate: new Date(),
      version: '1.0.0',
      uptime: Date.now() - this.startTime.getTime()
    };
  }

  // Configuration management
  updateConfiguration(updates: Partial<IntegrationConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...updates };

    logger.info('Configuration updated', {
      oldConfig,
      newConfig: this.config,
      changes: Object.keys(updates)
    });

    // Apply configuration changes
    if (updates.maxConcurrentJobs && updates.maxConcurrentJobs !== oldConfig.maxConcurrentJobs) {
      queueManager.adjustCapacity(updates.maxConcurrentJobs);
    }
  }

  getConfiguration(): IntegrationConfig {
    return { ...this.config };
  }

  // Statistics and monitoring
  async getSystemStatistics(): Promise<{
    analysis: any;
    queue: any;
    models: any;
    system?: any;
    cache?: any;
  }> {
    const stats: any = {
      analysis: await this.analysisService.getAnalysisStats(),
      queue: queueManager.getStats(),
      models: modelManager.getModelStatus()
    };

    if (this.config.monitoringEnabled) {
      stats.system = performanceMonitor.getCurrentSystemMetrics();
      stats.cache = performanceMonitor.getCurrentCacheMetrics();
    }

    return stats;
  }

  // Private helper methods
  private async setupServiceIntegrations(): Promise<void> {
    // Set up queue-to-progress tracker integration
    if (this.config.enableProgressTracking) {
      queueManager.on('jobProgress', (data) => {
        // Map job progress to analysis progress and broadcast
        const progressUpdate = {
          analysisId: data.analysisId || data.jobId,
          userId: data.userId || 'unknown',
          step: data.step,
          percentage: data.percentage,
          message: data.message,
          timestamp: new Date()
        };
        
        progressTracker.broadcastProgress(progressUpdate);
      });
    }

    // Set up performance monitoring integrations
    if (this.config.monitoringEnabled) {
      queueManager.on('jobStarted', (job) => {
        performanceMonitor.trackRequest('analysis', job.assignedModel);
      });

      queueManager.on('jobCompleted', (job) => {
        if (job.actualDuration) {
          performanceMonitor.trackResponse('analysis', job.actualDuration, job.assignedModel);
        }
      });

      queueManager.on('jobFailed', (job) => {
        performanceMonitor.trackError('analysis', job.error || 'Unknown error', job.assignedModel);
      });
    }

    logger.info('Service integrations setup completed');
  }

  private determinePriority(request: AnalysisRequest): 'low' | 'normal' | 'high' | 'urgent' {
    // Basic priority logic - can be enhanced based on business rules
    if (request.options?.modelPreference === 'accuracy') {
      return 'high'; // High accuracy requests get higher priority
    }
    
    if (request.fileBuffer && request.fileBuffer.length > 10 * 1024 * 1024) {
      return 'low'; // Large files get lower priority
    }
    
    return 'normal';
  }

  private getQueuePosition(jobId: string): number {
    // This would need to be implemented in the queue manager
    return 0;
  }

  private getEnabledServices(): string[] {
    const services = ['Model Manager', 'Text Processor', 'Pattern Library', 'Risk Scoring Engine', 'Queue Manager'];
    
    if (this.config.enableEmbeddings) services.push('Embedding Service');
    if (this.config.enableProgressTracking) services.push('Progress Tracker');
    if (this.config.monitoringEnabled) services.push('Performance Monitor');
    
    return services;
  }

  private startHealthMonitoring(): void {
    this.healthCheckIntervalId = setInterval(async () => {
      try {
        const status = await this.getSystemStatus();
        
        if (status.overall !== 'healthy') {
          logger.warn('System health check failed', {
            overall: status.overall,
            unhealthyServices: status.services.filter(s => s.status === 'unhealthy').map(s => s.service)
          });
        }
        
      } catch (error) {
        logger.error('Health monitoring error', { error: error.message });
      }
    }, 60000); // Every minute

    logger.info('Health monitoring started');
  }

  // Public getters for service instances (for advanced usage)
  get services() {
    return {
      modelManager,
      textProcessor,
      patternLibrary,
      embeddingService,
      riskScoringEngine,
      enhancedAnalysisEngine,
      queueManager,
      progressTracker: this.config.enableProgressTracking ? progressTracker : null,
      performanceMonitor: this.config.monitoringEnabled ? performanceMonitor : null,
      analysisService: this.analysisService
    };
  }
}

// Export singleton instance
export const integrationService = new IntegrationService();