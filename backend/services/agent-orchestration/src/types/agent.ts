import { z } from 'zod';

// Agent Types and Capabilities
export enum AgentType {
  // Core Development Agents
  FULLSTACK_AGENT = 'fullstack-agent',
  AIML_ENGINEERING = 'aiml-engineering',
  UI_UX_DESIGN = 'ui-ux-design',
  DEVOPS_AGENT = 'devops-agent',
  
  // AI Framework Agents
  DSPY_FRAMEWORK = 'dspy-framework',
  GATED_LORA_SYSTEM = 'gated-lora-system',
  KNOWLEDGE_GRAPH = 'knowledge-graph',
  ENHANCED_OLLAMA = 'enhanced-ollama',
  
  // Business Operation Agents
  SALES_AGENT = 'sales-agent',
  CUSTOMER_SUCCESS = 'customer-success-agent',
  LEGAL_COMPLIANCE = 'legal-compliance-agent',
  DATA_SCIENTIST = 'data-scientist-agent',
  CONTENT_MARKETING = 'content-marketing-agent',
}

export enum AgentStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  OFFLINE = 'offline',
  BUSY = 'busy',
  IDLE = 'idle',
}

export enum AgentCapability {
  // Development Capabilities
  CODE_GENERATION = 'code_generation',
  ARCHITECTURE_DECISIONS = 'architecture_decisions',
  TESTING_AUTOMATION = 'testing_automation',
  DEPLOYMENT_AUTOMATION = 'deployment_automation',
  
  // AI/ML Capabilities
  MODEL_TRAINING = 'model_training',
  HYPERPARAMETER_OPTIMIZATION = 'hyperparameter_optimization',
  MODEL_DEPLOYMENT = 'model_deployment',
  PERFORMANCE_MONITORING = 'performance_monitoring',
  
  // Business Capabilities
  LEAD_GENERATION = 'lead_generation',
  CUSTOMER_SUPPORT = 'customer_support',
  CONTENT_CREATION = 'content_creation',
  DATA_ANALYSIS = 'data_analysis',
  COMPLIANCE_CHECK = 'compliance_check',
}

export const AgentRegistrationSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(AgentType),
  name: z.string().min(1).max(100),
  version: z.string(),
  capabilities: z.array(z.nativeEnum(AgentCapability)),
  endpoint: z.string().url(),
  healthCheckPath: z.string().default('/health'),
  priority: z.number().min(1).max(10).default(5),
  maxConcurrentTasks: z.number().min(1).default(10),
  timeout: z.number().min(1000).default(300000), // 5 minutes
  retryPolicy: z.object({
    maxRetries: z.number().min(0).default(3),
    backoffMultiplier: z.number().min(1).default(2),
    initialDelay: z.number().min(100).default(1000),
  }),
  dependencies: z.array(z.nativeEnum(AgentType)).default([]),
  metadata: z.record(z.any()).default({}),
});

export type AgentRegistration = z.infer<typeof AgentRegistrationSchema>;

export interface AgentInstance {
  id: string;
  registration: AgentRegistration;
  status: AgentStatus;
  currentLoad: number;
  lastHealthCheck: Date;
  activeTaskCount: number;
  completedTaskCount: number;
  failedTaskCount: number;
  averageResponseTime: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentMetrics {
  agentId: string;
  timestamp: Date;
  cpu: number;
  memory: number;
  responseTime: number;
  throughput: number;
  errorRate: number;
  availability: number;
}

export interface AgentTask {
  id: string;
  agentId: string;
  type: string;
  payload: Record<string, any>;
  priority: number;
  timeout: number;
  retryCount: number;
  maxRetries: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
  metadata: Record<string, any>;
}

export interface AgentCommunicationMessage {
  id: string;
  from: string;
  to: string;
  type: 'request' | 'response' | 'event' | 'broadcast';
  subject: string;
  payload: Record<string, any>;
  correlationId?: string;
  timestamp: Date;
  ttl?: number;
  priority: number;
}

export interface AgentHealthStatus {
  agentId: string;
  status: AgentStatus;
  timestamp: Date;
  uptime: number;
  version: string;
  dependencies: Array<{
    name: string;
    status: 'healthy' | 'unhealthy';
    responseTime?: number;
    error?: string;
  }>;
  metrics: {
    cpu: number;
    memory: number;
    activeConnections: number;
    queueSize: number;
  };
}