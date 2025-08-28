import { AgentType } from './index';

export interface AgentTeam {
  id: string;
  name: string;
  description: string;
  members: TeamMember[];
  capabilities: string[];
  coordinationType: TeamCoordinationType;
  maxParallelTasks: number;
  priority: TeamPriority;
}

export interface TeamMember {
  agentType: AgentType;
  role: TeamRole;
  required: boolean;
  minInstances: number;
  maxInstances: number;
  capabilities: string[];
}

export enum TeamRole {
  LEADER = 'leader',
  COORDINATOR = 'coordinator',
  EXECUTOR = 'executor',
  SPECIALIST = 'specialist',
  REVIEWER = 'reviewer',
  SUPPORT = 'support'
}

export enum TeamCoordinationType {
  PARALLEL = 'parallel',
  SEQUENTIAL = 'sequential',
  HYBRID = 'hybrid',
  CONSENSUS = 'consensus',
  PIPELINE = 'pipeline'
}

export enum TeamPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

export interface TeamWorkflow {
  id: string;
  teamId: string;
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  dependencies: WorkflowDependency[];
  timeout: number;
  retryPolicy: RetryPolicy;
  successCriteria: SuccessCriteria;
}

export interface WorkflowStep {
  id: string;
  name: string;
  agentType: AgentType;
  action: string;
  inputs: Record<string, any>;
  outputs: string[];
  parallel: boolean;
  condition?: StepCondition;
  timeout: number;
  retryPolicy: RetryPolicy;
}

export interface WorkflowDependency {
  from: string;
  to: string;
  type: DependencyType;
  dataMapping?: Record<string, string>;
}

export enum DependencyType {
  SEQUENTIAL = 'sequential',
  PARALLEL = 'parallel',
  CONDITIONAL = 'conditional',
  DATA = 'data'
}

export interface StepCondition {
  type: 'success' | 'failure' | 'custom';
  expression?: string;
  fallbackStep?: string;
}

export interface WorkflowTrigger {
  type: TriggerType;
  config: Record<string, any>;
}

export enum TriggerType {
  API = 'api',
  SCHEDULE = 'schedule',
  EVENT = 'event',
  MANUAL = 'manual',
  CONDITION = 'condition'
}

export interface RetryPolicy {
  maxRetries: number;
  backoffStrategy: 'linear' | 'exponential' | 'fixed';
  baseDelay: number;
  maxDelay: number;
  retryableErrors?: string[];
}

export interface SuccessCriteria {
  required: string[];
  optional: string[];
  businessMetrics: BusinessMetric[];
  minimumAgents: number;
  timeConstraints?: TimeConstraints;
}

export interface BusinessMetric {
  name: string;
  target: number;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  unit: string;
}

export interface TimeConstraints {
  maxDuration: number;
  businessHoursOnly: boolean;
  timezone: string;
}

export interface TeamExecution {
  id: string;
  teamId: string;
  workflowId: string;
  status: ExecutionStatus;
  startTime: Date;
  endTime?: Date;
  progress: ExecutionProgress;
  results: Record<string, any>;
  errors: ExecutionError[];
  metrics: ExecutionMetrics;
}

export enum ExecutionStatus {
  PENDING = 'pending',
  INITIALIZING = 'initializing',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout'
}

export interface ExecutionProgress {
  totalSteps: number;
  completedSteps: number;
  currentSteps: string[];
  percentage: number;
  estimatedTimeRemaining?: number;
}

export interface ExecutionError {
  stepId: string;
  agentId: string;
  timestamp: Date;
  message: string;
  code: string;
  recoverable: boolean;
  retryCount: number;
}

export interface ExecutionMetrics {
  duration: number;
  agentsInvolved: number;
  tasksCompleted: number;
  tasksFailed: number;
  averageStepDuration: number;
  resourceUtilization: Record<string, number>;
  businessImpact: Record<string, number>;
}

export interface TeamMonitoring {
  teamId: string;
  realTimeMetrics: RealTimeMetrics;
  historicalPerformance: HistoricalPerformance;
  alerts: TeamAlert[];
  recommendations: TeamRecommendation[];
}

export interface RealTimeMetrics {
  activeExecutions: number;
  queuedExecutions: number;
  averageExecutionTime: number;
  successRate: number;
  agentUtilization: Record<string, number>;
  throughput: number;
}

export interface HistoricalPerformance {
  period: { start: Date; end: Date };
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDuration: number;
  peakHours: number[];
  performanceTrend: 'improving' | 'stable' | 'degrading';
}

export interface TeamAlert {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  type: string;
  message: string;
  timestamp: Date;
  affectedAgents: string[];
  suggestedAction: string;
}

export interface TeamRecommendation {
  type: 'scaling' | 'optimization' | 'configuration' | 'maintenance';
  priority: TeamPriority;
  description: string;
  estimatedImpact: string;
  implementation: string;
}