import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { EventEmitter } from 'events';
import axios from 'axios';
import { spawn } from 'child_process';
import { TrainingConfig, TrainingResponse } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { DataPipeline } from './data-pipeline.js';
import { LoRATrainer } from './lora-trainer.js';
import { MLXTrainer } from './mlx-trainer.js';

export class TrainingOrchestrator extends EventEmitter {
  private prisma: PrismaClient;
  private redis: Redis;
  private trainingQueue: Queue;
  private worker: Worker | null = null;
  private dataPipeline: DataPipeline;
  private loraTrainer: LoRATrainer;
  private mlxTrainer: MLXTrainer;
  private activeRuns: Map<string, any> = new Map();
  private resourceMonitor: NodeJS.Timer | null = null;

  constructor(
    prisma: PrismaClient,
    redis: Redis,
    config?: {
      maxConcurrentRuns?: number;
      checkpointInterval?: number;
      resourceCheckInterval?: number;
    }
  ) {
    super();
    this.prisma = prisma;
    this.redis = redis;
    
    // Initialize components
    this.dataPipeline = new DataPipeline(prisma, redis);
    this.loraTrainer = new LoRATrainer(prisma, redis);
    this.mlxTrainer = new MLXTrainer(prisma, redis);

    // Initialize training queue
    this.trainingQueue = new Queue('model-training', {
      connection: redis,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 86400, // 24 hours
        },
      },
    });

    this.initializeWorker(config);
    this.startResourceMonitor(config?.resourceCheckInterval);
  }

  private initializeWorker(config?: any): void {
    this.worker = new Worker(
      'model-training',
      async (job) => {
        return await this.executeTrainingRun(job.data);
      },
      {
        connection: this.redis,
        concurrency: config?.maxConcurrentRuns || 2,
        limiter: {
          max: 5,
          duration: 60000, // 5 runs per minute max
        },
      }
    );

    this.worker.on('completed', (job) => {
      logger.info('Training run completed', { jobId: job.id, runId: job.returnvalue?.runId });
      this.emit('training:completed', job.returnvalue);
    });

    this.worker.on('failed', (job, err) => {
      logger.error('Training run failed', { jobId: job?.id, error: err.message });
      this.emit('training:failed', { jobId: job?.id, error: err });
    });

    this.worker.on('progress', (job, progress) => {
      this.emit('training:progress', { jobId: job.id, progress });
    });
  }

  private startResourceMonitor(interval: number = 30000): void {
    this.resourceMonitor = setInterval(async () => {
      await this.checkResourceAvailability();
      await this.optimizeResourceAllocation();
    }, interval);
  }

  async startTraining(config: TrainingConfig): Promise<TrainingResponse> {
    try {
      // Validate configuration
      await this.validateTrainingConfig(config);

      // Check resource availability
      const resourcesAvailable = await this.checkResourceAvailability();
      if (!resourcesAvailable) {
        return {
          runId: '',
          status: 'queued',
          message: 'Insufficient resources, training queued',
        };
      }

      // Create training run record
      const run = await this.prisma.trainingRun.create({
        data: {
          modelType: config.modelType,
          baseModel: config.baseModel,
          datasetId: config.datasetId,
          hyperparams: config.hyperparameters as any,
          optimizer: 'adamw',
          learningRate: config.hyperparameters.learningRate,
          batchSize: config.hyperparameters.batchSize,
          epochs: config.hyperparameters.epochs,
          loraRank: config.loraConfig?.rank,
          loraAlpha: config.loraConfig?.alpha,
          loraModules: config.loraConfig?.targetModules || [],
          status: 'QUEUED',
          startTime: new Date(),
          trainingLoss: [],
          validationLoss: [],
          metrics: {},
        },
      });

      // Add to training queue
      const job = await this.trainingQueue.add('train', {
        runId: run.id,
        config,
      }, {
        priority: this.calculatePriority(config),
      });

      return {
        runId: run.id,
        status: 'queued',
        estimatedTime: await this.estimateTrainingTime(config),
      };
    } catch (error) {
      logger.error('Failed to start training', { error, config });
      throw error;
    }
  }

  private async executeTrainingRun(data: any): Promise<any> {
    const { runId, config } = data;
    
    try {
      // Update status to training
      await this.prisma.trainingRun.update({
        where: { id: runId },
        data: { status: 'TRAINING' },
      });

      this.activeRuns.set(runId, {
        config,
        startTime: Date.now(),
        process: null,
      });

      // Prepare training data
      const datasetPath = await this.dataPipeline.prepareDataset(config.datasetId);

      // Select trainer based on config
      let result;
      if (config.loraConfig) {
        result = await this.loraTrainer.train(runId, config, datasetPath);
      } else if (process.platform === 'darwin' && config.resources?.gpuType === 'apple') {
        result = await this.mlxTrainer.train(runId, config, datasetPath);
      } else {
        result = await this.runStandardTraining(runId, config, datasetPath);
      }

      // Update training run with results
      await this.prisma.trainingRun.update({
        where: { id: runId },
        data: {
          status: 'COMPLETED',
          endTime: new Date(),
          modelPath: result.modelPath,
          metrics: result.metrics,
          trainingLoss: result.trainingLoss,
          validationLoss: result.validationLoss,
        },
      });

      // Trigger automatic evaluation
      await this.triggerEvaluation(runId, result.modelPath);

      this.activeRuns.delete(runId);
      
      return {
        runId,
        status: 'completed',
        modelPath: result.modelPath,
        metrics: result.metrics,
      };
    } catch (error) {
      logger.error('Training execution failed', { error, runId });
      
      await this.prisma.trainingRun.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          endTime: new Date(),
          metrics: { error: (error as Error).message },
        },
      });
      
      this.activeRuns.delete(runId);
      throw error;
    }
  }

  private async runStandardTraining(
    runId: string,
    config: TrainingConfig,
    datasetPath: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const args = [
        'train.py',
        '--model', config.modelType,
        '--dataset', datasetPath,
        '--learning-rate', config.hyperparameters.learningRate.toString(),
        '--batch-size', config.hyperparameters.batchSize.toString(),
        '--epochs', config.hyperparameters.epochs.toString(),
        '--output-dir', `/models/${runId}`,
      ];

      if (config.hyperparameters.warmupSteps) {
        args.push('--warmup-steps', config.hyperparameters.warmupSteps.toString());
      }

      const process = spawn('python', args, {
        cwd: '/app/training',
        env: {
          ...process.env,
          CUDA_VISIBLE_DEVICES: '0',
          PYTORCH_CUDA_ALLOC_CONF: 'max_split_size_mb:512',
        },
      });

      const runData = this.activeRuns.get(runId);
      if (runData) {
        runData.process = process;
      }

      let output = '';
      let metrics: any = {};
      let trainingLoss: number[] = [];
      let validationLoss: number[] = [];

      process.stdout.on('data', (data) => {
        output += data.toString();
        
        // Parse training progress
        const progressMatch = data.toString().match(/Epoch (\d+)\/(\d+).*Loss: ([\d.]+)/);
        if (progressMatch) {
          const [, current, total, loss] = progressMatch;
          const progress = (parseInt(current) / parseInt(total)) * 100;
          
          trainingLoss.push(parseFloat(loss));
          
          this.worker?.updateProgress(progress);
          this.emit('training:epoch', {
            runId,
            epoch: parseInt(current),
            loss: parseFloat(loss),
          });
        }

        // Parse validation metrics
        const valMatch = data.toString().match(/Validation - Loss: ([\d.]+), Accuracy: ([\d.]+)/);
        if (valMatch) {
          const [, loss, accuracy] = valMatch;
          validationLoss.push(parseFloat(loss));
          metrics.validation_accuracy = parseFloat(accuracy);
        }
      });

      process.stderr.on('data', (data) => {
        logger.warn('Training stderr', { runId, data: data.toString() });
      });

      process.on('close', (code) => {
        if (code === 0) {
          // Parse final metrics from output
          const metricsMatch = output.match(/Final metrics: ({.*})/);
          if (metricsMatch) {
            try {
              metrics = { ...metrics, ...JSON.parse(metricsMatch[1]) };
            } catch (e) {
              logger.warn('Failed to parse metrics', { error: e });
            }
          }

          resolve({
            modelPath: `/models/${runId}/model.bin`,
            metrics,
            trainingLoss,
            validationLoss,
          });
        } else {
          reject(new Error(`Training process exited with code ${code}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async validateTrainingConfig(config: TrainingConfig): Promise<void> {
    // Check dataset exists
    const dataset = await this.prisma.trainingDataset.findUnique({
      where: { id: config.datasetId },
    });

    if (!dataset) {
      throw new Error(`Dataset ${config.datasetId} not found`);
    }

    // Validate hyperparameters
    if (config.hyperparameters.learningRate > 0.1) {
      logger.warn('High learning rate detected', { 
        lr: config.hyperparameters.learningRate 
      });
    }

    // Check LoRA configuration
    if (config.loraConfig) {
      if (config.loraConfig.rank > 64) {
        logger.warn('High LoRA rank may impact performance', {
          rank: config.loraConfig.rank,
        });
      }
    }

    // Validate resource requirements
    if (config.resources) {
      const available = await this.getAvailableResources();
      
      if (config.resources.gpuMemory && 
          available.gpuMemory < config.resources.gpuMemory) {
        throw new Error('Insufficient GPU memory');
      }
      
      if (config.resources.maxMemory && 
          available.memory < config.resources.maxMemory) {
        throw new Error('Insufficient system memory');
      }
    }
  }

  private async checkResourceAvailability(): Promise<boolean> {
    const resources = await this.getAvailableResources();
    
    // Check minimum requirements
    if (resources.gpuMemory < 4096) { // 4GB minimum
      logger.warn('Low GPU memory available', { memory: resources.gpuMemory });
      return false;
    }
    
    if (resources.memory < 8192) { // 8GB minimum
      logger.warn('Low system memory available', { memory: resources.memory });
      return false;
    }
    
    // Check if too many runs are active
    if (this.activeRuns.size >= 3) {
      logger.warn('Too many active training runs', { count: this.activeRuns.size });
      return false;
    }
    
    return true;
  }

  private async getAvailableResources(): Promise<any> {
    // Get GPU info
    let gpuMemory = 0;
    try {
      const { stdout } = await new Promise<any>((resolve, reject) => {
        const proc = spawn('nvidia-smi', ['--query-gpu=memory.free', '--format=csv,noheader,nounits']);
        let output = '';
        proc.stdout.on('data', (data) => output += data);
        proc.on('close', (code) => {
          if (code === 0) resolve({ stdout: output });
          else reject(new Error('nvidia-smi failed'));
        });
      });
      gpuMemory = parseInt(stdout.trim());
    } catch (error) {
      // Fallback for Apple Silicon
      if (process.platform === 'darwin') {
        gpuMemory = 16384; // Assume 16GB for M1/M2
      }
    }

    // Get system memory
    const os = await import('os');
    const memory = Math.floor(os.freemem() / 1024 / 1024);
    const cpus = os.cpus().length;

    return {
      gpuMemory,
      memory,
      cpus,
      activeRuns: this.activeRuns.size,
    };
  }

  private async optimizeResourceAllocation(): Promise<void> {
    const resources = await this.getAvailableResources();
    
    for (const [runId, runData] of this.activeRuns.entries()) {
      // Adjust batch size based on available memory
      if (resources.gpuMemory < 2048 && runData.config.hyperparameters.batchSize > 8) {
        logger.info('Reducing batch size due to low memory', { runId });
        // Signal training process to reduce batch size
        await this.redis.publish(`training:${runId}:control`, JSON.stringify({
          command: 'reduce_batch_size',
          value: 8,
        }));
      }
      
      // Implement gradient accumulation if needed
      if (resources.gpuMemory < 4096) {
        await this.redis.publish(`training:${runId}:control`, JSON.stringify({
          command: 'enable_gradient_accumulation',
          steps: 4,
        }));
      }
    }
  }

  private calculatePriority(config: TrainingConfig): number {
    let priority = 0;
    
    // Higher priority for smaller models
    if (config.modelType === 'phi2') priority += 10;
    else if (config.modelType === 'mistral') priority += 5;
    
    // Higher priority for LoRA fine-tuning
    if (config.loraConfig) priority += 15;
    
    // Higher priority for fewer epochs
    if (config.hyperparameters.epochs <= 3) priority += 10;
    
    return priority;
  }

  private async estimateTrainingTime(config: TrainingConfig): Promise<number> {
    // Base estimates in minutes
    const baseTime: Record<string, number> = {
      phi2: 30,
      mistral: 60,
      llama2: 120,
      mixtral: 180,
    };
    
    let estimate = baseTime[config.modelType] || 60;
    
    // Adjust for epochs
    estimate *= (config.hyperparameters.epochs / 10);
    
    // Adjust for LoRA (faster)
    if (config.loraConfig) {
      estimate *= 0.3;
    }
    
    // Adjust for batch size
    estimate *= (32 / config.hyperparameters.batchSize);
    
    // Add queue wait time
    const queueLength = await this.trainingQueue.count();
    estimate += queueLength * 5;
    
    return Math.round(estimate);
  }

  private async triggerEvaluation(runId: string, modelPath: string): Promise<void> {
    try {
      // Call evaluation service
      await axios.post('http://localhost:3005/evaluate', {
        runId,
        modelPath,
        evaluationType: 'comprehensive',
      });
      
      logger.info('Evaluation triggered', { runId });
    } catch (error) {
      logger.error('Failed to trigger evaluation', { error, runId });
    }
  }

  async pauseTraining(runId: string): Promise<void> {
    const runData = this.activeRuns.get(runId);
    if (runData?.process) {
      runData.process.kill('SIGTSTP'); // Pause signal
      
      await this.prisma.trainingRun.update({
        where: { id: runId },
        data: { status: 'QUEUED' }, // Mark as paused
      });
      
      logger.info('Training paused', { runId });
    }
  }

  async resumeTraining(runId: string): Promise<void> {
    const runData = this.activeRuns.get(runId);
    if (runData?.process) {
      runData.process.kill('SIGCONT'); // Continue signal
      
      await this.prisma.trainingRun.update({
        where: { id: runId },
        data: { status: 'TRAINING' },
      });
      
      logger.info('Training resumed', { runId });
    }
  }

  async cancelTraining(runId: string): Promise<void> {
    const runData = this.activeRuns.get(runId);
    if (runData?.process) {
      runData.process.kill('SIGTERM');
      
      await this.prisma.trainingRun.update({
        where: { id: runId },
        data: { 
          status: 'CANCELLED',
          endTime: new Date(),
        },
      });
      
      this.activeRuns.delete(runId);
      logger.info('Training cancelled', { runId });
    }
  }

  async getTrainingStatus(runId: string): Promise<any> {
    const run = await this.prisma.trainingRun.findUnique({
      where: { id: runId },
      include: {
        dataset: true,
        evaluations: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
    });
    
    if (!run) {
      throw new Error(`Training run ${runId} not found`);
    }
    
    const activeData = this.activeRuns.get(runId);
    
    return {
      ...run,
      isActive: !!activeData,
      runtime: activeData ? Date.now() - activeData.startTime : null,
      estimatedTimeRemaining: activeData ? 
        await this.estimateRemainingTime(runId) : null,
    };
  }

  private async estimateRemainingTime(runId: string): Promise<number> {
    const run = await this.prisma.trainingRun.findUnique({
      where: { id: runId },
    });
    
    if (!run) return 0;
    
    const activeData = this.activeRuns.get(runId);
    if (!activeData) return 0;
    
    const elapsed = Date.now() - activeData.startTime;
    const currentEpoch = run.trainingLoss.length;
    const totalEpochs = run.epochs;
    
    if (currentEpoch === 0) return 0;
    
    const timePerEpoch = elapsed / currentEpoch;
    const remainingEpochs = totalEpochs - currentEpoch;
    
    return Math.round((timePerEpoch * remainingEpochs) / 60000); // Return in minutes
  }

  async shutdown(): Promise<void> {
    // Cancel all active runs
    for (const runId of this.activeRuns.keys()) {
      await this.cancelTraining(runId);
    }
    
    if (this.resourceMonitor) {
      clearInterval(this.resourceMonitor);
    }
    
    await this.worker?.close();
    await this.trainingQueue.close();
  }
}