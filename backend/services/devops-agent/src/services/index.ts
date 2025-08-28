/**
 * Services Initialization
 * Initialize all DevOps automation services and components
 */

import { createContextLogger } from '@/utils/logger';
import { config } from '@/config';
import { IaCEngine } from './infrastructure/iac-engine';
import { PipelineEngine } from './cicd/pipeline-engine';
import { KubernetesOrchestrationEngine } from './kubernetes/orchestration-engine';
import { ObservabilityEngine } from './monitoring/observability-engine';
import { SecurityAutomationEngine } from './security/security-automation-engine';
import { CostOptimizationEngine } from './cost-optimization/cost-optimization-engine';
import { BackupEngine } from './backup/backup-engine';
import { GitOpsEngine } from './gitops/gitops-engine';
import { MultiCloudEngine } from './multi-cloud/multi-cloud-engine';
import Redis from 'ioredis';

const logger = createContextLogger('Services');

// Global service instances
let redis: Redis;
let iacEngine: IaCEngine;
let pipelineEngine: PipelineEngine;
let kubernetesEngine: KubernetesOrchestrationEngine;
let observabilityEngine: ObservabilityEngine;
let securityEngine: SecurityAutomationEngine;
let costOptimizationEngine: CostOptimizationEngine;
let backupEngine: BackupEngine;
let gitopsEngine: GitOpsEngine;
let multiCloudEngine: MultiCloudEngine;

/**
 * Initialize all services
 */
export async function initializeServices(): Promise<void> {
  logger.info('Initializing DevOps automation services...');

  try {
    // Initialize Redis connection
    redis = new Redis(config.redis.url, {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
    });

    redis.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redis.on('error', (error) => {
      logger.error('Redis connection error:', error);
    });

    // Initialize core engines
    logger.info('Initializing Infrastructure as Code engine...');
    iacEngine = new IaCEngine();

    logger.info('Initializing CI/CD pipeline engine...');
    pipelineEngine = new PipelineEngine();

    logger.info('Initializing Kubernetes orchestration engine...');
    kubernetesEngine = new KubernetesOrchestrationEngine();

    logger.info('Initializing monitoring and observability engine...');
    observabilityEngine = new ObservabilityEngine();

    logger.info('Initializing security automation engine...');
    securityEngine = new SecurityAutomationEngine();

    // Initialize optional engines based on feature flags
    if (config.features.costOptimization) {
      logger.info('Initializing cost optimization engine...');
      costOptimizationEngine = new CostOptimizationEngine();
    }

    if (config.features.backupAutomation) {
      logger.info('Initializing backup and disaster recovery engine...');
      backupEngine = new BackupEngine();
    }

    logger.info('Initializing GitOps workflow engine...');
    gitopsEngine = new GitOpsEngine();

    if (config.features.multiCloud) {
      logger.info('Initializing multi-cloud management engine...');
      multiCloudEngine = new MultiCloudEngine();
    }

    // Setup inter-service communication
    setupServiceIntegration();

    logger.info('All DevOps automation services initialized successfully');

  } catch (error) {
    logger.error('Failed to initialize services:', error);
    throw error;
  }
}

/**
 * Setup integration between services
 */
function setupServiceIntegration(): void {
  logger.info('Setting up service integration...');

  // IaC Engine events
  iacEngine.on('deploymentCreated', (deployment) => {
    logger.info(`IaC deployment created: ${deployment.name}`);
    
    // Trigger monitoring setup for new deployment
    if (observabilityEngine) {
      observabilityEngine.deployMonitoringStack(
        `${deployment.name}-monitoring`,
        deployment.configuration.cluster || 'default',
        'monitoring',
        {
          retention: { metrics: '30d', logs: '7d', traces: '3d' },
          scraping: { interval: '30s', timeout: '10s', targets: [], relabeling: [] },
          alerting: { enabled: true, groupWait: '30s', groupInterval: '5m', repeatInterval: '12h', receivers: [], routes: [] },
          logging: { enabled: true, aggregation: 'loki' as const, retention: '7d', parsing: [] },
          tracing: { enabled: true, backend: 'jaeger' as const, samplingRate: 0.1, retention: '3d' },
          security: { tls: true, authentication: 'oauth' as const, authorization: 'rbac' as const, networkPolicies: true },
          performance: { queryOptimization: true, caching: true, compression: true },
        }
      ).catch(error => logger.error('Failed to setup monitoring for deployment:', error));
    }
  });

  // Pipeline Engine events
  pipelineEngine.on('pipelineExecutionCompleted', (execution) => {
    logger.info(`Pipeline execution completed: ${execution.id}`);
    
    // Trigger security scan after successful deployment
    if (securityEngine && execution.status === 'success') {
      securityEngine.startSecurityScan(
        `post-deploy-scan-${execution.id}`,
        'infrastructure',
        execution.environment,
        {
          scope: ['*'],
          exclusions: [],
          rules: [],
          thresholds: [
            { severity: 'critical', maxFindings: 0, action: 'block' },
            { severity: 'high', maxFindings: 5, action: 'warn' },
          ],
          notifications: [],
        }
      ).catch(error => logger.error('Failed to start post-deployment security scan:', error));
    }
  });

  // Security Engine events
  securityEngine.on('securityIncidentCreated', (incident) => {
    logger.warn(`Security incident created: ${incident.title}`);
    
    // Trigger backup if critical incident
    if (backupEngine && incident.severity === 'critical') {
      backupEngine.triggerEmergencyBackup(
        incident.affectedSystems,
        `emergency-backup-${incident.id}`
      ).catch(error => logger.error('Failed to trigger emergency backup:', error));
    }
  });

  // Kubernetes Engine events
  kubernetesEngine.on('applicationDeployed', (application) => {
    logger.info(`Application deployed: ${application.name}`);
    
    // Setup cost monitoring for new application
    if (costOptimizationEngine) {
      costOptimizationEngine.addResourceGroup(
        application.name,
        'application',
        {
          cluster: application.cluster,
          namespace: application.namespace,
          resources: application.resources.map(r => r.name),
        }
      ).catch(error => logger.error('Failed to add resource group for cost monitoring:', error));
    }
  });

  // Observability Engine events
  observabilityEngine.on('anomalyDetected', (anomaly) => {
    logger.warn(`Anomaly detected: ${JSON.stringify(anomaly)}`);
    
    // Create security incident for anomalies
    if (securityEngine) {
      securityEngine.createSecurityIncident(
        `Anomaly Detected: ${anomaly.type}`,
        `Anomaly detected in monitoring data: ${anomaly.description}`,
        'medium',
        'anomaly',
        anomaly.affectedServices || []
      ).catch(error => logger.error('Failed to create incident for anomaly:', error));
    }
  });

  logger.info('Service integration setup completed');
}

/**
 * Get service instances (for use in routes and other modules)
 */
export function getServices() {
  return {
    redis,
    iacEngine,
    pipelineEngine,
    kubernetesEngine,
    observabilityEngine,
    securityEngine,
    costOptimizationEngine,
    backupEngine,
    gitopsEngine,
    multiCloudEngine,
  };
}

/**
 * Health check for all services
 */
export async function checkServicesHealth(): Promise<Record<string, boolean>> {
  const health: Record<string, boolean> = {};

  try {
    // Check Redis
    health.redis = redis ? await redis.ping() === 'PONG' : false;

    // Check other services (simplified health checks)
    health.iacEngine = !!iacEngine;
    health.pipelineEngine = !!pipelineEngine;
    health.kubernetesEngine = !!kubernetesEngine;
    health.observabilityEngine = !!observabilityEngine;
    health.securityEngine = !!securityEngine;
    health.costOptimizationEngine = !!costOptimizationEngine;
    health.backupEngine = !!backupEngine;
    health.gitopsEngine = !!gitopsEngine;
    health.multiCloudEngine = !!multiCloudEngine;

  } catch (error) {
    logger.error('Health check failed:', error);
  }

  return health;
}

/**
 * Graceful shutdown of all services
 */
export async function shutdownServices(): Promise<void> {
  logger.info('Shutting down DevOps automation services...');

  try {
    // Close Redis connection
    if (redis) {
      await redis.disconnect();
      logger.info('Redis connection closed');
    }

    // Cleanup other services
    // (In a real implementation, each service would have a cleanup method)

    logger.info('All services shut down successfully');

  } catch (error) {
    logger.error('Error during service shutdown:', error);
    throw error;
  }
}