/**
 * Integration types for connecting DSPy, Memory, and Business Intelligence services
 */

import { BusinessOutcome, BusinessDomain, BusinessMetrics } from './learning';

export interface ServiceConnection {
  serviceName: string;
  endpoint: string;
  apiKey?: string;
  healthStatus: ConnectionStatus;
  lastPing: Date;
  responseTime: number;
  errorCount: number;
  version: string;
}

export enum ConnectionStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  DISCONNECTED = 'disconnected'
}

export interface DSPyIntegration {
  connection: ServiceConnection;
  optimizationEndpoint: string;
  evaluationEndpoint: string;
  templateEndpoint: string;
  websocketEndpoint: string;
  supportedModels: string[];
  capabilities: DSPyCapability[];
}

export interface DSPyCapability {
  name: string;
  description: string;
  supportedDomains: BusinessDomain[];
  parameters: CapabilityParameter[];
  constraints: CapabilityConstraint[];
}

export interface CapabilityParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  defaultValue?: any;
  description: string;
  validation?: ParameterValidation;
}

export interface ParameterValidation {
  min?: number;
  max?: number;
  pattern?: string;
  enum?: any[];
  custom?: string;
}

export interface CapabilityConstraint {
  parameter: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'in' | 'not_in';
  value: any;
  message: string;
}

export interface MemoryIntegration {
  connection: ServiceConnection;
  storageEndpoint: string;
  retrievalEndpoint: string;
  searchEndpoint: string;
  consolidationEndpoint: string;
  supportedTypes: MemoryType[];
  retentionPolicies: RetentionPolicy[];
}

export enum MemoryType {
  SHORT_TERM = 'short_term',
  LONG_TERM = 'long_term',
  WORKING = 'working',
  EPISODIC = 'episodic',
  SEMANTIC = 'semantic',
  PROCEDURAL = 'procedural'
}

export interface RetentionPolicy {
  type: MemoryType;
  duration: string;
  compressionLevel: number;
  archivalRules: ArchivalRule[];
}

export interface ArchivalRule {
  condition: string;
  action: 'compress' | 'archive' | 'delete' | 'migrate';
  threshold: number;
  schedule: string;
}

export interface BusinessIntelligenceIntegration {
  connection: ServiceConnection;
  metricsEndpoint: string;
  analyticsEndpoint: string;
  predictiveEndpoint: string;
  dashboardEndpoint: string;
  supportedMetrics: SupportedMetric[];
  reportingCapabilities: ReportingCapability[];
}

export interface SupportedMetric {
  name: string;
  category: MetricCategory;
  unit: string;
  aggregationMethods: AggregationMethod[];
  realTimeSupport: boolean;
  historicalDepth: string;
}

export enum MetricCategory {
  FINANCIAL = 'financial',
  OPERATIONAL = 'operational',
  CUSTOMER = 'customer',
  TECHNICAL = 'technical',
  STRATEGIC = 'strategic'
}

export enum AggregationMethod {
  SUM = 'sum',
  AVERAGE = 'average',
  COUNT = 'count',
  MIN = 'min',
  MAX = 'max',
  MEDIAN = 'median',
  PERCENTILE = 'percentile',
  RATE = 'rate'
}

export interface ReportingCapability {
  name: string;
  description: string;
  frequency: ReportingFrequency;
  format: ReportFormat[];
  customizable: boolean;
  realTime: boolean;
}

export enum ReportingFrequency {
  REAL_TIME = 'real_time',
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  ANNUALLY = 'annually'
}

export enum ReportFormat {
  JSON = 'json',
  CSV = 'csv',
  PDF = 'pdf',
  HTML = 'html',
  EXCEL = 'excel',
  DASHBOARD = 'dashboard'
}

export interface IntegrationHealth {
  overall: ConnectionStatus;
  services: {
    dspy: ServiceHealth;
    memory: ServiceHealth;
    businessIntelligence: ServiceHealth;
  };
  lastHealthCheck: Date;
  issues: HealthIssue[];
}

export interface ServiceHealth {
  status: ConnectionStatus;
  responseTime: number;
  errorRate: number;
  throughput: number;
  lastSuccessfulCall: Date;
  capabilities: string[];
  limitations: string[];
}

export interface HealthIssue {
  service: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  resolution: string;
  timestamp: Date;
  resolved: boolean;
}

export interface DataFlow {
  id: string;
  source: DataSource;
  destination: DataDestination;
  transformation: DataTransformation[];
  status: FlowStatus;
  throughput: number;
  latency: number;
  errorRate: number;
  lastProcessed: Date;
}

export interface DataSource {
  service: string;
  endpoint: string;
  dataType: string;
  frequency: string;
  volume: number;
  format: string;
}

export interface DataDestination {
  service: string;
  endpoint: string;
  storageType: string;
  retention: string;
  encryption: boolean;
  backup: boolean;
}

export interface DataTransformation {
  step: number;
  operation: TransformationOperation;
  parameters: Record<string, any>;
  validation: ValidationRule[];
  errorHandling: ErrorHandlingStrategy;
}

export enum TransformationOperation {
  FILTER = 'filter',
  MAP = 'map',
  REDUCE = 'reduce',
  AGGREGATE = 'aggregate',
  NORMALIZE = 'normalize',
  VALIDATE = 'validate',
  ENRICH = 'enrich',
  SPLIT = 'split',
  MERGE = 'merge'
}

export interface ValidationRule {
  field: string;
  rule: string;
  parameters?: any[];
  errorMessage: string;
  action: 'warn' | 'skip' | 'fail';
}

export enum ErrorHandlingStrategy {
  IGNORE = 'ignore',
  LOG = 'log',
  RETRY = 'retry',
  FALLBACK = 'fallback',
  FAIL = 'fail',
  QUARANTINE = 'quarantine'
}

export enum FlowStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  FAILED = 'failed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export interface LearningEvent {
  id: string;
  type: LearningEventType;
  source: string;
  timestamp: Date;
  data: Record<string, any>;
  context: EventContext;
  processed: boolean;
  retryCount: number;
}

export enum LearningEventType {
  BUSINESS_OUTCOME = 'business_outcome',
  PROMPT_EVALUATION = 'prompt_evaluation',
  OPTIMIZATION_COMPLETE = 'optimization_complete',
  PATTERN_DISCOVERED = 'pattern_discovered',
  ANOMALY_DETECTED = 'anomaly_detected',
  FEEDBACK_RECEIVED = 'feedback_received',
  DEPLOYMENT_SUCCESS = 'deployment_success',
  DEPLOYMENT_FAILURE = 'deployment_failure'
}

export interface EventContext {
  correlationId: string;
  sessionId?: string;
  userId?: string;
  domain: BusinessDomain;
  environment: 'development' | 'staging' | 'production';
  version: string;
  metadata?: Record<string, any>;
}