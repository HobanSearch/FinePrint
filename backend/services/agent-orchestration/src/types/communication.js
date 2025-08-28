"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageSchema = exports.DeliveryGuarantee = exports.MessagePriority = exports.MessageType = void 0;
const zod_1 = require("zod");
var MessageType;
(function (MessageType) {
    MessageType["REQUEST"] = "request";
    MessageType["RESPONSE"] = "response";
    MessageType["EVENT"] = "event";
    MessageType["BROADCAST"] = "broadcast";
    MessageType["NOTIFICATION"] = "notification";
    MessageType["HEARTBEAT"] = "heartbeat";
})(MessageType || (exports.MessageType = MessageType = {}));
var MessagePriority;
(function (MessagePriority) {
    MessagePriority[MessagePriority["LOW"] = 1] = "LOW";
    MessagePriority[MessagePriority["NORMAL"] = 5] = "NORMAL";
    MessagePriority[MessagePriority["HIGH"] = 8] = "HIGH";
    MessagePriority[MessagePriority["CRITICAL"] = 10] = "CRITICAL";
})(MessagePriority || (exports.MessagePriority = MessagePriority = {}));
var DeliveryGuarantee;
(function (DeliveryGuarantee) {
    DeliveryGuarantee["AT_MOST_ONCE"] = "at_most_once";
    DeliveryGuarantee["AT_LEAST_ONCE"] = "at_least_once";
    DeliveryGuarantee["EXACTLY_ONCE"] = "exactly_once";
})(DeliveryGuarantee || (exports.DeliveryGuarantee = DeliveryGuarantee = {}));
exports.MessageSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    type: zod_1.z.nativeEnum(MessageType),
    from: zod_1.z.string(),
    to: zod_1.z.string().or(zod_1.z.array(zod_1.z.string())),
    subject: zod_1.z.string().min(1).max(100),
    payload: zod_1.z.record(zod_1.z.any()),
    correlationId: zod_1.z.string().optional(),
    replyTo: zod_1.z.string().optional(),
    timestamp: zod_1.z.date(),
    ttl: zod_1.z.number().min(1000).optional(),
    priority: zod_1.z.nativeEnum(MessagePriority).default(MessagePriority.NORMAL),
    deliveryGuarantee: zod_1.z.nativeEnum(DeliveryGuarantee).default(DeliveryGuarantee.AT_LEAST_ONCE),
    retryPolicy: zod_1.z.object({
        maxRetries: zod_1.z.number().min(0).default(3),
        backoffMultiplier: zod_1.z.number().min(1).default(2),
        initialDelay: zod_1.z.number().min(100).default(1000),
    }).optional(),
    metadata: zod_1.z.record(zod_1.z.any()).default({}),
});
//# sourceMappingURL=communication.js.map