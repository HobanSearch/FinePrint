/**
 * Real-time aggregation engine for feedback metrics
 */

import { Redis } from 'ioredis';
import { Logger } from 'pino';
import * as stats from 'simple-statistics';
import {
  ImplicitFeedbackEvent,
  ExplicitFeedbackEvent,
  FeedbackMetrics,
  FeedbackStreamEvent,
  ModelType
} from '../types';

export class Aggregator {
  private redis: Redis;
  private logger: Logger;
  private aggregationWindows: Map<string, AggregationWindow>;
  private metricsCache: Map<string, FeedbackMetrics>;

  constructor(redis: Redis, logger: Logger) {
    this.redis = redis;
    this.logger = logger.child({ component: 'Aggregator' });
    this.aggregationWindows = new Map();
    this.metricsCache = new Map();
    
    this.initializeWindows();
  }

  /**
   * Initialize aggregation windows
   */
  private initializeWindows(): void {
    const windows = [
      { name: '1m', duration: 60000 },
      { name: '5m', duration: 300000 },
      { name: '15m', duration: 900000 },
      { name: '1h', duration: 3600000 },
      { name: '24h', duration: 86400000 }
    ];
    
    for (const window of windows) {
      this.aggregationWindows.set(window.name, {
        name: window.name,
        duration: window.duration,
        buckets: new Map()
      });
    }
  }

  /**
   * Update implicit aggregates
   */
  async updateImplicitAggregates(event: ImplicitFeedbackEvent): Promise<void> {
    const timestamp = event.timestamp.getTime();
    
    for (const [windowName, window] of this.aggregationWindows) {
      const bucketId = Math.floor(timestamp / window.duration);
      const bucketKey = `${event.modelType}:${windowName}:${bucketId}`;
      
      let bucket = window.buckets.get(bucketKey);
      if (!bucket) {
        bucket = this.createBucket(event.modelType, window.duration);
        window.buckets.set(bucketKey, bucket);
      }
      
      // Update bucket metrics
      bucket.implicit.totalEvents++;
      bucket.implicit.uniqueUsers.add(event.userId || event.sessionId);
      
      if (event.metadata.timeOnPage) {
        bucket.implicit.engagementTimes.push(event.metadata.timeOnPage);
      }
      
      if (event.metadata.scrollDepth) {
        bucket.implicit.scrollDepths.push(event.metadata.scrollDepth);
      }
      
      // Update event type counts
      switch (event.eventType) {
        case 'click':
          bucket.implicit.clicks++;
          break;
        case 'conversion':
          bucket.implicit.conversions++;
          if (event.businessMetrics?.conversionValue) {
            bucket.business.revenue += event.businessMetrics.conversionValue;
          }
          break;
        case 'bounce':
          bucket.implicit.bounces++;
          break;
        case 'copy':
          bucket.implicit.copies++;
          break;
        case 'download':
          bucket.implicit.downloads++;
          break;
      }
      
      // Update business metrics
      if (event.businessMetrics) {
        if (event.businessMetrics.leadScore) {
          bucket.business.leadScores.push(event.businessMetrics.leadScore);
        }
        if (event.businessMetrics.ltv) {
          bucket.business.ltvValues.push(event.businessMetrics.ltv);
        }
      }
    }
    
    // Persist to Redis
    await this.persistAggregates(event.modelType);
  }

  /**
   * Update explicit aggregates
   */
  async updateExplicitAggregates(event: ExplicitFeedbackEvent): Promise<void> {
    const timestamp = event.timestamp.getTime();
    
    for (const [windowName, window] of this.aggregationWindows) {
      const bucketId = Math.floor(timestamp / window.duration);
      const bucketKey = `${event.modelType}:${windowName}:${bucketId}`;
      
      let bucket = window.buckets.get(bucketKey);
      if (!bucket) {
        bucket = this.createBucket(event.modelType, window.duration);
        window.buckets.set(bucketKey, bucket);
      }
      
      // Update bucket metrics
      bucket.explicit.totalFeedback++;
      
      if (event.rating) {
        bucket.explicit.ratings.push(event.rating);
      }
      
      if (event.thumbsUp !== undefined) {
        if (event.thumbsUp) {
          bucket.explicit.thumbsUp++;
        } else {
          bucket.explicit.thumbsDown++;
        }
      }
      
      if (event.sentiment !== undefined) {
        bucket.explicit.sentiments.push(event.sentiment);
      }
      
      // Update feedback type counts
      switch (event.feedbackType) {
        case 'report':
          bucket.explicit.issueReports++;
          break;
        case 'feature_request':
          bucket.explicit.featureRequests++;
          break;
        case 'bug_report':
          bucket.explicit.bugReports++;
          break;
      }
      
      // Track issue types
      if (event.issueType) {
        bucket.patterns.issueTypes[event.issueType] = 
          (bucket.patterns.issueTypes[event.issueType] || 0) + 1;
      }
    }
    
    // Persist to Redis
    await this.persistAggregates(event.modelType);
  }

  /**
   * Calculate windowed metrics
   */
  async calculateWindowedMetrics(
    events: FeedbackStreamEvent[],
    windowId: number
  ): Promise<FeedbackMetrics> {
    const window = this.aggregationWindows.get('1m')!; // Use 1 minute window for real-time
    const modelType = events[0]?.data.modelType || 'unknown';
    const bucketKey = `${modelType}:1m:${windowId}`;
    const bucket = window.buckets.get(bucketKey) || this.createBucket(modelType as ModelType, 60000);
    
    // Calculate final metrics
    const metrics: FeedbackMetrics = {
      period: {
        start: new Date(windowId * window.duration),
        end: new Date((windowId + 1) * window.duration),
        duration: window.duration
      },
      modelType: modelType as ModelType,
      modelVersion: 'current',
      implicit: {
        totalEvents: bucket.implicit.totalEvents,
        uniqueUsers: bucket.implicit.uniqueUsers.size,
        avgEngagementTime: stats.mean(bucket.implicit.engagementTimes) || 0,
        clickThroughRate: bucket.implicit.clicks / Math.max(bucket.implicit.totalEvents, 1),
        bounceRate: bucket.implicit.bounces / Math.max(bucket.implicit.totalEvents, 1),
        conversionRate: bucket.implicit.conversions / Math.max(bucket.implicit.totalEvents, 1),
        scrollDepth: stats.mean(bucket.implicit.scrollDepths) || 0,
        copyRate: bucket.implicit.copies / Math.max(bucket.implicit.totalEvents, 1),
        downloadRate: bucket.implicit.downloads / Math.max(bucket.implicit.totalEvents, 1)
      },
      explicit: {
        totalFeedback: bucket.explicit.totalFeedback,
        avgRating: stats.mean(bucket.explicit.ratings) || 0,
        thumbsUpRate: bucket.explicit.thumbsUp / 
          Math.max(bucket.explicit.thumbsUp + bucket.explicit.thumbsDown, 1),
        sentimentScore: stats.mean(bucket.explicit.sentiments) || 0,
        issueReports: bucket.explicit.issueReports,
        featureRequests: bucket.explicit.featureRequests,
        bugReports: bucket.explicit.bugReports
      },
      business: {
        revenue: bucket.business.revenue,
        leads: bucket.business.leadScores.length,
        conversions: bucket.implicit.conversions,
        churnRate: this.calculateChurnRate(bucket),
        ltv: stats.mean(bucket.business.ltvValues) || 0,
        nps: await this.calculateNPS(modelType as ModelType)
      },
      patterns: {
        topIssues: this.getTopIssues(bucket),
        userJourneys: await this.getUserJourneys(modelType as ModelType),
        dropOffPoints: await this.getDropOffPoints(modelType as ModelType),
        highEngagement: await this.getHighEngagementElements(modelType as ModelType)
      }
    };
    
    // Cache metrics
    this.metricsCache.set(bucketKey, metrics);
    
    return metrics;
  }

  /**
   * Get aggregated metrics for time range
   */
  async getAggregatedMetrics(
    modelType: ModelType,
    startTime: Date,
    endTime: Date,
    granularity: string = '1h'
  ): Promise<FeedbackMetrics[]> {
    const window = this.aggregationWindows.get(granularity);
    if (!window) {
      throw new Error(`Invalid granularity: ${granularity}`);
    }
    
    const startBucket = Math.floor(startTime.getTime() / window.duration);
    const endBucket = Math.floor(endTime.getTime() / window.duration);
    const metrics: FeedbackMetrics[] = [];
    
    for (let bucketId = startBucket; bucketId <= endBucket; bucketId++) {
      const bucketKey = `${modelType}:${granularity}:${bucketId}`;
      
      // Check cache
      let metric = this.metricsCache.get(bucketKey);
      
      if (!metric) {
        // Load from Redis
        const redisKey = `metrics:${bucketKey}`;
        const data = await this.redis.get(redisKey);
        if (data) {
          metric = JSON.parse(data);
          this.metricsCache.set(bucketKey, metric);
        }
      }
      
      if (metric) {
        metrics.push(metric);
      }
    }
    
    return metrics;
  }

  /**
   * Calculate percentiles for metrics
   */
  calculatePercentiles(values: number[]): Percentiles {
    if (values.length === 0) {
      return { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 };
    }
    
    const sorted = values.sort((a, b) => a - b);
    
    return {
      p50: stats.quantile(sorted, 0.5),
      p75: stats.quantile(sorted, 0.75),
      p90: stats.quantile(sorted, 0.9),
      p95: stats.quantile(sorted, 0.95),
      p99: stats.quantile(sorted, 0.99)
    };
  }

  /**
   * Calculate moving averages
   */
  calculateMovingAverage(values: number[], window: number): number[] {
    if (values.length < window) {
      return [stats.mean(values) || 0];
    }
    
    const movingAvg: number[] = [];
    for (let i = window - 1; i < values.length; i++) {
      const windowValues = values.slice(i - window + 1, i + 1);
      movingAvg.push(stats.mean(windowValues));
    }
    
    return movingAvg;
  }

  /**
   * Detect trends in metrics
   */
  detectTrend(values: number[]): TrendInfo {
    if (values.length < 2) {
      return { direction: 'stable', strength: 0, confidence: 0 };
    }
    
    // Simple linear regression
    const indices = values.map((_, i) => i);
    const regression = stats.linearRegression([indices, values]);
    const slope = regression.m;
    
    // Determine trend direction
    let direction: 'up' | 'down' | 'stable';
    if (Math.abs(slope) < 0.01) {
      direction = 'stable';
    } else if (slope > 0) {
      direction = 'up';
    } else {
      direction = 'down';
    }
    
    // Calculate trend strength (normalized slope)
    const strength = Math.min(Math.abs(slope) / stats.standardDeviation(values), 1);
    
    // Calculate confidence (R-squared)
    const rSquared = stats.rSquared(indices, values, regression);
    
    return {
      direction,
      strength,
      confidence: rSquared
    };
  }

  /**
   * Helper methods
   */
  private createBucket(modelType: ModelType, duration: number): AggregationBucket {
    return {
      modelType,
      duration,
      startTime: new Date(),
      implicit: {
        totalEvents: 0,
        uniqueUsers: new Set(),
        engagementTimes: [],
        scrollDepths: [],
        clicks: 0,
        conversions: 0,
        bounces: 0,
        copies: 0,
        downloads: 0
      },
      explicit: {
        totalFeedback: 0,
        ratings: [],
        thumbsUp: 0,
        thumbsDown: 0,
        sentiments: [],
        issueReports: 0,
        featureRequests: 0,
        bugReports: 0
      },
      business: {
        revenue: 0,
        leadScores: [],
        ltvValues: []
      },
      patterns: {
        issueTypes: {},
        userPaths: [],
        elementInteractions: {}
      }
    };
  }

  private async persistAggregates(modelType: string): Promise<void> {
    // Persist aggregates to Redis periodically
    for (const [windowName, window] of this.aggregationWindows) {
      for (const [bucketKey, bucket] of window.buckets) {
        if (bucketKey.startsWith(modelType)) {
          const redisKey = `metrics:${bucketKey}`;
          const metrics = await this.calculateBucketMetrics(bucket);
          await this.redis.setex(
            redisKey,
            window.duration * 10, // Keep for 10x the window duration
            JSON.stringify(metrics)
          );
        }
      }
    }
  }

  private async calculateBucketMetrics(bucket: AggregationBucket): Promise<any> {
    return {
      implicit: {
        totalEvents: bucket.implicit.totalEvents,
        uniqueUsers: bucket.implicit.uniqueUsers.size,
        avgEngagementTime: stats.mean(bucket.implicit.engagementTimes) || 0,
        scrollDepth: stats.mean(bucket.implicit.scrollDepths) || 0
      },
      explicit: {
        totalFeedback: bucket.explicit.totalFeedback,
        avgRating: stats.mean(bucket.explicit.ratings) || 0,
        sentiment: stats.mean(bucket.explicit.sentiments) || 0
      },
      business: {
        revenue: bucket.business.revenue,
        avgLeadScore: stats.mean(bucket.business.leadScores) || 0,
        avgLTV: stats.mean(bucket.business.ltvValues) || 0
      }
    };
  }

  private calculateChurnRate(bucket: AggregationBucket): number {
    // Simplified churn calculation
    const totalUsers = bucket.implicit.uniqueUsers.size;
    if (totalUsers === 0) return 0;
    
    const bounceRate = bucket.implicit.bounces / Math.max(bucket.implicit.totalEvents, 1);
    const engagementRate = bucket.implicit.clicks / Math.max(bucket.implicit.totalEvents, 1);
    
    return Math.max(0, Math.min(1, bounceRate - engagementRate));
  }

  private async calculateNPS(modelType: ModelType): Promise<number> {
    const npsKey = `metrics:nps:${modelType}`;
    const npsData = await this.redis.hgetall(npsKey);
    
    if (!npsData.total || parseInt(npsData.total) === 0) {
      return 0;
    }
    
    const total = parseInt(npsData.total);
    const promoters = parseInt(npsData.promoter || '0');
    const detractors = parseInt(npsData.detractor || '0');
    
    return ((promoters - detractors) / total) * 100;
  }

  private getTopIssues(bucket: AggregationBucket): Array<{ type: string; count: number }> {
    return Object.entries(bucket.patterns.issueTypes)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private async getUserJourneys(modelType: ModelType): Promise<Array<{ path: string[]; count: number }>> {
    const journeyKey = `journeys:${modelType}`;
    const journeys = await this.redis.lrange(journeyKey, 0, 9);
    
    return journeys.map(j => JSON.parse(j));
  }

  private async getDropOffPoints(modelType: ModelType): Promise<Array<{ page: string; rate: number }>> {
    const dropOffKey = `dropoff:${modelType}`;
    const dropOffs = await this.redis.hgetall(dropOffKey);
    
    return Object.entries(dropOffs)
      .map(([page, rate]) => ({ page, rate: parseFloat(rate) }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5);
  }

  private async getHighEngagementElements(modelType: ModelType): Promise<Array<{ element: string; score: number }>> {
    const engagementKey = `engagement:${modelType}`;
    const elements = await this.redis.zrevrange(engagementKey, 0, 4, 'WITHSCORES');
    
    const result: Array<{ element: string; score: number }> = [];
    for (let i = 0; i < elements.length; i += 2) {
      result.push({
        element: elements[i],
        score: parseFloat(elements[i + 1])
      });
    }
    
    return result;
  }

  /**
   * Cleanup old buckets
   */
  cleanupOldBuckets(): void {
    const now = Date.now();
    
    for (const [windowName, window] of this.aggregationWindows) {
      const maxAge = window.duration * 10; // Keep 10 windows
      
      for (const [bucketKey, bucket] of window.buckets) {
        const bucketAge = now - bucket.startTime.getTime();
        if (bucketAge > maxAge) {
          window.buckets.delete(bucketKey);
          this.metricsCache.delete(bucketKey);
        }
      }
    }
  }
}

// Helper interfaces
interface AggregationWindow {
  name: string;
  duration: number;
  buckets: Map<string, AggregationBucket>;
}

interface AggregationBucket {
  modelType: ModelType;
  duration: number;
  startTime: Date;
  implicit: {
    totalEvents: number;
    uniqueUsers: Set<string>;
    engagementTimes: number[];
    scrollDepths: number[];
    clicks: number;
    conversions: number;
    bounces: number;
    copies: number;
    downloads: number;
  };
  explicit: {
    totalFeedback: number;
    ratings: number[];
    thumbsUp: number;
    thumbsDown: number;
    sentiments: number[];
    issueReports: number;
    featureRequests: number;
    bugReports: number;
  };
  business: {
    revenue: number;
    leadScores: number[];
    ltvValues: number[];
  };
  patterns: {
    issueTypes: Record<string, number>;
    userPaths: string[][];
    elementInteractions: Record<string, number>;
  };
}

interface Percentiles {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
}

interface TrendInfo {
  direction: 'up' | 'down' | 'stable';
  strength: number;
  confidence: number;
}