/**
 * Python DSPy Service Integration
 * Real DSPy framework integration with Python backend
 */

import axios, { AxiosInstance } from 'axios';
import { spawn, ChildProcess } from 'child_process';
import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { MemoryService } from '@fineprintai/shared-memory';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import * as WebSocket from 'ws';
import { EventEmitter } from 'events';

const logger = createServiceLogger('python-dspy-service');

// Python DSPy Service Configuration
interface PythonServiceConfig {
  host: string;
  port: number;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
}

// Import schemas from original service
export const LegalAnalysisSignature = z.object({
  document_content: z.string().describe('The legal document content to analyze'),
  document_type: z.enum(['terms_of_service', 'privacy_policy', 'eula', 'license']),
  language: z.string().default('en'),
  analysis_depth: z.enum(['basic', 'detailed', 'comprehensive']).default('detailed'),
});

export const LegalAnalysisOutput = z.object({
  risk_score: z.number().min(0).max(100),
  executive_summary: z.string(),
  key_findings: z.array(z.string()),
  recommendations: z.array(z.string()),
  findings: z.array(z.object({
    category: z.string(),
    title: z.string(),
    description: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    confidence_score: z.number().min(0).max(1),
    text_excerpt: z.string().optional(),
    recommendation: z.string().optional(),
    impact_explanation: z.string().optional(),
  })),
  dspy_metadata: z.object({
    module_used: z.string(),
    optimization_version: z.string(),
    compilation_timestamp: z.string(),
    performance_metrics: z.object({
      response_time_ms: z.number(),
      token_usage: z.number(),
      confidence_score: z.number(),
    }),
  }),
});

export type LegalAnalysisInput = z.infer<typeof LegalAnalysisSignature>;
export type LegalAnalysisResult = z.infer<typeof LegalAnalysisOutput>;

export class PythonDSPyService extends EventEmitter {
  private pythonClient: AxiosInstance;
  private memory: MemoryService;
  private pythonProcess: ChildProcess | null = null;
  private pythonConfig: PythonServiceConfig;
  private wsConnections: Map<string, WebSocket> = new Map();
  private isInitialized: boolean = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    super();
    
    this.pythonConfig = {
      host: config.services?.dspy?.pythonHost || 'localhost',
      port: config.services?.dspy?.pythonPort || 8007,
      timeout: 120000, // 2 minutes for optimization operations
      maxRetries: 3,
      retryDelay: 5000
    };

    this.pythonClient = axios.create({
      baseURL: `http://${this.pythonConfig.host}:${this.pythonConfig.port}`,
      timeout: this.pythonConfig.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.memory = new MemoryService();

    this.setupInterceptors();
    this.initializationPromise = this.initializePythonService();
  }

  private setupInterceptors(): void {
    this.pythonClient.interceptors.request.use((config) => {
      logger.debug('DSPy Python service request', {
        method: config.method,
        url: config.url,
        dataSize: config.data ? JSON.stringify(config.data).length : 0,
      });
      return config;
    });

    this.pythonClient.interceptors.response.use(
      (response) => {
        logger.debug('DSPy Python service response', {
          status: response.status,
          endpoint: response.config.url,
          responseSize: JSON.stringify(response.data).length,
        });
        return response;
      },
      (error) => {
        logger.error('DSPy Python service request failed', {
          error: error.message,
          status: error.response?.status,
          endpoint: error.config?.url,
          data: error.response?.data,
        });
        throw error;
      }
    );
  }

  private async initializePythonService(): Promise<void> {
    try {
      // Start health check monitoring
      await this.startHealthCheck();
      
      // Wait for Python service to be ready
      await this.waitForPythonService();
      
      this.isInitialized = true;
      logger.info('DSPy Python service integration initialized successfully');
      this.emit('ready');
    } catch (error) {
      logger.error('Failed to initialize DSPy Python service', { error });
      this.emit('error', error);
    }
  }

  private async waitForPythonService(maxAttempts: number = 30): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.pythonClient.get('/health', { timeout: 5000 });
        if (response.status === 200 && response.data.status === 'healthy') {
          logger.info('Python DSPy service is ready');
          return;
        }
      } catch (error) {
        if (attempt === maxAttempts) {
          throw new Error(`Python DSPy service not available after ${maxAttempts} attempts`);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  private async startHealthCheck(): Promise<void> {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const isHealthy = await this.healthCheck();
        if (!isHealthy && this.isInitialized) {
          this.isInitialized = false;
          this.emit('disconnected');
        } else if (isHealthy && !this.isInitialized) {
          this.isInitialized = true;
          this.emit('reconnected');
        }
      } catch (error) {
        logger.warn('Health check failed', { error: error.message });
        if (this.isInitialized) {
          this.isInitialized = false;
          this.emit('disconnected');
        }
      }
    }, 30000); // Check every 30 seconds
  }

  private async retryRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.pythonConfig.maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        
        if (attempt === this.pythonConfig.maxRetries) {
          break;
        }
        
        logger.warn(`DSPy request attempt ${attempt} failed, retrying in ${this.pythonConfig.retryDelay}ms`, {
          error: error.message
        });
        
        await new Promise(resolve => setTimeout(resolve, this.pythonConfig.retryDelay));
      }
    }
    
    throw lastError;
  }

  private getCacheKey(input: LegalAnalysisInput): string {
    const contentHash = this.hashContent(input.document_content);
    return `dspy:legal_analysis:${input.document_type}:${input.analysis_depth}:${contentHash}`;
  }

  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  async waitForReady(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
    
    if (!this.isInitialized) {
      throw new Error('DSPy service failed to initialize');
    }
  }

  // Core Business Operations

  async analyzeDocument(input: LegalAnalysisInput): Promise<LegalAnalysisResult> {
    const startTime = Date.now();
    
    try {
      await this.waitForReady();

      // Validate input
      const validatedInput = LegalAnalysisSignature.parse(input);
      
      // Check memory cache first
      const cacheKey = this.getCacheKey(validatedInput);
      const cachedResult = await this.memory.get(cacheKey);
      
      if (cachedResult) {
        logger.debug('Returning cached DSPy result', { cacheKey });
        return JSON.parse(cachedResult);
      }

      // Call Python DSPy service
      const response = await this.retryRequest(() =>
        this.pythonClient.post('/analyze/legal', validatedInput)
      );
      
      const result = response.data as LegalAnalysisResult;
      
      // Add response time to metadata
      const responseTime = Date.now() - startTime;
      if (result.dspy_metadata) {
        result.dspy_metadata.performance_metrics.response_time_ms = responseTime;
      }

      // Validate output
      const validatedResult = LegalAnalysisOutput.parse(result);

      // Cache result in memory service
      await this.memory.set(cacheKey, JSON.stringify(validatedResult), {
        ttl: 3600, // 1 hour
        tags: ['dspy', 'legal_analysis', validatedInput.document_type]
      });

      logger.info('DSPy document analysis completed', {
        responseTime,
        riskScore: validatedResult.risk_score,
        findingsCount: validatedResult.findings.length,
        cached: false
      });

      return validatedResult;
    } catch (error) {
      logger.error('DSPy document analysis failed', {
        error: error.message,
        input: {
          documentType: input.document_type,
          contentLength: input.document_content?.length || 0,
          analysisDepth: input.analysis_depth,
        },
      });
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
      await this.waitForReady();

      const response = await this.retryRequest(() =>
        this.pythonClient.post('/optimize/marketing-content', {
          content_type: contentType,
          target_audience: targetAudience,
          content_draft: contentDraft,
          optimization_goals: optimizationGoals
        })
      );
      
      return response.data;
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
      await this.waitForReady();

      const response = await this.retryRequest(() =>
        this.pythonClient.post('/optimize/sales-communication', {
          communication_type: communicationType,
          prospect_profile: prospectProfile,
          message_draft: messageDraft,
          conversion_goals: conversionGoals
        })
      );
      
      return response.data;
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
      await this.waitForReady();

      const response = await this.retryRequest(() =>
        this.pythonClient.post('/optimize/support-response', {
          issue_type: issueType,
          customer_context: customerContext,
          response_draft: responseDraft,
          satisfaction_goals: satisfactionGoals
        })
      );
      
      return response.data;
    } catch (error) {
      logger.error('Support response optimization failed', { error });
      throw error;
    }
  }

  // DSPy Optimization Management
  
  async startOptimization(
    moduleName: string,
    config: Record<string, any>,
    dataset: Record<string, any>[]
  ): Promise<string> {
    try {
      await this.waitForReady();

      const response = await this.retryRequest(() =>
        this.pythonClient.post('/optimization/start', {
          module_name: moduleName,
          config,
          dataset
        })
      );
      
      const jobId = response.data.job_id;
      
      // Set up WebSocket connection for progress updates
      await this.setupOptimizationWebSocket(jobId);
      
      return jobId;
    } catch (error) {
      logger.error('Failed to start optimization', { error });
      throw error;
    }
  }

  async getOptimizationStatus(jobId: string): Promise<any> {
    try {
      await this.waitForReady();

      const response = await this.retryRequest(() =>
        this.pythonClient.get(`/optimization/jobs/${jobId}`)
      );
      
      return response.data;
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
      await this.waitForReady();

      const params = new URLSearchParams();
      if (status) params.append('status', status);
      if (moduleName) params.append('module_name', moduleName);
      params.append('limit', limit.toString());
      params.append('offset', offset.toString());

      const response = await this.retryRequest(() =>
        this.pythonClient.get(`/optimization/jobs?${params.toString()}`)
      );
      
      return response.data;
    } catch (error) {
      logger.error('Failed to list optimization jobs', { error });
      throw error;
    }
  }

  async getModules(): Promise<any[]> {
    try {
      await this.waitForReady();

      const response = await this.retryRequest(() =>
        this.pythonClient.get('/modules')
      );
      
      return response.data.modules;
    } catch (error) {
      logger.error('Failed to get modules', { error });
      throw error;
    }
  }

  async getTemplates(category?: string): Promise<any[]> {
    try {
      await this.waitForReady();

      const params = new URLSearchParams();
      if (category) params.append('category', category);

      const response = await this.retryRequest(() =>
        this.pythonClient.get(`/templates?${params.toString()}`)
      );
      
      return response.data.templates;
    } catch (error) {
      logger.error('Failed to get templates', { error });
      throw error;
    }
  }

  async getTemplate(templateId: string): Promise<any> {
    try {
      await this.waitForReady();

      const response = await this.retryRequest(() =>
        this.pythonClient.get(`/templates/${templateId}`)
      );
      
      return response.data.template;
    } catch (error) {
      logger.error('Failed to get template', { error, templateId });
      throw error;
    }
  }

  async collectTrainingData(
    moduleName: string,
    sourceFilters: Record<string, any>,
    maxEntries: number = 1000
  ): Promise<any> {
    try {
      await this.waitForReady();

      const response = await this.retryRequest(() =>
        this.pythonClient.post('/training-data/collect', {
          module_name: moduleName,
          source_filters: sourceFilters,
          max_entries: maxEntries
        })
      );
      
      return response.data;
    } catch (error) {
      logger.error('Failed to collect training data', { error });
      throw error;
    }  
  }

  async getOptimizationMetrics(): Promise<any> {
    try {
      await this.waitForReady();

      const response = await this.retryRequest(() =>
        this.pythonClient.get('/metrics/optimization')
      );
      
      return response.data.metrics;
    } catch (error) {
      logger.error('Failed to get optimization metrics', { error });
      throw error;
    }
  }

  // WebSocket Management

  private async setupOptimizationWebSocket(jobId: string): Promise<void> {
    try {
      const wsUrl = `ws://${this.pythonConfig.host}:${this.pythonConfig.port}/ws/optimization/${jobId}`;
      const ws = new WebSocket(wsUrl);
      
      ws.on('open', () => {
        logger.info(`WebSocket connected for optimization job ${jobId}`);
        this.wsConnections.set(jobId, ws);
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          logger.debug('Optimization progress update', { jobId, message });
          
          // Emit progress event
          this.emit('optimizationProgress', { jobId, ...message });
        } catch (error) {
          logger.error('Failed to parse WebSocket message', { error, data: data.toString() });
        }
      });
      
      ws.on('error', (error) => {
        logger.error(`WebSocket error for job ${jobId}`, { error });
        this.emit('optimizationError', { jobId, error });
      });
      
      ws.on('close', () => {
        logger.info(`WebSocket closed for job ${jobId}`);
        this.wsConnections.delete(jobId);
      });
    } catch (error) {
      logger.error(`Failed to setup WebSocket for job ${jobId}`, { error });
    }
  }

  getOptimizationWebSocket(jobId: string): WebSocket | undefined {
    return this.wsConnections.get(jobId);
  }

  // Health Check

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.pythonClient.get('/health', { timeout: 5000 });
      const isHealthy = response.status === 200 && response.data.status === 'healthy';
      
      return isHealthy;
    } catch (error) {
      logger.error('DSPy Python service health check failed', { error: error.message });
      return false;
    }
  }

  // Cleanup

  async cleanup(): Promise<void> {
    try {
      // Close WebSocket connections
      for (const [jobId, ws] of this.wsConnections) {
        ws.close();
      }
      this.wsConnections.clear();
      
      // Clear health check interval
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }
      
      this.isInitialized = false;
      this.removeAllListeners();
      
      logger.info('Python DSPy service cleaned up');
    } catch (error) {
      logger.error('Python DSPy service cleanup failed', { error });
    }
  }

  // Getters

  get initialized(): boolean {
    return this.isInitialized;
  }

  get connectionCount(): number {
    return this.wsConnections.size;
  }

  getServiceInfo(): Record<string, any> {
    return {
      initialized: this.isInitialized,
      config: this.pythonConfig,
      activeConnections: this.wsConnections.size,
      serviceUrl: `http://${this.pythonConfig.host}:${this.pythonConfig.port}`
    };
  }
}