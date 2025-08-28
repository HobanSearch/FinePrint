/**
 * Core types for the Improvement Orchestrator Service
 */

export enum ModelType {
  MARKETING = 'marketing',
  SALES = 'sales',
  SUPPORT = 'support',
  ANALYTICS = 'analytics',
  CONTENT = 'content'
}

export enum ImprovementPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

export enum WorkflowStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  ROLLBACK = 'rollback'
}

export enum DeploymentStrategy {
  BLUE_GREEN = 'blue_green',
  CANARY = 'canary',
  ROLLING = 'rolling',
  IMMEDIATE = 'immediate'
}

export interface ABTestFailure {
  id: string;
  modelType: ModelType;
  modelVersion: string;
  experimentId: string;
  failureMetrics: FailureMetrics;
  timestamp: Date;
  context: Record<string, any>;
}

export interface FailureMetrics {
  conversionRate: number;
  expectedRate: number;
  variance: number;
  confidenceLevel: number;
  sampleSize: number;
  duration: number;
  businessImpact: number;
}

export interface FailureAnalysis {
  failureId: string;
  rootCauses: RootCause[];
  patterns: FailurePattern[];
  hypotheses: ImprovementHypothesis[];
  recommendedActions: Action[];
  confidence: number;
  analysisTimestamp: Date;
}

export interface RootCause {
  category: string;
  description: string;
  evidence: string[];
  probability: number;
  impact: number;
}

export interface FailurePattern {
  type: string;
  frequency: number;
  conditions: Record<string, any>;
  relatedFailures: string[];
  trend: 'increasing' | 'stable' | 'decreasing';
}

export interface ImprovementHypothesis {
  id: string;
  description: string;
  expectedImprovement: number;
  requiredChanges: string[];
  estimatedEffort: number;
  riskLevel: 'low' | 'medium' | 'high';
  confidence: number;
}

export interface ImprovementPlan {
  id: string;
  failureId: string;
  modelType: ModelType;
  priority: ImprovementPriority;
  improvements: Improvement[];
  estimatedDuration: number;
  expectedOutcome: ExpectedOutcome;
  approvalRequired: boolean;
  createdAt: Date;
}

export interface Improvement {
  id: string;
  type: ImprovementType;
  description: string;
  parameters: Record<string, any>;
  dependencies: string[];
  estimatedDuration: number;
  status: ImprovementStatus;
}

export enum ImprovementType {
  DATASET_ENHANCEMENT = 'dataset_enhancement',
  HYPERPARAMETER_TUNING = 'hyperparameter_tuning',
  ARCHITECTURE_CHANGE = 'architecture_change',
  FEATURE_ENGINEERING = 'feature_engineering',
  PROMPT_OPTIMIZATION = 'prompt_optimization',
  CONTEXT_ADJUSTMENT = 'context_adjustment',
  FINE_TUNING = 'fine_tuning'
}

export enum ImprovementStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

export interface ExpectedOutcome {
  metricImprovements: MetricImprovement[];
  riskAssessment: RiskAssessment;
  successProbability: number;
  rollbackPlan: RollbackPlan;
}

export interface MetricImprovement {
  metric: string;
  currentValue: number;
  targetValue: number;
  improvementPercentage: number;
  confidence: number;
}

export interface RiskAssessment {
  level: 'low' | 'medium' | 'high' | 'critical';
  factors: string[];
  mitigations: string[];
  acceptableDowntime: number;
}

export interface RollbackPlan {
  trigger: RollbackTrigger;
  steps: string[];
  estimatedDuration: number;
  dataBackup: boolean;
}

export interface RollbackTrigger {
  conditions: TriggerCondition[];
  threshold: number;
  evaluationPeriod: number;
}

export interface TriggerCondition {
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  value: number;
}

export interface ModelTrainingConfig {
  modelType: ModelType;
  baseModel: string;
  trainingData: TrainingDataset;
  hyperparameters: Record<string, any>;
  validationSplit: number;
  epochs: number;
  batchSize: number;
  learningRate: number;
  optimizations: string[];
}

export interface TrainingDataset {
  sourceDatasets: string[];
  enhancements: DataEnhancement[];
  filters: DataFilter[];
  augmentations: DataAugmentation[];
  totalSamples: number;
  features: string[];
}

export interface DataEnhancement {
  type: string;
  parameters: Record<string, any>;
  addedSamples: number;
}

export interface DataFilter {
  field: string;
  operator: string;
  value: any;
}

export interface DataAugmentation {
  type: string;
  probability: number;
  parameters: Record<string, any>;
}

export interface ModelValidation {
  modelId: string;
  validationResults: ValidationResult[];
  performanceMetrics: PerformanceMetrics;
  comparisonWithBaseline: ComparisonResult;
  passed: boolean;
  issues: ValidationIssue[];
  timestamp: Date;
}

export interface ValidationResult {
  testName: string;
  passed: boolean;
  score: number;
  details: Record<string, any>;
}

export interface PerformanceMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  latency: number;
  throughput: number;
  resourceUsage: ResourceUsage;
}

export interface ResourceUsage {
  cpuUsage: number;
  memoryUsage: number;
  gpuUsage?: number;
  diskIO: number;
  networkIO: number;
}

export interface ComparisonResult {
  baselineModelId: string;
  improvements: Record<string, number>;
  regressions: Record<string, number>;
  overallImprovement: number;
  statisticalSignificance: number;
}

export interface ValidationIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  description: string;
  recommendation: string;
}

export interface DeploymentConfig {
  modelId: string;
  modelType: ModelType;
  strategy: DeploymentStrategy;
  targetEnvironment: string;
  rolloutStages: RolloutStage[];
  healthChecks: HealthCheck[];
  monitoring: MonitoringConfig;
  rollbackConditions: RollbackTrigger;
}

export interface RolloutStage {
  name: string;
  percentage: number;
  duration: number;
  validationCriteria: ValidationCriteria[];
  automaticPromotion: boolean;
}

export interface ValidationCriteria {
  metric: string;
  threshold: number;
  evaluationWindow: number;
}

export interface HealthCheck {
  name: string;
  endpoint: string;
  interval: number;
  timeout: number;
  successThreshold: number;
  failureThreshold: number;
}

export interface MonitoringConfig {
  metrics: string[];
  alertThresholds: AlertThreshold[];
  dashboardUrl: string;
  logLevel: string;
  tracingEnabled: boolean;
}

export interface AlertThreshold {
  metric: string;
  condition: TriggerCondition;
  severity: 'info' | 'warning' | 'error' | 'critical';
  notificationChannels: string[];
}

export interface WorkflowContext {
  workflowId: string;
  modelType: ModelType;
  failureId: string;
  priority: ImprovementPriority;
  startTime: Date;
  metadata: Record<string, any>;
}

export interface WorkflowResult {
  workflowId: string;
  status: WorkflowStatus;
  modelId?: string;
  improvements: ImprovementResult[];
  deploymentResult?: DeploymentResult;
  performanceMetrics?: PerformanceMetrics;
  duration: number;
  completedAt: Date;
}

export interface ImprovementResult {
  improvementId: string;
  type: ImprovementType;
  status: ImprovementStatus;
  metrics: Record<string, number>;
  duration: number;
  details: Record<string, any>;
}

export interface DeploymentResult {
  deploymentId: string;
  status: 'success' | 'failed' | 'rolled_back';
  deployedVersion: string;
  rolloutPercentage: number;
  healthStatus: string;
  metrics: Record<string, number>;
}

export interface Action {
  type: string;
  description: string;
  parameters: Record<string, any>;
  priority: number;
  automated: boolean;
}