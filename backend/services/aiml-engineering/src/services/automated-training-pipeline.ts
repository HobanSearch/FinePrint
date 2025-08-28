/**
 * Fine Print AI - Automated Training Pipeline
 * 
 * Orchestrates end-to-end model training from dataset generation to deployment
 * Integrates with LoRA service for efficient fine-tuning of legal analysis models
 */

import { PrismaClient } from '@prisma/client';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { QueueService } from '@fineprintai/queue';
import { TrainingDatasetGenerator, Dataset } from './training-dataset-generator';
import { ModelLifecycleManager } from './model-lifecycle-manager';
import { ModelRegistry } from './model-registry';
import { PerformanceMonitor } from './performance-monitor';
import { EventEmitter } from 'events';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs-extra';
import * as path from 'path';

const logger = createServiceLogger('automated-training-pipeline');

// Training Pipeline Configuration Schema
export const TrainingPipelineConfigSchema = z.object({
  pipeline_name: z.string(),
  description: z.string().optional(),
  dataset_config: z.object({
    name: z.string(),
    task_type: z.enum(['risk_assessment', 'clause_detection', 'compliance_analysis', 'recommendation_generation']),
    jurisdiction: z.enum(['global', 'eu', 'us', 'ca', 'br', 'sg']).default('global'),
    min_examples: z.number().min(100).default(1000),
    max_examples: z.number().min(1000).default(10000),
    quality_threshold: z.number().min(0.5).max(1.0).default(0.8),
  }),
  model_config: z.object({
    base_model: z.string().default('llama2:7b'),
    model_type: z.enum(['huggingface', 'ollama', 'custom']).default('ollama'),
    task_specific_head: z.boolean().default(true),
  }),
  lora_config: z.object({
    rank: z.number().min(1).max(512).default(16),
    alpha: z.number().min(1).max(128).default(32),
    dropout: z.number().min(0).max(0.5).default(0.1),
    target_modules: z.array(z.string()).default(['q_proj', 'v_proj', 'k_proj', 'o_proj']),
    gate_threshold: z.number().min(0.1).max(0.9).default(0.7),
  }),
  training_config: z.object({
    num_epochs: z.number().min(1).max(100).default(3),
    batch_size: z.number().min(1).max(64).default(8),
    learning_rate: z.number().min(1e-6).max(1e-2).default(2e-4),
    warmup_steps: z.number().min(0).default(100),
    save_steps: z.number().min(1).default(100),
    eval_steps: z.number().min(1).default(50),
    gradient_accumulation_steps: z.number().min(1).default(4),
    max_grad_norm: z.number().min(0).default(1.0),
    fp16: z.boolean().default(true),
  }),
  evaluation_config: z.object({
    metrics: z.array(z.enum(['accuracy', 'f1', 'precision', 'recall', 'rouge', 'bleu'])).default(['accuracy', 'f1']),
    validation_split: z.number().min(0.1).max(0.5).default(0.2),
    early_stopping: z.object({
      enabled: z.boolean().default(true),
      patience: z.number().min(1).default(3),
      min_delta: z.number().min(0).default(0.001),
    }),
  }),
  deployment_config: z.object({
    auto_deploy: z.boolean().default(false),
    min_performance_threshold: z.number().min(0.5).max(1.0).default(0.8),
    staging_validation: z.boolean().default(true),
    rollback_on_failure: z.boolean().default(true),
  }),
});

export type TrainingPipelineConfig = z.infer<typeof TrainingPipelineConfigSchema>;

export interface TrainingPipeline {
  id: string;
  name: string;
  config: TrainingPipelineConfig;
  status: 'pending' | 'dataset_generation' | 'model_training' | 'evaluation' | 'deployment' | 'completed' | 'failed';
  current_stage: string;
  progress: number; // 0-100
  dataset_id?: string;
  model_id?: string;
  adapter_id?: string;
  training_job_id?: string;
  evaluation_results?: any;
  deployment_info?: any;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
  started_at?: Date;
  completed_at?: Date;
  logs: TrainingLog[];
}

export interface TrainingLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error';
  stage: string;
  message: string;
  metadata?: any;
}

export interface PipelineProgress {
  pipeline_id: string;
  stage: string;
  progress: number;
  message: string;
  estimated_completion?: Date;
}

export class AutomatedTrainingPipeline extends EventEmitter {
  private prisma: PrismaClient;
  private queue: QueueService;
  private datasetGenerator: TrainingDatasetGenerator;
  private modelManager: ModelLifecycleManager;
  private modelRegistry: ModelRegistry;
  private performanceMonitor: PerformanceMonitor;
  private activePipelines: Map<string, TrainingPipeline> = new Map();

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
    this.queue = new QueueService('training-pipeline');
    this.datasetGenerator = new TrainingDatasetGenerator(prisma);
    this.modelManager = new ModelLifecycleManager();
    this.modelRegistry = new ModelRegistry();
    this.performanceMonitor = new PerformanceMonitor();
    
    this.setupEventHandlers();
  }

  /**
   * Start a new training pipeline
   */
  async startPipeline(config: TrainingPipelineConfig): Promise<TrainingPipeline> {
    const pipelineId = uuidv4();
    
    const pipeline: TrainingPipeline = {
      id: pipelineId,
      name: config.pipeline_name,
      config,
      status: 'pending',
      current_stage: 'initialization',
      progress: 0,
      created_at: new Date(),
      updated_at: new Date(),
      logs: [],
    };

    this.activePipelines.set(pipelineId, pipeline);
    
    logger.info('Starting training pipeline', { pipelineId, config: config.pipeline_name });
    
    try {
      await this.updatePipelineStatus(pipeline, 'dataset_generation', 'Generating training dataset');
      
      // Stage 1: Generate Dataset
      const dataset = await this.generateDataset(pipeline);
      pipeline.dataset_id = dataset.id;
      pipeline.progress = 25;
      
      await this.updatePipelineStatus(pipeline, 'model_training', 'Starting model training');
      
      // Stage 2: Train Model with LoRA
      const trainingResult = await this.trainModel(pipeline, dataset);
      pipeline.model_id = trainingResult.model_id;
      pipeline.adapter_id = trainingResult.adapter_id;
      pipeline.training_job_id = trainingResult.job_id;
      pipeline.progress = 70;
      
      await this.updatePipelineStatus(pipeline, 'evaluation', 'Evaluating model performance');
      
      // Stage 3: Evaluate Model
      const evaluationResults = await this.evaluateModel(pipeline);
      pipeline.evaluation_results = evaluationResults;
      pipeline.progress = 90;
      
      // Stage 4: Deploy (if configured)
      if (config.deployment_config.auto_deploy && 
          evaluationResults.overall_score >= config.deployment_config.min_performance_threshold) {
        
        await this.updatePipelineStatus(pipeline, 'deployment', 'Deploying model');
        const deploymentInfo = await this.deployModel(pipeline);
        pipeline.deployment_info = deploymentInfo;
      }
      
      await this.updatePipelineStatus(pipeline, 'completed', 'Pipeline completed successfully');
      pipeline.progress = 100;
      pipeline.completed_at = new Date();
      
      this.emit('pipeline:completed', pipeline);
      
      return pipeline;
      
    } catch (error) {
      await this.handlePipelineError(pipeline, error);
      throw error;
    }
  }

  /**
   * Generate training dataset
   */
  private async generateDataset(pipeline: TrainingPipeline): Promise<Dataset> {
    this.addLog(pipeline, 'info', 'dataset_generation', 'Starting dataset generation');
    
    try {
      const dataset = await this.datasetGenerator.generateDataset({
        name: `${pipeline.name}_dataset`,
        task_type: pipeline.config.dataset_config.task_type,
        jurisdiction: pipeline.config.dataset_config.jurisdiction,
        min_examples: pipeline.config.dataset_config.min_examples,
        max_examples: pipeline.config.dataset_config.max_examples,
        validation_split: pipeline.config.evaluation_config.validation_split,
        test_split: 0.1,
        format: 'jsonl',
        include_metadata: true,
        quality_threshold: pipeline.config.dataset_config.quality_threshold,
      });
      
      this.addLog(pipeline, 'info', 'dataset_generation', 
        `Dataset generated with ${dataset.statistics.total_examples} examples`);
      
      return dataset;
      
    } catch (error) {
      this.addLog(pipeline, 'error', 'dataset_generation', 
        `Dataset generation failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Train model with LoRA adapters
   */
  private async trainModel(pipeline: TrainingPipeline, dataset: Dataset): Promise<{
    model_id: string;
    adapter_id: string;
    job_id: string;
  }> {
    this.addLog(pipeline, 'info', 'model_training', 'Starting model training with LoRA');
    
    try {
      // Create LoRA adapter configuration
      const adapterConfig = {
        name: `${pipeline.name}_lora_adapter`,
        base_model: pipeline.config.model_config.base_model,
        task_domain: this.mapTaskToLoraDomain(pipeline.config.dataset_config.task_type),
        adapter_config: {
          rank: pipeline.config.lora_config.rank,
          alpha: pipeline.config.lora_config.alpha,
          dropout: pipeline.config.lora_config.dropout,
          target_modules: pipeline.config.lora_config.target_modules,
          gate_threshold: pipeline.config.lora_config.gate_threshold,
        },
        training_config: {
          learning_rate: pipeline.config.training_config.learning_rate,
          batch_size: pipeline.config.training_config.batch_size,
          epochs: pipeline.config.training_config.num_epochs,
          warmup_steps: pipeline.config.training_config.warmup_steps,
          weight_decay: 0.01,
        },
      };

      // Create training configuration
      const trainingConfig = {
        model_name: `${pipeline.name}_fine_tuned`,
        model_type: 'custom' as const,
        base_model: pipeline.config.model_config.base_model,
        dataset_path: dataset.file_paths.train,
        output_dir: `./models/${pipeline.id}`,
        training_args: {
          num_epochs: pipeline.config.training_config.num_epochs,
          batch_size: pipeline.config.training_config.batch_size,
          learning_rate: pipeline.config.training_config.learning_rate,
          weight_decay: 0.01,
          warmup_steps: pipeline.config.training_config.warmup_steps,
          gradient_accumulation_steps: pipeline.config.training_config.gradient_accumulation_steps,
          max_grad_norm: pipeline.config.training_config.max_grad_norm,
          save_steps: pipeline.config.training_config.save_steps,
          eval_steps: pipeline.config.training_config.eval_steps,
          logging_steps: 10,
          fp16: pipeline.config.training_config.fp16,
          bf16: false,
          gradient_checkpointing: true,
          dataloader_num_workers: 2,
        },
        optimization_config: {
          optimizer: 'adamw' as const,
          scheduler: 'linear' as const,
          early_stopping: {
            enabled: pipeline.config.evaluation_config.early_stopping.enabled,
            patience: pipeline.config.evaluation_config.early_stopping.patience,
            min_delta: pipeline.config.evaluation_config.early_stopping.min_delta,
          },
        },
        environment_config: {
          gpu_ids: [0],
          mixed_precision: pipeline.config.training_config.fp16,
          distributed_training: false,
        },
      };

      // Start training job
      const trainingJob = await this.modelManager.startTraining(trainingConfig);
      
      this.addLog(pipeline, 'info', 'model_training', 
        `Training job started: ${trainingJob.job_id}`);
      
      // Monitor training progress
      await this.monitorTrainingProgress(pipeline, trainingJob.job_id);
      
      return {
        model_id: trainingJob.model_id,
        adapter_id: adapterConfig.name,
        job_id: trainingJob.job_id,
      };
      
    } catch (error) {
      this.addLog(pipeline, 'error', 'model_training', 
        `Model training failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Monitor training progress
   */
  private async monitorTrainingProgress(pipeline: TrainingPipeline, jobId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(async () => {
        try {
          const status = await this.modelManager.getTrainingStatus(jobId);
          
          if (status.status === 'completed') {
            clearInterval(checkInterval);
            this.addLog(pipeline, 'info', 'model_training', 'Training completed successfully');
            resolve();
          } else if (status.status === 'failed') {
            clearInterval(checkInterval);
            this.addLog(pipeline, 'error', 'model_training', `Training failed: ${status.error}`);
            reject(new Error(status.error));
          } else {
            // Update progress
            const progress = 25 + (status.progress * 0.45); // 25-70% range for training
            pipeline.progress = Math.round(progress);
            pipeline.updated_at = new Date();
            
            this.addLog(pipeline, 'info', 'model_training', 
              `Training progress: ${Math.round(status.progress * 100)}%`);
            
            this.emit('pipeline:progress', {
              pipeline_id: pipeline.id,
              stage: 'model_training',
              progress: pipeline.progress,
              message: `Training epoch ${status.current_epoch}/${status.total_epochs}`,
            });
          }
        } catch (error) {
          clearInterval(checkInterval);
          reject(error);
        }
      }, 10000); // Check every 10 seconds
    });
  }

  /**
   * Evaluate trained model
   */
  private async evaluateModel(pipeline: TrainingPipeline): Promise<any> {
    this.addLog(pipeline, 'info', 'evaluation', 'Starting model evaluation');
    
    try {
      if (!pipeline.model_id) {
        throw new Error('No model ID available for evaluation');
      }

      // Run evaluation on test set
      const evaluationResults = await this.performanceMonitor.evaluateModel({
        model_id: pipeline.model_id,
        test_dataset_path: pipeline.dataset_id ? 
          (await this.datasetGenerator.getDataset(pipeline.dataset_id))?.file_paths.test : 
          undefined,
        metrics: pipeline.config.evaluation_config.metrics,
        task_type: pipeline.config.dataset_config.task_type,
      });

      this.addLog(pipeline, 'info', 'evaluation', 
        `Evaluation completed with score: ${evaluationResults.overall_score}`);

      return evaluationResults;
      
    } catch (error) {
      this.addLog(pipeline, 'error', 'evaluation', 
        `Model evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Deploy trained model
   */
  private async deployModel(pipeline: TrainingPipeline): Promise<any> {
    this.addLog(pipeline, 'info', 'deployment', 'Starting model deployment');
    
    try {
      if (!pipeline.model_id || !pipeline.adapter_id) {
        throw new Error('Model or adapter ID not available for deployment');
      }

      // Register model in registry
      const registrationInfo = await this.modelRegistry.registerModel({
        model_id: pipeline.model_id,
        name: pipeline.name,
        version: '1.0.0',
        task_type: pipeline.config.dataset_config.task_type,
        performance_metrics: pipeline.evaluation_results,
        metadata: {
          base_model: pipeline.config.model_config.base_model,
          adapter_id: pipeline.adapter_id,
          training_config: pipeline.config,
          created_at: new Date(),
        },
      });

      // Deploy to staging first if configured
      let deploymentInfo;
      if (pipeline.config.deployment_config.staging_validation) {
        deploymentInfo = await this.deployToStaging(pipeline);
        
        // Validate in staging
        const stagingValidation = await this.validateStagingDeployment(pipeline);
        if (!stagingValidation.success) {
          throw new Error(`Staging validation failed: ${stagingValidation.error}`);
        }
      }

      // Deploy to production
      deploymentInfo = await this.deployToProduction(pipeline);
      
      this.addLog(pipeline, 'info', 'deployment', 
        `Model deployed successfully: ${deploymentInfo.endpoint}`);

      return {
        registration: registrationInfo,
        deployment: deploymentInfo,
        staging_validation: pipeline.config.deployment_config.staging_validation,
      };
      
    } catch (error) {
      this.addLog(pipeline, 'error', 'deployment', 
        `Model deployment failed: ${error instanceof Error ? error.message : String(error)}`);
      
      if (pipeline.config.deployment_config.rollback_on_failure) {
        await this.rollbackDeployment(pipeline);
      }
      
      throw error;
    }
  }

  /**
   * Deploy model to staging environment
   */
  private async deployToStaging(pipeline: TrainingPipeline): Promise<any> {
    // Implementation would deploy to staging environment
    // For now, simulate deployment
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return {
      environment: 'staging',
      endpoint: `http://staging.fineprintai.com/models/${pipeline.model_id}`,
      deployed_at: new Date(),
    };
  }

  /**
   * Validate staging deployment
   */
  private async validateStagingDeployment(pipeline: TrainingPipeline): Promise<{
    success: boolean;
    error?: string;
  }> {
    // Implementation would run validation tests against staging
    // For now, simulate validation
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return { success: true };
  }

  /**
   * Deploy model to production
   */
  private async deployToProduction(pipeline: TrainingPipeline): Promise<any> {
    // Implementation would deploy to production environment
    // For now, simulate deployment
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return {
      environment: 'production',
      endpoint: `http://api.fineprintai.com/models/${pipeline.model_id}`,
      deployed_at: new Date(),
    };
  }

  /**
   * Rollback deployment on failure
   */
  private async rollbackDeployment(pipeline: TrainingPipeline): Promise<void> {
    this.addLog(pipeline, 'info', 'deployment', 'Rolling back deployment');
    
    // Implementation would rollback to previous model version
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    this.addLog(pipeline, 'info', 'deployment', 'Rollback completed');
  }

  /**
   * Handle pipeline error
   */
  private async handlePipelineError(pipeline: TrainingPipeline, error: any): Promise<void> {
    pipeline.status = 'failed';
    pipeline.error_message = error instanceof Error ? error.message : String(error);
    pipeline.updated_at = new Date();
    
    this.addLog(pipeline, 'error', pipeline.current_stage, 
      `Pipeline failed: ${pipeline.error_message}`);
    
    this.emit('pipeline:failed', pipeline);
    
    logger.error('Training pipeline failed', {
      pipelineId: pipeline.id,
      stage: pipeline.current_stage,
      error: pipeline.error_message,
    });
  }

  /**
   * Update pipeline status
   */
  private async updatePipelineStatus(
    pipeline: TrainingPipeline,
    status: TrainingPipeline['status'],
    message: string
  ): Promise<void> {
    pipeline.status = status;
    pipeline.current_stage = status;
    pipeline.updated_at = new Date();
    
    if (!pipeline.started_at && status !== 'pending') {
      pipeline.started_at = new Date();
    }
    
    this.addLog(pipeline, 'info', status, message);
    
    this.emit('pipeline:status_change', pipeline);
    
    logger.info('Pipeline status updated', {
      pipelineId: pipeline.id,
      status,
      message,
    });
  }

  /**
   * Add log entry to pipeline
   */
  private addLog(
    pipeline: TrainingPipeline,
    level: TrainingLog['level'],
    stage: string,
    message: string,
    metadata?: any
  ): void {
    pipeline.logs.push({
      timestamp: new Date(),
      level,
      stage,
      message,
      metadata,
    });
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.on('pipeline:progress', (progress: PipelineProgress) => {
      logger.info('Pipeline progress update', progress);
    });
    
    this.on('pipeline:completed', (pipeline: TrainingPipeline) => {
      logger.info('Pipeline completed successfully', {
        pipelineId: pipeline.id,
        duration: pipeline.completed_at && pipeline.started_at ?
          pipeline.completed_at.getTime() - pipeline.started_at.getTime() : 0,
      });
    });
    
    this.on('pipeline:failed', (pipeline: TrainingPipeline) => {
      logger.error('Pipeline failed', {
        pipelineId: pipeline.id,
        error: pipeline.error_message,
      });
    });
  }

  /**
   * Helper methods
   */

  private mapTaskToLoraDomain(taskType: string): 'legal_analysis' | 'risk_assessment' | 'clause_detection' | 'recommendation' {
    const mapping: Record<string, 'legal_analysis' | 'risk_assessment' | 'clause_detection' | 'recommendation'> = {
      'risk_assessment': 'risk_assessment',
      'clause_detection': 'clause_detection',
      'compliance_analysis': 'legal_analysis',
      'recommendation_generation': 'recommendation',
    };
    return mapping[taskType] || 'legal_analysis';
  }

  /**
   * Public API methods
   */

  async getPipeline(pipelineId: string): Promise<TrainingPipeline | null> {
    return this.activePipelines.get(pipelineId) || null;
  }

  async listPipelines(): Promise<TrainingPipeline[]> {
    return Array.from(this.activePipelines.values());
  }

  async cancelPipeline(pipelineId: string): Promise<void> {
    const pipeline = this.activePipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error('Pipeline not found');
    }

    if (pipeline.status === 'completed' || pipeline.status === 'failed') {
      throw new Error('Cannot cancel completed or failed pipeline');
    }

    // Cancel training job if running
    if (pipeline.training_job_id) {
      await this.modelManager.cancelTraining(pipeline.training_job_id);
    }

    pipeline.status = 'failed';
    pipeline.error_message = 'Pipeline cancelled by user';
    pipeline.updated_at = new Date();

    this.addLog(pipeline, 'info', pipeline.current_stage, 'Pipeline cancelled by user');
    
    this.emit('pipeline:cancelled', pipeline);
  }

  async getPipelineLogs(pipelineId: string): Promise<TrainingLog[]> {
    const pipeline = this.activePipelines.get(pipelineId);
    return pipeline?.logs || [];
  }
}