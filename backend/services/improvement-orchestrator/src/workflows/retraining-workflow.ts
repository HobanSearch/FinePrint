/**
 * Retraining workflow for model improvement
 */

import { proxyActivities, sleep, workflowInfo } from '@temporalio/workflow';
import type * as activities from '../activities';
import {
  ModelType,
  ModelTrainingConfig,
  TrainingDataset,
  DataEnhancement,
  ValidationResult,
  PerformanceMetrics
} from '../types';

const {
  prepareTrainingData,
  enhanceDataset,
  configureHyperparameters,
  initializeTraining,
  runTrainingEpoch,
  evaluateCheckpoint,
  saveModelCheckpoint,
  finalizeModel,
  cleanupResources
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
  heartbeatTimeout: '1 minute',
  retry: {
    initialInterval: '10 seconds',
    backoffCoefficient: 2,
    maximumInterval: '5 minutes',
    maximumAttempts: 3
  }
});

export interface RetrainingWorkflowInput {
  modelType: ModelType;
  baseModelId: string;
  improvements: any[];
  datasetEnhancements: DataEnhancement[];
  hyperparameterSearch: boolean;
  validationStrategy: 'holdout' | 'cross_validation' | 'temporal';
  maxTrainingTime: number; // milliseconds
  earlyStoppingPatience: number;
  checkpointFrequency: number; // epochs
}

export interface RetrainingWorkflowOutput {
  modelId: string;
  finalMetrics: PerformanceMetrics;
  trainingHistory: TrainingHistory;
  bestCheckpoint: string;
  totalTrainingTime: number;
}

interface TrainingHistory {
  epochs: EpochMetrics[];
  bestEpoch: number;
  convergenceRate: number;
  overfittingDetected: boolean;
}

interface EpochMetrics {
  epoch: number;
  loss: number;
  validationLoss: number;
  metrics: Record<string, number>;
  learningRate: number;
  duration: number;
}

export async function RetrainingWorkflow(
  input: RetrainingWorkflowInput
): Promise<RetrainingWorkflowOutput> {
  const { workflowId } = workflowInfo();
  const startTime = Date.now();
  
  let currentModelId = input.baseModelId;
  let bestModelId = currentModelId;
  let bestMetrics: PerformanceMetrics | null = null;
  let bestLoss = Infinity;
  let epochsSinceImprovement = 0;
  const trainingHistory: TrainingHistory = {
    epochs: [],
    bestEpoch: 0,
    convergenceRate: 0,
    overfittingDetected: false
  };

  try {
    // Step 1: Prepare and enhance training data
    const baseDataset = await prepareTrainingData({
      modelType: input.modelType,
      baseModelId: input.baseModelId,
      filters: [],
      sampleSize: 100000
    });

    const enhancedDataset: TrainingDataset = await enhanceDataset({
      dataset: baseDataset,
      enhancements: input.datasetEnhancements,
      augmentationStrategies: [
        { type: 'noise_injection', probability: 0.1, parameters: { stddev: 0.01 } },
        { type: 'synonym_replacement', probability: 0.2, parameters: { num_replacements: 3 } },
        { type: 'back_translation', probability: 0.15, parameters: { languages: ['es', 'fr', 'de'] } }
      ]
    });

    // Step 2: Configure hyperparameters
    let trainingConfig: ModelTrainingConfig;
    
    if (input.hyperparameterSearch) {
      trainingConfig = await configureHyperparameters({
        modelType: input.modelType,
        dataset: enhancedDataset,
        searchSpace: {
          learningRate: [0.0001, 0.001, 0.01],
          batchSize: [16, 32, 64],
          dropout: [0.1, 0.2, 0.3],
          hiddenLayers: [2, 3, 4],
          hiddenUnits: [128, 256, 512]
        },
        searchStrategy: 'bayesian',
        trials: 20
      });
    } else {
      trainingConfig = {
        modelType: input.modelType,
        baseModel: input.baseModelId,
        trainingData: enhancedDataset,
        hyperparameters: {
          optimizer: 'adamw',
          schedulerType: 'cosine_annealing',
          warmupSteps: 500,
          weightDecay: 0.01,
          gradientClipping: 1.0,
          dropout: 0.2
        },
        validationSplit: 0.2,
        epochs: 100,
        batchSize: 32,
        learningRate: 0.001,
        optimizations: ['mixed_precision', 'gradient_accumulation', 'data_parallel']
      };
    }

    // Step 3: Initialize training
    const trainingSession = await initializeTraining({
      config: trainingConfig,
      workflowId,
      resumeFromCheckpoint: null
    });

    // Step 4: Training loop
    for (let epoch = 1; epoch <= trainingConfig.epochs; epoch++) {
      const epochStartTime = Date.now();
      
      // Check if we've exceeded max training time
      if (Date.now() - startTime > input.maxTrainingTime) {
        console.log(`Max training time reached at epoch ${epoch}`);
        break;
      }

      // Run training epoch
      const epochResult = await runTrainingEpoch({
        sessionId: trainingSession.id,
        epoch,
        config: trainingConfig
      });

      // Evaluate checkpoint
      const evaluation = await evaluateCheckpoint({
        sessionId: trainingSession.id,
        epoch,
        validationStrategy: input.validationStrategy
      });

      const epochMetrics: EpochMetrics = {
        epoch,
        loss: epochResult.loss,
        validationLoss: epochResult.validationLoss,
        metrics: evaluation.metrics,
        learningRate: epochResult.learningRate,
        duration: Date.now() - epochStartTime
      };

      trainingHistory.epochs.push(epochMetrics);

      // Check for improvement
      if (epochResult.validationLoss < bestLoss) {
        bestLoss = epochResult.validationLoss;
        bestMetrics = evaluation.performanceMetrics;
        trainingHistory.bestEpoch = epoch;
        epochsSinceImprovement = 0;

        // Save checkpoint if this is the best so far
        if (epoch % input.checkpointFrequency === 0 || epochResult.validationLoss < bestLoss * 0.95) {
          bestModelId = await saveModelCheckpoint({
            sessionId: trainingSession.id,
            epoch,
            metrics: evaluation.performanceMetrics,
            isBest: true
          });
        }
      } else {
        epochsSinceImprovement++;
      }

      // Early stopping check
      if (epochsSinceImprovement >= input.earlyStoppingPatience) {
        console.log(`Early stopping triggered at epoch ${epoch}`);
        trainingHistory.convergenceRate = epoch / trainingConfig.epochs;
        break;
      }

      // Overfitting detection
      const overfittingRatio = epochResult.validationLoss / epochResult.loss;
      if (overfittingRatio > 1.5) {
        trainingHistory.overfittingDetected = true;
        console.warn(`Overfitting detected at epoch ${epoch}`);
        
        // Apply regularization
        trainingConfig.hyperparameters.dropout = Math.min(0.5, trainingConfig.hyperparameters.dropout * 1.2);
        trainingConfig.hyperparameters.weightDecay = trainingConfig.hyperparameters.weightDecay * 1.5;
      }

      // Periodic progress update
      if (epoch % 10 === 0) {
        console.log(`Epoch ${epoch}/${trainingConfig.epochs} - Loss: ${epochResult.loss.toFixed(4)}, Val Loss: ${epochResult.validationLoss.toFixed(4)}`);
      }

      // Allow workflow to be interrupted gracefully
      await sleep('100ms');
    }

    // Step 5: Finalize the best model
    const finalModelId = await finalizeModel({
      sessionId: trainingSession.id,
      bestCheckpointId: bestModelId,
      metadata: {
        workflowId,
        modelType: input.modelType,
        baseModelId: input.baseModelId,
        improvements: input.improvements,
        trainingHistory,
        finalMetrics: bestMetrics
      }
    });

    // Step 6: Cleanup resources
    await cleanupResources({
      sessionId: trainingSession.id,
      keepBestCheckpoint: true
    });

    return {
      modelId: finalModelId,
      finalMetrics: bestMetrics!,
      trainingHistory,
      bestCheckpoint: bestModelId,
      totalTrainingTime: Date.now() - startTime
    };

  } catch (error) {
    console.error('Retraining workflow failed:', error);
    
    // Attempt cleanup on failure
    try {
      await cleanupResources({
        sessionId: workflowId,
        keepBestCheckpoint: false
      });
    } catch (cleanupError) {
      console.error('Cleanup failed:', cleanupError);
    }
    
    throw error;
  }
}