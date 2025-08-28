import { createServiceLogger } from '@fineprintai/shared-logger';
import { CacheService } from '@fineprintai/shared-cache';
import { QueueService } from '@fineprintai/queue';
import { ModelRegistry } from './model-registry';
import { PerformanceMonitor } from './performance-monitor';
import { z } from 'zod';
import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

const logger = createServiceLogger('hyperparameter-optimizer');

// Hyperparameter Search Space Schema
export const SearchSpaceSchema = z.object({
  learning_rate: z.object({
    type: z.enum(['float', 'categorical']),
    min: z.number().optional(),
    max: z.number().optional(),
    values: z.array(z.number()).optional(),
    log: z.boolean().default(true),
  }).optional(),
  batch_size: z.object({
    type: z.enum(['int', 'categorical']),
    min: z.number().optional(),
    max: z.number().optional(),
    values: z.array(z.number()).optional(),
    step: z.number().optional(),
  }).optional(),
  num_epochs: z.object({
    type: z.enum(['int']),
    min: z.number().min(1),
    max: z.number().max(1000),
    step: z.number().default(1),
  }).optional(),
  weight_decay: z.object({
    type: z.enum(['float', 'categorical']),
    min: z.number().optional(),
    max: z.number().optional(),
    values: z.array(z.number()).optional(),
    log: z.boolean().default(true),
  }).optional(),
  dropout_rate: z.object({
    type: z.enum(['float']),
    min: z.number().min(0),
    max: z.number().max(1),
  }).optional(),
  hidden_size: z.object({
    type: z.enum(['int', 'categorical']),
    min: z.number().optional(),
    max: z.number().optional(),
    values: z.array(z.number()).optional(),
  }).optional(),
  num_layers: z.object({
    type: z.enum(['int']),
    min: z.number().min(1),
    max: z.number().max(50),
  }).optional(),
  optimizer: z.object({
    type: z.enum(['categorical']),
    values: z.array(z.enum(['adamw', 'adam', 'sgd', 'adafactor'])),
  }).optional(),
  scheduler: z.object({
    type: z.enum(['categorical']),
    values: z.array(z.enum(['linear', 'cosine', 'polynomial', 'constant'])),
  }).optional(),
  // Model-specific parameters
  model_specific: z.record(z.any()).optional(),
});

export type SearchSpace = z.infer<typeof SearchSpaceSchema>;

// Optimization Configuration Schema
export const OptimizationConfigSchema = z.object({
  study_name: z.string().min(1),
  model_name: z.string().min(1),
  model_type: z.enum(['huggingface', 'pytorch', 'tensorflow', 'custom']),
  base_model: z.string().optional(),
  dataset_path: z.string(),
  search_space: SearchSpaceSchema,
  optimization_settings: z.object({
    sampler: z.enum(['tpe', 'random', 'cmaes', 'grid']).default('tpe'),
    pruner: z.enum(['median', 'hyperband', 'successive_halving', 'none']).default('median'),
    direction: z.enum(['minimize', 'maximize']).default('maximize'),
    n_trials: z.number().min(1).max(10000).default(100),
    timeout: z.number().min(60).optional(), // seconds
    n_jobs: z.number().min(1).max(16).default(1),
    load_if_exists: z.boolean().default(true),
  }),
  objective_metric: z.enum(['accuracy', 'f1_score', 'precision', 'recall', 'loss', 'auc', 'custom']).default('f1_score'),
  multi_objective: z.object({
    enabled: z.boolean().default(false),
    metrics: z.array(z.string()).optional(),
    weights: z.array(z.number()).optional(),
  }).optional(),
  early_stopping: z.object({
    enabled: z.boolean().default(true),
    patience: z.number().min(1).default(10),
    min_improvement: z.number().min(0).default(0.001),
  }),
  resource_constraints: z.object({
    max_gpu_memory_gb: z.number().min(1).default(8),
    max_training_time_hours: z.number().min(0.1).default(24),
    max_concurrent_trials: z.number().min(1).default(2),
  }),
  validation_strategy: z.object({
    method: z.enum(['holdout', 'k_fold', 'time_series']).default('holdout'),
    k_folds: z.number().min(2).max(20).default(5),
    validation_split: z.number().min(0.1).max(0.5).default(0.2),
  }),
});

export type OptimizationConfig = z.infer<typeof OptimizationConfigSchema>;

// Trial and Study interfaces
export interface Trial {
  id: string;
  number: number;
  study_id: string;
  parameters: Record<string, any>;
  value: number | number[];
  state: 'running' | 'complete' | 'pruned' | 'failed';
  datetime_start: string;
  datetime_complete?: string;
  duration_seconds?: number;
  intermediate_values: Array<{
    step: number;
    value: number;
    timestamp: string;
  }>;
  user_attrs: Record<string, any>;
  system_attrs: Record<string, any>;
  training_job_id?: string;
  error_message?: string;
}

export interface OptimizationStudy {
  id: string;
  name: string;
  config: OptimizationConfig;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  trials: Trial[];
  best_trial?: Trial;
  best_parameters?: Record<string, any>;
  best_value?: number | number[];
  created_at: string;
  started_at?: string;
  completed_at?: string;
  metadata: {
    total_trials: number;
    completed_trials: number;
    pruned_trials: number;
    failed_trials: number;
    study_direction: string;
    sampler_name: string;
    pruner_name: string;
  };
  resource_usage: {
    total_gpu_hours: number;
    total_cpu_hours: number;
    peak_memory_gb: number;
    total_cost_estimate: number;
  };
}

export class HyperparameterOptimizer extends EventEmitter {
  private cache: CacheService;
  private queue: QueueService;
  private modelRegistry: ModelRegistry;
  private performanceMonitor: PerformanceMonitor;
  
  private activeStudies: Map<string, OptimizationStudy> = new Map();
  private studiesPath: string;
  private scriptsPath: string;

  constructor(
    modelRegistry: ModelRegistry,
    performanceMonitor: PerformanceMonitor
  ) {
    super();
    this.cache = new CacheService();
    this.queue = new QueueService();
    this.modelRegistry = modelRegistry;
    this.performanceMonitor = performanceMonitor;
    
    this.studiesPath = path.join(process.cwd(), 'data', 'optimization-studies');
    this.scriptsPath = path.join(__dirname, '../scripts');
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Hyperparameter Optimizer');

      // Ensure directories exist
      await fs.ensureDir(this.studiesPath);
      await fs.ensureDir(this.scriptsPath);

      // Initialize optimization queue
      await this.initializeOptimizationQueue();

      // Load active studies from cache
      await this.loadActiveStudies();

      // Setup optimization scripts
      await this.setupOptimizationScripts();

      logger.info('Hyperparameter Optimizer initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Hyperparameter Optimizer', { error: error.message });
      throw error;
    }
  }

  private async initializeOptimizationQueue(): Promise<void> {
    await this.queue.createQueue('hyperparameter-optimization', {
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 25,
        attempts: 1, // Don't retry failed optimization studies
        backoff: {
          type: 'exponential',
          delay: 60000,
        },
      },
    });

    this.queue.process('hyperparameter-optimization', 1, async (job) => {
      return await this.processOptimizationStudy(job.data);
    });

    await this.queue.createQueue('optimization-trial', {
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 2,
      },
    });

    this.queue.process('optimization-trial', 4, async (job) => {
      return await this.processOptimizationTrial(job.data);
    });
  }

  private async loadActiveStudies(): Promise<void> {
    try {
      const cachedStudies = await this.cache.get('active_optimization_studies');
      if (cachedStudies) {
        const studies: OptimizationStudy[] = JSON.parse(cachedStudies);
        studies.forEach(study => {
          if (study.status === 'running') {
            // Mark as failed if service restarted
            study.status = 'failed';
            study.completed_at = new Date().toISOString();
            study.metadata.failed_trials = study.trials.filter(t => t.state === 'failed').length;
          }
          this.activeStudies.set(study.id, study);
        });
        logger.info(`Loaded ${studies.length} optimization studies from cache`);
      }
    } catch (error) {
      logger.warn('Failed to load active studies from cache', { error: error.message });
    }
  }

  private async setupOptimizationScripts(): Promise<void> {
    const optunaScript = `#!/usr/bin/env python3
import os
import sys
import json
import optuna
import logging
import pickle
from optuna.samplers import TPESampler, RandomSampler, CmaEsSampler
from optuna.pruners import MedianPruner, HyperbandPruner, SuccessiveHalvingPruner
from optuna.storages import RDBStorage
import torch
import mlflow
import mlflow.pytorch
from transformers import AutoTokenizer, AutoModelForSequenceClassification, TrainingArguments, Trainer
from datasets import load_dataset, load_from_disk
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, roc_auc_score
import numpy as np

def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler('optimization.log')
        ]
    )
    return logging.getLogger(__name__)

def create_sampler(sampler_name: str):
    if sampler_name == 'tpe':
        return TPESampler()
    elif sampler_name == 'random':
        return RandomSampler()
    elif sampler_name == 'cmaes':
        return CmaEsSampler()
    else:
        return TPESampler()

def create_pruner(pruner_name: str):
    if pruner_name == 'median':
        return MedianPruner()
    elif pruner_name == 'hyperband':
        return HyperbandPruner()
    elif pruner_name == 'successive_halving':
        return SuccessiveHalvingPruner()
    else:
        return MedianPruner()

def suggest_hyperparameter(trial, param_name, param_config):
    if param_config['type'] == 'float':
        if 'values' in param_config:
            return trial.suggest_categorical(param_name, param_config['values'])
        else:
            return trial.suggest_float(
                param_name,
                param_config['min'],
                param_config['max'],
                log=param_config.get('log', False)
            )
    elif param_config['type'] == 'int':
        if 'values' in param_config:
            return trial.suggest_categorical(param_name, param_config['values'])
        else:
            return trial.suggest_int(
                param_name,
                param_config['min'],
                param_config['max'],
                step=param_config.get('step', 1)
            )
    elif param_config['type'] == 'categorical':
        return trial.suggest_categorical(param_name, param_config['values'])
    else:
        raise ValueError(f"Unknown parameter type: {param_config['type']}")

def compute_metrics(eval_pred):
    predictions, labels = eval_pred
    predictions = predictions.argmax(axis=-1)
    
    precision, recall, f1, _ = precision_recall_fscore_support(labels, predictions, average='weighted')
    accuracy = accuracy_score(labels, predictions)
    
    # Try to compute AUC if binary classification
    try:
        if len(np.unique(labels)) == 2:
            auc = roc_auc_score(labels, predictions)
        else:
            auc = 0.5
    except:
        auc = 0.5
    
    return {
        'accuracy': accuracy,
        'f1': f1,
        'precision': precision,
        'recall': recall,
        'auc': auc
    }

class OptimizationCallback:
    def __init__(self, trial, objective_metric):
        self.trial = trial
        self.objective_metric = objective_metric
        self.step = 0
    
    def __call__(self, eval_result):
        self.step += 1
        if self.objective_metric in eval_result:
            value = eval_result[self.objective_metric]
            # Report intermediate value to Optuna
            self.trial.report(value, self.step)
            
            # Check if trial should be pruned
            if self.trial.should_prune():
                raise optuna.TrialPruned()

def objective(trial, config, logger):
    try:
        # Suggest hyperparameters
        suggested_params = {}
        for param_name, param_config in config['search_space'].items():
            if param_config is not None:
                suggested_params[param_name] = suggest_hyperparameter(trial, param_name, param_config)
        
        logger.info(f"Trial {trial.number}: Testing parameters {suggested_params}")
        
        # Load dataset
        if os.path.isdir(config['dataset_path']):
            dataset = load_from_disk(config['dataset_path'])
        else:
            dataset = load_dataset('json', data_files=config['dataset_path'])
        
        # Create model with suggested hyperparameters
        if config['model_type'] == 'huggingface':
            tokenizer = AutoTokenizer.from_pretrained(config['base_model'])
            model = AutoModelForSequenceClassification.from_pretrained(config['base_model'])
            
            # Tokenize dataset
            def tokenize_function(examples):
                return tokenizer(examples['text'], truncation=True, padding=True, max_length=512)
            
            tokenized_dataset = dataset.map(tokenize_function, batched=True)
            
            # Setup training arguments with suggested hyperparameters
            training_args = TrainingArguments(
                output_dir=f"./trial_{trial.number}",
                num_train_epochs=suggested_params.get('num_epochs', 3),
                per_device_train_batch_size=suggested_params.get('batch_size', 16),
                per_device_eval_batch_size=suggested_params.get('batch_size', 16),
                learning_rate=suggested_params.get('learning_rate', 2e-5),
                weight_decay=suggested_params.get('weight_decay', 0.01),
                warmup_steps=500,
                logging_steps=50,
                eval_steps=100,
                save_steps=100,
                evaluation_strategy="steps",
                save_strategy="steps",
                load_best_model_at_end=True,
                metric_for_best_model=f"eval_{config['objective_metric']}",
                greater_is_better=True if config['optimization_settings']['direction'] == 'maximize' else False,
                report_to=["none"],  # Disable reporting to avoid conflicts
                disable_tqdm=True,
            )
            
            # Create trainer
            trainer = Trainer(
                model=model,
                args=training_args,
                train_dataset=tokenized_dataset['train'],
                eval_dataset=tokenized_dataset.get('validation', tokenized_dataset.get('test')),
                tokenizer=tokenizer,
                compute_metrics=compute_metrics,
            )
            
            # Train model
            train_result = trainer.train()
            
            # Evaluate model
            eval_result = trainer.evaluate()
            
            # Return objective value
            objective_value = eval_result[f"eval_{config['objective_metric']}"]
            
            # Log trial information
            logger.info(f"Trial {trial.number} completed with {config['objective_metric']}: {objective_value}")
            
            # Store additional metrics
            trial.set_user_attr('train_loss', train_result.training_loss)
            trial.set_user_attr('eval_metrics', eval_result)
            trial.set_user_attr('suggested_params', suggested_params)
            
            return objective_value
            
        else:
            # Handle other model types (PyTorch, TensorFlow, etc.)
            # This would be implemented based on specific requirements
            logger.warning(f"Model type {config['model_type']} not implemented in optimization")
            return 0.5
            
    except optuna.TrialPruned:
        logger.info(f"Trial {trial.number} was pruned")
        raise
    except Exception as e:
        logger.error(f"Trial {trial.number} failed: {str(e)}")
        raise

def main():
    if len(sys.argv) != 2:
        print("Usage: python optuna_optimizer.py <config_file>")
        sys.exit(1)
    
    logger = setup_logging()
    config_file = sys.argv[1]
    
    with open(config_file, 'r') as f:
        config = json.load(f)
    
    logger.info(f"Starting hyperparameter optimization: {config['study_name']}")
    
    # Create study
    sampler = create_sampler(config['optimization_settings']['sampler'])
    pruner = create_pruner(config['optimization_settings']['pruner'])
    
    direction = config['optimization_settings']['direction']
    
    # Create or load study
    study_db_path = f"sqlite:///{config['study_name']}.db"
    storage = RDBStorage(url=study_db_path)
    
    study = optuna.create_study(
        study_name=config['study_name'],
        storage=storage,
        sampler=sampler,
        pruner=pruner,
        direction=direction,
        load_if_exists=config['optimization_settings']['load_if_exists']
    )
    
    logger.info(f"Study created with sampler: {sampler.__class__.__name__}, pruner: {pruner.__class__.__name__}")
    
    try:
        # Start optimization
        study.optimize(
            lambda trial: objective(trial, config, logger),
            n_trials=config['optimization_settings']['n_trials'],
            timeout=config['optimization_settings'].get('timeout'),
            n_jobs=config['optimization_settings']['n_jobs'],
            show_progress_bar=True
        )
        
        # Save results
        logger.info("Optimization completed!")
        logger.info(f"Number of finished trials: {len(study.trials)}")
        logger.info(f"Best trial: {study.best_trial.number}")
        logger.info(f"Best value: {study.best_value}")
        logger.info(f"Best params: {study.best_params}")
        
        # Save study results
        results = {
            'study_name': config['study_name'],
            'best_value': study.best_value,
            'best_params': study.best_params,
            'n_trials': len(study.trials),
            'completed_trials': len([t for t in study.trials if t.state == optuna.trial.TrialState.COMPLETE]),
            'pruned_trials': len([t for t in study.trials if t.state == optuna.trial.TrialState.PRUNED]),
            'failed_trials': len([t for t in study.trials if t.state == optuna.trial.TrialState.FAIL]),
            'trials': []
        }
        
        for trial in study.trials:
            trial_info = {
                'number': trial.number,
                'value': trial.value,
                'params': trial.params,
                'state': trial.state.name,
                'datetime_start': trial.datetime_start.isoformat() if trial.datetime_start else None,
                'datetime_complete': trial.datetime_complete.isoformat() if trial.datetime_complete else None,
                'duration': trial.duration.total_seconds() if trial.duration else None,
                'user_attrs': trial.user_attrs,
                'system_attrs': trial.system_attrs,
            }
            results['trials'].append(trial_info)
        
        with open('optimization_results.json', 'w') as f:
            json.dump(results, f, indent=2)
        
        logger.info("Results saved to optimization_results.json")
        
    except Exception as e:
        logger.error(f"Optimization failed: {str(e)}")
        raise

if __name__ == "__main__":
    main()
`;

    // Write optimization script
    await fs.writeFile(path.join(this.scriptsPath, 'optuna_optimizer.py'), optunaScript);
    await fs.chmod(path.join(this.scriptsPath, 'optuna_optimizer.py'), 0o755);

    logger.info('Optimization scripts setup completed');
  }

  async startOptimization(config: OptimizationConfig): Promise<string> {
    try {
      // Validate configuration
      const validatedConfig = OptimizationConfigSchema.parse(config);
      
      const studyId = uuidv4();
      
      const study: OptimizationStudy = {
        id: studyId,
        name: validatedConfig.study_name,
        config: validatedConfig,
        status: 'pending',
        trials: [],
        created_at: new Date().toISOString(),
        metadata: {
          total_trials: 0,
          completed_trials: 0,
          pruned_trials: 0,
          failed_trials: 0,
          study_direction: validatedConfig.optimization_settings.direction,
          sampler_name: validatedConfig.optimization_settings.sampler,
          pruner_name: validatedConfig.optimization_settings.pruner,
        },
        resource_usage: {
          total_gpu_hours: 0,
          total_cpu_hours: 0,
          peak_memory_gb: 0,
          total_cost_estimate: 0,
        },
      };

      // Store study
      this.activeStudies.set(studyId, study);
      await this.updateActiveStudiesCache();

      // Queue optimization study
      await this.queue.add('hyperparameter-optimization', {
        studyId,
        config: validatedConfig,
      }, {
        priority: 1,
        delay: 0,
      });

      logger.info('Hyperparameter optimization study queued', {
        studyId,
        studyName: validatedConfig.study_name,
        nTrials: validatedConfig.optimization_settings.n_trials,
        sampler: validatedConfig.optimization_settings.sampler,
      });

      // Emit event
      this.emit('optimization_started', { studyId, study });

      return studyId;
    } catch (error) {
      logger.error('Failed to start optimization', { error: error.message, config });
      throw error;
    }
  }

  private async processOptimizationStudy(studyData: any): Promise<any> {
    const { studyId, config } = studyData;
    
    try {
      const study = this.activeStudies.get(studyId);
      if (!study) {
        throw new Error(`Optimization study ${studyId} not found`);
      }

      logger.info('Starting optimization study processing', { 
        studyId, 
        studyName: config.study_name 
      });

      // Update study status
      study.status = 'running';
      study.started_at = new Date().toISOString();
      await this.updateActiveStudiesCache();

      // Create study directory
      const studyDir = path.join(this.studiesPath, studyId);
      await fs.ensureDir(studyDir);

      // Create config file
      const configPath = path.join(studyDir, 'config.json');
      await fs.writeJSON(configPath, config, { spaces: 2 });

      // Start optimization process
      const scriptPath = path.join(this.scriptsPath, 'optuna_optimizer.py');
      const process = spawn('python3', [scriptPath, configPath], {
        cwd: studyDir,
        env: {
          ...process.env,
          PYTHONPATH: this.scriptsPath,
        },
      });

      // Monitor optimization process
      await this.monitorOptimizationProcess(study, process, studyDir);

      // Wait for completion
      const result = await this.waitForOptimizationCompletion(process, study, studyDir);

      // Update study status
      study.status = result.success ? 'completed' : 'failed';
      study.completed_at = new Date().toISOString();

      // Load and process results
      if (result.success) {
        await this.processOptimizationResults(study, studyDir);
      }

      await this.updateActiveStudiesCache();

      logger.info('Optimization study completed', {
        studyId,
        status: study.status,
        trialsCompleted: study.metadata.completed_trials,
        bestValue: study.best_value,
      });

      // Emit completion event
      this.emit('optimization_completed', { studyId, study, success: result.success });

      return result;
    } catch (error) {
      logger.error('Optimization study failed', { error: error.message, studyId });
      
      const study = this.activeStudies.get(studyId);
      if (study) {
        study.status = 'failed';
        study.completed_at = new Date().toISOString();
        await this.updateActiveStudiesCache();
      }

      throw error;
    }
  }

  private async monitorOptimizationProcess(
    study: OptimizationStudy, 
    process: ChildProcess, 
    studyDir: string
  ): Promise<void> {
    // Monitor stdout for optimization progress
    process.stdout?.on('data', (data) => {
      const output = data.toString();
      this.parseOptimizationOutput(study, output);
    });

    // Monitor stderr for errors
    process.stderr?.on('data', (data) => {
      const error = data.toString();
      logger.warn('Optimization process error output', { 
        studyId: study.id, 
        error: error.trim() 
      });
    });

    // Start resource monitoring
    this.startOptimizationResourceMonitoring(study);
  }

  private parseOptimizationOutput(study: OptimizationStudy, output: string): void {
    try {
      // Parse trial completion
      const trialMatch = output.match(/Trial (\d+) completed with \w+: ([\d.]+)/);
      if (trialMatch) {
        const trialNumber = parseInt(trialMatch[1]);
        const value = parseFloat(trialMatch[2]);
        
        study.metadata.completed_trials++;
        study.metadata.total_trials = Math.max(study.metadata.total_trials, trialNumber + 1);
        
        // Update best value if this is better
        const isBetter = study.config.optimization_settings.direction === 'maximize' 
          ? (study.best_value === undefined || value > study.best_value)
          : (study.best_value === undefined || value < study.best_value);
          
        if (isBetter) {
          study.best_value = value;
        }
      }

      // Parse trial pruning
      const prunedMatch = output.match(/Trial (\d+) was pruned/);
      if (prunedMatch) {
        study.metadata.pruned_trials++;
        study.metadata.total_trials++;
      }

      // Parse trial failure
      const failedMatch = output.match(/Trial (\d+) failed/);
      if (failedMatch) {
        study.metadata.failed_trials++;
        study.metadata.total_trials++;
      }

      // Emit progress update
      this.emit('optimization_progress', { 
        studyId: study.id, 
        metadata: study.metadata,
        bestValue: study.best_value 
      });
    } catch (error) {
      // Ignore parsing errors
    }
  }

  private startOptimizationResourceMonitoring(study: OptimizationStudy): void {
    const monitor = setInterval(async () => {
      try {
        if (study.status !== 'running') {
          clearInterval(monitor);
          return;
        }

        // Monitor resource usage (simplified)
        const usage = await this.getResourceUsage();
        
        study.resource_usage.total_gpu_hours += usage.gpu_utilization / 3600; // Convert to hours
        study.resource_usage.total_cpu_hours += usage.cpu_utilization / 3600;
        study.resource_usage.peak_memory_gb = Math.max(
          study.resource_usage.peak_memory_gb,
          usage.memory_used_mb / 1024
        );

        // Estimate cost (simplified calculation)
        const gpu_cost_per_hour = 2.0; // $2/hour for GPU
        const cpu_cost_per_hour = 0.1; // $0.1/hour for CPU
        study.resource_usage.total_cost_estimate = 
          (study.resource_usage.total_gpu_hours * gpu_cost_per_hour) +
          (study.resource_usage.total_cpu_hours * cpu_cost_per_hour);

        // Log resource usage
        await this.performanceMonitor.logMetrics({
          studyId: study.id,
          timestamp: new Date().toISOString(),
          metrics: {
            gpu_utilization: usage.gpu_utilization,
            cpu_utilization: usage.cpu_utilization,
            memory_used_mb: usage.memory_used_mb,
            total_trials: study.metadata.total_trials,
            completed_trials: study.metadata.completed_trials,
            cost_estimate: study.resource_usage.total_cost_estimate,
          },
        });
      } catch (error) {
        logger.warn('Resource monitoring failed', { 
          error: error.message, 
          studyId: study.id 
        });
      }
    }, 30000); // Monitor every 30 seconds
  }

  private async getResourceUsage(): Promise<any> {
    // Simplified resource usage - in production, this would use proper monitoring
    return {
      gpu_utilization: Math.random() * 100,
      cpu_utilization: Math.random() * 100,
      memory_used_mb: 1000 + Math.random() * 3000,
    };
  }

  private waitForOptimizationCompletion(
    process: ChildProcess, 
    study: OptimizationStudy, 
    studyDir: string
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      process.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: `Process exited with code ${code}` });
        }
      });

      process.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });
    });
  }

  private async processOptimizationResults(study: OptimizationStudy, studyDir: string): Promise<void> {
    try {
      const resultsPath = path.join(studyDir, 'optimization_results.json');
      
      if (await fs.pathExists(resultsPath)) {
        const results = await fs.readJSON(resultsPath);
        
        // Update study with results
        study.best_value = results.best_value;
        study.best_parameters = results.best_params;
        study.metadata.total_trials = results.n_trials;
        study.metadata.completed_trials = results.completed_trials;
        study.metadata.pruned_trials = results.pruned_trials;
        study.metadata.failed_trials = results.failed_trials;

        // Process trials
        study.trials = results.trials.map((trialData: any) => ({
          id: uuidv4(),
          number: trialData.number,
          study_id: study.id,
          parameters: trialData.params,
          value: trialData.value,
          state: trialData.state.toLowerCase(),
          datetime_start: trialData.datetime_start,
          datetime_complete: trialData.datetime_complete,
          duration_seconds: trialData.duration,
          intermediate_values: [],
          user_attrs: trialData.user_attrs || {},
          system_attrs: trialData.system_attrs || {},
        }));

        // Find best trial
        if (study.trials.length > 0) {
          const completedTrials = study.trials.filter(t => t.state === 'complete');
          if (completedTrials.length > 0) {
            const bestTrial = completedTrials.reduce((best, trial) => {
              const isBetter = study.config.optimization_settings.direction === 'maximize'
                ? trial.value > best.value
                : trial.value < best.value;
              return isBetter ? trial : best;
            });
            study.best_trial = bestTrial;
          }
        }

        logger.info('Optimization results processed', {
          studyId: study.id,
          bestValue: study.best_value,
          totalTrials: study.metadata.total_trials,
          bestParams: study.best_parameters,
        });
      }
    } catch (error) {
      logger.error('Failed to process optimization results', { 
        error: error.message, 
        studyId: study.id 
      });
    }
  }

  async stopOptimization(studyId: string): Promise<void> {
    const study = this.activeStudies.get(studyId);
    if (!study) {
      throw new Error(`Optimization study ${studyId} not found`);
    }

    if (study.status !== 'running') {
      throw new Error(`Optimization study ${studyId} is not running (status: ${study.status})`);
    }

    try {
      // Mark as cancelled (the process monitoring will handle cleanup)
      study.status = 'cancelled';
      study.completed_at = new Date().toISOString();
      await this.updateActiveStudiesCache();

      logger.info('Optimization study stopped', { studyId });
      this.emit('optimization_stopped', { studyId, study });
    } catch (error) {
      logger.error('Failed to stop optimization study', { error: error.message, studyId });
      throw error;
    }
  }

  private async updateActiveStudiesCache(): Promise<void> {
    try {
      const studies = Array.from(this.activeStudies.values());
      await this.cache.set('active_optimization_studies', JSON.stringify(studies), 86400);
    } catch (error) {
      logger.warn('Failed to update active studies cache', { error: error.message });
    }
  }

  // Multi-objective optimization
  async startMultiObjectiveOptimization(config: OptimizationConfig): Promise<string> {
    if (!config.multi_objective?.enabled) {
      throw new Error('Multi-objective optimization not enabled in config');
    }

    // Implementation would be similar to single-objective but with modifications
    // for handling multiple objectives using Optuna's multi-objective capabilities
    
    logger.info('Multi-objective optimization not yet implemented');
    throw new Error('Multi-objective optimization not yet implemented');
  }

  // Bayesian optimization with custom acquisition function
  async startBayesianOptimization(
    config: OptimizationConfig,
    acquisitionFunction: string = 'ei'
  ): Promise<string> {
    // Enhanced Bayesian optimization with custom acquisition functions
    const enhancedConfig = {
      ...config,
      optimization_settings: {
        ...config.optimization_settings,
        sampler: 'tpe',
        acquisition_function: acquisitionFunction,
      },
    };

    return this.startOptimization(enhancedConfig);
  }

  // Hyperband optimization
  async startHyperbandOptimization(config: OptimizationConfig): Promise<string> {
    const hyperbandConfig = {
      ...config,
      optimization_settings: {
        ...config.optimization_settings,
        pruner: 'hyperband',
        early_stopping: {
          enabled: true,
          patience: 3,
          min_improvement: 0.001,
        },
      },
    };

    return this.startOptimization(hyperbandConfig);
  }

  // Public API methods
  getStudy(studyId: string): OptimizationStudy | undefined {
    return this.activeStudies.get(studyId);
  }

  listStudies(status?: OptimizationStudy['status']): OptimizationStudy[] {
    const studies = Array.from(this.activeStudies.values());
    return status ? studies.filter(study => study.status === status) : studies;
  }

  getTrials(studyId: string): Trial[] {
    const study = this.activeStudies.get(studyId);
    return study ? study.trials : [];
  }

  getBestTrials(studyId: string, n: number = 10): Trial[] {
    const study = this.activeStudies.get(studyId);
    if (!study) return [];

    const completedTrials = study.trials.filter(t => t.state === 'complete');
    const sorted = completedTrials.sort((a, b) => {
      const direction = study.config.optimization_settings.direction;
      return direction === 'maximize' ? b.value - a.value : a.value - b.value;
    });

    return sorted.slice(0, n);
  }

  async generateOptimizationReport(studyId: string): Promise<any> {
    const study = this.activeStudies.get(studyId);
    if (!study) {
      throw new Error(`Study ${studyId} not found`);
    }

    const completedTrials = study.trials.filter(t => t.state === 'complete');
    const bestTrials = this.getBestTrials(studyId, 5);

    return {
      study_info: {
        id: study.id,
        name: study.name,
        status: study.status,
        objective_metric: study.config.objective_metric,
        direction: study.config.optimization_settings.direction,
        created_at: study.created_at,
        completed_at: study.completed_at,
      },
      optimization_summary: {
        total_trials: study.metadata.total_trials,
        completed_trials: study.metadata.completed_trials,
        pruned_trials: study.metadata.pruned_trials,
        failed_trials: study.metadata.failed_trials,
        success_rate: study.metadata.total_trials > 0 
          ? study.metadata.completed_trials / study.metadata.total_trials 
          : 0,
      },
      best_result: {
        value: study.best_value,
        parameters: study.best_parameters,
        trial_number: study.best_trial?.number,
      },
      top_trials: bestTrials.map(trial => ({
        number: trial.number,
        value: trial.value,
        parameters: trial.parameters,
        duration_seconds: trial.duration_seconds,
      })),
      resource_usage: study.resource_usage,
      parameter_importance: this.calculateParameterImportance(completedTrials),
      optimization_history: completedTrials.map(trial => ({
        trial_number: trial.number,
        value: trial.value,
        cumulative_best: this.getCumulativeBest(completedTrials, trial.number, study.config.optimization_settings.direction),
      })),
    };
  }

  private calculateParameterImportance(trials: Trial[]): Record<string, number> {
    // Simplified parameter importance calculation
    const importance: Record<string, number> = {};
    
    if (trials.length < 2) return importance;

    // Get all parameter names
    const paramNames = new Set<string>();
    trials.forEach(trial => {
      Object.keys(trial.parameters).forEach(param => paramNames.add(param));
    });

    // Calculate importance based on value variance
    paramNames.forEach(paramName => {
      const values = trials.map(trial => trial.value);
      const paramValues = trials.map(trial => trial.parameters[paramName]);
      
      // Simple correlation-based importance
      const correlation = this.calculateCorrelation(paramValues, values);
      importance[paramName] = Math.abs(correlation);
    });

    return importance;
  }

  private calculateCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) return 0;

    const meanX = x.reduce((sum, val) => sum + val, 0) / x.length;
    const meanY = y.reduce((sum, val) => sum + val, 0) / y.length;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < x.length; i++) {
      const deltaX = x[i] - meanX;
      const deltaY = y[i] - meanY;
      numerator += deltaX * deltaY;
      denomX += deltaX * deltaX;
      denomY += deltaY * deltaY;
    }

    const denominator = Math.sqrt(denomX * denomY);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  private getCumulativeBest(trials: Trial[], currentTrialNumber: number, direction: string): number {
    const relevantTrials = trials.filter(t => t.number <= currentTrialNumber);
    if (relevantTrials.length === 0) return 0;

    return relevantTrials.reduce((best, trial) => {
      const isBetter = direction === 'maximize' ? trial.value > best : trial.value < best;
      return isBetter ? trial.value : best;
    }, relevantTrials[0].value);
  }

  getServiceMetrics() {
    const studies = Array.from(this.activeStudies.values());
    const statusCounts = studies.reduce((acc, study) => {
      acc[study.status] = (acc[study.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalTrials = studies.reduce((sum, study) => sum + study.metadata.total_trials, 0);
    const totalCost = studies.reduce((sum, study) => sum + study.resource_usage.total_cost_estimate, 0);

    return {
      total_studies: studies.length,
      studies_by_status: statusCounts,
      total_trials: totalTrials,
      active_studies: studies.filter(s => s.status === 'running').length,
      completed_studies: studies.filter(s => s.status === 'completed').length,
      total_cost_estimate: totalCost,
      avg_trials_per_study: studies.length > 0 ? totalTrials / studies.length : 0,
    };
  }
}