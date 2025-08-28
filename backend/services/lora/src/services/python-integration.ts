/**
 * Python LoRA Training Service Integration
 * Connects TypeScript service layer with Python LoRA training backend
 */

import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { createServiceLogger } from '../mocks/shared-logger';

const logger = createServiceLogger('python-lora-integration');

export interface TrainingRequest {
  domain: string;
  base_model: string;
  training_data: Array<{
    document_text?: string;
    analysis_result?: string;
    campaign_objective?: string;
    target_audience?: string;
    brand_voice?: string;
    generated_content?: string;
    prospect_context?: string;
    company?: string;
    role?: string;
    sales_stage?: string;
    email_content?: string;
    customer_issue?: string;
    customer_tier?: string;
    interaction_history?: string;
    support_response?: string;
  }>;
  training_config?: {
    epochs?: number;
    batch_size?: number;
    learning_rate?: number;
    gradient_accumulation_steps?: number;
  };
}

export interface TrainingJob {
  job_id: string;
  domain: string;
  base_model: string;
  status: 'started' | 'training' | 'completed' | 'failed';
  progress: number;
  message: string;
  created_at: string;
  updated_at?: string;
  error?: string;
}

export interface AdapterInfo {
  job_id: string;
  domain: string;
  base_model: string;
  adapter_path: string;
  created_at: string;
  performance_metrics: {
    final_loss: number;
    parameters_added?: number;
    memory_overhead_mb?: number;
    inference_speedup?: number;
  };
}

export interface EvaluationResult {
  adapter_path: string;
  average_score: number;
  total_samples: number;
  score_distribution: {
    min: number;
    max: number;
    std: number;
  };
}

export interface DeploymentInfo {
  model_name: string;
  adapter_path: string;
  modelfile_path: string;
  deployed_at: string;
  base_model: string;
  domain: string;
}

export class PythonLoRAIntegration extends EventEmitter {
  private httpClient: AxiosInstance;
  private wsClient: WebSocket | null = null;
  private pythonServiceUrl: string;
  private connected: boolean = false;
  private reconnectInterval: NodeJS.Timeout | null = null;

  constructor(pythonServiceUrl: string = 'http://localhost:8008') {
    super();
    this.pythonServiceUrl = pythonServiceUrl;
    
    this.httpClient = axios.create({
      baseURL: pythonServiceUrl,
      timeout: 300000, // 5 minutes for training operations
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Initialize the Python LoRA integration
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Python LoRA integration...');
    
    // Connect to WebSocket for real-time updates
    this.connectWebSocket();
    
    // Verify Python service is available
    const isHealthy = await this.healthCheck();
    if (!isHealthy) {
      logger.warn('Python LoRA service is not available, some features may be limited');
    } else {
      logger.info('Python LoRA integration initialized successfully');
    }
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        logger.debug('Making HTTP request to Python service', {
          method: config.method,
          url: config.url,
          data: config.data ? 'present' : 'none'
        });
        return config;
      },
      (error) => {
        logger.error('HTTP request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        logger.debug('Received HTTP response from Python service', {
          status: response.status,
          url: response.config.url
        });
        return response;
      },
      (error) => {
        logger.error('HTTP response error', {
          status: error.response?.status,
          message: error.message,
          url: error.config?.url
        });
        return Promise.reject(error);
      }
    );
  }

  private connectWebSocket(): void {
    try {
      const wsUrl = this.pythonServiceUrl.replace('http', 'ws') + '/ws';
      this.wsClient = new WebSocket(wsUrl);

      this.wsClient.on('open', () => {
        this.connected = true;
        logger.info('WebSocket connected to Python LoRA service');
        this.emit('connected');
        
        // Clear reconnection interval
        if (this.reconnectInterval) {
          clearInterval(this.reconnectInterval);
          this.reconnectInterval = null;
        }
      });

      this.wsClient.on('message', (data: string) => {
        try {
          const message = JSON.parse(data);
          this.handleWebSocketMessage(message);
        } catch (error) {
          logger.error('Failed to parse WebSocket message', { error, data });
        }
      });

      this.wsClient.on('close', () => {
        this.connected = false;
        logger.warn('WebSocket connection closed');
        this.emit('disconnected');
        this.scheduleReconnect();
      });

      this.wsClient.on('error', (error) => {
        logger.error('WebSocket error', { error });
        this.emit('error', error);
      });

    } catch (error) {
      logger.error('Failed to connect WebSocket', { error });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectInterval) return;
    
    this.reconnectInterval = setInterval(() => {
      logger.info('Attempting to reconnect WebSocket...');
      this.connectWebSocket();
    }, 10000); // Retry every 10 seconds
  }

  private handleWebSocketMessage(message: any): void {
    logger.debug('Received WebSocket message', { type: message.type });

    switch (message.type) {
      case 'status_update':
        this.emit('training_status', message.data);
        break;
      case 'training_completed':
        this.emit('training_completed', {
          job_id: message.job_id,
          domain: message.domain,
          timestamp: message.timestamp
        });
        break;
      case 'training_failed':
        this.emit('training_failed', {
          job_id: message.job_id,
          error: message.error,
          timestamp: message.timestamp
        });
        break;
      default:
        logger.warn('Unknown WebSocket message type', { type: message.type });
    }
  }

  /**
   * Check if Python service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/health');
      return response.data.status === 'healthy';
    } catch (error) {
      logger.error('Python service health check failed', { error });
      return false;
    }
  }

  /**
   * Get available business domains for training
   */
  async getAvailableDomains(): Promise<Record<string, any>> {
    try {
      const response = await this.httpClient.get('/domains');
      return response.data.domains;
    } catch (error) {
      logger.error('Failed to get available domains', { error });
      throw new Error('Failed to get available domains from Python service');
    }
  }

  /**
   * Start LoRA training for a specific domain
   */
  async startTraining(request: TrainingRequest): Promise<TrainingJob> {
    try {
      const response = await this.httpClient.post('/train', request);
      
      const job: TrainingJob = {
        job_id: response.data.job_id,
        domain: response.data.domain,
        base_model: response.data.base_model,
        status: response.data.status,
        progress: 0,
        message: response.data.message,
        created_at: new Date().toISOString()
      };

      logger.info('LoRA training started', {
        job_id: job.job_id,
        domain: job.domain,
        base_model: job.base_model
      });

      return job;
    } catch (error) {
      logger.error('Failed to start LoRA training', { error });
      throw new Error(`Failed to start training: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Get current training status
   */
  async getTrainingStatus(): Promise<any> {
    try {
      const response = await this.httpClient.get('/training/status');
      return response.data.current_job;
    } catch (error) {
      logger.error('Failed to get training status', { error });
      throw new Error('Failed to get training status');
    }
  }

  /**
   * Get training history
   */
  async getTrainingHistory(): Promise<any[]> {
    try {
      const response = await this.httpClient.get('/training/history');
      return response.data.history;
    } catch (error) {
      logger.error('Failed to get training history', { error });
      throw new Error('Failed to get training history');
    }
  }

  /**
   * List all available trained adapters
   */
  async listAdapters(): Promise<AdapterInfo[]> {
    try {
      const response = await this.httpClient.get('/adapters');
      return response.data;
    } catch (error) {
      logger.error('Failed to list adapters', { error });
      throw new Error('Failed to list adapters');
    }
  }

  /**
   * Evaluate a trained adapter's performance
   */
  async evaluateAdapter(
    adapterPath: string,
    testData: Array<Record<string, any>>
  ): Promise<EvaluationResult> {
    try {
      const response = await this.httpClient.post('/evaluate', {
        adapter_path: adapterPath,
        test_data: testData
      });

      return {
        adapter_path: response.data.adapter_path,
        ...response.data.evaluation_results
      };
    } catch (error) {
      logger.error('Failed to evaluate adapter', { error });
      throw new Error(`Failed to evaluate adapter: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Deploy trained adapter to Ollama
   */
  async deployAdapter(adapterPath: string, modelName: string): Promise<DeploymentInfo> {
    try {
      const response = await this.httpClient.post('/deploy', {
        adapter_path: adapterPath,
        model_name: modelName
      });

      logger.info('Adapter deployed to Ollama', {
        adapter_path: adapterPath,
        model_name: modelName
      });

      return response.data.deployment_info;
    } catch (error) {
      logger.error('Failed to deploy adapter', { error });
      throw new Error(`Failed to deploy adapter: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Generate sample training data for a domain (development only)
   */
  async generateSampleData(domain: string): Promise<Array<Record<string, any>>> {
    try {
      const response = await this.httpClient.post(`/demo/generate-sample-data?domain=${domain}`);
      return response.data.sample_data;
    } catch (error) {
      logger.error('Failed to generate sample data', { error });
      throw new Error(`Failed to generate sample data: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Quick training demo with sample data (development only)
   */
  async quickTrainDemo(domain: string): Promise<TrainingJob> {
    try {
      const response = await this.httpClient.post(`/demo/quick-train?domain=${domain}`);
      
      const trainingResponse = response.data.training_response;
      return {
        job_id: trainingResponse.job_id,
        domain: trainingResponse.domain,
        base_model: trainingResponse.base_model,
        status: trainingResponse.status,
        progress: 0,
        message: trainingResponse.message,
        created_at: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to start quick training demo', { error });
      throw new Error(`Failed to start demo training: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Create training data from business examples
   */
  createBusinessTrainingData(
    domain: string, 
    businessExamples: Array<Record<string, any>>
  ): Array<Record<string, any>> {
    switch (domain) {
      case 'legal_analysis':
        return businessExamples.map(example => ({
          document_text: example.document || example.text || example.content,
          analysis_result: example.analysis || example.result || example.output
        }));

      case 'marketing_content':
        return businessExamples.map(example => ({
          campaign_objective: example.objective || example.goal,
          target_audience: example.audience || example.segment,
          brand_voice: example.voice || example.tone || 'professional',
          generated_content: example.content || example.copy || example.output
        }));

      case 'sales_communication':
        return businessExamples.map(example => ({
          prospect_context: example.context || example.prospect,
          company: example.company || example.client,
          role: example.role || example.title,
          sales_stage: example.stage || 'initial_outreach',
          email_content: example.email || example.content || example.output
        }));

      case 'customer_support':
        return businessExamples.map(example => ({
          customer_issue: example.issue || example.problem || example.question,
          customer_tier: example.tier || example.plan || 'standard',
          interaction_history: example.history || example.context || '',
          support_response: example.response || example.solution || example.output
        }));

      default:
        throw new Error(`Unknown domain: ${domain}`);
    }
  }

  /**
   * Close connections and cleanup
   */
  async disconnect(): Promise<void> {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = null;
    }

    this.connected = false;
    logger.info('Python LoRA integration disconnected');
  }

  /**
   * Check if connected to Python service
   */
  isConnected(): boolean {
    return this.connected;
  }
}