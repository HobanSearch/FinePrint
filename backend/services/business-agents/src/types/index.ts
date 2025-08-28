/**
 * Business Agent Types for Fine Print AI
 * Comprehensive type definitions for all business agent operations
 */

import { z } from 'zod';

// User Tier Enum
export enum UserTier {
  FREE = 'FREE',
  STARTER = 'STARTER',
  PROFESSIONAL = 'PROFESSIONAL',
  ENTERPRISE = 'ENTERPRISE'
}

// Agent Types
export enum AgentType {
  MARKETING = 'marketing',
  SALES = 'sales',
  SUPPORT = 'support',
  ANALYTICS = 'analytics'
}

// Content Types for Marketing Agent
export enum ContentType {
  EMAIL = 'email',
  BLOG = 'blog',
  SOCIAL = 'social',
  LANDING_PAGE = 'landing_page',
  AD_COPY = 'ad_copy',
  NEWSLETTER = 'newsletter'
}

// Marketing Content Generation Request
export const MarketingGenerateSchema = z.object({
  type: z.nativeEnum(ContentType),
  prompt: z.string().min(10).max(2000),
  targetAudience: z.string().optional(),
  tone: z.enum(['professional', 'casual', 'friendly', 'urgent', 'informative']).optional(),
  keywords: z.array(z.string()).optional(),
  maxLength: z.number().min(50).max(5000).optional(),
  variations: z.number().min(1).max(5).default(1),
  enableABTest: z.boolean().default(false),
  context: z.object({
    productFeatures: z.array(z.string()).optional(),
    companyInfo: z.string().optional(),
    campaign: z.string().optional()
  }).optional()
});

export type MarketingGenerateRequest = z.infer<typeof MarketingGenerateSchema>;

// Marketing Content Response
export interface MarketingContentResponse {
  id: string;
  type: ContentType;
  variations: ContentVariation[];
  abTestId?: string;
  metadata: {
    generatedAt: Date;
    model: string;
    version: string;
    tokensUsed: number;
    processingTime: number;
  };
}

export interface ContentVariation {
  id: string;
  content: string;
  subject?: string; // For emails
  headline?: string; // For blogs/articles
  callToAction?: string;
  keywords: string[];
  score: {
    readability: number;
    seoScore?: number;
    engagement?: number;
  };
  testGroup?: 'A' | 'B' | 'C';
}

// Sales Lead Qualification Request
export const SalesQualifySchema = z.object({
  lead: z.object({
    id: z.string().optional(),
    name: z.string(),
    email: z.string().email(),
    company: z.string().optional(),
    title: z.string().optional(),
    industry: z.string().optional(),
    companySize: z.enum(['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']).optional(),
    source: z.string(),
    notes: z.string().optional()
  }),
  interactions: z.array(z.object({
    type: z.enum(['email', 'call', 'meeting', 'demo', 'website_visit']),
    date: z.string().datetime(),
    duration: z.number().optional(),
    notes: z.string().optional(),
    outcome: z.string().optional()
  })).optional(),
  criteria: z.object({
    budget: z.number().optional(),
    timeline: z.string().optional(),
    decisionMaker: z.boolean().optional(),
    painPoints: z.array(z.string()).optional()
  }).optional()
});

export type SalesQualifyRequest = z.infer<typeof SalesQualifySchema>;

// Sales Lead Qualification Response
export interface SalesQualificationResponse {
  id: string;
  leadId: string;
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  qualified: boolean;
  reasoning: string;
  recommendations: {
    nextSteps: string[];
    talkingPoints: string[];
    concerns: string[];
    opportunities: string[];
  };
  propensityToBuy: {
    score: number;
    timeline: string;
    confidence: number;
  };
  metadata: {
    analyzedAt: Date;
    model: string;
    version: string;
    processingTime: number;
  };
}

// Support Response Request
export const SupportRespondSchema = z.object({
  ticket: z.object({
    id: z.string().optional(),
    subject: z.string(),
    description: z.string(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    category: z.string().optional(),
    customer: z.object({
      id: z.string().optional(),
      name: z.string(),
      email: z.string().email(),
      tier: z.nativeEnum(UserTier).optional(),
      history: z.array(z.string()).optional()
    })
  }),
  context: z.object({
    previousInteractions: z.array(z.object({
      date: z.string().datetime(),
      type: z.string(),
      summary: z.string()
    })).optional(),
    documentationLinks: z.array(z.string()).optional(),
    knownIssues: z.array(z.string()).optional()
  }).optional(),
  responseType: z.enum(['initial', 'followup', 'resolution', 'escalation']).default('initial'),
  tone: z.enum(['empathetic', 'professional', 'technical', 'friendly']).default('professional')
});

export type SupportRespondRequest = z.infer<typeof SupportRespondSchema>;

// Support Response
export interface SupportResponse {
  id: string;
  ticketId?: string;
  response: {
    subject: string;
    body: string;
    summary: string;
    suggestedActions: string[];
    internalNotes?: string;
  };
  sentiment: {
    customer: 'positive' | 'neutral' | 'negative';
    urgency: 'low' | 'medium' | 'high';
    satisfaction: number; // 0-100
  };
  escalation: {
    required: boolean;
    reason?: string;
    department?: string;
  };
  metadata: {
    generatedAt: Date;
    model: string;
    version: string;
    processingTime: number;
  };
}

// Analytics Analysis Request
export const AnalyticsAnalyzeSchema = z.object({
  dataType: z.enum(['usage', 'revenue', 'customer', 'product', 'marketing', 'custom']),
  metrics: z.array(z.object({
    name: z.string(),
    value: z.number(),
    date: z.string().datetime().optional(),
    dimension: z.string().optional()
  })),
  timeRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
    granularity: z.enum(['hour', 'day', 'week', 'month', 'quarter', 'year']).optional()
  }),
  dimensions: z.array(z.string()).optional(),
  compareWith: z.object({
    type: z.enum(['previous_period', 'same_period_last_year', 'custom']),
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional()
  }).optional(),
  analysisDepth: z.enum(['basic', 'detailed', 'comprehensive']).default('detailed')
});

export type AnalyticsAnalyzeRequest = z.infer<typeof AnalyticsAnalyzeSchema>;

// Analytics Response
export interface AnalyticsInsightResponse {
  id: string;
  insights: {
    summary: string;
    keyFindings: string[];
    trends: TrendAnalysis[];
    anomalies: AnomalyDetection[];
    predictions: Prediction[];
    recommendations: string[];
  };
  visualizations: {
    type: 'line' | 'bar' | 'pie' | 'scatter' | 'heatmap';
    data: any;
    config: any;
  }[];
  comparison?: {
    currentPeriod: MetricsSummary;
    previousPeriod: MetricsSummary;
    change: {
      absolute: number;
      percentage: number;
      direction: 'up' | 'down' | 'stable';
    };
  };
  metadata: {
    analyzedAt: Date;
    model: string;
    version: string;
    dataPoints: number;
    processingTime: number;
    confidence: number;
  };
}

interface TrendAnalysis {
  metric: string;
  direction: 'increasing' | 'decreasing' | 'stable';
  rate: number;
  significance: 'high' | 'medium' | 'low';
  forecast: number[];
}

interface AnomalyDetection {
  metric: string;
  timestamp: Date;
  value: number;
  expectedRange: { min: number; max: number };
  severity: 'critical' | 'warning' | 'info';
  possibleCauses: string[];
}

interface Prediction {
  metric: string;
  period: string;
  value: number;
  confidence: number;
  range: { min: number; max: number };
}

interface MetricsSummary {
  total: number;
  average: number;
  min: number;
  max: number;
  median: number;
}

// Agent Performance Metrics
export interface AgentPerformanceMetrics {
  agentType: AgentType;
  metrics: {
    requestsTotal: number;
    requestsSuccessful: number;
    requestsFailed: number;
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    tokensUsed: number;
    cacheHitRate: number;
    errorRate: number;
  };
  modelInfo: {
    name: string;
    version: string;
    lastUpdated: Date;
    performance: {
      accuracy: number;
      latency: number;
      throughput: number;
    };
  };
  timeRange: {
    start: Date;
    end: Date;
  };
}

// A/B Test Configuration
export interface ABTestConfig {
  id: string;
  name: string;
  agentType: AgentType;
  status: 'active' | 'paused' | 'completed';
  variants: {
    id: string;
    name: string;
    allocation: number; // percentage 0-100
    modelVersion?: string;
    parameters?: Record<string, any>;
  }[];
  metrics: {
    name: string;
    type: 'conversion' | 'engagement' | 'satisfaction' | 'custom';
    goal: 'maximize' | 'minimize';
  }[];
  startDate: Date;
  endDate?: Date;
  results?: {
    winner?: string;
    confidence: number;
    uplift: number;
    significance: boolean;
  };
}

// Digital Twin Test Request
export const DigitalTwinTestSchema = z.object({
  agentType: z.nativeEnum(AgentType),
  scenario: z.object({
    name: z.string(),
    description: z.string(),
    inputs: z.record(z.any()),
    expectedOutputs: z.record(z.any()).optional()
  }),
  environment: z.enum(['production', 'staging', 'development']).default('staging'),
  iterations: z.number().min(1).max(100).default(10),
  metrics: z.array(z.string()).optional()
});

export type DigitalTwinTestRequest = z.infer<typeof DigitalTwinTestSchema>;

// Digital Twin Test Response
export interface DigitalTwinTestResponse {
  id: string;
  agentType: AgentType;
  scenario: string;
  results: {
    passed: boolean;
    iterations: number;
    successRate: number;
    averageAccuracy: number;
    performanceMetrics: {
      avgResponseTime: number;
      minResponseTime: number;
      maxResponseTime: number;
      p95ResponseTime: number;
    };
    outputs: any[];
    errors: string[];
  };
  recommendations: string[];
  metadata: {
    testedAt: Date;
    environment: string;
    modelVersion: string;
  };
}

// Improvement Cycle Request
export const ImprovementCycleSchema = z.object({
  agentType: z.nativeEnum(AgentType),
  targetMetric: z.enum(['accuracy', 'speed', 'satisfaction', 'conversion']),
  currentPerformance: z.number(),
  targetPerformance: z.number(),
  trainingData: z.array(z.object({
    input: z.record(z.any()),
    output: z.record(z.any()),
    feedback: z.object({
      score: z.number(),
      comments: z.string().optional()
    }).optional()
  })).optional(),
  strategy: z.enum(['fine_tune', 'retrain', 'optimize', 'hybrid']).default('optimize')
});

export type ImprovementCycleRequest = z.infer<typeof ImprovementCycleSchema>;

// Improvement Cycle Response
export interface ImprovementCycleResponse {
  id: string;
  agentType: AgentType;
  status: 'initiated' | 'training' | 'validating' | 'deploying' | 'completed' | 'failed';
  improvements: {
    metricName: string;
    before: number;
    after: number;
    improvement: number;
    percentageChange: number;
  }[];
  modelChanges: {
    previousVersion: string;
    newVersion: string;
    changeLog: string[];
  };
  validationResults: {
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
  };
  deploymentStatus?: {
    environment: string;
    deployed: boolean;
    rollbackAvailable: boolean;
  };
  metadata: {
    startedAt: Date;
    completedAt?: Date;
    duration?: number;
    resourcesUsed: {
      cpu: number;
      memory: number;
      gpu?: number;
    };
  };
}

// WebSocket Message Types
export interface WSMessage {
  type: 'agent_update' | 'performance_metric' | 'test_result' | 'error' | 'connection';
  agentType?: AgentType;
  data: any;
  timestamp: Date;
}

// Rate Limit Configuration
export interface RateLimitConfig {
  [UserTier.FREE]: {
    requests: number;
    window: string;
  };
  [UserTier.STARTER]: {
    requests: number;
    window: string;
  };
  [UserTier.PROFESSIONAL]: {
    requests: number;
    window: string;
  };
  [UserTier.ENTERPRISE]: {
    requests: number;
    window: string;
  };
}

// Cache Configuration
export interface CacheConfig {
  ttl: number; // seconds
  maxSize: number; // MB
  strategy: 'lru' | 'lfu' | 'fifo';
}

// Error Response
export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: any;
  timestamp: Date;
  requestId: string;
}