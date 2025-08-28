/**
 * Comprehensive Metrics Collection System
 */

import { EventEmitter } from 'events';
import pino from 'pino';
import { Redis } from 'ioredis';
import { CacheTier, CacheStats } from '../cache/types';
import { 
  ModelConfig, 
  UserTier, 
  RequestType,
  ModelType,
  ModelCapability 
} from '../types';

export interface MetricsSnapshot {
  timestamp: Date;
  period: string;
  cache: CacheMetrics;
  models: ModelMetrics;
  costs: CostMetrics;
  users: UserMetrics;
  performance: PerformanceMetrics;
  predictions: PredictionMetrics;
}

export interface CacheMetrics {
  overall: {
    hitRate: number;
    missRate: number;
    evictionRate: number;
    totalEntries: number;
    totalSize: number;
    costSavings: number;
  };
  byTier: Map<CacheTier, TierMetrics>;
  topPatterns: CachePattern[];
  effectiveness: CacheEffectiveness;
}

export interface TierMetrics {
  tier: CacheTier;
  entries: number;
  size: number;
  hitRate: number;
  avgRetrievalTime: number;
  costPerHit: number;
  utilization: number;
}

export interface CachePattern {
  pattern: string;
  frequency: number;
  avgHitRate: number;
  costSavings: number;
}

export interface CacheEffectiveness {
  score: number; // 0-100
  recommendations: string[];
  potentialSavings: number;
  optimalConfig: any;
}

export interface ModelMetrics {
  byModel: Map<string, SingleModelMetrics>;
  byType: Map<ModelType, TypeMetrics>;
  overall: {
    totalRequests: number;
    avgResponseTime: number;
    successRate: number;
    utilizationRate: number;
    costPerRequest: number;
  };
  rankings: ModelRanking[];
}

export interface SingleModelMetrics {
  modelId: string;
  requests: number;
  successes: number;
  failures: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  cost: number;
  efficiency: number; // cost per successful request
  reliability: number; // success rate
  utilization: number; // % of capacity used
}

export interface TypeMetrics {
  type: ModelType;
  models: string[];
  totalRequests: number;
  avgCost: number;
  avgResponseTime: number;
  preferredModel: string;
}

export interface ModelRanking {
  modelId: string;
  score: number; // composite score
  costRank: number;
  speedRank: number;
  reliabilityRank: number;
  recommendation: string;
}

export interface CostMetrics {
  total: number;
  byModel: Map<string, number>;
  byUserTier: Map<UserTier, TierCostMetrics>;
  byRequestType: Map<RequestType, number>;
  savings: {
    fromCache: number;
    fromBatching: number;
    fromOptimization: number;
    total: number;
  };
  projections: CostProjection;
  optimization: CostOptimizationRecommendation[];
}

export interface TierCostMetrics {
  tier: UserTier;
  users: number;
  requests: number;
  totalCost: number;
  avgCostPerUser: number;
  avgCostPerRequest: number;
  revenue?: number;
  margin?: number;
}

export interface CostProjection {
  daily: number;
  weekly: number;
  monthly: number;
  quarterly: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  confidenceInterval: {
    lower: number;
    upper: number;
  };
}

export interface CostOptimizationRecommendation {
  type: 'cache' | 'model' | 'batching' | 'routing';
  description: string;
  potentialSavings: number;
  implementation: string;
  priority: 'high' | 'medium' | 'low';
}

export interface UserMetrics {
  totalUsers: number;
  activeUsers: number;
  byTier: Map<UserTier, number>;
  engagement: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  behavior: UserBehaviorMetrics;
  satisfaction: UserSatisfactionMetrics;
}

export interface UserBehaviorMetrics {
  avgRequestsPerUser: number;
  avgDocumentSize: number;
  peakUsageHours: number[];
  commonRequestTypes: Map<RequestType, number>;
  repeatUsageRate: number;
}

export interface UserSatisfactionMetrics {
  avgResponseTime: number;
  successRate: number;
  cacheHitRate: number;
  estimatedSatisfaction: number; // 0-100
}

export interface PerformanceMetrics {
  latency: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  throughput: {
    current: number;
    peak: number;
    average: number;
  };
  availability: number; // percentage
  errorRate: number;
  saturation: number; // system load
}

export interface PredictionMetrics {
  nextHourLoad: number;
  nextDayLoad: number;
  peakTime: Date;
  recommendedCapacity: {
    models: Map<string, number>;
    cache: Map<CacheTier, number>;
  };
  costForecast: number;
}

export class MetricsCollector extends EventEmitter {
  private redis: Redis;
  private logger: pino.Logger;
  private metricsHistory: MetricsSnapshot[] = [];
  private collectionInterval: NodeJS.Timeout;
  private aggregationInterval: NodeJS.Timeout;
  private currentMetrics: MetricsSnapshot;

  constructor(redis: Redis) {
    super();
    this.redis = redis;
    this.logger = pino({ name: 'metrics-collector' });
    
    this.currentMetrics = this.initializeMetrics();
    this.startCollection();
  }

  /**
   * Collect current metrics snapshot
   */
  async collectMetrics(): Promise<MetricsSnapshot> {
    const snapshot: MetricsSnapshot = {
      timestamp: new Date(),
      period: 'realtime',
      cache: await this.collectCacheMetrics(),
      models: await this.collectModelMetrics(),
      costs: await this.collectCostMetrics(),
      users: await this.collectUserMetrics(),
      performance: await this.collectPerformanceMetrics(),
      predictions: await this.generatePredictions()
    };
    
    this.currentMetrics = snapshot;
    this.metricsHistory.push(snapshot);
    
    // Keep only last 24 hours of history
    const cutoff = Date.now() - 86400000;
    this.metricsHistory = this.metricsHistory.filter(m => 
      m.timestamp.getTime() > cutoff
    );
    
    // Store in Redis
    await this.storeMetrics(snapshot);
    
    // Emit for real-time monitoring
    this.emit('metrics-collected', snapshot);
    
    return snapshot;
  }

  /**
   * Get aggregated metrics for a time period
   */
  async getAggregatedMetrics(
    startTime: Date,
    endTime: Date,
    aggregation: 'hour' | 'day' | 'week' | 'month'
  ): Promise<MetricsSnapshot[]> {
    const metrics = await this.loadMetricsFromRedis(startTime, endTime);
    return this.aggregateMetrics(metrics, aggregation);
  }

  /**
   * Get real-time metrics
   */
  getCurrentMetrics(): MetricsSnapshot {
    return this.currentMetrics;
  }

  /**
   * Get cost analysis report
   */
  async getCostAnalysis(period: 'day' | 'week' | 'month'): Promise<{
    totalCost: number;
    breakdown: any;
    savings: any;
    recommendations: CostOptimizationRecommendation[];
    roi: number;
  }> {
    const metrics = await this.getMetricsForPeriod(period);
    
    const totalCost = metrics.reduce((sum, m) => sum + m.costs.total, 0);
    const totalSavings = metrics.reduce((sum, m) => sum + m.costs.savings.total, 0);
    
    // Calculate breakdown
    const breakdown = {
      byModel: this.aggregateCostsByModel(metrics),
      byUserTier: this.aggregateCostsByTier(metrics),
      byRequestType: this.aggregateCostsByType(metrics),
      byHour: this.aggregateCostsByHour(metrics)
    };
    
    // Calculate savings
    const savings = {
      fromCache: metrics.reduce((sum, m) => sum + m.costs.savings.fromCache, 0),
      fromBatching: metrics.reduce((sum, m) => sum + m.costs.savings.fromBatching, 0),
      fromOptimization: metrics.reduce((sum, m) => sum + m.costs.savings.fromOptimization, 0),
      total: totalSavings,
      percentage: totalSavings / (totalCost + totalSavings) * 100
    };
    
    // Generate recommendations
    const recommendations = this.generateCostRecommendations(metrics);
    
    // Calculate ROI
    const revenue = this.estimateRevenue(metrics);
    const roi = (revenue - totalCost) / totalCost * 100;
    
    return {
      totalCost,
      breakdown,
      savings,
      recommendations,
      roi
    };
  }

  /**
   * Get cache effectiveness report
   */
  async getCacheEffectiveness(): Promise<CacheEffectiveness> {
    const cacheMetrics = this.currentMetrics.cache;
    const costMetrics = this.currentMetrics.costs;
    
    // Calculate effectiveness score (0-100)
    let score = 0;
    
    // Hit rate contribution (40%)
    score += cacheMetrics.overall.hitRate * 40;
    
    // Cost savings contribution (30%)
    const savingsRate = costMetrics.savings.fromCache / costMetrics.total;
    score += Math.min(savingsRate * 100, 30);
    
    // Utilization contribution (20%)
    const utilization = this.calculateCacheUtilization(cacheMetrics);
    score += (1 - Math.abs(utilization - 0.7)) * 20; // Optimal at 70%
    
    // Performance contribution (10%)
    const avgRetrievalTime = this.calculateAvgRetrievalTime(cacheMetrics);
    score += Math.max(0, (100 - avgRetrievalTime) / 10);
    
    // Generate recommendations
    const recommendations = this.generateCacheRecommendations(cacheMetrics, score);
    
    // Calculate potential savings
    const potentialSavings = this.calculatePotentialCacheSavings(cacheMetrics);
    
    // Generate optimal configuration
    const optimalConfig = this.generateOptimalCacheConfig(cacheMetrics);
    
    return {
      score,
      recommendations,
      potentialSavings,
      optimalConfig
    };
  }

  /**
   * Get model performance comparison
   */
  getModelComparison(): {
    rankings: ModelRanking[];
    recommendations: string[];
    optimalAllocation: Map<string, number>;
  } {
    const modelMetrics = this.currentMetrics.models;
    
    // Calculate rankings
    const rankings = this.calculateModelRankings(modelMetrics);
    
    // Generate recommendations
    const recommendations = this.generateModelRecommendations(rankings);
    
    // Calculate optimal allocation
    const optimalAllocation = this.calculateOptimalModelAllocation(modelMetrics);
    
    return {
      rankings,
      recommendations,
      optimalAllocation
    };
  }

  // Private collection methods

  private async collectCacheMetrics(): Promise<CacheMetrics> {
    // Get cache stats from Redis
    const stats = await this.getCacheStatsFromRedis();
    
    // Calculate tier metrics
    const byTier = new Map<CacheTier, TierMetrics>();
    for (const tier of [CacheTier.MEMORY, CacheTier.REDIS, CacheTier.S3]) {
      byTier.set(tier, await this.getTierMetrics(tier));
    }
    
    // Identify top patterns
    const topPatterns = await this.identifyCachePatterns();
    
    // Calculate effectiveness
    const effectiveness = await this.getCacheEffectiveness();
    
    return {
      overall: {
        hitRate: stats.hitRate || 0,
        missRate: stats.missRate || 0,
        evictionRate: stats.evictionRate || 0,
        totalEntries: stats.totalEntries || 0,
        totalSize: stats.totalSize || 0,
        costSavings: stats.costSavings || 0
      },
      byTier,
      topPatterns,
      effectiveness
    };
  }

  private async collectModelMetrics(): Promise<ModelMetrics> {
    const byModel = new Map<string, SingleModelMetrics>();
    const byType = new Map<ModelType, TypeMetrics>();
    
    // Get model stats from Redis
    const modelStats = await this.getModelStatsFromRedis();
    
    for (const [modelId, stats] of modelStats) {
      byModel.set(modelId, {
        modelId,
        requests: stats.requests || 0,
        successes: stats.successes || 0,
        failures: stats.failures || 0,
        avgResponseTime: stats.avgResponseTime || 0,
        p95ResponseTime: stats.p95ResponseTime || 0,
        cost: stats.cost || 0,
        efficiency: stats.cost / Math.max(stats.successes, 1),
        reliability: stats.successes / Math.max(stats.requests, 1),
        utilization: stats.utilization || 0
      });
    }
    
    // Aggregate by type
    for (const type of Object.values(ModelType)) {
      const typeModels = Array.from(byModel.values())
        .filter(m => this.getModelType(m.modelId) === type);
      
      if (typeModels.length > 0) {
        byType.set(type as ModelType, {
          type: type as ModelType,
          models: typeModels.map(m => m.modelId),
          totalRequests: typeModels.reduce((sum, m) => sum + m.requests, 0),
          avgCost: typeModels.reduce((sum, m) => sum + m.cost, 0) / typeModels.length,
          avgResponseTime: typeModels.reduce((sum, m) => sum + m.avgResponseTime, 0) / typeModels.length,
          preferredModel: typeModels.sort((a, b) => b.efficiency - a.efficiency)[0].modelId
        });
      }
    }
    
    // Calculate overall metrics
    const allModels = Array.from(byModel.values());
    const overall = {
      totalRequests: allModels.reduce((sum, m) => sum + m.requests, 0),
      avgResponseTime: allModels.reduce((sum, m) => sum + m.avgResponseTime * m.requests, 0) / 
                       Math.max(allModels.reduce((sum, m) => sum + m.requests, 0), 1),
      successRate: allModels.reduce((sum, m) => sum + m.successes, 0) / 
                   Math.max(allModels.reduce((sum, m) => sum + m.requests, 0), 1),
      utilizationRate: allModels.reduce((sum, m) => sum + m.utilization, 0) / Math.max(allModels.length, 1),
      costPerRequest: allModels.reduce((sum, m) => sum + m.cost, 0) / 
                      Math.max(allModels.reduce((sum, m) => sum + m.requests, 0), 1)
    };
    
    // Calculate rankings
    const rankings = this.calculateModelRankings({ byModel, byType, overall, rankings: [] });
    
    return {
      byModel,
      byType,
      overall,
      rankings
    };
  }

  private async collectCostMetrics(): Promise<CostMetrics> {
    const costData = await this.getCostDataFromRedis();
    
    // Calculate savings
    const savings = {
      fromCache: costData.cacheSavings || 0,
      fromBatching: costData.batchingSavings || 0,
      fromOptimization: costData.optimizationSavings || 0,
      total: (costData.cacheSavings || 0) + (costData.batchingSavings || 0) + (costData.optimizationSavings || 0)
    };
    
    // Generate projections
    const projections = this.generateCostProjections(costData);
    
    // Generate optimization recommendations
    const optimization = this.generateCostRecommendations([this.currentMetrics]);
    
    return {
      total: costData.total || 0,
      byModel: costData.byModel || new Map(),
      byUserTier: costData.byUserTier || new Map(),
      byRequestType: costData.byRequestType || new Map(),
      savings,
      projections,
      optimization
    };
  }

  private async collectUserMetrics(): Promise<UserMetrics> {
    const userData = await this.getUserDataFromRedis();
    
    return {
      totalUsers: userData.total || 0,
      activeUsers: userData.active || 0,
      byTier: userData.byTier || new Map(),
      engagement: userData.engagement || { daily: 0, weekly: 0, monthly: 0 },
      behavior: {
        avgRequestsPerUser: userData.avgRequests || 0,
        avgDocumentSize: userData.avgDocSize || 0,
        peakUsageHours: userData.peakHours || [],
        commonRequestTypes: userData.requestTypes || new Map(),
        repeatUsageRate: userData.repeatRate || 0
      },
      satisfaction: {
        avgResponseTime: userData.avgResponseTime || 0,
        successRate: userData.successRate || 0,
        cacheHitRate: userData.cacheHitRate || 0,
        estimatedSatisfaction: this.calculateSatisfactionScore(userData)
      }
    };
  }

  private async collectPerformanceMetrics(): Promise<PerformanceMetrics> {
    const perfData = await this.getPerformanceDataFromRedis();
    
    return {
      latency: {
        p50: perfData.p50 || 0,
        p90: perfData.p90 || 0,
        p95: perfData.p95 || 0,
        p99: perfData.p99 || 0
      },
      throughput: {
        current: perfData.currentThroughput || 0,
        peak: perfData.peakThroughput || 0,
        average: perfData.avgThroughput || 0
      },
      availability: perfData.availability || 99.9,
      errorRate: perfData.errorRate || 0,
      saturation: perfData.saturation || 0
    };
  }

  private async generatePredictions(): Promise<PredictionMetrics> {
    const history = this.metricsHistory.slice(-24); // Last 24 snapshots
    
    // Simple prediction based on historical trends
    const loads = history.map(m => m.models.overall.totalRequests);
    const avgLoad = loads.reduce((sum, l) => sum + l, 0) / loads.length;
    const trend = this.calculateTrend(loads);
    
    return {
      nextHourLoad: avgLoad * (1 + trend * 0.1),
      nextDayLoad: avgLoad * 24 * (1 + trend * 0.2),
      peakTime: this.predictPeakTime(history),
      recommendedCapacity: this.calculateRecommendedCapacity(avgLoad, trend),
      costForecast: this.forecastCost(history, trend)
    };
  }

  // Helper methods

  private initializeMetrics(): MetricsSnapshot {
    return {
      timestamp: new Date(),
      period: 'realtime',
      cache: {
        overall: {
          hitRate: 0,
          missRate: 0,
          evictionRate: 0,
          totalEntries: 0,
          totalSize: 0,
          costSavings: 0
        },
        byTier: new Map(),
        topPatterns: [],
        effectiveness: {
          score: 0,
          recommendations: [],
          potentialSavings: 0,
          optimalConfig: {}
        }
      },
      models: {
        byModel: new Map(),
        byType: new Map(),
        overall: {
          totalRequests: 0,
          avgResponseTime: 0,
          successRate: 0,
          utilizationRate: 0,
          costPerRequest: 0
        },
        rankings: []
      },
      costs: {
        total: 0,
        byModel: new Map(),
        byUserTier: new Map(),
        byRequestType: new Map(),
        savings: {
          fromCache: 0,
          fromBatching: 0,
          fromOptimization: 0,
          total: 0
        },
        projections: {
          daily: 0,
          weekly: 0,
          monthly: 0,
          quarterly: 0,
          trend: 'stable',
          confidenceInterval: { lower: 0, upper: 0 }
        },
        optimization: []
      },
      users: {
        totalUsers: 0,
        activeUsers: 0,
        byTier: new Map(),
        engagement: { daily: 0, weekly: 0, monthly: 0 },
        behavior: {
          avgRequestsPerUser: 0,
          avgDocumentSize: 0,
          peakUsageHours: [],
          commonRequestTypes: new Map(),
          repeatUsageRate: 0
        },
        satisfaction: {
          avgResponseTime: 0,
          successRate: 0,
          cacheHitRate: 0,
          estimatedSatisfaction: 0
        }
      },
      performance: {
        latency: { p50: 0, p90: 0, p95: 0, p99: 0 },
        throughput: { current: 0, peak: 0, average: 0 },
        availability: 99.9,
        errorRate: 0,
        saturation: 0
      },
      predictions: {
        nextHourLoad: 0,
        nextDayLoad: 0,
        peakTime: new Date(),
        recommendedCapacity: new Map(),
        costForecast: 0
      }
    };
  }

  private startCollection(): void {
    // Collect metrics every minute
    this.collectionInterval = setInterval(() => {
      this.collectMetrics().catch(err => 
        this.logger.error({ err }, 'Failed to collect metrics')
      );
    }, 60000);
    
    // Aggregate metrics every hour
    this.aggregationInterval = setInterval(() => {
      this.aggregateAndStore().catch(err => 
        this.logger.error({ err }, 'Failed to aggregate metrics')
      );
    }, 3600000);
  }

  private async storeMetrics(snapshot: MetricsSnapshot): Promise<void> {
    const key = `metrics:${snapshot.timestamp.getTime()}`;
    await this.redis.setex(
      key,
      86400, // 24 hour TTL
      JSON.stringify(snapshot)
    );
  }

  private async loadMetricsFromRedis(
    startTime: Date,
    endTime: Date
  ): Promise<MetricsSnapshot[]> {
    const metrics: MetricsSnapshot[] = [];
    
    // Scan for metrics keys in time range
    const pattern = 'metrics:*';
    const keys = await this.redis.keys(pattern);
    
    for (const key of keys) {
      const timestamp = parseInt(key.split(':')[1]);
      if (timestamp >= startTime.getTime() && timestamp <= endTime.getTime()) {
        const data = await this.redis.get(key);
        if (data) {
          metrics.push(JSON.parse(data));
        }
      }
    }
    
    return metrics.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private aggregateMetrics(
    metrics: MetricsSnapshot[],
    aggregation: string
  ): MetricsSnapshot[] {
    // Group metrics by aggregation period
    // Implementation would aggregate metrics based on the period
    return metrics;
  }

  // Stub methods for Redis data retrieval
  private async getCacheStatsFromRedis(): Promise<any> {
    // Implementation would fetch actual cache stats from Redis
    return {
      hitRate: 0.35,
      missRate: 0.65,
      evictionRate: 0.05,
      totalEntries: 1000,
      totalSize: 1024 * 1024 * 100,
      costSavings: 500
    };
  }

  private async getTierMetrics(tier: CacheTier): Promise<TierMetrics> {
    // Implementation would fetch actual tier metrics
    return {
      tier,
      entries: 100,
      size: 1024 * 1024 * 10,
      hitRate: 0.3,
      avgRetrievalTime: tier === CacheTier.MEMORY ? 1 : tier === CacheTier.REDIS ? 5 : 50,
      costPerHit: 0.001,
      utilization: 0.7
    };
  }

  private async identifyCachePatterns(): Promise<CachePattern[]> {
    return [
      {
        pattern: 'terms_of_service',
        frequency: 100,
        avgHitRate: 0.4,
        costSavings: 50
      }
    ];
  }

  private async getModelStatsFromRedis(): Promise<Map<string, any>> {
    return new Map([
      ['llama-model', {
        requests: 100,
        successes: 95,
        failures: 5,
        avgResponseTime: 81000,
        p95ResponseTime: 95000,
        cost: 10,
        utilization: 0.6
      }]
    ]);
  }

  private getModelType(modelId: string): ModelType {
    // Implementation would determine model type
    return ModelType.PRIMARY;
  }

  private async getCostDataFromRedis(): Promise<any> {
    return {
      total: 100,
      byModel: new Map([['llama-model', 50]]),
      byUserTier: new Map([[UserTier.FREE, { 
        tier: UserTier.FREE,
        users: 100,
        requests: 1000,
        totalCost: 50,
        avgCostPerUser: 0.5,
        avgCostPerRequest: 0.05
      }]]),
      byRequestType: new Map([[RequestType.DOCUMENT_ANALYSIS, 30]]),
      cacheSavings: 20,
      batchingSavings: 10,
      optimizationSavings: 5
    };
  }

  private async getUserDataFromRedis(): Promise<any> {
    return {
      total: 1000,
      active: 100,
      byTier: new Map([[UserTier.FREE, 800]]),
      engagement: { daily: 100, weekly: 500, monthly: 1000 },
      avgRequests: 10,
      avgDocSize: 1024 * 10,
      peakHours: [9, 10, 14, 15],
      requestTypes: new Map([[RequestType.DOCUMENT_ANALYSIS, 500]]),
      repeatRate: 0.6,
      avgResponseTime: 5000,
      successRate: 0.95,
      cacheHitRate: 0.35
    };
  }

  private async getPerformanceDataFromRedis(): Promise<any> {
    return {
      p50: 3000,
      p90: 8000,
      p95: 15000,
      p99: 30000,
      currentThroughput: 10,
      peakThroughput: 50,
      avgThroughput: 20,
      availability: 99.95,
      errorRate: 0.02,
      saturation: 0.6
    };
  }

  private calculateModelRankings(modelMetrics: ModelMetrics): ModelRanking[] {
    const models = Array.from(modelMetrics.byModel.values());
    
    // Sort by different criteria
    const costSorted = [...models].sort((a, b) => a.efficiency - b.efficiency);
    const speedSorted = [...models].sort((a, b) => a.avgResponseTime - b.avgResponseTime);
    const reliabilitySorted = [...models].sort((a, b) => b.reliability - a.reliability);
    
    return models.map(model => {
      const costRank = costSorted.findIndex(m => m.modelId === model.modelId) + 1;
      const speedRank = speedSorted.findIndex(m => m.modelId === model.modelId) + 1;
      const reliabilityRank = reliabilitySorted.findIndex(m => m.modelId === model.modelId) + 1;
      
      // Composite score (lower is better)
      const score = (costRank * 0.4 + speedRank * 0.3 + reliabilityRank * 0.3) / models.length * 100;
      
      return {
        modelId: model.modelId,
        score,
        costRank,
        speedRank,
        reliabilityRank,
        recommendation: score < 30 ? 'Excellent' : score < 60 ? 'Good' : 'Needs Improvement'
      };
    });
  }

  private generateCostProjections(costData: any): CostProjection {
    const hourlyRate = costData.total / 24;
    
    return {
      daily: hourlyRate * 24,
      weekly: hourlyRate * 24 * 7,
      monthly: hourlyRate * 24 * 30,
      quarterly: hourlyRate * 24 * 90,
      trend: 'stable',
      confidenceInterval: {
        lower: hourlyRate * 24 * 0.8,
        upper: hourlyRate * 24 * 1.2
      }
    };
  }

  private generateCostRecommendations(metrics: MetricsSnapshot[]): CostOptimizationRecommendation[] {
    const recommendations: CostOptimizationRecommendation[] = [];
    
    const latestMetrics = metrics[metrics.length - 1];
    
    if (latestMetrics.cache.overall.hitRate < 0.3) {
      recommendations.push({
        type: 'cache',
        description: 'Improve cache hit rate',
        potentialSavings: latestMetrics.costs.total * 0.2,
        implementation: 'Implement cache warming and increase TTL',
        priority: 'high'
      });
    }
    
    return recommendations;
  }

  private calculateCacheUtilization(cacheMetrics: CacheMetrics): number {
    const tiers = Array.from(cacheMetrics.byTier.values());
    if (tiers.length === 0) return 0;
    
    return tiers.reduce((sum, t) => sum + t.utilization, 0) / tiers.length;
  }

  private calculateAvgRetrievalTime(cacheMetrics: CacheMetrics): number {
    const tiers = Array.from(cacheMetrics.byTier.values());
    if (tiers.length === 0) return 0;
    
    return tiers.reduce((sum, t) => sum + t.avgRetrievalTime, 0) / tiers.length;
  }

  private generateCacheRecommendations(cacheMetrics: CacheMetrics, score: number): string[] {
    const recommendations: string[] = [];
    
    if (score < 50) {
      recommendations.push('Consider increasing cache size');
      recommendations.push('Implement more aggressive cache warming');
    }
    
    if (cacheMetrics.overall.hitRate < 0.3) {
      recommendations.push('Review cache key generation strategy');
      recommendations.push('Increase cache TTL for frequently accessed items');
    }
    
    return recommendations;
  }

  private calculatePotentialCacheSavings(cacheMetrics: CacheMetrics): number {
    const currentHitRate = cacheMetrics.overall.hitRate;
    const potentialHitRate = Math.min(0.6, currentHitRate * 1.5);
    const additionalHits = potentialHitRate - currentHitRate;
    
    return additionalHits * cacheMetrics.overall.totalEntries * 0.01; // $0.01 per hit saved
  }

  private generateOptimalCacheConfig(cacheMetrics: CacheMetrics): any {
    return {
      memory: {
        size: '2GB',
        ttl: 7200
      },
      redis: {
        size: '20GB',
        ttl: 86400
      },
      s3: {
        enabled: true,
        archiveAfterDays: 7
      }
    };
  }

  private generateModelRecommendations(rankings: ModelRanking[]): string[] {
    const recommendations: string[] = [];
    
    const topModel = rankings.sort((a, b) => a.score - b.score)[0];
    recommendations.push(`Prioritize ${topModel.modelId} for cost-effective processing`);
    
    const poorPerformers = rankings.filter(r => r.score > 70);
    if (poorPerformers.length > 0) {
      recommendations.push(`Consider replacing or optimizing: ${poorPerformers.map(p => p.modelId).join(', ')}`);
    }
    
    return recommendations;
  }

  private calculateOptimalModelAllocation(modelMetrics: ModelMetrics): Map<string, number> {
    const allocation = new Map<string, number>();
    
    for (const [modelId, metrics] of modelMetrics.byModel) {
      // Allocate based on efficiency and reliability
      const allocationScore = metrics.reliability / metrics.efficiency;
      allocation.set(modelId, Math.round(allocationScore * 100));
    }
    
    return allocation;
  }

  private calculateSatisfactionScore(userData: any): number {
    let score = 50; // baseline
    
    // Response time impact
    if (userData.avgResponseTime < 5000) score += 20;
    else if (userData.avgResponseTime < 10000) score += 10;
    
    // Success rate impact
    score += userData.successRate * 20;
    
    // Cache hit rate impact
    score += userData.cacheHitRate * 10;
    
    return Math.min(100, score);
  }

  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;
    
    // Simple linear regression
    const n = values.length;
    const sumX = values.reduce((sum, _, i) => sum + i, 0);
    const sumY = values.reduce((sum, v) => sum + v, 0);
    const sumXY = values.reduce((sum, v, i) => sum + i * v, 0);
    const sumX2 = values.reduce((sum, _, i) => sum + i * i, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    return slope;
  }

  private predictPeakTime(history: MetricsSnapshot[]): Date {
    // Find the hour with highest load
    const hourlyLoads = new Map<number, number>();
    
    for (const snapshot of history) {
      const hour = snapshot.timestamp.getHours();
      const load = snapshot.models.overall.totalRequests;
      hourlyLoads.set(hour, (hourlyLoads.get(hour) || 0) + load);
    }
    
    const peakHour = Array.from(hourlyLoads.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 14;
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(peakHour, 0, 0, 0);
    
    return tomorrow;
  }

  private calculateRecommendedCapacity(avgLoad: number, trend: number): Map<string, number> {
    const capacity = new Map<string, number>();
    
    // Calculate future load
    const futureLoad = avgLoad * (1 + trend * 0.2);
    
    // Allocate capacity
    capacity.set('primary-models', Math.ceil(futureLoad / 100));
    capacity.set('cache-memory', Math.ceil(futureLoad * 0.1)); // MB
    capacity.set('cache-redis', Math.ceil(futureLoad * 1)); // MB
    
    return capacity;
  }

  private forecastCost(history: MetricsSnapshot[], trend: number): number {
    if (history.length === 0) return 0;
    
    const avgCost = history.reduce((sum, m) => sum + m.costs.total, 0) / history.length;
    return avgCost * (1 + trend * 0.1);
  }

  private async getMetricsForPeriod(period: 'day' | 'week' | 'month'): Promise<MetricsSnapshot[]> {
    const now = new Date();
    const startTime = new Date();
    
    switch (period) {
      case 'day':
        startTime.setDate(now.getDate() - 1);
        break;
      case 'week':
        startTime.setDate(now.getDate() - 7);
        break;
      case 'month':
        startTime.setMonth(now.getMonth() - 1);
        break;
    }
    
    return this.loadMetricsFromRedis(startTime, now);
  }

  private aggregateCostsByModel(metrics: MetricsSnapshot[]): Map<string, number> {
    const costs = new Map<string, number>();
    
    for (const snapshot of metrics) {
      for (const [modelId, cost] of snapshot.costs.byModel) {
        costs.set(modelId, (costs.get(modelId) || 0) + cost);
      }
    }
    
    return costs;
  }

  private aggregateCostsByTier(metrics: MetricsSnapshot[]): Map<UserTier, TierCostMetrics> {
    const costs = new Map<UserTier, TierCostMetrics>();
    
    for (const tier of Object.values(UserTier)) {
      const tierMetrics: TierCostMetrics = {
        tier: tier as UserTier,
        users: 0,
        requests: 0,
        totalCost: 0,
        avgCostPerUser: 0,
        avgCostPerRequest: 0
      };
      
      for (const snapshot of metrics) {
        const tierData = snapshot.costs.byUserTier.get(tier as UserTier);
        if (tierData) {
          tierMetrics.users = Math.max(tierMetrics.users, tierData.users);
          tierMetrics.requests += tierData.requests;
          tierMetrics.totalCost += tierData.totalCost;
        }
      }
      
      if (tierMetrics.users > 0) {
        tierMetrics.avgCostPerUser = tierMetrics.totalCost / tierMetrics.users;
      }
      if (tierMetrics.requests > 0) {
        tierMetrics.avgCostPerRequest = tierMetrics.totalCost / tierMetrics.requests;
      }
      
      costs.set(tier as UserTier, tierMetrics);
    }
    
    return costs;
  }

  private aggregateCostsByType(metrics: MetricsSnapshot[]): Map<RequestType, number> {
    const costs = new Map<RequestType, number>();
    
    for (const snapshot of metrics) {
      for (const [type, cost] of snapshot.costs.byRequestType) {
        costs.set(type, (costs.get(type) || 0) + cost);
      }
    }
    
    return costs;
  }

  private aggregateCostsByHour(metrics: MetricsSnapshot[]): Map<number, number> {
    const hourlyCosts = new Map<number, number>();
    
    for (const snapshot of metrics) {
      const hour = snapshot.timestamp.getHours();
      hourlyCosts.set(hour, (hourlyCosts.get(hour) || 0) + snapshot.costs.total);
    }
    
    return hourlyCosts;
  }

  private estimateRevenue(metrics: MetricsSnapshot[]): number {
    // Estimate revenue based on user tiers
    let revenue = 0;
    
    for (const snapshot of metrics) {
      const premiumUsers = snapshot.users.byTier.get(UserTier.PREMIUM) || 0;
      const enterpriseUsers = snapshot.users.byTier.get(UserTier.ENTERPRISE) || 0;
      
      revenue += premiumUsers * 10; // $10 per premium user
      revenue += enterpriseUsers * 100; // $100 per enterprise user
    }
    
    return revenue;
  }

  private async aggregateAndStore(): Promise<void> {
    const hourAgo = new Date(Date.now() - 3600000);
    const now = new Date();
    
    const hourlyMetrics = await this.loadMetricsFromRedis(hourAgo, now);
    if (hourlyMetrics.length === 0) return;
    
    // Aggregate metrics
    const aggregated = this.createAggregatedSnapshot(hourlyMetrics, 'hourly');
    
    // Store aggregated metrics
    const key = `metrics:hourly:${now.getTime()}`;
    await this.redis.setex(
      key,
      604800, // 7 day TTL for hourly aggregates
      JSON.stringify(aggregated)
    );
  }

  private createAggregatedSnapshot(metrics: MetricsSnapshot[], period: string): MetricsSnapshot {
    // Create aggregated snapshot from multiple snapshots
    const aggregated = this.initializeMetrics();
    aggregated.period = period;
    
    // Aggregate all metrics (simplified)
    for (const snapshot of metrics) {
      aggregated.costs.total += snapshot.costs.total;
      aggregated.models.overall.totalRequests += snapshot.models.overall.totalRequests;
    }
    
    return aggregated;
  }

  /**
   * Destroy metrics collector
   */
  destroy(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }
    if (this.aggregationInterval) {
      clearInterval(this.aggregationInterval);
    }
    
    this.removeAllListeners();
    this.logger.info('Metrics collector destroyed');
  }
}