/**
 * Comprehensive type definitions for the Fine Print AI Logging and Metrics System
 */

import { Request, Response } from 'express';

// Core logging levels
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// Environment types
export type Environment = 'development' | 'staging' | 'production' | 'test';

// Service types for the Fine Print AI ecosystem
export type ServiceType = 
  | 'frontend'
  | 'backend'
  | 'mobile'
  | 'extension'
  | 'ai-orchestrator'
  | 'dspy-agent'
  | 'lora-agent'
  | 'knowledge-graph'
  | 'memory-service'
  | 'config-service'
  | 'logger-service'
  | 'auth-service'
  | 'analytics-service'
  | 'payment-service'
  | 'notification-service'
  | 'security-service';

// Agent types for autonomous operations
export type AgentType =
  | 'document-analyzer'
  | 'pattern-detector'
  | 'risk-assessor'
  | 'recommendation-engine'
  | 'compliance-checker'
  | 'business-intelligence'
  | 'customer-insights'
  | 'fraud-detection'
  | 'content-moderator'
  | 'workflow-orchestrator';

// Event categories for structured logging
export type EventCategory =
  | 'business'
  | 'technical'
  | 'security'
  | 'audit'
  | 'performance'
  | 'error'
  | 'user-action'
  | 'system'
  | 'ai-inference'
  | 'compliance';

// Correlation and context tracking
export interface CorrelationContext {
  requestId: string;
  sessionId?: string;
  userId?: string;
  agentId?: string;
  workflowId?: string;
  parentSpanId?: string;
  traceId?: string;
  causationId?: string;
  correlationId?: string;
}

// Enhanced log context with comprehensive metadata
export interface LogContext extends CorrelationContext {
  service: ServiceType;
  environment: Environment;
  version?: string;
  component?: string;
  operation?: string;
  duration?: number;
  metadata?: Record<string, any>;
  tags?: string[];
  businessContext?: BusinessContext;
  technicalContext?: TechnicalContext;
  securityContext?: SecurityContext;
}

// Business context for revenue and customer tracking
export interface BusinessContext {
  customerId?: string;
  organizationId?: string;
  subscriptionId?: string;
  planType?: string;
  revenue?: number;
  conversionEvent?: string;
  churnRisk?: number;
  satisfactionScore?: number;
  feature?: string;
  experiment?: string;
  cohort?: string;
}

// Technical context for performance and system tracking
export interface TechnicalContext {
  hostname?: string;
  pid?: number;
  threadId?: string;
  memoryUsage?: number;
  cpuUsage?: number;
  responseTime?: number;
  statusCode?: number;
  method?: string;
  url?: string;
  userAgent?: string;
  ipAddress?: string;
  region?: string;
  availabilityZone?: string;
}

// Security context for compliance and audit
export interface SecurityContext {
  authMethod?: string;
  permissions?: string[];
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  threatType?: string;
  complianceFlags?: string[];
  dataClassification?: 'public' | 'internal' | 'confidential' | 'restricted';
  accessReason?: string;
  approvalStatus?: string;
}

// Core log entry structure
export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  category: EventCategory;
  context: LogContext;
  error?: ErrorDetails;
  stackTrace?: string;
  fingerprint?: string;
  hash?: string;
}

// Enhanced error details
export interface ErrorDetails {
  name: string;
  message: string;
  code?: string | number;
  stack?: string;
  cause?: Error;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  recoverable?: boolean;
  userImpact?: string;
  resolution?: string;
}

// Metrics collection types
export interface MetricDefinition {
  name: string;
  type: MetricType;
  description: string;
  unit?: string;
  labels?: string[];
  buckets?: number[]; // For histograms
  quantiles?: number[]; // For summaries
}

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

export interface MetricData {
  name: string;
  value: number;
  timestamp: Date;
  labels?: Record<string, string>;
  context?: LogContext;
}

// Business metrics specifically for Fine Print AI
export interface BusinessMetrics {
  revenue: {
    mrr: number; // Monthly Recurring Revenue
    arr: number; // Annual Recurring Revenue
    churn: number;
    ltv: number; // Customer Lifetime Value
    cac: number; // Customer Acquisition Cost
  };
  usage: {
    documentsAnalyzed: number;
    patternsDetected: number;
    recommendationsGenerated: number;
    alertsTriggered: number;
    complianceChecks: number;
  };
  engagement: {
    activeUsers: number;
    sessionsPerUser: number;
    avgSessionDuration: number;
    featureAdoption: Record<string, number>;
    nps: number; // Net Promoter Score
  };
}

// AI-specific metrics for model performance
export interface AIMetrics {
  inference: {
    requestCount: number;
    avgLatency: number;
    errorRate: number;
    throughput: number;
    queueDepth: number;
  };
  accuracy: {
    precision: number;
    recall: number;
    f1Score: number;
    confidenceScore: number;
    falsePositiveRate: number;
  };
  costs: {
    computeCost: number;
    tokenUsage: number;
    trainingCost: number;
    inferenceCount: number;
  };
  models: {
    activeModels: string[];
    modelVersions: Record<string, string>;
    trainingProgress: Record<string, number>;
    deploymentStatus: Record<string, string>;
  };
}

// Distributed tracing interfaces
export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  tags: Record<string, any>;
  logs: SpanLog[];
  status: SpanStatus;
  baggage?: Record<string, string>;
}

export interface SpanLog {
  timestamp: Date;
  fields: Record<string, any>;
}

export type SpanStatus = 'ok' | 'error' | 'timeout' | 'cancelled';

// Real-time streaming interfaces
export interface StreamMessage {
  id: string;
  type: 'log' | 'metric' | 'trace' | 'alert';
  timestamp: Date;
  data: LogEntry | MetricData | TraceSpan | AlertData;
  channel: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

// Alerting system interfaces
export interface AlertRule {
  id: string;
  name: string;
  description: string;
  condition: AlertCondition;
  severity: AlertSeverity;
  channels: AlertChannel[];
  throttle: number; // Minutes between alerts
  enabled: boolean;
  tags: string[];
}

export interface AlertCondition {
  metric: string;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=' | 'contains' | 'regex';
  threshold: number | string;
  timeWindow: number; // Minutes
  evaluationInterval: number; // Seconds
}

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AlertChannel {
  type: 'email' | 'slack' | 'webhook' | 'pagerduty' | 'sms';
  config: Record<string, any>;
}

export interface AlertData {
  id: string;
  ruleId: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  timestamp: Date;
  context: LogContext;
  value: number | string;
  threshold: number | string;
  resolved?: boolean;
  resolvedAt?: Date;
}

// Analytics and pattern recognition
export interface LogPattern {
  id: string;
  pattern: string;
  description: string;
  regex?: RegExp;
  frequency: number;
  lastSeen: Date;
  severity: 'info' | 'warning' | 'error';
  category: EventCategory;
  actions: PatternAction[];
}

export interface PatternAction {
  type: 'alert' | 'suppress' | 'escalate' | 'auto-resolve';
  config: Record<string, any>;
}

export interface AnomalyDetection {
  id: string;
  metric: string;
  baseline: number;
  currentValue: number;
  deviation: number;
  confidence: number;
  timestamp: Date;
  type: 'spike' | 'drop' | 'trend' | 'outlier';
  context: LogContext;
}

// Storage configuration
export interface StorageConfig {
  hot: {
    provider: 'redis' | 'memory';
    retentionHours: number;
    maxSize: string;
  };
  warm: {
    provider: 'postgresql' | 'elasticsearch';
    retentionDays: number;
    indexing: boolean;
  };
  cold: {
    provider: 's3' | 'gcs' | 'azure';
    retentionMonths: number;
    compression: boolean;
  };
}

// Configuration interfaces
export interface LoggerConfig {
  serviceName: string;
  environment: Environment;
  logLevel: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  enableElasticsearch: boolean;
  enableStreaming: boolean;
  enableMetrics: boolean;
  enableTracing: boolean;
  enableAnomalyDetection: boolean;
  storage: StorageConfig;
  redactFields: string[];
  sampling: {
    enabled: boolean;
    rate: number; // 0.0 to 1.0
  };
}

// Service health and status
export interface ServiceHealth {
  service: ServiceType;
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  lastCheck: Date;
  dependencies: DependencyHealth[];
  metrics: {
    requestsPerSecond: number;
    errorRate: number;
    avgResponseTime: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}

export interface DependencyHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  errorRate: number;
  lastCheck: Date;
}

// API request/response interfaces
export interface LogQueryRequest {
  level?: LogLevel[];
  service?: ServiceType[];
  category?: EventCategory[];
  startTime?: Date;
  endTime?: Date;
  search?: string;
  limit?: number;
  offset?: number;
  sort?: 'asc' | 'desc';
  fields?: string[];
  context?: Partial<LogContext>;
}

export interface LogQueryResponse {
  logs: LogEntry[];
  total: number;
  page: number;
  limit: number;
  aggregations?: Record<string, any>;
  patterns?: LogPattern[];
}

export interface MetricsQueryRequest {
  metrics: string[];
  startTime: Date;
  endTime: Date;
  granularity?: '1m' | '5m' | '15m' | '1h' | '6h' | '24h';
  groupBy?: string[];
  filters?: Record<string, string>;
}

export interface MetricsQueryResponse {
  metrics: {
    name: string;
    data: Array<{
      timestamp: Date;
      value: number;
      labels?: Record<string, string>;
    }>;
  }[];
  aggregations?: Record<string, number>;
}

// WebSocket message types for real-time streaming
export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'log' | 'metric' | 'alert' | 'heartbeat' | 'error';
  channel?: string;
  data?: any;
  timestamp?: Date;
}

// Compliance and audit interfaces
export interface ComplianceEvent {
  id: string;
  type: 'data_access' | 'data_modification' | 'data_deletion' | 'permission_change' | 'policy_violation';
  timestamp: Date;
  userId: string;
  resource: string;
  action: string;
  result: 'success' | 'failure' | 'partial';
  context: LogContext;
  regulation: 'gdpr' | 'ccpa' | 'hipaa' | 'sox' | 'pci';
  retentionPeriod: number; // Days
}

// Export all types for external consumption
export * from './metrics';
export * from './streaming';
export * from './alerts';
export * from './analytics';