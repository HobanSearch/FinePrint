import { z } from 'zod';
export declare enum BusinessProcessType {
    CUSTOMER_ONBOARDING = "customer_onboarding",
    DOCUMENT_ANALYSIS_PIPELINE = "document_analysis_pipeline",
    SALES_FUNNEL_AUTOMATION = "sales_funnel_automation",
    CUSTOMER_SUPPORT_WORKFLOW = "customer_support_workflow",
    COMPLIANCE_MONITORING = "compliance_monitoring",
    BILLING_AUTOMATION = "billing_automation",
    CONTENT_GENERATION = "content_generation",
    MODEL_TRAINING_PIPELINE = "model_training_pipeline",
    DEPLOYMENT_PIPELINE = "deployment_pipeline",
    INCIDENT_RESPONSE = "incident_response"
}
export declare enum ProcessStatus {
    ACTIVE = "active",
    PAUSED = "paused",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled"
}
export declare const BusinessProcessSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    type: z.ZodNativeEnum<typeof BusinessProcessType>;
    description: z.ZodOptional<z.ZodString>;
    version: z.ZodDefault<z.ZodString>;
    workflows: z.ZodArray<z.ZodObject<{
        workflowId: z.ZodString;
        order: z.ZodNumber;
        parallel: z.ZodDefault<z.ZodBoolean>;
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
    }, "strip", z.ZodTypeAny, {
        workflowId: string;
        order: number;
        parallel: boolean;
        conditions: {
            field: string;
            operator: "equals" | "not_equals" | "greater_than" | "less_than" | "exists" | "contains";
            value?: any;
        }[];
    }, {
        workflowId: string;
        order: number;
        parallel?: boolean | undefined;
        conditions?: {
            field: string;
            operator: "equals" | "not_equals" | "greater_than" | "less_than" | "exists" | "contains";
            value?: any;
        }[] | undefined;
    }>, "many">;
    triggers: z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["api", "webhook", "scheduled", "event", "manual"]>;
        config: z.ZodRecord<z.ZodString, z.ZodAny>;
    }, "strip", z.ZodTypeAny, {
        type: "manual" | "event" | "api" | "webhook" | "scheduled";
        config: Record<string, any>;
    }, {
        type: "manual" | "event" | "api" | "webhook" | "scheduled";
        config: Record<string, any>;
    }>, "many">;
    sla: z.ZodObject<{
        completionTime: z.ZodNumber;
        availability: z.ZodDefault<z.ZodNumber>;
        errorRate: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        availability: number;
        completionTime: number;
        errorRate: number;
    }, {
        completionTime: number;
        availability?: number | undefined;
        errorRate?: number | undefined;
    }>;
    kpis: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        metric: z.ZodString;
        target: z.ZodNumber;
        unit: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        metric: string;
        target: number;
        unit: string;
    }, {
        name: string;
        metric: string;
        target: number;
        unit: string;
    }>, "many">>;
    stakeholders: z.ZodDefault<z.ZodArray<z.ZodObject<{
        role: z.ZodString;
        userId: z.ZodString;
        permissions: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        role: string;
        userId: string;
        permissions: string[];
    }, {
        role: string;
        userId: string;
        permissions: string[];
    }>, "many">>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    workflows: {
        workflowId: string;
        order: number;
        parallel: boolean;
        conditions: {
            field: string;
            operator: "equals" | "not_equals" | "greater_than" | "less_than" | "exists" | "contains";
            value?: any;
        }[];
    }[];
    version: string;
    type: BusinessProcessType;
    name: string;
    metadata: Record<string, any>;
    triggers: {
        type: "manual" | "event" | "api" | "webhook" | "scheduled";
        config: Record<string, any>;
    }[];
    sla: {
        availability: number;
        completionTime: number;
        errorRate: number;
    };
    kpis: {
        name: string;
        metric: string;
        target: number;
        unit: string;
    }[];
    stakeholders: {
        role: string;
        userId: string;
        permissions: string[];
    }[];
    description?: string | undefined;
}, {
    id: string;
    workflows: {
        workflowId: string;
        order: number;
        parallel?: boolean | undefined;
        conditions?: {
            field: string;
            operator: "equals" | "not_equals" | "greater_than" | "less_than" | "exists" | "contains";
            value?: any;
        }[] | undefined;
    }[];
    type: BusinessProcessType;
    name: string;
    triggers: {
        type: "manual" | "event" | "api" | "webhook" | "scheduled";
        config: Record<string, any>;
    }[];
    sla: {
        completionTime: number;
        availability?: number | undefined;
        errorRate?: number | undefined;
    };
    version?: string | undefined;
    metadata?: Record<string, any> | undefined;
    description?: string | undefined;
    kpis?: {
        name: string;
        metric: string;
        target: number;
        unit: string;
    }[] | undefined;
    stakeholders?: {
        role: string;
        userId: string;
        permissions: string[];
    }[] | undefined;
}>;
export type BusinessProcess = z.infer<typeof BusinessProcessSchema>;
export interface ProcessExecution {
    id: string;
    processId: string;
    processVersion: string;
    status: ProcessStatus;
    initiatedBy: string;
    initiationContext: Record<string, any>;
    startedAt: Date;
    completedAt?: Date;
    duration?: number;
    workflowExecutions: ProcessWorkflowExecution[];
    currentStage: string;
    progress: number;
    metrics: ProcessMetrics;
    outputs: Record<string, any>;
    error?: string;
    metadata: Record<string, any>;
}
export interface ProcessWorkflowExecution {
    workflowExecutionId: string;
    workflowId: string;
    order: number;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startedAt?: Date;
    completedAt?: Date;
    duration?: number;
    inputs: Record<string, any>;
    outputs?: Record<string, any>;
    error?: string;
}
export interface ProcessMetrics {
    executionId: string;
    processId: string;
    timestamp: Date;
    throughput: number;
    latency: number;
    errorRate: number;
    resourceUtilization: Record<string, number>;
    costAccumulated: number;
    qualityScore: number;
    customerSatisfaction?: number;
    businessValue: number;
}
export interface ProcessTemplate {
    id: string;
    name: string;
    type: BusinessProcessType;
    description: string;
    category: string;
    industry: string[];
    complexity: 'simple' | 'medium' | 'complex';
    estimatedDuration: number;
    requiredAgents: string[];
    process: BusinessProcess;
    usageStatistics: {
        deployments: number;
        successRate: number;
        averageDuration: number;
        userRating: number;
    };
    customizationOptions: ProcessCustomization[];
    documentation: {
        setup: string;
        configuration: string;
        troubleshooting: string;
        bestPractices: string[];
    };
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface ProcessCustomization {
    parameter: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    required: boolean;
    defaultValue: any;
    validation: Record<string, any>;
    description: string;
    examples: any[];
}
export interface ProcessOptimization {
    processId: string;
    analysisDate: Date;
    currentPerformance: {
        averageDuration: number;
        successRate: number;
        costPerExecution: number;
        resourceEfficiency: number;
    };
    bottlenecks: Array<{
        stage: string;
        workflowId: string;
        impact: 'low' | 'medium' | 'high';
        description: string;
        suggestedFix: string;
    }>;
    recommendations: Array<{
        type: 'workflow_optimization' | 'resource_reallocation' | 'parallelization' | 'caching';
        target: string;
        description: string;
        expectedImprovement: {
            duration: number;
            cost: number;
            reliability: number;
        };
        implementationEffort: 'low' | 'medium' | 'high';
        risks: string[];
    }>;
    projectedImpact: {
        durationReduction: number;
        costSavings: number;
        reliabilityIncrease: number;
    };
}
export interface ProcessGovernance {
    processId: string;
    complianceFrameworks: string[];
    auditRequirements: {
        retention: number;
        immutableLogs: boolean;
        approvalRequired: string[];
        segregationOfDuties: Array<{
            role1: string;
            role2: string;
            constraint: string;
        }>;
    };
    dataClassification: {
        inputData: string[];
        outputData: string[];
        processingRestrictions: Record<string, string>;
    };
    riskAssessment: {
        inherentRisk: 'low' | 'medium' | 'high';
        residualRisk: 'low' | 'medium' | 'high';
        mitigations: string[];
        controlTests: Array<{
            control: string;
            frequency: string;
            lastTested: Date;
            result: 'pass' | 'fail' | 'deficiency';
        }>;
    };
}
export interface CustomerOnboardingProcess {
    customerId: string;
    plan: 'starter' | 'professional' | 'enterprise';
    stages: {
        accountCreation: {
            status: 'completed' | 'pending' | 'failed';
            timestamp?: Date;
            data: {
                email: string;
                company: string;
                role: string;
            };
        };
        emailVerification: {
            status: 'completed' | 'pending' | 'failed';
            timestamp?: Date;
            attempts: number;
        };
        planSelection: {
            status: 'completed' | 'pending' | 'failed';
            timestamp?: Date;
            selectedPlan: string;
            paymentMethod?: string;
        };
        initialSetup: {
            status: 'completed' | 'pending' | 'failed';
            timestamp?: Date;
            configurationsCompleted: string[];
        };
        trainingCompleted: {
            status: 'completed' | 'pending' | 'failed';
            timestamp?: Date;
            modulesCompleted: string[];
        };
        firstAnalysis: {
            status: 'completed' | 'pending' | 'failed';
            timestamp?: Date;
            documentAnalyzed?: string;
        };
    };
    touchpoints: Array<{
        type: 'email' | 'in_app' | 'call' | 'chat';
        timestamp: Date;
        content: string;
        response?: string;
    }>;
    healthScore: number;
    riskFactors: string[];
    nextActions: string[];
}
export interface DocumentAnalysisPipeline {
    documentId: string;
    clientId: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    stages: {
        intake: {
            status: 'completed' | 'pending' | 'failed';
            timestamp?: Date;
            documentType: string;
            source: string;
        };
        preprocessing: {
            status: 'completed' | 'pending' | 'failed';
            timestamp?: Date;
            ocrPerformed: boolean;
            cleaningApplied: string[];
        };
        patternDetection: {
            status: 'completed' | 'pending' | 'failed';
            timestamp?: Date;
            patternsFound: number;
            confidence: number;
        };
        riskScoring: {
            status: 'completed' | 'pending' | 'failed';
            timestamp?: Date;
            overallScore: number;
            categoryScores: Record<string, number>;
        };
        reportGeneration: {
            status: 'completed' | 'pending' | 'failed';
            timestamp?: Date;
            reportFormat: string;
            customizations: string[];
        };
        delivery: {
            status: 'completed' | 'pending' | 'failed';
            timestamp?: Date;
            deliveryMethod: string;
            notificationsSent: string[];
        };
    };
    qualityChecks: Array<{
        stage: string;
        check: string;
        result: 'pass' | 'fail' | 'warning';
        details?: string;
    }>;
    slaCompliance: {
        targetTime: number;
        actualTime?: number;
        withinSLA: boolean;
    };
}
export interface ProcessAnalytics {
    processType: BusinessProcessType;
    timeframe: {
        start: Date;
        end: Date;
    };
    executions: {
        total: number;
        successful: number;
        failed: number;
        cancelled: number;
    };
    performance: {
        averageDuration: number;
        p95Duration: number;
        throughput: number;
        errorRate: number;
    };
    costs: {
        total: number;
        perExecution: number;
        breakdown: Record<string, number>;
    };
    bottlenecks: Array<{
        stage: string;
        averageWaitTime: number;
        frequency: number;
    }>;
    trends: Array<{
        date: Date;
        executions: number;
        avgDuration: number;
        successRate: number;
        cost: number;
    }>;
    userSatisfaction: {
        score: number;
        feedback: Array<{
            rating: number;
            comment: string;
            timestamp: Date;
        }>;
    };
}
//# sourceMappingURL=business-process.d.ts.map