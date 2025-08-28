import axios, { AxiosInstance, AxiosError } from 'axios';
import { io, Socket } from 'socket.io-client';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info'
});

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode: number;
  responseTime: number;
}

export class BaseApiClient {
  protected client: AxiosInstance;
  protected baseUrl: string;
  protected serviceName: string;

  constructor(serviceName: string, baseUrl: string, apiKey?: string) {
    this.serviceName = serviceName;
    this.baseUrl = baseUrl;

    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'X-API-Key': apiKey })
      }
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug({
          service: this.serviceName,
          method: config.method,
          url: config.url,
          data: config.data
        }, 'API request');
        return config;
      },
      (error) => {
        logger.error({ service: this.serviceName, error }, 'Request error');
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug({
          service: this.serviceName,
          status: response.status,
          url: response.config.url
        }, 'API response');
        return response;
      },
      (error: AxiosError) => {
        logger.error({
          service: this.serviceName,
          status: error.response?.status,
          error: error.message
        }, 'Response error');
        return Promise.reject(error);
      }
    );
  }

  protected async makeRequest<T>(
    method: string,
    endpoint: string,
    data?: any,
    params?: any
  ): Promise<ApiResponse<T>> {
    const startTime = Date.now();

    try {
      const response = await this.client.request<T>({
        method,
        url: endpoint,
        data,
        params
      });

      return {
        success: true,
        data: response.data,
        statusCode: response.status,
        responseTime: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message,
        statusCode: error.response?.status || 500,
        responseTime: Date.now() - startTime
      };
    }
  }
}

export class DigitalTwinClient extends BaseApiClient {
  constructor(apiKey?: string) {
    super('digital-twin', 'http://localhost:3020', apiKey);
  }

  async createExperiment(data: {
    organizationId: string;
    agentId: string;
    name: string;
    variantA: any;
    variantB: any;
    trafficSplit?: number;
  }): Promise<ApiResponse> {
    return this.makeRequest('POST', '/api/experiments', data);
  }

  async getExperiment(experimentId: string): Promise<ApiResponse> {
    return this.makeRequest('GET', `/api/experiments/${experimentId}`);
  }

  async updateExperimentStatus(
    experimentId: string,
    status: 'running' | 'paused' | 'completed'
  ): Promise<ApiResponse> {
    return this.makeRequest('PATCH', `/api/experiments/${experimentId}/status`, { status });
  }

  async getExperimentMetrics(experimentId: string): Promise<ApiResponse> {
    return this.makeRequest('GET', `/api/experiments/${experimentId}/metrics`);
  }

  async triggerFailureDetection(experimentId: string): Promise<ApiResponse> {
    return this.makeRequest('POST', `/api/experiments/${experimentId}/detect-failure`);
  }

  async compareVariants(experimentId: string): Promise<ApiResponse> {
    return this.makeRequest('GET', `/api/experiments/${experimentId}/compare`);
  }
}

export class BusinessAgentClient extends BaseApiClient {
  constructor(apiKey?: string) {
    super('business-agents', 'http://localhost:3001', apiKey);
  }

  async createAgent(data: {
    organizationId: string;
    type: 'marketing' | 'sales' | 'support' | 'analytics';
    config: any;
  }): Promise<ApiResponse> {
    return this.makeRequest('POST', '/api/agents', data);
  }

  async getAgent(agentId: string): Promise<ApiResponse> {
    return this.makeRequest('GET', `/api/agents/${agentId}`);
  }

  async updateAgent(agentId: string, config: any): Promise<ApiResponse> {
    return this.makeRequest('PATCH', `/api/agents/${agentId}`, { config });
  }

  async generateContent(agentId: string, prompt: string): Promise<ApiResponse> {
    return this.makeRequest('POST', `/api/agents/${agentId}/generate`, { prompt });
  }

  async getAgentMetrics(agentId: string): Promise<ApiResponse> {
    return this.makeRequest('GET', `/api/agents/${agentId}/metrics`);
  }

  async trainAgent(agentId: string, trainingData: any[]): Promise<ApiResponse> {
    return this.makeRequest('POST', `/api/agents/${agentId}/train`, { trainingData });
  }
}

export class ContentOptimizerClient extends BaseApiClient {
  constructor(apiKey?: string) {
    super('content-optimizer', 'http://localhost:3030', apiKey);
  }

  async optimizeContent(data: {
    agentId: string;
    content: string;
    targetMetric: string;
  }): Promise<ApiResponse> {
    return this.makeRequest('POST', '/api/optimize', data);
  }

  async getOptimizedContent(contentId: string): Promise<ApiResponse> {
    return this.makeRequest('GET', `/api/content/${contentId}`);
  }

  async getContentPerformance(contentId: string): Promise<ApiResponse> {
    return this.makeRequest('GET', `/api/content/${contentId}/performance`);
  }

  async batchOptimize(contents: any[]): Promise<ApiResponse> {
    return this.makeRequest('POST', '/api/optimize/batch', { contents });
  }
}

export class ImprovementOrchestratorClient extends BaseApiClient {
  constructor(apiKey?: string) {
    super('improvement-orchestrator', 'http://localhost:3010', apiKey);
  }

  async triggerImprovement(data: {
    agentId: string;
    experimentId: string;
    reason: string;
    metrics: any;
  }): Promise<ApiResponse> {
    return this.makeRequest('POST', '/api/improvements/trigger', data);
  }

  async getImprovementStatus(improvementId: string): Promise<ApiResponse> {
    return this.makeRequest('GET', `/api/improvements/${improvementId}/status`);
  }

  async deployImprovement(improvementId: string): Promise<ApiResponse> {
    return this.makeRequest('POST', `/api/improvements/${improvementId}/deploy`);
  }

  async rollbackImprovement(improvementId: string): Promise<ApiResponse> {
    return this.makeRequest('POST', `/api/improvements/${improvementId}/rollback`);
  }

  async getImprovementHistory(agentId: string): Promise<ApiResponse> {
    return this.makeRequest('GET', `/api/agents/${agentId}/improvements`);
  }

  async validateImprovement(improvementId: string): Promise<ApiResponse> {
    return this.makeRequest('POST', `/api/improvements/${improvementId}/validate`);
  }
}

export class FeedbackCollectorClient extends BaseApiClient {
  private socket?: Socket;

  constructor(apiKey?: string) {
    super('feedback-collector', 'http://localhost:3040', apiKey);
  }

  async submitFeedback(data: {
    organizationId: string;
    agentId: string;
    experimentId?: string;
    type: 'implicit' | 'explicit';
    rating?: number;
    comment?: string;
    metadata?: any;
  }): Promise<ApiResponse> {
    return this.makeRequest('POST', '/api/feedback', data);
  }

  async submitEvent(data: {
    organizationId: string;
    eventType: string;
    eventData: any;
  }): Promise<ApiResponse> {
    return this.makeRequest('POST', '/api/events', data);
  }

  async getFeedback(params: {
    organizationId?: string;
    agentId?: string;
    experimentId?: string;
    type?: string;
    limit?: number;
  }): Promise<ApiResponse> {
    return this.makeRequest('GET', '/api/feedback', undefined, params);
  }

  async getAggregatedFeedback(params: {
    agentId: string;
    period: 'hour' | 'day' | 'week' | 'month';
  }): Promise<ApiResponse> {
    return this.makeRequest('GET', '/api/feedback/aggregate', undefined, params);
  }

  connectWebSocket(organizationId: string): Socket {
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io(this.baseUrl, {
      transports: ['websocket'],
      query: { organizationId }
    });

    this.socket.on('connect', () => {
      logger.info({ service: this.serviceName }, 'WebSocket connected');
    });

    this.socket.on('disconnect', () => {
      logger.info({ service: this.serviceName }, 'WebSocket disconnected');
    });

    return this.socket;
  }

  disconnectWebSocket(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = undefined;
    }
  }

  async simulateFeedbackStream(
    organizationId: string,
    agentId: string,
    duration: number,
    feedbackRate: number
  ): Promise<void> {
    const endTime = Date.now() + duration;
    const interval = 1000 / feedbackRate; // Convert rate to interval

    while (Date.now() < endTime) {
      const feedbackTypes = ['click', 'view', 'conversion', 'bounce'];
      const feedback = {
        organizationId,
        agentId,
        type: 'implicit' as const,
        metadata: {
          eventType: feedbackTypes[Math.floor(Math.random() * feedbackTypes.length)],
          timestamp: new Date().toISOString(),
          sessionId: Math.random().toString(36).substring(7)
        }
      };

      await this.submitFeedback(feedback);
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
}

export class AdminDashboardClient extends BaseApiClient {
  constructor(apiKey?: string) {
    super('admin-dashboard', 'http://localhost:3000', apiKey);
  }

  async getDashboard(organizationId: string): Promise<ApiResponse> {
    return this.makeRequest('GET', `/api/dashboard/${organizationId}`);
  }

  async getSystemHealth(): Promise<ApiResponse> {
    return this.makeRequest('GET', '/api/health/system');
  }

  async getRealtimeMetrics(organizationId: string): Promise<ApiResponse> {
    return this.makeRequest('GET', `/api/metrics/realtime/${organizationId}`);
  }
}

// Aggregated client for convenience
export class ImprovementCycleApiClient {
  public digitalTwin: DigitalTwinClient;
  public businessAgents: BusinessAgentClient;
  public contentOptimizer: ContentOptimizerClient;
  public improvementOrchestrator: ImprovementOrchestratorClient;
  public feedbackCollector: FeedbackCollectorClient;
  public adminDashboard: AdminDashboardClient;

  constructor(apiKey?: string) {
    this.digitalTwin = new DigitalTwinClient(apiKey);
    this.businessAgents = new BusinessAgentClient(apiKey);
    this.contentOptimizer = new ContentOptimizerClient(apiKey);
    this.improvementOrchestrator = new ImprovementOrchestratorClient(apiKey);
    this.feedbackCollector = new FeedbackCollectorClient(apiKey);
    this.adminDashboard = new AdminDashboardClient(apiKey);
  }

  async cleanup(): Promise<void> {
    this.feedbackCollector.disconnectWebSocket();
  }
}