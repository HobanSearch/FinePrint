/**
 * Core types for the DSPy-Memory Learning System
 */

export interface BusinessOutcome {
  id: string;
  promptId: string;
  domain: BusinessDomain;
  timestamp: Date;
  metrics: BusinessMetrics;
  context: OutcomeContext;
  success: boolean;
  confidence: number;
  metadata?: Record<string, any>;
}

export interface BusinessMetrics {
  // Revenue metrics
  revenue?: {
    amount: number;
    currency: string;
    conversionRate?: number;
    lifetimeValue?: number;
  };

  // Customer satisfaction metrics
  satisfaction?: {
    score: number; // 1-10 scale
    nps?: number; // Net Promoter Score
    responseTime?: number; // in milliseconds
    resolutionRate?: number; // 0-1 scale
  };

  // Performance metrics
  performance?: {
    accuracy: number; // 0-1 scale
    precision?: number;
    recall?: number;
    f1Score?: number;
    responseTime: number;
  };

  // Engagement metrics
  engagement?: {
    clickThroughRate?: number;
    conversionRate?: number;
    bounceRate?: number;
    timeOnPage?: number;
    userRetention?: number;
  };

  // Cost metrics
  cost?: {
    operationalCost: number;
    computeCost: number;
    humanIntervention: boolean;
    escalationRate?: number;
  };
}

export interface OutcomeContext {
  userId?: string;
  sessionId?: string;
  customerSegment?: string;
  productCategory?: string;
  timeOfDay: string;
  dayOfWeek: string;
  seasonality?: string;
  marketConditions?: string;
  userBehaviorPattern?: string;
  previousInteractions?: number;
  deviceType?: string;
  location?: string;
  referralSource?: string;
}

export enum BusinessDomain {
  LEGAL_ANALYSIS = 'legal_analysis',
  MARKETING_CONTENT = 'marketing_content',
  SALES_COMMUNICATION = 'sales_communication',
  CUSTOMER_SUPPORT = 'customer_support',
  PRODUCT_RECOMMENDATIONS = 'product_recommendations',
  PRICING_OPTIMIZATION = 'pricing_optimization',
  RISK_ASSESSMENT = 'risk_assessment',
  COMPLIANCE_MONITORING = 'compliance_monitoring'
}

export interface LearningPattern {
  id: string;
  domain: BusinessDomain;
  pattern: PatternDefinition;
  conditions: PatternConditions;
  outcomes: PatternOutcomes;
  confidence: number;
  sampleSize: number;
  createdAt: Date;
  lastUpdated: Date;
  status: PatternStatus;
}

export interface PatternDefinition {
  promptTemplate: string;
  contextFeatures: string[];
  parameterRanges: Record<string, { min: number; max: number }>;
  successCriteria: SuccessCriteria[];
}

export interface PatternConditions {
  contextFilters: Record<string, any>;
  timeConstraints?: {
    startDate?: Date;
    endDate?: Date;
    dayOfWeek?: string[];
    timeOfDay?: { start: string; end: string };
  };
  userSegments?: string[];
  minimumSampleSize: number;
}

export interface PatternOutcomes {
  averageMetrics: BusinessMetrics;
  successRate: number;
  improvementOverBaseline: number;
  costEffectiveness: number;
  riskScore: number;
  adaptabilityScore: number;
}

export interface SuccessCriteria {
  metric: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
  value: number;
  weight: number;
}

export enum PatternStatus {
  LEARNING = 'learning',
  VALIDATED = 'validated',
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
  TESTING = 'testing'
}

export interface TrainingExample {
  id: string;
  domain: BusinessDomain;
  input: TrainingInput;
  output: TrainingOutput;
  outcome: BusinessOutcome;
  qualityScore: number;
  relevanceScore: number;
  timestamp: Date;
  source: TrainingSource;
}

export interface TrainingInput {
  prompt: string;
  context: Record<string, any>;
  parameters: Record<string, any>;
  expectedType: string;
}

export interface TrainingOutput {
  response: string;
  confidence: number;
  processingTime: number;
  tokens: number;
  cost: number;
}

export enum TrainingSource {
  HISTORICAL_SUCCESS = 'historical_success',
  SYNTHETIC_GENERATION = 'synthetic_generation',
  EXPERT_ANNOTATION = 'expert_annotation',
  USER_FEEDBACK = 'user_feedback',
  AB_TEST_WINNER = 'ab_test_winner'
}

export interface OptimizationJob {
  id: string;
  domain: BusinessDomain;
  type: OptimizationType;
  status: OptimizationStatus;
  parameters: OptimizationParameters;
  results?: OptimizationResults;
  startTime: Date;
  endTime?: Date;
  estimatedDuration: number;
  priority: number;
  createdBy: string;
}

export enum OptimizationType {
  CONTINUOUS_LEARNING = 'continuous_learning',
  AB_TEST_OPTIMIZATION = 'ab_test_optimization',
  BATCH_IMPROVEMENT = 'batch_improvement',
  EMERGENCY_CORRECTION = 'emergency_correction',
  SEASONAL_ADAPTATION = 'seasonal_adaptation'
}

export enum OptimizationStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PAUSED = 'paused'
}

export interface OptimizationParameters {
  targetMetrics: string[];
  constraints: OptimizationConstraint[];
  explorationRate: number;
  learningRate: number;
  maxIterations: number;
  convergenceThreshold: number;
  safetyThreshold: number;
  rollbackThreshold: number;
}

export interface OptimizationConstraint {
  metric: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte';
  value: number;
  hard: boolean; // Hard constraints vs soft preferences
}

export interface OptimizationResults {
  improvementMetrics: Record<string, number>;
  newPromptTemplates: PromptTemplate[];
  performanceGains: PerformanceGain[];
  recommendations: OptimizationRecommendation[];
  riskAssessment: RiskAssessment;
  deploymentStrategy: DeploymentStrategy;
}

export interface PromptTemplate {
  id: string;
  domain: BusinessDomain;
  template: string;
  parameters: Record<string, any>;
  expectedPerformance: BusinessMetrics;
  validationStatus: ValidationStatus;
  version: string;
}

export enum ValidationStatus {
  PENDING = 'pending',
  VALIDATED = 'validated',
  REJECTED = 'rejected',
  REQUIRES_REVIEW = 'requires_review'
}

export interface PerformanceGain {
  metric: string;
  baseline: number;
  optimized: number;
  improvement: number;
  confidence: number;
  statisticalSignificance: number;
}

export interface OptimizationRecommendation {
  type: RecommendationType;
  description: string;
  impact: ImpactLevel;
  effort: EffortLevel;
  riskLevel: RiskLevel;
  timeline: string;
  prerequisites: string[];
}

export enum RecommendationType {
  DEPLOY_IMMEDIATELY = 'deploy_immediately',
  GRADUAL_ROLLOUT = 'gradual_rollout',
  AB_TEST_FIRST = 'ab_test_first',
  REQUIRE_REVIEW = 'require_review',
  POSTPONE = 'postpone'
}

export enum ImpactLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum EffortLevel {
  MINIMAL = 'minimal',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export enum RiskLevel {
  VERY_LOW = 'very_low',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface RiskAssessment {
  overallRisk: RiskLevel;
  riskFactors: RiskFactor[];
  mitigationStrategies: string[];
  monitoringRequirements: string[];
  rollbackPlan: string;
}

export interface RiskFactor {
  factor: string;
  severity: RiskLevel;
  probability: number;
  impact: string;
  mitigation: string;
}

export interface DeploymentStrategy {
  strategy: DeploymentStrategyType;
  phases: DeploymentPhase[];
  successCriteria: SuccessCriteria[];
  monitoringPlan: MonitoringPlan;
  rollbackTriggers: RollbackTrigger[];
}

export enum DeploymentStrategyType {
  IMMEDIATE = 'immediate',
  GRADUAL = 'gradual',
  CANARY = 'canary',
  BLUE_GREEN = 'blue_green',
  AB_TEST = 'ab_test'
}

export interface DeploymentPhase {
  phase: number;
  description: string;
  trafficPercentage: number;
  duration: string;
  successCriteria: SuccessCriteria[];
  rollbackCriteria: SuccessCriteria[];
}

export interface MonitoringPlan {
  metrics: string[];
  alertThresholds: Record<string, number>;
  dashboardUrl?: string;
  reportingFrequency: string;
  stakeholders: string[];
}

export interface RollbackTrigger {
  condition: string;
  threshold: number;
  timeWindow: string;
  automatic: boolean;
  severity: RiskLevel;
}

export interface LearningSystemMetrics {
  totalOutcomes: number;
  successRate: number;
  averageImprovement: number;
  activePatterns: number;
  processingLatency: number;
  systemLoad: number;
  memoryUsage: number;
  errorRate: number;
  lastOptimization: Date;
  uptimePercentage: number;
}

export interface CrossDomainInsight {
  id: string;
  sourcedomains: BusinessDomain[];
  targetDomain: BusinessDomain;
  insight: string;
  applicability: number;
  transferSuccess: number;
  examples: string[];
  createdAt: Date;
  appliedAt?: Date;
}