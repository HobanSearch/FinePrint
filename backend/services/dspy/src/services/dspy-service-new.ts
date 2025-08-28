/**
 * DSPy Service - Main Integration Layer
 * Coordinates with Python DSPy service for production prompt optimization
 */

import { PythonDSPyService, LegalAnalysisInput, LegalAnalysisResult } from './python-dspy-service';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { MemoryService } from '@fineprintai/shared-memory';
import { EventEmitter } from 'events';

const logger = createServiceLogger('dspy-service');

export interface DSPyModule {
  name: string;
  signature: string;
  description: string;
  compiled: boolean;
  version: string;
  optimization_history: OptimizationRecord[];
}

export interface OptimizationRecord {
  timestamp: string;
  optimizer: string;
  dataset_size: number;
  performance_before: number;
  performance_after: number;
  improvement_percentage: number;
  compilation_time_ms: number;
}

// Re-export types for compatibility
export { LegalAnalysisInput, LegalAnalysisResult };

export class DSPyService extends EventEmitter {
  private pythonService: PythonDSPyService;
  private memory: MemoryService;
  private isHealthy: boolean = false;

  constructor() {
    super();
    
    this.pythonService = new PythonDSPyService();
    this.memory = new MemoryService();
    
    this.setupEventListeners();
    
    logger.info('DSPy Service initialized with Python backend integration');
  }

  private setupEventListeners(): void {
    this.pythonService.on('ready', () => {
      this.isHealthy = true;
      this.emit('ready');
      logger.info('DSPy Service ready - Python backend connected');
    });

    this.pythonService.on('error', (error) => {
      this.isHealthy = false;
      this.emit('error', error);
      logger.error('DSPy Service error', { error });
    });

    this.pythonService.on('disconnected', () => {
      this.isHealthy = false;
      this.emit('disconnected');
      logger.warn('DSPy Service disconnected from Python backend');
    });

    this.pythonService.on('reconnected', () => {
      this.isHealthy = true;
      this.emit('reconnected');
      logger.info('DSPy Service reconnected to Python backend');
    });

    this.pythonService.on('optimizationProgress', (data) => {
      this.emit('optimizationProgress', data);
    });

    this.pythonService.on('optimizationError', (data) => {
      this.emit('optimizationError', data);
    });
  }

  // Core Business Operations

  async analyzeDocument(input: LegalAnalysisInput): Promise<LegalAnalysisResult> {
    try {
      const result = await this.pythonService.analyzeDocument(input);
      
      // Store analysis in memory for future reference
      await this.memory.store('legal_analysis', result, {
        tags: ['dspy', 'legal', input.document_type],
        metadata: {
          riskScore: result.risk_score,
          findingsCount: result.findings.length,
          analysisDepth: input.analysis_depth
        }
      });

      return result;
    } catch (error) {
      logger.error('Document analysis failed', { error });
      throw error;
    }
  }

  async optimizeMarketingContent(
    contentType: string,
    targetAudience: string,
    contentDraft: string,
    optimizationGoals: string[]
  ): Promise<any> {
    try {
      const result = await this.pythonService.optimizeMarketingContent(
        contentType,
        targetAudience,
        contentDraft,
        optimizationGoals
      );

      // Store optimization result
      await this.memory.store('marketing_optimization', result, {
        tags: ['dspy', 'marketing', contentType],
        metadata: {
          contentType,
          targetAudience,
          optimizationGoals
        }
      });

      return result;
    } catch (error) {
      logger.error('Marketing content optimization failed', { error });
      throw error;
    }
  }

  async optimizeSalesCommunication(
    communicationType: string,
    prospectProfile: Record<string, any>,
    messageDraft: string,
    conversionGoals: string[]
  ): Promise<any> {
    try {
      const result = await this.pythonService.optimizeSalesCommunication(
        communicationType,
        prospectProfile,
        messageDraft,
        conversionGoals
      );

      // Store optimization result
      await this.memory.store('sales_optimization', result, {
        tags: ['dspy', 'sales', communicationType],
        metadata: {
          communicationType,
          prospectProfile,
          conversionGoals
        }
      });

      return result;
    } catch (error) {
      logger.error('Sales communication optimization failed', { error });
      throw error;
    }
  }

  async optimizeSupportResponse(
    issueType: string,
    customerContext: Record<string, any>,
    responseDraft: string,
    satisfactionGoals: string[]
  ): Promise<any> {
    try {
      const result = await this.pythonService.optimizeSupportResponse(
        issueType,
        customerContext,
        responseDraft,
        satisfactionGoals
      );

      // Store optimization result
      await this.memory.store('support_optimization', result, {
        tags: ['dspy', 'support', issueType],
        metadata: {
          issueType,
          customerContext,
          satisfactionGoals
        }
      });

      return result;
    } catch (error) {
      logger.error('Support response optimization failed', { error });
      throw error;
    }
  }

  // DSPy Module Optimization

  async startOptimization(
    moduleName: string,
    config: Record<string, any>,
    dataset: Record<string, any>[]
  ): Promise<string> {
    try {
      const jobId = await this.pythonService.startOptimization(moduleName, config, dataset);
      
      logger.info('DSPy optimization started', {
        jobId,
        moduleName,
        datasetSize: dataset.length,
        optimizer: config.optimizer_type
      });

      return jobId;
    } catch (error) {
      logger.error('Failed to start DSPy optimization', { error });
      throw error;
    }
  }

  async getOptimizationStatus(jobId: string): Promise<any> {
    try {
      return await this.pythonService.getOptimizationStatus(jobId);
    } catch (error) {
      logger.error('Failed to get optimization status', { error, jobId });
      throw error;
    }
  }

  async listOptimizationJobs(
    status?: string,
    moduleName?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<any> {
    try {
      return await this.pythonService.listOptimizationJobs(status, moduleName, limit, offset);
    } catch (error) {
      logger.error('Failed to list optimization jobs', { error });
      throw error;
    }
  }

  // Module Management

  async getModules(): Promise<DSPyModule[]> {
    try {
      const modules = await this.pythonService.getModules();
      return modules.map(module => ({
        name: module.name,
        signature: module.signature || '',
        description: module.description || '',
        compiled: true, // Assume Python modules are compiled
        version: module.optimization_version || '1.0.0',
        optimization_history: []
      }));
    } catch (error) {
      logger.error('Failed to get modules', { error });
      throw error;
    }
  }

  getModule(name: string): Promise<DSPyModule | undefined> {
    return this.getModules().then(modules => 
      modules.find(module => module.name === name)
    );
  }

  listModules(): Promise<string[]> {
    return this.getModules().then(modules => 
      modules.map(module => module.name)
    );
  }

  // Template Management

  async getTemplates(category?: string): Promise<any[]> {
    try {
      return await this.pythonService.getTemplates(category);
    } catch (error) {
      logger.error('Failed to get templates', { error });
      throw error;
    }
  }

  async getTemplate(templateId: string): Promise<any> {
    try {
      return await this.pythonService.getTemplate(templateId);
    } catch (error) {
      logger.error('Failed to get template', { error, templateId });
      throw error;
    }
  }

  // Training Data Management

  async collectTrainingData(
    moduleName: string,
    sourceFilters: Record<string, any>,
    maxEntries: number = 1000
  ): Promise<any> {
    try {
      const result = await this.pythonService.collectTrainingData(
        moduleName,
        sourceFilters,
        maxEntries
      );

      logger.info('Training data collected', {
        moduleName,
        entriesCollected: result.entries_collected,
        datasetId: result.dataset_id
      });

      return result;
    } catch (error) {
      logger.error('Failed to collect training data', { error });
      throw error;
    }
  }

  // Analytics and Metrics

  async getOptimizationMetrics(): Promise<any> {
    try {
      return await this.pythonService.getOptimizationMetrics();
    } catch (error) {
      logger.error('Failed to get optimization metrics', { error });
      throw error;
    }
  }

  async getServiceAnalytics(): Promise<any> {
    try {
      const [optimizationMetrics, memories] = await Promise.all([
        this.getOptimizationMetrics(),
        this.memory.getAnalytics(['dspy'])
      ]);

      return {
        optimization_metrics: optimizationMetrics,
        memory_analytics: memories,
        service_info: this.pythonService.getServiceInfo(),
        health_status: this.isHealthy
      };
    } catch (error) {
      logger.error('Failed to get service analytics', { error });
      throw error;
    }
  }

  // WebSocket Management

  getOptimizationWebSocket(jobId: string): any {
    return this.pythonService.getOptimizationWebSocket(jobId);
  }

  // Business Intelligence Features

  async analyzeOptimizationTrends(): Promise<any> {
    try {
      const metrics = await this.getOptimizationMetrics();
      const memories = await this.memory.search({
        tags: ['dspy'],
        limit: 1000
      });

      // Analyze trends in optimization performance
      const trendAnalysis = {
        total_optimizations: metrics.total_jobs,
        success_rate: metrics.completed_jobs / metrics.total_jobs,
        average_improvement: metrics.average_improvement,
        popular_modules: {},
        performance_trends: {},
        business_impact: {}
      };

      // Group by module type
      memories.forEach(memory => {
        if (memory.metadata?.module_name) {
          const moduleName = memory.metadata.module_name;
          if (!trendAnalysis.popular_modules[moduleName]) {
            trendAnalysis.popular_modules[moduleName] = 0;
          }
          trendAnalysis.popular_modules[moduleName]++;
        }
      });

      return trendAnalysis;
    } catch (error) {
      logger.error('Failed to analyze optimization trends', { error });
      throw error;
    }
  }

  async predictOptimizationImpact(
    moduleName: string,
    currentPerformance: number
  ): Promise<any> {
    try {
      // Get historical optimization data for the module
      const memories = await this.memory.search({
        tags: ['dspy', moduleName],
        limit: 100
      });

      if (memories.length === 0) {
        return {
          predicted_improvement: 10, // Default 10% improvement
          confidence: 0.5,
          recommendation: 'No historical data available for this module'
        };
      }

      // Analyze historical improvements
      const improvements = memories
        .map(memory => memory.metadata?.improvement_percentage)
        .filter(imp => typeof imp === 'number');

      const avgImprovement = improvements.reduce((sum, imp) => sum + imp, 0) / improvements.length;
      const confidence = Math.min(improvements.length / 10, 1); // Higher confidence with more data

      return {
        predicted_improvement: avgImprovement,
        confidence,
        recommendation: confidence > 0.7 
          ? `High confidence prediction based on ${improvements.length} historical optimizations`
          : `Moderate confidence - recommend collecting more training data`,
        historical_data_points: improvements.length
      };
    } catch (error) {
      logger.error('Failed to predict optimization impact', { error });
      throw error;
    }
  }

  // Health and Status

  async healthCheck(): Promise<boolean> {
    try {
      const pythonHealthy = await this.pythonService.healthCheck();
      const memoryHealthy = await this.memory.healthCheck();
      
      this.isHealthy = pythonHealthy && memoryHealthy;
      return this.isHealthy;
    } catch (error) {
      logger.error('Health check failed', { error });
      this.isHealthy = false;
      return false;
    }
  }

  isHealthy(): boolean {
    return this.isHealthy;
  }

  getServiceStatus(): Record<string, any> {
    return {
      healthy: this.isHealthy,
      python_service: this.pythonService.getServiceInfo(),
      memory_service: this.memory.getStatus(),
      active_websockets: this.pythonService.connectionCount
    };
  }

  // Cleanup

  async cleanup(): Promise<void> {
    try {
      await this.pythonService.cleanup();
      this.removeAllListeners();
      this.isHealthy = false;
      logger.info('DSPy Service cleaned up');
    } catch (error) {
      logger.error('DSPy Service cleanup failed', { error });
    }
  }
}