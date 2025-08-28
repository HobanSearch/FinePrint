// Traffic Allocator - Handles user assignment to experiment variants

import { PrismaClient, UserAssignment, Variant } from '@prisma/client';
import { Redis } from 'ioredis';
import { Logger } from 'pino';
import * as crypto from 'crypto';
import murmurhash from 'murmurhash3js';
import { 
  UserContext, 
  AssignmentDecision, 
  TargetingRule,
  TrafficAllocation 
} from '../types';

export class TrafficAllocator {
  private prisma: PrismaClient;
  private redis: Redis;
  private logger: Logger;
  private assignmentCache: Map<string, AssignmentDecision>;

  constructor(prisma: PrismaClient, redis: Redis, logger: Logger) {
    this.prisma = prisma;
    this.redis = redis;
    this.logger = logger;
    this.assignmentCache = new Map();
  }

  /**
   * Assign a user to an experiment variant
   */
  async assignUser(
    experimentId: string,
    userContext: UserContext
  ): Promise<AssignmentDecision> {
    this.logger.debug({ experimentId, userId: userContext.userId }, 'Assigning user to experiment');

    try {
      // Check if experiment is active
      const experiment = await this.getActiveExperiment(experimentId);
      if (!experiment) {
        throw new Error(`Experiment ${experimentId} is not active`);
      }

      // Check targeting rules
      if (experiment.targetingRules) {
        const isEligible = await this.evaluateTargeting(
          userContext,
          experiment.targetingRules as TargetingRule[]
        );
        if (!isEligible) {
          return this.createExclusionDecision(experimentId, 'targeting_rules_not_met');
        }
      }

      // Check for existing assignment (sticky assignment)
      const existingAssignment = await this.getExistingAssignment(
        experimentId,
        userContext.userId
      );
      if (existingAssignment) {
        return this.createStickyDecision(existingAssignment);
      }

      // Check for forced assignment (for testing)
      const forcedVariant = await this.checkForcedAssignment(
        experimentId,
        userContext.userId
      );
      if (forcedVariant) {
        return await this.createForcedAssignment(
          experimentId,
          userContext,
          forcedVariant
        );
      }

      // Determine variant based on hash-based allocation
      const variant = await this.determineVariant(
        experiment,
        userContext
      );

      // Create new assignment
      const assignment = await this.createAssignment(
        experimentId,
        userContext,
        variant
      );

      return this.createNewAssignmentDecision(assignment, variant);

    } catch (error) {
      this.logger.error({ error, experimentId, userId: userContext.userId }, 'Failed to assign user');
      throw error;
    }
  }

  /**
   * Batch assign multiple users (for performance)
   */
  async batchAssignUsers(
    experimentId: string,
    userContexts: UserContext[]
  ): Promise<AssignmentDecision[]> {
    this.logger.info({ experimentId, count: userContexts.length }, 'Batch assigning users');

    const experiment = await this.getActiveExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} is not active`);
    }

    const assignments = await Promise.all(
      userContexts.map(context => this.assignUser(experimentId, context))
    );

    return assignments;
  }

  /**
   * Get user's current assignment for an experiment
   */
  async getUserAssignment(
    experimentId: string,
    userId: string
  ): Promise<AssignmentDecision | null> {
    const assignment = await this.prisma.userAssignment.findUnique({
      where: {
        userId_experimentId: {
          userId,
          experimentId
        }
      },
      include: {
        variant: true
      }
    });

    if (!assignment) {
      return null;
    }

    return {
      experimentId,
      variantId: assignment.variantId,
      variantName: assignment.variant.name,
      assignmentHash: assignment.assignmentHash,
      isNewAssignment: false,
      reason: 'sticky'
    };
  }

  /**
   * Override user assignment (for testing/debugging)
   */
  async overrideAssignment(
    experimentId: string,
    userId: string,
    variantName: string,
    overriddenBy: string
  ): Promise<AssignmentDecision> {
    this.logger.info(
      { experimentId, userId, variantName, overriddenBy },
      'Overriding user assignment'
    );

    const variant = await this.prisma.variant.findFirst({
      where: {
        experimentId,
        name: variantName
      }
    });

    if (!variant) {
      throw new Error(`Variant ${variantName} not found in experiment ${experimentId}`);
    }

    // Delete existing assignment if exists
    await this.prisma.userAssignment.deleteMany({
      where: {
        userId,
        experimentId
      }
    });

    // Create new assignment
    const assignment = await this.prisma.userAssignment.create({
      data: {
        userId,
        experimentId,
        variantId: variant.id,
        assignmentHash: this.generateAssignmentHash(userId, experimentId),
        userAttributes: { overriddenBy, overriddenAt: new Date() }
      }
    });

    // Set forced assignment in cache
    await this.setForcedAssignment(experimentId, userId, variant.id);

    return {
      experimentId,
      variantId: variant.id,
      variantName: variant.name,
      assignmentHash: assignment.assignmentHash,
      isNewAssignment: true,
      reason: 'forced'
    };
  }

  /**
   * Remove user from experiment
   */
  async removeUserFromExperiment(
    experimentId: string,
    userId: string
  ): Promise<void> {
    await this.prisma.userAssignment.deleteMany({
      where: {
        userId,
        experimentId
      }
    });

    // Clear cache
    await this.clearUserAssignmentCache(experimentId, userId);
  }

  /**
   * Get experiment assignment statistics
   */
  async getAssignmentStats(experimentId: string): Promise<any> {
    const stats = await this.prisma.variant.findMany({
      where: { experimentId },
      select: {
        id: true,
        name: true,
        allocation: true,
        _count: {
          select: {
            assignments: true
          }
        }
      }
    });

    const totalAssignments = stats.reduce(
      (sum, variant) => sum + variant._count.assignments,
      0
    );

    return {
      experimentId,
      totalAssignments,
      variants: stats.map(variant => ({
        variantId: variant.id,
        variantName: variant.name,
        targetAllocation: variant.allocation,
        actualAllocation: totalAssignments > 0 
          ? variant._count.assignments / totalAssignments 
          : 0,
        assignmentCount: variant._count.assignments,
        sampleRatio: totalAssignments > 0
          ? (variant._count.assignments / totalAssignments) / variant.allocation
          : 0
      }))
    };
  }

  /**
   * Check for sample ratio mismatch (SRM)
   */
  async checkSampleRatioMismatch(experimentId: string): Promise<boolean> {
    const stats = await this.getAssignmentStats(experimentId);
    
    // Chi-square test for SRM
    let chiSquare = 0;
    for (const variant of stats.variants) {
      if (variant.targetAllocation > 0) {
        const expected = stats.totalAssignments * variant.targetAllocation;
        const observed = variant.assignmentCount;
        chiSquare += Math.pow(observed - expected, 2) / expected;
      }
    }

    // Critical value for p=0.001 with df = variants.length - 1
    const criticalValue = 10.828; // For 2 variants (df=1)
    
    return chiSquare > criticalValue;
  }

  // Private helper methods

  private async getActiveExperiment(experimentId: string): Promise<any> {
    // Check cache first
    const cacheKey = `experiment:${experimentId}:active`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // Get from database
    const experiment = await this.prisma.experiment.findFirst({
      where: {
        id: experimentId,
        status: 'RUNNING'
      },
      include: {
        variants: true
      }
    });

    if (experiment) {
      // Cache for 5 minutes
      await this.redis.set(cacheKey, JSON.stringify(experiment), 'EX', 300);
    }

    return experiment;
  }

  private async evaluateTargeting(
    userContext: UserContext,
    rules: TargetingRule[]
  ): Promise<boolean> {
    for (const rule of rules) {
      const value = this.getAttributeValue(userContext, rule.attribute);
      const isMatch = this.evaluateRule(value, rule.operator, rule.value);
      
      if (!isMatch && rule.combinator !== 'OR') {
        return false;
      }
      if (isMatch && rule.combinator === 'OR') {
        return true;
      }
    }
    return true;
  }

  private getAttributeValue(userContext: UserContext, attribute: string): any {
    const path = attribute.split('.');
    let value: any = userContext;
    
    for (const key of path) {
      value = value?.[key];
      if (value === undefined) break;
    }
    
    return value;
  }

  private evaluateRule(value: any, operator: string, targetValue: any): boolean {
    switch (operator) {
      case 'equals':
        return value === targetValue;
      case 'not_equals':
        return value !== targetValue;
      case 'contains':
        return String(value).includes(String(targetValue));
      case 'greater_than':
        return Number(value) > Number(targetValue);
      case 'less_than':
        return Number(value) < Number(targetValue);
      case 'in':
        return Array.isArray(targetValue) && targetValue.includes(value);
      case 'not_in':
        return Array.isArray(targetValue) && !targetValue.includes(value);
      default:
        return false;
    }
  }

  private async getExistingAssignment(
    experimentId: string,
    userId: string
  ): Promise<UserAssignment | null> {
    // Check cache first
    const cacheKey = `assignment:${experimentId}:${userId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // Get from database
    const assignment = await this.prisma.userAssignment.findUnique({
      where: {
        userId_experimentId: {
          userId,
          experimentId
        }
      },
      include: {
        variant: true
      }
    });

    if (assignment) {
      // Cache for 1 hour
      await this.redis.set(cacheKey, JSON.stringify(assignment), 'EX', 3600);
    }

    return assignment;
  }

  private async checkForcedAssignment(
    experimentId: string,
    userId: string
  ): Promise<string | null> {
    const key = `forced:${experimentId}:${userId}`;
    return await this.redis.get(key);
  }

  private async setForcedAssignment(
    experimentId: string,
    userId: string,
    variantId: string
  ): Promise<void> {
    const key = `forced:${experimentId}:${userId}`;
    await this.redis.set(key, variantId, 'EX', 86400); // 24 hours
  }

  private async determineVariant(
    experiment: any,
    userContext: UserContext
  ): Promise<Variant> {
    const hash = this.generateAssignmentHash(userContext.userId, experiment.id);
    const hashValue = this.hashToFloat(hash);
    
    // Determine variant based on traffic allocation
    const variants = experiment.variants.sort((a: Variant, b: Variant) => 
      a.name.localeCompare(b.name)
    );
    
    let cumulativeAllocation = 0;
    for (const variant of variants) {
      cumulativeAllocation += variant.allocation;
      if (hashValue <= cumulativeAllocation) {
        return variant;
      }
    }

    // Fallback to control (should not happen)
    return variants.find((v: Variant) => v.isControl) || variants[0];
  }

  private generateAssignmentHash(userId: string, experimentId: string): string {
    const salt = 'fineprint-ab-testing';
    const input = `${salt}:${experimentId}:${userId}`;
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  private hashToFloat(hash: string): number {
    // Convert first 8 characters of hash to a float between 0 and 1
    const hashInt = parseInt(hash.substring(0, 8), 16);
    return hashInt / 0xffffffff;
  }

  private async createAssignment(
    experimentId: string,
    userContext: UserContext,
    variant: Variant
  ): Promise<UserAssignment> {
    const assignment = await this.prisma.userAssignment.create({
      data: {
        userId: userContext.userId,
        experimentId,
        variantId: variant.id,
        assignmentHash: this.generateAssignmentHash(userContext.userId, experimentId),
        userSegment: userContext.attributes?.segment,
        userAttributes: userContext.attributes
      },
      include: {
        variant: true
      }
    });

    // Update variant user count
    await this.prisma.variant.update({
      where: { id: variant.id },
      data: { currentUsers: { increment: 1 } }
    });

    // Update experiment sample size
    await this.prisma.experiment.update({
      where: { id: experimentId },
      data: { currentSampleSize: { increment: 1 } }
    });

    // Cache assignment
    const cacheKey = `assignment:${experimentId}:${userContext.userId}`;
    await this.redis.set(cacheKey, JSON.stringify(assignment), 'EX', 3600);

    return assignment;
  }

  private async createForcedAssignment(
    experimentId: string,
    userContext: UserContext,
    variantId: string
  ): Promise<AssignmentDecision> {
    const variant = await this.prisma.variant.findUnique({
      where: { id: variantId }
    });

    if (!variant) {
      throw new Error(`Variant ${variantId} not found`);
    }

    const assignment = await this.createAssignment(
      experimentId,
      userContext,
      variant
    );

    return this.createNewAssignmentDecision(assignment, variant);
  }

  private createExclusionDecision(
    experimentId: string,
    reason: string
  ): AssignmentDecision {
    return {
      experimentId,
      variantId: '',
      variantName: '',
      assignmentHash: '',
      isNewAssignment: false,
      reason: 'excluded'
    };
  }

  private createStickyDecision(assignment: any): AssignmentDecision {
    return {
      experimentId: assignment.experimentId,
      variantId: assignment.variantId,
      variantName: assignment.variant.name,
      assignmentHash: assignment.assignmentHash,
      isNewAssignment: false,
      reason: 'sticky'
    };
  }

  private createNewAssignmentDecision(
    assignment: UserAssignment,
    variant: Variant
  ): AssignmentDecision {
    return {
      experimentId: assignment.experimentId,
      variantId: assignment.variantId,
      variantName: variant.name,
      assignmentHash: assignment.assignmentHash,
      isNewAssignment: true,
      reason: 'new'
    };
  }

  private async clearUserAssignmentCache(
    experimentId: string,
    userId: string
  ): Promise<void> {
    const cacheKey = `assignment:${experimentId}:${userId}`;
    await this.redis.del(cacheKey);
  }
}