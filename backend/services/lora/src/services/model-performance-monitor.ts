import { EventEmitter } from 'events';
import { Redis } from 'ioredis';
import { logger } from '../mocks/shared-logger';

export interface ModelMetrics {
  adapterId: string;
  totalRequests: number;
  avgResponseTime: number;
  avgTokensGenerated: number;
  errorRate: number;
  userSatisfactionScore: number;
  lastUsed: Date;
  dailyMetrics: DailyMetrics[];
}

export interface DailyMetrics {
  date: string;
  requests: number;
  avgResponseTime: number;
  errors: number;
  feedbackScores: number[];
}

export interface GenerationMetrics {
  adapterId: string;
  requestId: string;
  responseTime: number;
  tokensGenerated: number;
  success: boolean;
  error?: string;
  userFeedback?: number;
  timestamp: Date;
}

export interface PerformanceComparison {
  baselineModel: string;
  challengerModel: string;
  metrics: {
    avgResponseTime: { baseline: number; challenger: number; improvement: number };
    errorRate: { baseline: number; challenger: number; improvement: number };
    userSatisfaction: { baseline: number; challenger: number; improvement: number };
    tokensPerSecond: { baseline: number; challenger: number; improvement: number };
  };
  recommendation: 'keep_baseline' | 'switch_to_challenger' | 'need_more_data';
  confidence: number;
}

export class ModelPerformanceMonitor extends EventEmitter {
  private redis: Redis;
  private metricsCache = new Map<string, ModelMetrics>();
  private readonly METRICS_TTL = 86400 * 30; // 30 days
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(redis: Redis) {
    super();
    this.redis = redis;
    this.startPeriodicAggregation();
  }

  async recordGeneration(metrics: GenerationMetrics): Promise<void> {
    try {
      // Store raw metrics in Redis
      const key = `lora:metrics:${metrics.adapterId}:${metrics.requestId}`;
      await this.redis.setex(
        key,
        this.METRICS_TTL,
        JSON.stringify(metrics)
      );

      // Update real-time counters
      const counterKey = `lora:counters:${metrics.adapterId}`;
      await this.redis.hincrby(counterKey, 'totalRequests', 1);
      await this.redis.hincrbyfloat(counterKey, 'totalResponseTime', metrics.responseTime);
      await this.redis.hincrby(counterKey, 'totalTokens', metrics.tokensGenerated);
      
      if (!metrics.success) {
        await this.redis.hincrby(counterKey, 'totalErrors', 1);
      }

      // Update daily metrics
      const today = new Date().toISOString().split('T')[0];
      const dailyKey = `lora:daily:${metrics.adapterId}:${today}`;
      await this.redis.hincrby(dailyKey, 'requests', 1);
      await this.redis.hincrbyfloat(dailyKey, 'totalResponseTime', metrics.responseTime);
      if (!metrics.success) {
        await this.redis.hincrby(dailyKey, 'errors', 1);
      }
      await this.redis.expire(dailyKey, 86400 * 7); // Keep daily data for 7 days

      // Emit event for real-time monitoring
      this.emit('generation', metrics);

      // Clear cache for this adapter
      this.metricsCache.delete(metrics.adapterId);

      logger.debug('Recorded generation metrics', { adapterId: metrics.adapterId, requestId: metrics.requestId });
    } catch (error) {
      logger.error('Failed to record generation metrics', error);
    }
  }

  async recordUserFeedback(adapterId: string, requestId: string, score: number): Promise<void> {
    try {
      // Update the original metrics
      const key = `lora:metrics:${adapterId}:${requestId}`;
      const metricsStr = await this.redis.get(key);
      
      if (metricsStr) {
        const metrics = JSON.parse(metricsStr);
        metrics.userFeedback = score;
        await this.redis.setex(key, this.METRICS_TTL, JSON.stringify(metrics));
      }

      // Update feedback counter
      const counterKey = `lora:counters:${adapterId}`;
      await this.redis.hincrby(counterKey, 'totalFeedback', 1);
      await this.redis.hincrbyfloat(counterKey, 'totalFeedbackScore', score);

      // Update daily feedback
      const today = new Date().toISOString().split('T')[0];
      const dailyKey = `lora:daily:${adapterId}:${today}`;
      await this.redis.rpush(`${dailyKey}:feedback`, score);

      // Clear cache
      this.metricsCache.delete(adapterId);

      logger.info('Recorded user feedback', { adapterId, requestId, score });
    } catch (error) {
      logger.error('Failed to record user feedback', error);
    }
  }

  async getModelMetrics(adapterId: string): Promise<ModelMetrics> {
    // Check cache first
    if (this.metricsCache.has(adapterId)) {
      const cached = this.metricsCache.get(adapterId)!;
      if (Date.now() - cached.lastUsed.getTime() < this.CACHE_TTL * 1000) {
        return cached;
      }
    }

    try {
      const counterKey = `lora:counters:${adapterId}`;
      const counters = await this.redis.hgetall(counterKey);

      const totalRequests = parseInt(counters.totalRequests || '0');
      const totalResponseTime = parseFloat(counters.totalResponseTime || '0');
      const totalTokens = parseInt(counters.totalTokens || '0');
      const totalErrors = parseInt(counters.totalErrors || '0');
      const totalFeedback = parseInt(counters.totalFeedback || '0');
      const totalFeedbackScore = parseFloat(counters.totalFeedbackScore || '0');

      // Get daily metrics for the last 7 days
      const dailyMetrics: DailyMetrics[] = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const dailyKey = `lora:daily:${adapterId}:${dateStr}`;
        
        const daily = await this.redis.hgetall(dailyKey);
        const feedbackScores = await this.redis.lrange(`${dailyKey}:feedback`, 0, -1);
        
        if (daily.requests) {
          dailyMetrics.push({
            date: dateStr,
            requests: parseInt(daily.requests || '0'),
            avgResponseTime: parseFloat(daily.totalResponseTime || '0') / parseInt(daily.requests || '1'),
            errors: parseInt(daily.errors || '0'),
            feedbackScores: feedbackScores.map(s => parseFloat(s))
          });
        }
      }

      const metrics: ModelMetrics = {
        adapterId,
        totalRequests,
        avgResponseTime: totalRequests > 0 ? totalResponseTime / totalRequests : 0,
        avgTokensGenerated: totalRequests > 0 ? totalTokens / totalRequests : 0,
        errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
        userSatisfactionScore: totalFeedback > 0 ? totalFeedbackScore / totalFeedback : 0,
        lastUsed: new Date(),
        dailyMetrics: dailyMetrics.reverse()
      };

      // Cache the result
      this.metricsCache.set(adapterId, metrics);

      return metrics;
    } catch (error) {
      logger.error('Failed to get model metrics', error);
      return {
        adapterId,
        totalRequests: 0,
        avgResponseTime: 0,
        avgTokensGenerated: 0,
        errorRate: 0,
        userSatisfactionScore: 0,
        lastUsed: new Date(),
        dailyMetrics: []
      };
    }
  }

  async compareModels(baselineId: string, challengerId: string): Promise<PerformanceComparison> {
    const [baseline, challenger] = await Promise.all([
      this.getModelMetrics(baselineId),
      this.getModelMetrics(challengerId)
    ]);

    // Calculate improvements
    const responseTimeImprovement = baseline.avgResponseTime > 0
      ? ((baseline.avgResponseTime - challenger.avgResponseTime) / baseline.avgResponseTime) * 100
      : 0;

    const errorRateImprovement = baseline.errorRate > 0
      ? ((baseline.errorRate - challenger.errorRate) / baseline.errorRate) * 100
      : 0;

    const satisfactionImprovement = baseline.userSatisfactionScore > 0
      ? ((challenger.userSatisfactionScore - baseline.userSatisfactionScore) / baseline.userSatisfactionScore) * 100
      : 0;

    const tokensPerSecond = {
      baseline: baseline.avgResponseTime > 0 ? baseline.avgTokensGenerated / (baseline.avgResponseTime / 1000) : 0,
      challenger: challenger.avgResponseTime > 0 ? challenger.avgTokensGenerated / (challenger.avgResponseTime / 1000) : 0
    };

    const tpsImprovement = tokensPerSecond.baseline > 0
      ? ((tokensPerSecond.challenger - tokensPerSecond.baseline) / tokensPerSecond.baseline) * 100
      : 0;

    // Determine recommendation
    let recommendation: PerformanceComparison['recommendation'] = 'keep_baseline';
    let confidence = 0;

    const minRequests = 100;
    if (baseline.totalRequests < minRequests || challenger.totalRequests < minRequests) {
      recommendation = 'need_more_data';
      confidence = 0.3;
    } else {
      // Calculate weighted score
      const improvementScore = 
        (responseTimeImprovement * 0.25) +
        (errorRateImprovement * 0.35) +
        (satisfactionImprovement * 0.3) +
        (tpsImprovement * 0.1);

      if (improvementScore > 10) {
        recommendation = 'switch_to_challenger';
        confidence = Math.min(0.95, 0.5 + (improvementScore / 100));
      } else if (improvementScore < -10) {
        recommendation = 'keep_baseline';
        confidence = Math.min(0.95, 0.5 + (Math.abs(improvementScore) / 100));
      } else {
        recommendation = 'need_more_data';
        confidence = 0.5;
      }
    }

    return {
      baselineModel: baselineId,
      challengerModel: challengerId,
      metrics: {
        avgResponseTime: {
          baseline: baseline.avgResponseTime,
          challenger: challenger.avgResponseTime,
          improvement: responseTimeImprovement
        },
        errorRate: {
          baseline: baseline.errorRate,
          challenger: challenger.errorRate,
          improvement: errorRateImprovement
        },
        userSatisfaction: {
          baseline: baseline.userSatisfactionScore,
          challenger: challenger.userSatisfactionScore,
          improvement: satisfactionImprovement
        },
        tokensPerSecond: {
          baseline: tokensPerSecond.baseline,
          challenger: tokensPerSecond.challenger,
          improvement: tpsImprovement
        }
      },
      recommendation,
      confidence
    };
  }

  async getPerformanceTrends(adapterId: string, days: number = 7): Promise<{
    dates: string[];
    avgResponseTimes: number[];
    errorRates: number[];
    requestCounts: number[];
    satisfactionScores: number[];
  }> {
    const metrics = await this.getModelMetrics(adapterId);
    const recentMetrics = metrics.dailyMetrics.slice(-days);

    return {
      dates: recentMetrics.map(m => m.date),
      avgResponseTimes: recentMetrics.map(m => m.avgResponseTime),
      errorRates: recentMetrics.map(m => m.requests > 0 ? m.errors / m.requests : 0),
      requestCounts: recentMetrics.map(m => m.requests),
      satisfactionScores: recentMetrics.map(m => {
        if (m.feedbackScores.length === 0) return 0;
        return m.feedbackScores.reduce((a, b) => a + b, 0) / m.feedbackScores.length;
      })
    };
  }

  async getTopPerformingModels(domain?: string, limit: number = 5): Promise<ModelMetrics[]> {
    try {
      // Get all adapter IDs
      const pattern = domain ? `lora:counters:${domain}:*` : 'lora:counters:*';
      const keys = await this.redis.keys(pattern);
      
      // Get metrics for all models
      const metricsPromises = keys.map(key => {
        const adapterId = key.split(':').pop()!;
        return this.getModelMetrics(adapterId);
      });

      const allMetrics = await Promise.all(metricsPromises);

      // Filter out models with too few requests
      const activeMetrics = allMetrics.filter(m => m.totalRequests >= 10);

      // Sort by composite score
      const scored = activeMetrics.map(m => ({
        ...m,
        score: (m.userSatisfactionScore * 0.4) +
               ((1 - m.errorRate) * 0.3) +
               ((1000 / m.avgResponseTime) * 0.3)
      }));

      scored.sort((a, b) => b.score - a.score);

      return scored.slice(0, limit);
    } catch (error) {
      logger.error('Failed to get top performing models', error);
      return [];
    }
  }

  private startPeriodicAggregation(): void {
    // Aggregate metrics every hour
    setInterval(async () => {
      try {
        await this.aggregateHourlyMetrics();
      } catch (error) {
        logger.error('Failed to aggregate metrics', error);
      }
    }, 3600000); // 1 hour
  }

  private async aggregateHourlyMetrics(): Promise<void> {
    // This would aggregate hourly metrics into daily summaries
    // Implementation depends on specific needs
    logger.info('Running periodic metrics aggregation');
  }

  async exportMetrics(adapterId: string, format: 'json' | 'csv' = 'json'): Promise<string> {
    const metrics = await this.getModelMetrics(adapterId);
    
    if (format === 'json') {
      return JSON.stringify(metrics, null, 2);
    } else {
      // CSV format
      const headers = 'Date,Requests,Avg Response Time,Error Rate,Satisfaction Score\n';
      const rows = metrics.dailyMetrics.map(m => {
        const satisfaction = m.feedbackScores.length > 0
          ? m.feedbackScores.reduce((a, b) => a + b, 0) / m.feedbackScores.length
          : 0;
        return `${m.date},${m.requests},${m.avgResponseTime.toFixed(2)},${(m.errors / m.requests).toFixed(4)},${satisfaction.toFixed(2)}`;
      }).join('\n');
      
      return headers + rows;
    }
  }
}

export default ModelPerformanceMonitor;