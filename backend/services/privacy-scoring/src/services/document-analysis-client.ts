import { config } from '../config';
import { logger } from '../utils/logger';

interface AnalysisRequest {
  websiteId: string;
  privacyPolicy?: string;
  termsOfService?: string;
}

interface AnalysisPattern {
  id: string;
  name: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  location: string;
  impact: number;
}

interface AnalysisResult {
  websiteId: string;
  patterns: AnalysisPattern[];
  metadata: {
    processingTime: number;
    documentTypes: string[];
  };
}

export class DocumentAnalysisClient {
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor() {
    this.baseUrl = config.documentAnalysis.serviceUrl;
    this.timeout = config.documentAnalysis.timeout;
  }

  /**
   * Analyze documents using the document analysis service
   */
  async analyzeDocuments(request: AnalysisRequest): Promise<AnalysisResult> {
    try {
      const response = await fetch(`${this.baseUrl}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`Analysis service returned ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      logger.info(`Document analysis completed for ${request.websiteId}`);
      return result;

    } catch (error) {
      logger.error('Document analysis failed:', error);
      
      // Return empty patterns on error to allow scoring to continue
      return {
        websiteId: request.websiteId,
        patterns: [],
        metadata: {
          processingTime: 0,
          documentTypes: [],
        },
      };
    }
  }

  /**
   * Check if the document analysis service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });

      return response.ok;
    } catch (error) {
      logger.error('Document analysis service health check failed:', error);
      return false;
    }
  }
}

export const documentAnalysisClient = new DocumentAnalysisClient();