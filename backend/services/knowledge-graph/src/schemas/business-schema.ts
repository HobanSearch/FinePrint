import { z } from 'zod';

// ===== CUSTOMER RELATIONSHIP GRAPH ENTITIES =====

export const CustomerSchema = z.object({
  id: z.string(),
  user_id: z.string().optional(),
  email: z.string().email(),
  name: z.string(),
  company: z.string().optional(),
  industry: z.string().optional(),
  company_size: z.enum(['STARTUP', 'SMB', 'ENTERPRISE']).optional(),
  subscription_tier: z.enum(['FREE', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE']),
  created_at: z.date(),
  last_active: z.date(),
  lifetime_value: z.number().default(0),
  risk_score: z.number().min(0).max(1).default(0),
  satisfaction_score: z.number().min(0).max(10).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'CHURNED', 'PROSPECT']).default('ACTIVE'),
  location: z.object({
    country: z.string(),
    state: z.string().optional(),
    city: z.string().optional(),
    timezone: z.string().optional(),
  }).optional(),
  preferences: z.record(z.any()).default({}),
  tags: z.array(z.string()).default([]),
});

export const CustomerInteractionSchema = z.object({
  id: z.string(),
  customer_id: z.string(),
  type: z.enum(['DOCUMENT_ANALYSIS', 'SUPPORT_TICKET', 'FEATURE_REQUEST', 'FEEDBACK', 'ONBOARDING', 'BILLING']),
  channel: z.enum(['WEB_APP', 'API', 'EMAIL', 'CHAT', 'PHONE', 'EXTENSION']),
  timestamp: z.date(),
  duration_seconds: z.number().optional(),
  outcome: z.enum(['SUCCESS', 'PARTIAL', 'FAILED', 'ABANDONED']),
  satisfaction_rating: z.number().min(1).max(5).optional(),
  metadata: z.record(z.any()).default({}),
  agent_id: z.string().optional(),
});

export const CustomerJourneyStageSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['AWARENESS', 'CONSIDERATION', 'TRIAL', 'PURCHASE', 'ONBOARDING', 'ADOPTION', 'EXPANSION', 'RENEWAL', 'CHURN']),
  description: z.string(),
  success_criteria: z.array(z.string()).default([]),
  typical_duration_days: z.number().optional(),
  conversion_rate: z.number().min(0).max(1).optional(),
  drop_off_reasons: z.array(z.string()).default([]),
});

// ===== PRODUCT KNOWLEDGE GRAPH ENTITIES =====

export const ProductFeatureSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['DOCUMENT_ANALYSIS', 'LEGAL_INSIGHTS', 'COMPLIANCE', 'AUTOMATION', 'REPORTING', 'INTEGRATION']),
  description: z.string(),
  status: z.enum(['ACTIVE', 'BETA', 'DEPRECATED', 'PLANNED']).default('ACTIVE'),
  complexity_score: z.number().min(1).max(10),
  usage_count: z.number().default(0),
  success_rate: z.number().min(0).max(1).default(0),
  average_processing_time_ms: z.number().optional(),
  error_rate: z.number().min(0).max(1).default(0),
  user_satisfaction: z.number().min(0).max(10).optional(),
  dependencies: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  created_at: z.date(),
  last_updated: z.date(),
});

export const ProductUsageEventSchema = z.object({
  id: z.string(),
  customer_id: z.string(),
  feature_id: z.string(),
  timestamp: z.date(),
  duration_ms: z.number(),
  success: z.boolean(),
  error_code: z.string().optional(),
  input_size_bytes: z.number().optional(),
  output_size_bytes: z.number().optional(),
  processing_time_ms: z.number(),
  user_agent: z.string().optional(),
  ip_address: z.string().optional(),
  session_id: z.string().optional(),
  metadata: z.record(z.any()).default({}),
});

export const ProductFeedbackSchema = z.object({
  id: z.string(),
  customer_id: z.string(),
  feature_id: z.string().optional(),
  type: z.enum(['BUG_REPORT', 'FEATURE_REQUEST', 'IMPROVEMENT', 'PRAISE', 'COMPLAINT']),
  title: z.string(),
  description: z.string(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'WONT_FIX']).default('OPEN'),
  votes: z.number().default(0),
  created_at: z.date(),
  resolved_at: z.date().optional(),
  tags: z.array(z.string()).default([]),
});

// ===== LEGAL KNOWLEDGE GRAPH ENTITIES =====

export const LegalDocumentTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'EULA', 'COOKIE_POLICY', 'DATA_PROCESSING_AGREEMENT', 'CONTRACT']),
  description: z.string(),
  typical_length_pages: z.number().optional(),
  complexity_score: z.number().min(1).max(10),
  common_clauses: z.array(z.string()).default([]),
  risk_patterns: z.array(z.string()).default([]),
  jurisdictions: z.array(z.string()).default([]),
});

export const LegalClauseTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['LIABILITY', 'TERMINATION', 'DATA_COLLECTION', 'USER_RIGHTS', 'PAYMENT', 'INTELLECTUAL_PROPERTY', 'DISPUTE_RESOLUTION']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  description: z.string(),
  common_language_patterns: z.array(z.string()).default([]),
  red_flags: z.array(z.string()).default([]),
  compliance_requirements: z.array(z.string()).default([]),
  alternative_suggestions: z.array(z.string()).default([]),
});

export const RiskPatternSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['FINANCIAL', 'PRIVACY', 'LEGAL', 'OPERATIONAL', 'COMPLIANCE']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  description: z.string(),
  detection_rules: z.array(z.string()).default([]),
  mitigation_strategies: z.array(z.string()).default([]),
  false_positive_rate: z.number().min(0).max(1).default(0),
  accuracy: z.number().min(0).max(1).default(0),
  frequency: z.number().default(0),
  last_updated: z.date(),
});

// ===== MARKET INTELLIGENCE GRAPH ENTITIES =====

export const CompetitorSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string().optional(),
  category: z.enum(['DIRECT', 'INDIRECT', 'SUBSTITUTE']),
  market_cap: z.number().optional(),
  funding_raised: z.number().optional(),
  employee_count: z.number().optional(),
  founded_year: z.number().optional(),
  headquarters: z.string().optional(),
  business_model: z.enum(['SAAS', 'FREEMIUM', 'SUBSCRIPTION', 'ONE_TIME', 'USAGE_BASED']).optional(),
  target_market: z.array(z.string()).default([]),
  key_features: z.array(z.string()).default([]),
  pricing_model: z.string().optional(),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  last_analyzed: z.date(),
});

export const MarketTrendSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['TECHNOLOGY', 'REGULATION', 'MARKET_DEMAND', 'CUSTOMER_BEHAVIOR', 'COMPETITIVE_LANDSCAPE']),
  impact: z.enum(['POSITIVE', 'NEGATIVE', 'NEUTRAL']),
  confidence: z.number().min(0).max(1),
  time_horizon: z.enum(['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM']),
  description: z.string(),
  evidence: z.array(z.string()).default([]),
  opportunities: z.array(z.string()).default([]),
  threats: z.array(z.string()).default([]),
  action_items: z.array(z.string()).default([]),
  created_at: z.date(),
  last_updated: z.date(),
});

export const MarketOpportunitySchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.enum(['NEW_MARKET', 'PRODUCT_EXTENSION', 'PARTNERSHIP', 'ACQUISITION', 'GEOGRAPHIC_EXPANSION']),
  description: z.string(),
  market_size: z.number().optional(),
  revenue_potential: z.number().optional(),
  effort_required: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  risk_level: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  confidence: z.number().min(0).max(1),
  timeline_months: z.number().optional(),
  requirements: z.array(z.string()).default([]),
  success_criteria: z.array(z.string()).default([]),
  stakeholders: z.array(z.string()).default([]),
  created_at: z.date(),
  status: z.enum(['IDENTIFIED', 'ANALYZING', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED']).default('IDENTIFIED'),
});

// ===== BUSINESS PROCESS GRAPH ENTITIES =====

export const BusinessProcessSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['CUSTOMER_ONBOARDING', 'DOCUMENT_ANALYSIS', 'COMPLIANCE_CHECK', 'CUSTOMER_SUPPORT', 'BILLING', 'REPORTING']),
  description: z.string(),
  owner: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'UNDER_REVIEW', 'DEPRECATED']).default('ACTIVE'),
  automation_level: z.enum(['MANUAL', 'SEMI_AUTOMATED', 'FULLY_AUTOMATED']),
  average_duration_minutes: z.number(),
  success_rate: z.number().min(0).max(1),
  cost_per_execution: z.number().optional(),
  volume_per_day: z.number().default(0),
  error_rate: z.number().min(0).max(1).default(0),
  sla_target_minutes: z.number().optional(),
  dependencies: z.array(z.string()).default([]),
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  created_at: z.date(),
  last_optimized: z.date().optional(),
});

export const ProcessStepSchema = z.object({
  id: z.string(),
  process_id: z.string(),
  name: z.string(),
  order: z.number(),
  type: z.enum(['DECISION', 'ACTION', 'WAIT', 'APPROVAL', 'INTEGRATION']),
  description: z.string(),
  automated: z.boolean().default(false),
  duration_minutes: z.number(),
  success_rate: z.number().min(0).max(1).default(1),
  cost: z.number().optional(),
  responsible_agent: z.string().optional(),
  prerequisites: z.array(z.string()).default([]),
  exit_conditions: z.array(z.string()).default([]),
});

export const ProcessBottleneckSchema = z.object({
  id: z.string(),
  process_id: z.string(),
  step_id: z.string().optional(),
  type: z.enum(['RESOURCE_CONSTRAINT', 'WAIT_TIME', 'ERROR_RATE', 'MANUAL_INTERVENTION', 'DEPENDENCY']),
  description: z.string(),
  impact_score: z.number().min(1).max(10),
  frequency: z.number().default(0),
  average_delay_minutes: z.number(),
  cost_impact: z.number().optional(),
  proposed_solutions: z.array(z.string()).default([]),
  identified_at: z.date(),
  status: z.enum(['IDENTIFIED', 'ADDRESSING', 'RESOLVED', 'ACCEPTED']).default('IDENTIFIED'),
});

// ===== AGENT COORDINATION GRAPH ENTITIES =====

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['UI_UX', 'FRONTEND', 'BACKEND', 'DATABASE', 'DEVOPS', 'ANALYTICS', 'PAYMENT', 'EMAIL', 'QA', 'SECURITY', 'PERFORMANCE', 'LEGAL', 'BUSINESS']),
  description: z.string(),
  capabilities: z.array(z.string()).default([]),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'ERROR']).default('ACTIVE'),
  load_factor: z.number().min(0).max(1).default(0),
  success_rate: z.number().min(0).max(1).default(1),
  average_response_time_ms: z.number().optional(),
  total_tasks_completed: z.number().default(0),
  specializations: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  created_at: z.date(),
  last_active: z.date(),
});

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  type: z.enum(['DEVELOPMENT', 'ANALYSIS', 'OPTIMIZATION', 'INTEGRATION', 'TESTING', 'DEPLOYMENT', 'MONITORING', 'SUPPORT']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  status: z.enum(['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'FAILED']).default('PENDING'),
  assigned_agent_id: z.string().optional(),
  requester_id: z.string(),
  estimated_effort_hours: z.number().optional(),
  actual_effort_hours: z.number().optional(),
  complexity_score: z.number().min(1).max(10).optional(),
  required_capabilities: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  deliverables: z.array(z.string()).default([]),
  success_criteria: z.array(z.string()).default([]),
  created_at: z.date(),
  due_date: z.date().optional(),
  started_at: z.date().optional(),
  completed_at: z.date().optional(),
  metadata: z.record(z.any()).default({}),
});

export const AgentCollaborationSchema = z.object({
  id: z.string(),
  primary_agent_id: z.string(),
  secondary_agent_id: z.string(),
  collaboration_type: z.enum(['SEQUENTIAL', 'PARALLEL', 'REVIEW', 'CONSULTATION', 'HANDOFF']),
  task_id: z.string(),
  started_at: z.date(),
  completed_at: z.date().optional(),
  success: z.boolean().optional(),
  efficiency_score: z.number().min(0).max(10).optional(),
  communication_quality: z.number().min(1).max(5).optional(),
  outcome_quality: z.number().min(1).max(5).optional(),
  lessons_learned: z.array(z.string()).default([]),
});

// ===== RELATIONSHIP SCHEMAS =====

export const CustomerInteractsWithFeatureSchema = z.object({
  frequency: z.number().default(0),
  last_interaction: z.date(),
  satisfaction_score: z.number().min(0).max(10).optional(),
  success_rate: z.number().min(0).max(1).default(1),
});

export const DocumentContainsClauseSchema = z.object({
  position: z.number(),
  confidence_score: z.number().min(0).max(1),
  risk_level: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  detected_at: z.date(),
});

export const CompetitorTargetsMarketSchema = z.object({
  market_share: z.number().min(0).max(1).optional(),
  entry_date: z.date().optional(),
  competitive_advantage: z.array(z.string()).default([]),
  market_position: z.enum(['LEADER', 'CHALLENGER', 'FOLLOWER', 'NICHE']).optional(),
});

export const ProcessDependsOnProcessSchema = z.object({
  dependency_type: z.enum(['SEQUENTIAL', 'CONDITIONAL', 'RESOURCE', 'DATA']),
  strength: z.number().min(0).max(1).default(0.5),
  failure_impact: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
});

export const AgentHandlesTaskSchema = z.object({
  assigned_at: z.date(),
  started_at: z.date().optional(),
  estimated_completion: z.date().optional(),
  priority_adjustment: z.number().default(0),
  resource_allocation: z.number().min(0).max(1).default(1),
});

// ===== TYPE EXPORTS =====

export type Customer = z.infer<typeof CustomerSchema>;
export type CustomerInteraction = z.infer<typeof CustomerInteractionSchema>;
export type CustomerJourneyStage = z.infer<typeof CustomerJourneyStageSchema>;

export type ProductFeature = z.infer<typeof ProductFeatureSchema>;
export type ProductUsageEvent = z.infer<typeof ProductUsageEventSchema>;
export type ProductFeedback = z.infer<typeof ProductFeedbackSchema>;

export type LegalDocumentType = z.infer<typeof LegalDocumentTypeSchema>;
export type LegalClauseType = z.infer<typeof LegalClauseTypeSchema>;
export type RiskPattern = z.infer<typeof RiskPatternSchema>;

export type Competitor = z.infer<typeof CompetitorSchema>;
export type MarketTrend = z.infer<typeof MarketTrendSchema>;
export type MarketOpportunity = z.infer<typeof MarketOpportunitySchema>;

export type BusinessProcess = z.infer<typeof BusinessProcessSchema>;
export type ProcessStep = z.infer<typeof ProcessStepSchema>;
export type ProcessBottleneck = z.infer<typeof ProcessBottleneckSchema>;

export type Agent = z.infer<typeof AgentSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type AgentCollaboration = z.infer<typeof AgentCollaborationSchema>;

// Relationship types
export type CustomerInteractsWithFeature = z.infer<typeof CustomerInteractsWithFeatureSchema>;
export type DocumentContainsClause = z.infer<typeof DocumentContainsClauseSchema>;
export type CompetitorTargetsMarket = z.infer<typeof CompetitorTargetsMarketSchema>;
export type ProcessDependsOnProcess = z.infer<typeof ProcessDependsOnProcessSchema>;
export type AgentHandlesTask = z.infer<typeof AgentHandlesTaskSchema>;

// ===== GRAPH ENTITY LABELS =====

export const NODE_LABELS = {
  // Customer entities
  CUSTOMER: 'Customer',
  CUSTOMER_INTERACTION: 'CustomerInteraction',
  CUSTOMER_JOURNEY_STAGE: 'CustomerJourneyStage',
  
  // Product entities
  PRODUCT_FEATURE: 'ProductFeature',
  PRODUCT_USAGE_EVENT: 'ProductUsageEvent',
  PRODUCT_FEEDBACK: 'ProductFeedback',
  
  // Legal entities
  LEGAL_DOCUMENT_TYPE: 'LegalDocumentType',
  LEGAL_CLAUSE_TYPE: 'LegalClauseType',
  RISK_PATTERN: 'RiskPattern',
  
  // Market entities
  COMPETITOR: 'Competitor',
  MARKET_TREND: 'MarketTrend',
  MARKET_OPPORTUNITY: 'MarketOpportunity',
  
  // Process entities
  BUSINESS_PROCESS: 'BusinessProcess',
  PROCESS_STEP: 'ProcessStep',
  PROCESS_BOTTLENECK: 'ProcessBottleneck',
  
  // Agent entities
  AGENT: 'Agent',
  TASK: 'Task',
  AGENT_COLLABORATION: 'AgentCollaboration',
} as const;

export const RELATIONSHIP_TYPES = {
  // Customer relationships
  CUSTOMER_INTERACTS_WITH_FEATURE: 'INTERACTS_WITH',
  CUSTOMER_IN_JOURNEY_STAGE: 'IN_STAGE',
  CUSTOMER_HAS_INTERACTION: 'HAS_INTERACTION',
  CUSTOMER_PROVIDES_FEEDBACK: 'PROVIDES_FEEDBACK',
  
  // Product relationships
  FEATURE_GENERATES_USAGE: 'GENERATES_USAGE',
  USAGE_TRIGGERS_FEEDBACK: 'TRIGGERS_FEEDBACK',
  FEATURE_DEPENDS_ON_FEATURE: 'DEPENDS_ON',
  
  // Legal relationships
  DOCUMENT_CONTAINS_CLAUSE: 'CONTAINS_CLAUSE',
  CLAUSE_MATCHES_PATTERN: 'MATCHES_PATTERN',
  PATTERN_INDICATES_RISK: 'INDICATES_RISK',
  
  // Market relationships
  COMPETITOR_TARGETS_MARKET: 'TARGETS_MARKET',
  TREND_AFFECTS_OPPORTUNITY: 'AFFECTS_OPPORTUNITY',
  OPPORTUNITY_COMPETES_WITH_COMPETITOR: 'COMPETES_WITH',
  
  // Process relationships
  PROCESS_DEPENDS_ON_PROCESS: 'DEPENDS_ON',
  PROCESS_HAS_STEP: 'HAS_STEP',
  STEP_HAS_BOTTLENECK: 'HAS_BOTTLENECK',
  PROCESS_USES_FEATURE: 'USES_FEATURE',
  
  // Agent relationships
  AGENT_HANDLES_TASK: 'HANDLES_TASK',
  AGENT_COLLABORATES_WITH_AGENT: 'COLLABORATES_WITH',
  TASK_DEPENDS_ON_TASK: 'DEPENDS_ON',
  AGENT_SPECIALIZES_IN: 'SPECIALIZES_IN',
  
  // Cross-domain relationships
  CUSTOMER_USES_PROCESS: 'USES_PROCESS',
  PROCESS_ANALYZES_DOCUMENT: 'ANALYZES_DOCUMENT',
  AGENT_OPTIMIZES_PROCESS: 'OPTIMIZES_PROCESS',
  FEEDBACK_INFLUENCES_FEATURE: 'INFLUENCES_FEATURE',
  TREND_DRIVES_PROCESS_CHANGE: 'DRIVES_CHANGE',
} as const;