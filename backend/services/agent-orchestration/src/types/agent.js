"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRegistrationSchema = exports.AgentCapability = exports.AgentStatus = exports.AgentType = void 0;
const zod_1 = require("zod");
var AgentType;
(function (AgentType) {
    AgentType["FULLSTACK_AGENT"] = "fullstack-agent";
    AgentType["AIML_ENGINEERING"] = "aiml-engineering";
    AgentType["UI_UX_DESIGN"] = "ui-ux-design";
    AgentType["DEVOPS_AGENT"] = "devops-agent";
    AgentType["DSPY_FRAMEWORK"] = "dspy-framework";
    AgentType["GATED_LORA_SYSTEM"] = "gated-lora-system";
    AgentType["KNOWLEDGE_GRAPH"] = "knowledge-graph";
    AgentType["ENHANCED_OLLAMA"] = "enhanced-ollama";
    AgentType["SALES_AGENT"] = "sales-agent";
    AgentType["CUSTOMER_SUCCESS"] = "customer-success-agent";
    AgentType["LEGAL_COMPLIANCE"] = "legal-compliance-agent";
    AgentType["DATA_SCIENTIST"] = "data-scientist-agent";
    AgentType["CONTENT_MARKETING"] = "content-marketing-agent";
})(AgentType || (exports.AgentType = AgentType = {}));
var AgentStatus;
(function (AgentStatus) {
    AgentStatus["HEALTHY"] = "healthy";
    AgentStatus["DEGRADED"] = "degraded";
    AgentStatus["UNHEALTHY"] = "unhealthy";
    AgentStatus["OFFLINE"] = "offline";
    AgentStatus["BUSY"] = "busy";
    AgentStatus["IDLE"] = "idle";
})(AgentStatus || (exports.AgentStatus = AgentStatus = {}));
var AgentCapability;
(function (AgentCapability) {
    AgentCapability["CODE_GENERATION"] = "code_generation";
    AgentCapability["ARCHITECTURE_DECISIONS"] = "architecture_decisions";
    AgentCapability["TESTING_AUTOMATION"] = "testing_automation";
    AgentCapability["DEPLOYMENT_AUTOMATION"] = "deployment_automation";
    AgentCapability["MODEL_TRAINING"] = "model_training";
    AgentCapability["HYPERPARAMETER_OPTIMIZATION"] = "hyperparameter_optimization";
    AgentCapability["MODEL_DEPLOYMENT"] = "model_deployment";
    AgentCapability["PERFORMANCE_MONITORING"] = "performance_monitoring";
    AgentCapability["LEAD_GENERATION"] = "lead_generation";
    AgentCapability["CUSTOMER_SUPPORT"] = "customer_support";
    AgentCapability["CONTENT_CREATION"] = "content_creation";
    AgentCapability["DATA_ANALYSIS"] = "data_analysis";
    AgentCapability["COMPLIANCE_CHECK"] = "compliance_check";
})(AgentCapability || (exports.AgentCapability = AgentCapability = {}));
exports.AgentRegistrationSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    type: zod_1.z.nativeEnum(AgentType),
    name: zod_1.z.string().min(1).max(100),
    version: zod_1.z.string(),
    capabilities: zod_1.z.array(zod_1.z.nativeEnum(AgentCapability)),
    endpoint: zod_1.z.string().url(),
    healthCheckPath: zod_1.z.string().default('/health'),
    priority: zod_1.z.number().min(1).max(10).default(5),
    maxConcurrentTasks: zod_1.z.number().min(1).default(10),
    timeout: zod_1.z.number().min(1000).default(300000),
    retryPolicy: zod_1.z.object({
        maxRetries: zod_1.z.number().min(0).default(3),
        backoffMultiplier: zod_1.z.number().min(1).default(2),
        initialDelay: zod_1.z.number().min(100).default(1000),
    }),
    dependencies: zod_1.z.array(zod_1.z.nativeEnum(AgentType)).default([]),
    metadata: zod_1.z.record(zod_1.z.any()).default({}),
});
//# sourceMappingURL=agent.js.map