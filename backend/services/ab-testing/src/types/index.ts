// Core A/B Testing Types and Interfaces

import { z } from 'zod';

// Experiment Types
export interface ExperimentConfig {
  name: string;
  description?: string;
  hypothesis: string;
  type: ExperimentType;
  variants: VariantConfig[];
  trafficAllocation: TrafficAllocation;
  targetingRules?: TargetingRule[];
  metrics: MetricsConfig;
  statisticalConfig: StatisticalConfig;
  schedule?: ExperimentSchedule;
  mabConfig?: MultiArmedBanditConfig;
}

export interface VariantConfig {
  name: string;
  description?: string;
  isControl: boolean;
  allocation: number;
  modelId?: string;
  modelVersion?: string;
  modelConfig?: Record<string, any>;
  features?: Record<string, boolean | string | number>;
}

export interface TrafficAllocation {
  [variantName: string]: number; // 0.0 to 1.0
}

export interface TargetingRule {
  attribute: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
  value: any;
  combinator?: 'AND' | 'OR';
}

export interface MetricsConfig {
  primaryMetric: MetricDefinition;
  secondaryMetrics?: MetricDefinition[];
  guardRailMetrics?: MetricDefinition[];
}

export interface MetricDefinition {
  name: string;
  type: MetricType;
  aggregation: 'sum' | 'mean' | 'count' | 'percentile' | 'custom';
  unit?: string;
  minimumDetectableEffect?: number;
  practicalSignificanceThreshold?: number;
}

export interface StatisticalConfig {
  method: StatisticalMethod;
  confidenceLevel: number;
  power?: number;
  multipleTestingCorrection?: 'bonferroni' | 'benjamini_hochberg' | 'none';
  sequentialTesting?: SequentialTestingConfig;
  bayesianConfig?: BayesianConfig;
}

export interface SequentialTestingConfig {
  method: 'group_sequential' | 'always_valid_inference';
  alphaSplitting: 'pocock' | 'obrien_fleming' | 'custom';
  interimAnalyses: number;
}

export interface BayesianConfig {
  priorType: 'uniform' | 'beta' | 'normal' | 'custom';
  priorParams?: Record<string, number>;
  decisionThreshold: number;
  expectedLossThreshold?: number;
}

export interface MultiArmedBanditConfig {
  algorithm: 'epsilon_greedy' | 'thompson_sampling' | 'ucb' | 'exp3';
  parameters: {
    epsilon?: number;
    decay?: number;
    c?: number; // UCB exploration parameter
    gamma?: number; // EXP3 parameter
  };
  updateFrequency: number; // in seconds
  minimumSamplesPerArm: number;
}

export interface ExperimentSchedule {
  startDate: Date;
  endDate?: Date;
  timezone?: string;
  rampUp?: RampUpConfig;
}

export interface RampUpConfig {
  enabled: boolean;
  stages: Array<{
    percentage: number;
    duration: number; // in hours
  }>;
}

// User Assignment Types
export interface UserContext {
  userId: string;
  attributes?: Record<string, any>;
  sessionId?: string;
  deviceType?: string;
  location?: {
    country?: string;
    region?: string;
    city?: string;
  };
  previousAssignments?: string[];
}

export interface AssignmentDecision {
  experimentId: string;
  variantId: string;
  variantName: string;
  assignmentHash: string;
  isNewAssignment: boolean;
  reason: 'new' | 'sticky' | 'forced' | 'excluded';
}

// Metric Event Types
export interface MetricEvent {
  experimentId: string;
  userId?: string;
  metricName: string;
  value: number;
  timestamp: Date;
  properties?: Record<string, any>;
  variantId?: string;
  sessionId?: string;
  deviceType?: string;
  modelMetrics?: ModelPerformanceMetrics;
}

export interface ModelPerformanceMetrics {
  latency: number; // milliseconds
  cost: number; // dollars
  accuracy?: number;
  tokensUsed?: number;
  cacheHit?: boolean;
  errorRate?: number;
}

// Analysis Types
export interface AnalysisRequest {
  experimentId: string;
  metricName: string;
  analysisType: AnalysisType;
  segmentFilter?: SegmentFilter;
  dateRange?: DateRange;
  options?: AnalysisOptions;
}

export interface SegmentFilter {
  attribute: string;
  operator: string;
  value: any;
  combinator?: 'AND' | 'OR';
  subFilters?: SegmentFilter[];
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface AnalysisOptions {
  includeOutliers?: boolean;
  outlierThreshold?: number;
  bootstrapSamples?: number;
  adjustForMultipleTesting?: boolean;
}

export interface AnalysisResult {
  experimentId: string;
  metricName: string;
  control: VariantStatistics;
  treatments: Record<string, VariantStatistics>;
  comparison: ComparisonResult;
  recommendation: ExperimentRecommendation;
  diagnostics?: DiagnosticInfo;
}

export interface VariantStatistics {
  variantName: string;
  sampleSize: number;
  mean: number;
  variance: number;
  standardError: number;
  confidenceInterval: ConfidenceInterval;
  percentiles?: Record<number, number>;
  histogram?: HistogramBin[];
}

export interface ComparisonResult {
  pValue?: number;
  effectSize: number;
  relativeEffect: number;
  confidenceInterval: ConfidenceInterval;
  statisticalSignificance: boolean;
  practicalSignificance: boolean;
  bayesianProbability?: number;
  credibleInterval?: ConfidenceInterval;
  expectedLoss?: Record<string, number>;
}

export interface ConfidenceInterval {
  lower: number;
  upper: number;
  level: number;
}

export interface HistogramBin {
  min: number;
  max: number;
  count: number;
  frequency: number;
}

export interface ExperimentRecommendation {
  action: 'continue' | 'stop_success' | 'stop_failure' | 'modify_allocation' | 'inconclusive';
  confidence: number;
  reason: string;
  suggestedAllocation?: TrafficAllocation;
  estimatedRemainingTime?: number; // days
  requiredSampleSize?: number;
}

export interface DiagnosticInfo {
  sampleRatioMismatch?: boolean;
  noveltyEffect?: boolean;
  weekdayEffect?: boolean;
  outlierPercentage?: number;
  powerAnalysis?: PowerAnalysisResult;
}

export interface PowerAnalysisResult {
  actualPower: number;
  requiredSampleSize: number;
  currentSampleSize: number;
  minimumDetectableEffect: number;
}

// Decision Types
export interface DecisionRequest {
  experimentId: string;
  decisionType: DecisionType;
  analysisResults: AnalysisResult[];
  businessContext?: BusinessContext;
  automationRules?: AutomationRule[];
}

export interface BusinessContext {
  revenue?: number;
  cost?: number;
  userSatisfaction?: number;
  riskTolerance: 'low' | 'medium' | 'high';
  urgency: 'low' | 'medium' | 'high';
}

export interface AutomationRule {
  condition: string; // Expression to evaluate
  action: string;
  priority: number;
  enabled: boolean;
}

export interface DecisionResult {
  action: string;
  reason: string;
  confidence: number;
  winningVariant?: string;
  newAllocation?: TrafficAllocation;
  implementationPlan?: ImplementationPlan;
}

export interface ImplementationPlan {
  steps: Array<{
    action: string;
    timing: string;
    dependencies?: string[];
  }>;
  rollbackPlan?: string;
  monitoringRequirements?: string[];
}

// Reporting Types
export interface ReportRequest {
  experimentId: string;
  reportType: ReportType;
  recipients: string[];
  includeSegments?: string[];
  customSections?: ReportSection[];
}

export interface ReportSection {
  title: string;
  type: 'text' | 'chart' | 'table' | 'metric';
  content: any;
  order: number;
}

export interface ReportData {
  title: string;
  summary: string;
  sections: ReportSection[];
  keyInsights: string[];
  recommendations: string[];
  businessImpact?: BusinessImpact;
  visualizations: Visualization[];
}

export interface BusinessImpact {
  estimatedRevenue?: number;
  costSavings?: number;
  userRetention?: number;
  conversionLift?: number;
  timeframe: string;
}

export interface Visualization {
  type: 'line' | 'bar' | 'scatter' | 'histogram' | 'funnel' | 'heatmap';
  title: string;
  data: any;
  config: any;
}

// Enums (matching Prisma schema)
export enum ExperimentStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  STOPPED = 'STOPPED',
  ARCHIVED = 'ARCHIVED'
}

export enum ExperimentType {
  AB_TEST = 'AB_TEST',
  MULTIVARIATE = 'MULTIVARIATE',
  MULTI_ARMED_BANDIT = 'MULTI_ARMED_BANDIT',
  FEATURE_ROLLOUT = 'FEATURE_ROLLOUT',
  CANARY_DEPLOYMENT = 'CANARY_DEPLOYMENT'
}

export enum StatisticalMethod {
  FREQUENTIST = 'FREQUENTIST',
  BAYESIAN = 'BAYESIAN',
  SEQUENTIAL = 'SEQUENTIAL',
  MULTI_ARMED_BANDIT = 'MULTI_ARMED_BANDIT'
}

export enum MetricType {
  CONVERSION = 'CONVERSION',
  CONTINUOUS = 'CONTINUOUS',
  COUNT = 'COUNT',
  DURATION = 'DURATION',
  REVENUE = 'REVENUE',
  CUSTOM = 'CUSTOM'
}

export enum AnalysisType {
  INTERIM = 'INTERIM',
  FINAL = 'FINAL',
  SEGMENT = 'SEGMENT',
  COHORT = 'COHORT',
  SEQUENTIAL = 'SEQUENTIAL',
  BAYESIAN = 'BAYESIAN'
}

export enum DecisionType {
  EARLY_STOP_SUCCESS = 'EARLY_STOP_SUCCESS',
  EARLY_STOP_FAILURE = 'EARLY_STOP_FAILURE',
  TRAFFIC_REALLOCATION = 'TRAFFIC_REALLOCATION',
  WINNER_DECLARATION = 'WINNER_DECLARATION',
  EXPERIMENT_EXTENSION = 'EXPERIMENT_EXTENSION',
  MANUAL_OVERRIDE = 'MANUAL_OVERRIDE'
}

export enum ReportType {
  EXECUTIVE_SUMMARY = 'EXECUTIVE_SUMMARY',
  TECHNICAL_ANALYSIS = 'TECHNICAL_ANALYSIS',
  BUSINESS_IMPACT = 'BUSINESS_IMPACT',
  SEGMENT_BREAKDOWN = 'SEGMENT_BREAKDOWN',
  WEEKLY_UPDATE = 'WEEKLY_UPDATE',
  FINAL_REPORT = 'FINAL_REPORT'
}

// Validation Schemas
export const ExperimentConfigSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  hypothesis: z.string().min(1),
  type: z.nativeEnum(ExperimentType),
  variants: z.array(z.object({
    name: z.string(),
    isControl: z.boolean(),
    allocation: z.number().min(0).max(1)
  })).min(2),
  trafficAllocation: z.record(z.number().min(0).max(1)),
  statisticalConfig: z.object({
    method: z.nativeEnum(StatisticalMethod),
    confidenceLevel: z.number().min(0.8).max(0.99),
    power: z.number().min(0.5).max(0.99).optional()
  })
});

export const MetricEventSchema = z.object({
  experimentId: z.string().uuid(),
  userId: z.string().optional(),
  metricName: z.string(),
  value: z.number(),
  timestamp: z.date(),
  properties: z.record(z.any()).optional()
});

// Helper Types
export type ExperimentId = string;
export type VariantId = string;
export type UserId = string;
export type MetricName = string;