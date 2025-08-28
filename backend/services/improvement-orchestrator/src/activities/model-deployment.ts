/**
 * Model deployment activities for safe rollout and monitoring
 */

import { Context } from '@temporalio/activity';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import {
  DeploymentConfig,
  DeploymentResult,
  ModelValidation,
  HealthCheck,
  ValidationCriteria,
  ModelType
} from '../types';

export interface DeployModelInput {
  config: DeploymentConfig;
  validationResults: ModelValidation;
}

export async function deployModel(
  input: DeployModelInput
): Promise<DeploymentResult> {
  const { heartbeat } = Context.current();
  const deploymentId = `deploy_${uuidv4()}`;
  
  try {
    await heartbeat();

    // Register model in model registry
    await registerModel(input.config.modelId, input.config.modelType);

    // Deploy based on strategy
    const result = await executeDeployment(deploymentId, input.config);

    // Setup monitoring
    await setupMonitoring(deploymentId, input.config.monitoring);

    // Configure auto-scaling
    await configureAutoScaling(deploymentId, input.config.modelType);

    return result;

  } catch (error) {
    console.error('Failed to deploy model:', error);
    throw error;
  }
}

async function registerModel(modelId: string, modelType: ModelType): Promise<void> {
  try {
    await axios.post(
      `${process.env.MODEL_REGISTRY_URL || 'http://localhost:3017'}/api/models`,
      {
        modelId,
        modelType,
        status: 'ready',
        registeredAt: new Date().toISOString()
      }
    );
  } catch (error) {
    throw new Error(`Failed to register model: ${error.message}`);
  }
}

async function executeDeployment(
  deploymentId: string,
  config: DeploymentConfig
): Promise<DeploymentResult> {
  try {
    const response = await axios.post(
      `${process.env.DEPLOYMENT_SERVICE_URL || 'http://localhost:3018'}/api/deploy`,
      {
        deploymentId,
        modelId: config.modelId,
        modelType: config.modelType,
        strategy: config.strategy,
        environment: config.targetEnvironment,
        rolloutStages: config.rolloutStages
      }
    );

    return {
      deploymentId,
      status: 'success',
      deployedVersion: config.modelId,
      rolloutPercentage: 0,
      healthStatus: 'initializing',
      metrics: {}
    };
  } catch (error) {
    throw new Error(`Deployment execution failed: ${error.message}`);
  }
}

async function setupMonitoring(deploymentId: string, monitoring: any): Promise<void> {
  try {
    await axios.post(
      `${process.env.MONITORING_SERVICE_URL || 'http://localhost:3019'}/api/monitoring/setup`,
      {
        deploymentId,
        metrics: monitoring.metrics,
        alertThresholds: monitoring.alertThresholds,
        dashboardUrl: monitoring.dashboardUrl,
        logLevel: monitoring.logLevel,
        tracingEnabled: monitoring.tracingEnabled
      }
    );
  } catch (error) {
    console.error('Failed to setup monitoring:', error);
  }
}

async function configureAutoScaling(deploymentId: string, modelType: ModelType): Promise<void> {
  try {
    await axios.post(
      `${process.env.AUTOSCALING_SERVICE_URL || 'http://localhost:3020'}/api/autoscaling`,
      {
        deploymentId,
        minReplicas: 2,
        maxReplicas: 10,
        targetCPU: 70,
        targetMemory: 80,
        scaleUpPeriod: 60,
        scaleDownPeriod: 300
      }
    );
  } catch (error) {
    console.error('Failed to configure auto-scaling:', error);
  }
}

export interface RollbackDeploymentInput {
  deploymentId: string;
  reason: string;
  restoreModelId?: string;
  restoreVersion?: string;
}

export async function rollbackDeployment(
  input: RollbackDeploymentInput
): Promise<void> {
  const { heartbeat } = Context.current();
  
  try {
    await heartbeat();

    // Stop current deployment
    await stopDeployment(input.deploymentId);

    // Restore previous version
    if (input.restoreModelId || input.restoreVersion) {
      await restorePreviousVersion(
        input.deploymentId,
        input.restoreModelId || input.restoreVersion!
      );
    }

    // Log rollback
    await logRollback(input.deploymentId, input.reason);

    // Notify about rollback
    await notifyRollback(input.deploymentId, input.reason);

  } catch (error) {
    console.error('Failed to rollback deployment:', error);
    throw error;
  }
}

async function stopDeployment(deploymentId: string): Promise<void> {
  try {
    await axios.post(
      `${process.env.DEPLOYMENT_SERVICE_URL || 'http://localhost:3018'}/api/deployments/${deploymentId}/stop`
    );
  } catch (error) {
    throw new Error(`Failed to stop deployment: ${error.message}`);
  }
}

async function restorePreviousVersion(deploymentId: string, modelId: string): Promise<void> {
  try {
    await axios.post(
      `${process.env.DEPLOYMENT_SERVICE_URL || 'http://localhost:3018'}/api/deployments/${deploymentId}/restore`,
      {
        modelId,
        strategy: 'immediate'
      }
    );
  } catch (error) {
    throw new Error(`Failed to restore previous version: ${error.message}`);
  }
}

async function logRollback(deploymentId: string, reason: string): Promise<void> {
  try {
    await axios.post(
      `${process.env.LOGGING_SERVICE_URL || 'http://localhost:3021'}/api/logs`,
      {
        deploymentId,
        event: 'rollback',
        reason,
        timestamp: new Date().toISOString()
      }
    );
  } catch (error) {
    console.error('Failed to log rollback:', error);
  }
}

async function notifyRollback(deploymentId: string, reason: string): Promise<void> {
  try {
    await axios.post(
      `${process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3022'}/api/notify`,
      {
        type: 'rollback',
        deploymentId,
        reason,
        severity: 'high',
        timestamp: new Date().toISOString()
      }
    );
  } catch (error) {
    console.error('Failed to notify rollback:', error);
  }
}

export interface MonitorPerformanceInput {
  modelId: string;
  duration: number;
  metrics: string[];
}

export async function monitorPerformance(
  input: MonitorPerformanceInput
): Promise<any> {
  const { heartbeat } = Context.current();
  const startTime = Date.now();
  const metricsData: Record<string, number[]> = {};
  
  try {
    // Initialize metrics arrays
    for (const metric of input.metrics) {
      metricsData[metric] = [];
    }

    // Monitor for specified duration
    while (Date.now() - startTime < input.duration) {
      await heartbeat();

      // Collect metrics
      const currentMetrics = await collectMetrics(input.modelId, input.metrics);
      
      for (const metric of input.metrics) {
        metricsData[metric].push(currentMetrics[metric]);
      }

      // Wait before next collection
      await new Promise(resolve => setTimeout(resolve, 5000)); // Collect every 5 seconds
    }

    // Calculate aggregated metrics
    const aggregated: Record<string, number> = {};
    
    for (const [metric, values] of Object.entries(metricsData)) {
      aggregated[metric] = values.reduce((sum, val) => sum + val, 0) / values.length;
    }

    return aggregated;

  } catch (error) {
    console.error('Failed to monitor performance:', error);
    throw error;
  }
}

async function collectMetrics(modelId: string, metrics: string[]): Promise<Record<string, number>> {
  try {
    const response = await axios.get(
      `${process.env.METRICS_SERVICE_URL || 'http://localhost:3015'}/api/metrics/current`,
      {
        params: {
          modelId,
          metrics: metrics.join(',')
        }
      }
    );

    return response.data.metrics;
  } catch (error) {
    console.error('Failed to collect metrics:', error);
    
    // Return default metrics on error
    const defaultMetrics: Record<string, number> = {};
    for (const metric of metrics) {
      defaultMetrics[metric] = 0;
    }
    return defaultMetrics;
  }
}

export interface PrepareDeploymentInput {
  modelId: string;
  modelType: ModelType;
  environment: string;
  strategy: string;
}

export async function prepareDeployment(
  input: PrepareDeploymentInput
): Promise<{ ready: boolean; reason?: string; previousVersion?: string }> {
  try {
    // Check if model exists
    const modelExists = await checkModelExists(input.modelId);
    if (!modelExists) {
      return { ready: false, reason: 'Model not found' };
    }

    // Check environment readiness
    const envReady = await checkEnvironmentReadiness(input.environment);
    if (!envReady) {
      return { ready: false, reason: 'Environment not ready' };
    }

    // Get previous version for rollback
    const previousVersion = await getCurrentVersion(input.environment, input.modelType);

    // Check resource availability
    const resourcesAvailable = await checkResourceAvailability(input.modelType);
    if (!resourcesAvailable) {
      return { ready: false, reason: 'Insufficient resources' };
    }

    return { ready: true, previousVersion };
  } catch (error) {
    return { ready: false, reason: error.message };
  }
}

async function checkModelExists(modelId: string): Promise<boolean> {
  try {
    const response = await axios.get(
      `${process.env.MODEL_REGISTRY_URL || 'http://localhost:3017'}/api/models/${modelId}`
    );
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

async function checkEnvironmentReadiness(environment: string): Promise<boolean> {
  try {
    const response = await axios.get(
      `${process.env.DEPLOYMENT_SERVICE_URL || 'http://localhost:3018'}/api/environments/${environment}/status`
    );
    return response.data.ready === true;
  } catch (error) {
    return false;
  }
}

async function getCurrentVersion(environment: string, modelType: ModelType): Promise<string> {
  try {
    const response = await axios.get(
      `${process.env.DEPLOYMENT_SERVICE_URL || 'http://localhost:3018'}/api/environments/${environment}/current`,
      {
        params: { modelType }
      }
    );
    return response.data.modelId || '';
  } catch (error) {
    return '';
  }
}

async function checkResourceAvailability(modelType: ModelType): Promise<boolean> {
  try {
    const response = await axios.get(
      `${process.env.RESOURCE_SERVICE_URL || 'http://localhost:3023'}/api/resources/available`,
      {
        params: {
          modelType,
          requiredCPU: 2,
          requiredMemory: 4096,
          requiredGPU: modelType === ModelType.CONTENT ? 1 : 0
        }
      }
    );
    return response.data.available === true;
  } catch (error) {
    return false;
  }
}

export interface DeployToEnvironmentInput {
  deploymentId: string;
  modelId: string;
  environment: string;
  percentage: number;
}

export async function deployToEnvironment(
  input: DeployToEnvironmentInput
): Promise<void> {
  try {
    await axios.post(
      `${process.env.DEPLOYMENT_SERVICE_URL || 'http://localhost:3018'}/api/deployments/${input.deploymentId}/deploy`,
      {
        modelId: input.modelId,
        environment: input.environment,
        trafficPercentage: input.percentage
      }
    );
  } catch (error) {
    throw new Error(`Failed to deploy to environment: ${error.message}`);
  }
}

export interface RunHealthChecksInput {
  deploymentId: string;
  environment: string;
  checks: HealthCheck[];
  maxWaitTime: number;
}

export async function runHealthChecks(
  input: RunHealthChecksInput
): Promise<{ healthy: boolean; details: any }> {
  const startTime = Date.now();
  const checkResults: Record<string, boolean> = {};

  while (Date.now() - startTime < input.maxWaitTime) {
    let allHealthy = true;

    for (const check of input.checks) {
      const result = await performHealthCheck(input.environment, check);
      checkResults[check.name] = result;
      
      if (!result) {
        allHealthy = false;
      }
    }

    if (allHealthy) {
      return { healthy: true, details: checkResults };
    }

    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  return { healthy: false, details: checkResults };
}

async function performHealthCheck(environment: string, check: HealthCheck): Promise<boolean> {
  try {
    const response = await axios.get(
      `${process.env.HEALTH_CHECK_URL || 'http://localhost:3024'}${check.endpoint}`,
      {
        timeout: check.timeout,
        params: { environment }
      }
    );
    
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

export interface ValidateDeploymentInput {
  deploymentId: string;
  environment: string;
  criteria: ValidationCriteria[];
}

export async function validateDeployment(
  input: ValidateDeploymentInput
): Promise<{ passed: boolean; failureReason?: string }> {
  try {
    for (const criterion of input.criteria) {
      const metricValue = await getMetricValue(
        input.deploymentId,
        criterion.metric,
        criterion.evaluationWindow
      );

      if (metricValue > criterion.threshold) {
        return {
          passed: false,
          failureReason: `${criterion.metric} (${metricValue}) exceeds threshold (${criterion.threshold})`
        };
      }
    }

    return { passed: true };
  } catch (error) {
    return {
      passed: false,
      failureReason: `Validation error: ${error.message}`
    };
  }
}

async function getMetricValue(
  deploymentId: string,
  metric: string,
  window: number
): Promise<number> {
  try {
    const response = await axios.get(
      `${process.env.METRICS_SERVICE_URL || 'http://localhost:3015'}/api/metrics/aggregate`,
      {
        params: {
          deploymentId,
          metric,
          window,
          aggregation: 'avg'
        }
      }
    );

    return response.data.value;
  } catch (error) {
    throw new Error(`Failed to get metric value: ${error.message}`);
  }
}

export interface UpdateTrafficSplitInput {
  deploymentId: string;
  splits: Array<{
    environment: string;
    percentage: number;
  }>;
}

export async function updateTrafficSplit(
  input: UpdateTrafficSplitInput
): Promise<void> {
  try {
    await axios.post(
      `${process.env.TRAFFIC_MANAGER_URL || 'http://localhost:3025'}/api/traffic/split`,
      {
        deploymentId: input.deploymentId,
        splits: input.splits
      }
    );
  } catch (error) {
    throw new Error(`Failed to update traffic split: ${error.message}`);
  }
}

export interface PromoteDeploymentInput {
  deploymentId: string;
  fromEnvironment: string;
  toEnvironment: string;
}

export async function promoteDeployment(
  input: PromoteDeploymentInput
): Promise<void> {
  try {
    await axios.post(
      `${process.env.DEPLOYMENT_SERVICE_URL || 'http://localhost:3018'}/api/deployments/${input.deploymentId}/promote`,
      {
        fromEnvironment: input.fromEnvironment,
        toEnvironment: input.toEnvironment
      }
    );
  } catch (error) {
    throw new Error(`Failed to promote deployment: ${error.message}`);
  }
}

export interface RecordDeploymentMetricsInput {
  deploymentId: string;
  metrics: any;
  status: string;
}

export async function recordDeploymentMetrics(
  input: RecordDeploymentMetricsInput
): Promise<void> {
  try {
    await axios.post(
      `${process.env.METRICS_SERVICE_URL || 'http://localhost:3015'}/api/deployments/metrics`,
      {
        deploymentId: input.deploymentId,
        metrics: input.metrics,
        status: input.status,
        timestamp: new Date().toISOString()
      }
    );
  } catch (error) {
    console.error('Failed to record deployment metrics:', error);
  }
}

export interface NotifyDeploymentStatusInput {
  deploymentId: string;
  status: string;
  message: string;
  channels: string[];
}

export async function notifyDeploymentStatus(
  input: NotifyDeploymentStatusInput
): Promise<void> {
  try {
    await axios.post(
      `${process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3022'}/api/notify`,
      {
        type: 'deployment_status',
        deploymentId: input.deploymentId,
        status: input.status,
        message: input.message,
        channels: input.channels,
        timestamp: new Date().toISOString()
      }
    );
  } catch (error) {
    console.error('Failed to notify deployment status:', error);
  }
}

export interface MonitorDeploymentInput {
  deploymentId: string;
  duration: number;
  metrics: string[];
}

export async function monitorDeployment(
  input: MonitorDeploymentInput
): Promise<any> {
  const startTime = Date.now();
  const collectedMetrics: Record<string, number[]> = {};
  
  // Initialize metrics arrays
  for (const metric of input.metrics) {
    collectedMetrics[metric] = [];
  }

  // Collect metrics for specified duration
  while (Date.now() - startTime < input.duration) {
    const metrics = await collectDeploymentMetrics(input.deploymentId, input.metrics);
    
    for (const [key, value] of Object.entries(metrics)) {
      collectedMetrics[key].push(value as number);
    }

    await new Promise(resolve => setTimeout(resolve, 10000)); // Collect every 10 seconds
  }

  // Calculate aggregated metrics
  const result: any = {
    latency: {
      p50: 0,
      p95: 0,
      p99: 0,
      mean: 0
    },
    throughput: 0,
    errorRate: 0,
    successRate: 0,
    resourceUtilization: {
      cpu: 0,
      memory: 0,
      network: 0,
      storage: 0
    },
    businessMetrics: {}
  };

  // Calculate latency percentiles if available
  if (collectedMetrics.latency && collectedMetrics.latency.length > 0) {
    const sorted = collectedMetrics.latency.sort((a, b) => a - b);
    result.latency.p50 = sorted[Math.floor(sorted.length * 0.5)];
    result.latency.p95 = sorted[Math.floor(sorted.length * 0.95)];
    result.latency.p99 = sorted[Math.floor(sorted.length * 0.99)];
    result.latency.mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  }

  // Calculate other metrics
  if (collectedMetrics.throughput) {
    result.throughput = collectedMetrics.throughput.reduce((a, b) => a + b, 0) / collectedMetrics.throughput.length;
  }

  if (collectedMetrics.error_rate) {
    result.errorRate = collectedMetrics.error_rate.reduce((a, b) => a + b, 0) / collectedMetrics.error_rate.length;
    result.successRate = 1 - result.errorRate;
  }

  return result;
}

async function collectDeploymentMetrics(
  deploymentId: string,
  metrics: string[]
): Promise<Record<string, number>> {
  try {
    const response = await axios.get(
      `${process.env.METRICS_SERVICE_URL || 'http://localhost:3015'}/api/deployments/${deploymentId}/metrics`,
      {
        params: {
          metrics: metrics.join(',')
        }
      }
    );

    return response.data.metrics;
  } catch (error) {
    console.error('Failed to collect deployment metrics:', error);
    
    // Return default metrics
    const defaultMetrics: Record<string, number> = {};
    for (const metric of metrics) {
      defaultMetrics[metric] = 0;
    }
    return defaultMetrics;
  }
}