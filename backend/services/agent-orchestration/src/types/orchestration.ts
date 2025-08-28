import { z } from 'zod';
import { WorkflowDefinition, WorkflowExecution, TaskExecution } from './workflow';
import { BusinessProcessType, BusinessProcessCategory, BusinessProcessPriority } from './business-process';

// Event-Driven Orchestration Types
export enum EventType {
  WORKFLOW_STARTED = 'workflow.started',
  WORKFLOW_COMPLETED = 'workflow.completed',
  WORKFLOW_FAILED = 'workflow.failed',
  WORKFLOW_PAUSED = 'workflow.paused',
  WORKFLOW_RESUMED = 'workflow.resumed',
  WORKFLOW_CANCELLED = 'workflow.cancelled',
  
  TASK_STARTED = 'task.started',
  TASK_COMPLETED = 'task.completed',
  TASK_FAILED = 'task.failed',
  TASK_RETRY = 'task.retry',
  TASK_TIMEOUT = 'task.timeout',
  
  AGENT_AVAILABLE = 'agent.available',
  AGENT_UNAVAILABLE = 'agent.unavailable',
  AGENT_OVERLOADED = 'agent.overloaded',
  AGENT_ERROR = 'agent.error',
  
  BUSINESS_EVENT = 'business.event',
  SYSTEM_EVENT = 'system.event',
  USER_EVENT = 'user.event',
  EXTERNAL_EVENT = 'external.event',
  
  SLA_WARNING = 'sla.warning',
  SLA_BREACH = 'sla.breach',
  
  RESOURCE_ALLOCATED = 'resource.allocated',
  RESOURCE_RELEASED = 'resource.released',
  RESOURCE_EXHAUSTED = 'resource.exhausted',
}

export interface OrchestrationEvent {
  id: string;
  type: EventType;
  source: string;
  timestamp: Date;
  payload: Record<string, any>;
  metadata: {
    correlationId?: string;
    traceId?: string;
    causationId?: string;
    version: number;
    retryCount?: number;
  };
  headers: Record<string, string>;
}

// Agent Capability Registry Types
export interface AgentCapability {
  id: string;
  name: string;
  category: string;
  description: string;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  complexity: 'simple' | 'medium' | 'complex';
  estimatedDuration: number; // milliseconds
  resourceRequirements: {
    cpu: number; // percentage
    memory: number; // MB
    storage: number; // MB
    network: number; // Mbps
  };
  dependencies: string[]; // other capability IDs
  prerequisites: string[]; // required conditions
  qualityMetrics: {
    accuracy: number; // 0-1
    reliability: number; // 0-1
    performance: number; // 0-1
  };
  costModel: {
    fixedCost: number;
    variableCost: number;
    currency: string;
  };
}

export interface AgentRegistration {
  id: string;
  name: string;
  type: string;
  version: string;
  endpoint: string;
  capabilities: AgentCapability[];
  healthCheck: {
    url: string;
    interval: number; // milliseconds
    timeout: number; // milliseconds
    retries: number;
  };
  loadBalancing: {
    maxConcurrentTasks: number;
    weight: number; // 1-10
    priority: number; // 1-10
  };
  scaling: {
    minInstances: number;
    maxInstances: number;
    scaleUpThreshold: number; // CPU percentage
    scaleDownThreshold: number; // CPU percentage
    cooldownPeriod: number; // milliseconds
  };
  authentication: {
    type: 'none' | 'api_key' | 'oauth2' | 'jwt' | 'mutual_tls';
    config: Record<string, any>;
  };
  metadata: Record<string, any>;
}

export interface AgentHealth {
  agentId: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastCheckAt: Date;
  responseTime: number; // milliseconds
  errorRate: number; // 0-1
  throughput: number; // requests per second
  load: {
    cpu: number; // percentage
    memory: number; // percentage
    storage: number; // percentage
    network: number; // percentage
  };
  currentTasks: number;
  queuedTasks: number;
  errors: AgentError[];
  metrics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    avgResponseTime: number;
    p95ResponseTime: number;
  };
}

export interface AgentError {
  timestamp: Date;
  type: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  stack?: string;
  context: Record<string, any>;
}

// Task Scheduling Types
export interface TaskSchedulingStrategy {
  type: 'round_robin' | 'least_loaded' | 'capability_based' | 'priority_based' | 'cost_optimized' | 'performance_optimized';
  parameters: Record<string, any>;
}

export interface TaskSchedulingRequest {
  id: string;
  workflowExecutionId: string;
  taskDefinition: any;
  priority: number;
  requirements: {
    capabilities: string[];
    resources: {
      cpu?: number;
      memory?: number;
      storage?: number;
      network?: number;
    };
    constraints: {
      maxLatency?: number;
      maxCost?: number;
      requiredAgents?: string[];
      excludedAgents?: string[];
      affinityRules?: AffinityRule[];
    };
  };
  scheduling: {
    strategy: TaskSchedulingStrategy;
    deadline?: Date;
    retryPolicy: {
      maxRetries: number;
      backoffStrategy: 'linear' | 'exponential' | 'fixed';
      initialDelay: number;
      maxDelay: number;
    };
  };
  metadata: Record<string, any>;
}

export interface AffinityRule {
  type: 'agent' | 'node' | 'zone' | 'region';
  mode: 'required' | 'preferred' | 'anti_affinity';
  target: string;
  weight?: number; // 1-100 for preferred rules
}

export interface TaskSchedulingResult {
  requestId: string;
  status: 'scheduled' | 'failed' | 'rejected';
  assignedAgent?: string;
  scheduledAt?: Date;
  estimatedStartTime?: Date;
  estimatedDuration?: number;
  estimatedCost?: number;
  reason?: string;
  alternatives?: {
    agentId: string;
    score: number;
    reasons: string[];
  }[];
}

// Resource Management Types
export interface ResourcePool {
  id: string;
  name: string;
  type: 'compute' | 'storage' | 'network' | 'database' | 'api_quota' | 'license';
  capacity: {
    total: number;
    available: number;
    reserved: number;
    unit: string;
  };
  allocation: {
    strategy: 'fair_share' | 'priority_based' | 'cost_optimized' | 'performance_optimized';
    policies: AllocationPolicy[];
  };
  monitoring: {
    utilization: number; // 0-1
    trends: ResourceTrend[];
    alerts: ResourceAlert[];
  };
  costs: {
    unitCost: number;
    currency: string;
    billingModel: 'pay_per_use' | 'reserved' | 'subscription';
  };
  metadata: Record<string, any>;
}

export interface AllocationPolicy {
  id: string;
  name: string;
  priority: number;
  conditions: {
    field: string;
    operator: string;
    value: any;
  }[];
  actions: {
    type: 'allocate' | 'reserve' | 'deny' | 'queue';
    parameters: Record<string, any>;
  }[];
  quotas: {
    user?: number;
    project?: number;
    department?: number;
    global?: number;
  };
  timeWindows: {
    start: string; // HH:MM
    end: string; // HH:MM
    timezone: string;
    days: string[]; // ['monday', 'tuesday', ...]
  }[];
}

export interface ResourceTrend {
  timestamp: Date;
  utilization: number;
  requests: number;
  allocations: number;
  rejections: number;
}

export interface ResourceAlert {
  id: string;
  type: 'utilization_high' | 'utilization_low' | 'capacity_exhausted' | 'allocation_failed';
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  resolvedAt?: Date;
}

export interface ResourceAllocation {
  id: string;
  resourcePoolId: string;
  requesterId: string;
  requesterType: 'user' | 'agent' | 'workflow' | 'system';
  amount: number;
  unit: string;
  allocatedAt: Date;
  expiresAt?: Date;
  status: 'active' | 'expired' | 'released' | 'failed';
  cost: number;
  metadata: Record<string, any>;
}

// Decision Engine Types
export interface DecisionRequest {
  id: string;
  type: 'agent_selection' | 'resource_allocation' | 'workflow_routing' | 'conflict_resolution' | 'optimization';
  context: Record<string, any>;
  constraints: DecisionConstraint[];
  criteria: DecisionCriterion[];
  options: DecisionOption[];
  strategy: 'greedy' | 'optimal' | 'heuristic' | 'ml_based' | 'rule_based';
  timeout: number; // milliseconds
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface DecisionConstraint {
  type: 'hard' | 'soft';
  field: string;
  operator: string;
  value: any;
  weight?: number; // for soft constraints
  penalty?: number; // cost of violating constraint
}

export interface DecisionCriterion {
  name: string;
  weight: number; // 0-1, sum should be 1
  type: 'numeric' | 'categorical' | 'boolean';
  direction: 'maximize' | 'minimize';
  aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'weighted_avg';
}

export interface DecisionOption {
  id: string;
  type: string;
  attributes: Record<string, any>;
  cost: number;
  availability: boolean;
  score?: number; // calculated during decision making
  metadata: Record<string, any>;
}

export interface DecisionResult {
  requestId: string;
  selectedOption: DecisionOption;
  score: number;
  confidence: number; // 0-1
  reasoning: string[];
  alternatives: {
    option: DecisionOption;
    score: number;
    reasons: string[];
  }[];
  executionTime: number; // milliseconds
  metadata: Record<string, any>;
  decidedAt: Date;
}

// Temporal Workflow Types
export interface TemporalWorkflowConfig {
  taskQueue: string;
  workflowId: string;
  runTimeout: number; // milliseconds
  taskTimeout: number; // milliseconds
  retryPolicy: {
    initialInterval: number;
    backoffCoefficient: number;
    maximumInterval: number;
    maximumAttempts: number;
    nonRetryableErrorTypes: string[];
  };
  cronSchedule?: string;
  memo?: Record<string, any>;
  searchAttributes?: Record<string, any>;
}

export interface TemporalActivityConfig {
  taskQueue: string;
  activityType: string;
  scheduleToCloseTimeout: number;
  scheduleToStartTimeout: number;
  startToCloseTimeout: number;
  heartbeatTimeout?: number;
  retryPolicy: {
    initialInterval: number;
    backoffCoefficient: number;
    maximumInterval: number;
    maximumAttempts: number;
    nonRetryableErrorTypes: string[];
  };
}

// Workflow Definition Language Types
export interface WDLWorkflowDefinition {
  apiVersion: string;
  kind: 'Workflow';
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: {
    entrypoint: string;
    arguments?: WDLParameter[];
    templates: WDLTemplate[];
    volumes?: WDLVolume[];
    volumeClaimTemplates?: WDLVolumeClaimTemplate[];
    serviceAccountName?: string;
    priority?: number;
    activeDeadlineSeconds?: number;
    ttlStrategy?: {
      secondsAfterCompletion?: number;
      secondsAfterSuccess?: number;
      secondsAfterFailure?: number;
    };
  };
}

export interface WDLParameter {
  name: string;
  description?: string;
  value?: any;
  valueFrom?: {
    configMapKeyRef?: {
      name: string;
      key: string;
    };
    secretKeyRef?: {
      name: string;
      key: string;
    };
  };
}

export interface WDLTemplate {
  name: string;
  inputs?: {
    parameters?: WDLParameter[];
    artifacts?: WDLArtifact[];
  };
  outputs?: {
    parameters?: WDLParameter[];
    artifacts?: WDLArtifact[];
    result?: string;
  };
  container?: WDLContainer;
  script?: WDLScript;
  dag?: WDLDAG;
  steps?: WDLStep[][];
  suspend?: WDLSuspend;
  metadata?: {
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  retryStrategy?: {
    limit?: string;
    retryPolicy?: 'Always' | 'OnFailure' | 'OnError' | 'OnTransientError';
    backoff?: {
      duration?: string;
      factor?: number;
      maxDuration?: string;
    };
  };
  timeout?: string;
  activeDeadlineSeconds?: number;
  nodeSelector?: Record<string, string>;
  tolerations?: WDLToleration[];
  affinity?: WDLAffinity;
}

export interface WDLArtifact {
  name: string;
  path: string;
  mode?: number;
  from?: string;
  fromExpression?: string;
  s3?: {
    endpoint: string;
    bucket: string;
    key: string;
    accessKeySecret?: {
      name: string;
      key: string;
    };
    secretKeySecret?: {
      name: string;
      key: string;
    };
  };
  git?: {
    repo: string;
    revision?: string;
    depth?: number;
    disableSubmodules?: boolean;
    usernameSecret?: {
      name: string;
      key: string;
    };
    passwordSecret?: {
      name: string;
      key: string;
    };
  };
}

export interface WDLContainer {
  image: string;
  command?: string[];
  args?: string[];
  workingDir?: string;
  env?: {
    name: string;
    value?: string;
    valueFrom?: {
      configMapKeyRef?: {
        name: string;
        key: string;
      };
      secretKeyRef?: {
        name: string;
        key: string;
      };
    };
  }[];
  resources?: {
    limits?: Record<string, string>;
    requests?: Record<string, string>;
  };
  volumeMounts?: {
    name: string;
    mountPath: string;
    subPath?: string;
    readOnly?: boolean;
  }[];
}

export interface WDLScript {
  image: string;
  source: string;
  command?: string[];
  env?: any[];
  resources?: any;
  volumeMounts?: any[];
}

export interface WDLDAG {
  tasks: WDLDAGTask[];
}

export interface WDLDAGTask {
  name: string;
  template: string;
  arguments?: {
    parameters?: WDLParameter[];
    artifacts?: WDLArtifact[];
  };
  dependencies?: string[];
  depends?: string;
  when?: string;
  continueOn?: {
    failed?: boolean;
    error?: boolean;
  };
  onExit?: string;
  hooks?: {
    [phase: string]: {
      template: string;
      arguments?: any;
    };
  };
}

export interface WDLStep {
  name: string;
  template: string;
  arguments?: {
    parameters?: WDLParameter[];
    artifacts?: WDLArtifact[];
  };
  withItems?: any[];
  withParam?: string;
  withSequence?: {
    count?: string;
    start?: string;
    end?: string;
    format?: string;
  };
  when?: string;
  continueOn?: {
    failed?: boolean;
    error?: boolean;
  };
  onExit?: string;
  hooks?: any;
}

export interface WDLSuspend {
  duration?: string;
}

export interface WDLVolume {
  name: string;
  configMap?: {
    name: string;
    items?: {
      key: string;
      path: string;
      mode?: number;
    }[];
  };
  secret?: {
    secretName: string;
    items?: {
      key: string;
      path: string;
      mode?: number;
    }[];
  };
  emptyDir?: {
    sizeLimit?: string;
  };
  hostPath?: {
    path: string;
    type?: string;
  };
  persistentVolumeClaim?: {
    claimName: string;
    readOnly?: boolean;
  };
}

export interface WDLVolumeClaimTemplate {
  metadata: {
    name: string;
    labels?: Record<string, string>;
  };
  spec: {
    accessModes: string[];
    resources: {
      requests: {
        storage: string;
      };
    };
    storageClassName?: string;
  };
}

export interface WDLToleration {
  key?: string;
  operator?: 'Equal' | 'Exists';
  value?: string;
  effect?: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute';
  tolerationSeconds?: number;
}

export interface WDLAffinity {
  nodeAffinity?: {
    requiredDuringSchedulingIgnoredDuringExecution?: {
      nodeSelectorTerms: {
        matchExpressions?: {
          key: string;
          operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist' | 'Gt' | 'Lt';
          values?: string[];
        }[];
        matchFields?: {
          key: string;
          operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist' | 'Gt' | 'Lt';
          values?: string[];
        }[];
      }[];
    };
    preferredDuringSchedulingIgnoredDuringExecution?: {
      weight: number;
      preference: any;
    }[];
  };
  podAffinity?: any;
  podAntiAffinity?: any;
}

// Orchestration Configuration
export interface OrchestrationConfig {
  engine: {
    type: 'native' | 'temporal' | 'airflow' | 'argo';
    config: Record<string, any>;
  };
  scheduling: {
    defaultStrategy: TaskSchedulingStrategy;
    strategies: Record<string, TaskSchedulingStrategy>;
    constraints: {
      maxConcurrentWorkflows: number;
      maxConcurrentTasks: number;
      maxQueueSize: number;
      defaultTimeout: number;
    };
  };
  monitoring: {
    metricsInterval: number;
    healthCheckInterval: number;
    alertingThresholds: {
      errorRate: number;
      latency: number;
      queueSize: number;
      resourceUtilization: number;
    };
  };
  storage: {
    workflowDefinitions: {
      type: 'database' | 'file' | 's3' | 'git';
      config: Record<string, any>;
    };
    executionHistory: {
      type: 'database' | 'file' | 's3';
      config: Record<string, any>;
      retention: {
        period: number; // days
        archiveAfter: number; // days
      };
    };
  };
  security: {
    authentication: {
      enabled: boolean;
      provider: 'jwt' | 'oauth2' | 'ldap' | 'saml';
      config: Record<string, any>;
    };
    authorization: {
      enabled: boolean;
      rbac: {
        roles: Record<string, string[]>;
        permissions: Record<string, string[]>;
      };
    };
    encryption: {
      atRest: boolean;
      inTransit: boolean;
      keyManagement: {
        provider: 'local' | 'vault' | 'aws_kms' | 'azure_kv';
        config: Record<string, any>;
      };
    };
  };
  integration: {
    services: {
      dspy: {
        enabled: boolean;
        endpoint: string;
        authentication: Record<string, any>;
      };
      memory: {
        enabled: boolean;
        endpoint: string;
        authentication: Record<string, any>;
      };
      knowledgeGraph: {
        enabled: boolean;
        endpoint: string;
        authentication: Record<string, any>;
      };
      businessIntelligence: {
        enabled: boolean;
        endpoint: string;
        authentication: Record<string, any>;
      };
    };
    eventBus: {
      type: 'redis' | 'kafka' | 'rabbitmq' | 'nats';
      config: Record<string, any>;
    };
    logging: {
      level: 'debug' | 'info' | 'warn' | 'error';
      destinations: {
        type: 'console' | 'file' | 'elasticsearch' | 'cloudwatch';
        config: Record<string, any>;
      }[];
    };
  };
}

// Validation Schemas
export const OrchestrationEventSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(EventType),
  source: z.string(),
  timestamp: z.date(),
  payload: z.record(z.any()),
  metadata: z.object({
    correlationId: z.string().optional(),
    traceId: z.string().optional(),
    causationId: z.string().optional(),
    version: z.number(),
    retryCount: z.number().optional(),
  }),
  headers: z.record(z.string()),
});

export const AgentCapabilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string(),
  inputSchema: z.record(z.any()),
  outputSchema: z.record(z.any()),
  complexity: z.enum(['simple', 'medium', 'complex']),
  estimatedDuration: z.number().positive(),
  resourceRequirements: z.object({
    cpu: z.number().min(0).max(100),
    memory: z.number().positive(),
    storage: z.number().positive(),
    network: z.number().positive(),
  }),
  dependencies: z.array(z.string()),
  prerequisites: z.array(z.string()),
  qualityMetrics: z.object({
    accuracy: z.number().min(0).max(1),
    reliability: z.number().min(0).max(1),
    performance: z.number().min(0).max(1),
  }),
  costModel: z.object({
    fixedCost: z.number().min(0),
    variableCost: z.number().min(0),
    currency: z.string(),
  }),
});

export const AgentRegistrationSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  version: z.string(),
  endpoint: z.string().url(),
  capabilities: z.array(AgentCapabilitySchema),
  healthCheck: z.object({
    url: z.string().url(),
    interval: z.number().positive(),
    timeout: z.number().positive(),
    retries: z.number().min(0),
  }),
  loadBalancing: z.object({
    maxConcurrentTasks: z.number().positive(),
    weight: z.number().min(1).max(10),
    priority: z.number().min(1).max(10),
  }),
  scaling: z.object({
    minInstances: z.number().min(0),
    maxInstances: z.number().positive(),
    scaleUpThreshold: z.number().min(0).max(100),
    scaleDownThreshold: z.number().min(0).max(100),
    cooldownPeriod: z.number().positive(),
  }),
  authentication: z.object({
    type: z.enum(['none', 'api_key', 'oauth2', 'jwt', 'mutual_tls']),
    config: z.record(z.any()),
  }),
  metadata: z.record(z.any()),
});

export type OrchestrationEventType = z.infer<typeof OrchestrationEventSchema>;
export type AgentCapabilityType = z.infer<typeof AgentCapabilitySchema>;
export type AgentRegistrationType = z.infer<typeof AgentRegistrationSchema>;