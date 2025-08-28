"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = resourceRoutes;
const logger_1 = require("../utils/logger");
const logger = logger_1.Logger.child({ component: 'resource-routes' });
async function resourceRoutes(fastify) {
    fastify.get('/stats', {
        schema: {
            tags: ['resources'],
            summary: 'Get resource statistics',
        },
    }, async (request, reply) => {
        reply.send({
            success: true,
            data: {
                message: 'Resource management routes - coming soon',
                totalPools: 0,
                totalResources: 0,
                utilization: 0,
            },
        });
    });
}
//# sourceMappingURL=resources.js.map