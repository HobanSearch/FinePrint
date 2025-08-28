import axios, { AxiosResponse, AxiosError } from 'axios';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';

const logger = createServiceLogger('webhook-service');
const prisma = new PrismaClient();

export interface WebhookSendResult {
  success: boolean;
  statusCode?: number;
  responseBody?: any;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
}

export interface WebhookSendRequest {
  url: string;
  method: 'POST' | 'PUT' | 'PATCH';
  headers: Record<string, string>;
  payload: any;
  deliveryId: string;
  timeout?: number;
  retryCount?: number;
  maxRetries?: number;
}

export interface WebhookEndpoint {
  id: string;
  userId: string;
  url: string;
  secret?: string;
  isActive: boolean;
  events: string[];
  headers?: Record<string, string>;
  timeout: number;
  maxRetries: number;
}

class WebhookService {
  private initialized = false;
  private axiosInstance = axios.create({
    timeout: 30000, // 30 seconds default timeout
    maxRedirects: 5,
    validateStatus: (status) => status < 500, // Don't throw on 4xx errors
  });

  constructor() {
    this.setupAxiosInterceptors();
  }

  private setupAxiosInterceptors(): void {
    // Request interceptor for logging
    this.axiosInstance.interceptors.request.use(
      (config) => {
        logger.debug('Webhook request', {
          url: config.url,
          method: config.method?.toUpperCase(),
          headers: this.sanitizeHeaders(config.headers),
        });
        return config;
      },
      (error) => {
        logger.error('Webhook request setup failed', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.axiosInstance.interceptors.response.use(
      (response) => {
        logger.debug('Webhook response', {
          url: response.config.url,
          status: response.status,
          statusText: response.statusText,
          responseTime: response.headers['x-response-time'],
        });
        return response;
      },
      (error) => {
        logger.debug('Webhook request failed', {
          url: error.config?.url,
          status: error.response?.status,
          statusText: error.response?.statusText,
          error: error.message,
        });
        return Promise.reject(error);
      }
    );
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Test database connection
      await prisma.$connect();

      this.initialized = true;
      logger.info('Webhook service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize webhook service', { error });
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      await prisma.$disconnect();
      this.initialized = false;
      logger.info('Webhook service shut down successfully');
    } catch (error) {
      logger.error('Error during webhook service shutdown', { error });
    }
  }

  public async sendWebhook(request: WebhookSendRequest): Promise<WebhookSendResult> {
    try {
      // Validate webhook URL
      if (!this.isValidWebhookUrl(request.url)) {
        throw new Error(`Invalid webhook URL: ${request.url}`);
      }

      // Get webhook endpoint configuration
      const endpoint = await this.getWebhookEndpoint(request.url);
      
      // Prepare headers
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': `FinePrintAI-Webhooks/1.0`,
        'X-Webhook-Delivery-Id': request.deliveryId,
        'X-Webhook-Timestamp': Date.now().toString(),
        ...request.headers,
        ...(endpoint?.headers || {}),
      };

      // Add signature if secret is configured
      if (endpoint?.secret) {
        const signature = this.generateSignature(request.payload, endpoint.secret);
        headers['X-Webhook-Signature-256'] = signature;
      }

      // Make the webhook request
      const startTime = Date.now();
      const response = await this.axiosInstance.request({
        method: request.method,
        url: request.url,
        headers,
        data: request.payload,
        timeout: request.timeout || endpoint?.timeout || 30000,
      });

      const responseTime = Date.now() - startTime;

      // Log successful webhook
      logger.info('Webhook sent successfully', {
        url: request.url,
        deliveryId: request.deliveryId,
        method: request.method,
        statusCode: response.status,
        responseTime,
      });

      return {
        success: true,
        statusCode: response.status,
        responseBody: this.sanitizeResponseBody(response.data),
      };

    } catch (error) {
      const axiosError = error as AxiosError;
      const statusCode = axiosError.response?.status;
      const responseBody = axiosError.response?.data;

      logger.error('Webhook send failed', {
        url: request.url,
        deliveryId: request.deliveryId,
        method: request.method,
        statusCode,
        error: error.message,
        responseBody: this.sanitizeResponseBody(responseBody),
      });

      return {
        success: false,
        statusCode,
        responseBody: this.sanitizeResponseBody(responseBody),
        errorCode: axiosError.code || 'WEBHOOK_ERROR',
        errorMessage: error.message,
        retryable: this.isRetryableError(error),
      };
    }
  }

  public async createWebhookEndpoint(data: {
    userId: string;
    url: string;
    secret?: string;
    events: string[];
    headers?: Record<string, string>;
    timeout?: number;
    maxRetries?: number;
  }): Promise<WebhookEndpoint> {
    try {
      // Validate webhook URL
      if (!this.isValidWebhookUrl(data.url)) {
        throw new Error(`Invalid webhook URL: ${data.url}`);
      }

      // Test webhook endpoint
      const testResult = await this.testWebhookEndpoint(data.url, data.headers);
      if (!testResult.success) {
        logger.warn('Webhook endpoint test failed but proceeding with creation', {
          url: data.url,
          error: testResult.error,
        });
      }

      // Create endpoint record
      const endpoint = await prisma.webhookEndpoint.create({
        data: {
          id: uuidv4(),
          userId: data.userId,
          url: data.url,
          secret: data.secret,
          events: JSON.stringify(data.events),
          headers: data.headers ? JSON.stringify(data.headers) : null,
          timeout: data.timeout || 30000,
          maxRetries: data.maxRetries || 3,
          isActive: true,
        },
      });

      logger.info('Webhook endpoint created', {
        endpointId: endpoint.id,
        userId: data.userId,
        url: data.url,
        events: data.events,
      });

      return {
        id: endpoint.id,
        userId: endpoint.userId,
        url: endpoint.url,
        secret: endpoint.secret,
        isActive: endpoint.isActive,
        events: JSON.parse(endpoint.events),
        headers: endpoint.headers ? JSON.parse(endpoint.headers) : undefined,
        timeout: endpoint.timeout,
        maxRetries: endpoint.maxRetries,
      };
    } catch (error) {
      logger.error('Failed to create webhook endpoint', { error, data });
      throw error;
    }
  }

  public async updateWebhookEndpoint(
    endpointId: string,
    updates: {
      url?: string;
      secret?: string;
      events?: string[];
      headers?: Record<string, string>;
      timeout?: number;
      maxRetries?: number;
      isActive?: boolean;
    }
  ): Promise<WebhookEndpoint> {
    try {
      // Validate URL if provided
      if (updates.url && !this.isValidWebhookUrl(updates.url)) {
        throw new Error(`Invalid webhook URL: ${updates.url}`);
      }

      // Test webhook endpoint if URL is being updated
      if (updates.url) {
        const testResult = await this.testWebhookEndpoint(updates.url, updates.headers);
        if (!testResult.success) {
          logger.warn('Webhook endpoint test failed but proceeding with update', {
            url: updates.url,
            error: testResult.error,
          });
        }
      }

      // Prepare update data
      const updateData: any = { ...updates };
      if (updates.events) {
        updateData.events = JSON.stringify(updates.events);
      }
      if (updates.headers) {
        updateData.headers = JSON.stringify(updates.headers);
      }

      const endpoint = await prisma.webhookEndpoint.update({
        where: { id: endpointId },
        data: updateData,
      });

      logger.info('Webhook endpoint updated', {
        endpointId,
        updates: Object.keys(updates),
      });

      return {
        id: endpoint.id,
        userId: endpoint.userId,
        url: endpoint.url,
        secret: endpoint.secret,
        isActive: endpoint.isActive,
        events: JSON.parse(endpoint.events),
        headers: endpoint.headers ? JSON.parse(endpoint.headers) : undefined,
        timeout: endpoint.timeout,
        maxRetries: endpoint.maxRetries,
      };
    } catch (error) {
      logger.error('Failed to update webhook endpoint', { error, endpointId, updates });
      throw error;
    }
  }

  public async deleteWebhookEndpoint(endpointId: string): Promise<void> {
    try {
      await prisma.webhookEndpoint.delete({
        where: { id: endpointId },
      });

      logger.info('Webhook endpoint deleted', { endpointId });
    } catch (error) {
      logger.error('Failed to delete webhook endpoint', { error, endpointId });
      throw error;
    }
  }

  public async getUserWebhookEndpoints(userId: string): Promise<WebhookEndpoint[]> {
    try {
      const endpoints = await prisma.webhookEndpoint.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      return endpoints.map(endpoint => ({
        id: endpoint.id,
        userId: endpoint.userId,
        url: endpoint.url,
        secret: endpoint.secret,
        isActive: endpoint.isActive,
        events: JSON.parse(endpoint.events),
        headers: endpoint.headers ? JSON.parse(endpoint.headers) : undefined,
        timeout: endpoint.timeout,
        maxRetries: endpoint.maxRetries,
      }));
    } catch (error) {
      logger.error('Failed to get user webhook endpoints', { error, userId });
      throw error;
    }
  }

  public async testWebhookEndpoint(
    url: string,
    headers?: Record<string, string>
  ): Promise<{ success: boolean; error?: string; statusCode?: number }> {
    try {
      const testPayload = {
        type: 'webhook.test',
        timestamp: new Date().toISOString(),
        data: {
          message: 'This is a test webhook from Fine Print AI',
        },
      };

      const testHeaders = {
        'Content-Type': 'application/json',
        'User-Agent': 'FinePrintAI-Webhooks/1.0',
        'X-Webhook-Test': 'true',
        ...headers,
      };

      const response = await this.axiosInstance.post(url, testPayload, {
        headers: testHeaders,
        timeout: 10000, // Shorter timeout for tests
      });

      return {
        success: response.status >= 200 && response.status < 300,
        statusCode: response.status,
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      return {
        success: false,
        error: error.message,
        statusCode: axiosError.response?.status,
      };
    }
  }

  private async getWebhookEndpoint(url: string): Promise<WebhookEndpoint | null> {
    try {
      const endpoint = await prisma.webhookEndpoint.findFirst({
        where: { url, isActive: true },
      });

      if (!endpoint) return null;

      return {
        id: endpoint.id,
        userId: endpoint.userId,
        url: endpoint.url,
        secret: endpoint.secret,
        isActive: endpoint.isActive,
        events: JSON.parse(endpoint.events),
        headers: endpoint.headers ? JSON.parse(endpoint.headers) : undefined,
        timeout: endpoint.timeout,
        maxRetries: endpoint.maxRetries,
      };
    } catch (error) {
      logger.error('Failed to get webhook endpoint', { error, url });
      return null;
    }
  }

  private generateSignature(payload: any, secret: string): string {
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(payloadString, 'utf8')
      .digest('hex');
  }

  private isValidWebhookUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      
      // Must be HTTP or HTTPS
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return false;
      }

      // Reject localhost and private IPs in production
      if (config.NODE_ENV === 'production') {
        const hostname = parsedUrl.hostname.toLowerCase();
        
        // Reject localhost
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
          return false;
        }

        // Reject private IP ranges
        if (this.isPrivateIP(hostname)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  private isPrivateIP(hostname: string): boolean {
    // Basic check for private IP ranges
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./, // Link-local
      /^::1$/, // IPv6 localhost
      /^fc00:/, // IPv6 private
      /^fe80:/, // IPv6 link-local
    ];

    return privateRanges.some(range => range.test(hostname));
  }

  private isRetryableError(error: any): boolean {
    const axiosError = error as AxiosError;
    const statusCode = axiosError.response?.status;

    // Retry on server errors (5xx) and certain client errors
    if (statusCode) {
      const retryableStatusCodes = [
        408, // Request Timeout
        429, // Too Many Requests
        500, // Internal Server Error
        502, // Bad Gateway
        503, // Service Unavailable
        504, // Gateway Timeout
      ];
      
      return retryableStatusCodes.includes(statusCode);
    }

    // Retry on network errors
    const retryableErrorCodes = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ECONNABORTED',
    ];

    return retryableErrorCodes.includes(axiosError.code || '');
  }

  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'x-api-key', 'x-webhook-signature'];
    
    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
      if (sanitized[header.toLowerCase()]) {
        sanitized[header.toLowerCase()] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  private sanitizeResponseBody(body: any): any {
    if (!body) return body;
    
    // Limit response body size for logging
    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
    if (bodyString.length > 1000) {
      return bodyString.substring(0, 1000) + '... [truncated]';
    }
    
    return body;
  }

  // Webhook delivery statistics
  public async getWebhookStats(endpointId: string, days: number = 7): Promise<{
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    averageResponseTime: number;
    successRate: number;
  }> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const deliveries = await prisma.notificationDelivery.findMany({
        where: {
          channel: 'webhook',
          webhookUrl: {
            endsWith: endpointId, // This would need to be adjusted based on actual schema
          },
          createdAt: {
            gte: startDate,
          },
        },
        select: {
          status: true,
          sentAt: true,
          deliveredAt: true,
          failedAt: true,
        },
      });

      const totalDeliveries = deliveries.length;
      const successfulDeliveries = deliveries.filter(d => 
        ['sent', 'delivered'].includes(d.status)
      ).length;
      const failedDeliveries = totalDeliveries - successfulDeliveries;
      
      // Calculate average response time
      const responseTimes = deliveries
        .filter(d => d.sentAt && d.deliveredAt)
        .map(d => d.deliveredAt!.getTime() - d.sentAt!.getTime());
      
      const averageResponseTime = responseTimes.length > 0
        ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
        : 0;

      const successRate = totalDeliveries > 0 
        ? (successfulDeliveries / totalDeliveries) * 100 
        : 0;

      return {
        totalDeliveries,
        successfulDeliveries,
        failedDeliveries,
        averageResponseTime: Math.round(averageResponseTime),
        successRate: Math.round(successRate * 100) / 100,
      };
    } catch (error) {
      logger.error('Failed to get webhook stats', { error, endpointId });
      throw error;
    }
  }

  // Verify webhook signature for incoming webhooks
  public verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    secret: string
  ): boolean {
    try {
      const expectedSignature = this.generateSignature(payload, secret);
      
      // Use timing-safe comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      logger.error('Failed to verify webhook signature', { error });
      return false;
    }
  }

  // Batch webhook sending for efficiency
  public async sendBatchWebhooks(requests: WebhookSendRequest[]): Promise<WebhookSendResult[]> {
    const results: WebhookSendResult[] = [];
    const batchSize = 5; // Send 5 webhooks concurrently

    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      
      const batchPromises = batch.map(request => 
        this.sendWebhook(request).catch(error => ({
          success: false,
          errorCode: 'BATCH_ERROR',
          errorMessage: error.message,
          retryable: true,
        }))
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches to avoid overwhelming endpoints
      if (i + batchSize < requests.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }
}

export const webhookService = new WebhookService();