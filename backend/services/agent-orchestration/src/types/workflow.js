"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowDefinitionSchema = exports.WorkflowTaskSchema = exports.WorkflowTriggerType = exports.TaskStatus = exports.WorkflowStatus = void 0;
const zod_1 = require("zod");
const agent_1 = require("./agent");
var WorkflowStatus;
(function (WorkflowStatus) {
    WorkflowStatus["DRAFT"] = "draft";
    WorkflowStatus["ACTIVE"] = "active";
    WorkflowStatus["PAUSED"] = "paused";
    WorkflowStatus["COMPLETED"] = "completed";
    WorkflowStatus["FAILED"] = "failed";
    WorkflowStatus["CANCELLED"] = "cancelled";
})(WorkflowStatus || (exports.WorkflowStatus = WorkflowStatus = {}));
var TaskStatus;
(function (TaskStatus) {
    TaskStatus["PENDING"] = "pending";
    TaskStatus["WAITING_FOR_DEPENDENCIES"] = "waiting_for_dependencies";
    TaskStatus["READY"] = "ready";
    TaskStatus["RUNNING"] = "running";
    TaskStatus["COMPLETED"] = "completed";
    TaskStatus["FAILED"] = "failed";
    TaskStatus["SKIPPED"] = "skipped";
    TaskStatus["CANCELLED"] = "cancelled";
})(TaskStatus || (exports.TaskStatus = TaskStatus = {}));
var WorkflowTriggerType;
(function (WorkflowTriggerType) {
    WorkflowTriggerType["MANUAL"] = "manual";
    WorkflowTriggerType["SCHEDULED"] = "scheduled";
    WorkflowTriggerType["EVENT"] = "event";
    WorkflowTriggerType["WEBHOOK"] = "webhook";
    WorkflowTriggerType["API"] = "api";
})(WorkflowTriggerType || (exports.WorkflowTriggerType = WorkflowTriggerType = {}));
exports.WorkflowTaskSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string().min(1).max(100),
    description: zod_1.z.string().optional(),
    agentType: zod_1.z.nativeEnum(agent_1.AgentType),
    requiredCapabilities: zod_1.z.array(zod_1.z.nativeEnum(agent_1.AgentCapability)),
    inputSchema: zod_1.z.record(zod_1.z.any()),
    outputSchema: zod_1.z.record(zod_1.z.any()),
    timeout: zod_1.z.number().min(1000).default(300000),
    retryPolicy: zod_1.z.object({
        maxRetries: zod_1.z.number().min(0).default(3),
        backoffMultiplier: zod_1.z.number().min(1).default(2),
        initialDelay: zod_1.z.number().min(100).default(1000),
    }),
    dependencies: zod_1.z.array(zod_1.z.string()).default([]),
    conditions: zod_1.z.array(zod_1.z.object({
        field: zod_1.z.string(),
        operator: zod_1.z.enum(['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'exists']),
        value: zod_1.z.any(),
    })).default([]),
    parallel: zod_1.z.boolean().default(false),
    priority: zod_1.z.number().min(1).max(10).default(5),
    metadata: zod_1.z.record(zod_1.z.any()).default({}),
});
exports.WorkflowDefinitionSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    name: zod_1.z.string().min(1).max(100),
    description: zod_1.z.string().optional(),
    version: zod_1.z.string().default('1.0.0'),
    tags: zod_1.z.array(zod_1.z.string()).default([]),
    trigger: zod_1.z.object({
        type: zod_1.z.nativeEnum(WorkflowTriggerType),
        config: zod_1.z.record(zod_1.z.any()),
    }),
    tasks: zod_1.z.array(exports.WorkflowTaskSchema),
    globalTimeout: zod_1.z.number().min(1000).default(3600000),
    maxConcurrentTasks: zod_1.z.number().min(1).default(10),
    errorHandling: zod_1.z.object({
        onFailure: zod_1.z.enum(['stop', 'continue', 'retry']).default('stop'),
        maxRetries: zod_1.z.number().min(0).default(3),
        notifyOnFailure: zod_1.z.boolean().default(true),
    }),
    variables: zod_1.z.record(zod_1.z.any()).default({}),
    metadata: zod_1.z.record(zod_1.z.any()).default({}),
});
//# sourceMappingURL=workflow.js.map