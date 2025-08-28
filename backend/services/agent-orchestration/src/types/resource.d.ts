import { z } from 'zod';
import { AgentType } from './agent';
export declare enum ResourceType {
    COMPUTE = "compute",
    MEMORY = "memory",
    STORAGE = "storage",
    NETWORK = "network",
    GPU = "gpu",
    DATABASE_CONNECTION = "database_connection",
    API_QUOTA = "api_quota",
    LICENSE = "license"
}
export declare enum ResourceStatus {
    AVAILABLE = "available",
    ALLOCATED = "allocated",
    RESERVED = "reserved",
    EXHAUSTED = "exhausted",
    MAINTENANCE = "maintenance",
    ERROR = "error"
}
export declare const ResourceDefinitionSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    type: z.ZodNativeEnum<typeof ResourceType>;
    capacity: z.ZodNumber;
    unit: z.ZodString;
    cost: z.ZodObject<{
        basePrice: z.ZodNumber;
        unit: z.ZodString;
        currency: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        unit: string;
        basePrice: number;
        currency: string;
    }, {
        unit: string;
        basePrice: number;
        currency?: string | undefined;
    }>;
    constraints: z.ZodObject<{
        minAllocation: z.ZodDefault<z.ZodNumber>;
        maxAllocation: z.ZodOptional<z.ZodNumber>;
        allocationUnit: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        minAllocation: number;
        allocationUnit: number;
        maxAllocation?: number | undefined;
    }, {
        minAllocation?: number | undefined;
        maxAllocation?: number | undefined;
        allocationUnit?: number | undefined;
    }>;
    location: z.ZodOptional<z.ZodString>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: ResourceType;
    name: string;
    metadata: Record<string, any>;
    unit: string;
    capacity: number;
    cost: {
        unit: string;
        basePrice: number;
        currency: string;
    };
    constraints: {
        minAllocation: number;
        allocationUnit: number;
        maxAllocation?: number | undefined;
    };
    tags: string[];
    location?: string | undefined;
}, {
    id: string;
    type: ResourceType;
    name: string;
    unit: string;
    capacity: number;
    cost: {
        unit: string;
        basePrice: number;
        currency?: string | undefined;
    };
    constraints: {
        minAllocation?: number | undefined;
        maxAllocation?: number | undefined;
        allocationUnit?: number | undefined;
    };
    metadata?: Record<string, any> | undefined;
    location?: string | undefined;
    tags?: string[] | undefined;
}>;
export type ResourceDefinition = z.infer<typeof ResourceDefinitionSchema>;
export interface ResourcePool {
    id: string;
    name: string;
    description: string;
    resources: ResourceInstance[];
    totalCapacity: Record<ResourceType, number>;
    availableCapacity: Record<ResourceType, number>;
    allocatedCapacity: Record<ResourceType, number>;
    utilizationRate: number;
    costPerHour: number;
    tags: string[];
    policies: ResourcePolicy[];
    createdAt: Date;
    updatedAt: Date;
}
export interface ResourceInstance {
    id: string;
    definitionId: string;
    status: ResourceStatus;
    currentCapacity: number;
    allocatedCapacity: number;
    reservedCapacity: number;
    healthScore: number;
    lastHealthCheck: Date;
    location: string;
    assignedTo?: string;
    allocations: ResourceAllocation[];
    metrics: ResourceMetrics;
    metadata: Record<string, any>;
}
export interface ResourceAllocation {
    id: string;
    resourceId: string;
    requestId: string;
    agentId: string;
    workflowId?: string;
    taskId?: string;
    amount: number;
    priority: number;
    allocatedAt: Date;
    expiresAt?: Date;
    releasedAt?: Date;
    status: 'active' | 'expired' | 'released';
    metadata: Record<string, any>;
}
export interface ResourceRequest {
    id: string;
    requesterId: string;
    requesterType: 'agent' | 'workflow' | 'user';
    resources: Array<{
        type: ResourceType;
        amount: number;
        constraints?: Record<string, any>;
        preferences?: Record<string, any>;
    }>;
    priority: number;
    duration?: number;
    deadline?: Date;
    constraints: ResourceConstraint[];
    flexibilityOptions: FlexibilityOption[];
    slaRequirements: SLARequirement[];
    costBudget?: number;
    metadata: Record<string, any>;
    createdAt: Date;
}
export interface ResourceConstraint {
    type: 'location' | 'performance' | 'compliance' | 'cost' | 'availability';
    operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'in' | 'not_in';
    value: any;
    weight: number;
}
export interface FlexibilityOption {
    type: 'time_flexible' | 'resource_substitution' | 'quality_tradeoff';
    parameters: Record<string, any>;
    acceptabilityScore: number;
}
export interface SLARequirement {
    metric: 'availability' | 'response_time' | 'throughput' | 'reliability';
    target: number;
    unit: string;
    penalty: number;
}
export interface ResourceAllocationResult {
    requestId: string;
    status: 'allocated' | 'partial' | 'failed' | 'queued';
    allocations: ResourceAllocation[];
    totalCost: number;
    estimatedDuration: number;
    alternativeOptions?: Array<{
        allocations: ResourceAllocation[];
        score: number;
        tradeoffs: string[];
    }>;
    waitTime?: number;
    rejectionReason?: string;
    metadata: Record<string, any>;
}
export interface ResourcePolicy {
    id: string;
    name: string;
    type: 'allocation' | 'scheduling' | 'optimization' | 'governance';
    rules: PolicyRule[];
    priority: number;
    enabled: boolean;
    applicableResources: ResourceType[];
    applicableAgents: AgentType[];
    conditions: string[];
    actions: PolicyAction[];
    createdAt: Date;
    updatedAt: Date;
}
export interface PolicyRule {
    id: string;
    condition: string;
    action: PolicyAction;
    priority: number;
    enabled: boolean;
}
export interface PolicyAction {
    type: 'allow' | 'deny' | 'modify' | 'queue' | 'escalate' | 'optimize';
    parameters: Record<string, any>;
    notification?: {
        channels: string[];
        template: string;
    };
}
export interface ResourceOptimization {
    id: string;
    type: 'cost' | 'performance' | 'utilization' | 'sustainability';
    scope: 'global' | 'pool' | 'agent' | 'workflow';
    targetId?: string;
    recommendations: OptimizationRecommendation[];
    estimatedSavings: {
        cost: number;
        performance: number;
        resources: Record<ResourceType, number>;
    };
    implementation: {
        automated: boolean;
        steps: string[];
        risks: string[];
        rollbackPlan: string[];
    };
    createdAt: Date;
    validUntil: Date;
}
export interface OptimizationRecommendation {
    type: 'scale_up' | 'scale_down' | 'migrate' | 'consolidate' | 'terminate';
    target: {
        type: 'resource' | 'allocation' | 'policy';
        id: string;
    };
    change: Record<string, any>;
    impact: {
        cost: number;
        performance: number;
        risk: 'low' | 'medium' | 'high';
    };
    priority: number;
    confidence: number;
}
export interface ResourceSchedule {
    id: string;
    name: string;
    type: 'recurring' | 'one_time' | 'conditional';
    trigger: {
        type: 'time' | 'event' | 'threshold';
        config: Record<string, any>;
    };
    actions: Array<{
        type: 'allocate' | 'deallocate' | 'scale' | 'migrate';
        resourceId: string;
        parameters: Record<string, any>;
    }>;
    enabled: boolean;
    nextExecution: Date;
    lastExecution?: Date;
    executionHistory: ScheduleExecution[];
    createdAt: Date;
    updatedAt: Date;
}
export interface ScheduleExecution {
    id: string;
    scheduleId: string;
    executedAt: Date;
    status: 'success' | 'failure' | 'partial';
    result: Record<string, any>;
    error?: string;
    duration: number;
}
export interface ResourceMetrics {
    resourceId: string;
    timestamp: Date;
    utilization: number;
    throughput: number;
    responseTime: number;
    errorRate: number;
    cost: number;
    availability: number;
    customMetrics: Record<string, number>;
}
export interface ResourceForecast {
    resourceType: ResourceType;
    period: {
        start: Date;
        end: Date;
    };
    predictions: Array<{
        timestamp: Date;
        demandForecast: number;
        utilizationForecast: number;
        costForecast: number;
        confidence: number;
    }>;
    recommendations: Array<{
        action: 'scale_up' | 'scale_down' | 'add_capacity' | 'optimize';
        timing: Date;
        magnitude: number;
        reasoning: string;
    }>;
    assumptions: string[];
    accuracy: {
        historical: number;
        trend: 'improving' | 'stable' | 'declining';
    };
}
//# sourceMappingURL=resource.d.ts.map