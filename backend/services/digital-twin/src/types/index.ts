/**
 * Type definitions for Digital Twin Business Simulator
 */

export interface BusinessEnvironment {
  id: string;
  name: string;
  type: EnvironmentType;
  parameters: EnvironmentParameters;
  state: EnvironmentState;
  metrics: BusinessMetrics;
  createdAt: Date;
  updatedAt: Date;
}

export enum EnvironmentType {
  MARKETING = 'MARKETING',
  SALES = 'SALES',
  CUSTOMER_SUCCESS = 'CUSTOMER_SUCCESS',
  ANALYTICS = 'ANALYTICS',
  INTEGRATED = 'INTEGRATED'
}

export interface EnvironmentParameters {
  marketSize: number;
  competitorCount: number;
  seasonality: SeasonalityPattern;
  economicConditions: EconomicCondition;
  customerSegments: CustomerSegment[];
  productOfferings: ProductOffering[];
  pricingStrategy: PricingStrategy;
}

export interface SeasonalityPattern {
  type: 'none' | 'quarterly' | 'monthly' | 'weekly' | 'custom';
  factors: number[];
}

export interface EconomicCondition {
  growth: number; // -1 to 1
  volatility: number; // 0 to 1
  consumerConfidence: number; // 0 to 1
}

export interface CustomerSegment {
  id: string;
  name: string;
  size: number;
  growthRate: number;
  priceS ensitivity: number;
  qualitySensitivity: number;
  brandLoyalty: number;
  churnRate: number;
  averageLifetimeValue: number;
}

export interface ProductOffering {
  id: string;
  name: string;
  tier: 'free' | 'starter' | 'professional' | 'enterprise';
  price: number;
  features: string[];
  targetSegments: string[];
}

export interface PricingStrategy {
  type: 'fixed' | 'dynamic' | 'tiered' | 'usage-based';
  discountPolicy: DiscountPolicy;
  promotions: Promotion[];
}

export interface DiscountPolicy {
  volumeDiscounts: VolumeDiscount[];
  seasonalDiscounts: SeasonalDiscount[];
  loyaltyDiscounts: LoyaltyDiscount[];
}

export interface VolumeDiscount {
  minQuantity: number;
  discountPercent: number;
}

export interface SeasonalDiscount {
  startDate: Date;
  endDate: Date;
  discountPercent: number;
}

export interface LoyaltyDiscount {
  minTenureMonths: number;
  discountPercent: number;
}

export interface Promotion {
  id: string;
  name: string;
  type: 'discount' | 'trial' | 'bundle' | 'referral';
  value: number;
  startDate: Date;
  endDate: Date;
  targetSegments: string[];
}

export interface EnvironmentState {
  currentTime: Date;
  simulationSpeed: number; // 1x, 10x, 100x, etc.
  isPaused: boolean;
  customers: Customer[];
  interactions: Interaction[];
  transactions: Transaction[];
}

export interface Customer {
  id: string;
  segmentId: string;
  acquisitionDate: Date;
  status: 'prospect' | 'lead' | 'customer' | 'churned';
  lifetime Value: number;
  interactionHistory: string[];
  purchaseHistory: string[];
  satisfactionScore: number;
  churnProbability: number;
}

export interface Interaction {
  id: string;
  customerId: string;
  type: InteractionType;
  channel: Channel;
  timestamp: Date;
  outcome: InteractionOutcome;
  modelUsed?: string;
  responseTime?: number;
  satisfactionRating?: number;
}

export enum InteractionType {
  MARKETING_EMAIL = 'MARKETING_EMAIL',
  SALES_CALL = 'SALES_CALL',
  SUPPORT_TICKET = 'SUPPORT_TICKET',
  PRODUCT_DEMO = 'PRODUCT_DEMO',
  ONBOARDING = 'ONBOARDING',
  FEATURE_REQUEST = 'FEATURE_REQUEST',
  COMPLAINT = 'COMPLAINT',
  RENEWAL_DISCUSSION = 'RENEWAL_DISCUSSION'
}

export enum Channel {
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
  CHAT = 'CHAT',
  VIDEO = 'VIDEO',
  IN_APP = 'IN_APP',
  SOCIAL_MEDIA = 'SOCIAL_MEDIA'
}

export interface InteractionOutcome {
  success: boolean;
  conversionType?: 'lead' | 'opportunity' | 'sale' | 'upsell' | 'renewal';
  revenue?: number;
  nextAction?: string;
  sentiment: number; // -1 to 1
}

export interface Transaction {
  id: string;
  customerId: string;
  type: 'new' | 'renewal' | 'upgrade' | 'downgrade' | 'churn';
  amount: number;
  product: string;
  timestamp: Date;
  billingPeriod: 'monthly' | 'annual';
}

export interface BusinessMetrics {
  revenue: RevenueMetrics;
  customers: CustomerMetrics;
  marketing: MarketingMetrics;
  sales: SalesMetrics;
  support: SupportMetrics;
  product: ProductMetrics;
}

export interface RevenueMetrics {
  mrr: number; // Monthly Recurring Revenue
  arr: number; // Annual Recurring Revenue
  arpu: number; // Average Revenue Per User
  ltv: number; // Lifetime Value
  cac: number; // Customer Acquisition Cost
  ltv CacRatio: number;
  growthRate: number;
  churnRate: number;
  netRevenue Retention: number;
}

export interface CustomerMetrics {
  total: number;
  active: number;
  new: number;
  churned: number;
  nps: number; // Net Promoter Score
  csat: number; // Customer Satisfaction Score
  healthScore: number;
}

export interface MarketingMetrics {
  leads: number;
  mql: number; // Marketing Qualified Leads
  sql: number; // Sales Qualified Leads
  conversionRate: number;
  cpl: number; // Cost Per Lead
  emailOpenRate: number;
  emailClickRate: number;
  websiteTraffic: number;
  organicTraffic: number;
  paidTraffic: number;
}

export interface SalesMetrics {
  pipeline: number;
  closedWon: number;
  closedLost: number;
  winRate: number;
  averageDealSize: number;
  salesCycle: number; // days
  quotaAttainment: number;
}

export interface SupportMetrics {
  ticketVolume: number;
  averageResponseTime: number;
  averageResolutionTime: number;
  firstContactResolution: number;
  ticketBacklog: number;
  csat: number;
}

export interface ProductMetrics {
  activeUsers: number;
  featureAdoption: Map<string, number>;
  usageFrequency: number;
  sessionDuration: number;
  retentionRate: number;
  engagement Score: number;
}

export interface SimulationRequest {
  environmentId: string;
  scenarioId?: string;
  duration: number; // simulation time in days
  speed: number; // simulation speed multiplier
  models: ModelConfiguration[];
  experiments?: ExperimentConfig[];
}

export interface ModelConfiguration {
  id: string;
  type: 'marketing' | 'sales' | 'support' | 'analytics';
  version: string;
  parameters: Record<string, any>;
  allocationPercent: number;
}

export interface ExperimentConfig {
  id: string;
  name: string;
  hypothesis: string;
  variants: ModelConfiguration[];
  metrics: string[];
  successCriteria: SuccessCriteria;
}

export interface SuccessCriteria {
  metric: string;
  improvement: number;
  confidence: number;
}

export interface SimulationResult {
  id: string;
  environmentId: string;
  startTime: Date;
  endTime: Date;
  simulatedDays: number;
  finalMetrics: BusinessMetrics;
  metricTimeSeries: MetricTimeSeries[];
  experiments: ExperimentResult[];
  insights: Insight[];
  recommendations: Recommendation[];
}

export interface MetricTimeSeries {
  metric: string;
  values: TimeSeriesPoint[];
}

export interface TimeSeriesPoint {
  timestamp: Date;
  value: number;
}

export interface ExperimentResult {
  experimentId: string;
  winner: string;
  confidence: number;
  lift: number;
  pValue: number;
  sampleSize: number;
}

export interface Insight {
  id: string;
  type: 'opportunity' | 'risk' | 'anomaly' | 'trend';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  impact: number;
  affectedMetrics: string[];
}

export interface Recommendation {
  id: string;
  type: 'improvement' | 'optimization' | 'experiment';
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  expectedImpact: number;
  implementation: string;
  requiredAgents: string[];
}

export interface ScenarioTemplate {
  id: string;
  name: string;
  description: string;
  category: 'growth' | 'recession' | 'competition' | 'product-launch' | 'crisis';
  parameters: EnvironmentParameters;
  events: ScenarioEvent[];
}

export interface ScenarioEvent {
  id: string;
  triggerDay: number;
  type: 'market-change' | 'competitor-action' | 'economic-shift' | 'viral-moment' | 'crisis';
  impact: Record<string, number>;
  duration: number;
}

export interface ModelPerformance {
  modelId: string;
  metrics: {
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    responseTime: number;
    cost: number;
    satisfactionScore: number;
  };
  comparisonToBaseline: number;
  improvementAreas: string[];
}

export interface ImprovementPlan {
  modelId: string;
  targetMetrics: string[];
  proposedChanges: ProposedChange[];
  estimatedImpact: number;
  requiredResources: Resource[];
  timeline: number; // days
}

export interface ProposedChange {
  type: 'retrain' | 'fine-tune' | 'architecture' | 'hyperparameter' | 'data';
  description: string;
  agent: string;
  priority: number;
}

export interface Resource {
  type: 'compute' | 'data' | 'human' | 'time';
  amount: number;
  unit: string;
}