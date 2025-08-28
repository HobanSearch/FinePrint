import { z } from 'zod';
import { AgentType } from './agent';
export declare enum DecisionType {
    AGENT_SELECTION = "agent_selection",
    RESOURCE_ALLOCATION = "resource_allocation",
    WORKFLOW_ROUTING = "workflow_routing",
    CONFLICT_RESOLUTION = "conflict_resolution",
    SCALING_DECISION = "scaling_decision",
    PRIORITY_ASSIGNMENT = "priority_assignment"
}
export declare enum DecisionStrategy {
    ROUND_ROBIN = "round_robin",
    LEAST_LOADED = "least_loaded",
    WEIGHTED_ROUND_ROBIN = "weighted_round_robin",
    CAPABILITY_BASED = "capability_based",
    PERFORMANCE_BASED = "performance_based",
    COST_OPTIMIZED = "cost_optimized",
    CUSTOM = "custom"
}
export declare const DecisionCriteriaSchema: z.ZodObject<{
    name: z.ZodString;
    weight: z.ZodNumber;
    type: z.ZodEnum<["numeric", "boolean", "categorical"]>;
    direction: z.ZodOptional<z.ZodEnum<["maximize", "minimize"]>>;
    thresholds: z.ZodOptional<z.ZodObject<{
        min: z.ZodOptional<z.ZodNumber>;
        max: z.ZodOptional<z.ZodNumber>;
        preferred: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        max?: number | undefined;
        min?: number | undefined;
        preferred?: number | undefined;
    }, {
        max?: number | undefined;
        min?: number | undefined;
        preferred?: number | undefined;
    }>>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    type: "boolean" | "numeric" | "categorical";
    name: string;
    metadata: Record<string, any>;
    weight: number;
    direction?: "minimize" | "maximize" | undefined;
    thresholds?: {
        max?: number | undefined;
        min?: number | undefined;
        preferred?: number | undefined;
    } | undefined;
}, {
    type: "boolean" | "numeric" | "categorical";
    name: string;
    weight: number;
    metadata?: Record<string, any> | undefined;
    direction?: "minimize" | "maximize" | undefined;
    thresholds?: {
        max?: number | undefined;
        min?: number | undefined;
        preferred?: number | undefined;
    } | undefined;
}>;
export type DecisionCriteria = z.infer<typeof DecisionCriteriaSchema>;
export interface DecisionRequest {
    id: string;
    type: DecisionType;
    context: Record<string, any>;
    constraints: DecisionConstraint[];
    criteria: DecisionCriteria[];
    options: DecisionOption[];
    strategy: DecisionStrategy;
    timeout: number;
    metadata: Record<string, any>;
    createdAt: Date;
}
export interface DecisionConstraint {
    field: string;
    operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'in' | 'not_in' | 'exists';
    value: any;
    required: boolean;
}
export interface DecisionOption {
    id: string;
    type: string;
    attributes: Record<string, any>;
    cost: number;
    availability: boolean;
    metadata: Record<string, any>;
}
export interface DecisionResult {
    id: string;
    requestId: string;
    selectedOption: DecisionOption;
    score: number;
    confidence: number;
    reasoning: DecisionReasoning[];
    alternatives: Array<{
        option: DecisionOption;
        score: number;
        reason: string;
    }>;
    processedAt: Date;
    processingTime: number;
    metadata: Record<string, any>;
}
export interface DecisionReasoning {
    criterion: string;
    weight: number;
    score: number;
    explanation: string;
    evidence: Record<string, any>;
}
export interface DecisionPolicy {
    id: string;
    name: string;
    description: string;
    type: DecisionType;
    strategy: DecisionStrategy;
    criteria: DecisionCriteria[];
    constraints: DecisionConstraint[];
    rules: DecisionRule[];
    enabled: boolean;
    priority: number;
    version: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface DecisionRule {
    id: string;
    name: string;
    condition: string;
    action: DecisionAction;
    priority: number;
    enabled: boolean;
}
export interface DecisionAction {
    type: 'select' | 'reject' | 'modify' | 'escalate';
    parameters: Record<string, any>;
    explanation: string;
}
export interface ConflictResolution {
    id: string;
    type: 'resource_conflict' | 'priority_conflict' | 'capability_conflict' | 'policy_conflict';
    conflictingItems: Array<{
        id: string;
        type: string;
        attributes: Record<string, any>;
    }>;
    resolutionStrategy: 'first_come_first_serve' | 'priority_based' | 'negotiation' | 'escalation' | 'resource_sharing';
    resolution: {
        winner?: string;
        allocation?: Record<string, any>;
        compromise?: Record<string, any>;
        escalatedTo?: string;
    };
    resolvedAt: Date;
    processingTime: number;
    metadata: Record<string, any>;
}
export interface EscalationPolicy {
    id: string;
    name: string;
    triggers: EscalationTrigger[];
    escalationLevels: EscalationLevel[];
    timeout: number;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface EscalationTrigger {
    type: 'decision_timeout' | 'conflict_unresolved' | 'resource_unavailable' | 'error_threshold';
    condition: string;
    threshold: number;
}
export interface EscalationLevel {
    level: number;
    escalateTo: 'human_operator' | 'senior_agent' | 'system_admin';
    notificationChannels: string[];
    timeout: number;
    autoResolve: boolean;
}
export interface DecisionAudit {
    id: string;
    requestId: string;
    decisionId: string;
    userId?: string;
    action: 'created' | 'approved' | 'rejected' | 'modified' | 'executed';
    previousState?: Record<string, any>;
    newState?: Record<string, any>;
    reason: string;
    timestamp: Date;
    metadata: Record<string, any>;
}
export interface AgentAuthorityMatrix {
    agentType: AgentType;
    authorities: Array<{
        domain: string;
        level: 'read' | 'write' | 'execute' | 'admin';
        constraints: Record<string, any>;
    }>;
    delegations: Array<{
        to: AgentType;
        domain: string;
        level: string;
        conditions: string[];
    }>;
    approvalRequired: string[];
}
export interface DecisionMetrics {
    totalDecisions: number;
    averageProcessingTime: number;
    accuracyRate: number;
    conflictRate: number;
    escalationRate: number;
    strategyEffectiveness: Record<DecisionStrategy, {
        usage: number;
        successRate: number;
        averageScore: number;
    }>;
    criteriaImportance: Record<string, number>;
    performanceTrends: Array<{
        date: Date;
        decisionCount: number;
        averageTime: number;
        successRate: number;
    }>;
}
//# sourceMappingURL=decision.d.ts.map