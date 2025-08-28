"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourceDefinitionSchema = exports.ResourceStatus = exports.ResourceType = void 0;
const zod_1 = require("zod");
var ResourceType;
(function (ResourceType) {
    ResourceType["COMPUTE"] = "compute";
    ResourceType["MEMORY"] = "memory";
    ResourceType["STORAGE"] = "storage";
    ResourceType["NETWORK"] = "network";
    ResourceType["GPU"] = "gpu";
    ResourceType["DATABASE_CONNECTION"] = "database_connection";
    ResourceType["API_QUOTA"] = "api_quota";
    ResourceType["LICENSE"] = "license";
})(ResourceType || (exports.ResourceType = ResourceType = {}));
var ResourceStatus;
(function (ResourceStatus) {
    ResourceStatus["AVAILABLE"] = "available";
    ResourceStatus["ALLOCATED"] = "allocated";
    ResourceStatus["RESERVED"] = "reserved";
    ResourceStatus["EXHAUSTED"] = "exhausted";
    ResourceStatus["MAINTENANCE"] = "maintenance";
    ResourceStatus["ERROR"] = "error";
})(ResourceStatus || (exports.ResourceStatus = ResourceStatus = {}));
exports.ResourceDefinitionSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    type: zod_1.z.nativeEnum(ResourceType),
    capacity: zod_1.z.number().min(0),
    unit: zod_1.z.string(),
    cost: zod_1.z.object({
        basePrice: zod_1.z.number().min(0),
        unit: zod_1.z.string(),
        currency: zod_1.z.string().default('USD'),
    }),
    constraints: zod_1.z.object({
        minAllocation: zod_1.z.number().min(0).default(0),
        maxAllocation: zod_1.z.number().min(0).optional(),
        allocationUnit: zod_1.z.number().min(1).default(1),
    }),
    location: zod_1.z.string().optional(),
    tags: zod_1.z.array(zod_1.z.string()).default([]),
    metadata: zod_1.z.record(zod_1.z.any()).default({}),
});
//# sourceMappingURL=resource.js.map