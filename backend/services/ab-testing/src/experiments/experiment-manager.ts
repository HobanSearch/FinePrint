// Experiment Manager - Core experiment lifecycle management

import { PrismaClient, Experiment, ExperimentStatus, Variant } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from 'pino';
import { Redis } from 'ioredis';
import { z } from 'zod';
import * as crypto from 'crypto';
import { 
  ExperimentConfig, 
  ExperimentSchedule,
  VariantConfig,
  TrafficAllocation,
  TargetingRule,
  StatisticalConfig,
  MultiArmedBanditConfig
} from '../types';

export class ExperimentManager {
  private prisma: PrismaClient;
  private redis: Redis;
  private logger: Logger;

  constructor(prisma: PrismaClient, redis: Redis, logger: Logger) {
    this.prisma = prisma;
    this.redis = redis;
    this.logger = logger;
  }

  /**
   * Create a new experiment
   */
  async createExperiment(config: ExperimentConfig, createdBy: string): Promise<Experiment> {
    this.logger.info({ config }, 'Creating new experiment');

    // Validate traffic allocation
    this.validateTrafficAllocation(config.trafficAllocation);

    // Validate statistical configuration
    this.validateStatisticalConfig(config.statisticalConfig);

    try {
      // Create experiment with variants in a transaction
      const experiment = await this.prisma.$transaction(async (tx) => {
        // Create the experiment
        const exp = await tx.experiment.create({
          data: {
            name: config.name,
            description: config.description,
            hypothesis: config.hypothesis,
            type: config.type,
            status: ExperimentStatus.DRAFT,
            trafficAllocation: config.trafficAllocation,
            targetingRules: config.targetingRules || null,
            primaryMetric: config.metrics.primaryMetric.name,
            secondaryMetrics: config.metrics.secondaryMetrics?.map(m => m.name) || [],
            successCriteria: {
              metric: config.metrics.primaryMetric.name,
              threshold: config.metrics.primaryMetric.minimumDetectableEffect || 0.05,
              confidence: config.statisticalConfig.confidenceLevel
            },
            statisticalMethod: config.statisticalConfig.method,
            confidenceLevel: config.statisticalConfig.confidenceLevel,
            minimumEffect: config.metrics.primaryMetric.minimumDetectableEffect || 0.05,
            powerAnalysis: await this.calculatePowerAnalysis(config),
            mabAlgorithm: config.mabConfig?.algorithm,
            mabParameters: config.mabConfig?.parameters,
            createdBy,
            startDate: config.schedule?.startDate,
            endDate: config.schedule?.endDate,
            targetSampleSize: await this.calculateSampleSize(config)
          }
        });

        // Create variants
        const variantPromises = config.variants.map(variant => 
          tx.variant.create({
            data: {
              experimentId: exp.id,
              name: variant.name,
              description: variant.description,
              isControl: variant.isControl,
              allocation: variant.allocation,
              modelId: variant.modelId,
              modelVersion: variant.modelVersion,
              modelConfig: variant.modelConfig,
              features: variant.features
            }
          })
        );

        await Promise.all(variantPromises);

        return exp;
      });

      // Cache experiment configuration for fast access
      await this.cacheExperimentConfig(experiment.id, config);

      // Schedule experiment if start date is provided
      if (config.schedule?.startDate) {
        await this.scheduleExperiment(experiment.id, config.schedule);
      }

      this.logger.info({ experimentId: experiment.id }, 'Experiment created successfully');
      return experiment;

    } catch (error) {
      this.logger.error({ error, config }, 'Failed to create experiment');
      throw error;
    }
  }

  /**
   * Start an experiment
   */
  async startExperiment(experimentId: string): Promise<Experiment> {
    this.logger.info({ experimentId }, 'Starting experiment');

    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId },
      include: { variants: true }
    });

    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== ExperimentStatus.DRAFT && experiment.status !== ExperimentStatus.SCHEDULED) {
      throw new Error(`Cannot start experiment in status ${experiment.status}`);
    }

    // Validate experiment readiness
    await this.validateExperimentReadiness(experiment);

    // Update experiment status
    const updatedExperiment = await this.prisma.experiment.update({
      where: { id: experimentId },
      data: {
        status: ExperimentStatus.RUNNING,
        startDate: new Date()
      }
    });

    // Initialize traffic allocation
    await this.initializeTrafficAllocation(experimentId);

    // Start monitoring
    await this.startExperimentMonitoring(experimentId);

    // Emit event for other services
    await this.emitExperimentEvent('experiment.started', {
      experimentId,
      timestamp: new Date()
    });

    this.logger.info({ experimentId }, 'Experiment started successfully');
    return updatedExperiment;
  }

  /**
   * Stop an experiment
   */
  async stopExperiment(
    experimentId: string, 
    reason: string, 
    stoppedBy: string
  ): Promise<Experiment> {
    this.logger.info({ experimentId, reason }, 'Stopping experiment');

    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId }
    });

    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== ExperimentStatus.RUNNING && experiment.status !== ExperimentStatus.PAUSED) {
      throw new Error(`Cannot stop experiment in status ${experiment.status}`);
    }

    // Update experiment status
    const updatedExperiment = await this.prisma.experiment.update({
      where: { id: experimentId },
      data: {
        status: ExperimentStatus.STOPPED,
        endDate: new Date(),
        updatedBy: stoppedBy
      }
    });

    // Stop traffic allocation
    await this.stopTrafficAllocation(experimentId);

    // Create decision record
    await this.prisma.decision.create({
      data: {
        experimentId,
        decisionType: 'MANUAL_OVERRIDE',
        action: 'stop',
        reason,
        isAutomated: false,
        decidedBy: stoppedBy
      }
    });

    // Emit event
    await this.emitExperimentEvent('experiment.stopped', {
      experimentId,
      reason,
      timestamp: new Date()
    });

    this.logger.info({ experimentId }, 'Experiment stopped successfully');
    return updatedExperiment;
  }

  /**
   * Pause an experiment
   */
  async pauseExperiment(experimentId: string, pausedBy: string): Promise<Experiment> {
    this.logger.info({ experimentId }, 'Pausing experiment');

    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId }
    });

    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== ExperimentStatus.RUNNING) {
      throw new Error(`Cannot pause experiment in status ${experiment.status}`);
    }

    const updatedExperiment = await this.prisma.experiment.update({
      where: { id: experimentId },
      data: {
        status: ExperimentStatus.PAUSED,
        updatedBy: pausedBy
      }
    });

    // Pause traffic allocation
    await this.pauseTrafficAllocation(experimentId);

    // Emit event
    await this.emitExperimentEvent('experiment.paused', {
      experimentId,
      timestamp: new Date()
    });

    return updatedExperiment;
  }

  /**
   * Resume a paused experiment
   */
  async resumeExperiment(experimentId: string, resumedBy: string): Promise<Experiment> {
    this.logger.info({ experimentId }, 'Resuming experiment');

    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId }
    });

    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== ExperimentStatus.PAUSED) {
      throw new Error(`Cannot resume experiment in status ${experiment.status}`);
    }

    const updatedExperiment = await this.prisma.experiment.update({
      where: { id: experimentId },
      data: {
        status: ExperimentStatus.RUNNING,
        updatedBy: resumedBy
      }
    });

    // Resume traffic allocation
    await this.resumeTrafficAllocation(experimentId);

    // Emit event
    await this.emitExperimentEvent('experiment.resumed', {
      experimentId,
      timestamp: new Date()
    });

    return updatedExperiment;
  }

  /**
   * Get experiment by ID with full details
   */
  async getExperiment(experimentId: string): Promise<any> {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId },
      include: {
        variants: true,
        _count: {
          select: {
            assignments: true,
            metrics: true,
            analyses: true,
            decisions: true,
            reports: true
          }
        }
      }
    });

    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    // Get real-time metrics from Redis
    const realtimeMetrics = await this.getRealtimeMetrics(experimentId);

    return {
      ...experiment,
      realtimeMetrics
    };
  }

  /**
   * List experiments with filtering and pagination
   */
  async listExperiments(
    filters?: {
      status?: ExperimentStatus;
      type?: string;
      createdBy?: string;
      startDate?: Date;
      endDate?: Date;
    },
    pagination?: {
      page: number;
      limit: number;
    }
  ): Promise<{ experiments: Experiment[]; total: number }> {
    const where: any = {};

    if (filters) {
      if (filters.status) where.status = filters.status;
      if (filters.type) where.type = filters.type;
      if (filters.createdBy) where.createdBy = filters.createdBy;
      if (filters.startDate) where.startDate = { gte: filters.startDate };
      if (filters.endDate) where.endDate = { lte: filters.endDate };
    }

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;
    const skip = (page - 1) * limit;

    const [experiments, total] = await Promise.all([
      this.prisma.experiment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          variants: true,
          _count: {
            select: {
              assignments: true,
              metrics: true
            }
          }
        }
      }),
      this.prisma.experiment.count({ where })
    ]);

    return { experiments, total };
  }

  /**
   * Update experiment configuration
   */
  async updateExperiment(
    experimentId: string,
    updates: Partial<ExperimentConfig>,
    updatedBy: string
  ): Promise<Experiment> {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId }
    });

    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status === ExperimentStatus.RUNNING) {
      // Only allow certain updates while running
      const allowedRunningUpdates = ['description', 'endDate', 'targetingRules'];
      const updateKeys = Object.keys(updates);
      const hasDisallowedUpdates = updateKeys.some(key => !allowedRunningUpdates.includes(key));
      
      if (hasDisallowedUpdates) {
        throw new Error('Cannot update critical configuration while experiment is running');
      }
    }

    const updatedExperiment = await this.prisma.experiment.update({
      where: { id: experimentId },
      data: {
        ...updates,
        updatedBy,
        updatedAt: new Date()
      }
    });

    // Update cache
    await this.updateCachedExperimentConfig(experimentId, updates);

    return updatedExperiment;
  }

  /**
   * Archive completed experiment
   */
  async archiveExperiment(experimentId: string): Promise<void> {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId }
    });

    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== ExperimentStatus.COMPLETED && experiment.status !== ExperimentStatus.STOPPED) {
      throw new Error(`Cannot archive experiment in status ${experiment.status}`);
    }

    await this.prisma.experiment.update({
      where: { id: experimentId },
      data: { status: ExperimentStatus.ARCHIVED }
    });

    // Clean up cache
    await this.cleanupExperimentCache(experimentId);
  }

  // Private helper methods

  private validateTrafficAllocation(allocation: TrafficAllocation): void {
    const total = Object.values(allocation).reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 1.0) > 0.001) {
      throw new Error(`Traffic allocation must sum to 1.0, got ${total}`);
    }
  }

  private validateStatisticalConfig(config: StatisticalConfig): void {
    if (config.confidenceLevel < 0.8 || config.confidenceLevel > 0.99) {
      throw new Error('Confidence level must be between 0.8 and 0.99');
    }
    if (config.power && (config.power < 0.5 || config.power > 0.99)) {
      throw new Error('Statistical power must be between 0.5 and 0.99');
    }
  }

  private async calculatePowerAnalysis(config: ExperimentConfig): Promise<any> {
    // Implement power analysis calculation
    const alpha = 1 - config.statisticalConfig.confidenceLevel;
    const power = config.statisticalConfig.power || 0.8;
    const mde = config.metrics.primaryMetric.minimumDetectableEffect || 0.05;
    
    // Simplified sample size calculation for proportions
    const z_alpha = 1.96; // For 95% confidence
    const z_beta = 0.84; // For 80% power
    const p = 0.5; // Baseline conversion rate assumption
    
    const sampleSize = Math.ceil(
      2 * Math.pow(z_alpha + z_beta, 2) * p * (1 - p) / Math.pow(mde, 2)
    );

    return {
      requiredSampleSize: sampleSize,
      power,
      alpha,
      minimumDetectableEffect: mde
    };
  }

  private async calculateSampleSize(config: ExperimentConfig): Promise<number> {
    const powerAnalysis = await this.calculatePowerAnalysis(config);
    return powerAnalysis.requiredSampleSize * config.variants.length;
  }

  private async validateExperimentReadiness(experiment: any): Promise<void> {
    // Check if experiment has at least 2 variants
    if (!experiment.variants || experiment.variants.length < 2) {
      throw new Error('Experiment must have at least 2 variants');
    }

    // Check if one variant is marked as control
    const hasControl = experiment.variants.some((v: Variant) => v.isControl);
    if (!hasControl) {
      throw new Error('Experiment must have a control variant');
    }

    // Validate traffic allocation
    const totalAllocation = experiment.variants.reduce(
      (sum: number, v: Variant) => sum + v.allocation, 
      0
    );
    if (Math.abs(totalAllocation - 1.0) > 0.001) {
      throw new Error('Variant allocations must sum to 1.0');
    }
  }

  private async cacheExperimentConfig(experimentId: string, config: ExperimentConfig): Promise<void> {
    const key = `experiment:${experimentId}:config`;
    await this.redis.set(key, JSON.stringify(config), 'EX', 86400); // 24 hours
  }

  private async updateCachedExperimentConfig(experimentId: string, updates: any): Promise<void> {
    const key = `experiment:${experimentId}:config`;
    const existing = await this.redis.get(key);
    if (existing) {
      const config = JSON.parse(existing);
      const updated = { ...config, ...updates };
      await this.redis.set(key, JSON.stringify(updated), 'EX', 86400);
    }
  }

  private async cleanupExperimentCache(experimentId: string): Promise<void> {
    const keys = await this.redis.keys(`experiment:${experimentId}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  private async initializeTrafficAllocation(experimentId: string): Promise<void> {
    const key = `experiment:${experimentId}:allocation:active`;
    await this.redis.set(key, '1', 'EX', 86400 * 30); // 30 days
  }

  private async stopTrafficAllocation(experimentId: string): Promise<void> {
    const key = `experiment:${experimentId}:allocation:active`;
    await this.redis.del(key);
  }

  private async pauseTrafficAllocation(experimentId: string): Promise<void> {
    const key = `experiment:${experimentId}:allocation:active`;
    await this.redis.set(key, '0', 'EX', 86400 * 30);
  }

  private async resumeTrafficAllocation(experimentId: string): Promise<void> {
    const key = `experiment:${experimentId}:allocation:active`;
    await this.redis.set(key, '1', 'EX', 86400 * 30);
  }

  private async getRealtimeMetrics(experimentId: string): Promise<any> {
    const metricsKey = `experiment:${experimentId}:metrics:realtime`;
    const metrics = await this.redis.get(metricsKey);
    return metrics ? JSON.parse(metrics) : null;
  }

  private async scheduleExperiment(experimentId: string, schedule: ExperimentSchedule): Promise<void> {
    // Implementation for scheduling experiments
    this.logger.info({ experimentId, schedule }, 'Scheduling experiment');
    // This would integrate with a job scheduler like BullMQ
  }

  private async startExperimentMonitoring(experimentId: string): Promise<void> {
    // Start monitoring for the experiment
    this.logger.info({ experimentId }, 'Starting experiment monitoring');
    // This would set up monitoring dashboards and alerts
  }

  private async emitExperimentEvent(event: string, data: any): Promise<void> {
    // Emit event to event bus for other services
    const eventKey = `events:experiments:${event}`;
    await this.redis.publish(eventKey, JSON.stringify(data));
  }
}