"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionCriteriaSchema = exports.DecisionStrategy = exports.DecisionType = void 0;
const zod_1 = require("zod");
var DecisionType;
(function (DecisionType) {
    DecisionType["AGENT_SELECTION"] = "agent_selection";
    DecisionType["RESOURCE_ALLOCATION"] = "resource_allocation";
    DecisionType["WORKFLOW_ROUTING"] = "workflow_routing";
    DecisionType["CONFLICT_RESOLUTION"] = "conflict_resolution";
    DecisionType["SCALING_DECISION"] = "scaling_decision";
    DecisionType["PRIORITY_ASSIGNMENT"] = "priority_assignment";
})(DecisionType || (exports.DecisionType = DecisionType = {}));
var DecisionStrategy;
(function (DecisionStrategy) {
    DecisionStrategy["ROUND_ROBIN"] = "round_robin";
    DecisionStrategy["LEAST_LOADED"] = "least_loaded";
    DecisionStrategy["WEIGHTED_ROUND_ROBIN"] = "weighted_round_robin";
    DecisionStrategy["CAPABILITY_BASED"] = "capability_based";
    DecisionStrategy["PERFORMANCE_BASED"] = "performance_based";
    DecisionStrategy["COST_OPTIMIZED"] = "cost_optimized";
    DecisionStrategy["CUSTOM"] = "custom";
})(DecisionStrategy || (exports.DecisionStrategy = DecisionStrategy = {}));
exports.DecisionCriteriaSchema = zod_1.z.object({
    name: zod_1.z.string(),
    weight: zod_1.z.number().min(0).max(1),
    type: zod_1.z.enum(['numeric', 'boolean', 'categorical']),
    direction: zod_1.z.enum(['maximize', 'minimize']).optional(),
    thresholds: zod_1.z.object({
        min: zod_1.z.number().optional(),
        max: zod_1.z.number().optional(),
        preferred: zod_1.z.number().optional(),
    }).optional(),
    metadata: zod_1.z.record(zod_1.z.any()).default({}),
});
//# sourceMappingURL=decision.js.map