import { z } from 'zod';

// Core Agent Types
export interface Agent {
  id: string;
  name: string;
  description: string;
  capabilities: AgentCapability[];
  status: AgentStatus;
  lastActive: Date;
  metrics: AgentMetrics;
}

export enum AgentStatus {
  ACTIVE = 'active',
  IDLE = 'idle',
  BUSY = 'busy',
  ERROR = 'error',
  OFFLINE = 'offline'
}

export enum AgentCapability {
  CODE_GENERATION = 'code_generation',
  ARCHITECTURE_DECISIONS = 'architecture_decisions',
  QUALITY_ASSURANCE = 'quality_assurance',
  INTEGRATION_MANAGEMENT = 'integration_management',
  TEMPLATE_MANAGEMENT = 'template_management',
  LEARNING_ADAPTATION = 'learning_adaptation'
}

export interface AgentMetrics {
  codeGenerated: number;
  decisionsEvaluated: number;
  qualityChecks: number;
  successRate: number;
  averageResponseTime: number;
  errorsEncountered: number;
}

// Code Generation Types
export const CodeGenerationRequestSchema = z.object({
  type: z.enum(['component', 'service', 'api', 'database', 'infrastructure', 'test', 'documentation']),
  framework: z.string(),
  language: z.enum(['typescript', 'javascript', 'python', 'sql', 'yaml', 'dockerfile', 'markdown']),
  context: z.object({
    projectType: z.string(),
    existingCode: z.string().optional(),
    requirements: z.string(),
    constraints: z.array(z.string()).optional(),
    integrations: z.array(z.string()).optional()
  }),
  options: z.object({
    includeTests: z.boolean().default(true),
    includeDocumentation: z.boolean().default(true),
    followExistingPatterns: z.boolean().default(true),
    optimizeForPerformance: z.boolean().default(false),
    ensureAccessibility: z.boolean().default(true)
  }).optional()
});

export type CodeGenerationRequest = z.infer<typeof CodeGenerationRequestSchema>;

export interface CodeGenerationResult {
  id: string;
  request: CodeGenerationRequest;
  generatedCode: GeneratedCodeFile[];
  metadata: CodeMetadata;
  qualityScore: number;
  recommendations: string[];
  timestamp: Date;
}

export interface GeneratedCodeFile {
  path: string;
  content: string;
  type: FileType;
  language: string;
  dependencies: string[];
  description: string;
}

export enum FileType {
  SOURCE = 'source',
  TEST = 'test',
  CONFIG = 'config',
  DOCUMENTATION = 'documentation',
  SCHEMA = 'schema',
  MIGRATION = 'migration'
}

export interface CodeMetadata {
  linesOfCode: number;
  complexity: number;
  dependencies: string[];
  patterns: string[];
  estimatedMaintainability: number;
  securityScore: number;
  performanceScore: number;
}

// Architecture Decision Types
export const ArchitectureDecisionRequestSchema = z.object({
  context: z.object({
    projectType: z.string(),
    requirements: z.array(z.string()),
    constraints: z.array(z.string()),
    existingArchitecture: z.string().optional(),
    scalabilityNeeds: z.enum(['small', 'medium', 'large', 'enterprise']),
    performanceRequirements: z.object({
      latency: z.number().optional(),
      throughput: z.number().optional(),
      availability: z.number().optional()
    }).optional()
  }),
  decisionType: z.enum([
    'framework_selection',
    'database_choice',
    'architecture_pattern',
    'deployment_strategy',
    'integration_approach',
    'security_model',
    'caching_strategy',
    'messaging_system'
  ]),
  options: z.array(z.object({
    name: z.string(),
    description: z.string(),
    pros: z.array(z.string()),
    cons: z.array(z.string()),
    complexity: z.number().min(1).max(5),
    cost: z.number().min(1).max(5),
    maturity: z.number().min(1).max(5)
  }))
});

export type ArchitectureDecisionRequest = z.infer<typeof ArchitectureDecisionRequestSchema>;

export interface ArchitectureDecisionResult {
  id: string;
  request: ArchitectureDecisionRequest;
  recommendation: ArchitectureRecommendation;
  alternatives: ArchitectureRecommendation[];
  rationale: string;
  impactAnalysis: ImpactAnalysis;
  implementationGuide: ImplementationGuide;
  timestamp: Date;
}

export interface ArchitectureRecommendation {
  option: string;
  confidence: number;
  score: number;
  reasoning: string[];
  risks: Risk[];
  benefits: Benefit[];
}

export interface Risk {
  type: RiskType;
  severity: RiskSeverity;
  description: string;
  mitigation: string;
  probability: number;
}

export enum RiskType {
  TECHNICAL = 'technical',
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  SCALABILITY = 'scalability',
  MAINTAINABILITY = 'maintainability',
  COST = 'cost'
}

export enum RiskSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface Benefit {
  type: BenefitType;
  impact: ImpactLevel;
  description: string;
  quantification: string;
}

export enum BenefitType {
  PERFORMANCE = 'performance',
  SCALABILITY = 'scalability',
  MAINTAINABILITY = 'maintainability',
  DEVELOPER_EXPERIENCE = 'developer_experience',
  COST_EFFICIENCY = 'cost_efficiency',
  SECURITY = 'security',
  RELIABILITY = 'reliability'
}

export enum ImpactLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  VERY_HIGH = 'very_high'
}

export interface ImpactAnalysis {
  performanceImpact: number;
  scalabilityImpact: number;
  maintainabilityImpact: number;
  costImpact: number;
  timeToImplement: number;
  riskLevel: RiskSeverity;
}

export interface ImplementationGuide {
  steps: ImplementationStep[];
  estimatedTime: number;
  requiredSkills: string[];
  dependencies: string[];
  testingStrategy: string;
  rollbackPlan: string;
}

export interface ImplementationStep {
  id: string;
  title: string;
  description: string;
  estimatedTime: number;
  dependencies: string[];
  deliverables: string[];
  risks: string[];
}

// Quality Assurance Types
export const QualityAssessmentRequestSchema = z.object({
  code: z.string(),
  language: z.string(),
  context: z.object({
    framework: z.string().optional(),
    projectType: z.string().optional(),
    requirements: z.array(z.string()).optional()
  }).optional(),
  checks: z.array(z.enum([
    'syntax',
    'formatting',
    'security',
    'performance',
    'accessibility',
    'best_practices',
    'testing',
    'documentation'
  ])).optional()
});

export type QualityAssessmentRequest = z.infer<typeof QualityAssessmentRequestSchema>;

export interface QualityAssessmentResult {
  id: string;
  request: QualityAssessmentRequest;
  overallScore: number;
  assessments: QualityCheck[];
  suggestions: QualitySuggestion[];
  metrics: QualityMetrics;
  timestamp: Date;
}

export interface QualityCheck {
  type: QualityCheckType;
  score: number;
  status: CheckStatus;
  issues: QualityIssue[];
  recommendations: string[];
}

export enum QualityCheckType {
  SYNTAX = 'syntax',
  FORMATTING = 'formatting',
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  ACCESSIBILITY = 'accessibility',
  BEST_PRACTICES = 'best_practices',
  TESTING = 'testing',
  DOCUMENTATION = 'documentation'
}

export enum CheckStatus {
  PASSED = 'passed',
  WARNING = 'warning',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

export interface QualityIssue {
  type: QualityCheckType;
  severity: IssueSeverity;
  message: string;
  line?: number;
  column?: number;
  rule?: string;
  fixSuggestion?: string;
}

export enum IssueSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export interface QualitySuggestion {
  type: SuggestionType;
  priority: Priority;
  description: string;
  implementation: string;
  impact: string;
}

export enum SuggestionType {
  REFACTORING = 'refactoring',
  OPTIMIZATION = 'optimization',
  SECURITY_ENHANCEMENT = 'security_enhancement',
  ACCESSIBILITY_IMPROVEMENT = 'accessibility_improvement',
  TESTING_IMPROVEMENT = 'testing_improvement',
  DOCUMENTATION_IMPROVEMENT = 'documentation_improvement'
}

export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface QualityMetrics {
  complexity: number;
  maintainabilityIndex: number;
  testCoverage: number;
  duplicatedLines: number;
  technicalDebt: number;
  securityScore: number;
  accessibilityScore: number;
}

// Template Management Types
export interface Template {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  type: TemplateType;
  framework: string;
  language: string;
  version: string;
  content: TemplateContent;
  metadata: TemplateMetadata;
  usage: TemplateUsage;
}

export enum TemplateCategory {
  COMPONENT = 'component',
  SERVICE = 'service',
  API = 'api',
  DATABASE = 'database',
  INFRASTRUCTURE = 'infrastructure',
  TEST = 'test',
  DOCUMENTATION = 'documentation',
  CONFIGURATION = 'configuration'
}

export enum TemplateType {
  FILE = 'file',
  DIRECTORY = 'directory',
  PROJECT = 'project',
  SNIPPET = 'snippet'
}

export interface TemplateContent {
  files: TemplateFile[];
  variables: TemplateVariable[];
  hooks: TemplateHook[];
}

export interface TemplateFile {
  path: string;
  content: string;
  isTemplate: boolean;
  conditions?: TemplateCondition[];
}

export interface TemplateVariable {
  name: string;
  type: VariableType;
  description: string;
  required: boolean;
  defaultValue?: any;
  validation?: string;
  options?: string[];
}

export enum VariableType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  ARRAY = 'array',
  OBJECT = 'object',
  ENUM = 'enum'
}

export interface TemplateHook {
  name: string;
  type: HookType;
  script: string;
  when: HookTrigger;
}

export enum HookType {
  PRE_GENERATION = 'pre_generation',
  POST_GENERATION = 'post_generation',
  PRE_FILE = 'pre_file',
  POST_FILE = 'post_file'
}

export enum HookTrigger {
  ALWAYS = 'always',
  CONDITIONAL = 'conditional',
  ON_ERROR = 'on_error'
}

export interface TemplateCondition {
  variable: string;
  operator: ConditionOperator;
  value: any;
}

export enum ConditionOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  EXISTS = 'exists',
  NOT_EXISTS = 'not_exists'
}

export interface TemplateMetadata {
  author: string;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  dependencies: string[];
  compatibility: string[];
  documentation: string;
  examples: TemplateExample[];
}

export interface TemplateExample {
  name: string;
  description: string;
  input: Record<string, any>;
  output: string;
}

export interface TemplateUsage {
  totalUsed: number;
  lastUsed: Date;
  averageRating: number;
  feedback: TemplateFeedback[];
}

export interface TemplateFeedback {
  userId: string;
  rating: number;
  comment: string;
  timestamp: Date;
}

// Integration Types
export interface Integration {
  id: string;
  name: string;
  type: IntegrationType;
  status: IntegrationStatus;
  configuration: IntegrationConfiguration;
  lastSync: Date;
  metrics: IntegrationMetrics;
}

export enum IntegrationType {
  DSPY = 'dspy',
  LORA = 'lora',
  KNOWLEDGE_GRAPH = 'knowledge_graph',
  GIT = 'git',
  CI_CD = 'ci_cd',
  MONITORING = 'monitoring',
  EXTERNAL_API = 'external_api'
}

export enum IntegrationStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
  SYNCING = 'syncing'
}

export interface IntegrationConfiguration {
  endpoint?: string;
  credentials?: Record<string, string>;
  settings: Record<string, any>;
  hooks: IntegrationHook[];
}

export interface IntegrationHook {
  event: string;
  action: string;
  config: Record<string, any>;
}

export interface IntegrationMetrics {
  requestsSent: number;
  requestsReceived: number;
  errorsEncountered: number;
  averageResponseTime: number;
  lastErrorTime?: Date;
  lastErrorMessage?: string;
}

// Workflow Types
export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
  status: WorkflowStatus;
  metadata: WorkflowMetadata;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: StepType;
  action: string;
  config: Record<string, any>;
  dependencies: string[];
  retryPolicy: RetryPolicy;
  timeout: number;
}

export enum StepType {
  CODE_GENERATION = 'code_generation',
  ARCHITECTURE_DECISION = 'architecture_decision',
  QUALITY_CHECK = 'quality_check',
  TEMPLATE_APPLY = 'template_apply',
  INTEGRATION_SYNC = 'integration_sync',
  NOTIFICATION = 'notification',
  CONDITIONAL = 'conditional',
  PARALLEL = 'parallel'
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMultiplier: number;
  maxBackoffSeconds: number;
}

export interface WorkflowTrigger {
  type: TriggerType;
  config: Record<string, any>;
  enabled: boolean;
}

export enum TriggerType {
  MANUAL = 'manual',
  SCHEDULE = 'schedule',
  WEBHOOK = 'webhook',
  FILE_CHANGE = 'file_change',
  API_CALL = 'api_call',
  INTEGRATION_EVENT = 'integration_event'
}

export enum WorkflowStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface WorkflowMetadata {
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  version: string;
  tags: string[];
  executionHistory: WorkflowExecution[];
}

export interface WorkflowExecution {
  id: string;
  startTime: Date;
  endTime?: Date;
  status: ExecutionStatus;
  steps: StepExecution[];
  error?: string;
  output?: any;
}

export enum ExecutionStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface StepExecution {
  stepId: string;
  startTime: Date;
  endTime?: Date;
  status: ExecutionStatus;
  input: any;
  output?: any;
  error?: string;
  retryCount: number;
}

// API Response Types
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: APIError;
  metadata?: ResponseMetadata;
}

export interface APIError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: Date;
}

export interface ResponseMetadata {
  requestId: string;
  timestamp: Date;
  processingTime: number;
  version: string;
}

// WebSocket Types
export interface WebSocketMessage {
  type: MessageType;
  payload: any;
  timestamp: Date;
  requestId?: string;
}

export enum MessageType {
  GENERATION_PROGRESS = 'generation_progress',
  GENERATION_COMPLETE = 'generation_complete',
  DECISION_UPDATE = 'decision_update',
  QUALITY_CHECK_RESULT = 'quality_check_result',
  INTEGRATION_STATUS = 'integration_status',
  WORKFLOW_UPDATE = 'workflow_update',
  ERROR = 'error',
  PING = 'ping',
  PONG = 'pong'
}

// Configuration Types
export interface AgentConfiguration {
  generation: GenerationConfig;
  architecture: ArchitectureConfig;
  quality: QualityConfig;
  integrations: IntegrationConfig;
  templates: TemplateConfig;
  security: SecurityConfig;
  performance: PerformanceConfig;
}

export interface GenerationConfig {
  defaultLanguage: string;
  defaultFramework: string;
  enableAIEnhancement: boolean;
  maxFileSize: number;
  maxFilesPerGeneration: number;
  templateCacheSize: number;
}

export interface ArchitectureConfig {
  decisionCacheTime: number;
  enablePredictiveAnalysis: boolean;
  defaultScalabilityLevel: string;
  considerCostInDecisions: boolean;
}

export interface QualityConfig {
  enabledChecks: QualityCheckType[];
  minimumScore: number;
  enableAutoFix: boolean;
  customRules: string[];
}

export interface IntegrationConfig {
  enabledIntegrations: IntegrationType[];
  syncInterval: number;
  retryAttempts: number;
  timeoutSeconds: number;
}

export interface TemplateConfig {
  repositoryUrl: string;
  updateInterval: number;
  enableCustomTemplates: boolean;
  maxTemplateSize: number;
}

export interface SecurityConfig {
  enableSecurityScanning: boolean;
  allowedDomains: string[];
  encryptionKey: string;
  rateLimitPerMinute: number;
}

export interface PerformanceConfig {
  maxConcurrentGenerations: number;
  cacheSize: number;
  memoryLimit: number;
  cpuLimit: number;
}