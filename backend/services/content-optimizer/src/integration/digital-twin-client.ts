/**
 * Client for integrating with Digital Twin service
 * Fetches experiment results and performance data
 */

import { ExperimentResult, ExperimentUpdate } from '../types';
import { logger } from '../utils/logger';

export class DigitalTwinClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor(config: {
    baseUrl: string;
    apiKey?: string;
    timeout?: number;
  }) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 5000;
  }

  /**
   * Get experiment results from digital twin
   */
  async getExperimentResults(experimentId: string): Promise<ExperimentResult | null> {
    try {
      const response = await this.request<ExperimentResult>(
        `/experiments/${experimentId}/results`,
        'GET'
      );

      if (response) {
        logger.info({ experimentId, result: response }, 'Experiment results fetched');
        return response;
      }

      return null;
    } catch (error) {
      logger.error({ error, experimentId }, 'Failed to fetch experiment results');
      return null;
    }
  }

  /**
   * Get all active experiments
   */
  async getActiveExperiments(): Promise<ExperimentResult[]> {
    try {
      const response = await this.request<ExperimentResult[]>(
        '/experiments/active',
        'GET'
      );

      return response || [];
    } catch (error) {
      logger.error({ error }, 'Failed to fetch active experiments');
      return [];
    }
  }

  /**
   * Get winning experiments that need content updates
   */
  async getWinningExperiments(): Promise<ExperimentResult[]> {
    try {
      const response = await this.request<ExperimentResult[]>(
        '/experiments/winners',
        'GET'
      );

      return response || [];
    } catch (error) {
      logger.error({ error }, 'Failed to fetch winning experiments');
      return [];
    }
  }

  /**
   * Subscribe to experiment updates
   */
  async subscribeToUpdates(
    callback: (update: ExperimentUpdate) => void
  ): Promise<() => void> {
    // In production, this would establish WebSocket connection
    // For now, simulate with polling
    const pollInterval = setInterval(async () => {
      try {
        const updates = await this.request<ExperimentUpdate[]>(
          '/experiments/updates',
          'GET'
        );

        if (updates && updates.length > 0) {
          for (const update of updates) {
            callback(update);
          }
        }
      } catch (error) {
        logger.error({ error }, 'Failed to fetch experiment updates');
      }
    }, 30000); // Poll every 30 seconds

    // Return unsubscribe function
    return () => clearInterval(pollInterval);
  }

  /**
   * Report content performance back to digital twin
   */
  async reportPerformance(
    experimentId: string,
    variantId: string,
    metrics: {
      impressions: number;
      conversions: number;
      revenue?: number;
    }
  ): Promise<void> {
    try {
      await this.request(
        `/experiments/${experimentId}/variants/${variantId}/metrics`,
        'POST',
        metrics
      );

      logger.debug({ experimentId, variantId, metrics }, 'Performance reported to digital twin');
    } catch (error) {
      logger.error({ error, experimentId, variantId }, 'Failed to report performance');
    }
  }

  /**
   * Get experiment configuration
   */
  async getExperimentConfig(experimentId: string): Promise<any> {
    try {
      return await this.request(
        `/experiments/${experimentId}/config`,
        'GET'
      );
    } catch (error) {
      logger.error({ error, experimentId }, 'Failed to fetch experiment config');
      return null;
    }
  }

  /**
   * Make HTTP request to digital twin service
   */
  private async request<T>(
    path: string,
    method: string,
    body?: any
  ): Promise<T | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const url = `${this.baseUrl}${path}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const options: RequestInit = {
        method,
        headers,
        signal: controller.signal
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data as T;

    } catch (error: any) {
      if (error.name === 'AbortError') {
        logger.error({ path }, 'Request timeout to digital twin');
      } else {
        logger.error({ error, path }, 'Digital twin request failed');
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Health check for digital twin service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.request('/health', 'GET');
      return response !== null;
    } catch {
      return false;
    }
  }
}