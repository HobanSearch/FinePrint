/**
 * Failure detection activities for identifying model performance issues
 */

import { Context } from '@temporalio/activity';
import axios from 'axios';
import { ABTestFailure, ModelType, FailureMetrics } from '../types';
import * as ss from 'simple-statistics';

export interface DetectABTestFailureInput {
  failureId?: string;
  modelType: ModelType;
  experimentId?: string;
  lookbackPeriod?: number; // milliseconds
}

export async function detectABTestFailure(
  input: DetectABTestFailureInput
): Promise<ABTestFailure> {
  const { heartbeat } = Context.current();
  
  try {
    // If we have a specific failure ID, fetch it
    if (input.failureId) {
      return await fetchFailureById(input.failureId);
    }

    // Otherwise, detect failures from recent experiments
    const failures = await detectRecentFailures(
      input.modelType,
      input.lookbackPeriod || 24 * 60 * 60 * 1000 // Default 24 hours
    );

    if (failures.length === 0) {
      throw new Error(`No failures detected for ${input.modelType} model`);
    }

    // Return the most critical failure
    return failures.sort((a, b) => b.failureMetrics.businessImpact - a.failureMetrics.businessImpact)[0];

  } catch (error) {
    console.error('Failed to detect A/B test failure:', error);
    throw error;
  }
}

async function fetchFailureById(failureId: string): Promise<ABTestFailure> {
  try {
    // Fetch from digital twin service
    const response = await axios.get(
      `${process.env.DIGITAL_TWIN_URL || 'http://localhost:3007'}/api/experiments/failures/${failureId}`
    );

    return mapToABTestFailure(response.data);
  } catch (error) {
    throw new Error(`Failed to fetch failure ${failureId}: ${error.message}`);
  }
}

async function detectRecentFailures(
  modelType: ModelType,
  lookbackPeriod: number
): Promise<ABTestFailure[]> {
  try {
    const endTime = Date.now();
    const startTime = endTime - lookbackPeriod;

    // Fetch recent experiment results
    const response = await axios.get(
      `${process.env.DIGITAL_TWIN_URL || 'http://localhost:3007'}/api/experiments/results`,
      {
        params: {
          modelType,
          startTime,
          endTime,
          status: 'completed'
        }
      }
    );

    const experiments = response.data.experiments || [];
    const failures: ABTestFailure[] = [];

    for (const experiment of experiments) {
      const failure = analyzeExperimentForFailure(experiment);
      if (failure) {
        failures.push(failure);
      }
    }

    return failures;
  } catch (error) {
    throw new Error(`Failed to detect recent failures: ${error.message}`);
  }
}

function analyzeExperimentForFailure(experiment: any): ABTestFailure | null {
  const { control, variant, metrics, metadata } = experiment;
  
  // Calculate statistical significance
  const controlConversions = control.conversions || 0;
  const controlSamples = control.samples || 1;
  const variantConversions = variant.conversions || 0;
  const variantSamples = variant.samples || 1;

  const controlRate = controlConversions / controlSamples;
  const variantRate = variantConversions / variantSamples;

  // Perform two-proportion z-test
  const pooledProportion = (controlConversions + variantConversions) / (controlSamples + variantSamples);
  const standardError = Math.sqrt(
    pooledProportion * (1 - pooledProportion) * (1/controlSamples + 1/variantSamples)
  );
  
  const zScore = (variantRate - controlRate) / standardError;
  const pValue = 2 * (1 - normalCDF(Math.abs(zScore)));
  const confidenceLevel = 1 - pValue;

  // Check if variant significantly underperformed
  const relativeChange = (variantRate - controlRate) / controlRate;
  const isFailure = relativeChange < -0.05 && confidenceLevel > 0.95; // 5% drop with 95% confidence

  if (!isFailure) {
    return null;
  }

  // Calculate business impact
  const expectedDailyVolume = 10000; // Estimated daily volume
  const averageValue = 100; // Average transaction value
  const dailyLoss = Math.abs(relativeChange) * expectedDailyVolume * averageValue * variantRate;
  const businessImpact = dailyLoss * 30; // 30-day impact

  return {
    id: `fail_${experiment.id}_${Date.now()}`,
    modelType: experiment.modelType,
    modelVersion: variant.modelId,
    experimentId: experiment.id,
    failureMetrics: {
      conversionRate: variantRate,
      expectedRate: controlRate,
      variance: Math.abs(relativeChange),
      confidenceLevel,
      sampleSize: variantSamples,
      duration: experiment.duration || 0,
      businessImpact
    },
    timestamp: new Date(),
    context: {
      experimentName: experiment.name,
      controlModelId: control.modelId,
      variantModelId: variant.modelId,
      metadata
    }
  };
}

function normalCDF(z: number): number {
  // Approximation of the cumulative distribution function for standard normal distribution
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - prob : prob;
}

function mapToABTestFailure(data: any): ABTestFailure {
  return {
    id: data.id,
    modelType: data.modelType,
    modelVersion: data.modelVersion,
    experimentId: data.experimentId,
    failureMetrics: {
      conversionRate: data.metrics.conversionRate,
      expectedRate: data.metrics.expectedRate,
      variance: data.metrics.variance,
      confidenceLevel: data.metrics.confidenceLevel,
      sampleSize: data.metrics.sampleSize,
      duration: data.metrics.duration,
      businessImpact: data.metrics.businessImpact
    },
    timestamp: new Date(data.timestamp),
    context: data.context || {}
  };
}

export interface MonitorExperimentsInput {
  modelTypes: ModelType[];
  checkInterval: number; // milliseconds
  alertThreshold: number; // Number of failures before alert
}

export async function monitorExperiments(
  input: MonitorExperimentsInput
): Promise<void> {
  const { heartbeat } = Context.current();
  const failureCounts = new Map<ModelType, number>();

  while (true) {
    await heartbeat();

    for (const modelType of input.modelTypes) {
      try {
        const failures = await detectRecentFailures(modelType, input.checkInterval);
        
        if (failures.length > 0) {
          const currentCount = failureCounts.get(modelType) || 0;
          failureCounts.set(modelType, currentCount + failures.length);

          if (failureCounts.get(modelType)! >= input.alertThreshold) {
            // Trigger improvement workflow
            await triggerImprovementWorkflow(modelType, failures[0]);
            failureCounts.set(modelType, 0); // Reset counter
          }
        }
      } catch (error) {
        console.error(`Error monitoring ${modelType}:`, error);
      }
    }

    await new Promise(resolve => setTimeout(resolve, input.checkInterval));
  }
}

async function triggerImprovementWorkflow(
  modelType: ModelType,
  failure: ABTestFailure
): Promise<void> {
  try {
    await axios.post(
      `${process.env.ORCHESTRATOR_URL || 'http://localhost:3010'}/api/workflows/improve-model`,
      {
        modelType,
        failureId: failure.id,
        priority: failure.failureMetrics.businessImpact > 100000 ? 'critical' : 'high',
        autoApprove: false,
        notificationChannels: ['email', 'slack']
      }
    );
  } catch (error) {
    console.error('Failed to trigger improvement workflow:', error);
  }
}