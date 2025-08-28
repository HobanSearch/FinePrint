import { EventEmitter } from 'events';
export interface Pipeline {
    id: string;
    name: string;
    repository: string;
    branch: string;
    provider: 'github-actions' | 'gitlab-ci' | 'jenkins' | 'argocd';
    status: 'active' | 'paused' | 'failed' | 'disabled';
    stages: PipelineStage[];
    configuration: PipelineConfiguration;
    metrics: PipelineMetrics;
    createdAt: Date;
    updatedAt: Date;
}
export interface PipelineStage {
    id: string;
    name: string;
    type: 'build' | 'test' | 'security' | 'deploy' | 'approval' | 'notification';
    status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
    steps: PipelineStep[];
    dependencies: string[];
    condition?: string;
    timeout?: number;
    retries?: number;
}
export interface PipelineStep {
    id: string;
    name: string;
    command: string;
    environment?: Record<string, string>;
    workingDirectory?: string;
    continueOnError?: boolean;
    timeout?: number;
}
export interface PipelineConfiguration {
    triggers: PipelineTrigger[];
    environments: Environment[];
    deploymentStrategy: DeploymentStrategy;
    notifications: NotificationConfig[];
    security: SecurityConfig;
    testing: TestingConfig;
    caching: CachingConfig;
    parallelization: ParallelizationConfig;
}
export interface PipelineTrigger {
    type: 'push' | 'pull_request' | 'schedule' | 'manual' | 'webhook';
    conditions: Record<string, any>;
}
export interface Environment {
    name: string;
    type: 'development' | 'staging' | 'production';
    cluster: string;
    namespace: string;
    approvers?: string[];
    variables: Record<string, string>;
    secrets: string[];
}
export interface DeploymentStrategy {
    type: 'rolling' | 'blue-green' | 'canary' | 'recreate';
    options: Record<string, any>;
    rollbackStrategy: 'automatic' | 'manual';
    healthChecks: HealthCheck[];
}
export interface HealthCheck {
    type: 'http' | 'tcp' | 'exec';
    endpoint?: string;
    command?: string;
    timeout: number;
    retries: number;
}
export interface NotificationConfig {
    type: 'slack' | 'email' | 'webhook' | 'pagerduty';
    events: string[];
    recipients: string[];
    settings: Record<string, any>;
}
export interface SecurityConfig {
    enabled: boolean;
    scanTypes: ('sast' | 'dast' | 'dependency' | 'container' | 'iac')[];
    failOnHighSeverity: boolean;
    allowedVulnerabilities: string[];
}
export interface TestingConfig {
    unit: TestConfig;
    integration: TestConfig;
    e2e: TestConfig;
    performance: TestConfig;
    coverage: CoverageConfig;
}
export interface TestConfig {
    enabled: boolean;
    command: string;
    timeout: number;
    retries: number;
    parallelism: number;
}
export interface CoverageConfig {
    enabled: boolean;
    threshold: number;
    reportFormats: string[];
}
export interface CachingConfig {
    enabled: boolean;
    paths: string[];
    keys: string[];
    restoreKeys: string[];
}
export interface ParallelizationConfig {
    enabled: boolean;
    maxJobs: number;
    matrix: Record<string, any>;
}
export interface PipelineMetrics {
    totalRuns: number;
    successRate: number;
    averageDuration: number;
    lastRun?: Date;
    lastSuccess?: Date;
    lastFailure?: Date;
    deploymentFrequency: number;
    leadTime: number;
    meanTimeToRecovery: number;
    changeFailureRate: number;
}
export interface PipelineExecution {
    id: string;
    pipelineId: string;
    status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
    startTime: Date;
    endTime?: Date;
    duration?: number;
    stages: StageExecution[];
    logs: string[];
    artifacts: Artifact[];
    trigger: PipelineTrigger;
    environment: string;
}
export interface StageExecution {
    stageId: string;
    status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
    startTime?: Date;
    endTime?: Date;
    duration?: number;
    steps: StepExecution[];
    logs: string[];
}
export interface StepExecution {
    stepId: string;
    status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
    startTime?: Date;
    endTime?: Date;
    duration?: number;
    exitCode?: number;
    logs: string[];
}
export interface Artifact {
    id: string;
    name: string;
    type: 'binary' | 'image' | 'report' | 'log';
    path: string;
    size: number;
    checksum: string;
    createdAt: Date;
}
export declare class PipelineEngine extends EventEmitter {
    private readonly pipelines;
    private readonly executions;
    private readonly githubActionsGenerator;
    private readonly gitlabCIGenerator;
    private readonly jenkinsGenerator;
    private readonly argocdGenerator;
    private readonly securityScanner;
    private readonly testRunner;
    private readonly deploymentManager;
    private readonly octokit?;
    constructor();
    createPipeline(name: string, repository: string, configuration: PipelineConfiguration, options?: {
        provider?: 'github-actions' | 'gitlab-ci' | 'jenkins' | 'argocd';
        branch?: string;
        autoCommit?: boolean;
    }): Promise<Pipeline>;
    updatePipeline(pipelineId: string, updates: Partial<PipelineConfiguration>): Promise<Pipeline>;
    executePipeline(pipelineId: string, trigger: PipelineTrigger, environment?: string): Promise<PipelineExecution>;
    private runPipelineExecution;
    private executeStage;
    private executeStep;
    private generatePipelineStages;
    private generatePipelineFiles;
    private initializeMetrics;
    private checkStageDependencies;
    private executeBuildStep;
    private executeTestStep;
    private executeSecurityStep;
    private executeDeployStep;
    private executeGenericStep;
    private commitPipelineFiles;
    private setupTriggers;
    private updatePipelineMetrics;
    private startMetricsCollection;
    private collectPipelineMetrics;
    getPipeline(pipelineId: string): Pipeline | undefined;
    listPipelines(): Pipeline[];
    getExecution(executionId: string): PipelineExecution | undefined;
    listExecutions(pipelineId?: string): PipelineExecution[];
    deletePipeline(pipelineId: string): Promise<void>;
}
//# sourceMappingURL=pipeline-engine.d.ts.map