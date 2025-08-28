import { z } from 'zod';
import { AgentType, AgentCapability } from './agent';

export enum WorkflowStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum TaskStatus {
  PENDING = 'pending',
  WAITING_FOR_DEPENDENCIES = 'waiting_for_dependencies',
  READY = 'ready',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  CANCELLED = 'cancelled',
}

export enum WorkflowTriggerType {
  MANUAL = 'manual',
  SCHEDULED = 'scheduled',
  EVENT = 'event',
  WEBHOOK = 'webhook',
  API = 'api',
}

export const WorkflowTaskSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  agentType: z.nativeEnum(AgentType),
  requiredCapabilities: z.array(z.nativeEnum(AgentCapability)),
  inputSchema: z.record(z.any()),
  outputSchema: z.record(z.any()),
  timeout: z.number().min(1000).default(300000),
  retryPolicy: z.object({
    maxRetries: z.number().min(0).default(3),
    backoffMultiplier: z.number().min(1).default(2),
    initialDelay: z.number().min(100).default(1000),
  }),
  dependencies: z.array(z.string()).default([]),
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'exists']),
    value: z.any(),
  })).default([]),
  parallel: z.boolean().default(false),
  priority: z.number().min(1).max(10).default(5),
  metadata: z.record(z.any()).default({}),
});

export type WorkflowTask = z.infer<typeof WorkflowTaskSchema>;

export const WorkflowDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  version: z.string().default('1.0.0'),
  tags: z.array(z.string()).default([]),
  trigger: z.object({
    type: z.nativeEnum(WorkflowTriggerType),
    config: z.record(z.any()),
  }),
  tasks: z.array(WorkflowTaskSchema),
  globalTimeout: z.number().min(1000).default(3600000), // 1 hour
  maxConcurrentTasks: z.number().min(1).default(10),
  errorHandling: z.object({
    onFailure: z.enum(['stop', 'continue', 'retry']).default('stop'),
    maxRetries: z.number().min(0).default(3),
    notifyOnFailure: z.boolean().default(true),
  }),
  variables: z.record(z.any()).default({}),
  metadata: z.record(z.any()).default({}),
});

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowVersion: string;
  status: WorkflowStatus;
  triggeredBy: string;
  triggerData: Record<string, any>;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  taskExecutions: TaskExecution[];
  variables: Record<string, any>;
  output?: Record<string, any>;
  error?: string;
  metadata: Record<string, any>;
}

export interface TaskExecution {
  id: string;
  taskId: string;
  workflowExecutionId: string;
  agentId?: string;
  status: TaskStatus;
  input: Record<string, any>;
  output?: Record<string, any>;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  retryCount: number;
  logs: TaskLog[];
  metadata: Record<string, any>;
}

export interface TaskLog {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: Record<string, any>;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  definition: WorkflowDefinition;
  usageCount: number;
  rating: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowSchedule {
  id: string;
  workflowId: string;
  name: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  lastRun?: Date;
  nextRun: Date;
  runCount: number;
  successCount: number;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowMetrics {
  workflowId: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDuration: number;
  averageTaskCount: number;
  mostUsedAgents: Array<{
    agentType: AgentType;
    usageCount: number;
  }>;
  errorPatterns: Array<{
    error: string;
    count: number;
  }>;
  performanceTrends: Array<{
    date: Date;
    executionCount: number;
    averageDuration: number;
    successRate: number;
  }>;
}