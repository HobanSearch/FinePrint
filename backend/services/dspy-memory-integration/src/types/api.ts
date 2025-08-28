/**
 * API types for DSPy-Memory Integration Service
 */

import { 
  BusinessOutcome, 
  BusinessDomain, 
  LearningPattern, 
  OptimizationJob, 
  TrainingExample,
  LearningSystemMetrics,
  CrossDomainInsight 
} from './learning';

// Base API Response structure
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  metadata?: ResponseMetadata;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: Date;
  requestId: string;
}

export interface ResponseMetadata {
  requestId: string;
  timestamp: Date;
  processingTime: number;
  version: string;
  pagination?: PaginationInfo;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

// Learning API endpoints
export interface CreateLearningJobRequest {
  domain: BusinessDomain;
  type: 'continuous' | 'batch' | 'emergency';
  parameters: {
    targetMetrics: string[];
    constraints?: Record<string, any>;
    priority?: number;
    deadline?: Date;
  };
  triggerEvent?: string;
  metadata?: Record<string, any>;
}

export interface CreateLearningJobResponse extends ApiResponse<OptimizationJob> {}

export interface GetLearningJobResponse extends ApiResponse<OptimizationJob> {}

export interface ListLearningJobsRequest {
  domain?: BusinessDomain;
  status?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  dateFrom?: Date;
  dateTo?: Date;
}

export interface ListLearningJobsResponse extends ApiResponse<OptimizationJob[]> {}

// Business Outcome API endpoints
export interface RecordBusinessOutcomeRequest {
  promptId: string;
  domain: BusinessDomain;
  metrics: Record<string, number>;
  context: Record<string, any>;
  success: boolean;
  confidence?: number;
  metadata?: Record<string, any>;
}

export interface RecordBusinessOutcomeResponse extends ApiResponse<BusinessOutcome> {}

export interface QueryBusinessOutcomesRequest {
  domain?: BusinessDomain;
  promptId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  successOnly?: boolean;
  minConfidence?: number;
  page?: number;
  pageSize?: number;
  aggregation?: {
    groupBy: string[];
    metrics: string[];
    timeGranularity?: 'hour' | 'day' | 'week' | 'month';
  };
}

export interface QueryBusinessOutcomesResponse extends ApiResponse<BusinessOutcome[]> {
  aggregations?: Record<string, any>;
  insights?: string[];
}

// Pattern Discovery API endpoints
export interface DiscoverPatternsRequest {
  domain?: BusinessDomain;
  minSampleSize?: number;
  minConfidence?: number;
  timeWindow?: {
    start: Date;
    end: Date;
  };
  contextFilters?: Record<string, any>;
  includeInactive?: boolean;
}

export interface DiscoverPatternsResponse extends ApiResponse<LearningPattern[]> {
  insights: {
    totalPatterns: number;
    newPatterns: number;
    improvedPatterns: number;
    recommendations: string[];
  };
}

export interface GetPatternDetailsResponse extends ApiResponse<{
  pattern: LearningPattern;
  examples: TrainingExample[];
  performance: {
    historicalMetrics: Record<string, any>;
    trendAnalysis: any[];
    relatedPatterns: string[];
  };
}> {}

export interface UpdatePatternRequest {
  status?: 'active' | 'inactive' | 'testing';
  conditions?: Record<string, any>;
  notes?: string;
}

export interface UpdatePatternResponse extends ApiResponse<LearningPattern> {}

// Training Data API endpoints
export interface GenerateTrainingDataRequest {
  domain: BusinessDomain;
  count: number;
  quality: 'high' | 'medium' | 'low';
  source: 'historical' | 'synthetic' | 'mixed';
  filters?: {
    successOnly?: boolean;
    timeWindow?: { start: Date; end: Date };
    contextFilters?: Record<string, any>;
  };
  augmentation?: {
    enabled: boolean;
    techniques: string[];
    intensity: number;
  };
}

export interface GenerateTrainingDataResponse extends ApiResponse<{
  examples: TrainingExample[];
  statistics: {
    totalGenerated: number;
    qualityDistribution: Record<string, number>;
    sourceDistribution: Record<string, number>;
    domainCoverage: Record<string, number>;
  };
  recommendations: string[];
}> {}

export interface ValidateTrainingDataRequest {
  examples: TrainingExample[];
  validationRules?: {
    qualityThreshold?: number;
    relevanceThreshold?: number;
    diversityRequirement?: boolean;
    biasDetection?: boolean;
  };
}

export interface ValidateTrainingDataResponse extends ApiResponse<{
  validExamples: TrainingExample[];
  invalidExamples: TrainingExample[];
  validationReport: {
    passedChecks: string[];
    failedChecks: string[];
    warnings: string[];
    recommendations: string[];
  };
  qualityMetrics: {
    averageQuality: number;
    diversityScore: number;
    biasScore: number;
    completenessScore: number;
  };
}> {}

// System Monitoring API endpoints
export interface GetSystemMetricsResponse extends ApiResponse<LearningSystemMetrics> {
  trends: {
    metric: string;
    trend: 'up' | 'down' | 'stable';
    change: number;
    timeframe: string;
  }[];
  alerts: {
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    timestamp: Date;
    resolved: boolean;
  }[];
}

export interface GetSystemHealthResponse extends ApiResponse<{
  overall: 'healthy' | 'degraded' | 'critical';
  components: {
    learning_engine: ComponentHealth;
    pattern_recognition: ComponentHealth;
    data_pipeline: ComponentHealth;
    integration_layer: ComponentHealth;
    storage_system: ComponentHealth;
  };
  recommendations: string[];
}> {}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'critical';
  responseTime: number;
  errorRate: number;
  throughput: number;
  lastCheck: Date;
  issues: string[];
}

// Cross-Domain Learning API endpoints
export interface DiscoverCrossDomainInsightsRequest {
  sourceDomains: BusinessDomain[];
  targetDomain: BusinessDomain;
  minApplicability?: number;
  includeExperimental?: boolean;
}

export interface DiscoverCrossDomainInsightsResponse extends ApiResponse<CrossDomainInsight[]> {
  transferOpportunities: {
    insight: string;
    estimatedImpact: 'low' | 'medium' | 'high';
    implementationEffort: 'low' | 'medium' | 'high';
    riskLevel: 'low' | 'medium' | 'high';
  }[];
}

export interface ApplyCrossDomainInsightRequest {
  insightId: string;
  targetDomain: BusinessDomain;
  adaptationStrategy: 'direct' | 'modified' | 'experimental';
  testingPlan?: {
    type: 'ab_test' | 'canary' | 'shadow';
    duration: string;
    successCriteria: string[];
  };
}

export interface ApplyCrossDomainInsightResponse extends ApiResponse<{
  applicationId: string;
  status: 'applied' | 'testing' | 'failed';
  initialResults?: Record<string, number>;
  nextSteps: string[];
}> {}

// Optimization Control API endpoints
export interface TriggerOptimizationRequest {
  domain: BusinessDomain;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  scope: 'single_prompt' | 'domain_wide' | 'cross_domain';
  parameters?: {
    maxIterations?: number;
    convergenceThreshold?: number;
    safetyConstraints?: Record<string, any>;
  };
  reason: string;
}

export interface TriggerOptimizationResponse extends ApiResponse<{
  jobId: string;
  estimatedDuration: string;
  websocketUrl: string;
  monitoringUrl: string;
}> {}

export interface PauseOptimizationRequest {
  jobId: string;
  reason: string;
  resumeAt?: Date;
}

export interface PauseOptimizationResponse extends ApiResponse<{
  status: 'paused';
  pausedAt: Date;
  resumeAt?: Date;
}> {}

export interface CancelOptimizationRequest {
  jobId: string;
  reason: string;
  rollback: boolean;
}

export interface CancelOptimizationResponse extends ApiResponse<{
  status: 'cancelled';
  cancelledAt: Date;
  rollbackStatus?: 'initiated' | 'completed' | 'failed';
}> {}

// Analytics API endpoints
export interface GetLearningAnalyticsRequest {
  domain?: BusinessDomain;
  timeframe: 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
  metrics: string[];
  breakdown?: string[];
  comparison?: {
    type: 'previous_period' | 'baseline' | 'target';
    reference?: Date | number;
  };
}

export interface GetLearningAnalyticsResponse extends ApiResponse<{
  metrics: Record<string, {
    current: number;
    previous?: number;
    change?: number;
    trend: 'up' | 'down' | 'stable';
  }>;
  breakdowns: Record<string, Record<string, number>>;
  insights: {
    type: 'opportunity' | 'warning' | 'achievement';
    message: string;
    impact: 'low' | 'medium' | 'high';
    actionable: boolean;
  }[];
  recommendations: {
    priority: 'low' | 'medium' | 'high';
    action: string;
    expectedImpact: string;
    effort: 'low' | 'medium' | 'high';
  }[];
}> {}

// WebSocket Event types
export interface WebSocketEvent {
  type: WebSocketEventType;
  data: any;
  timestamp: Date;
  correlationId?: string;
}

export enum WebSocketEventType {
  // Job Events
  JOB_STARTED = 'job_started',
  JOB_PROGRESS = 'job_progress',
  JOB_COMPLETED = 'job_completed',
  JOB_FAILED = 'job_failed',
  JOB_PAUSED = 'job_paused',
  JOB_RESUMED = 'job_resumed',
  JOB_CANCELLED = 'job_cancelled',

  // Pattern Events
  PATTERN_DISCOVERED = 'pattern_discovered',
  PATTERN_VALIDATED = 'pattern_validated',
  PATTERN_DEPLOYED = 'pattern_deployed',
  PATTERN_DEPRECATED = 'pattern_deprecated',

  // System Events
  SYSTEM_ALERT = 'system_alert',
  PERFORMANCE_DEGRADATION = 'performance_degradation',
  INTEGRATION_ISSUE = 'integration_issue',
  HEALTH_CHECK_FAILED = 'health_check_failed',

  // Learning Events
  LEARNING_MILESTONE = 'learning_milestone',
  IMPROVEMENT_DETECTED = 'improvement_detected',
  ANOMALY_DETECTED = 'anomaly_detected',
  CROSS_DOMAIN_INSIGHT = 'cross_domain_insight'
}