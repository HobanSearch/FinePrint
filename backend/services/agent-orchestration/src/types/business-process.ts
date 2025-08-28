import { z } from 'zod';
import { WorkflowDefinition, WorkflowExecution } from './workflow';

// Business Process Categories
export enum BusinessProcessCategory {
  MARKETING = 'marketing',
  SALES = 'sales',
  CUSTOMER_SUCCESS = 'customer_success',
  LEGAL_ANALYSIS = 'legal_analysis',  
  COMPLIANCE = 'compliance',
  OPERATIONS = 'operations',
  FINANCE = 'finance',
  SUPPORT = 'support',
  ONBOARDING = 'onboarding',
  CONTENT_CREATION = 'content_creation',
}

export enum BusinessProcessType {
  // Existing processes
  CUSTOMER_ONBOARDING = 'customer_onboarding',
  DOCUMENT_ANALYSIS_PIPELINE = 'document_analysis_pipeline',
  SALES_FUNNEL_AUTOMATION = 'sales_funnel_automation',
  CUSTOMER_SUPPORT_WORKFLOW = 'customer_support_workflow',
  COMPLIANCE_MONITORING = 'compliance_monitoring',
  BILLING_AUTOMATION = 'billing_automation',
  CONTENT_GENERATION = 'content_generation',
  MODEL_TRAINING_PIPELINE = 'model_training_pipeline',
  DEPLOYMENT_PIPELINE = 'deployment_pipeline',
  INCIDENT_RESPONSE = 'incident_response',
  
  // Enhanced Marketing processes
  MARKETING_CAMPAIGN = 'marketing_campaign',
  CONTENT_DISTRIBUTION = 'content_distribution',
  LEAD_GENERATION = 'lead_generation',
  MARKET_RESEARCH = 'market_research',
  BRAND_MONITORING = 'brand_monitoring',
  
  // Enhanced Sales processes
  LEAD_QUALIFICATION = 'lead_qualification',
  SALES_PIPELINE = 'sales_pipeline',
  PROPOSAL_GENERATION = 'proposal_generation',
  CONTRACT_NEGOTIATION = 'contract_negotiation',
  DEAL_CLOSURE = 'deal_closure',
  
  // Enhanced Customer Success processes
  HEALTH_MONITORING = 'health_monitoring',
  RETENTION_CAMPAIGN = 'retention_campaign',
  EXPANSION_OPPORTUNITY = 'expansion_opportunity',
  CHURN_PREVENTION = 'churn_prevention',
  
  // Enhanced Legal and Compliance processes
  RISK_ASSESSMENT = 'risk_assessment',
  COMPLIANCE_CHECK = 'compliance_check',
  CONTRACT_REVIEW = 'contract_review',
  POLICY_UPDATE = 'policy_update',
  
  // Enhanced Operations processes
  QUALITY_ASSURANCE = 'quality_assurance',
  PERFORMANCE_OPTIMIZATION = 'performance_optimization',
  RESOURCE_ALLOCATION = 'resource_allocation',
  CAPACITY_PLANNING = 'capacity_planning',
}

// Business Process Priority Levels
export enum BusinessProcessPriority {
  CRITICAL = 'critical',
  HIGH = 'high', 
  MEDIUM = 'medium',
  LOW = 'low',
  BACKGROUND = 'background',
}

export enum ProcessStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export const BusinessProcessSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  type: z.nativeEnum(BusinessProcessType),
  description: z.string().optional(),
  version: z.string().default('1.0.0'),
  workflows: z.array(z.object({
    workflowId: z.string(),
    order: z.number(),
    parallel: z.boolean().default(false),
    conditions: z.array(z.object({
      field: z.string(),
      operator: z.enum(['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'exists']),
      value: z.any(),
    })).default([]),
  })),
  triggers: z.array(z.object({
    type: z.enum(['api', 'webhook', 'scheduled', 'event', 'manual']),
    config: z.record(z.any()),
  })),
  sla: z.object({
    completionTime: z.number().min(1000), // milliseconds
    availability: z.number().min(0).max(100).default(99.9),
    errorRate: z.number().min(0).max(100).default(1),
  }),
  kpis: z.array(z.object({
    name: z.string(),
    metric: z.string(),
    target: z.number(),
    unit: z.string(),
  })).default([]),
  stakeholders: z.array(z.object({
    role: z.string(),
    userId: z.string(),
    permissions: z.array(z.string()),
  })).default([]),
  metadata: z.record(z.any()).default({}),
});

export type BusinessProcess = z.infer<typeof BusinessProcessSchema>;

export interface ProcessExecution {
  id: string;
  processId: string;
  processVersion: string;
  status: ProcessStatus;
  initiatedBy: string;
  initiationContext: Record<string, any>;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  workflowExecutions: ProcessWorkflowExecution[];
  currentStage: string;
  progress: number; // 0-100
  metrics: ProcessMetrics;
  outputs: Record<string, any>;
  error?: string;
  metadata: Record<string, any>;
}

export interface ProcessWorkflowExecution {
  workflowExecutionId: string;
  workflowId: string;
  order: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  inputs: Record<string, any>;
  outputs?: Record<string, any>;
  error?: string;
}

export interface ProcessMetrics {
  executionId: string;
  processId: string;
  timestamp: Date;
  throughput: number;
  latency: number;
  errorRate: number;
  resourceUtilization: Record<string, number>;
  costAccumulated: number;
  qualityScore: number;
  customerSatisfaction?: number;
  businessValue: number;
}

export interface ProcessTemplate {
  id: string;
  name: string;
  type: BusinessProcessType;
  description: string;
  category: string;
  industry: string[];
  complexity: 'simple' | 'medium' | 'complex';
  estimatedDuration: number;
  requiredAgents: string[];
  process: BusinessProcess;
  usageStatistics: {
    deployments: number;
    successRate: number;
    averageDuration: number;
    userRating: number;
  };
  customizationOptions: ProcessCustomization[];
  documentation: {
    setup: string;
    configuration: string;
    troubleshooting: string;
    bestPractices: string[];
  };
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProcessCustomization {
  parameter: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  defaultValue: any;
  validation: Record<string, any>;
  description: string;
  examples: any[];
}

export interface ProcessOptimization {
  processId: string;
  analysisDate: Date;
  currentPerformance: {
    averageDuration: number;
    successRate: number;
    costPerExecution: number;
    resourceEfficiency: number;
  };
  bottlenecks: Array<{
    stage: string;
    workflowId: string;
    impact: 'low' | 'medium' | 'high';
    description: string;
    suggestedFix: string;
  }>;
  recommendations: Array<{
    type: 'workflow_optimization' | 'resource_reallocation' | 'parallelization' | 'caching';
    target: string;
    description: string;
    expectedImprovement: {
      duration: number; // percentage
      cost: number; // percentage
      reliability: number; // percentage
    };
    implementationEffort: 'low' | 'medium' | 'high';
    risks: string[];
  }>;
  projectedImpact: {
    durationReduction: number;
    costSavings: number;
    reliabilityIncrease: number;
  };
}

export interface ProcessGovernance {
  processId: string;
  complianceFrameworks: string[]; // e.g., ['SOX', 'GDPR', 'HIPAA']
  auditRequirements: {
    retention: number; // days
    immutableLogs: boolean;
    approvalRequired: string[];
    segregationOfDuties: Array<{
      role1: string;
      role2: string;
      constraint: string;
    }>;
  };
  dataClassification: {
    inputData: string[];
    outputData: string[];
    processingRestrictions: Record<string, string>;
  };
  riskAssessment: {
    inherentRisk: 'low' | 'medium' | 'high';
    residualRisk: 'low' | 'medium' | 'high';
    mitigations: string[];
    controlTests: Array<{
      control: string;
      frequency: string;
      lastTested: Date;
      result: 'pass' | 'fail' | 'deficiency';
    }>;
  };
}

export interface CustomerOnboardingProcess {
  customerId: string;
  plan: 'starter' | 'professional' | 'enterprise';
  stages: {
    accountCreation: {
      status: 'completed' | 'pending' | 'failed';
      timestamp?: Date;
      data: {
        email: string;
        company: string;
        role: string;
      };
    };
    emailVerification: {
      status: 'completed' | 'pending' | 'failed';
      timestamp?: Date;
      attempts: number;
    };
    planSelection: {
      status: 'completed' | 'pending' | 'failed';
      timestamp?: Date;
      selectedPlan: string;
      paymentMethod?: string;
    };
    initialSetup: {
      status: 'completed' | 'pending' | 'failed';
      timestamp?: Date;
      configurationsCompleted: string[];
    };
    trainingCompleted: {
      status: 'completed' | 'pending' | 'failed';
      timestamp?: Date;
      modulesCompleted: string[];
    };
    firstAnalysis: {
      status: 'completed' | 'pending' | 'failed';
      timestamp?: Date;
      documentAnalyzed?: string;
    };
  };
  touchpoints: Array<{
    type: 'email' | 'in_app' | 'call' | 'chat';
    timestamp: Date;
    content: string;
    response?: string;
  }>;
  healthScore: number;
  riskFactors: string[];
  nextActions: string[];
}

export interface DocumentAnalysisPipeline {
  documentId: string;
  clientId: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  stages: {
    intake: {
      status: 'completed' | 'pending' | 'failed';
      timestamp?: Date;
      documentType: string;
      source: string;
    };
    preprocessing: {
      status: 'completed' | 'pending' | 'failed';
      timestamp?: Date;
      ocrPerformed: boolean;
      cleaningApplied: string[];
    };
    patternDetection: {
      status: 'completed' | 'pending' | 'failed';
      timestamp?: Date;
      patternsFound: number;
      confidence: number;
    };
    riskScoring: {
      status: 'completed' | 'pending' | 'failed';
      timestamp?: Date;
      overallScore: number;
      categoryScores: Record<string, number>;
    };
    reportGeneration: {
      status: 'completed' | 'pending' | 'failed';
      timestamp?: Date;
      reportFormat: string;
      customizations: string[];
    };
    delivery: {
      status: 'completed' | 'pending' | 'failed';
      timestamp?: Date;
      deliveryMethod: string;
      notificationsSent: string[];
    };
  };
  qualityChecks: Array<{
    stage: string;
    check: string;
    result: 'pass' | 'fail' | 'warning';
    details?: string;
  }>;
  slaCompliance: {
    targetTime: number;
    actualTime?: number;
    withinSLA: boolean;
  };
}

export interface ProcessAnalytics {
  processType: BusinessProcessType;
  timeframe: {
    start: Date;
    end: Date;
  };
  executions: {
    total: number;
    successful: number;
    failed: number;
    cancelled: number;
  };
  performance: {
    averageDuration: number;
    p95Duration: number;
    throughput: number;
    errorRate: number;
  };
  costs: {
    total: number;
    perExecution: number;
    breakdown: Record<string, number>;
  };
  bottlenecks: Array<{
    stage: string;
    averageWaitTime: number;
    frequency: number;
  }>;
  trends: Array<{
    date: Date;
    executions: number;
    avgDuration: number;
    successRate: number;
    cost: number;
  }>;
  userSatisfaction: {
    score: number;
    feedback: Array<{
      rating: number;
      comment: string;
      timestamp: Date;
    }>;
  };
}

// Enhanced Business Process Types for Advanced Orchestration

// SLA Configuration
export interface SLAConfiguration {
  targetDuration: number; // milliseconds
  maxDuration: number; // milliseconds
  escalationThreshold: number; // milliseconds
  notificationThresholds: number[]; // milliseconds
  businessHoursOnly: boolean;
  timezone: string;
  excludeWeekends: boolean;
  excludeHolidays: boolean;
}

// Business Rules for Process Execution
export interface BusinessRule {
  id: string;
  name: string;
  description: string;
  category: string;
  conditions: BusinessRuleCondition[];
  actions: BusinessRuleAction[];
  priority: number;
  enabled: boolean;
  validFrom?: Date;
  validTo?: Date;
  metadata: Record<string, any>;
}

export interface BusinessRuleCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'not_contains' | 'in' | 'not_in' | 'exists' | 'not_exists' | 'matches_regex';
  value: any;
  logicalOperator?: 'AND' | 'OR';
}

export interface BusinessRuleAction {
  type: 'set_variable' | 'trigger_workflow' | 'send_notification' | 'assign_agent' | 'escalate' | 'abort' | 'wait' | 'branch';
  parameters: Record<string, any>;
}

// Enhanced Business Process Definition
export interface EnhancedBusinessProcessDefinition extends BusinessProcess {
  category: BusinessProcessCategory;
  priority: BusinessProcessPriority;
  enhancedSla: SLAConfiguration;
  businessRules: BusinessRule[];
  stakeholders: ProcessStakeholder[];
  enhancedKpis: ProcessKPI[];
  costCenter?: string;
  owner: string;
  approvers: string[];
  compliance: ComplianceRequirement[];
  integrations: ProcessIntegration[];
  abTestConfig?: ABTestConfiguration;
  enhancedMetadata: BusinessProcessMetadata;
}

// Process Stakeholders
export interface ProcessStakeholder {
  id: string;
  role: 'owner' | 'approver' | 'participant' | 'observer' | 'escalation_contact';
  userId?: string;
  agentId?: string;
  email?: string;
  notificationPreferences: NotificationPreference[];
}

export interface NotificationPreference {
  event: 'started' | 'completed' | 'failed' | 'delayed' | 'escalated' | 'milestone_reached';
  channel: 'email' | 'slack' | 'webhook' | 'in_app';
  config: Record<string, any>;
}

// Enhanced Process KPIs
export interface ProcessKPI {
  id: string;
  name: string;
  description: string;
  type: 'duration' | 'success_rate' | 'cost' | 'quality_score' | 'customer_satisfaction' | 'throughput' | 'error_rate';
  target: number;
  unit: string;
  calculation: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'rate' | 'percentage';
  aggregationPeriod: 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
  thresholds: {
    critical: number;
    warning: number;
    good: number;
    excellent: number;
  };
}

// Compliance Requirements
export interface ComplianceRequirement {
  id: string;
  type: 'GDPR' | 'CCPA' | 'SOX' | 'HIPAA' | 'PCI_DSS' | 'SOC2' | 'ISO27001' | 'CUSTOM';
  name: string;
  description: string;
  requirements: string[];
  validationRules: BusinessRule[];
  auditTrail: boolean;
  dataRetention: {
    period: number; // days
    location: 'local' | 'encrypted' | 'anonymized' | 'deleted';
  };
}

// Process Integrations
export interface ProcessIntegration {
  id: string;
  type: 'webhook' | 'api' | 'database' | 'message_queue' | 'file_system' | 'external_service';
  name: string;
  endpoint?: string;
  authentication: {
    type: 'none' | 'api_key' | 'oauth2' | 'jwt' | 'basic_auth';
    config: Record<string, any>;
  };
  dataMapping: DataMapping[];
  errorHandling: {
    retryPolicy: {
      maxRetries: number;
      backoffStrategy: 'linear' | 'exponential' | 'fixed';
      delay: number;
    };
    fallbackAction: 'continue' | 'abort' | 'manual_review';
  };
}

export interface DataMapping {
  source: string;
  target: string;
  transformation?: string; // JavaScript expression or function name
  validation?: {
    required: boolean;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    format?: string; // regex pattern or predefined format
  };
}

// A/B Testing Configuration
export interface ABTestConfiguration {
  id: string;
  name: string;
  description: string;
  variants: ABTestVariant[];
  trafficSplit: Record<string, number>; // variant id -> percentage
  startDate: Date;
  endDate: Date;
  successMetrics: string[]; // KPI ids
  significanceLevel: number; // 0.95 for 95% confidence
  minimumSampleSize: number;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
}

export interface ABTestVariant {
  id: string;
  name: string;
  description: string;
  workflowOverrides: Record<string, any>; // path -> value overrides
  metadata: Record<string, any>;
}

// Enhanced Business Process Metadata
export interface BusinessProcessMetadata {
  businessValue: {
    revenueImpact: number;
    costSavings: number;
    timeToValue: number;
    customerSatisfactionImpact: number;
  };
  operationalMetrics: {
    avgExecutionTime: number;
    successRate: number;
    errorRate: number;
    throughput: number;
    costPerExecution: number;
  };
  qualityMetrics: {
    accuracy: number;
    completeness: number;
    timeliness: number;
    consistency: number;
  };
  riskAssessment: {
    businessRisk: 'low' | 'medium' | 'high' | 'critical';
    technicalRisk: 'low' | 'medium' | 'high' | 'critical';
    complianceRisk: 'low' | 'medium' | 'high' | 'critical';
    mitigationStrategies: string[];
  };
  version: string;
  lastReviewed: Date;
  nextReviewDate: Date;
  tags: string[];
  customFields: Record<string, any>;
}

// Enhanced Business Process Execution
export interface EnhancedBusinessProcessExecution extends ProcessExecution {
  processType: BusinessProcessType;
  priority: BusinessProcessPriority;
  slaStatus: 'on_track' | 'at_risk' | 'breached';
  slaMetrics: {
    targetCompletionTime: Date;
    escalationTime?: Date;
    actualDuration?: number;
    slaBreachReason?: string;
  };
  businessContext: {
    customerId?: string;
    accountValue?: number;
    region?: string;
    industry?: string;
    riskLevel?: 'low' | 'medium' | 'high';
  };
  kpiResults: Record<string, number>; // KPI id -> value
  complianceStatus: Record<string, 'compliant' | 'non_compliant' | 'pending'>; // requirement id -> status
  stakeholderNotifications: StakeholderNotification[];
  abTestVariant?: string;
  businessImpact: {
    revenueGenerated?: number;
    costIncurred?: number;
    customerSatisfactionScore?: number;
    timeToValue?: number;
  };
  enhancedMetadata: BusinessProcessExecutionMetadata;
}

export interface StakeholderNotification {
  stakeholderId: string;
  event: string;
  channel: string;
  sentAt: Date;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  response?: string;
}

export interface BusinessProcessExecutionMetadata {
  executionEnvironment: 'production' | 'staging' | 'development' | 'test';
  parentProcessId?: string;
  childProcessIds: string[];
  correlationId: string;
  traceId: string;
  businessUnit: string;
  costCenter: string;
  budget: {
    allocated: number;
    consumed: number;
    currency: string;
  };
  qualityGates: QualityGate[];
  approvals: ProcessApproval[];
  auditLog: AuditLogEntry[];
  customMetrics: Record<string, any>;
}

export interface QualityGate {
  id: string;
  name: string;
  criteria: BusinessRuleCondition[];
  status: 'pending' | 'passed' | 'failed' | 'skipped';
  evaluatedAt?: Date;
  result?: {
    passed: boolean;
    score: number;
    feedback: string;
  };
}

export interface ProcessApproval {
  id: string;
  approverId: string;
  stage: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  requestedAt: Date;
  respondedAt?: Date;
  comments?: string;
  conditions?: string[];
}

export interface AuditLogEntry {
  timestamp: Date;
  userId?: string;
  agentId?: string;
  action: string;
  resource: string;
  oldValue?: any;
  newValue?: any;
  reason?: string;
  metadata: Record<string, any>;
}

// Business Process Performance Analytics
export interface BusinessProcessPerformanceAnalytics {
  processType: BusinessProcessType;
  period: {
    start: Date;
    end: Date;
  };
  executionMetrics: {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDuration: number;
    medianDuration: number;
    p95Duration: number;
    throughputPerHour: number;
    slaComplianceRate: number;
  };
  businessMetrics: {
    totalRevenue: number;
    totalCost: number;
    roi: number;
    customerSatisfactionAvg: number;
    timeToValueAvg: number;
  };
  qualityMetrics: {
    overallQualityScore: number;
    accuracyRate: number;
    completenessRate: number;
    consistencyScore: number;
  };
  resourceUtilization: {
    agentUtilization: Record<string, number>; // agent type -> utilization %
    computeResourceUsage: number;
    storageUsage: number;
    networkUsage: number;
  };
  trends: {
    executionTrend: TrendData[];
    durationTrend: TrendData[];
    successRateTrend: TrendData[];
    costTrend: TrendData[];
  };
  bottlenecks: ProcessBottleneck[];
  recommendations: ProcessOptimizationRecommendation[];
}

export interface TrendData {
  timestamp: Date;
  value: number;
  change: number; // percentage change from previous period
}

export interface ProcessBottleneck {
  type: 'agent_capacity' | 'resource_constraint' | 'dependency_delay' | 'data_quality' | 'external_service';
  location: string; // task id or component name
  impact: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  suggestedActions: string[];
  estimatedImprovement: {
    durationReduction: number; // percentage
    costReduction: number; // percentage
    qualityImprovement: number; // percentage
  };
}

export interface ProcessOptimizationRecommendation {
  id: string;
  type: 'parallelization' | 'caching' | 'agent_scaling' | 'task_elimination' | 'automation_expansion' | 'sla_adjustment';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  estimatedBenefit: {
    durationImprovement: number; // percentage
    costSavings: number; // dollar amount
    qualityImprovement: number; // percentage
    riskReduction: number; // percentage
  };
  implementationComplexity: 'low' | 'medium' | 'high';
  estimatedEffort: number; // hours
  prerequisites: string[];
  suggestedImplementation: string;
}

// Enhanced Zod schemas for validation
export const BusinessRuleConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'not_contains', 'in', 'not_in', 'exists', 'not_exists', 'matches_regex']),
  value: z.any(),
  logicalOperator: z.enum(['AND', 'OR']).optional(),
});

export const BusinessRuleActionSchema = z.object({
  type: z.enum(['set_variable', 'trigger_workflow', 'send_notification', 'assign_agent', 'escalate', 'abort', 'wait', 'branch']),
  parameters: z.record(z.any()),
});

export const BusinessRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  conditions: z.array(BusinessRuleConditionSchema),
  actions: z.array(BusinessRuleActionSchema),
  priority: z.number().min(1).max(10),
  enabled: z.boolean(),
  validFrom: z.date().optional(),
  validTo: z.date().optional(),
  metadata: z.record(z.any()),
});

export const SLAConfigurationSchema = z.object({
  targetDuration: z.number().positive(),
  maxDuration: z.number().positive(),
  escalationThreshold: z.number().positive(),
  notificationThresholds: z.array(z.number().positive()),
  businessHoursOnly: z.boolean(),
  timezone: z.string(),
  excludeWeekends: z.boolean(),
  excludeHolidays: z.boolean(),
});

export const ProcessKPISchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(['duration', 'success_rate', 'cost', 'quality_score', 'customer_satisfaction', 'throughput', 'error_rate']),
  target: z.number(),
  unit: z.string(),
  calculation: z.enum(['sum', 'avg', 'min', 'max', 'count', 'rate', 'percentage']),
  aggregationPeriod: z.enum(['hour', 'day', 'week', 'month', 'quarter', 'year']),
  thresholds: z.object({
    critical: z.number(),
    warning: z.number(),
    good: z.number(),
    excellent: z.number(),
  }),
});

export const EnhancedBusinessProcessDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  version: z.string().default('1.0.0'),
  tags: z.array(z.string()).default([]),
  processType: z.nativeEnum(BusinessProcessType),
  category: z.nativeEnum(BusinessProcessCategory),
  priority: z.nativeEnum(BusinessProcessPriority),
  enhancedSla: SLAConfigurationSchema,
  businessRules: z.array(BusinessRuleSchema).default([]),
  enhancedKpis: z.array(ProcessKPISchema).default([]),
  costCenter: z.string().optional(),
  owner: z.string(),
  approvers: z.array(z.string()).default([]),
  enhancedMetadata: z.record(z.any()),
});