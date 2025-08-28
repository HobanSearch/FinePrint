"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageType = exports.ExecutionStatus = exports.WorkflowStatus = exports.TriggerType = exports.StepType = exports.IntegrationStatus = exports.IntegrationType = exports.ConditionOperator = exports.HookTrigger = exports.HookType = exports.VariableType = exports.TemplateType = exports.TemplateCategory = exports.Priority = exports.SuggestionType = exports.IssueSeverity = exports.CheckStatus = exports.QualityCheckType = exports.QualityAssessmentRequestSchema = exports.ImpactLevel = exports.BenefitType = exports.RiskSeverity = exports.RiskType = exports.ArchitectureDecisionRequestSchema = exports.FileType = exports.CodeGenerationRequestSchema = exports.AgentCapability = exports.AgentStatus = void 0;
const zod_1 = require("zod");
var AgentStatus;
(function (AgentStatus) {
    AgentStatus["ACTIVE"] = "active";
    AgentStatus["IDLE"] = "idle";
    AgentStatus["BUSY"] = "busy";
    AgentStatus["ERROR"] = "error";
    AgentStatus["OFFLINE"] = "offline";
})(AgentStatus || (exports.AgentStatus = AgentStatus = {}));
var AgentCapability;
(function (AgentCapability) {
    AgentCapability["CODE_GENERATION"] = "code_generation";
    AgentCapability["ARCHITECTURE_DECISIONS"] = "architecture_decisions";
    AgentCapability["QUALITY_ASSURANCE"] = "quality_assurance";
    AgentCapability["INTEGRATION_MANAGEMENT"] = "integration_management";
    AgentCapability["TEMPLATE_MANAGEMENT"] = "template_management";
    AgentCapability["LEARNING_ADAPTATION"] = "learning_adaptation";
})(AgentCapability || (exports.AgentCapability = AgentCapability = {}));
exports.CodeGenerationRequestSchema = zod_1.z.object({
    type: zod_1.z.enum(['component', 'service', 'api', 'database', 'infrastructure', 'test', 'documentation']),
    framework: zod_1.z.string(),
    language: zod_1.z.enum(['typescript', 'javascript', 'python', 'sql', 'yaml', 'dockerfile', 'markdown']),
    context: zod_1.z.object({
        projectType: zod_1.z.string(),
        existingCode: zod_1.z.string().optional(),
        requirements: zod_1.z.string(),
        constraints: zod_1.z.array(zod_1.z.string()).optional(),
        integrations: zod_1.z.array(zod_1.z.string()).optional()
    }),
    options: zod_1.z.object({
        includeTests: zod_1.z.boolean().default(true),
        includeDocumentation: zod_1.z.boolean().default(true),
        followExistingPatterns: zod_1.z.boolean().default(true),
        optimizeForPerformance: zod_1.z.boolean().default(false),
        ensureAccessibility: zod_1.z.boolean().default(true)
    }).optional()
});
var FileType;
(function (FileType) {
    FileType["SOURCE"] = "source";
    FileType["TEST"] = "test";
    FileType["CONFIG"] = "config";
    FileType["DOCUMENTATION"] = "documentation";
    FileType["SCHEMA"] = "schema";
    FileType["MIGRATION"] = "migration";
})(FileType || (exports.FileType = FileType = {}));
exports.ArchitectureDecisionRequestSchema = zod_1.z.object({
    context: zod_1.z.object({
        projectType: zod_1.z.string(),
        requirements: zod_1.z.array(zod_1.z.string()),
        constraints: zod_1.z.array(zod_1.z.string()),
        existingArchitecture: zod_1.z.string().optional(),
        scalabilityNeeds: zod_1.z.enum(['small', 'medium', 'large', 'enterprise']),
        performanceRequirements: zod_1.z.object({
            latency: zod_1.z.number().optional(),
            throughput: zod_1.z.number().optional(),
            availability: zod_1.z.number().optional()
        }).optional()
    }),
    decisionType: zod_1.z.enum([
        'framework_selection',
        'database_choice',
        'architecture_pattern',
        'deployment_strategy',
        'integration_approach',
        'security_model',
        'caching_strategy',
        'messaging_system'
    ]),
    options: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string(),
        description: zod_1.z.string(),
        pros: zod_1.z.array(zod_1.z.string()),
        cons: zod_1.z.array(zod_1.z.string()),
        complexity: zod_1.z.number().min(1).max(5),
        cost: zod_1.z.number().min(1).max(5),
        maturity: zod_1.z.number().min(1).max(5)
    }))
});
var RiskType;
(function (RiskType) {
    RiskType["TECHNICAL"] = "technical";
    RiskType["SECURITY"] = "security";
    RiskType["PERFORMANCE"] = "performance";
    RiskType["SCALABILITY"] = "scalability";
    RiskType["MAINTAINABILITY"] = "maintainability";
    RiskType["COST"] = "cost";
})(RiskType || (exports.RiskType = RiskType = {}));
var RiskSeverity;
(function (RiskSeverity) {
    RiskSeverity["LOW"] = "low";
    RiskSeverity["MEDIUM"] = "medium";
    RiskSeverity["HIGH"] = "high";
    RiskSeverity["CRITICAL"] = "critical";
})(RiskSeverity || (exports.RiskSeverity = RiskSeverity = {}));
var BenefitType;
(function (BenefitType) {
    BenefitType["PERFORMANCE"] = "performance";
    BenefitType["SCALABILITY"] = "scalability";
    BenefitType["MAINTAINABILITY"] = "maintainability";
    BenefitType["DEVELOPER_EXPERIENCE"] = "developer_experience";
    BenefitType["COST_EFFICIENCY"] = "cost_efficiency";
    BenefitType["SECURITY"] = "security";
    BenefitType["RELIABILITY"] = "reliability";
})(BenefitType || (exports.BenefitType = BenefitType = {}));
var ImpactLevel;
(function (ImpactLevel) {
    ImpactLevel["LOW"] = "low";
    ImpactLevel["MEDIUM"] = "medium";
    ImpactLevel["HIGH"] = "high";
    ImpactLevel["VERY_HIGH"] = "very_high";
})(ImpactLevel || (exports.ImpactLevel = ImpactLevel = {}));
exports.QualityAssessmentRequestSchema = zod_1.z.object({
    code: zod_1.z.string(),
    language: zod_1.z.string(),
    context: zod_1.z.object({
        framework: zod_1.z.string().optional(),
        projectType: zod_1.z.string().optional(),
        requirements: zod_1.z.array(zod_1.z.string()).optional()
    }).optional(),
    checks: zod_1.z.array(zod_1.z.enum([
        'syntax',
        'formatting',
        'security',
        'performance',
        'accessibility',
        'best_practices',
        'testing',
        'documentation'
    ])).optional()
});
var QualityCheckType;
(function (QualityCheckType) {
    QualityCheckType["SYNTAX"] = "syntax";
    QualityCheckType["FORMATTING"] = "formatting";
    QualityCheckType["SECURITY"] = "security";
    QualityCheckType["PERFORMANCE"] = "performance";
    QualityCheckType["ACCESSIBILITY"] = "accessibility";
    QualityCheckType["BEST_PRACTICES"] = "best_practices";
    QualityCheckType["TESTING"] = "testing";
    QualityCheckType["DOCUMENTATION"] = "documentation";
})(QualityCheckType || (exports.QualityCheckType = QualityCheckType = {}));
var CheckStatus;
(function (CheckStatus) {
    CheckStatus["PASSED"] = "passed";
    CheckStatus["WARNING"] = "warning";
    CheckStatus["FAILED"] = "failed";
    CheckStatus["SKIPPED"] = "skipped";
})(CheckStatus || (exports.CheckStatus = CheckStatus = {}));
var IssueSeverity;
(function (IssueSeverity) {
    IssueSeverity["INFO"] = "info";
    IssueSeverity["WARNING"] = "warning";
    IssueSeverity["ERROR"] = "error";
    IssueSeverity["CRITICAL"] = "critical";
})(IssueSeverity || (exports.IssueSeverity = IssueSeverity = {}));
var SuggestionType;
(function (SuggestionType) {
    SuggestionType["REFACTORING"] = "refactoring";
    SuggestionType["OPTIMIZATION"] = "optimization";
    SuggestionType["SECURITY_ENHANCEMENT"] = "security_enhancement";
    SuggestionType["ACCESSIBILITY_IMPROVEMENT"] = "accessibility_improvement";
    SuggestionType["TESTING_IMPROVEMENT"] = "testing_improvement";
    SuggestionType["DOCUMENTATION_IMPROVEMENT"] = "documentation_improvement";
})(SuggestionType || (exports.SuggestionType = SuggestionType = {}));
var Priority;
(function (Priority) {
    Priority["LOW"] = "low";
    Priority["MEDIUM"] = "medium";
    Priority["HIGH"] = "high";
    Priority["CRITICAL"] = "critical";
})(Priority || (exports.Priority = Priority = {}));
var TemplateCategory;
(function (TemplateCategory) {
    TemplateCategory["COMPONENT"] = "component";
    TemplateCategory["SERVICE"] = "service";
    TemplateCategory["API"] = "api";
    TemplateCategory["DATABASE"] = "database";
    TemplateCategory["INFRASTRUCTURE"] = "infrastructure";
    TemplateCategory["TEST"] = "test";
    TemplateCategory["DOCUMENTATION"] = "documentation";
    TemplateCategory["CONFIGURATION"] = "configuration";
})(TemplateCategory || (exports.TemplateCategory = TemplateCategory = {}));
var TemplateType;
(function (TemplateType) {
    TemplateType["FILE"] = "file";
    TemplateType["DIRECTORY"] = "directory";
    TemplateType["PROJECT"] = "project";
    TemplateType["SNIPPET"] = "snippet";
})(TemplateType || (exports.TemplateType = TemplateType = {}));
var VariableType;
(function (VariableType) {
    VariableType["STRING"] = "string";
    VariableType["NUMBER"] = "number";
    VariableType["BOOLEAN"] = "boolean";
    VariableType["ARRAY"] = "array";
    VariableType["OBJECT"] = "object";
    VariableType["ENUM"] = "enum";
})(VariableType || (exports.VariableType = VariableType = {}));
var HookType;
(function (HookType) {
    HookType["PRE_GENERATION"] = "pre_generation";
    HookType["POST_GENERATION"] = "post_generation";
    HookType["PRE_FILE"] = "pre_file";
    HookType["POST_FILE"] = "post_file";
})(HookType || (exports.HookType = HookType = {}));
var HookTrigger;
(function (HookTrigger) {
    HookTrigger["ALWAYS"] = "always";
    HookTrigger["CONDITIONAL"] = "conditional";
    HookTrigger["ON_ERROR"] = "on_error";
})(HookTrigger || (exports.HookTrigger = HookTrigger = {}));
var ConditionOperator;
(function (ConditionOperator) {
    ConditionOperator["EQUALS"] = "equals";
    ConditionOperator["NOT_EQUALS"] = "not_equals";
    ConditionOperator["CONTAINS"] = "contains";
    ConditionOperator["NOT_CONTAINS"] = "not_contains";
    ConditionOperator["GREATER_THAN"] = "greater_than";
    ConditionOperator["LESS_THAN"] = "less_than";
    ConditionOperator["EXISTS"] = "exists";
    ConditionOperator["NOT_EXISTS"] = "not_exists";
})(ConditionOperator || (exports.ConditionOperator = ConditionOperator = {}));
var IntegrationType;
(function (IntegrationType) {
    IntegrationType["DSPY"] = "dspy";
    IntegrationType["LORA"] = "lora";
    IntegrationType["KNOWLEDGE_GRAPH"] = "knowledge_graph";
    IntegrationType["GIT"] = "git";
    IntegrationType["CI_CD"] = "ci_cd";
    IntegrationType["MONITORING"] = "monitoring";
    IntegrationType["EXTERNAL_API"] = "external_api";
})(IntegrationType || (exports.IntegrationType = IntegrationType = {}));
var IntegrationStatus;
(function (IntegrationStatus) {
    IntegrationStatus["ACTIVE"] = "active";
    IntegrationStatus["INACTIVE"] = "inactive";
    IntegrationStatus["ERROR"] = "error";
    IntegrationStatus["SYNCING"] = "syncing";
})(IntegrationStatus || (exports.IntegrationStatus = IntegrationStatus = {}));
var StepType;
(function (StepType) {
    StepType["CODE_GENERATION"] = "code_generation";
    StepType["ARCHITECTURE_DECISION"] = "architecture_decision";
    StepType["QUALITY_CHECK"] = "quality_check";
    StepType["TEMPLATE_APPLY"] = "template_apply";
    StepType["INTEGRATION_SYNC"] = "integration_sync";
    StepType["NOTIFICATION"] = "notification";
    StepType["CONDITIONAL"] = "conditional";
    StepType["PARALLEL"] = "parallel";
})(StepType || (exports.StepType = StepType = {}));
var TriggerType;
(function (TriggerType) {
    TriggerType["MANUAL"] = "manual";
    TriggerType["SCHEDULE"] = "schedule";
    TriggerType["WEBHOOK"] = "webhook";
    TriggerType["FILE_CHANGE"] = "file_change";
    TriggerType["API_CALL"] = "api_call";
    TriggerType["INTEGRATION_EVENT"] = "integration_event";
})(TriggerType || (exports.TriggerType = TriggerType = {}));
var WorkflowStatus;
(function (WorkflowStatus) {
    WorkflowStatus["DRAFT"] = "draft";
    WorkflowStatus["ACTIVE"] = "active";
    WorkflowStatus["PAUSED"] = "paused";
    WorkflowStatus["COMPLETED"] = "completed";
    WorkflowStatus["FAILED"] = "failed";
})(WorkflowStatus || (exports.WorkflowStatus = WorkflowStatus = {}));
var ExecutionStatus;
(function (ExecutionStatus) {
    ExecutionStatus["RUNNING"] = "running";
    ExecutionStatus["COMPLETED"] = "completed";
    ExecutionStatus["FAILED"] = "failed";
    ExecutionStatus["CANCELLED"] = "cancelled";
})(ExecutionStatus || (exports.ExecutionStatus = ExecutionStatus = {}));
var MessageType;
(function (MessageType) {
    MessageType["GENERATION_PROGRESS"] = "generation_progress";
    MessageType["GENERATION_COMPLETE"] = "generation_complete";
    MessageType["DECISION_UPDATE"] = "decision_update";
    MessageType["QUALITY_CHECK_RESULT"] = "quality_check_result";
    MessageType["INTEGRATION_STATUS"] = "integration_status";
    MessageType["WORKFLOW_UPDATE"] = "workflow_update";
    MessageType["ERROR"] = "error";
    MessageType["PING"] = "ping";
    MessageType["PONG"] = "pong";
})(MessageType || (exports.MessageType = MessageType = {}));
//# sourceMappingURL=index.js.map