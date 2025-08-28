export interface AgentInfo {
  id: string;
  name: string;
  type: AgentType;
  capabilities: string[];
  currentLoad: number;
  maxCapacity: number;
  status: AgentStatus;
  lastHeartbeat: Date;
  version: string;
  endpoint: string;
  metadata: Record<string, any>;
}

export enum AgentType {
  // Core AI Agents
  DSPY_OPTIMIZER = 'dspy-optimizer',
  LORA_TRAINER = 'lora-trainer', 
  KNOWLEDGE_GRAPH = 'knowledge-graph',
  
  // Context Agents
  MARKETING_CONTEXT = 'marketing-context',
  SALES_CONTEXT = 'sales-context',
  SUPPORT_CONTEXT = 'support-context',
  
  // Business Agents
  BUSINESS_INTELLIGENCE = 'business-intelligence',
  LEGAL_ANALYSIS = 'legal-analysis',
  CONTENT_MARKETING = 'content-marketing',
  SALES_AGENT = 'sales-agent',
  SUPPORT_AGENT = 'support-agent',
  
  // Development Agents
  UI_UX_DESIGN = 'ui-ux-design',
  FRONTEND_ARCHITECTURE = 'frontend-architecture',
  BACKEND_ARCHITECTURE = 'backend-architecture',
  DATABASE_ARCHITECT = 'database-architect',
  DEVOPS_INFRASTRUCTURE = 'devops-infrastructure',
  
  // Mobile Agents
  MOBILE_DEVELOPER = 'mobile-developer',
  MOBILE_DEBUG = 'mobile-debug',
  BROWSER_EXTENSION = 'browser-extension',
  
  // Quality & Testing Agents
  QA_AUTOMATION = 'qa-automation',
  PERFORMANCE_ENGINEER = 'performance-engineer',
  
  // Security Agents
  SECURITY_ENGINEER = 'security-engineer',
  AUTH_SECURITY = 'auth-security',
  SECURITY_OPERATIONS = 'security-operations',
  
  // Integration Agents
  ANALYTICS_IMPLEMENTATION = 'analytics-implementation',
  PAYMENT_INTEGRATION = 'payment-integration',
  EMAIL_COMMUNICATION = 'email-communication',
  INTEGRATION_PLATFORM = 'integration-platform',
  
  // Data Agents
  DATA_PIPELINE = 'data-pipeline',
  DOCUMENT_PROCESSING = 'document-processing',
  
  // Compliance Agents
  LEGAL_COMPLIANCE = 'legal-compliance',
  ACCESSIBILITY_COMPLIANCE = 'accessibility-compliance',
  
  // Content Agents
  CONTENT_MANAGEMENT = 'content-management'
}

export enum AgentStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded', 
  UNAVAILABLE = 'unavailable',
  MAINTENANCE = 'maintenance'
}

export interface CoordinationMessage {
  id: string;
  fromAgent: string;
  toAgent?: string; // undefined for broadcast
  type: MessageType;
  priority: MessagePriority;
  payload: any;
  correlationId?: string;
  timestamp: Date;
  expiresAt?: Date;
  retryCount?: number;
}

export enum MessageType {
  TASK_REQUEST = 'task-request',
  TASK_RESPONSE = 'task-response',
  INFORMATION_SHARE = 'information-share',
  STATUS_UPDATE = 'status-update',
  COORDINATION_REQUEST = 'coordination-request',
  COORDINATION_RESPONSE = 'coordination-response',
  HEARTBEAT = 'heartbeat',
  ALERT = 'alert',
  BUSINESS_EVENT = 'business-event'
}

export enum MessagePriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

export interface TaskRequest {
  taskType: string;
  requiredCapabilities: string[];
  input: any;
  deadline?: Date;
  context: TaskContext;
  preferences?: AgentPreferences;
}

export interface TaskContext {
  businessProcess?: string;
  customerId?: string;
  campaignId?: string;
  workflowId?: string;
  sessionId?: string;
  userId?: string;
  priority: MessagePriority;
  tags: string[];
}

export interface AgentPreferences {
  preferredAgents?: string[];
  excludedAgents?: string[];
  loadBalancing?: 'performance' | 'cost' | 'balanced';
  fallbackBehavior?: 'queue' | 'retry' | 'fail';
}

export interface InformationShare {
  category: string;
  data: any;
  relevantAgents?: string[];
  ttl?: number; // time-to-live in seconds
  tags: string[];
  businessContext?: {
    customerId?: string;
    process?: string;
    outcome?: string;
  };
}

export interface CoordinationRequest {
  coordinationType: CoordinationType;
  participants: string[];
  objective: string;
  constraints?: Record<string, any>;
  deadline?: Date;
}

export enum CoordinationType {
  PARALLEL_EXECUTION = 'parallel-execution',
  SEQUENTIAL_WORKFLOW = 'sequential-workflow',
  COLLABORATIVE_ANALYSIS = 'collaborative-analysis',
  CONSENSUS_BUILDING = 'consensus-building',
  RESOURCE_SHARING = 'resource-sharing'
}

export interface BusinessEvent {
  eventType: string;
  entityType: string;
  entityId: string;
  data: any;
  metadata: {
    source: string;
    timestamp: Date;
    version: string;
  };
}

export interface CoordinationPattern {
  id: string;
  name: string;
  description: string;
  participants: AgentType[];
  workflow: WorkflowStep[];
  successCriteria: SuccessCriteria;
  businessValue: string;
}

export interface WorkflowStep {
  stepId: string;
  agentType: AgentType;
  action: string;
  inputs: string[];
  outputs: string[];
  dependencies: string[];
  timeout: number;
  retryPolicy: RetryPolicy;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffStrategy: 'linear' | 'exponential' | 'fixed';
  baseDelay: number;
  maxDelay: number;
}

export interface SuccessCriteria {
  required: string[];
  optional: string[];
  businessMetrics: string[];
}

export interface AgentPerformanceMetrics {
  agentId: string;
  period: {
    start: Date;
    end: Date;
  };
  tasksCompleted: number;
  tasksFailedCount: number;
  averageResponseTime: number;
  averageQualityScore: number;
  businessImpact: {
    revenue: number;
    customerSatisfaction: number;
    costSavings: number;
  };
  collaborationMetrics: {
    messagesExchanged: number;
    coordinationSuccess: number;
    knowledgeShared: number;
  };
}

export interface CoordinationAnalytics {
  totalMessages: number;
  messagesByType: Record<MessageType, number>;
  messagesByPriority: Record<MessagePriority, number>;
  averageLatency: number;
  successRate: number;
  topCollaborations: Array<{
    agents: string[];
    frequency: number;
    successRate: number;
    businessValue: number;
  }>;
  bottlenecks: Array<{
    agentType: AgentType;
    issue: string;
    impact: string;
    recommendation: string;
  }>;
}