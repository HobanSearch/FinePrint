"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BusinessProcessSchema = exports.ProcessStatus = exports.BusinessProcessType = void 0;
const zod_1 = require("zod");
var BusinessProcessType;
(function (BusinessProcessType) {
    BusinessProcessType["CUSTOMER_ONBOARDING"] = "customer_onboarding";
    BusinessProcessType["DOCUMENT_ANALYSIS_PIPELINE"] = "document_analysis_pipeline";
    BusinessProcessType["SALES_FUNNEL_AUTOMATION"] = "sales_funnel_automation";
    BusinessProcessType["CUSTOMER_SUPPORT_WORKFLOW"] = "customer_support_workflow";
    BusinessProcessType["COMPLIANCE_MONITORING"] = "compliance_monitoring";
    BusinessProcessType["BILLING_AUTOMATION"] = "billing_automation";
    BusinessProcessType["CONTENT_GENERATION"] = "content_generation";
    BusinessProcessType["MODEL_TRAINING_PIPELINE"] = "model_training_pipeline";
    BusinessProcessType["DEPLOYMENT_PIPELINE"] = "deployment_pipeline";
    BusinessProcessType["INCIDENT_RESPONSE"] = "incident_response";
})(BusinessProcessType || (exports.BusinessProcessType = BusinessProcessType = {}));
var ProcessStatus;
(function (ProcessStatus) {
    ProcessStatus["ACTIVE"] = "active";
    ProcessStatus["PAUSED"] = "paused";
    ProcessStatus["COMPLETED"] = "completed";
    ProcessStatus["FAILED"] = "failed";
    ProcessStatus["CANCELLED"] = "cancelled";
})(ProcessStatus || (exports.ProcessStatus = ProcessStatus = {}));
exports.BusinessProcessSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    name: zod_1.z.string().min(1).max(100),
    type: zod_1.z.nativeEnum(BusinessProcessType),
    description: zod_1.z.string().optional(),
    version: zod_1.z.string().default('1.0.0'),
    workflows: zod_1.z.array(zod_1.z.object({
        workflowId: zod_1.z.string(),
        order: zod_1.z.number(),
        parallel: zod_1.z.boolean().default(false),
        conditions: zod_1.z.array(zod_1.z.object({
            field: zod_1.z.string(),
            operator: zod_1.z.enum(['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'exists']),
            value: zod_1.z.any(),
        })).default([]),
    })),
    triggers: zod_1.z.array(zod_1.z.object({
        type: zod_1.z.enum(['api', 'webhook', 'scheduled', 'event', 'manual']),
        config: zod_1.z.record(zod_1.z.any()),
    })),
    sla: zod_1.z.object({
        completionTime: zod_1.z.number().min(1000),
        availability: zod_1.z.number().min(0).max(100).default(99.9),
        errorRate: zod_1.z.number().min(0).max(100).default(1),
    }),
    kpis: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string(),
        metric: zod_1.z.string(),
        target: zod_1.z.number(),
        unit: zod_1.z.string(),
    })).default([]),
    stakeholders: zod_1.z.array(zod_1.z.object({
        role: zod_1.z.string(),
        userId: zod_1.z.string(),
        permissions: zod_1.z.array(zod_1.z.string()),
    })).default([]),
    metadata: zod_1.z.record(zod_1.z.any()).default({}),
});
//# sourceMappingURL=business-process.js.map