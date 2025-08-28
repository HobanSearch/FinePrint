/**
 * Core types for the Content Optimizer Service
 * Defines all data structures for content optimization, personalization, and delivery
 */

// Content Types
export interface ContentVariant {
  id: string;
  experimentId: string;
  variantId: string;
  content: Record<string, any>;
  performance: PerformanceMetrics;
  status: 'active' | 'winner' | 'loser' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

export interface PerformanceMetrics {
  impressions: number;
  conversions: number;
  conversionRate: number;
  confidence: number;
  pValue?: number;
  effectSize?: number;
  revenue?: number;
}

export interface OptimizedContent {
  content: Record<string, any>;
  metadata?: {
    variant?: string;
    confidence?: number;
    personalized?: boolean;
    segment?: string;
  };
}

// User Segmentation
export type UserSegment = 'enterprise' | 'smb' | 'startup' | 'individual' | 'unknown';
export type Industry = 'tech' | 'finance' | 'healthcare' | 'legal' | 'retail' | 'other';
export type Geographic = 'us' | 'eu' | 'apac' | 'latam' | 'other';

export interface UserContext {
  userId?: string;
  sessionId: string;
  segment?: UserSegment;
  industry?: Industry;
  geographic?: Geographic;
  behavior?: UserBehavior;
  preferences?: UserPreferences;
}

export interface UserBehavior {
  pageViews: number;
  sessionDuration: number;
  lastVisit?: Date;
  actions: string[];
  engagement: 'high' | 'medium' | 'low';
}

export interface UserPreferences {
  language?: string;
  features?: string[];
  communicationStyle?: 'formal' | 'casual' | 'technical';
}

// Content Categories
export type ContentCategory = 'marketing' | 'sales' | 'support' | 'seo';

export interface ContentRequest {
  category: ContentCategory;
  page?: string;
  context?: UserContext;
  options?: ContentOptions;
}

export interface ContentOptions {
  fallbackToDefault?: boolean;
  includeMetadata?: boolean;
  personalize?: boolean;
  cacheKey?: string;
}

// Experiment Integration
export interface ExperimentResult {
  experimentId: string;
  winnerVariantId: string;
  confidence: number;
  pValue: number;
  sampleSize: number;
  completedAt: Date;
}

export interface ExperimentUpdate {
  experimentId: string;
  variantId: string;
  metrics: PerformanceMetrics;
  timestamp: Date;
}

// Multi-Armed Bandit
export interface BanditArm {
  id: string;
  pulls: number;
  rewards: number;
  alpha: number; // Thompson Sampling parameter
  beta: number;  // Thompson Sampling parameter
  averageReward: number;
  lastPull?: Date;
}

export interface BanditState {
  arms: Map<string, BanditArm>;
  totalPulls: number;
  explorationRate: number;
  lastUpdate: Date;
}

// Content Versioning
export interface ContentVersion {
  id: string;
  category: ContentCategory;
  page: string;
  version: string;
  content: Record<string, any>;
  status: 'draft' | 'active' | 'archived';
  performance?: PerformanceMetrics;
  createdAt: Date;
  activatedAt?: Date;
  archivedAt?: Date;
}

export interface ContentHistory {
  versionId: string;
  action: 'created' | 'activated' | 'updated' | 'archived' | 'rolled_back';
  performanceSnapshot?: PerformanceMetrics;
  reason?: string;
  timestamp: Date;
  userId?: string;
}

// Cache Configuration
export interface CacheConfig {
  ttl: number;
  warmOnStartup: boolean;
  layers: CacheLayer[];
}

export interface CacheLayer {
  name: 'memory' | 'redis' | 'database';
  ttl: number;
  maxSize?: number;
  priority: number;
}

export interface CacheEntry {
  key: string;
  value: any;
  ttl: number;
  hits: number;
  createdAt: Date;
  lastAccess: Date;
}

// Service Configuration
export interface ServiceConfig {
  port: number;
  redis: RedisConfig;
  database: DatabaseConfig;
  optimization: OptimizationConfig;
  cache: CacheConfig;
  integration: IntegrationConfig;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
}

export interface DatabaseConfig {
  url: string;
  maxConnections: number;
  connectionTimeout: number;
}

export interface OptimizationConfig {
  minSampleSize: number;
  confidenceThreshold: number;
  explorationRate: number;
  updateInterval: number;
  winnerPromotionDelay: number;
}

export interface IntegrationConfig {
  digitalTwinUrl: string;
  businessAgentUrl: string;
  websocketUrl: string;
  apiKey?: string;
  timeout: number;
}

// API Response Types
export interface ContentResponse {
  success: boolean;
  content?: Record<string, any>;
  error?: string;
  timestamp: Date;
}

export interface HealthStatus {
  healthy: boolean;
  version: string;
  uptime: number;
  connections: {
    redis: boolean;
    database: boolean;
    digitalTwin: boolean;
  };
  metrics: {
    requestsPerMinute: number;
    averageResponseTime: number;
    cacheHitRate: number;
  };
}

// Error Types
export class ContentOptimizationError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'ContentOptimizationError';
  }
}

export class CacheError extends ContentOptimizationError {
  constructor(message: string) {
    super(message, 'CACHE_ERROR', 500);
    this.name = 'CacheError';
  }
}

export class IntegrationError extends ContentOptimizationError {
  constructor(message: string, service: string) {
    super(`Integration error with ${service}: ${message}`, 'INTEGRATION_ERROR', 503);
    this.name = 'IntegrationError';
  }
}