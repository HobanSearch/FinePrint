"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = businessProcessRoutes;
const logger_1 = require("../utils/logger");
const logger = logger_1.Logger.child({ component: 'business-process-routes' });
async function businessProcessRoutes(fastify) {
    fastify.get('/templates', {
        schema: {
            tags: ['business-processes'],
            summary: 'Get business process templates',
        },
    }, async (request, reply) => {
        reply.send({
            success: true,
            data: {
                message: 'Business process templates - coming soon',
                templates: [],
            },
        });
    });
}
//# sourceMappingURL=business-processes.js.map