/**
 * Continuous Learning Integration for LoRA Models
 * Automatically learns from production data and improves models over time
 */

import { EventEmitter } from 'events';
import { createServiceLogger } from '../mocks/shared-logger';
import { PythonLoRAIntegration, TrainingRequest } from './python-integration';
import { MultiModelManager } from './multi-model-manager';
import { createHash } from 'crypto';

const logger = createServiceLogger('continuous-learning');

export interface LearningExample {
  domain: string;
  input: Record<string, any>;
  output: Record<string, any>;
  feedback?: {
    rating?: number; // 1-5 scale
    correct?: boolean;
    improved?: string; // Improved response
  };
  metadata: {
    timestamp: Date;
    userId?: string;
    sessionId?: string;
    modelVersion?: string;
  };
}

export interface LearningBatch {
  id: string;
  domain: string;
  examples: LearningExample[];
  createdAt: Date;
  status: 'pending' | 'training' | 'completed' | 'failed';
  modelVersion?: string;
  metrics?: {
    totalExamples: number;
    positiveExamples: number;
    negativeExamples: number;
    averageRating?: number;
  };
}

export interface ContinuousLearningConfig {
  enabled: boolean;
  batchSize: number;
  minExamplesForTraining: number;
  trainingInterval: number; // Hours
  qualityThreshold: number; // Minimum rating to include
  domains: {
    [key: string]: {
      enabled: boolean;
      customBatchSize?: number;
      customInterval?: number;
      includeNegativeExamples: boolean;
    };
  };
}

export class ContinuousLearningService extends EventEmitter {
  private learningExamples: Map<string, LearningExample[]> = new Map();
  private learningBatches: Map<string, LearningBatch> = new Map();
  private config: ContinuousLearningConfig;
  private pythonIntegration: PythonLoRAIntegration;
  private modelManager: MultiModelManager;
  private trainingSchedule?: NodeJS.Timeout;
  private deduplicationCache: Set<string> = new Set();

  constructor(
    pythonIntegration: PythonLoRAIntegration,
    modelManager: MultiModelManager,
    config?: Partial<ContinuousLearningConfig>
  ) {
    super();
    this.pythonIntegration = pythonIntegration;
    this.modelManager = modelManager;
    
    // Default configuration
    this.config = {
      enabled: true,
      batchSize: 100,
      minExamplesForTraining: 50,
      trainingInterval: 24, // Daily
      qualityThreshold: 3.5,
      domains: {
        legal_analysis: { enabled: true, includeNegativeExamples: true },
        marketing_content: { enabled: true, includeNegativeExamples: false },
        sales_communication: { enabled: true, includeNegativeExamples: true },
        customer_support: { enabled: true, includeNegativeExamples: true }
      },
      ...config
    };
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Continuous Learning Service...');

    // Load existing learning examples from storage
    await this.loadLearningHistory();

    // Start training schedule
    if (this.config.enabled) {
      this.startTrainingSchedule();
    }

    // Set up event listeners
    this.setupEventListeners();

    logger.info('Continuous Learning Service initialized', {
      enabled: this.config.enabled,
      domains: Object.keys(this.config.domains).filter(d => this.config.domains[d].enabled)
    });
  }

  /**
   * Record a learning example from production usage
   */
  async recordExample(example: LearningExample): Promise<void> {
    // Check if domain learning is enabled
    const domainConfig = this.config.domains[example.domain];
    if (!domainConfig?.enabled) {
      return;
    }

    // Filter based on quality threshold
    if (example.feedback?.rating && example.feedback.rating < this.config.qualityThreshold) {
      if (!domainConfig.includeNegativeExamples) {
        return;
      }
    }

    // Deduplicate examples
    const exampleHash = this.hashExample(example);
    if (this.deduplicationCache.has(exampleHash)) {
      return;
    }
    this.deduplicationCache.add(exampleHash);

    // Add to domain examples
    if (!this.learningExamples.has(example.domain)) {
      this.learningExamples.set(example.domain, []);
    }
    
    this.learningExamples.get(example.domain)!.push(example);

    logger.debug('Learning example recorded', {
      domain: example.domain,
      hasRating: !!example.feedback?.rating,
      rating: example.feedback?.rating
    });

    // Check if we should trigger training
    await this.checkTrainingTrigger(example.domain);
  }

  /**
   * Record feedback for a previous interaction
   */
  async recordFeedback(
    domain: string,
    sessionId: string,
    feedback: LearningExample['feedback']
  ): Promise<void> {
    // Find recent examples from this session
    const domainExamples = this.learningExamples.get(domain) || [];
    const sessionExamples = domainExamples.filter(
      ex => ex.metadata.sessionId === sessionId &&
      new Date().getTime() - ex.metadata.timestamp.getTime() < 3600000 // Within 1 hour
    );

    // Update feedback on recent examples
    for (const example of sessionExamples) {
      example.feedback = { ...example.feedback, ...feedback };
    }

    if (sessionExamples.length > 0) {
      logger.info('Feedback recorded for session', {
        domain,
        sessionId,
        examplesUpdated: sessionExamples.length
      });
    }
  }

  /**
   * Manually trigger training for a domain
   */
  async triggerTraining(domain: string, force: boolean = false): Promise<string | null> {
    const examples = this.learningExamples.get(domain) || [];
    
    if (!force && examples.length < this.config.minExamplesForTraining) {
      logger.warn('Not enough examples for training', {
        domain,
        examples: examples.length,
        required: this.config.minExamplesForTraining
      });
      return null;
    }

    return await this.createAndExecuteTrainingBatch(domain, examples);
  }

  /**
   * Get learning statistics for a domain
   */
  async getLearningStats(domain?: string): Promise<Record<string, any>> {
    if (domain) {
      const examples = this.learningExamples.get(domain) || [];
      const batches = Array.from(this.learningBatches.values()).filter(b => b.domain === domain);
      
      return this.calculateDomainStats(domain, examples, batches);
    }

    // Get stats for all domains
    const stats: Record<string, any> = {};
    for (const [domain, examples] of this.learningExamples.entries()) {
      const batches = Array.from(this.learningBatches.values()).filter(b => b.domain === domain);
      stats[domain] = this.calculateDomainStats(domain, examples, batches);
    }
    
    return stats;
  }

  /**
   * Get recent training batches
   */
  getTrainingHistory(domain?: string, limit: number = 10): LearningBatch[] {
    let batches = Array.from(this.learningBatches.values());
    
    if (domain) {
      batches = batches.filter(b => b.domain === domain);
    }
    
    return batches
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // Private methods

  private async checkTrainingTrigger(domain: string): Promise<void> {
    const examples = this.learningExamples.get(domain) || [];
    const domainConfig = this.config.domains[domain];
    const batchSize = domainConfig?.customBatchSize || this.config.batchSize;

    if (examples.length >= batchSize) {
      logger.info('Batch size reached, triggering training', {
        domain,
        examples: examples.length,
        batchSize
      });
      
      await this.createAndExecuteTrainingBatch(domain, examples.slice(0, batchSize));
      
      // Remove processed examples
      this.learningExamples.set(domain, examples.slice(batchSize));
    }
  }

  private async createAndExecuteTrainingBatch(
    domain: string,
    examples: LearningExample[]
  ): Promise<string> {
    const batchId = `batch-${Date.now()}-${domain}`;
    
    // Calculate batch metrics
    const metrics = {
      totalExamples: examples.length,
      positiveExamples: examples.filter(ex => 
        !ex.feedback || ex.feedback.rating === undefined || ex.feedback.rating >= this.config.qualityThreshold
      ).length,
      negativeExamples: examples.filter(ex => 
        ex.feedback?.rating !== undefined && ex.feedback.rating < this.config.qualityThreshold
      ).length,
      averageRating: examples
        .filter(ex => ex.feedback?.rating !== undefined)
        .reduce((sum, ex) => sum + (ex.feedback?.rating || 0), 0) / 
        examples.filter(ex => ex.feedback?.rating !== undefined).length || 0
    };

    const batch: LearningBatch = {
      id: batchId,
      domain,
      examples,
      createdAt: new Date(),
      status: 'pending',
      metrics
    };

    this.learningBatches.set(batchId, batch);

    // Prepare training data
    const trainingData = await this.prepareTrainingData(domain, examples);
    
    if (trainingData.length === 0) {
      batch.status = 'failed';
      logger.error('No valid training data prepared', { domain, batchId });
      return batchId;
    }

    try {
      // Get current model configuration
      const domainConfig = await this.modelManager.getDomainConfig(domain);
      const currentModel = domainConfig?.versions.find(v => v.version === domainConfig.activeVersion);
      
      batch.status = 'training';
      
      // Start incremental training
      const trainingJob = await this.pythonIntegration.startTraining({
        domain,
        base_model: currentModel?.baseModel || 'microsoft/DialoGPT-medium',
        training_data: trainingData,
        training_config: {
          epochs: 1, // Less epochs for continuous learning
          batch_size: 4,
          learning_rate: 0.00005, // Lower learning rate for fine-tuning
          gradient_accumulation_steps: 8
        }
      });

      // Monitor training completion
      this.pythonIntegration.once('training_completed', async (data) => {
        if (data.job_id === trainingJob.job_id) {
          batch.status = 'completed';
          batch.modelVersion = data.adapter_path;
          
          logger.info('Continuous learning batch completed', {
            batchId,
            domain,
            modelVersion: batch.modelVersion
          });

          this.emit('learning:batch_completed', {
            batchId,
            domain,
            examples: batch.examples.length,
            modelVersion: batch.modelVersion
          });
        }
      });

      this.pythonIntegration.once('training_failed', (data) => {
        if (data.job_id === trainingJob.job_id) {
          batch.status = 'failed';
          logger.error('Continuous learning batch failed', {
            batchId,
            domain,
            error: data.error
          });
        }
      });

    } catch (error) {
      batch.status = 'failed';
      logger.error('Failed to start continuous learning batch', {
        batchId,
        domain,
        error: error.message
      });
    }

    return batchId;
  }

  private async prepareTrainingData(
    domain: string,
    examples: LearningExample[]
  ): Promise<Array<Record<string, any>>> {
    const trainingData: Array<Record<string, any>> = [];

    for (const example of examples) {
      // Skip low-quality examples unless they have improved responses
      if (example.feedback?.rating && 
          example.feedback.rating < this.config.qualityThreshold &&
          !example.feedback.improved) {
        continue;
      }

      // Use improved response if available, otherwise original
      const output = example.feedback?.improved || example.output;

      // Format based on domain
      switch (domain) {
        case 'legal_analysis':
          trainingData.push({
            document_text: example.input.document_text || example.input.text,
            analysis_result: output.analysis || output.result
          });
          break;

        case 'marketing_content':
          trainingData.push({
            campaign_objective: example.input.objective,
            target_audience: example.input.audience,
            brand_voice: example.input.voice || 'professional',
            generated_content: output.content || output.text
          });
          break;

        case 'sales_communication':
          trainingData.push({
            prospect_context: example.input.context,
            company: example.input.company,
            role: example.input.role,
            sales_stage: example.input.stage || 'initial_outreach',
            email_content: output.email || output.content
          });
          break;

        case 'customer_support':
          trainingData.push({
            customer_issue: example.input.issue,
            customer_tier: example.input.tier || 'standard',
            interaction_history: example.input.history || '',
            support_response: output.response || output.message
          });
          break;
      }
    }

    return trainingData;
  }

  private calculateDomainStats(
    domain: string,
    examples: LearningExample[],
    batches: LearningBatch[]
  ): Record<string, any> {
    const recentExamples = examples.filter(ex => 
      new Date().getTime() - ex.metadata.timestamp.getTime() < 7 * 24 * 3600000 // Last 7 days
    );

    const ratings = examples
      .filter(ex => ex.feedback?.rating !== undefined)
      .map(ex => ex.feedback!.rating!);

    return {
      totalExamples: examples.length,
      recentExamples: recentExamples.length,
      totalBatches: batches.length,
      completedBatches: batches.filter(b => b.status === 'completed').length,
      averageRating: ratings.length > 0 ? 
        ratings.reduce((a, b) => a + b, 0) / ratings.length : 0,
      ratingDistribution: {
        1: ratings.filter(r => r === 1).length,
        2: ratings.filter(r => r === 2).length,
        3: ratings.filter(r => r === 3).length,
        4: ratings.filter(r => r === 4).length,
        5: ratings.filter(r => r === 5).length
      },
      lastTraining: batches
        .filter(b => b.status === 'completed')
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.createdAt || null
    };
  }

  private hashExample(example: LearningExample): string {
    const content = JSON.stringify({
      domain: example.domain,
      input: example.input,
      output: example.output
    });
    
    return createHash('sha256').update(content).digest('hex');
  }

  private startTrainingSchedule(): void {
    const intervalMs = this.config.trainingInterval * 3600000; // Convert hours to ms
    
    this.trainingSchedule = setInterval(async () => {
      logger.info('Running scheduled continuous learning check');
      
      for (const domain of Object.keys(this.config.domains)) {
        if (this.config.domains[domain].enabled) {
          const examples = this.learningExamples.get(domain) || [];
          
          if (examples.length >= this.config.minExamplesForTraining) {
            await this.triggerTraining(domain);
          }
        }
      }
    }, intervalMs);

    logger.info('Continuous learning schedule started', {
      intervalHours: this.config.trainingInterval
    });
  }

  private setupEventListeners(): void {
    // Listen for model performance degradation
    this.modelManager.on('model:performance_degraded', async (data) => {
      logger.warn('Model performance degraded, prioritizing learning', data);
      
      // Increase learning priority for this domain
      const examples = this.learningExamples.get(data.domain) || [];
      if (examples.length > 20) { // Lower threshold for degraded models
        await this.triggerTraining(data.domain, true);
      }
    });
  }

  private async loadLearningHistory(): Promise<void> {
    // TODO: Implement persistence layer for learning history
    logger.debug('Loading learning history from storage');
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ContinuousLearningConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart schedule if interval changed
    if (config.trainingInterval && this.trainingSchedule) {
      clearInterval(this.trainingSchedule);
      this.startTrainingSchedule();
    }
    
    logger.info('Continuous learning configuration updated', config);
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    if (this.trainingSchedule) {
      clearInterval(this.trainingSchedule);
    }
    
    // TODO: Save learning history to persistent storage
    
    logger.info('Continuous Learning Service shutdown complete');
  }
}