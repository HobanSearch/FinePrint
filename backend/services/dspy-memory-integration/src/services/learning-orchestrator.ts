/**
 * Learning Orchestrator - Core service that coordinates all learning activities
 * Manages the feedback loop between business outcomes and DSPy optimization
 */

import { EventEmitter } from 'events';
import { Queue, Worker, Job } from 'bullmq';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { 
  BusinessOutcome, 
  BusinessDomain, 
  LearningPattern, 
  OptimizationJob,
  OptimizationType,
  OptimizationStatus,
  LearningSystemMetrics,
  TrainingExample
} from '../types/learning';
import { IntegrationManager } from './integration-manager';
import { PatternRecognitionEngine } from './pattern-recognition-engine';
import { BusinessOutcomeLearner } from './business-outcome-learner';
import { TrainingDataGenerator } from './training-data-generator';
import { OptimizationScheduler } from './optimization-scheduler';
import { PerformanceMonitor } from './performance-monitor';
import { CrossDomainLearningEngine } from './cross-domain-learning-engine';
import Redis from 'ioredis';

export interface LearningOrchestratorConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  learning: {
    continuousLearningEnabled: boolean;
    batchLearningInterval: string; // cron expression
    emergencyOptimizationThreshold: number;
    maxConcurrentJobs: number;
    defaultLearningRate: number;
    safetyThreshold: number;
  };
  integrations: {
    dspyServiceUrl: string;
    memoryServiceUrl: string;
    businessIntelligenceUrl: string;
  };
  optimization: {
    defaultMaxIterations: number;
    convergenceThreshold: number;
    explorationRate: number;
    rollbackThreshold: number;
  };
}

export class LearningOrchestrator extends EventEmitter {
  private logger = createServiceLogger('learning-orchestrator');
  private redis: Redis;
  private config: LearningOrchestratorConfig;
  
  // Core components
  private integrationManager: IntegrationManager;
  private patternEngine: PatternRecognitionEngine;
  private outcomeLearner: BusinessOutcomeLearner;
  private trainingGenerator: TrainingDataGenerator;
  private optimizationScheduler: OptimizationScheduler;
  private performanceMonitor: PerformanceMonitor;
  private crossDomainEngine: CrossDomainLearningEngine;

  // Job queues
  private learningQueue: Queue;
  private optimizationQueue: Queue;
  private patternQueue: Queue;

  // Workers
  private learningWorker: Worker;
  private optimizationWorker: Worker;
  private patternWorker: Worker;

  private isInitialized = false;
  private shutdownInProgress = false;

  constructor(config: LearningOrchestratorConfig) {
    super();
    this.config = config;
    this.redis = new Redis(config.redis);
    
    // Initialize components
    this.integrationManager = new IntegrationManager(config.integrations);
    this.patternEngine = new PatternRecognitionEngine();
    this.outcomeLearner = new BusinessOutcomeLearner();
    this.trainingGenerator = new TrainingDataGenerator();
    this.optimizationScheduler = new OptimizationScheduler();
    this.performanceMonitor = new PerformanceMonitor();
    this.crossDomainEngine = new CrossDomainLearningEngine();

    // Initialize queues
    this.initializeQueues();
  }

  private initializeQueues(): void {
    const queueOptions = {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: 'exponential',
      },
    };

    this.learningQueue = new Queue('learning-jobs', queueOptions);
    this.optimizationQueue = new Queue('optimization-jobs', queueOptions);
    this.patternQueue = new Queue('pattern-jobs', queueOptions);

    // Initialize workers
    this.initializeWorkers();
  }

  private initializeWorkers(): void {
    const workerOptions = {
      connection: this.redis,
      concurrency: this.config.learning.maxConcurrentJobs,
    };

    // Learning worker - processes business outcomes
    this.learningWorker = new Worker('learning-jobs', async (job: Job) => {
      return await this.processLearningJob(job);
    }, workerOptions);

    // Optimization worker - handles DSPy optimization jobs
    this.optimizationWorker = new Worker('optimization-jobs', async (job: Job) => {
      return await this.processOptimizationJob(job);
    }, workerOptions);

    // Pattern worker - handles pattern recognition and analysis
    this.patternWorker = new Worker('pattern-jobs', async (job: Job) => {
      return await this.processPatternJob(job);
    }, workerOptions);

    // Set up worker event handlers
    this.setupWorkerEvents();
  }

  private setupWorkerEvents(): void {
    // Learning worker events
    this.learningWorker.on('completed', (job) => {
      this.logger.info('Learning job completed', { jobId: job.id, data: job.returnvalue });
      this.emit('learningJobCompleted', { jobId: job.id, result: job.returnvalue });
    });

    this.learningWorker.on('failed', (job, err) => {
      this.logger.error('Learning job failed', { jobId: job?.id, error: err.message });
      this.emit('learningJobFailed', { jobId: job?.id, error: err.message });
    });

    // Optimization worker events
    this.optimizationWorker.on('completed', (job) => {
      this.logger.info('Optimization job completed', { jobId: job.id });
      this.emit('optimizationJobCompleted', { jobId: job.id, result: job.returnvalue });
    });

    this.optimizationWorker.on('failed', (job, err) => {
      this.logger.error('Optimization job failed', { jobId: job?.id, error: err.message });
      this.emit('optimizationJobFailed', { jobId: job?.id, error: err.message });
    });

    // Pattern worker events
    this.patternWorker.on('completed', (job) => {
      this.logger.info('Pattern job completed', { jobId: job.id });
      this.emit('patternJobCompleted', { jobId: job.id, result: job.returnvalue });
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('Initializing Learning Orchestrator...');

      // Initialize all components
      await this.integrationManager.initialize();
      await this.patternEngine.initialize();
      await this.outcomeLearner.initialize();
      await this.trainingGenerator.initialize();
      await this.optimizationScheduler.initialize();
      await this.performanceMonitor.initialize();
      await this.crossDomainEngine.initialize();

      // Start continuous learning if enabled
      if (this.config.learning.continuousLearningEnabled) {
        this.startContinuousLearning();
      }

      // Start performance monitoring
      this.performanceMonitor.startMonitoring();

      this.isInitialized = true;
      this.logger.info('Learning Orchestrator initialized successfully');
      
      this.emit('initialized');

    } catch (error) {
      this.logger.error('Failed to initialize Learning Orchestrator', { error });
      throw error;
    }
  }

  private startContinuousLearning(): void {
    this.logger.info('Starting continuous learning process');
    
    // Set up interval for processing new business outcomes
    setInterval(async () => {
      if (!this.shutdownInProgress) {
        await this.processPendingOutcomes();
      }
    }, 60000); // Process every minute

    // Set up interval for pattern discovery
    setInterval(async () => {
      if (!this.shutdownInProgress) {
        await this.triggerPatternDiscovery();
      }
    }, 300000); // Every 5 minutes

    // Set up interval for cross-domain learning
    setInterval(async () => {
      if (!this.shutdownInProgress) {
        await this.runCrossDomainAnalysis();
      }
    }, 900000); // Every 15 minutes
  }

  /**
   * Record a business outcome and trigger learning
   */
  async recordBusinessOutcome(outcome: Omit<BusinessOutcome, 'id' | 'timestamp'>): Promise<BusinessOutcome> {
    try {
      const completeOutcome: BusinessOutcome = {
        ...outcome,
        id: `outcome_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
      };

      // Store the outcome in memory service
      await this.integrationManager.storeOutcome(completeOutcome);

      // Trigger immediate learning if outcome is significant
      if (this.isSignificantOutcome(completeOutcome)) {
        await this.triggerImmediateLearning(completeOutcome);
      }

      // Add to learning queue for batch processing
      await this.learningQueue.add('process-outcome', {
        outcomeId: completeOutcome.id,
        domain: completeOutcome.domain,
        priority: completeOutcome.success ? 'normal' : 'high',
      });

      this.logger.info('Business outcome recorded', {
        outcomeId: completeOutcome.id,
        domain: completeOutcome.domain,
        success: completeOutcome.success,
      });

      this.emit('outcomeRecorded', completeOutcome);
      return completeOutcome;

    } catch (error) {
      this.logger.error('Failed to record business outcome', { error, outcome });
      throw error;
    }
  }

  private isSignificantOutcome(outcome: BusinessOutcome): boolean {
    // Determine if an outcome requires immediate attention
    const isHighValue = outcome.metrics.revenue?.amount && outcome.metrics.revenue.amount > 10000;
    const isLowPerformance = outcome.metrics.performance?.accuracy && outcome.metrics.performance.accuracy < 0.5;
    const isCustomerIssue = outcome.metrics.satisfaction?.score && outcome.metrics.satisfaction.score < 3;
    
    return !outcome.success || isHighValue || isLowPerformance || isCustomerIssue;
  }

  private async triggerImmediateLearning(outcome: BusinessOutcome): Promise<void> {
    try {
      // Add high-priority job to optimization queue
      await this.optimizationQueue.add('emergency-optimization', {
        domain: outcome.domain,
        trigger: 'significant_outcome',
        outcomeId: outcome.id,
        urgency: 'high',
      }, {
        priority: 10, // High priority
        delay: 0, // Process immediately
      });

      this.logger.info('Triggered immediate learning', {
        outcomeId: outcome.id,
        domain: outcome.domain,
      });

    } catch (error) {
      this.logger.error('Failed to trigger immediate learning', { error, outcomeId: outcome.id });
    }
  }

  /**
   * Create a new optimization job
   */
  async createOptimizationJob(
    domain: BusinessDomain,
    type: OptimizationType,
    parameters: any
  ): Promise<OptimizationJob> {
    try {
      const job: OptimizationJob = {
        id: `opt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        domain,
        type,
        status: OptimizationStatus.QUEUED,
        parameters,
        startTime: new Date(),
        estimatedDuration: this.estimateOptimizationDuration(type, parameters),
        priority: this.calculateJobPriority(type, domain),
        createdBy: 'learning-orchestrator',
      };

      // Store job in memory service
      await this.integrationManager.storeOptimizationJob(job);

      // Add to optimization queue
      await this.optimizationQueue.add('run-optimization', {
        jobId: job.id,
        domain,
        type,
        parameters,
      }, {
        priority: job.priority,
      });

      this.logger.info('Optimization job created', {
        jobId: job.id,
        domain,
        type,
      });

      this.emit('optimizationJobCreated', job);
      return job;

    } catch (error) {
      this.logger.error('Failed to create optimization job', { error, domain, type });
      throw error;
    }
  }

  private estimateOptimizationDuration(type: OptimizationType, parameters: any): number {
    // Estimate duration in minutes based on job type and parameters
    const baseDurations = {
      [OptimizationType.CONTINUOUS_LEARNING]: 30,
      [OptimizationType.AB_TEST_OPTIMIZATION]: 60,
      [OptimizationType.BATCH_IMPROVEMENT]: 120,
      [OptimizationType.EMERGENCY_CORRECTION]: 15,
      [OptimizationType.SEASONAL_ADAPTATION]: 90,
    };

    const baseDuration = baseDurations[type] || 60;
    const complexityMultiplier = parameters.maxIterations ? Math.log(parameters.maxIterations) : 1;
    
    return Math.round(baseDuration * complexityMultiplier);
  }

  private calculateJobPriority(type: OptimizationType, domain: BusinessDomain): number {
    const typePriorities = {
      [OptimizationType.EMERGENCY_CORRECTION]: 10,
      [OptimizationType.CONTINUOUS_LEARNING]: 5,
      [OptimizationType.AB_TEST_OPTIMIZATION]: 3,
      [OptimizationType.BATCH_IMPROVEMENT]: 2,
      [OptimizationType.SEASONAL_ADAPTATION]: 1,
    };

    // Higher priority for revenue-critical domains
    const domainModifiers = {
      [BusinessDomain.LEGAL_ANALYSIS]: 1.2,
      [BusinessDomain.SALES_COMMUNICATION]: 1.1,
      [BusinessDomain.CUSTOMER_SUPPORT]: 1.1,
      [BusinessDomain.PRICING_OPTIMIZATION]: 1.3,
    };

    const basePriority = typePriorities[type] || 1;
    const modifier = domainModifiers[domain] || 1;
    
    return Math.round(basePriority * modifier);
  }

  private async processLearningJob(job: Job): Promise<any> {
    const { outcomeId, domain } = job.data;
    
    try {
      this.logger.info('Processing learning job', { jobId: job.id, outcomeId, domain });

      // Retrieve the outcome from memory service
      const outcome = await this.integrationManager.getOutcome(outcomeId);
      if (!outcome) {
        throw new Error(`Outcome not found: ${outcomeId}`);
      }

      // Process outcome with business outcome learner
      const learningResult = await this.outcomeLearner.processOutcome(outcome);

      // Update performance metrics
      await this.performanceMonitor.recordLearningResult(learningResult);

      // Check if patterns need to be updated
      if (learningResult.patternsAffected.length > 0) {
        await this.patternQueue.add('update-patterns', {
          patterns: learningResult.patternsAffected,
          outcomeId,
        });
      }

      return {
        processed: true,
        outcomeId,
        patternsAffected: learningResult.patternsAffected,
        improvementDetected: learningResult.improvementDetected,
      };

    } catch (error) {
      this.logger.error('Failed to process learning job', { 
        jobId: job.id, 
        error: error.message,
        outcomeId,
      });
      throw error;
    }
  }

  private async processOptimizationJob(job: Job): Promise<any> {
    const { jobId, domain, type, parameters } = job.data;
    
    try {
      this.logger.info('Processing optimization job', { jobId, domain, type });

      // Update job status
      await this.integrationManager.updateOptimizationJobStatus(jobId, OptimizationStatus.RUNNING);

      // Generate training data
      const trainingData = await this.trainingGenerator.generateForDomain(domain, {
        quality: 'high',
        source: 'mixed',
        count: parameters.trainingDataSize || 1000,
      });

      // Run DSPy optimization
      const optimizationResult = await this.integrationManager.runDSPyOptimization({
        domain,
        trainingData: trainingData.examples,
        parameters,
      });

      // Validate results
      const validationResult = await this.validateOptimizationResult(optimizationResult, domain);

      // Deploy if validation passes
      if (validationResult.safe) {
        await this.deployOptimizationResult(optimizationResult, domain);
        await this.integrationManager.updateOptimizationJobStatus(jobId, OptimizationStatus.COMPLETED);
      } else {
        this.logger.warn('Optimization result failed validation', { jobId, validationResult });
        await this.integrationManager.updateOptimizationJobStatus(jobId, OptimizationStatus.FAILED);
      }

      return {
        success: validationResult.safe,
        improvements: optimizationResult.improvements,
        deployed: validationResult.safe,
        validationDetails: validationResult,
      };

    } catch (error) {
      this.logger.error('Failed to process optimization job', { 
        jobId, 
        error: error.message,
      });
      
      await this.integrationManager.updateOptimizationJobStatus(jobId, OptimizationStatus.FAILED);
      throw error;
    }
  }

  private async processPatternJob(job: Job): Promise<any> {
    const { patterns, outcomeId } = job.data;
    
    try {
      this.logger.info('Processing pattern job', { jobId: job.id, patternCount: patterns.length });

      const results = await Promise.all(
        patterns.map(async (patternId: string) => {
          return await this.patternEngine.updatePattern(patternId, outcomeId);
        })
      );

      return {
        processed: true,
        patternResults: results,
        outcomeId,
      };

    } catch (error) {
      this.logger.error('Failed to process pattern job', { 
        jobId: job.id, 
        error: error.message,
      });
      throw error;
    }
  }

  private async validateOptimizationResult(result: any, domain: BusinessDomain): Promise<any> {
    // Implement safety validation logic
    const safetyChecks = [
      this.checkPerformanceDegradation(result, domain),
      this.checkRiskThresholds(result, domain),
      this.checkBusinessConstraints(result, domain),
    ];

    const validationResults = await Promise.all(safetyChecks);
    const allPassed = validationResults.every(check => check.passed);

    return {
      safe: allPassed,
      checks: validationResults,
      recommendations: this.generateValidationRecommendations(validationResults),
    };
  }

  private async checkPerformanceDegradation(result: any, domain: BusinessDomain): Promise<any> {
    // Check if optimization would degrade performance
    const currentMetrics = await this.performanceMonitor.getCurrentMetrics(domain);
    const projectedMetrics = result.projectedMetrics;

    const degradationThreshold = this.config.optimization.rollbackThreshold;
    const performanceChange = (projectedMetrics.accuracy - currentMetrics.accuracy) / currentMetrics.accuracy;

    return {
      check: 'performance_degradation',
      passed: performanceChange > -degradationThreshold,
      currentAccuracy: currentMetrics.accuracy,
      projectedAccuracy: projectedMetrics.accuracy,
      change: performanceChange,
    };
  }

  private async checkRiskThresholds(result: any, domain: BusinessDomain): Promise<any> {
    // Implement risk assessment logic
    const riskScore = this.calculateRiskScore(result, domain);
    const safetyThreshold = this.config.learning.safetyThreshold;

    return {
      check: 'risk_thresholds',
      passed: riskScore <= safetyThreshold,
      riskScore,
      threshold: safetyThreshold,
    };
  }

  private async checkBusinessConstraints(result: any, domain: BusinessDomain): Promise<any> {
    // Check business-specific constraints
    return {
      check: 'business_constraints',
      passed: true, // Placeholder - implement domain-specific constraints
      details: {},
    };
  }

  private calculateRiskScore(result: any, domain: BusinessDomain): number {
    // Implement risk scoring algorithm
    let riskScore = 0;

    // Factor in change magnitude
    const changeAmount = Math.abs(result.improvementMetrics?.overall || 0);
    riskScore += changeAmount * 0.1;

    // Factor in confidence
    const confidence = result.confidence || 0.5;
    riskScore += (1 - confidence) * 0.3;

    // Domain-specific risk factors
    const domainRiskFactors = {
      [BusinessDomain.LEGAL_ANALYSIS]: 0.8,
      [BusinessDomain.PRICING_OPTIMIZATION]: 0.9,
      [BusinessDomain.RISK_ASSESSMENT]: 0.9,
      [BusinessDomain.COMPLIANCE_MONITORING]: 0.8,
    };

    riskScore *= domainRiskFactors[domain] || 0.5;

    return Math.min(riskScore, 1.0);
  }

  private generateValidationRecommendations(validationResults: any[]): string[] {
    const recommendations: string[] = [];
    
    validationResults.forEach(result => {
      if (!result.passed) {
        switch (result.check) {
          case 'performance_degradation':
            recommendations.push('Consider gradual rollout to minimize performance impact');
            break;
          case 'risk_thresholds':
            recommendations.push('Implement additional monitoring and rollback triggers');
            break;
          case 'business_constraints':
            recommendations.push('Review business constraints and adjust parameters');
            break;
        }
      }
    });

    return recommendations;
  }

  private async deployOptimizationResult(result: any, domain: BusinessDomain): Promise<void> {
    try {
      // Deploy to DSPy service
      await this.integrationManager.deployOptimizedPrompts(result.newPrompts, domain);

      // Update patterns in memory
      if (result.updatedPatterns) {
        await Promise.all(
          result.updatedPatterns.map((pattern: LearningPattern) =>
            this.integrationManager.storePattern(pattern)
          )
        );
      }

      this.logger.info('Optimization result deployed successfully', { domain });
      this.emit('optimizationDeployed', { domain, result });

    } catch (error) {
      this.logger.error('Failed to deploy optimization result', { error, domain });
      throw error;
    }
  }

  private async processPendingOutcomes(): Promise<void> {
    try {
      const pendingOutcomes = await this.integrationManager.getPendingOutcomes();
      
      for (const outcome of pendingOutcomes) {
        await this.learningQueue.add('process-outcome', {
          outcomeId: outcome.id,
          domain: outcome.domain,
        });
      }

      if (pendingOutcomes.length > 0) {
        this.logger.info('Added pending outcomes to learning queue', { count: pendingOutcomes.length });
      }

    } catch (error) {
      this.logger.error('Failed to process pending outcomes', { error });
    }
  }

  private async triggerPatternDiscovery(): Promise<void> {
    try {
      await this.patternQueue.add('discover-patterns', {
        timestamp: new Date(),
        minSampleSize: 100,
        minConfidence: 0.7,
      });

    } catch (error) {
      this.logger.error('Failed to trigger pattern discovery', { error });
    }
  }

  private async runCrossDomainAnalysis(): Promise<void> {
    try {
      const insights = await this.crossDomainEngine.analyzeTransferOpportunities();
      
      for (const insight of insights) {
        if (insight.applicability > 0.8) {
          await this.optimizationQueue.add('cross-domain-transfer', {
            insightId: insight.id,
            targetDomain: insight.targetDomain,
            applicability: insight.applicability,
          });
        }
      }

    } catch (error) {
      this.logger.error('Failed to run cross-domain analysis', { error });
    }
  }

  /**
   * Get system metrics and health status
   */
  async getSystemMetrics(): Promise<LearningSystemMetrics> {
    try {
      const [
        queueMetrics,
        performanceMetrics,
        integrationHealth
      ] = await Promise.all([
        this.getQueueMetrics(),
        this.performanceMonitor.getSystemMetrics(),
        this.integrationManager.getHealthStatus(),
      ]);

      return {
        ...performanceMetrics,
        ...queueMetrics,
        integrationHealth: integrationHealth.overall,
        lastHealthCheck: new Date(),
      } as LearningSystemMetrics;

    } catch (error) {
      this.logger.error('Failed to get system metrics', { error });
      throw error;
    }
  }

  private async getQueueMetrics(): Promise<any> {
    const [learningWaiting, learningActive, learningCompleted, learningFailed] = await Promise.all([
      this.learningQueue.getWaiting(),
      this.learningQueue.getActive(),
      this.learningQueue.getCompleted(),
      this.learningQueue.getFailed(),
    ]);

    const [optimizationWaiting, optimizationActive] = await Promise.all([
      this.optimizationQueue.getWaiting(),
      this.optimizationQueue.getActive(),
    ]);

    return {
      queueMetrics: {
        learning: {
          waiting: learningWaiting.length,
          active: learningActive.length,
          completed: learningCompleted.length,
          failed: learningFailed.length,
        },
        optimization: {
          waiting: optimizationWaiting.length,
          active: optimizationActive.length,
        },
      },
    };
  }

  /**
   * Pause all learning activities
   */
  async pauseLearning(): Promise<void> {
    try {
      await Promise.all([
        this.learningWorker.pause(),
        this.optimizationWorker.pause(),
        this.patternWorker.pause(),
      ]);

      this.logger.info('Learning activities paused');
      this.emit('learningPaused');

    } catch (error) {
      this.logger.error('Failed to pause learning', { error });
      throw error;
    }
  }

  /**
   * Resume learning activities
   */
  async resumeLearning(): Promise<void> {
    try {
      await Promise.all([
        this.learningWorker.resume(),
        this.optimizationWorker.resume(),
        this.patternWorker.resume(),
      ]);

      this.logger.info('Learning activities resumed');
      this.emit('learningResumed');

    } catch (error) {
      this.logger.error('Failed to resume learning', { error });
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const checks = await Promise.all([
        this.redis.ping(),
        this.integrationManager.healthCheck(),
        this.performanceMonitor.healthCheck(),
      ]);

      return checks.every(check => check === 'PONG' || check === true);

    } catch (error) {
      this.logger.error('Health check failed', { error });
      return false;
    }
  }

  async shutdown(): Promise<void> {
    if (this.shutdownInProgress) {
      return;
    }

    this.shutdownInProgress = true;
    this.logger.info('Shutting down Learning Orchestrator...');

    try {
      // Close workers
      await Promise.all([
        this.learningWorker.close(),
        this.optimizationWorker.close(),
        this.patternWorker.close(),
      ]);

      // Close queues
      await Promise.all([
        this.learningQueue.close(),
        this.optimizationQueue.close(),
        this.patternQueue.close(),
      ]);

      // Shutdown components
      await Promise.all([
        this.integrationManager.shutdown(),
        this.performanceMonitor.shutdown(),
        this.crossDomainEngine.shutdown(),
      ]);

      // Close Redis connection
      this.redis.disconnect();

      this.logger.info('Learning Orchestrator shutdown complete');
      this.emit('shutdown');

    } catch (error) {
      this.logger.error('Error during shutdown', { error });
      throw error;
    }
  }
}