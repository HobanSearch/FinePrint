/**
 * Main improvement workflow for orchestrating model improvements
 */

import { proxyActivities, sleep, workflowInfo, condition } from '@temporalio/workflow';
import type * as activities from '../activities';
import {
  WorkflowContext,
  WorkflowResult,
  WorkflowStatus,
  ImprovementPlan,
  ModelValidation,
  DeploymentConfig,
  ImprovementResult,
  FailureAnalysis,
  ABTestFailure,
  ModelType,
  ImprovementPriority
} from '../types';

// Configure activities with retry policies
const {
  detectABTestFailure,
  analyzeFailure,
  generateImprovementPlan,
  executeImprovement,
  retrainModel,
  validateModel,
  deployModel,
  rollbackDeployment,
  monitorPerformance,
  notifyStakeholders,
  updateMetrics,
  saveWorkflowState
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  retry: {
    initialInterval: '1 second',
    backoffCoefficient: 2,
    maximumInterval: '1 minute',
    maximumAttempts: 3,
    nonRetryableErrorTypes: ['ValidationError', 'AuthenticationError']
  }
});

// Long-running activities
const {
  retrainModelLongRunning
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 hours',
  heartbeatTimeout: '30 seconds',
  retry: {
    initialInterval: '10 seconds',
    backoffCoefficient: 2,
    maximumInterval: '5 minutes',
    maximumAttempts: 2
  }
});

export interface ModelImprovementWorkflowInput {
  modelType: ModelType;
  failureId: string;
  priority: ImprovementPriority;
  autoApprove: boolean;
  maxRetries: number;
  notificationChannels: string[];
}

export async function ModelImprovementWorkflow(
  input: ModelImprovementWorkflowInput
): Promise<WorkflowResult> {
  const { workflowId, runId } = workflowInfo();
  const startTime = new Date();

  const context: WorkflowContext = {
    workflowId,
    modelType: input.modelType,
    failureId: input.failureId,
    priority: input.priority,
    startTime,
    metadata: {
      runId,
      autoApprove: input.autoApprove,
      maxRetries: input.maxRetries
    }
  };

  const improvementResults: ImprovementResult[] = [];
  let currentStatus: WorkflowStatus = WorkflowStatus.RUNNING;
  let deployedModelId: string | undefined;
  let performanceMetrics: any;

  try {
    // Step 1: Detect and verify A/B test failure
    await notifyStakeholders({
      workflowId,
      status: 'started',
      message: `Starting improvement workflow for ${input.modelType} model`,
      channels: input.notificationChannels
    });

    const failure: ABTestFailure = await detectABTestFailure({
      failureId: input.failureId,
      modelType: input.modelType
    });

    // Step 2: Analyze failure root causes
    const analysis: FailureAnalysis = await analyzeFailure({
      failure,
      includeHistorical: true,
      depth: 'comprehensive'
    });

    await saveWorkflowState({
      workflowId,
      stage: 'analysis_complete',
      data: { failure, analysis }
    });

    // Step 3: Generate improvement plan
    const plan: ImprovementPlan = await generateImprovementPlan({
      analysis,
      modelType: input.modelType,
      priority: input.priority,
      constraints: {
        maxDuration: 24 * 60 * 60 * 1000, // 24 hours
        maxCost: 1000,
        requiresApproval: !input.autoApprove
      }
    });

    // Step 4: Request approval if needed
    if (plan.approvalRequired && !input.autoApprove) {
      await notifyStakeholders({
        workflowId,
        status: 'approval_required',
        message: 'Improvement plan requires approval',
        channels: input.notificationChannels,
        data: { plan }
      });

      // Wait for approval signal (max 1 hour)
      const approved = await condition(
        () => context.metadata.approved === true,
        '1 hour'
      );

      if (!approved) {
        throw new Error('Approval timeout - workflow cancelled');
      }
    }

    // Step 5: Execute improvements sequentially
    for (const improvement of plan.improvements) {
      try {
        const result = await executeImprovement({
          improvement,
          context,
          timeout: improvement.estimatedDuration
        });

        improvementResults.push(result);

        // Update metrics after each improvement
        await updateMetrics({
          workflowId,
          improvementId: improvement.id,
          metrics: result.metrics
        });

      } catch (error) {
        console.error(`Improvement ${improvement.id} failed:`, error);
        
        // Decide whether to continue or abort
        if (improvement.dependencies.length > 0) {
          throw new Error(`Critical improvement failed: ${improvement.id}`);
        }
        
        improvementResults.push({
          improvementId: improvement.id,
          type: improvement.type,
          status: 'failed',
          metrics: {},
          duration: 0,
          details: { error: error.message }
        });
      }
    }

    // Step 6: Retrain model with improvements
    await notifyStakeholders({
      workflowId,
      status: 'retraining',
      message: 'Starting model retraining with improvements',
      channels: input.notificationChannels
    });

    const newModelId = await retrainModelLongRunning({
      modelType: input.modelType,
      baseModelId: failure.modelVersion,
      improvements: improvementResults.filter(r => r.status === 'completed'),
      trainingConfig: {
        epochs: 100,
        batchSize: 32,
        learningRate: 0.001,
        validationSplit: 0.2
      }
    });

    await saveWorkflowState({
      workflowId,
      stage: 'retraining_complete',
      data: { newModelId }
    });

    // Step 7: Validate the new model
    const validation: ModelValidation = await validateModel({
      modelId: newModelId,
      modelType: input.modelType,
      baselineModelId: failure.modelVersion,
      validationSuite: 'comprehensive'
    });

    if (!validation.passed) {
      // Retry training with adjusted parameters
      if (context.metadata.retryCount < input.maxRetries) {
        context.metadata.retryCount = (context.metadata.retryCount || 0) + 1;
        
        await notifyStakeholders({
          workflowId,
          status: 'retrying',
          message: `Validation failed, retrying (${context.metadata.retryCount}/${input.maxRetries})`,
          channels: input.notificationChannels
        });

        // Recursive retry with adjusted parameters
        return await ModelImprovementWorkflow({
          ...input,
          maxRetries: input.maxRetries - 1
        });
      }

      throw new Error('Model validation failed after all retries');
    }

    // Step 8: Deploy the validated model
    const deploymentConfig: DeploymentConfig = {
      modelId: newModelId,
      modelType: input.modelType,
      strategy: input.priority === ImprovementPriority.CRITICAL ? 'blue_green' : 'canary',
      targetEnvironment: 'production',
      rolloutStages: [
        { name: 'canary', percentage: 5, duration: 3600000, validationCriteria: [], automaticPromotion: true },
        { name: 'partial', percentage: 25, duration: 7200000, validationCriteria: [], automaticPromotion: true },
        { name: 'majority', percentage: 50, duration: 10800000, validationCriteria: [], automaticPromotion: true },
        { name: 'full', percentage: 100, duration: 0, validationCriteria: [], automaticPromotion: false }
      ],
      healthChecks: [
        {
          name: 'model_health',
          endpoint: `/health/${newModelId}`,
          interval: 30000,
          timeout: 5000,
          successThreshold: 3,
          failureThreshold: 2
        }
      ],
      monitoring: {
        metrics: ['latency', 'throughput', 'error_rate', 'conversion_rate'],
        alertThresholds: [],
        dashboardUrl: `http://localhost:3000/dashboard/${workflowId}`,
        logLevel: 'info',
        tracingEnabled: true
      },
      rollbackConditions: {
        conditions: [
          { metric: 'error_rate', operator: 'gt', value: 0.05 },
          { metric: 'latency_p99', operator: 'gt', value: 1000 }
        ],
        threshold: 1,
        evaluationPeriod: 300000
      }
    };

    const deploymentResult = await deployModel({
      config: deploymentConfig,
      validationResults: validation
    });

    deployedModelId = newModelId;

    // Step 9: Monitor initial performance
    await sleep('5 minutes'); // Initial monitoring period

    performanceMetrics = await monitorPerformance({
      modelId: newModelId,
      duration: 300000,
      metrics: ['conversion_rate', 'latency', 'error_rate']
    });

    // Check if rollback is needed
    const needsRollback = performanceMetrics.conversion_rate < failure.failureMetrics.expectedRate * 0.9;

    if (needsRollback) {
      await rollbackDeployment({
        deploymentId: deploymentResult.deploymentId,
        reason: 'Performance regression detected',
        restoreModelId: failure.modelVersion
      });

      currentStatus = WorkflowStatus.ROLLBACK;
      deployedModelId = undefined;

      await notifyStakeholders({
        workflowId,
        status: 'rolled_back',
        message: 'Deployment rolled back due to performance regression',
        channels: input.notificationChannels,
        data: { performanceMetrics }
      });
    } else {
      currentStatus = WorkflowStatus.COMPLETED;

      await notifyStakeholders({
        workflowId,
        status: 'completed',
        message: `Successfully deployed improved ${input.modelType} model`,
        channels: input.notificationChannels,
        data: { 
          modelId: newModelId,
          improvements: validation.comparisonWithBaseline.improvements,
          performanceMetrics 
        }
      });
    }

    // Step 10: Save final state
    await saveWorkflowState({
      workflowId,
      stage: 'completed',
      data: {
        status: currentStatus,
        modelId: deployedModelId,
        metrics: performanceMetrics
      }
    });

  } catch (error) {
    currentStatus = WorkflowStatus.FAILED;
    
    await notifyStakeholders({
      workflowId,
      status: 'failed',
      message: `Workflow failed: ${error.message}`,
      channels: input.notificationChannels,
      data: { error: error.toString() }
    });

    // Attempt cleanup
    if (deployedModelId) {
      try {
        await rollbackDeployment({
          deploymentId: 'emergency',
          reason: 'Workflow failure',
          restoreModelId: input.failureId
        });
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }
    }

    throw error;
  }

  const endTime = new Date();
  const duration = endTime.getTime() - startTime.getTime();

  return {
    workflowId,
    status: currentStatus,
    modelId: deployedModelId,
    improvements: improvementResults,
    deploymentResult: deployedModelId ? {
      deploymentId: `deploy_${deployedModelId}`,
      status: currentStatus === WorkflowStatus.ROLLBACK ? 'rolled_back' : 'success',
      deployedVersion: deployedModelId || '',
      rolloutPercentage: 100,
      healthStatus: 'healthy',
      metrics: performanceMetrics || {}
    } : undefined,
    performanceMetrics,
    duration,
    completedAt: endTime
  };
}

// Signal handlers for manual intervention
export const approveSignal = 'approve';
export const rejectSignal = 'reject';
export const rollbackSignal = 'rollback';

export async function handleApprovalSignal(): Promise<void> {
  const context = workflowInfo();
  context.memo.approved = true;
}

export async function handleRejectionSignal(): Promise<void> {
  const context = workflowInfo();
  context.memo.approved = false;
}

export async function handleRollbackSignal(): Promise<void> {
  const context = workflowInfo();
  context.memo.rollbackRequested = true;
}