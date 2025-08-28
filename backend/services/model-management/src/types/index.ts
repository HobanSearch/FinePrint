/**
 * Type definitions for Model Management Service
 */

export interface ModelConfig {
  id: string;
  name: string;
  type: ModelType;
  endpoint: string;
  avgResponseTime: number; // milliseconds
  successRate: number; // 0-1
  costPerRequest: number; // USD
  maxConcurrency: number;
  timeout: number; // milliseconds
  priority: number; // 1-10, higher is better
  tags: string[];
  capabilities: ModelCapability[];
  status: ModelStatus;
  lastHealthCheck?: Date;
  metrics?: ModelMetrics;
}

export enum ModelType {
  PRIMARY = 'PRIMARY',
  COMPLEX = 'COMPLEX',
  BACKUP = 'BACKUP',
  BUSINESS = 'BUSINESS',
  SPECIALIZED = 'SPECIALIZED'
}

export enum ModelStatus {
  AVAILABLE = 'AVAILABLE',
  BUSY = 'BUSY',
  DEGRADED = 'DEGRADED',
  UNAVAILABLE = 'UNAVAILABLE',
  MAINTENANCE = 'MAINTENANCE'
}

export enum ModelCapability {
  DOCUMENT_ANALYSIS = 'DOCUMENT_ANALYSIS',
  PATTERN_DETECTION = 'PATTERN_DETECTION',
  LEGAL_INTERPRETATION = 'LEGAL_INTERPRETATION',
  RISK_ASSESSMENT = 'RISK_ASSESSMENT',
  MARKETING_ANALYSIS = 'MARKETING_ANALYSIS',
  SALES_INSIGHTS = 'SALES_INSIGHTS',
  CUSTOMER_ANALYTICS = 'CUSTOMER_ANALYTICS',
  BUSINESS_INTELLIGENCE = 'BUSINESS_INTELLIGENCE'
}

export interface ModelMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  totalCost: number;
  lastUpdated: Date;
  hourlyMetrics: HourlyMetric[];
}

export interface HourlyMetric {
  timestamp: Date;
  requests: number;
  avgResponseTime: number;
  errorRate: number;
  cost: number;
}

export interface RequestContext {
  id: string;
  userId: string;
  userTier: UserTier;
  requestType: RequestType;
  priority: RequestPriority;
  complexity: ComplexityLevel;
  capabilities: ModelCapability[];
  timeout?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export enum UserTier {
  FREE = 'FREE',
  PREMIUM = 'PREMIUM',
  ENTERPRISE = 'ENTERPRISE'
}

export enum RequestType {
  DOCUMENT_ANALYSIS = 'DOCUMENT_ANALYSIS',
  QUICK_SCAN = 'QUICK_SCAN',
  DETAILED_REVIEW = 'DETAILED_REVIEW',
  PATTERN_SEARCH = 'PATTERN_SEARCH',
  RISK_ASSESSMENT = 'RISK_ASSESSMENT',
  BUSINESS_QUERY = 'BUSINESS_QUERY'
}

export enum RequestPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

export enum ComplexityLevel {
  SIMPLE = 'SIMPLE',
  MODERATE = 'MODERATE',
  COMPLEX = 'COMPLEX',
  VERY_COMPLEX = 'VERY_COMPLEX'
}

export interface RoutingDecision {
  requestId: string;
  selectedModel: ModelConfig;
  alternativeModels: ModelConfig[];
  routingReason: string;
  estimatedResponseTime: number;
  estimatedCost: number;
  queuePosition?: number;
  cacheHit: boolean;
  timestamp: Date;
}

export interface QueueJob {
  id: string;
  requestContext: RequestContext;
  modelId: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  result?: any;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export enum JobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
  CANCELLED = 'CANCELLED'
}

export interface CostReport {
  period: string;
  totalCost: number;
  modelCosts: ModelCostBreakdown[];
  userTierCosts: UserTierCostBreakdown[];
  savingsFromCache: number;
  projectedMonthlyCost: number;
}

export interface ModelCostBreakdown {
  modelId: string;
  modelName: string;
  requests: number;
  totalCost: number;
  avgCostPerRequest: number;
}

export interface UserTierCostBreakdown {
  tier: UserTier;
  users: number;
  requests: number;
  totalCost: number;
  avgCostPerUser: number;
}

export interface HealthCheck {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  models: ModelHealthStatus[];
  redis: ComponentHealth;
  queue: ComponentHealth;
  timestamp: Date;
}

export interface ModelHealthStatus {
  modelId: string;
  status: ModelStatus;
  responseTime: number;
  lastCheck: Date;
  consecutiveFailures: number;
}

export interface ComponentHealth {
  status: 'healthy' | 'unhealthy';
  latency: number;
  details?: string;
}

export interface CacheEntry {
  key: string;
  value: any;
  modelId: string;
  requestHash: string;
  hits: number;
  createdAt: Date;
  expiresAt: Date;
}