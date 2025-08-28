/**
 * Cost Optimizer - Track and optimize model costs
 */

import { Redis } from 'ioredis';
import pino from 'pino';
import {
  CostReport,
  ModelCostBreakdown,
  UserTierCostBreakdown,
  UserTier,
  ModelConfig
} from '../types';
import { ModelRegistry } from '../registry/model-registry';

const logger = pino({ name: 'cost-optimizer' });

export class CostOptimizer {
  private registry: ModelRegistry;
  private redis: Redis;
  private costThresholds: Map<UserTier, number>;
  private budgetAlerts: Map<string, number>;

  constructor(registry: ModelRegistry, redis: Redis) {
    this.registry = registry;
    this.redis = redis;
    this.costThresholds = new Map();
    this.budgetAlerts = new Map();
    this.initializeCostThresholds();
  }

  /**
   * Initialize cost thresholds per user tier
   */
  private initializeCostThresholds(): void {
    this.costThresholds.set(UserTier.FREE, 1.0); // $1 per month
    this.costThresholds.set(UserTier.PREMIUM, 50.0); // $50 per month
    this.costThresholds.set(UserTier.ENTERPRISE, 500.0); // $500 per month
  }

  /**
   * Track cost for a request
   */
  public async trackCost(
    userId: string,
    userTier: UserTier,
    modelId: string,
    cost: number,
    cached: boolean = false
  ): Promise<void> {
    try {
      const timestamp = Date.now();
      const date = new Date();
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      // If cached, record savings
      if (cached) {
        await this.redis.hincrbyfloat(`costs:savings:${monthKey}`, 'total', cost);
        await this.redis.hincrbyfloat(`costs:savings:${monthKey}:user:${userId}`, 'amount', cost);
        logger.info({ userId, modelId, cost }, 'Cost saved due to cache hit');
        return;
      }

      // Track actual cost
      await this.redis.zadd(
        `costs:transactions`,
        timestamp,
        JSON.stringify({
          userId,
          userTier,
          modelId,
          cost,
          timestamp: date.toISOString()
        })
      );

      // Update aggregated costs
      await this.redis.hincrbyfloat(`costs:total:${monthKey}`, 'all', cost);
      await this.redis.hincrbyfloat(`costs:total:${monthKey}`, userTier, cost);
      await this.redis.hincrbyfloat(`costs:model:${monthKey}:${modelId}`, 'total', cost);
      await this.redis.hincrby(`costs:model:${monthKey}:${modelId}`, 'requests', 1);
      await this.redis.hincrbyfloat(`costs:user:${monthKey}:${userId}`, 'total', cost);
      await this.redis.hincrby(`costs:user:${monthKey}:${userId}`, 'requests', 1);

      // Check budget alerts
      await this.checkBudgetAlert(userId, userTier, monthKey);

      logger.info({
        userId,
        userTier,
        modelId,
        cost,
        monthKey
      }, 'Cost tracked');
    } catch (error) {
      logger.error({ error, userId, modelId, cost }, 'Failed to track cost');
    }
  }

  /**
   * Check and trigger budget alerts
   */
  private async checkBudgetAlert(
    userId: string,
    userTier: UserTier,
    monthKey: string
  ): Promise<void> {
    const userCostStr = await this.redis.hget(`costs:user:${monthKey}:${userId}`, 'total');
    const userCost = parseFloat(userCostStr || '0');
    const threshold = this.costThresholds.get(userTier) || 0;

    // Check if user is approaching or exceeding budget
    const percentageUsed = (userCost / threshold) * 100;

    if (percentageUsed >= 90 && !this.budgetAlerts.has(`${userId}-90`)) {
      this.budgetAlerts.set(`${userId}-90`, Date.now());
      await this.triggerBudgetAlert(userId, userTier, userCost, threshold, 90);
    } else if (percentageUsed >= 75 && !this.budgetAlerts.has(`${userId}-75`)) {
      this.budgetAlerts.set(`${userId}-75`, Date.now());
      await this.triggerBudgetAlert(userId, userTier, userCost, threshold, 75);
    } else if (percentageUsed >= 50 && !this.budgetAlerts.has(`${userId}-50`)) {
      this.budgetAlerts.set(`${userId}-50`, Date.now());
      await this.triggerBudgetAlert(userId, userTier, userCost, threshold, 50);
    }
  }

  /**
   * Trigger budget alert
   */
  private async triggerBudgetAlert(
    userId: string,
    userTier: UserTier,
    currentCost: number,
    threshold: number,
    percentage: number
  ): Promise<void> {
    const alert = {
      userId,
      userTier,
      currentCost,
      threshold,
      percentage,
      timestamp: new Date().toISOString(),
      message: `User ${userId} has used ${percentage}% of their monthly budget`
    };

    // Store alert
    await this.redis.lpush('alerts:budget', JSON.stringify(alert));
    
    // Emit event for notification service
    logger.warn(alert, 'Budget alert triggered');
  }

  /**
   * Generate cost report
   */
  public async generateCostReport(period: string = 'current'): Promise<CostReport> {
    const date = new Date();
    let monthKey: string;

    if (period === 'current') {
      monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    } else {
      monthKey = period; // Expect format: YYYY-MM
    }

    // Get total costs
    const totalCosts = await this.redis.hgetall(`costs:total:${monthKey}`);
    const totalCost = parseFloat(totalCosts.all || '0');

    // Get model costs
    const models = this.registry.getAllModels();
    const modelCosts: ModelCostBreakdown[] = [];

    for (const model of models) {
      const modelData = await this.redis.hgetall(`costs:model:${monthKey}:${model.id}`);
      if (modelData.total) {
        modelCosts.push({
          modelId: model.id,
          modelName: model.name,
          requests: parseInt(modelData.requests || '0', 10),
          totalCost: parseFloat(modelData.total),
          avgCostPerRequest: parseFloat(modelData.total) / parseInt(modelData.requests || '1', 10)
        });
      }
    }

    // Get user tier costs
    const userTierCosts: UserTierCostBreakdown[] = [];
    
    for (const tier of Object.values(UserTier)) {
      const tierCost = parseFloat(totalCosts[tier] || '0');
      if (tierCost > 0) {
        // Count unique users per tier
        const userKeys = await this.redis.keys(`costs:user:${monthKey}:*`);
        const tierUsers = new Set<string>();
        
        for (const key of userKeys) {
          const userId = key.split(':').pop();
          if (userId) {
            // Check user tier (would need user service integration)
            tierUsers.add(userId);
          }
        }

        userTierCosts.push({
          tier: tier as UserTier,
          users: tierUsers.size,
          requests: 0, // Would need to aggregate
          totalCost: tierCost,
          avgCostPerUser: tierCost / Math.max(tierUsers.size, 1)
        });
      }
    }

    // Get savings from cache
    const savings = await this.redis.hget(`costs:savings:${monthKey}`, 'total');
    const savingsFromCache = parseFloat(savings || '0');

    // Calculate projected monthly cost
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const daysPassed = date.getDate();
    const projectedMonthlyCost = (totalCost / daysPassed) * daysInMonth;

    return {
      period: monthKey,
      totalCost,
      modelCosts: modelCosts.sort((a, b) => b.totalCost - a.totalCost),
      userTierCosts,
      savingsFromCache,
      projectedMonthlyCost
    };
  }

  /**
   * Get cost optimization recommendations
   */
  public async getOptimizationRecommendations(): Promise<any[]> {
    const recommendations: any[] = [];
    const report = await this.generateCostReport();

    // Recommendation 1: Identify expensive models with low usage
    for (const modelCost of report.modelCosts) {
      const model = this.registry.getModel(modelCost.modelId);
      if (model && modelCost.avgCostPerRequest > 0.005 && modelCost.requests < 100) {
        recommendations.push({
          type: 'MODEL_OPTIMIZATION',
          priority: 'MEDIUM',
          model: modelCost.modelName,
          message: `Consider using cheaper alternatives for ${modelCost.modelName}. Current avg cost: $${modelCost.avgCostPerRequest.toFixed(4)}`,
          potentialSavings: modelCost.totalCost * 0.5 // Estimate 50% savings
        });
      }
    }

    // Recommendation 2: Cache optimization
    const cacheHitRate = await this.getCacheHitRate();
    if (cacheHitRate < 0.3) {
      recommendations.push({
        type: 'CACHE_OPTIMIZATION',
        priority: 'HIGH',
        message: `Cache hit rate is only ${(cacheHitRate * 100).toFixed(1)}%. Improving caching could save significant costs.`,
        potentialSavings: report.totalCost * 0.2 // Estimate 20% savings
      });
    }

    // Recommendation 3: Model routing optimization
    const modelUsage = await this.getModelUsageDistribution();
    const primaryModel = this.registry.getModel('fine-print-llama');
    
    if (primaryModel && modelUsage['fine-print-llama'] < 0.6) {
      recommendations.push({
        type: 'ROUTING_OPTIMIZATION',
        priority: 'HIGH',
        message: 'Primary model (Llama) is underutilized. Optimize routing to prefer cheaper models.',
        potentialSavings: report.totalCost * 0.15
      });
    }

    // Recommendation 4: Batch processing for non-urgent requests
    recommendations.push({
      type: 'BATCH_PROCESSING',
      priority: 'LOW',
      message: 'Consider implementing batch processing for non-urgent requests to reduce costs.',
      potentialSavings: report.totalCost * 0.1
    });

    // Calculate total potential savings
    const totalPotentialSavings = recommendations.reduce(
      (sum, rec) => sum + (rec.potentialSavings || 0),
      0
    );

    return {
      recommendations,
      currentMonthlyCost: report.totalCost,
      projectedMonthlyCost: report.projectedMonthlyCost,
      totalPotentialSavings,
      potentialOptimizedCost: report.projectedMonthlyCost - totalPotentialSavings
    };
  }

  /**
   * Get cache hit rate
   */
  private async getCacheHitRate(): Promise<number> {
    const stats = await this.redis.hgetall('cache:stats');
    const hits = parseInt(stats.hits || '0', 10);
    const misses = parseInt(stats.misses || '0', 10);
    const total = hits + misses;
    
    return total > 0 ? hits / total : 0;
  }

  /**
   * Get model usage distribution
   */
  private async getModelUsageDistribution(): Promise<Record<string, number>> {
    const date = new Date();
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const distribution: Record<string, number> = {};
    let totalRequests = 0;

    for (const model of this.registry.getAllModels()) {
      const modelData = await this.redis.hget(`costs:model:${monthKey}:${model.id}`, 'requests');
      const requests = parseInt(modelData || '0', 10);
      distribution[model.id] = requests;
      totalRequests += requests;
    }

    // Convert to percentages
    if (totalRequests > 0) {
      for (const modelId in distribution) {
        distribution[modelId] = distribution[modelId] / totalRequests;
      }
    }

    return distribution;
  }

  /**
   * Get user cost summary
   */
  public async getUserCostSummary(userId: string): Promise<any> {
    const date = new Date();
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    const userData = await this.redis.hgetall(`costs:user:${monthKey}:${userId}`);
    const savings = await this.redis.hget(`costs:savings:${monthKey}:user:${userId}`, 'amount');
    
    // Get recent transactions
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const transactions = await this.redis.zrangebyscore(
      'costs:transactions',
      oneWeekAgo,
      Date.now()
    );

    const userTransactions = transactions
      .map(t => JSON.parse(t))
      .filter(t => t.userId === userId)
      .slice(-10); // Last 10 transactions

    return {
      userId,
      period: monthKey,
      totalCost: parseFloat(userData.total || '0'),
      totalRequests: parseInt(userData.requests || '0', 10),
      avgCostPerRequest: userData.total ? 
        parseFloat(userData.total) / parseInt(userData.requests || '1', 10) : 0,
      savingsFromCache: parseFloat(savings || '0'),
      recentTransactions: userTransactions,
      budgetUsage: await this.getUserBudgetUsage(userId)
    };
  }

  /**
   * Get user budget usage
   */
  private async getUserBudgetUsage(userId: string): Promise<any> {
    const date = new Date();
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const userData = await this.redis.hget(`costs:user:${monthKey}:${userId}`, 'total');
    const userCost = parseFloat(userData || '0');
    
    // Default to FREE tier (would need user service integration)
    const userTier = UserTier.FREE;
    const threshold = this.costThresholds.get(userTier) || 1.0;
    
    return {
      used: userCost,
      limit: threshold,
      percentage: (userCost / threshold) * 100,
      remaining: Math.max(0, threshold - userCost),
      tier: userTier
    };
  }

  /**
   * Reset monthly budget alerts
   */
  public async resetMonthlyAlerts(): Promise<void> {
    this.budgetAlerts.clear();
    await this.redis.del('alerts:budget');
    logger.info('Monthly budget alerts reset');
  }

  /**
   * Export cost data for billing
   */
  public async exportCostData(monthKey: string): Promise<any> {
    const totalCosts = await this.redis.hgetall(`costs:total:${monthKey}`);
    const userKeys = await this.redis.keys(`costs:user:${monthKey}:*`);
    
    const userCosts = await Promise.all(
      userKeys.map(async key => {
        const userId = key.split(':').pop();
        const data = await this.redis.hgetall(key);
        return {
          userId,
          totalCost: parseFloat(data.total || '0'),
          requests: parseInt(data.requests || '0', 10)
        };
      })
    );

    return {
      period: monthKey,
      totalCost: parseFloat(totalCosts.all || '0'),
      tierBreakdown: {
        free: parseFloat(totalCosts[UserTier.FREE] || '0'),
        premium: parseFloat(totalCosts[UserTier.PREMIUM] || '0'),
        enterprise: parseFloat(totalCosts[UserTier.ENTERPRISE] || '0')
      },
      userCosts: userCosts.sort((a, b) => b.totalCost - a.totalCost),
      exportedAt: new Date().toISOString()
    };
  }
}