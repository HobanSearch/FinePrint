import type { 
  DocumentAnalysisRequest, 
  DocumentAnalysisResponse, 
  ApiResponse, 
  ApiError 
} from '@/types';

export class ExtensionApiClient {
  private baseUrl: string;
  private apiKey?: string;
  private userId?: string;

  constructor(baseUrl = 'http://localhost:8000', apiKey?: string, userId?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.userId = userId;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'User-Agent': 'FinePrint-Extension/1.0.0',
      ...options.headers,
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    if (this.userId) {
      headers['X-User-ID'] = this.userId;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new ApiError(
          data.error?.code || 'UNKNOWN_ERROR',
          data.error?.message || 'An unknown error occurred',
          response.status,
          data.error?.details
        );
      }

      return data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      // Network or parsing error
      throw new ApiError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Network request failed',
        0
      );
    }
  }

  async analyzeDocument(request: Omit<DocumentAnalysisRequest, 'userId'>): Promise<DocumentAnalysisResponse> {
    if (!this.userId) {
      throw new ApiError('AUTH_ERROR', 'User ID is required for analysis', 401);
    }

    const fullRequest: DocumentAnalysisRequest = {
      ...request,
      userId: this.userId,
    };

    const response = await this.request<DocumentAnalysisResponse>('/api/v1/analysis', {
      method: 'POST',
      body: JSON.stringify(fullRequest),
    });

    if (!response.success || !response.data) {
      throw new ApiError(
        response.error?.code || 'ANALYSIS_ERROR',
        response.error?.message || 'Analysis failed',
        500,
        response.error?.details
      );
    }

    return response.data;
  }

  async getAnalysisStatus(analysisId: string): Promise<DocumentAnalysisResponse> {
    const response = await this.request<DocumentAnalysisResponse>(
      `/api/v1/analysis/${analysisId}`
    );

    if (!response.success || !response.data) {
      throw new ApiError(
        response.error?.code || 'NOT_FOUND',
        response.error?.message || 'Analysis not found',
        404
      );
    }

    return response.data;
  }

  async quickAnalyze(url: string, content: string): Promise<DocumentAnalysisResponse> {
    return this.analyzeDocument({
      url,
      content,
      documentType: 'auto-detect',
      language: 'en',
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.request('/api/v1/health');
      return response.success;
    } catch {
      return false;
    }
  }

  setCredentials(apiKey: string, userId: string) {
    this.apiKey = apiKey;
    this.userId = userId;
  }

  setBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }
}

// Singleton instance for the extension
let apiClient: ExtensionApiClient | null = null;

export const getApiClient = (): ExtensionApiClient => {
  if (!apiClient) {
    apiClient = new ExtensionApiClient();
  }
  return apiClient;
};

export const initializeApiClient = async (): Promise<ExtensionApiClient> => {
  const client = getApiClient();
  
  // Load settings from storage
  const result = await chrome.storage.sync.get(['apiEndpoint', 'apiKey', 'userId']);
  
  if (result.apiEndpoint) {
    client.setBaseUrl(result.apiEndpoint);
  }
  
  if (result.apiKey && result.userId) {
    client.setCredentials(result.apiKey, result.userId);
  }
  
  return client;
};

class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}