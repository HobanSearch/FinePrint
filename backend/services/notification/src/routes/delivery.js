"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = deliveryRoutes;
const logger_1 = require("@fineprintai/shared-logger");
const logger = (0, logger_1.createServiceLogger)('delivery-routes');
async function deliveryRoutes(fastify) {
    fastify.get('/stats', async (request, reply) => {
        reply.send({ success: true, data: {}, message: 'Delivery stats endpoint' });
    });
    fastify.get('/:notificationId/timeline', async (request, reply) => {
        reply.send({ success: true, data: [], message: 'Delivery timeline endpoint' });
    });
}
//# sourceMappingURL=delivery.js.map