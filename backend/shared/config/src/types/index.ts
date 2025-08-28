// Comprehensive TypeScript Types and Interfaces
// For Fine Print AI Configuration Management System

import { z } from 'zod';
import { ConfigurationSchema, FeatureFlagSchema, AgentConfigSchema } from '../schemas';

// Core configuration types
export type Configuration = z.infer<typeof ConfigurationSchema>;
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// Environment types
export type NodeEnvironment = 'development' | 'staging' | 'production';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Service types
export interface ServiceInfo {
  name: string;
  version: string;
  environment: NodeEnvironment;
  startTime: Date;
  endpoints: string[];
  healthCheckUrl?: string;
  dependencies: string[];
}

export interface ServiceRegistration {
  serviceName: string;
  displayName: string;
  description?: string;
  version: string;
  endpoints: string[];
  healthCheck?: string;
  requiredConfigs: string[];
  optionalConfigs: string[];
  environment: NodeEnvironment;
  tags: string[];
}

// Configuration management types
export interface ConfigurationMetadata {
  id: string;
  serviceName: string;
  environment: NodeEnvironment;
  version: number;
  description?: string;
  tags: string[];
  isActive: boolean;
  isValid: boolean;
  validationErrors?: any;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface ConfigurationUpdate {
  config: Record<string, any>;
  description?: string;
  tags?: string[];
  validate?: boolean;
}

export interface ConfigurationHistory {
  configurations: ConfigurationMetadata[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
}

// Feature flag types
export interface FeatureFlagContext {
  userId?: string;
  userGroup?: string;
  region?: string;
  environment: NodeEnvironment;
  customAttributes?: Record<string, any>;
  clientIp?: string;
  userAgent?: string;
}

export interface FeatureFlagEvaluation {
  enabled: boolean;
  variant?: string;
  reason: string;
  metadata?: Record<string, any>;
}

export interface FeatureFlagVariant {
  id: string;
  name: string;
  weight: number; // 0-100
  configuration: Record<string, any>;
}

export interface FeatureFlagRollout {
  percentage: number;
  userGroups?: string[];
  regions?: string[];
  startDate?: Date;
  endDate?: Date;
}

export interface FeatureFlagAnalytics {
  totalEvaluations: number;
  enabledCount: number;
  disabledCount: number;
  variantDistribution: Record<string, number>;
  evaluationsByDate: Array<{ date: string; count: number }>;
  userGroups: Record<string, number>;
  regions: Record<string, number>;
}

// Secret management types
export interface SecretValue {
  key: string;
  value: string;
  description?: string;
  expiresAt?: Date;
}

export interface EncryptedSecret {
  id: string;
  key: string;
  description?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;
  accessCount: number;
}

export interface SecretAccessLog {
  secretId: string;
  key: string;
  accessedAt: Date;
  accessedBy?: string;
  clientIp?: string;
  purpose?: string;
}

// Cache types
export interface CacheEntry<T = any> {
  value: T;
  createdAt: number;
  expiresAt: number;
  version?: number;
  tags?: string[];
}

export interface CacheOptions {
  ttl?: number;
  prefix?: string;
  tags?: string[];
  version?: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
  totalKeys: number;
  memoryUsage: number;
}

// WebSocket types
export interface WebSocketConnection {
  id: string;
  serviceName?: string;
  environment?: NodeEnvironment;
  subscriptions: Set<string>;
  lastPing: Date;
  metadata: {
    userAgent?: string;
    clientIp?: string;
    version?: string;
  };
}

// Message types for WebSocket communication
export type WebSocketMessageType = 
  | 'WELCOME'
  | 'SUBSCRIBE'
  | 'UNSUBSCRIBE'
  | 'PING'
  | 'PONG'
  | 'CONFIGURATION_UPDATE'
  | 'FEATURE_FLAG_UPDATE'
  | 'CONFIGURATION_RELOAD'
  | 'ERROR'
  | 'GET_CONFIG'
  | 'EVALUATE_FLAGS'
  | 'CONFIG_RESPONSE'
  | 'FEATURE_FLAGS_RESPONSE'
  | 'SUBSCRIPTION_CONFIRMED'
  | 'UNSUBSCRIPTION_CONFIRMED';

export interface BaseWebSocketMessage {
  type: WebSocketMessageType;
  timestamp: string;
}

export interface WelcomeMessage extends BaseWebSocketMessage {
  type: 'WELCOME';
  connectionId: string;
}

export interface SubscribeMessage extends BaseWebSocketMessage {
  type: 'SUBSCRIBE';
  serviceName: string;
  environment?: NodeEnvironment;
  subscriptions?: string[];
}

export interface ConfigurationUpdateMessage extends BaseWebSocketMessage {
  type: 'CONFIGURATION_UPDATE';
  serviceName: string;
  environment: NodeEnvironment;
  version: number;
  config: any;
}

export interface FeatureFlagUpdateMessage extends BaseWebSocketMessage {
  type: 'FEATURE_FLAG_UPDATE';
  flagKey: string;
  enabled: boolean;
  rolloutPercentage?: number;
}

export interface ReloadMessage extends BaseWebSocketMessage {
  type: 'CONFIGURATION_RELOAD';
  serviceName: string;
  environment: NodeEnvironment;
  force: boolean;
}

export interface ErrorMessage extends BaseWebSocketMessage {
  type: 'ERROR';
  message: string;
  code?: string;
}

export type WebSocketMessage = 
  | WelcomeMessage
  | SubscribeMessage
  | ConfigurationUpdateMessage
  | FeatureFlagUpdateMessage
  | ReloadMessage
  | ErrorMessage;

// Audit and logging types
export interface AuditLogEntry {
  id: string;
  resourceType: 'configuration' | 'feature_flag' | 'secret';
  resourceId: string;
  action: AuditAction;
  previousValue?: any;
  newValue?: any;
  changes?: Record<string, { from: any; to: any }>;
  reason?: string;
  environment: NodeEnvironment;
  timestamp: Date;
  performedBy?: string;
  clientIp?: string;
  userAgent?: string;
}

export type AuditAction = 
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'ACTIVATE'
  | 'DEACTIVATE'
  | 'ENABLE'
  | 'DISABLE'
  | 'ROLLOUT_UPDATE'
  | 'ACCESS'
  | 'ROTATE';

// Validation types
export interface ValidationRule {
  id: string;
  name: string;
  description?: string;
  rule: any; // JSON schema or validation function
  severity: 'error' | 'warning' | 'info';
  appliesToServices: string[];
  environments: NodeEnvironment[];
  isActive: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string[];
  message: string;
  code: string;
  severity: 'error';
  rule?: string;
}

export interface ValidationWarning {
  path: string[];
  message: string;
  code: string;
  severity: 'warning';
  rule?: string;
}

// Health check types
export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  details?: {
    checks: Record<string, ComponentHealthCheck>;
    version?: string;
    uptime?: number;
    memoryUsage?: MemoryInfo;
    systemInfo?: SystemInfo;
  };
}

export interface ComponentHealthCheck {
  status: 'healthy' | 'unhealthy';
  responseTime?: number;
  details?: any;
  error?: string;
}

export interface MemoryInfo {
  used: number;
  total: number;
  percentage: number;
  heapUsed: number;
  heapTotal: number;
}

export interface SystemInfo {
  nodeVersion: string;
  platform: string;
  arch: string;
  cpuUsage: number;
  loadAverage: number[];
}

// Monitoring and metrics types
export interface MetricPoint {
  timestamp: Date;
  value: number;
  labels?: Record<string, string>;
}

export interface ConfigurationMetrics {
  totalConfigurations: number;
  activeConfigurations: number;
  configurationsByEnvironment: Record<NodeEnvironment, number>;
  configurationsByService: Record<string, number>;
  recentUpdates: MetricPoint[];
  validationErrors: number;
}

export interface FeatureFlagMetrics {
  totalFlags: number;
  enabledFlags: number;
  flagsWithRollout: number;
  flagsByEnvironment: Record<NodeEnvironment, number>;
  evaluationsPerMinute: MetricPoint[];
  rolloutProgress: Record<string, number>;
}

export interface CacheMetrics {
  hitRate: number;
  missRate: number;
  totalKeys: number;
  memoryUsage: number;
  operationsPerSecond: MetricPoint[];
  averageResponseTime: number;
}

export interface SystemMetrics {
  configurations: ConfigurationMetrics;
  featureFlags: FeatureFlagMetrics;
  cache: CacheMetrics;
  webSocket: {
    activeConnections: number;
    connectionsByService: Record<string, number>;
    messagesPerMinute: MetricPoint[];
  };
  database: {
    connectionPoolSize: number;
    activeConnections: number;
    averageQueryTime: number;
    slowQueries: number;
  };
}

// API request/response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    pagination?: PaginationMeta;
    timing?: TimingMeta;
  };
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface TimingMeta {
  requestTime: Date;
  responseTime: Date;
  duration: number;
  cached: boolean;
}

// Error types
export interface ConfigurationError extends Error {
  code: string;
  service?: string;
  environment?: NodeEnvironment;
  configKey?: string;
  details?: any;
}

export interface FeatureFlagError extends Error {
  code: string;
  flagKey?: string;
  context?: FeatureFlagContext;
  details?: any;
}

export interface ValidationError extends Error {
  code: string;
  path: string[];
  rule?: string;
  details?: any;
}

// Business logic types (Fine Print AI specific)
export interface AIModelConfiguration {
  modelName: string;
  provider: 'ollama' | 'openai' | 'anthropic';
  endpoint?: string;
  apiKey?: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  retries: number;
}

export interface DSPyConfiguration {
  models: AIModelConfiguration[];
  defaultModel: string;
  optimizationConfig: {
    metric: 'accuracy' | 'f1' | 'precision' | 'recall';
    maxEvals: number;
    timeout: number;
  };
  cacheEnabled: boolean;
  cacheSize: number;
}

export interface LoRAConfiguration {
  rank: number;
  alpha: number;
  dropout: number;
  targetModules: string[];
  bias: 'none' | 'all' | 'lora_only';
  taskType: 'CAUSAL_LM' | 'SEQ_2_SEQ_LM';
}

export interface BusinessRulesConfiguration {
  riskThresholds: {
    low: number;
    medium: number;
    high: number;
  };
  complianceRules: {
    gdpr: ComplianceRuleConfig;
    ccpa: ComplianceRuleConfig;
    coppa: ComplianceRuleConfig;
  };
  analysisSettings: {
    maxDocumentSize: number;
    timeoutMs: number;
    batchSize: number;
  };
}

export interface ComplianceRuleConfig {
  enabled: boolean;
  strictMode: boolean;
  requiredClauses: string[];
}

export interface AgentConfiguration {
  id: string;
  name: string;
  type: AgentType;
  enabled: boolean;
  priority: number;
  maxConcurrency: number;
  timeout: number;
  retryPolicy: {
    maxRetries: number;
    retryDelay: number;
    exponentialBackoff: boolean;
  };
  configuration: Record<string, any>;
}

export type AgentType = 
  | 'analysis'
  | 'compliance'
  | 'billing'
  | 'notification'
  | 'content-marketing'
  | 'customer-success'
  | 'sales'
  | 'devops'
  | 'fullstack'
  | 'design-system';

export interface IntegrationConfiguration {
  stripe?: {
    publicKey?: string;
    secretKey?: string;
    webhookSecret?: string;
    apiVersion: string;
    maxNetworkRetries: number;
  };
  sendgrid?: {
    apiKey?: string;
    fromEmail?: string;
    templates: Record<string, string>;
  };
  analytics?: {
    enabled: boolean;
    provider: 'internal' | 'google-analytics' | 'mixpanel';
    apiKey?: string;
    trackingId?: string;
  };
}

// Event types for EventEmitter
export interface ConfigurationEvents {
  configurationUpdated: (event: {
    serviceName: string;
    environment: NodeEnvironment;
    version: number;
    config: any;
  }) => void;
  
  configurationReload: (event: {
    serviceName: string;
    environment: NodeEnvironment;
    force: boolean;
    timestamp: string;
  }) => void;
  
  serviceRegistered: (service: ServiceRegistration) => void;
  
  flagCreated: (flag: FeatureFlag) => void;
  flagUpdated: (flag: FeatureFlag) => void;
  flagDeleted: (flag: FeatureFlag) => void;
  
  secretStored: (event: {
    configurationId: string;
    key: string;
    createdBy?: string;
  }) => void;
  
  secretAccessed: (event: {
    configurationId: string;
    key: string;
    accessCount: number;
  }) => void;
  
  cacheHit: (key: string) => void;
  cacheMiss: (key: string) => void;
  cacheSet: (key: string, options?: CacheOptions) => void;
  cacheDelete: (key: string) => void;
  
  connectionEstablished: (connection: WebSocketConnection) => void;
  connectionClosed: (connection: WebSocketConnection) => void;
}

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Database model types (matching Prisma schema)
export interface ConfigurationModel {
  id: string;
  serviceName: string;
  environment: string;
  version: number;
  config: any;
  schema?: any;
  description?: string;
  tags: string[];
  isActive: boolean;
  isValid: boolean;
  validationErrors?: any;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface FeatureFlagModel {
  id: string;
  key: string;
  name: string;
  description?: string;
  enabled: boolean;
  rolloutPercentage: number;
  rolloutUserGroups: string[];
  rolloutRegions: string[];
  rolloutStartDate?: Date;
  rolloutEndDate?: Date;
  variants: any;
  dependencies: string[];
  conditions: any;
  tags: string[];
  environment: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface ConfigurationSecretModel {
  id: string;
  configurationId: string;
  key: string;
  encryptedValue: string;
  iv: string;
  keyVersion: string;
  description?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  lastAccessedAt?: Date;
  accessCount: number;
}