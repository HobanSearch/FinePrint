/**
 * Deployment workflow for safe model rollout
 */

import { proxyActivities, sleep, workflowInfo, condition } from '@temporalio/workflow';
import type * as activities from '../activities';
import {
  DeploymentConfig,
  DeploymentStrategy,
  RolloutStage,
  HealthCheck,
  ValidationCriteria,
  DeploymentResult,
  ModelType
} from '../types';

const {
  prepareDeployment,
  deployToEnvironment,
  runHealthChecks,
  validateDeployment,
  promoteDeployment,
  rollbackDeployment,
  updateTrafficSplit,
  monitorDeployment,
  notifyDeploymentStatus,
  recordDeploymentMetrics
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  retry: {
    initialInterval: '5 seconds',
    backoffCoefficient: 2,
    maximumInterval: '1 minute',
    maximumAttempts: 3
  }
});

export interface DeploymentWorkflowInput {
  modelId: string;
  modelType: ModelType;
  strategy: DeploymentStrategy;
  environment: string;
  autoPromote: boolean;
  rollbackOnFailure: boolean;
  notificationChannels: string[];
  customValidation?: ValidationCriteria[];
}

export interface DeploymentWorkflowOutput {
  deploymentId: string;
  status: 'success' | 'failed' | 'rolled_back' | 'partial';
  finalVersion: string;
  rolloutPercentage: number;
  metrics: DeploymentMetrics;
  issues: DeploymentIssue[];
}

interface DeploymentMetrics {
  latency: LatencyMetrics;
  throughput: number;
  errorRate: number;
  successRate: number;
  resourceUtilization: ResourceMetrics;
  businessMetrics: Record<string, number>;
}

interface LatencyMetrics {
  p50: number;
  p95: number;
  p99: number;
  mean: number;
}

interface ResourceMetrics {
  cpu: number;
  memory: number;
  network: number;
  storage: number;
}

interface DeploymentIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  stage: string;
  description: string;
  timestamp: Date;
  resolved: boolean;
}

export async function DeploymentWorkflow(
  input: DeploymentWorkflowInput
): Promise<DeploymentWorkflowOutput> {
  const { workflowId } = workflowInfo();
  const deploymentId = `deploy_${workflowId}_${Date.now()}`;
  const issues: DeploymentIssue[] = [];
  let currentRolloutPercentage = 0;
  let deploymentStatus: 'success' | 'failed' | 'rolled_back' | 'partial' = 'partial';
  let currentVersion = input.modelId;
  const startTime = Date.now();

  try {
    // Step 1: Prepare deployment
    await notifyDeploymentStatus({
      deploymentId,
      status: 'preparing',
      message: `Preparing deployment of ${input.modelType} model ${input.modelId}`,
      channels: input.notificationChannels
    });

    const preparation = await prepareDeployment({
      modelId: input.modelId,
      modelType: input.modelType,
      environment: input.environment,
      strategy: input.strategy
    });

    if (!preparation.ready) {
      throw new Error(`Deployment preparation failed: ${preparation.reason}`);
    }

    // Step 2: Execute deployment based on strategy
    switch (input.strategy) {
      case DeploymentStrategy.BLUE_GREEN:
        return await executeBlueGreenDeployment(input, deploymentId, issues);
      
      case DeploymentStrategy.CANARY:
        return await executeCanaryDeployment(input, deploymentId, issues);
      
      case DeploymentStrategy.ROLLING:
        return await executeRollingDeployment(input, deploymentId, issues);
      
      case DeploymentStrategy.IMMEDIATE:
        return await executeImmediateDeployment(input, deploymentId, issues);
      
      default:
        throw new Error(`Unknown deployment strategy: ${input.strategy}`);
    }

  } catch (error) {
    console.error('Deployment workflow failed:', error);
    
    // Attempt rollback if configured
    if (input.rollbackOnFailure && currentRolloutPercentage > 0) {
      try {
        await rollbackDeployment({
          deploymentId,
          reason: `Deployment failed: ${error.message}`,
          restoreVersion: preparation.previousVersion
        });
        
        deploymentStatus = 'rolled_back';
        
        await notifyDeploymentStatus({
          deploymentId,
          status: 'rolled_back',
          message: `Deployment rolled back due to: ${error.message}`,
          channels: input.notificationChannels
        });
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
        deploymentStatus = 'failed';
        issues.push({
          severity: 'critical',
          stage: 'rollback',
          description: `Rollback failed: ${rollbackError.message}`,
          timestamp: new Date(),
          resolved: false
        });
      }
    } else {
      deploymentStatus = 'failed';
    }
    
    throw error;
  }
}

async function executeBlueGreenDeployment(
  input: DeploymentWorkflowInput,
  deploymentId: string,
  issues: DeploymentIssue[]
): Promise<DeploymentWorkflowOutput> {
  let metrics: DeploymentMetrics | null = null;
  
  try {
    // Deploy to green environment
    await deployToEnvironment({
      deploymentId,
      modelId: input.modelId,
      environment: `${input.environment}-green`,
      percentage: 100
    });

    // Run health checks on green
    const healthStatus = await runHealthChecks({
      deploymentId,
      environment: `${input.environment}-green`,
      checks: [
        {
          name: 'model_ready',
          endpoint: '/health/ready',
          interval: 5000,
          timeout: 3000,
          successThreshold: 3,
          failureThreshold: 2
        },
        {
          name: 'model_live',
          endpoint: '/health/live',
          interval: 5000,
          timeout: 3000,
          successThreshold: 3,
          failureThreshold: 2
        }
      ],
      maxWaitTime: 60000
    });

    if (!healthStatus.healthy) {
      throw new Error('Green environment health checks failed');
    }

    // Validate green environment
    const validation = await validateDeployment({
      deploymentId,
      environment: `${input.environment}-green`,
      criteria: input.customValidation || [
        { metric: 'latency_p99', threshold: 1000, evaluationWindow: 60000 },
        { metric: 'error_rate', threshold: 0.01, evaluationWindow: 60000 }
      ]
    });

    if (!validation.passed) {
      issues.push({
        severity: 'high',
        stage: 'validation',
        description: `Validation failed: ${validation.failureReason}`,
        timestamp: new Date(),
        resolved: false
      });
      
      if (input.rollbackOnFailure) {
        throw new Error('Green environment validation failed');
      }
    }

    // Switch traffic to green
    await updateTrafficSplit({
      deploymentId,
      splits: [
        { environment: `${input.environment}-green`, percentage: 100 },
        { environment: `${input.environment}-blue`, percentage: 0 }
      ]
    });

    // Monitor for stability
    await sleep('2 minutes');
    
    metrics = await monitorDeployment({
      deploymentId,
      duration: 120000,
      metrics: ['latency', 'throughput', 'error_rate', 'conversion_rate']
    });

    // Record final metrics
    await recordDeploymentMetrics({
      deploymentId,
      metrics,
      status: 'success'
    });

    return {
      deploymentId,
      status: 'success',
      finalVersion: input.modelId,
      rolloutPercentage: 100,
      metrics,
      issues
    };

  } catch (error) {
    throw error;
  }
}

async function executeCanaryDeployment(
  input: DeploymentWorkflowInput,
  deploymentId: string,
  issues: DeploymentIssue[]
): Promise<DeploymentWorkflowOutput> {
  const stages: RolloutStage[] = [
    { name: 'canary', percentage: 5, duration: 300000, validationCriteria: [], automaticPromotion: true },
    { name: 'early', percentage: 10, duration: 600000, validationCriteria: [], automaticPromotion: true },
    { name: 'partial', percentage: 25, duration: 900000, validationCriteria: [], automaticPromotion: true },
    { name: 'majority', percentage: 50, duration: 1200000, validationCriteria: [], automaticPromotion: input.autoPromote },
    { name: 'full', percentage: 100, duration: 0, validationCriteria: [], automaticPromotion: input.autoPromote }
  ];

  let currentPercentage = 0;
  let metrics: DeploymentMetrics | null = null;

  for (const stage of stages) {
    try {
      // Deploy to percentage of traffic
      await deployToEnvironment({
        deploymentId,
        modelId: input.modelId,
        environment: input.environment,
        percentage: stage.percentage
      });

      currentPercentage = stage.percentage;

      await notifyDeploymentStatus({
        deploymentId,
        status: 'progressing',
        message: `Canary deployment at ${stage.percentage}% (${stage.name})`,
        channels: input.notificationChannels
      });

      // Update traffic split
      await updateTrafficSplit({
        deploymentId,
        splits: [
          { environment: `${input.environment}-canary`, percentage: stage.percentage },
          { environment: `${input.environment}-stable`, percentage: 100 - stage.percentage }
        ]
      });

      // Wait and monitor
      if (stage.duration > 0) {
        await sleep(stage.duration);
        
        // Monitor metrics during this stage
        metrics = await monitorDeployment({
          deploymentId,
          duration: Math.min(stage.duration, 300000),
          metrics: ['latency', 'throughput', 'error_rate', 'conversion_rate']
        });

        // Validate stage
        const validation = await validateDeployment({
          deploymentId,
          environment: input.environment,
          criteria: stage.validationCriteria.length > 0 ? stage.validationCriteria : [
            { metric: 'error_rate', threshold: 0.02, evaluationWindow: 60000 },
            { metric: 'latency_p99', threshold: 1500, evaluationWindow: 60000 }
          ]
        });

        if (!validation.passed) {
          issues.push({
            severity: 'high',
            stage: stage.name,
            description: `Stage validation failed: ${validation.failureReason}`,
            timestamp: new Date(),
            resolved: false
          });

          if (input.rollbackOnFailure) {
            throw new Error(`Canary stage ${stage.name} validation failed`);
          }
        }

        // Check for automatic promotion
        if (!stage.automaticPromotion && stage.percentage < 100) {
          await notifyDeploymentStatus({
            deploymentId,
            status: 'waiting_approval',
            message: `Canary at ${stage.percentage}% requires approval to proceed`,
            channels: input.notificationChannels
          });

          // Wait for approval signal (max 1 hour)
          const approved = await condition(
            () => workflowInfo().memo.canaryApproved === true,
            '1 hour'
          );

          if (!approved) {
            throw new Error('Canary promotion approval timeout');
          }
        }
      }

    } catch (error) {
      console.error(`Canary stage ${stage.name} failed:`, error);
      
      if (input.rollbackOnFailure) {
        await updateTrafficSplit({
          deploymentId,
          splits: [
            { environment: `${input.environment}-canary`, percentage: 0 },
            { environment: `${input.environment}-stable`, percentage: 100 }
          ]
        });
      }
      
      throw error;
    }
  }

  // Final promotion
  await promoteDeployment({
    deploymentId,
    fromEnvironment: `${input.environment}-canary`,
    toEnvironment: `${input.environment}-stable`
  });

  return {
    deploymentId,
    status: 'success',
    finalVersion: input.modelId,
    rolloutPercentage: 100,
    metrics: metrics!,
    issues
  };
}

async function executeRollingDeployment(
  input: DeploymentWorkflowInput,
  deploymentId: string,
  issues: DeploymentIssue[]
): Promise<DeploymentWorkflowOutput> {
  const replicas = 10; // Number of instances to update
  const batchSize = 2; // Update 2 at a time
  let metrics: DeploymentMetrics | null = null;

  for (let i = 0; i < replicas; i += batchSize) {
    const batch = Math.min(batchSize, replicas - i);
    const percentage = Math.round(((i + batch) / replicas) * 100);

    await deployToEnvironment({
      deploymentId,
      modelId: input.modelId,
      environment: input.environment,
      percentage
    });

    // Health check for new instances
    const healthStatus = await runHealthChecks({
      deploymentId,
      environment: input.environment,
      checks: [
        {
          name: 'instance_health',
          endpoint: '/health',
          interval: 5000,
          timeout: 3000,
          successThreshold: 2,
          failureThreshold: 3
        }
      ],
      maxWaitTime: 30000
    });

    if (!healthStatus.healthy) {
      issues.push({
        severity: 'high',
        stage: `batch_${i}`,
        description: 'Health check failed for new instances',
        timestamp: new Date(),
        resolved: false
      });

      if (input.rollbackOnFailure) {
        throw new Error(`Rolling update failed at ${percentage}%`);
      }
    }

    await sleep('30 seconds'); // Wait between batches
  }

  // Final monitoring
  metrics = await monitorDeployment({
    deploymentId,
    duration: 300000,
    metrics: ['latency', 'throughput', 'error_rate']
  });

  return {
    deploymentId,
    status: 'success',
    finalVersion: input.modelId,
    rolloutPercentage: 100,
    metrics,
    issues
  };
}

async function executeImmediateDeployment(
  input: DeploymentWorkflowInput,
  deploymentId: string,
  issues: DeploymentIssue[]
): Promise<DeploymentWorkflowOutput> {
  // Deploy immediately to 100%
  await deployToEnvironment({
    deploymentId,
    modelId: input.modelId,
    environment: input.environment,
    percentage: 100
  });

  // Quick health check
  const healthStatus = await runHealthChecks({
    deploymentId,
    environment: input.environment,
    checks: [
      {
        name: 'immediate_health',
        endpoint: '/health',
        interval: 2000,
        timeout: 5000,
        successThreshold: 1,
        failureThreshold: 3
      }
    ],
    maxWaitTime: 15000
  });

  if (!healthStatus.healthy) {
    throw new Error('Immediate deployment health check failed');
  }

  const metrics = await monitorDeployment({
    deploymentId,
    duration: 60000,
    metrics: ['latency', 'error_rate']
  });

  return {
    deploymentId,
    status: 'success',
    finalVersion: input.modelId,
    rolloutPercentage: 100,
    metrics,
    issues
  };
}