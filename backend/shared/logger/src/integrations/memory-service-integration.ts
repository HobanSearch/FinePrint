/**
 * Memory Service Integration for Fine Print AI Logging System
 * Integrates with the shared memory service for log context enrichment and pattern storage
 */

import { EventEmitter } from 'events';
import { LoggerService } from '../services/logger-service';
import { ServiceType, Environment, LogEntry, LogPattern } from '../types';

interface MemoryServiceConfig {
  baseUrl: string;
  apiKey?: string;
  timeout: number;
  retryAttempts: number;
  enableContextEnrichment: boolean;
  enablePatternStorage: boolean;
  batchSize: number;
  flushInterval: number; // seconds
}

interface ContextEnrichment {
  userId?: string;
  sessionContext?: Record<string, any>;
  userPreferences?: Record<string, any>;
  businessContext?: Record<string, any>;
  historicalPatterns?: string[];
}

interface MemoryQuery {
  type: 'context' | 'pattern' | 'insight' | 'relationship';
  filters: Record<string, any>;
  limit?: number;
  offset?: number;
}

interface MemoryResult {
  id: string;
  type: string;
  data: any;
  relevance: number;
  timestamp: Date;
}

export class MemoryServiceIntegration extends EventEmitter {
  private baseUrl: string;
  private logger: LoggerService;
  private config: MemoryServiceConfig;
  private enrichmentQueue: LogEntry[] = [];
  private patternQueue: LogPattern[] = [];
  private flushInterval?: NodeJS.Timeout;
  private initialized = false;

  constructor(baseUrl: string, logger: LoggerService) {
    super();
    this.baseUrl = baseUrl;
    this.logger = logger;
    this.config = {
      baseUrl,
      timeout: 5000,
      retryAttempts: 3,
      enableContextEnrichment: true,
      enablePatternStorage: true,
      batchSize: 50,
      flushInterval: 30,
    };
  }

  /**
   * Initialize the memory service integration
   */
  async initialize(): Promise<void> {
    try {
      // Test connection to memory service
      await this.testConnection();

      // Start batch processing
      this.startBatchProcessing();

      this.initialized = true;

      this.logger.info('Memory service integration initialized', {
        service: 'memory-integration' as ServiceType,
        environment: 'production' as Environment,
        baseUrl: this.baseUrl,
        enableContextEnrichment: this.config.enableContextEnrichment,
        enablePatternStorage: this.config.enablePatternStorage,
      });

      this.emit('initialized');
    } catch (error) {
      this.logger.error('Failed to initialize memory service integration', {
        service: 'memory-integration' as ServiceType,
        environment: 'production' as Environment,
        baseUrl: this.baseUrl,
      }, error as Error);

      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Enrich log entry with context from memory service
   */
  async enrichLogContext(logEntry: LogEntry): Promise<LogEntry> {
    if (!this.config.enableContextEnrichment) {
      return logEntry;
    }

    try {
      const enrichment = await this.getContextEnrichment(logEntry);
      
      if (enrichment) {
        const enrichedEntry: LogEntry = {
          ...logEntry,
          context: {
            ...logEntry.context,
            businessContext: {
              ...logEntry.context.businessContext,
              ...enrichment.businessContext,
            },
            metadata: {
              ...logEntry.context.metadata,
              memoryEnrichment: {
                userPreferences: enrichment.userPreferences,
                sessionContext: enrichment.sessionContext,
                historicalPatterns: enrichment.historicalPatterns,
              },
            },
          },
        };

        this.logger.debug('Context enrichment applied', {
          service: 'memory-integration' as ServiceType,
          environment: 'production' as Environment,
          logId: logEntry.id,
          enrichmentKeys: Object.keys(enrichment),
        });

        return enrichedEntry;
      }

      return logEntry;
    } catch (error) {
      this.logger.warn('Failed to enrich log context', {
        service: 'memory-integration' as ServiceType,
        environment: 'production' as Environment,
        logId: logEntry.id,
      }, error as Error);

      return logEntry;
    }
  }

  /**
   * Store detected patterns in memory service
   */
  async storePattern(pattern: LogPattern): Promise<boolean> {
    if (!this.config.enablePatternStorage) {
      return false;
    }

    try {
      this.patternQueue.push(pattern);

      if (this.patternQueue.length >= this.config.batchSize) {
        await this.flushPatterns();
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to queue pattern for storage', {
        service: 'memory-integration' as ServiceType,
        environment: 'production' as Environment,
        patternId: pattern.id,
      }, error as Error);

      return false;
    }
  }

  /**
   * Query memory service for relevant information
   */
  async queryMemory(query: MemoryQuery): Promise<MemoryResult[]> {
    try {
      const response = await this.makeRequest('/api/v1/memory/query', {
        method: 'POST',
        body: JSON.stringify(query),
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
        },
      });

      if (response.ok) {
        const data = await response.json();
        
        this.logger.debug('Memory query successful', {
          service: 'memory-integration' as ServiceType,
          environment: 'production' as Environment,
          queryType: query.type,
          resultCount: data.results?.length || 0,
        });

        return data.results || [];
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      this.logger.error('Memory query failed', {
        service: 'memory-integration' as ServiceType,
        environment: 'production' as Environment,
        queryType: query.type,
      }, error as Error);

      return [];
    }
  }

  /**
   * Get historical patterns for anomaly detection
   */
  async getHistoricalPatterns(
    service: string,
    operation?: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<LogPattern[]> {
    try {
      const query: MemoryQuery = {
        type: 'pattern',
        filters: {
          service,
          ...(operation && { operation }),
          ...(timeRange && { timeRange }),
        },
        limit: 100,
      };

      const results = await this.queryMemory(query);
      
      return results.map(result => ({
        id: result.id,
        pattern: result.data.pattern,
        description: result.data.description,
        regex: result.data.regex ? new RegExp(result.data.regex) : undefined,
        severity: result.data.severity,
        category: result.data.category,
        frequency: result.data.frequency || 0,
        lastSeen: new Date(result.data.lastSeen || result.timestamp),
        actions: result.data.actions || [],
      }));
    } catch (error) {
      this.logger.error('Failed to get historical patterns', {
        service: 'memory-integration' as ServiceType,
        environment: 'production' as Environment,
        targetService: service,
        operation,
      }, error as Error);

      return [];
    }
  }

  /**
   * Store business insights for future reference
   */
  async storeBusinessInsight(insight: {
    type: string;
    title: string;
    description: string;
    confidence: number;
    impact: string;
    relatedServices: string[];
    suggestedActions: string[];
    context: Record<string, any>;
  }): Promise<boolean> {
    try {
      const response = await this.makeRequest('/api/v1/memory/insights', {
        method: 'POST',
        body: JSON.stringify({
          type: 'business-insight',
          data: insight,
          timestamp: new Date(),
          retention: 90, // days
        }),
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
        },
      });

      if (response.ok) {
        this.logger.debug('Business insight stored', {
          service: 'memory-integration' as ServiceType,
          environment: 'production' as Environment,
          insightType: insight.type,
          confidence: insight.confidence,
        });

        return true;
      }

      return false;
    } catch (error) {
      this.logger.error('Failed to store business insight', {
        service: 'memory-integration' as ServiceType,
        environment: 'production' as Environment,
        insightType: insight.type,
      }, error as Error);

      return false;
    }
  }

  /**
   * Get context enrichment for a log entry
   */
  private async getContextEnrichment(logEntry: LogEntry): Promise<ContextEnrichment | null> {
    try {
      const query: MemoryQuery = {
        type: 'context',
        filters: {
          userId: logEntry.context.userId,
          sessionId: logEntry.context.sessionId,
          service: logEntry.context.service,
          operation: logEntry.context.operation,
        },
        limit: 1,
      };

      const results = await this.queryMemory(query);
      
      if (results.length > 0) {
        return results[0].data as ContextEnrichment;
      }

      return null;
    } catch (error) {
      this.logger.warn('Failed to get context enrichment', {
        service: 'memory-integration' as ServiceType,
        environment: 'production' as Environment,
        logId: logEntry.id,
      }, error as Error);

      return null;
    }
  }

  /**
   * Flush queued patterns to memory service
   */
  private async flushPatterns(): Promise<void> {
    if (this.patternQueue.length === 0) return;

    try {
      const patterns = [...this.patternQueue];
      this.patternQueue = [];

      const response = await this.makeRequest('/api/v1/memory/patterns/batch', {
        method: 'POST',
        body: JSON.stringify({
          patterns: patterns.map(pattern => ({
            id: pattern.id,
            pattern: pattern.pattern,
            description: pattern.description,
            regex: pattern.regex?.source,
            severity: pattern.severity,
            category: pattern.category,
            frequency: pattern.frequency,
            lastSeen: pattern.lastSeen,
            actions: pattern.actions,
          })),
        }),
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
        },
      });

      if (response.ok) {
        this.logger.debug('Patterns flushed to memory service', {
          service: 'memory-integration' as ServiceType,
          environment: 'production' as Environment,
          patternCount: patterns.length,
        });
      } else {
        // Re-queue patterns for retry
        this.patternQueue.unshift(...patterns);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      this.logger.error('Failed to flush patterns', {
        service: 'memory-integration' as ServiceType,
        environment: 'production' as Environment,
        patternCount: this.patternQueue.length,
      }, error as Error);
    }
  }

  /**
   * Make HTTP request with retry logic
   */
  private async makeRequest(path: string, options: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeout);
        return response;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.retryAttempts) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }

  /**
   * Test connection to memory service
   */
  private async testConnection(): Promise<void> {
    try {
      const response = await this.makeRequest('/health', {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Memory service health check failed: ${response.status}`);
      }

      this.logger.debug('Memory service connection test successful', {
        service: 'memory-integration' as ServiceType,
        environment: 'production' as Environment,
        baseUrl: this.baseUrl,
      });
    } catch (error) {
      throw new Error(`Cannot connect to memory service: ${error}`);
    }
  }

  /**
   * Start batch processing
   */
  private startBatchProcessing(): void {
    this.flushInterval = setInterval(async () => {
      try {
        await this.flushPatterns();
      } catch (error) {
        this.logger.error('Error during batch processing', {
          service: 'memory-integration' as ServiceType,
          environment: 'production' as Environment,
        }, error as Error);
      }
    }, this.config.flushInterval * 1000);
  }

  /**
   * Get integration statistics
   */
  getStatistics(): {
    queueSizes: {
      enrichment: number;
      patterns: number;
    };
    totalProcessed: number;
    errorRate: number;
  } {
    return {
      queueSizes: {
        enrichment: this.enrichmentQueue.length,
        patterns: this.patternQueue.length,
      },
      totalProcessed: 0, // Would need to track this
      errorRate: 0, // Would need to track this
    };
  }

  /**
   * Shutdown the integration
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    // Flush remaining patterns
    await this.flushPatterns();

    this.logger.info('Memory service integration shut down', {
      service: 'memory-integration' as ServiceType,
      environment: 'production' as Environment,
    });

    this.emit('shutdown');
  }
}