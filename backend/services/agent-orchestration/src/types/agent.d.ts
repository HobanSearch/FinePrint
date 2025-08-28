import { z } from 'zod';
export declare enum AgentType {
    FULLSTACK_AGENT = "fullstack-agent",
    AIML_ENGINEERING = "aiml-engineering",
    UI_UX_DESIGN = "ui-ux-design",
    DEVOPS_AGENT = "devops-agent",
    DSPY_FRAMEWORK = "dspy-framework",
    GATED_LORA_SYSTEM = "gated-lora-system",
    KNOWLEDGE_GRAPH = "knowledge-graph",
    ENHANCED_OLLAMA = "enhanced-ollama",
    SALES_AGENT = "sales-agent",
    CUSTOMER_SUCCESS = "customer-success-agent",
    LEGAL_COMPLIANCE = "legal-compliance-agent",
    DATA_SCIENTIST = "data-scientist-agent",
    CONTENT_MARKETING = "content-marketing-agent"
}
export declare enum AgentStatus {
    HEALTHY = "healthy",
    DEGRADED = "degraded",
    UNHEALTHY = "unhealthy",
    OFFLINE = "offline",
    BUSY = "busy",
    IDLE = "idle"
}
export declare enum AgentCapability {
    CODE_GENERATION = "code_generation",
    ARCHITECTURE_DECISIONS = "architecture_decisions",
    TESTING_AUTOMATION = "testing_automation",
    DEPLOYMENT_AUTOMATION = "deployment_automation",
    MODEL_TRAINING = "model_training",
    HYPERPARAMETER_OPTIMIZATION = "hyperparameter_optimization",
    MODEL_DEPLOYMENT = "model_deployment",
    PERFORMANCE_MONITORING = "performance_monitoring",
    LEAD_GENERATION = "lead_generation",
    CUSTOMER_SUPPORT = "customer_support",
    CONTENT_CREATION = "content_creation",
    DATA_ANALYSIS = "data_analysis",
    COMPLIANCE_CHECK = "compliance_check"
}
export declare const AgentRegistrationSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodNativeEnum<typeof AgentType>;
    name: z.ZodString;
    version: z.ZodString;
    capabilities: z.ZodArray<z.ZodNativeEnum<typeof AgentCapability>, "many">;
    endpoint: z.ZodString;
    healthCheckPath: z.ZodDefault<z.ZodString>;
    priority: z.ZodDefault<z.ZodNumber>;
    maxConcurrentTasks: z.ZodDefault<z.ZodNumber>;
    timeout: z.ZodDefault<z.ZodNumber>;
    retryPolicy: z.ZodObject<{
        maxRetries: z.ZodDefault<z.ZodNumber>;
        backoffMultiplier: z.ZodDefault<z.ZodNumber>;
        initialDelay: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        maxRetries: number;
        backoffMultiplier: number;
        initialDelay: number;
    }, {
        maxRetries?: number | undefined;
        backoffMultiplier?: number | undefined;
        initialDelay?: number | undefined;
    }>;
    dependencies: z.ZodDefault<z.ZodArray<z.ZodNativeEnum<typeof AgentType>, "many">>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    version: string;
    capabilities: AgentCapability[];
    type: AgentType;
    name: string;
    endpoint: string;
    priority: number;
    healthCheckPath: string;
    maxConcurrentTasks: number;
    timeout: number;
    retryPolicy: {
        maxRetries: number;
        backoffMultiplier: number;
        initialDelay: number;
    };
    dependencies: AgentType[];
    metadata: Record<string, any>;
}, {
    id: string;
    version: string;
    capabilities: AgentCapability[];
    type: AgentType;
    name: string;
    endpoint: string;
    retryPolicy: {
        maxRetries?: number | undefined;
        backoffMultiplier?: number | undefined;
        initialDelay?: number | undefined;
    };
    priority?: number | undefined;
    healthCheckPath?: string | undefined;
    maxConcurrentTasks?: number | undefined;
    timeout?: number | undefined;
    dependencies?: AgentType[] | undefined;
    metadata?: Record<string, any> | undefined;
}>;
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
//# sourceMappingURL=agent.d.ts.map