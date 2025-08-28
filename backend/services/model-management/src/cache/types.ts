/**
 * Cache System Type Definitions
 */

import { ModelCapability } from '../types';

export interface CacheConfig {
  memory: {
    enabled: boolean;
    maxSize: number; // bytes
    ttl: number; // seconds
    checkPeriod: number; // cleanup interval
  };
  redis: {
    enabled: boolean;
    maxSize: number; // bytes
    ttl: number; // seconds
    prefix: string;
    compression: boolean;
  };
  s3: {
    enabled: boolean;
    bucket: string;
    region: string;
    prefix: string;
    ttl: number; // seconds
    archiveAfterDays: number;
  };
  similarity: {
    threshold: number; // 0-1, similarity score threshold
    maxDistance: number; // maximum edit distance
    vectorDimensions: number;
    embeddingModel: string;
  };
}

export interface CacheEntry {
  key: string;
  documentHash: string;
  requestHash: string;
  modelId: string;
  capabilities: ModelCapability[];
  value: CachedResponse;
  metadata: CacheMetadata;
  embedding?: number[]; // Vector embedding for semantic search
  created: Date;
  expires: Date;
  lastAccessed: Date;
  hits: number;
  tier: CacheTier;
  compressed: boolean;
  size: number; // bytes
}

export interface CachedResponse {
  analysis: any;
  patterns: PatternResult[];
  riskScore: number;
  recommendations: string[];
  processingTime: number;
  modelVersion: string;
  confidence: number;
}

export interface PatternResult {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location: {
    start: number;
    end: number;
    section: string;
  };
  confidence: number;
}

export interface CacheMetadata {
  documentType: string;
  documentSize: number;
  language: string;
  userTier: string;
  requestType: string;
  tokensUsed: number;
  costSaved: number;
  originalRequestId: string;
  similarityScore?: number; // If retrieved by similarity
}

export enum CacheTier {
  MEMORY = 'MEMORY',
  REDIS = 'REDIS',
  S3 = 'S3'
}

export interface CacheStats {
  tier: CacheTier;
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  missRate: number;
  evictionRate: number;
  avgRetrievalTime: number;
  costSavings: number;
  popularKeys: PopularKey[];
  ageDistribution: AgeDistribution;
}

export interface PopularKey {
  key: string;
  hits: number;
  lastAccessed: Date;
  tier: CacheTier;
}

export interface AgeDistribution {
  last1Hour: number;
  last24Hours: number;
  last7Days: number;
  older: number;
}

export interface CacheOperation {
  operation: 'GET' | 'SET' | 'DELETE' | 'EVICT' | 'PROMOTE' | 'DEMOTE';
  key: string;
  tier: CacheTier;
  success: boolean;
  duration: number;
  timestamp: Date;
  error?: string;
}

export interface SemanticSearchParams {
  query: string;
  embedding?: number[];
  threshold: number;
  maxResults: number;
  capabilities?: ModelCapability[];
  documentType?: string;
  excludeKeys?: string[];
}

export interface SemanticSearchResult {
  key: string;
  score: number;
  entry: CacheEntry;
  tier: CacheTier;
}

export interface CacheWarmingStrategy {
  id: string;
  name: string;
  schedule: string; // cron expression
  enabled: boolean;
  sources: WarmingSource[];
  targetTier: CacheTier;
  maxEntries: number;
  priority: number;
}

export interface WarmingSource {
  type: 'POPULAR' | 'PREDICTED' | 'SCHEDULED' | 'PATTERN';
  criteria: Record<string, any>;
  weight: number;
}

export interface CacheEvictionPolicy {
  tier: CacheTier;
  strategy: EvictionStrategy;
  threshold: number; // percentage of max size
  targetSize: number; // target size after eviction
  protectedPatterns: string[]; // regex patterns for protected keys
  maxAge?: number; // max age in seconds
}

export enum EvictionStrategy {
  LRU = 'LRU', // Least Recently Used
  LFU = 'LFU', // Least Frequently Used
  FIFO = 'FIFO', // First In First Out
  TTL = 'TTL', // Time To Live based
  COST = 'COST', // Cost-based (evict lowest value items)
  HYBRID = 'HYBRID' // Combination of strategies
}

export interface CacheMigration {
  id: string;
  sourceTier: CacheTier;
  targetTier: CacheTier;
  status: MigrationStatus;
  keysToMigrate: string[];
  keysMigrated: number;
  startTime: Date;
  endTime?: Date;
  error?: string;
}

export enum MigrationStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

export interface CompressionStats {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  compressionTime: number;
  decompressionTime: number;
  algorithm: 'gzip' | 'brotli' | 'lz4' | 'snappy';
}

export interface CacheHealthMetrics {
  overall: HealthStatus;
  tiers: {
    memory: TierHealth;
    redis: TierHealth;
    s3: TierHealth;
  };
  performance: PerformanceMetrics;
  errors: ErrorMetrics;
}

export interface TierHealth {
  status: HealthStatus;
  utilization: number; // percentage
  responseTime: number; // ms
  errorRate: number; // percentage
  lastCheck: Date;
}

export interface PerformanceMetrics {
  avgGetTime: number;
  avgSetTime: number;
  p95GetTime: number;
  p95SetTime: number;
  throughput: number; // ops/sec
}

export interface ErrorMetrics {
  total: number;
  byType: Record<string, number>;
  rate: number; // errors per minute
  lastError?: {
    message: string;
    timestamp: Date;
    operation: string;
  };
}

export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY'
}