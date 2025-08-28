/**
 * Model retraining activities for improving AI models
 */

import { Context } from '@temporalio/activity';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import {
  ModelType,
  ModelTrainingConfig,
  TrainingDataset,
  DataEnhancement,
  DataFilter,
  DataAugmentation,
  PerformanceMetrics,
  ImprovementResult
} from '../types';

export interface RetrainModelInput {
  modelType: ModelType;
  baseModelId: string;
  improvements: ImprovementResult[];
  trainingConfig: {
    epochs: number;
    batchSize: number;
    learningRate: number;
    validationSplit: number;
  };
}

export async function retrainModel(
  input: RetrainModelInput
): Promise<string> {
  const { heartbeat } = Context.current();
  const modelId = `model_${input.modelType}_${uuidv4()}`;
  
  try {
    await heartbeat();

    // Call Ollama service to retrain model
    const response = await axios.post(
      `${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/train`,
      {
        modelId,
        baseModel: input.baseModelId,
        modelType: input.modelType,
        config: input.trainingConfig,
        improvements: input.improvements
      },
      {
        timeout: 2 * 60 * 60 * 1000 // 2 hour timeout
      }
    );

    return response.data.modelId;

  } catch (error) {
    console.error('Failed to retrain model:', error);
    throw error;
  }
}

export async function retrainModelLongRunning(
  input: RetrainModelInput
): Promise<string> {
  const { heartbeat } = Context.current();
  const modelId = `model_${input.modelType}_${uuidv4()}`;
  const trainingSessionId = `session_${uuidv4()}`;
  
  try {
    // Initialize training session
    await initializeTrainingSession(trainingSessionId, modelId, input);

    // Training loop with heartbeats
    for (let epoch = 1; epoch <= input.trainingConfig.epochs; epoch++) {
      await heartbeat({ epoch, total: input.trainingConfig.epochs });

      // Train one epoch
      await trainEpoch(trainingSessionId, epoch, input.trainingConfig);

      // Check early stopping
      const shouldStop = await checkEarlyStopping(trainingSessionId, epoch);
      if (shouldStop) {
        console.log(`Early stopping at epoch ${epoch}`);
        break;
      }

      // Save checkpoint every 10 epochs
      if (epoch % 10 === 0) {
        await saveCheckpoint(trainingSessionId, modelId, epoch);
      }
    }

    // Finalize training
    await finalizeTraining(trainingSessionId, modelId);

    return modelId;

  } catch (error) {
    console.error('Long-running retraining failed:', error);
    // Cleanup on failure
    await cleanupTrainingSession(trainingSessionId);
    throw error;
  }
}

async function initializeTrainingSession(
  sessionId: string,
  modelId: string,
  input: RetrainModelInput
): Promise<void> {
  try {
    await axios.post(
      `${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/training/sessions`,
      {
        sessionId,
        modelId,
        baseModel: input.baseModelId,
        modelType: input.modelType,
        config: input.trainingConfig,
        improvements: input.improvements
      }
    );
  } catch (error) {
    throw new Error(`Failed to initialize training session: ${error.message}`);
  }
}

async function trainEpoch(
  sessionId: string,
  epoch: number,
  config: any
): Promise<void> {
  try {
    await axios.post(
      `${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/training/sessions/${sessionId}/epoch`,
      {
        epoch,
        batchSize: config.batchSize,
        learningRate: config.learningRate * Math.pow(0.95, epoch - 1) // Learning rate decay
      }
    );
  } catch (error) {
    throw new Error(`Failed to train epoch ${epoch}: ${error.message}`);
  }
}

async function checkEarlyStopping(
  sessionId: string,
  epoch: number
): Promise<boolean> {
  try {
    const response = await axios.get(
      `${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/training/sessions/${sessionId}/metrics`
    );

    const metrics = response.data;
    
    // Check if validation loss hasn't improved in last 5 epochs
    if (metrics.epochsSinceImprovement > 5) {
      return true;
    }

    // Check if we've reached good enough performance
    if (metrics.validationAccuracy > 0.95) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('Failed to check early stopping:', error);
    return false;
  }
}

async function saveCheckpoint(
  sessionId: string,
  modelId: string,
  epoch: number
): Promise<void> {
  try {
    await axios.post(
      `${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/training/sessions/${sessionId}/checkpoint`,
      {
        modelId,
        epoch,
        checkpointName: `checkpoint_epoch_${epoch}`
      }
    );
  } catch (error) {
    console.error(`Failed to save checkpoint at epoch ${epoch}:`, error);
  }
}

async function finalizeTraining(
  sessionId: string,
  modelId: string
): Promise<void> {
  try {
    await axios.post(
      `${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/training/sessions/${sessionId}/finalize`,
      {
        modelId,
        saveLocation: `/models/${modelId}`
      }
    );
  } catch (error) {
    throw new Error(`Failed to finalize training: ${error.message}`);
  }
}

async function cleanupTrainingSession(sessionId: string): Promise<void> {
  try {
    await axios.delete(
      `${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/training/sessions/${sessionId}`
    );
  } catch (error) {
    console.error('Failed to cleanup training session:', error);
  }
}

export interface PrepareTrainingDataInput {
  modelType: ModelType;
  baseModelId: string;
  filters: DataFilter[];
  sampleSize: number;
}

export async function prepareTrainingData(
  input: PrepareTrainingDataInput
): Promise<TrainingDataset> {
  const { heartbeat } = Context.current();
  
  try {
    await heartbeat();

    // Fetch training data from appropriate source
    const rawData = await fetchTrainingData(input.modelType, input.sampleSize);

    // Apply filters
    const filteredData = applyFilters(rawData, input.filters);

    // Analyze dataset characteristics
    const features = extractFeatures(filteredData);

    return {
      sourceDatasets: [`${input.modelType}_training_data`],
      enhancements: [],
      filters: input.filters,
      augmentations: [],
      totalSamples: filteredData.length,
      features
    };

  } catch (error) {
    console.error('Failed to prepare training data:', error);
    throw error;
  }
}

async function fetchTrainingData(
  modelType: ModelType,
  sampleSize: number
): Promise<any[]> {
  // Simulate fetching data from database or API
  const data = [];
  for (let i = 0; i < sampleSize; i++) {
    data.push({
      id: i,
      input: `Sample input ${i}`,
      output: `Sample output ${i}`,
      metadata: {
        modelType,
        timestamp: new Date().toISOString()
      }
    });
  }
  return data;
}

function applyFilters(data: any[], filters: DataFilter[]): any[] {
  return data.filter(item => {
    for (const filter of filters) {
      const value = item[filter.field];
      
      switch (filter.operator) {
        case 'eq':
          if (value !== filter.value) return false;
          break;
        case 'gt':
          if (value <= filter.value) return false;
          break;
        case 'lt':
          if (value >= filter.value) return false;
          break;
        case 'contains':
          if (!value.includes(filter.value)) return false;
          break;
      }
    }
    return true;
  });
}

function extractFeatures(data: any[]): string[] {
  if (data.length === 0) return [];
  
  // Extract all unique keys from the data
  const features = new Set<string>();
  
  for (const item of data) {
    Object.keys(item).forEach(key => features.add(key));
  }
  
  return Array.from(features);
}

export interface EnhanceDatasetInput {
  dataset: TrainingDataset;
  enhancements: DataEnhancement[];
  augmentationStrategies: DataAugmentation[];
}

export async function enhanceDataset(
  input: EnhanceDatasetInput
): Promise<TrainingDataset> {
  const { heartbeat } = Context.current();
  
  try {
    await heartbeat();

    let enhancedDataset = { ...input.dataset };

    // Apply enhancements
    for (const enhancement of input.enhancements) {
      enhancedDataset = await applyEnhancement(enhancedDataset, enhancement);
    }

    // Apply augmentations
    for (const augmentation of input.augmentationStrategies) {
      enhancedDataset = await applyAugmentation(enhancedDataset, augmentation);
    }

    return enhancedDataset;

  } catch (error) {
    console.error('Failed to enhance dataset:', error);
    throw error;
  }
}

async function applyEnhancement(
  dataset: TrainingDataset,
  enhancement: DataEnhancement
): Promise<TrainingDataset> {
  const enhancedDataset = { ...dataset };
  
  switch (enhancement.type) {
    case 'synthetic_generation':
      enhancedDataset.totalSamples += enhancement.addedSamples;
      enhancedDataset.enhancements.push(enhancement);
      break;
      
    case 'class_balancing':
      // Balance classes in dataset
      enhancedDataset.enhancements.push(enhancement);
      break;
      
    case 'outlier_removal':
      // Remove outliers
      enhancedDataset.totalSamples *= 0.95; // Assume 5% outliers removed
      enhancedDataset.enhancements.push(enhancement);
      break;
  }
  
  return enhancedDataset;
}

async function applyAugmentation(
  dataset: TrainingDataset,
  augmentation: DataAugmentation
): Promise<TrainingDataset> {
  const augmentedDataset = { ...dataset };
  
  switch (augmentation.type) {
    case 'noise_injection':
      augmentedDataset.augmentations.push(augmentation);
      break;
      
    case 'synonym_replacement':
      augmentedDataset.augmentations.push(augmentation);
      break;
      
    case 'back_translation':
      augmentedDataset.augmentations.push(augmentation);
      break;
  }
  
  return augmentedDataset;
}

export interface ConfigureHyperparametersInput {
  modelType: ModelType;
  dataset: TrainingDataset;
  searchSpace: Record<string, any[]>;
  searchStrategy: 'grid' | 'random' | 'bayesian';
  trials: number;
}

export async function configureHyperparameters(
  input: ConfigureHyperparametersInput
): Promise<ModelTrainingConfig> {
  const { heartbeat } = Context.current();
  
  try {
    await heartbeat();

    // Perform hyperparameter search
    const bestParams = await performHyperparameterSearch(
      input.searchSpace,
      input.searchStrategy,
      input.trials
    );

    return {
      modelType: input.modelType,
      baseModel: 'llama2-7b', // Default base model
      trainingData: input.dataset,
      hyperparameters: bestParams,
      validationSplit: 0.2,
      epochs: bestParams.epochs || 100,
      batchSize: bestParams.batchSize || 32,
      learningRate: bestParams.learningRate || 0.001,
      optimizations: ['mixed_precision', 'gradient_accumulation']
    };

  } catch (error) {
    console.error('Failed to configure hyperparameters:', error);
    throw error;
  }
}

async function performHyperparameterSearch(
  searchSpace: Record<string, any[]>,
  strategy: string,
  trials: number
): Promise<Record<string, any>> {
  // Simulate hyperparameter search
  const bestParams: Record<string, any> = {};
  
  // For simplicity, just pick random values from search space
  for (const [param, values] of Object.entries(searchSpace)) {
    bestParams[param] = values[Math.floor(Math.random() * values.length)];
  }
  
  return bestParams;
}

export interface InitializeTrainingInput {
  config: ModelTrainingConfig;
  workflowId: string;
  resumeFromCheckpoint: string | null;
}

export async function initializeTraining(
  input: InitializeTrainingInput
): Promise<{ id: string }> {
  const sessionId = `training_${uuidv4()}`;
  
  try {
    await axios.post(
      `${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/training/initialize`,
      {
        sessionId,
        config: input.config,
        workflowId: input.workflowId,
        checkpoint: input.resumeFromCheckpoint
      }
    );

    return { id: sessionId };
  } catch (error) {
    throw new Error(`Failed to initialize training: ${error.message}`);
  }
}

export interface RunTrainingEpochInput {
  sessionId: string;
  epoch: number;
  config: ModelTrainingConfig;
}

export async function runTrainingEpoch(
  input: RunTrainingEpochInput
): Promise<any> {
  try {
    const response = await axios.post(
      `${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/training/epoch`,
      {
        sessionId: input.sessionId,
        epoch: input.epoch,
        batchSize: input.config.batchSize,
        learningRate: input.config.learningRate
      }
    );

    return response.data;
  } catch (error) {
    throw new Error(`Failed to run training epoch: ${error.message}`);
  }
}

export interface EvaluateCheckpointInput {
  sessionId: string;
  epoch: number;
  validationStrategy: string;
}

export async function evaluateCheckpoint(
  input: EvaluateCheckpointInput
): Promise<any> {
  try {
    const response = await axios.post(
      `${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/training/evaluate`,
      {
        sessionId: input.sessionId,
        epoch: input.epoch,
        strategy: input.validationStrategy
      }
    );

    return response.data;
  } catch (error) {
    throw new Error(`Failed to evaluate checkpoint: ${error.message}`);
  }
}

export interface SaveModelCheckpointInput {
  sessionId: string;
  epoch: number;
  metrics: PerformanceMetrics;
  isBest: boolean;
}

export async function saveModelCheckpoint(
  input: SaveModelCheckpointInput
): Promise<string> {
  const checkpointId = `checkpoint_${uuidv4()}`;
  
  try {
    await axios.post(
      `${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/training/checkpoint`,
      {
        sessionId: input.sessionId,
        checkpointId,
        epoch: input.epoch,
        metrics: input.metrics,
        isBest: input.isBest
      }
    );

    return checkpointId;
  } catch (error) {
    throw new Error(`Failed to save checkpoint: ${error.message}`);
  }
}

export interface FinalizeModelInput {
  sessionId: string;
  bestCheckpointId: string;
  metadata: Record<string, any>;
}

export async function finalizeModel(
  input: FinalizeModelInput
): Promise<string> {
  const modelId = `model_${uuidv4()}`;
  
  try {
    await axios.post(
      `${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/training/finalize`,
      {
        sessionId: input.sessionId,
        modelId,
        checkpointId: input.bestCheckpointId,
        metadata: input.metadata
      }
    );

    return modelId;
  } catch (error) {
    throw new Error(`Failed to finalize model: ${error.message}`);
  }
}

export interface CleanupResourcesInput {
  sessionId: string;
  keepBestCheckpoint: boolean;
}

export async function cleanupResources(
  input: CleanupResourcesInput
): Promise<void> {
  try {
    await axios.post(
      `${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/training/cleanup`,
      {
        sessionId: input.sessionId,
        keepBestCheckpoint: input.keepBestCheckpoint
      }
    );
  } catch (error) {
    console.error('Failed to cleanup resources:', error);
  }
}