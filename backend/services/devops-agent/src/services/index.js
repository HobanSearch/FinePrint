"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeServices = initializeServices;
exports.getServices = getServices;
exports.checkServicesHealth = checkServicesHealth;
exports.shutdownServices = shutdownServices;
const logger_1 = require("@/utils/logger");
const config_1 = require("@/config");
const iac_engine_1 = require("./infrastructure/iac-engine");
const pipeline_engine_1 = require("./cicd/pipeline-engine");
const orchestration_engine_1 = require("./kubernetes/orchestration-engine");
const observability_engine_1 = require("./monitoring/observability-engine");
const security_automation_engine_1 = require("./security/security-automation-engine");
const cost_optimization_engine_1 = require("./cost-optimization/cost-optimization-engine");
const backup_engine_1 = require("./backup/backup-engine");
const gitops_engine_1 = require("./gitops/gitops-engine");
const multi_cloud_engine_1 = require("./multi-cloud/multi-cloud-engine");
const ioredis_1 = __importDefault(require("ioredis"));
const logger = (0, logger_1.createContextLogger)('Services');
let redis;
let iacEngine;
let pipelineEngine;
let kubernetesEngine;
let observabilityEngine;
let securityEngine;
let costOptimizationEngine;
let backupEngine;
let gitopsEngine;
let multiCloudEngine;
async function initializeServices() {
    logger.info('Initializing DevOps automation services...');
    try {
        redis = new ioredis_1.default(config_1.config.redis.url, {
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
        logger.info('Initializing Infrastructure as Code engine...');
        iacEngine = new iac_engine_1.IaCEngine();
        logger.info('Initializing CI/CD pipeline engine...');
        pipelineEngine = new pipeline_engine_1.PipelineEngine();
        logger.info('Initializing Kubernetes orchestration engine...');
        kubernetesEngine = new orchestration_engine_1.KubernetesOrchestrationEngine();
        logger.info('Initializing monitoring and observability engine...');
        observabilityEngine = new observability_engine_1.ObservabilityEngine();
        logger.info('Initializing security automation engine...');
        securityEngine = new security_automation_engine_1.SecurityAutomationEngine();
        if (config_1.config.features.costOptimization) {
            logger.info('Initializing cost optimization engine...');
            costOptimizationEngine = new cost_optimization_engine_1.CostOptimizationEngine();
        }
        if (config_1.config.features.backupAutomation) {
            logger.info('Initializing backup and disaster recovery engine...');
            backupEngine = new backup_engine_1.BackupEngine();
        }
        logger.info('Initializing GitOps workflow engine...');
        gitopsEngine = new gitops_engine_1.GitOpsEngine();
        if (config_1.config.features.multiCloud) {
            logger.info('Initializing multi-cloud management engine...');
            multiCloudEngine = new multi_cloud_engine_1.MultiCloudEngine();
        }
        setupServiceIntegration();
        logger.info('All DevOps automation services initialized successfully');
    }
    catch (error) {
        logger.error('Failed to initialize services:', error);
        throw error;
    }
}
function setupServiceIntegration() {
    logger.info('Setting up service integration...');
    iacEngine.on('deploymentCreated', (deployment) => {
        logger.info(`IaC deployment created: ${deployment.name}`);
        if (observabilityEngine) {
            observabilityEngine.deployMonitoringStack(`${deployment.name}-monitoring`, deployment.configuration.cluster || 'default', 'monitoring', {
                retention: { metrics: '30d', logs: '7d', traces: '3d' },
                scraping: { interval: '30s', timeout: '10s', targets: [], relabeling: [] },
                alerting: { enabled: true, groupWait: '30s', groupInterval: '5m', repeatInterval: '12h', receivers: [], routes: [] },
                logging: { enabled: true, aggregation: 'loki', retention: '7d', parsing: [] },
                tracing: { enabled: true, backend: 'jaeger', samplingRate: 0.1, retention: '3d' },
                security: { tls: true, authentication: 'oauth', authorization: 'rbac', networkPolicies: true },
                performance: { queryOptimization: true, caching: true, compression: true },
            }).catch(error => logger.error('Failed to setup monitoring for deployment:', error));
        }
    });
    pipelineEngine.on('pipelineExecutionCompleted', (execution) => {
        logger.info(`Pipeline execution completed: ${execution.id}`);
        if (securityEngine && execution.status === 'success') {
            securityEngine.startSecurityScan(`post-deploy-scan-${execution.id}`, 'infrastructure', execution.environment, {
                scope: ['*'],
                exclusions: [],
                rules: [],
                thresholds: [
                    { severity: 'critical', maxFindings: 0, action: 'block' },
                    { severity: 'high', maxFindings: 5, action: 'warn' },
                ],
                notifications: [],
            }).catch(error => logger.error('Failed to start post-deployment security scan:', error));
        }
    });
    securityEngine.on('securityIncidentCreated', (incident) => {
        logger.warn(`Security incident created: ${incident.title}`);
        if (backupEngine && incident.severity === 'critical') {
            backupEngine.triggerEmergencyBackup(incident.affectedSystems, `emergency-backup-${incident.id}`).catch(error => logger.error('Failed to trigger emergency backup:', error));
        }
    });
    kubernetesEngine.on('applicationDeployed', (application) => {
        logger.info(`Application deployed: ${application.name}`);
        if (costOptimizationEngine) {
            costOptimizationEngine.addResourceGroup(application.name, 'application', {
                cluster: application.cluster,
                namespace: application.namespace,
                resources: application.resources.map(r => r.name),
            }).catch(error => logger.error('Failed to add resource group for cost monitoring:', error));
        }
    });
    observabilityEngine.on('anomalyDetected', (anomaly) => {
        logger.warn(`Anomaly detected: ${JSON.stringify(anomaly)}`);
        if (securityEngine) {
            securityEngine.createSecurityIncident(`Anomaly Detected: ${anomaly.type}`, `Anomaly detected in monitoring data: ${anomaly.description}`, 'medium', 'anomaly', anomaly.affectedServices || []).catch(error => logger.error('Failed to create incident for anomaly:', error));
        }
    });
    logger.info('Service integration setup completed');
}
function getServices() {
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
async function checkServicesHealth() {
    const health = {};
    try {
        health.redis = redis ? await redis.ping() === 'PONG' : false;
        health.iacEngine = !!iacEngine;
        health.pipelineEngine = !!pipelineEngine;
        health.kubernetesEngine = !!kubernetesEngine;
        health.observabilityEngine = !!observabilityEngine;
        health.securityEngine = !!securityEngine;
        health.costOptimizationEngine = !!costOptimizationEngine;
        health.backupEngine = !!backupEngine;
        health.gitopsEngine = !!gitopsEngine;
        health.multiCloudEngine = !!multiCloudEngine;
    }
    catch (error) {
        logger.error('Health check failed:', error);
    }
    return health;
}
async function shutdownServices() {
    logger.info('Shutting down DevOps automation services...');
    try {
        if (redis) {
            await redis.disconnect();
            logger.info('Redis connection closed');
        }
        logger.info('All services shut down successfully');
    }
    catch (error) {
        logger.error('Error during service shutdown:', error);
        throw error;
    }
}
//# sourceMappingURL=index.js.map