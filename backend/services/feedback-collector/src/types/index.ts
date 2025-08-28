/**
 * Comprehensive type definitions for the feedback collection system
 */

import { z } from 'zod';

// Model and agent types
export type ModelType = 'marketing' | 'sales' | 'support' | 'analytics';
export type AgentType = 'business' | 'technical' | 'operational';

// Event types for implicit feedback
export type ImplicitEventType = 
  | 'click'
  | 'scroll'
  | 'hover'
  | 'copy'
  | 'download'
  | 'exit'
  | 'pageview'
  | 'conversion'
  | 'engagement'
  | 'bounce';

// Feedback types for explicit feedback
export type ExplicitFeedbackType = 
  | 'rating'
  | 'thumbs'
  | 'comment'
  | 'report'
  | 'survey'
  | 'feature_request'
  | 'bug_report';

// Issue types for reporting
export type IssueType = 
  | 'accuracy'
  | 'relevance'
  | 'quality'
  | 'offensive'
  | 'performance'
  | 'formatting'
  | 'other';

// Privacy consent levels
export type ConsentLevel = 
  | 'essential'
  | 'functional'
  | 'analytics'
  | 'marketing'
  | 'all';

/**
 * Device and browser information
 */
export interface DeviceInfo {
  type: 'desktop' | 'mobile' | 'tablet';
  os: string;
  osVersion: string;
  browser: string;
  browserVersion: string;
  screenResolution: string;
  viewport: string;
  userAgent: string;
}

/**
 * Geographic and demographic information
 */
export interface UserContext {
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;
  language?: string;
  segment?: string;
  cohort?: string;
  accountType?: 'free' | 'trial' | 'premium' | 'enterprise';
}

/**
 * Business metrics associated with events
 */
export interface BusinessMetrics {
  conversionValue?: number;
  leadScore?: number;
  satisfactionScore?: number;
  engagementScore?: number;
  retentionScore?: number;
  ltv?: number;
  churnRisk?: number;
  npsScore?: number;
}

/**
 * Content variant information for A/B testing
 */
export interface ContentVariant {
  variantId: string;
  variantName: string;
  testId: string;
  testName: string;
  controlGroup: boolean;
  allocation: number;
}

/**
 * Implicit feedback event schema
 */
export const ImplicitFeedbackEventSchema = z.object({
  eventId: z.string().uuid(),
  timestamp: z.date(),
  userId: z.string().optional(),
  sessionId: z.string(),
  eventType: z.enum([
    'click', 'scroll', 'hover', 'copy', 'download',
    'exit', 'pageview', 'conversion', 'engagement', 'bounce'
  ]),
  elementId: z.string(),
  modelType: z.enum(['marketing', 'sales', 'support', 'analytics']),
  modelVersion: z.string(),
  contentVariant: z.object({
    variantId: z.string(),
    variantName: z.string(),
    testId: z.string(),
    testName: z.string(),
    controlGroup: z.boolean(),
    allocation: z.number()
  }),
  metadata: z.object({
    page: z.string(),
    referrer: z.string(),
    device: z.object({
      type: z.enum(['desktop', 'mobile', 'tablet']),
      os: z.string(),
      osVersion: z.string(),
      browser: z.string(),
      browserVersion: z.string(),
      screenResolution: z.string(),
      viewport: z.string(),
      userAgent: z.string()
    }),
    location: z.object({
      country: z.string().optional(),
      region: z.string().optional(),
      city: z.string().optional(),
      timezone: z.string().optional()
    }).optional(),
    timeOnPage: z.number(),
    scrollDepth: z.number().min(0).max(100),
    clickPath: z.array(z.string()).optional(),
    previousPages: z.array(z.string()).optional()
  }),
  businessMetrics: z.object({
    conversionValue: z.number().optional(),
    leadScore: z.number().optional(),
    satisfactionScore: z.number().optional(),
    engagementScore: z.number().optional(),
    retentionScore: z.number().optional(),
    ltv: z.number().optional(),
    churnRisk: z.number().optional(),
    npsScore: z.number().optional()
  }).optional(),
  aiContext: z.object({
    promptTemplate: z.string().optional(),
    responseTime: z.number().optional(),
    tokenCount: z.number().optional(),
    confidence: z.number().optional(),
    fallbackUsed: z.boolean().optional()
  }).optional()
});

export type ImplicitFeedbackEvent = z.infer<typeof ImplicitFeedbackEventSchema>;

/**
 * Explicit feedback event schema
 */
export const ExplicitFeedbackEventSchema = z.object({
  feedbackId: z.string().uuid(),
  timestamp: z.date(),
  userId: z.string().optional(),
  sessionId: z.string(),
  contentId: z.string(),
  modelType: z.enum(['marketing', 'sales', 'support', 'analytics']),
  modelVersion: z.string(),
  feedbackType: z.enum([
    'rating', 'thumbs', 'comment', 'report',
    'survey', 'feature_request', 'bug_report'
  ]),
  rating: z.number().min(1).max(5).optional(),
  thumbsUp: z.boolean().optional(),
  comment: z.string().optional(),
  issueType: z.enum([
    'accuracy', 'relevance', 'quality', 'offensive',
    'performance', 'formatting', 'other'
  ]).optional(),
  sentiment: z.number().min(-1).max(1).optional(),
  metadata: z.object({
    page: z.string(),
    contentType: z.string(),
    interactionTime: z.number(),
    previousInteractions: z.number(),
    device: z.object({
      type: z.enum(['desktop', 'mobile', 'tablet']),
      os: z.string(),
      browser: z.string()
    })
  }),
  followUp: z.object({
    contactRequested: z.boolean(),
    email: z.string().email().optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional()
  }).optional()
});

export type ExplicitFeedbackEvent = z.infer<typeof ExplicitFeedbackEventSchema>;

/**
 * Aggregated feedback metrics
 */
export interface FeedbackMetrics {
  period: {
    start: Date;
    end: Date;
    duration: number;
  };
  modelType: ModelType;
  modelVersion: string;
  implicit: {
    totalEvents: number;
    uniqueUsers: number;
    avgEngagementTime: number;
    clickThroughRate: number;
    bounceRate: number;
    conversionRate: number;
    scrollDepth: number;
    copyRate: number;
    downloadRate: number;
  };
  explicit: {
    totalFeedback: number;
    avgRating: number;
    thumbsUpRate: number;
    sentimentScore: number;
    issueReports: number;
    featureRequests: number;
    bugReports: number;
  };
  business: {
    revenue: number;
    leads: number;
    conversions: number;
    churnRate: number;
    ltv: number;
    nps: number;
  };
  patterns: {
    topIssues: Array<{ type: string; count: number; }>;
    userJourneys: Array<{ path: string[]; count: number; }>;
    dropOffPoints: Array<{ page: string; rate: number; }>;
    highEngagement: Array<{ element: string; score: number; }>;
  };
}

/**
 * Real-time feedback stream event
 */
export interface FeedbackStreamEvent {
  type: 'implicit' | 'explicit' | 'metric' | 'alert';
  timestamp: Date;
  data: ImplicitFeedbackEvent | ExplicitFeedbackEvent | FeedbackMetrics | FeedbackAlert;
}

/**
 * Feedback alert for anomalies or issues
 */
export interface FeedbackAlert {
  alertId: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  type: 'anomaly' | 'threshold' | 'trend' | 'pattern';
  title: string;
  description: string;
  modelType: ModelType;
  metric: string;
  value: number;
  threshold: number;
  context: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Privacy and consent management
 */
export interface UserConsent {
  userId: string;
  consentId: string;
  timestamp: Date;
  consentLevels: ConsentLevel[];
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
  withdrawable: boolean;
}

/**
 * Data retention policy
 */
export interface RetentionPolicy {
  dataType: 'implicit' | 'explicit' | 'personal' | 'analytics';
  retentionDays: number;
  anonymizeAfterDays?: number;
  deleteAfterDays: number;
  exceptions?: string[];
}

/**
 * Batch processing job
 */
export interface BatchJob {
  jobId: string;
  type: 'aggregation' | 'analysis' | 'export' | 'cleanup';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  progress: number;
  results?: Record<string, unknown>;
  error?: string;
}

/**
 * Analytics query parameters
 */
export interface AnalyticsQuery {
  modelType?: ModelType;
  period: {
    start: Date;
    end: Date;
  };
  granularity?: 'minute' | 'hour' | 'day' | 'week' | 'month';
  metrics?: string[];
  dimensions?: string[];
  filters?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

/**
 * Pattern detection result
 */
export interface PatternResult {
  patternId: string;
  type: 'behavioral' | 'temporal' | 'sequential' | 'anomaly';
  confidence: number;
  description: string;
  occurrences: number;
  examples: Array<{
    eventId: string;
    timestamp: Date;
    context: Record<string, unknown>;
  }>;
  impact: {
    metric: string;
    change: number;
    significance: number;
  };
}

/**
 * Sentiment analysis result
 */
export interface SentimentResult {
  text: string;
  overall: number;
  confidence: number;
  emotions: {
    positive: number;
    negative: number;
    neutral: number;
  };
  aspects: Array<{
    aspect: string;
    sentiment: number;
    mentions: number;
  }>;
  keywords: string[];
}

/**
 * Improvement recommendation
 */
export interface ImprovementRecommendation {
  recommendationId: string;
  modelType: ModelType;
  priority: 'low' | 'medium' | 'high' | 'critical';
  type: 'performance' | 'quality' | 'engagement' | 'conversion';
  title: string;
  description: string;
  evidence: {
    metrics: FeedbackMetrics;
    patterns: PatternResult[];
    feedback: Array<ExplicitFeedbackEvent>;
  };
  suggestedActions: string[];
  estimatedImpact: {
    metric: string;
    improvement: number;
    confidence: number;
  };
}

/**
 * WebSocket message types
 */
export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping' | 'data' | 'error';
  channel?: string;
  data?: unknown;
  error?: string;
  timestamp: Date;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    timestamp: Date;
    requestId: string;
    duration: number;
  };
}

/**
 * Health check response
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  services: {
    database: boolean;
    redis: boolean;
    kafka: boolean;
    analytics: boolean;
  };
  metrics: {
    eventsPerSecond: number;
    activeConnections: number;
    queueSize: number;
    errorRate: number;
  };
}