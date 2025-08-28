/**
 * Fine Print AI - Shared Memory Service Types
 * Comprehensive type definitions for autonomous agent memory system
 */

import { z } from 'zod';

// Re-export Prisma generated types
export * from '@prisma/client';

// Storage tiers for multi-tier architecture
export enum StorageTier {
  HOT = 'HOT',     // Redis - sub-second access
  WARM = 'WARM',   // PostgreSQL - sub-10ms access
  COLD = 'COLD'    // S3 - archival storage
}

// Memory importance levels
export enum ImportanceLevel {
  CRITICAL = 'CRITICAL',   // Never delete, highest priority
  HIGH = 'HIGH',           // Keep for extended periods
  MEDIUM = 'MEDIUM',       // Standard retention
  LOW = 'LOW',             // Eligible for cleanup
  TRANSIENT = 'TRANSIENT' // Short-term only
}

// Memory types for categorization
export enum MemoryType {
  WORKING = 'WORKING',       // Current context and temporary calculations
  EPISODIC = 'EPISODIC',     // Specific experiences and interactions
  SEMANTIC = 'SEMANTIC',     // General knowledge and learned patterns
  PROCEDURAL = 'PROCEDURAL', // Learned skills and automated responses
  SHARED = 'SHARED',         // Cross-agent knowledge sharing
  BUSINESS = 'BUSINESS'      // Customer insights and business metrics
}

// Access patterns for optimization
export enum AccessPattern {
  FREQUENT = 'FREQUENT',     // Accessed multiple times per day
  REGULAR = 'REGULAR',       // Accessed weekly
  OCCASIONAL = 'OCCASIONAL', // Accessed monthly
  RARE = 'RARE'              // Rarely accessed
}

// Memory operation types
export enum MemoryOperation {
  CREATE = 'CREATE',
  READ = 'READ',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  ARCHIVE = 'ARCHIVE',
  RESTORE = 'RESTORE',
  CONSOLIDATE = 'CONSOLIDATE',
  SHARE = 'SHARE'
}

// Vector similarity search configuration
export interface VectorSearchConfig {
  algorithm: 'cosine' | 'euclidean' | 'dot_product';
  threshold: number;
  maxResults: number;
  includeMetadata: boolean;
}

// Memory query filters
export interface MemoryFilter {
  types?: MemoryType[];
  agentIds?: string[];
  categories?: string[];
  tags?: string[];
  importanceLevels?: ImportanceLevel[];
  storageTiers?: StorageTier[];
  dateRange?: {
    from: Date;
    to: Date;
  };
  textSearch?: string;
  vectorSearch?: {
    embedding: number[];
    config: VectorSearchConfig;
  };
}

// Memory creation input
export interface CreateMemoryInput {
  type: MemoryType;
  category: string;
  title: string;
  description?: string;
  content: Record<string, any>;
  metadata?: Record<string, any>;
  tags?: string[];
  agentId: string;
  sessionId?: string;
  conversationId?: string;
  parentId?: string;
  importanceLevel?: ImportanceLevel;
  validUntil?: Date;
  contextDate?: Date;
}

// Memory update input
export interface UpdateMemoryInput {
  title?: string;
  description?: string;
  content?: Record<string, any>;
  metadata?: Record<string, any>;
  tags?: string[];
  importanceLevel?: ImportanceLevel;
  validUntil?: Date;
  version?: number;
}

// Memory search result
export interface MemorySearchResult {
  id: string;
  type: MemoryType;
  title: string;
  content: Record<string, any>;
  metadata: Record<string, any>;
  similarity?: number;
  rank?: number;
  relevanceScore?: number;
  createdAt: Date;
  updatedAt: Date;
}

// Working memory specific types
export interface WorkingMemoryData {
  priority: number;
  ttlSeconds: number;
  taskContext: Record<string, any>;
  dependencies: string[];
  processingTime?: number;
  memoryUsage?: number;
}

// Episodic memory specific types  
export interface EpisodicMemoryData {
  episodeType: string;
  duration?: number;
  outcome?: 'success' | 'failure' | 'partial';
  participants: string[];
  location?: string;
  environment: Record<string, any>;
  inputModalities: string[];
  outputActions: string[];
  emotionalTone?: 'positive' | 'negative' | 'neutral';
  significance: number;
}

// Semantic memory specific types
export interface SemanticMemoryData {
  concept: string;
  domain: string;
  facts: Array<{
    statement: string;
    confidence: number;
    sources: string[];
  }>;
  rules: Array<{
    condition: string;
    conclusion: string;
    confidence: number;
  }>;
  exceptions: Array<{
    rule: string;
    exception: string;
    context: string;
  }>;
  certaintyLevel: number;
  evidenceCount: number;
  contradictionCount: number;
  abstractionLevel: number;
  applicability: string[];
}

// Procedural memory specific types
export interface ProceduralMemoryData {
  procedureName: string;
  skillDomain: string;
  steps: Array<{
    order: number;
    description: string;
    action: string;
    parameters?: Record<string, any>;
    conditions?: string[];
  }>;
  conditions: Record<string, any>;
  parameters: Record<string, any>;
  successRate: number;
  avgExecutionTime?: number;
  complexity: number;
  practiceCount: number;
  masteryLevel: number;
  lastPracticed?: Date;
  variations: Array<{
    name: string;
    modifications: Record<string, any>;
    successRate: number;
  }>;
  adaptability: number;
}

// Business memory specific types
export interface BusinessMemoryData {
  businessDomain: string;
  metricType: string;
  customerSegment?: string;
  industryVertical?: string;
  companySize?: 'small' | 'medium' | 'large' | 'enterprise';
  kpiValue?: number;
  trend?: 'increasing' | 'decreasing' | 'stable';
  benchmarkValue?: number;
  competitorInfo: Record<string, any>;
  marketConditions: Record<string, any>;
  seasonality: Record<string, any>;
  revenueImpact?: number;
  costImpact?: number;
  roi?: number;
}

// Memory consolidation configuration
export interface ConsolidationConfig {
  strategy: 'merge' | 'summarize' | 'prioritize';
  algorithm: string;
  threshold: number;
  maxSourceMemories: number;
  preserveOriginals: boolean;
}

// Memory sharing permissions
export interface MemorySharingPermissions {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canShare: boolean;
}

// Memory sharing configuration
export interface MemorySharingConfig {
  ownerAgentId: string;
  targetAgentId: string;
  memoryId?: string;
  memoryType?: MemoryType;
  permissions: MemorySharingPermissions;
  filters?: Record<string, any>;
  maxRecords?: number;
  validUntil?: Date;
}

// Storage configuration for multi-tier system
export interface StorageConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    ttl: number;
  };
  postgresql: {
    url: string;
    maxConnections: number;
    connectionTimeout: number;
  };
  s3: {
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    compressionLevel: number;
  };
}

// Memory lifecycle policies
export interface LifecyclePolicies {
  retention: {
    [key in MemoryType]: {
      [key in ImportanceLevel]: number; // days
    };
  };
  archival: {
    hotToWarm: number; // days
    warmToCold: number; // days
  };
  consolidation: {
    enabled: boolean;
    threshold: number;
    schedule: string; // cron expression
  };
  cleanup: {
    enabled: boolean;
    schedule: string; // cron expression
    dryRun: boolean;
  };
}

// Performance metrics
export interface MemoryPerformanceMetrics {
  responseTime: {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  throughput: {
    reads: number;
    writes: number;
    total: number;
  };
  storage: {
    totalSize: number;
    tierDistribution: Record<StorageTier, number>;
  };
  caching: {
    hitRate: number;
    missRate: number;
    evictionRate: number;
  };
  errors: {
    total: number;
    rate: number;
    types: Record<string, number>;
  };
}

// Agent memory statistics
export interface AgentMemoryStats {
  agentId: string;
  totalMemories: number;
  memoryTypes: Record<MemoryType, number>;
  storageUsage: number;
  accessPatterns: Record<AccessPattern, number>;
  performanceMetrics: MemoryPerformanceMetrics;
  lastUpdated: Date;
}

// Memory service configuration
export interface MemoryServiceConfig {
  storage: StorageConfig;
  lifecycle: LifecyclePolicies;
  vectorSearch: {
    enabled: boolean;
    embeddingModel: string;
    dimensions: number;
    indexType: string;
  };
  security: {
    encryptionEnabled: boolean;
    encryptionKey: string;
    accessLogging: boolean;
  };
  performance: {
    cachingEnabled: boolean;
    cacheSize: number;
    batchSize: number;
    timeoutMs: number;
    retryAttempts: number;
  };
  monitoring: {
    metricsEnabled: boolean;
    healthCheckInterval: number;
    alertThresholds: Record<string, number>;
  };
}

// Validation schemas using Zod
export const CreateMemorySchema = z.object({
  type: z.nativeEnum(MemoryType),
  category: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  content: z.record(z.any()),
  metadata: z.record(z.any()).optional(),
  tags: z.array(z.string()).optional(),
  agentId: z.string().uuid(),
  sessionId: z.string().optional(),
  conversationId: z.string().optional(),
  parentId: z.string().optional(),
  importanceLevel: z.nativeEnum(ImportanceLevel).optional(),
  validUntil: z.date().optional(),
  contextDate: z.date().optional(),
});

export const UpdateMemorySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  content: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  tags: z.array(z.string()).optional(),
  importanceLevel: z.nativeEnum(ImportanceLevel).optional(),
  validUntil: z.date().optional(),
  version: z.number().int().positive().optional(),
});

export const MemoryFilterSchema = z.object({
  types: z.array(z.nativeEnum(MemoryType)).optional(),
  agentIds: z.array(z.string().uuid()).optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  importanceLevels: z.array(z.nativeEnum(ImportanceLevel)).optional(),
  storageTiers: z.array(z.nativeEnum(StorageTier)).optional(),
  dateRange: z.object({
    from: z.date(),
    to: z.date(),
  }).optional(),
  textSearch: z.string().optional(),
  vectorSearch: z.object({
    embedding: z.array(z.number()),
    config: z.object({
      algorithm: z.enum(['cosine', 'euclidean', 'dot_product']),
      threshold: z.number().min(0).max(1),
      maxResults: z.number().int().positive(),
      includeMetadata: z.boolean(),
    }),
  }).optional(),
});

export const MemorySharingConfigSchema = z.object({
  ownerAgentId: z.string().uuid(),
  targetAgentId: z.string().uuid(),
  memoryId: z.string().optional(),
  memoryType: z.nativeEnum(MemoryType).optional(),
  permissions: z.object({
    canRead: z.boolean(),
    canWrite: z.boolean(),
    canDelete: z.boolean(),
    canShare: z.boolean(),
  }),
  filters: z.record(z.any()).optional(),
  maxRecords: z.number().int().positive().optional(),
  validUntil: z.date().optional(),
});

// API response types
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    pagination?: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
    performance?: {
      responseTime: number;
      cacheHit: boolean;
    };
  };
}

export interface MemorySearchResponse extends APIResponse<MemorySearchResult[]> {
  metadata?: {
    totalResults: number;
    searchTime: number;
    usedIndex: boolean;
    queryOptimized: boolean;
  };
}

// WebSocket message types for real-time updates
export interface WebSocketMessage {
  type: 'memory_created' | 'memory_updated' | 'memory_deleted' | 'memory_shared' | 'sync_status';
  agentId: string;
  memoryId?: string;
  data: any;
  timestamp: Date;
}

// Integration interfaces for other services
export interface ConfigServiceIntegration {
  getMemoryConfig(agentId: string): Promise<MemoryServiceConfig>;
  updateMemoryConfig(agentId: string, config: Partial<MemoryServiceConfig>): Promise<void>;
}

export interface DSPyIntegration {
  optimizeMemoryPrompts(memories: MemorySearchResult[]): Promise<string[]>;
  extractMemoryPatterns(memories: MemorySearchResult[]): Promise<Record<string, any>>;
}

export interface LoRAIntegration {
  trainFromMemories(agentId: string, memories: MemorySearchResult[]): Promise<string>;
  applyMemoryBasedOptimizations(modelId: string, memories: MemorySearchResult[]): Promise<void>;
}

export interface KnowledgeGraphIntegration {
  createMemoryRelations(memoryId: string, content: Record<string, any>): Promise<void>;
  findRelatedConcepts(concept: string): Promise<string[]>;
  updateConceptGraph(memories: MemorySearchResult[]): Promise<void>;
}

// Error types
export class MemoryServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'MemoryServiceError';
  }
}

export class MemoryNotFoundError extends MemoryServiceError {
  constructor(memoryId: string) {
    super(`Memory not found: ${memoryId}`, 'MEMORY_NOT_FOUND', 404);
  }
}

export class MemoryValidationError extends MemoryServiceError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class MemoryStorageError extends MemoryServiceError {
  constructor(message: string, tier: StorageTier, details?: any) {
    super(`Storage error in ${tier} tier: ${message}`, 'STORAGE_ERROR', 503, details);
  }
}

export class MemoryPermissionError extends MemoryServiceError {
  constructor(agentId: string, operation: string) {
    super(`Agent ${agentId} does not have permission for operation: ${operation}`, 'PERMISSION_DENIED', 403);
  }
}