/**
 * Performance Monitoring Service for Business Agents
 */

import { EventEmitter } from 'events';
import { AgentType, AgentPerformanceMetrics } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('performance-service');

interface PerformanceEntry {
  agentType: AgentType;
  operation: string;
  startTime: number;
  endTime?: number;
  success: boolean;
  error?: string;
  tokensUsed?: number;
  cacheHit?: boolean;
}

export class PerformanceService extends EventEmitter {
  private metrics: Map<AgentType, {
    requestsTotal: number;
    requestsSuccessful: number;
    requestsFailed: number;
    responseTimes: number[];
    tokensUsed: number;
    cacheHits: number;
    cacheMisses: number;
    errors: string[];
  }>;

  private entries: PerformanceEntry[] = [];
  private metricsInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.metrics = new Map();
    this.initializeMetrics();
    this.startMetricsCollection();
  }

  private initializeMetrics(): void {
    for (const agentType of Object.values(AgentType)) {
      this.metrics.set(agentType, {
        requestsTotal: 0,
        requestsSuccessful: 0,
        requestsFailed: 0,
        responseTimes: [],
        tokensUsed: 0,
        cacheHits: 0,
        cacheMisses: 0,
        errors: []
      });
    }
  }

  private startMetricsCollection(): void {
    // Collect and emit metrics every 60 seconds
    this.metricsInterval = setInterval(() => {
      this.emitMetrics();
    }, 60000);
  }

  startOperation(agentType: AgentType, operation: string): string {
    const entry: PerformanceEntry = {
      agentType,
      operation,
      startTime: Date.now(),
      success: false
    };

    this.entries.push(entry);
    const entryId = `${agentType}-${operation}-${entry.startTime}`;

    const metrics = this.metrics.get(agentType);
    if (metrics) {
      metrics.requestsTotal++;
    }

    return entryId;
  }

  endOperation(
    entryId: string,
    success: boolean,
    options?: {
      tokensUsed?: number;
      cacheHit?: boolean;
      error?: string;
    }
  ): void {
    const parts = entryId.split('-');
    const agentType = parts[0] as AgentType;
    const startTime = parseInt(parts[parts.length - 1]);

    const entry = this.entries.find(e => 
      e.agentType === agentType && e.startTime === startTime
    );

    if (!entry) {
      logger.warn(`Performance entry not found: ${entryId}`);
      return;
    }

    entry.endTime = Date.now();
    entry.success = success;
    entry.tokensUsed = options?.tokensUsed;
    entry.cacheHit = options?.cacheHit;
    entry.error = options?.error;

    const metrics = this.metrics.get(agentType);
    if (metrics) {
      const responseTime = entry.endTime - entry.startTime;
      metrics.responseTimes.push(responseTime);

      if (success) {
        metrics.requestsSuccessful++;
      } else {
        metrics.requestsFailed++;
        if (options?.error) {
          metrics.errors.push(options.error);
        }
      }

      if (options?.tokensUsed) {
        metrics.tokensUsed += options.tokensUsed;
      }

      if (options?.cacheHit !== undefined) {
        if (options.cacheHit) {
          metrics.cacheHits++;
        } else {
          metrics.cacheMisses++;
        }
      }
    }

    // Clean up old entries (keep last 1000)
    if (this.entries.length > 1000) {
      this.entries = this.entries.slice(-1000);
    }
  }

  getMetrics(agentType?: AgentType): AgentPerformanceMetrics | AgentPerformanceMetrics[] {
    if (agentType) {
      return this.calculateMetrics(agentType);
    }

    return Object.values(AgentType).map(type => this.calculateMetrics(type));
  }

  private calculateMetrics(agentType: AgentType): AgentPerformanceMetrics {
    const metrics = this.metrics.get(agentType);
    
    if (!metrics) {
      throw new Error(`No metrics found for agent type: ${agentType}`);
    }

    const responseTimes = metrics.responseTimes.slice(-1000); // Last 1000 requests
    const sortedTimes = [...responseTimes].sort((a, b) => a - b);

    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;

    const p95ResponseTime = responseTimes.length > 0
      ? sortedTimes[Math.floor(sortedTimes.length * 0.95)]
      : 0;

    const p99ResponseTime = responseTimes.length > 0
      ? sortedTimes[Math.floor(sortedTimes.length * 0.99)]
      : 0;

    const cacheTotal = metrics.cacheHits + metrics.cacheMisses;
    const cacheHitRate = cacheTotal > 0 ? metrics.cacheHits / cacheTotal : 0;

    const errorRate = metrics.requestsTotal > 0
      ? metrics.requestsFailed / metrics.requestsTotal
      : 0;

    return {
      agentType,
      metrics: {
        requestsTotal: metrics.requestsTotal,
        requestsSuccessful: metrics.requestsSuccessful,
        requestsFailed: metrics.requestsFailed,
        averageResponseTime: Math.round(averageResponseTime),
        p95ResponseTime: Math.round(p95ResponseTime),
        p99ResponseTime: Math.round(p99ResponseTime),
        tokensUsed: metrics.tokensUsed,
        cacheHitRate: Math.round(cacheHitRate * 100) / 100,
        errorRate: Math.round(errorRate * 100) / 100
      },
      modelInfo: {
        name: `fine-print-${agentType}`,
        version: '1.0.0',
        lastUpdated: new Date(),
        performance: {
          accuracy: 0.92, // Placeholder - integrate with actual model metrics
          latency: averageResponseTime,
          throughput: this.calculateThroughput(metrics.requestsTotal)
        }
      },
      timeRange: {
        start: new Date(Date.now() - 3600000), // Last hour
        end: new Date()
      }
    };
  }

  private calculateThroughput(totalRequests: number): number {
    // Requests per minute over the last hour
    return Math.round((totalRequests / 60) * 100) / 100;
  }

  private emitMetrics(): void {
    for (const agentType of Object.values(AgentType)) {
      const metrics = this.calculateMetrics(agentType);
      this.emit('metrics', metrics);

      // Log if performance is degrading
      if (metrics.metrics.errorRate > 0.1) {
        logger.warn({
          agentType,
          errorRate: metrics.metrics.errorRate,
          msg: 'High error rate detected'
        });
      }

      if (metrics.metrics.p95ResponseTime > 5000) {
        logger.warn({
          agentType,
          p95ResponseTime: metrics.metrics.p95ResponseTime,
          msg: 'High response time detected'
        });
      }
    }
  }

  resetMetrics(agentType?: AgentType): void {
    if (agentType) {
      const metrics = this.metrics.get(agentType);
      if (metrics) {
        metrics.requestsTotal = 0;
        metrics.requestsSuccessful = 0;
        metrics.requestsFailed = 0;
        metrics.responseTimes = [];
        metrics.tokensUsed = 0;
        metrics.cacheHits = 0;
        metrics.cacheMisses = 0;
        metrics.errors = [];
      }
    } else {
      this.initializeMetrics();
    }

    logger.info(`Metrics reset for ${agentType || 'all agents'}`);
  }

  getRecentErrors(agentType?: AgentType, limit = 10): Array<{
    agentType: AgentType;
    error: string;
    timestamp: Date;
  }> {
    const errors: Array<{
      agentType: AgentType;
      error: string;
      timestamp: Date;
    }> = [];

    const filterEntries = agentType
      ? this.entries.filter(e => e.agentType === agentType && e.error)
      : this.entries.filter(e => e.error);

    filterEntries
      .slice(-limit)
      .forEach(entry => {
        if (entry.error) {
          errors.push({
            agentType: entry.agentType,
            error: entry.error,
            timestamp: new Date(entry.startTime)
          });
        }
      });

    return errors;
  }

  getHealthStatus(): {
    healthy: boolean;
    agents: Record<AgentType, {
      status: 'healthy' | 'degraded' | 'unhealthy';
      issues: string[];
    }>;
  } {
    const status: any = {
      healthy: true,
      agents: {}
    };

    for (const agentType of Object.values(AgentType)) {
      const metrics = this.calculateMetrics(agentType);
      const issues: string[] = [];
      let agentStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      if (metrics.metrics.errorRate > 0.2) {
        issues.push(`High error rate: ${(metrics.metrics.errorRate * 100).toFixed(1)}%`);
        agentStatus = 'unhealthy';
      } else if (metrics.metrics.errorRate > 0.1) {
        issues.push(`Elevated error rate: ${(metrics.metrics.errorRate * 100).toFixed(1)}%`);
        agentStatus = 'degraded';
      }

      if (metrics.metrics.p95ResponseTime > 10000) {
        issues.push(`Very high response time: ${metrics.metrics.p95ResponseTime}ms`);
        agentStatus = 'unhealthy';
      } else if (metrics.metrics.p95ResponseTime > 5000) {
        issues.push(`High response time: ${metrics.metrics.p95ResponseTime}ms`);
        if (agentStatus === 'healthy') {
          agentStatus = 'degraded';
        }
      }

      if (metrics.metrics.cacheHitRate < 0.3) {
        issues.push(`Low cache hit rate: ${(metrics.metrics.cacheHitRate * 100).toFixed(1)}%`);
        if (agentStatus === 'healthy') {
          agentStatus = 'degraded';
        }
      }

      status.agents[agentType] = {
        status: agentStatus,
        issues
      };

      if (agentStatus === 'unhealthy') {
        status.healthy = false;
      }
    }

    return status;
  }

  stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }
}

export const performanceService = new PerformanceService();