import { z } from 'zod';
import { AgentType, AgentCapability } from './agent';
export declare enum WorkflowStatus {
    DRAFT = "draft",
    ACTIVE = "active",
    PAUSED = "paused",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled"
}
export declare enum TaskStatus {
    PENDING = "pending",
    WAITING_FOR_DEPENDENCIES = "waiting_for_dependencies",
    READY = "ready",
    RUNNING = "running",
    COMPLETED = "completed",
    FAILED = "failed",
    SKIPPED = "skipped",
    CANCELLED = "cancelled"
}
export declare enum WorkflowTriggerType {
    MANUAL = "manual",
    SCHEDULED = "scheduled",
    EVENT = "event",
    WEBHOOK = "webhook",
    API = "api"
}
export declare const WorkflowTaskSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    agentType: z.ZodNativeEnum<typeof AgentType>;
    requiredCapabilities: z.ZodArray<z.ZodNativeEnum<typeof AgentCapability>, "many">;
    inputSchema: z.ZodRecord<z.ZodString, z.ZodAny>;
    outputSchema: z.ZodRecord<z.ZodString, z.ZodAny>;
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
    dependencies: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    conditions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        field: z.ZodString;
        operator: z.ZodEnum<["equals", "not_equals", "greater_than", "less_than", "contains", "exists"]>;
        value: z.ZodAny;
    }, "strip", z.ZodTypeAny, {
        field: string;
        operator: "equals" | "not_equals" | "greater_than" | "less_than" | "exists" | "contains";
        value?: any;
    }, {
        field: string;
        operator: "equals" | "not_equals" | "greater_than" | "less_than" | "exists" | "contains";
        value?: any;
    }>, "many">>;
    parallel: z.ZodDefault<z.ZodBoolean>;
    priority: z.ZodDefault<z.ZodNumber>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    priority: number;
    agentType: AgentType;
    timeout: number;
    retryPolicy: {
        maxRetries: number;
        backoffMultiplier: number;
        initialDelay: number;
    };
    dependencies: string[];
    metadata: Record<string, any>;
    parallel: boolean;
    conditions: {
        field: string;
        operator: "equals" | "not_equals" | "greater_than" | "less_than" | "exists" | "contains";
        value?: any;
    }[];
    requiredCapabilities: AgentCapability[];
    inputSchema: Record<string, any>;
    outputSchema: Record<string, any>;
    description?: string | undefined;
}, {
    id: string;
    name: string;
    agentType: AgentType;
    retryPolicy: {
        maxRetries?: number | undefined;
        backoffMultiplier?: number | undefined;
        initialDelay?: number | undefined;
    };
    requiredCapabilities: AgentCapability[];
    inputSchema: Record<string, any>;
    outputSchema: Record<string, any>;
    priority?: number | undefined;
    timeout?: number | undefined;
    dependencies?: string[] | undefined;
    metadata?: Record<string, any> | undefined;
    description?: string | undefined;
    parallel?: boolean | undefined;
    conditions?: {
        field: string;
        operator: "equals" | "not_equals" | "greater_than" | "less_than" | "exists" | "contains";
        value?: any;
    }[] | undefined;
}>;
export type WorkflowTask = z.infer<typeof WorkflowTaskSchema>;
export declare const WorkflowDefinitionSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    version: z.ZodDefault<z.ZodString>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    trigger: z.ZodObject<{
        type: z.ZodNativeEnum<typeof WorkflowTriggerType>;
        config: z.ZodRecord<z.ZodString, z.ZodAny>;
    }, "strip", z.ZodTypeAny, {
        type: WorkflowTriggerType;
        config: Record<string, any>;
    }, {
        type: WorkflowTriggerType;
        config: Record<string, any>;
    }>;
    tasks: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        agentType: z.ZodNativeEnum<typeof AgentType>;
        requiredCapabilities: z.ZodArray<z.ZodNativeEnum<typeof AgentCapability>, "many">;
        inputSchema: z.ZodRecord<z.ZodString, z.ZodAny>;
        outputSchema: z.ZodRecord<z.ZodString, z.ZodAny>;
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
        dependencies: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        conditions: z.ZodDefault<z.ZodArray<z.ZodObject<{
            field: z.ZodString;
            operator: z.ZodEnum<["equals", "not_equals", "greater_than", "less_than", "contains", "exists"]>;
            value: z.ZodAny;
        }, "strip", z.ZodTypeAny, {
            field: string;
            operator: "equals" | "not_equals" | "greater_than" | "less_than" | "exists" | "contains";
            value?: any;
        }, {
            field: string;
            operator: "equals" | "not_equals" | "greater_than" | "less_than" | "exists" | "contains";
            value?: any;
        }>, "many">>;
        parallel: z.ZodDefault<z.ZodBoolean>;
        priority: z.ZodDefault<z.ZodNumber>;
        metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        priority: number;
        agentType: AgentType;
        timeout: number;
        retryPolicy: {
            maxRetries: number;
            backoffMultiplier: number;
            initialDelay: number;
        };
        dependencies: string[];
        metadata: Record<string, any>;
        parallel: boolean;
        conditions: {
            field: string;
            operator: "equals" | "not_equals" | "greater_than" | "less_than" | "exists" | "contains";
            value?: any;
        }[];
        requiredCapabilities: AgentCapability[];
        inputSchema: Record<string, any>;
        outputSchema: Record<string, any>;
        description?: string | undefined;
    }, {
        id: string;
        name: string;
        agentType: AgentType;
        retryPolicy: {
            maxRetries?: number | undefined;
            backoffMultiplier?: number | undefined;
            initialDelay?: number | undefined;
        };
        requiredCapabilities: AgentCapability[];
        inputSchema: Record<string, any>;
        outputSchema: Record<string, any>;
        priority?: number | undefined;
        timeout?: number | undefined;
        dependencies?: string[] | undefined;
        metadata?: Record<string, any> | undefined;
        description?: string | undefined;
        parallel?: boolean | undefined;
        conditions?: {
            field: string;
            operator: "equals" | "not_equals" | "greater_than" | "less_than" | "exists" | "contains";
            value?: any;
        }[] | undefined;
    }>, "many">;
    globalTimeout: z.ZodDefault<z.ZodNumber>;
    maxConcurrentTasks: z.ZodDefault<z.ZodNumber>;
    errorHandling: z.ZodObject<{
        onFailure: z.ZodDefault<z.ZodEnum<["stop", "continue", "retry"]>>;
        maxRetries: z.ZodDefault<z.ZodNumber>;
        notifyOnFailure: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        maxRetries: number;
        onFailure: "stop" | "retry" | "continue";
        notifyOnFailure: boolean;
    }, {
        maxRetries?: number | undefined;
        onFailure?: "stop" | "retry" | "continue" | undefined;
        notifyOnFailure?: boolean | undefined;
    }>;
    variables: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    version: string;
    name: string;
    tasks: {
        id: string;
        name: string;
        priority: number;
        agentType: AgentType;
        timeout: number;
        retryPolicy: {
            maxRetries: number;
            backoffMultiplier: number;
            initialDelay: number;
        };
        dependencies: string[];
        metadata: Record<string, any>;
        parallel: boolean;
        conditions: {
            field: string;
            operator: "equals" | "not_equals" | "greater_than" | "less_than" | "exists" | "contains";
            value?: any;
        }[];
        requiredCapabilities: AgentCapability[];
        inputSchema: Record<string, any>;
        outputSchema: Record<string, any>;
        description?: string | undefined;
    }[];
    trigger: {
        type: WorkflowTriggerType;
        config: Record<string, any>;
    };
    maxConcurrentTasks: number;
    metadata: Record<string, any>;
    tags: string[];
    globalTimeout: number;
    errorHandling: {
        maxRetries: number;
        onFailure: "stop" | "retry" | "continue";
        notifyOnFailure: boolean;
    };
    variables: Record<string, any>;
    description?: string | undefined;
}, {
    id: string;
    name: string;
    tasks: {
        id: string;
        name: string;
        agentType: AgentType;
        retryPolicy: {
            maxRetries?: number | undefined;
            backoffMultiplier?: number | undefined;
            initialDelay?: number | undefined;
        };
        requiredCapabilities: AgentCapability[];
        inputSchema: Record<string, any>;
        outputSchema: Record<string, any>;
        priority?: number | undefined;
        timeout?: number | undefined;
        dependencies?: string[] | undefined;
        metadata?: Record<string, any> | undefined;
        description?: string | undefined;
        parallel?: boolean | undefined;
        conditions?: {
            field: string;
            operator: "equals" | "not_equals" | "greater_than" | "less_than" | "exists" | "contains";
            value?: any;
        }[] | undefined;
    }[];
    trigger: {
        type: WorkflowTriggerType;
        config: Record<string, any>;
    };
    errorHandling: {
        maxRetries?: number | undefined;
        onFailure?: "stop" | "retry" | "continue" | undefined;
        notifyOnFailure?: boolean | undefined;
    };
    version?: string | undefined;
    maxConcurrentTasks?: number | undefined;
    metadata?: Record<string, any> | undefined;
    description?: string | undefined;
    tags?: string[] | undefined;
    globalTimeout?: number | undefined;
    variables?: Record<string, any> | undefined;
}>;
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
//# sourceMappingURL=workflow.d.ts.map