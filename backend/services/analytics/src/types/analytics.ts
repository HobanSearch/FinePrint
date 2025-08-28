/**
 * Fine Print AI - Analytics Type Definitions
 * 
 * Comprehensive type definitions for analytics service including:
 * - Product analytics events
 * - Business intelligence metrics
 * - AI/ML performance tracking
 * - User behavior analytics
 * - Revenue and cohort analysis
 * - A/B testing
 * - Privacy compliance
 */

// =============================================================================
// PRODUCT ANALYTICS TYPES
// =============================================================================

export interface ProductAnalyticsEvent {
  userId: string;
  eventName: string;
  properties: EventProperties;
  context: TrackingContext;
  timestamp?: Date;
}

export interface EventProperties {
  [key: string]: string | number | boolean | Date | null | undefined;
}

export interface UserProperties {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  subscriptionTier?: string;
  createdAt?: Date;
  timezone?: string;
  language?: string;
  userType?: string;
  planType?: string;
  [key: string]: any;
}

export interface TrackingContext {
  sessionId?: string;
  ip?: string;
  userAgent?: string;
  platform?: 'web' | 'mobile' | 'api' | 'cli';
  page?: {
    url: string;
    title?: string;
    referrer?: string;
  };
  device?: {
    type?: 'desktop' | 'mobile' | 'tablet';
    os?: string;
    browser?: string;
  };
  campaign?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
}

// =============================================================================
// FUNNEL ANALYTICS TYPES
// =============================================================================

export interface FunnelDefinition {
  name: string;
  description?: string;
  steps: FunnelStepDefinition[];
  timeWindow?: number; // hours
  conversionGoal?: string;
}

export interface FunnelStepDefinition {
  name: string;
  order: number;
  eventName: string;
  conditions?: EventCondition[];
}

export interface FunnelStep {
  stepName: string;
  stepOrder: number;
  completedAt: Date;
  properties: EventProperties;
}

export interface FunnelAnalysis {
  funnelName: string;
  totalUsers: number;
  steps: FunnelStepAnalysis[];
  overallConversionRate: number;
  averageTimeToConvert: number;
}

export interface FunnelStepAnalysis {
  stepName: string;
  stepOrder: number;
  userCount: number;
  conversionRate: number;
  dropOffRate: number;
  averageTimeFromPrevious: number;
}

// =============================================================================
// COHORT ANALYSIS TYPES
// =============================================================================

export interface CohortDefinition {
  name: string;
  description?: string;
  criteria: CohortCriteria;
  timeframe: CohortTimeframe;
}

export interface CohortCriteria {
  eventName?: string;
  properties?: EventCondition[];
  userProperties?: EventCondition[];
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface CohortTimeframe {
  unit: 'day' | 'week' | 'month';
  periods: number;
}

export interface CohortAnalysis {
  cohortName: string;
  cohortSize: number;
  timeframe: CohortTimeframe;
  retentionData: CohortRetentionData[];
}

export interface CohortRetentionData {
  period: number;
  userCount: number;
  retentionRate: number;
}

// =============================================================================
// A/B TESTING TYPES
// =============================================================================

export interface ABTest {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'running' | 'paused' | 'completed';
  variants: ABTestVariant[];
  trafficAllocation: number;
  startDate?: Date;
  endDate?: Date;
  targetMetric: string;
  minimumSampleSize: number;
  confidenceLevel: number;
  winner?: string;
  results?: ABTestResults;
}

export interface ABTestVariant {
  id: string;
  name: string;
  description?: string;
  allocation: number; // percentage 0-100
  configuration: Record<string, any>;
}

export interface ABTestResults {
  totalUsers: number;
  variantResults: ABTestVariantResult[];
  statisticalSignificance: boolean;
  confidenceInterval: number;
  pValue: number;
  winner?: string;
  lift?: number;
}

export interface ABTestVariantResult {
  variantId: string;
  variantName: string;
  userCount: number;
  conversionCount: number;
  conversionRate: number;
  averageValue?: number;
  standardError: number;
}

// =============================================================================
// AI/ML PERFORMANCE TYPES
// =============================================================================

export interface AIModelMetrics {
  modelName: string;
  modelVersion: string;
  timestamp: Date;
  performance: AIPerformanceMetrics;
  usage: AIUsageMetrics;
  quality: AIQualityMetrics;
}

export interface AIPerformanceMetrics {
  avgLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  throughput: number;
  errorRate: number;
  timeoutRate: number;
}

export interface AIUsageMetrics {
  totalRequests: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  costEstimate: number;
  activeUsers: number;
}

export interface AIQualityMetrics {
  accuracyScore?: number;
  confidenceScore?: number;
  relevanceScore?: number;
  userSatisfactionScore?: number;
  flaggedResponses: number;
  modelDriftScore?: number;
}

// =============================================================================
// BUSINESS INTELLIGENCE TYPES
// =============================================================================

export interface BusinessMetrics {
  timestamp: Date;
  revenue: RevenueMetrics;
  users: UserMetrics;
  product: ProductMetrics;
  operational: OperationalMetrics;
}

export interface RevenueMetrics {
  totalRevenue: number;
  monthlyRecurringRevenue: number;
  annualRecurringRevenue: number;
  averageRevenuePerUser: number;
  customerLifetimeValue: number;
  churnRate: number;
  netRevenueRetention: number;
  grossRevenueRetention: number;
}

export interface UserMetrics {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  returningUsers: number;
  userGrowthRate: number;
  activationRate: number;
  retentionRate: number;
  engagementScore: number;
}

export interface ProductMetrics {
  totalDocuments: number;
  totalAnalyses: number;
  averageRiskScore: number;
  popularDocumentTypes: Record<string, number>;
  topFindingCategories: Record<string, number>;
  featureAdoptionRates: Record<string, number>;
}

export interface OperationalMetrics {
  systemUptime: number;
  averageResponseTime: number;
  errorRate: number;
  apiUsage: number;
  storageUsed: number;
  bandwidthUsed: number;
}

// =============================================================================
// DASHBOARD TYPES
// =============================================================================

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  widgets: DashboardWidget[];
  filters: DashboardFilter[];
  refreshInterval: number;
  isPublic: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  size: WidgetSize;
  position: WidgetPosition;
  configuration: WidgetConfiguration;
  dataSource: DataSource;
}

export type WidgetType = 
  | 'metric_card' 
  | 'line_chart' 
  | 'bar_chart' 
  | 'pie_chart' 
  | 'table' 
  | 'funnel' 
  | 'cohort' 
  | 'heatmap'
  | 'map';

export interface WidgetSize {
  width: number;
  height: number;
}

export interface WidgetPosition {
  x: number;
  y: number;
}

export interface WidgetConfiguration {
  metrics: string[];
  dimensions: string[];
  filters: WidgetFilter[];
  timeRange: TimeRange;
  aggregation: AggregationType;
  visualization: VisualizationOptions;
}

export interface DataSource {
  type: 'analytics_events' | 'user_metrics' | 'revenue_data' | 'ai_metrics' | 'custom_query';
  query?: string;
  parameters?: Record<string, any>;
}

// =============================================================================
// REPORTING TYPES
// =============================================================================

export interface Report {
  id: string;
  name: string;
  description?: string;
  type: ReportType;
  schedule: ReportSchedule;
  recipients: string[];
  configuration: ReportConfiguration;
  lastRun?: Date;
  nextRun?: Date;
  status: 'active' | 'paused' | 'failed';
}

export type ReportType = 
  | 'executive_summary' 
  | 'user_engagement' 
  | 'revenue_analysis' 
  | 'product_performance' 
  | 'ai_metrics' 
  | 'custom';

export interface ReportSchedule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  hour: number;
  timezone: string;
}

export interface ReportConfiguration {
  timeRange: TimeRange;
  metrics: string[];
  dimensions: string[];
  filters: ReportFilter[];
  format: 'pdf' | 'html' | 'csv' | 'json';
  includeCharts: boolean;
  includeData: boolean;
}

// =============================================================================
// COMMON UTILITY TYPES
// =============================================================================

export interface EventCondition {
  property: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'exists' | 'not_exists';
  value: any;
}

export interface TimeRange {
  start: Date;
  end: Date;
  relative?: {
    amount: number;
    unit: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
  };
}

export interface DashboardFilter {
  property: string;
  values: any[];
  operator: 'in' | 'not_in' | 'equals' | 'not_equals';
}

export interface WidgetFilter {
  property: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
  value: any;
}

export interface ReportFilter {
  property: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
  value: any;
}

export type AggregationType = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'unique' | 'percentile';

export interface VisualizationOptions {
  showLegend?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  colorScheme?: string[];
  xAxisLabel?: string;
  yAxisLabel?: string;
  showTrendLine?: boolean;
  stackedBars?: boolean;
}

// =============================================================================
// DATA QUALITY TYPES
// =============================================================================

export interface DataQualityCheck {
  id: string;
  name: string;
  description?: string;
  type: DataQualityCheckType;
  table: string;
  column?: string;
  rules: DataQualityRule[];
  schedule: string;
  enabled: boolean;
}

export type DataQualityCheckType = 
  | 'completeness' 
  | 'validity' 
  | 'consistency' 
  | 'accuracy' 
  | 'timeliness' 
  | 'uniqueness';

export interface DataQualityRule {
  type: string;
  parameters: Record<string, any>;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface DataQualityResult {
  checkId: string;
  timestamp: Date;
  passed: boolean;
  score: number;
  issues: DataQualityIssue[];
}

export interface DataQualityIssue {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedRows: number;
  sampleData?: any[];
}

// =============================================================================
// PRIVACY AND COMPLIANCE TYPES
// =============================================================================

export interface PrivacySettings {
  enablePiiDetection: boolean;
  enableDataAnonymization: boolean;
  dataRetentionDays: number;
  allowedCountries: string[];
  restrictedCountries: string[];
  cookieConsentRequired: boolean;
  gdprCompliant: boolean;
  ccpaCompliant: boolean;
}

export interface ConsentRecord {
  userId: string;
  consentType: 'analytics' | 'marketing' | 'functional' | 'necessary';
  granted: boolean;
  timestamp: Date;
  source: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface DataExportRequest {
  id: string;
  userId: string;
  requestType: 'gdpr_export' | 'ccpa_export' | 'user_request';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedAt: Date;
  completedAt?: Date;
  downloadUrl?: string;
  expiresAt?: Date;
}

export interface DataDeletionRequest {
  id: string;
  userId: string;
  requestType: 'gdpr_deletion' | 'ccpa_deletion' | 'user_request';
  status: 'pending' | 'verified' | 'processing' | 'completed' | 'failed';
  reason?: string;
  requestedAt: Date;
  verifiedAt?: Date;
  completedAt?: Date;
  verificationToken?: string;
}

// =============================================================================
// PERFORMANCE ANALYTICS TYPES
// =============================================================================

export type Platform = 'web' | 'mobile' | 'extension' | 'api';

export interface PerformanceMetric {
  id: string;
  userId: string;
  platform: Platform;
  metricType: string;
  value: number;
  timestamp: Date;
  context?: any;
}

export interface WebVitalsMetric {
  name: 'FCP' | 'LCP' | 'FID' | 'CLS' | 'TTI' | 'TBT';
  value: number;
  url: string;
  userAgent?: string;
  connection?: string;
  deviceType?: string;
  viewportSize?: string;
}

export interface MobilePerformanceMetric {
  platform: 'ios' | 'android';
  osVersion: string;
  deviceModel: string;
  appStartTime: number;
  memoryUsage: number;
  availableMemory: number;
  totalMemory: number;
  batteryLevel: number;
  batteryDrain: number;
  isCharging: boolean;
  frameDropRate: number;
  screen: string;
}

export interface ExtensionPerformanceMetric {
  browser: 'chrome' | 'firefox' | 'safari' | 'edge';
  version: string;
  url: string;
  contentScriptInjectionTime: number;
  backgroundScriptMemory: number;
  pageLoadImpact: number;
  analysisTime: number;
  documentType: string;
  documentSize: number;
  activeTabsCount: number;
  pageSize: number;
}

export interface PerformanceAlert {
  id: string;
  platform: Platform;
  metricType: string;
  threshold: number;
  actualValue: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  createdAt: Date;
  userId: string;
  context?: any;
}

export interface PerformanceRecommendation {
  id: string;
  type: 'optimization' | 'alert' | 'budget';
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
  actions: string[];
  estimatedImprovement: string;
  platform: Platform;
}

export interface PerformanceBudget {
  metricType: string;
  threshold: number;
  currentValue: number;
  p95Value: number;
  isWithinBudget: boolean;
  compliance: number; // percentage
  trend: 'improving' | 'degrading' | 'stable';
}

export interface PerformanceRegression {
  id: string;
  platform: Platform;
  metricType: string;
  baselineValue: number;
  currentValue: number;
  regressionPercentage: number;
  detectedAt: Date;
  severity: 'low' | 'medium' | 'high';
  affectedUsers: number;
  possibleCauses: string[];
}

// =============================================================================
// ADVANCED ANALYTICS TYPES
// =============================================================================

export interface DocumentAnalysisMetric {
  id: string;
  userId: string;
  documentId: string;
  documentType: 'tos' | 'privacy' | 'eula' | 'other';
  documentSize: number;
  analysisTime: number;
  riskScore: number;
  patternsFound: number;
  accuracy: number;
  platform: Platform;
  timestamp: Date;
}

export interface ModelPerformanceMetric {
  id: string;
  modelName: string;
  modelVersion: string;
  inferenceTime: number;
  memoryUsage: number;
  cpuUsage: number;
  gpuUsage?: number;
  accuracy: number;
  confidence: number;
  batchSize: number;
  timestamp: Date;
}

export interface PredictiveAnalyticsEvent {
  id: string;
  userId: string;
  predictionType: 'churn' | 'upsell' | 'engagement' | 'risk_tolerance';
  prediction: any;
  confidence: number;
  features: { [key: string]: any };
  timestamp: Date;
}

export interface UserBehaviorPattern {
  id: string;
  userId: string;
  pattern: string;
  frequency: number;
  lastOccurrence: Date;
  confidence: number;
  context: any;
}

export interface FeatureAdoptionMetric {
  featureName: string;
  totalUsers: number;
  adoptedUsers: number;
  adoptionRate: number;
  timeToAdoption: number;
  platform: Platform;
  timestamp: Date;
}

export interface CrossPlatformMetric {
  userId: string;
  platforms: Platform[];
  primaryPlatform: Platform;
  syncFrequency: number;
  crossPlatformActions: number;
  preferredFeatures: { [platform: string]: string[] };
  timestamp: Date;
}

// =============================================================================
// MONITORING AND ALERTING TYPES
// =============================================================================

export interface MonitoringRule {
  id: string;
  name: string;
  description?: string;
  platform: Platform;
  metricType: string;
  condition: AlertCondition;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  recipients: string[];
  cooldownPeriod: number; // minutes
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertCondition {
  operator: 'greater_than' | 'less_than' | 'equals' | 'not_equals' | 'percentage_change';
  value: number;
  timeWindow: number; // minutes
  aggregation: 'avg' | 'sum' | 'count' | 'max' | 'min' | 'p95' | 'p99';
}

export interface SLATarget {
  id: string;
  name: string;
  description?: string;
  platform: Platform;
  metricType: string;
  target: number;
  tolerance: number; // percentage
  timeframe: 'daily' | 'weekly' | 'monthly';
  status: 'met' | 'at_risk' | 'violated';
  currentValue: number;
  compliance: number; // percentage
  lastUpdated: Date;
}

export interface PerformanceTrend {
  metricType: string;
  platform: Platform;
  trend: 'improving' | 'degrading' | 'stable';
  changePercentage: number;
  timeRange: TimeRange;
  confidence: number;
  factors: string[];
}

// =============================================================================
// DATA EXPORT AND INTEGRATION TYPES
// =============================================================================

export interface DataExport {
  id: string;
  userId: string;
  type: 'analytics' | 'performance' | 'user_data' | 'ai_results';
  format: 'csv' | 'json' | 'excel' | 'pdf';
  filters?: any;
  dateRange?: {
    start: Date;
    end: Date;
  };
  status: 'requested' | 'processing' | 'completed' | 'failed';
  downloadUrl?: string;
  expiresAt?: Date;
  requestedAt: Date;
  completedAt?: Date;
}

export interface IntegrationConfig {
  id: string;
  type: 'webhook' | 'slack' | 'email' | 'api' | 'database';
  name: string;
  description?: string;
  config: any;
  enabled: boolean;
  events: string[];
  filters?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface ComplianceAuditLog {
  id: string;
  userId: string;
  action: 'data_access' | 'data_export' | 'data_deletion' | 'consent_update' | 'settings_change';
  details: any;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  compliance: {
    gdpr: boolean;
    ccpa: boolean;
    hipaa?: boolean;
  };
}