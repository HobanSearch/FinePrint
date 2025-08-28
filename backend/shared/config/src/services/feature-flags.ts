// Feature Flags Service with Advanced Rollout Capabilities
// Supports A/B testing, gradual rollouts, and complex conditional logic

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { z } from 'zod';
import { FeatureFlag, FeatureFlagUpdate } from '../schemas';
import { EventEmitter } from 'events';

// Evaluation context for feature flag decisions
export interface FeatureFlagContext {
  userId?: string;
  userGroup?: string;
  region?: string;
  environment: string;
  customAttributes?: Record<string, any>;
  clientIp?: string;
  userAgent?: string;
}

// Feature flag evaluation result
export interface FeatureFlagEvaluation {
  enabled: boolean;
  variant?: string;
  reason: string;
  metadata?: Record<string, any>;
}

// Feature flag rollout strategy
export interface RolloutStrategy {
  percentage: number;
  userGroups?: string[];
  regions?: string[];
  startDate?: Date;
  endDate?: Date;
  customRules?: RolloutRule[];
}

export interface RolloutRule {
  condition: string; // JavaScript expression to evaluate
  enabled: boolean;
  weight?: number;
}

// A/B Test variant configuration
export interface FeatureFlagVariant {
  id: string;
  name: string;
  weight: number; // 0-100
  configuration: Record<string, any>;
}

export class FeatureFlagsService extends EventEmitter {
  private prisma: PrismaClient;
  private redis: Redis;
  private cachePrefix = 'ff:';
  private cacheTTL = 300; // 5 minutes

  constructor(prisma: PrismaClient, redis: Redis) {
    super();
    this.prisma = prisma;
    this.redis = redis;
  }

  // Create a new feature flag
  async createFeatureFlag(
    flag: Omit<FeatureFlag, 'id'>,
    createdBy?: string
  ): Promise<FeatureFlag> {
    // Validate flag configuration
    const validatedFlag = await this.validateFeatureFlag(flag);

    const newFlag = await this.prisma.featureFlag.create({
      data: {
        key: validatedFlag.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: validatedFlag.name,
        description: validatedFlag.description,
        enabled: validatedFlag.enabled,
        rolloutPercentage: validatedFlag.rollout?.percentage || 0,
        rolloutUserGroups: validatedFlag.rollout?.userGroups || [],
        rolloutRegions: validatedFlag.rollout?.regions || [],
        rolloutStartDate: validatedFlag.rollout?.startDate,
        rolloutEndDate: validatedFlag.rollout?.endDate,
        variants: JSON.stringify(validatedFlag.variants),
        dependencies: validatedFlag.dependencies,
        conditions: JSON.stringify({}),
        tags: validatedFlag.tags,
        createdBy,
      },
    });

    // Create audit log
    await this.createAuditLog(newFlag.id, 'CREATE', null, newFlag, createdBy);

    // Clear cache
    await this.clearFlagCache(newFlag.key);

    // Emit event for real-time updates
    this.emit('flagCreated', newFlag);

    return this.mapPrismaFlagToFeatureFlag(newFlag);
  }

  // Update an existing feature flag
  async updateFeatureFlag(
    id: string,
    updates: FeatureFlagUpdate,
    updatedBy?: string
  ): Promise<FeatureFlag> {
    const existingFlag = await this.prisma.featureFlag.findUnique({
      where: { id },
    });

    if (!existingFlag) {
      throw new Error(`Feature flag with id ${id} not found`);
    }

    // Validate updates
    const validatedUpdates = await this.validateFeatureFlagUpdate(updates);

    const updatedFlag = await this.prisma.featureFlag.update({
      where: { id },
      data: {
        name: validatedUpdates.name,
        description: validatedUpdates.description,
        enabled: validatedUpdates.enabled,
        rolloutPercentage: validatedUpdates.rollout?.percentage,
        rolloutUserGroups: validatedUpdates.rollout?.userGroups,
        rolloutRegions: validatedUpdates.rollout?.regions,
        rolloutStartDate: validatedUpdates.rollout?.startDate,
        rolloutEndDate: validatedUpdates.rollout?.endDate,
        variants: validatedUpdates.variants ? JSON.stringify(validatedUpdates.variants) : undefined,
        dependencies: validatedUpdates.dependencies,
        tags: validatedUpdates.tags,
        updatedBy,
      },
    });

    // Create audit log
    await this.createAuditLog(id, 'UPDATE', existingFlag, updatedFlag, updatedBy);

    // Clear cache
    await this.clearFlagCache(updatedFlag.key);

    // Emit event for real-time updates
    this.emit('flagUpdated', updatedFlag);

    return this.mapPrismaFlagToFeatureFlag(updatedFlag);
  }

  // Evaluate a feature flag for given context
  async evaluateFeatureFlag(
    flagKey: string,
    context: FeatureFlagContext
  ): Promise<FeatureFlagEvaluation> {
    // Try to get from cache first
    const cacheKey = `${this.cachePrefix}${flagKey}`;
    const cachedFlag = await this.redis.get(cacheKey);
    
    let flag;
    if (cachedFlag) {
      flag = JSON.parse(cachedFlag);
    } else {
      // Get from database
      flag = await this.prisma.featureFlag.findUnique({
        where: { key: flagKey },
      });

      if (!flag) {
        return {
          enabled: false,
          reason: 'FLAG_NOT_FOUND',
        };
      }

      // Cache the flag
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(flag));
    }

    // Evaluate the flag
    const evaluation = await this.performEvaluation(flag, context);

    // Log the evaluation
    await this.logEvaluation(flag, context, evaluation);

    return evaluation;
  }

  // Bulk evaluate multiple feature flags
  async evaluateFeatureFlags(
    flagKeys: string[],
    context: FeatureFlagContext
  ): Promise<Record<string, FeatureFlagEvaluation>> {
    const evaluations: Record<string, FeatureFlagEvaluation> = {};

    await Promise.all(
      flagKeys.map(async (flagKey) => {
        evaluations[flagKey] = await this.evaluateFeatureFlag(flagKey, context);
      })
    );

    return evaluations;
  }

  // Get all feature flags with optional filtering
  async getFeatureFlags(filters?: {
    environment?: string;
    enabled?: boolean;
    tags?: string[];
  }): Promise<FeatureFlag[]> {
    const where: any = {};

    if (filters?.environment) {
      where.environment = filters.environment;
    }
    if (filters?.enabled !== undefined) {
      where.enabled = filters.enabled;
    }
    if (filters?.tags && filters.tags.length > 0) {
      where.tags = {
        hasSome: filters.tags,
      };
    }

    const flags = await this.prisma.featureFlag.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    return flags.map(this.mapPrismaFlagToFeatureFlag);
  }

  // Delete a feature flag
  async deleteFeatureFlag(id: string, deletedBy?: string): Promise<void> {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { id },
    });

    if (!flag) {
      throw new Error(`Feature flag with id ${id} not found`);
    }

    // Create audit log before deletion
    await this.createAuditLog(id, 'DELETE', flag, null, deletedBy);

    await this.prisma.featureFlag.delete({
      where: { id },
    });

    // Clear cache
    await this.clearFlagCache(flag.key);

    // Emit event
    this.emit('flagDeleted', flag);
  }

  // Get feature flag analytics
  async getFeatureFlagAnalytics(
    flagKey: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalEvaluations: number;
    enabledCount: number;
    disabledCount: number;
    variantDistribution: Record<string, number>;
    evaluationsByDate: Array<{ date: string; count: number }>;
    userGroups: Record<string, number>;
    regions: Record<string, number>;
  }> {
    const where: any = {
      flagKey,
    };

    if (startDate || endDate) {
      where.evaluatedAt = {};
      if (startDate) where.evaluatedAt.gte = startDate;
      if (endDate) where.evaluatedAt.lte = endDate;
    }

    // Get evaluation statistics
    const evaluations = await this.prisma.featureFlagEvaluation.findMany({
      where,
      select: {
        enabled: true,
        variant: true,
        evaluatedAt: true,
        userGroup: true,
        region: true,
      },
    });

    const totalEvaluations = evaluations.length;
    const enabledCount = evaluations.filter(e => e.enabled).length;
    const disabledCount = totalEvaluations - enabledCount;

    // Variant distribution
    const variantDistribution: Record<string, number> = {};
    evaluations.forEach(e => {
      if (e.variant) {
        variantDistribution[e.variant] = (variantDistribution[e.variant] || 0) + 1;
      }
    });

    // Evaluations by date
    const evaluationsByDate: Record<string, number> = {};
    evaluations.forEach(e => {
      const date = e.evaluatedAt.toISOString().split('T')[0];
      evaluationsByDate[date] = (evaluationsByDate[date] || 0) + 1;
    });

    // User groups and regions
    const userGroups: Record<string, number> = {};
    const regions: Record<string, number> = {};

    evaluations.forEach(e => {
      if (e.userGroup) {
        userGroups[e.userGroup] = (userGroups[e.userGroup] || 0) + 1;
      }
      if (e.region) {
        regions[e.region] = (regions[e.region] || 0) + 1;
      }
    });

    return {
      totalEvaluations,
      enabledCount,
      disabledCount,
      variantDistribution,
      evaluationsByDate: Object.entries(evaluationsByDate).map(([date, count]) => ({
        date,
        count,
      })),
      userGroups,
      regions,
    };
  }

  // Private helper methods

  private async performEvaluation(flag: any, context: FeatureFlagContext): Promise<FeatureFlagEvaluation> {
    // Check if flag is enabled
    if (!flag.enabled) {
      return {
        enabled: false,
        reason: 'FLAG_DISABLED',
      };
    }

    // Check environment match
    if (flag.environment !== context.environment) {
      return {
        enabled: false,
        reason: 'ENVIRONMENT_MISMATCH',
      };
    }

    // Check date range
    const now = new Date();
    if (flag.rolloutStartDate && now < new Date(flag.rolloutStartDate)) {
      return {
        enabled: false,
        reason: 'ROLLOUT_NOT_STARTED',
      };
    }
    if (flag.rolloutEndDate && now > new Date(flag.rolloutEndDate)) {
      return {
        enabled: false,
        reason: 'ROLLOUT_ENDED',
      };
    }

    // Check user group targeting
    if (flag.rolloutUserGroups.length > 0 && context.userGroup) {
      if (!flag.rolloutUserGroups.includes(context.userGroup)) {
        return {
          enabled: false,
          reason: 'USER_GROUP_NOT_TARGETED',
        };
      }
    }

    // Check region targeting
    if (flag.rolloutRegions.length > 0 && context.region) {
      if (!flag.rolloutRegions.includes(context.region)) {
        return {
          enabled: false,
          reason: 'REGION_NOT_TARGETED',
        };
      }
    }

    // Check percentage rollout
    if (flag.rolloutPercentage < 100) {
      const hash = this.hashString(`${flag.key}:${context.userId || context.clientIp || 'anonymous'}`);
      const percentage = (hash % 100) + 1;
      
      if (percentage > flag.rolloutPercentage) {
        return {
          enabled: false,
          reason: 'PERCENTAGE_ROLLOUT',
          metadata: { userPercentage: percentage, targetPercentage: flag.rolloutPercentage },
        };
      }
    }

    // Handle A/B testing variants
    const variants = JSON.parse(flag.variants || '[]') as FeatureFlagVariant[];
    if (variants.length > 0) {
      const selectedVariant = this.selectVariant(variants, context);
      return {
        enabled: true,
        variant: selectedVariant.id,
        reason: 'AB_TEST_VARIANT',
        metadata: { variantConfiguration: selectedVariant.configuration },
      };
    }

    return {
      enabled: true,
      reason: 'ENABLED',
    };
  }

  private selectVariant(variants: FeatureFlagVariant[], context: FeatureFlagContext): FeatureFlagVariant {
    // Normalize weights to ensure they sum to 100
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    const normalizedVariants = variants.map(v => ({
      ...v,
      weight: (v.weight / totalWeight) * 100,
    }));

    // Use consistent hashing for stable variant assignment
    const hash = this.hashString(`variant:${context.userId || context.clientIp || 'anonymous'}`);
    const percentage = (hash % 100) + 1;

    let cumulativeWeight = 0;
    for (const variant of normalizedVariants) {
      cumulativeWeight += variant.weight;
      if (percentage <= cumulativeWeight) {
        return variant;
      }
    }

    // Fallback to first variant
    return normalizedVariants[0];
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private async logEvaluation(flag: any, context: FeatureFlagContext, evaluation: FeatureFlagEvaluation): Promise<void> {
    try {
      await this.prisma.featureFlagEvaluation.create({
        data: {
          flagId: flag.id,
          flagKey: flag.key,
          userId: context.userId,
          userGroup: context.userGroup,
          region: context.region,
          environment: context.environment,
          enabled: evaluation.enabled,
          variant: evaluation.variant,
          reason: evaluation.reason,
          clientIp: context.clientIp,
          userAgent: context.userAgent,
        },
      });
    } catch (error) {
      // Log error but don't fail evaluation
      console.error('Failed to log feature flag evaluation:', error);
    }
  }

  private async createAuditLog(
    flagId: string,
    action: string,
    previousValue: any,
    newValue: any,
    performedBy?: string
  ): Promise<void> {
    await this.prisma.featureFlagAuditLog.create({
      data: {
        flagId,
        action,
        previousValue: previousValue ? JSON.stringify(previousValue) : null,
        newValue: newValue ? JSON.stringify(newValue) : null,
        changes: this.calculateChanges(previousValue, newValue),
        environment: 'production', // TODO: Get from context
        performedBy,
      },
    });
  }

  private calculateChanges(oldValue: any, newValue: any): any {
    if (!oldValue || !newValue) return null;

    const changes: Record<string, any> = {};
    const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);

    for (const key of allKeys) {
      if (oldValue[key] !== newValue[key]) {
        changes[key] = {
          from: oldValue[key],
          to: newValue[key],
        };
      }
    }

    return Object.keys(changes).length > 0 ? changes : null;
  }

  private async clearFlagCache(flagKey: string): Promise<void> {
    await this.redis.del(`${this.cachePrefix}${flagKey}`);
  }

  private async validateFeatureFlag(flag: Omit<FeatureFlag, 'id'>): Promise<Omit<FeatureFlag, 'id'>> {
    // TODO: Add comprehensive validation logic
    return flag;
  }

  private async validateFeatureFlagUpdate(updates: FeatureFlagUpdate): Promise<FeatureFlagUpdate> {
    // TODO: Add comprehensive validation logic
    return updates;
  }

  private mapPrismaFlagToFeatureFlag(prismaFlag: any): FeatureFlag {
    return {
      id: prismaFlag.id,
      name: prismaFlag.name,
      description: prismaFlag.description,
      enabled: prismaFlag.enabled,
      rollout: {
        percentage: prismaFlag.rolloutPercentage,
        userGroups: prismaFlag.rolloutUserGroups,
        regions: prismaFlag.rolloutRegions,
        startDate: prismaFlag.rolloutStartDate,
        endDate: prismaFlag.rolloutEndDate,
      },
      variants: JSON.parse(prismaFlag.variants || '[]'),
      dependencies: prismaFlag.dependencies,
      tags: prismaFlag.tags,
    };
  }
}