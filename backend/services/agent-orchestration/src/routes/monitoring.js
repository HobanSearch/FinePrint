"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = monitoringRoutes;
const logger_1 = require("../utils/logger");
const logger = logger_1.Logger.child({ component: 'monitoring-routes' });
async function monitoringRoutes(fastify) {
    fastify.get('/dashboard', {
        schema: {
            tags: ['monitoring'],
            summary: 'Get monitoring dashboard data',
        },
    }, async (request, reply) => {
        reply.send({
            success: true,
            data: {
                message: 'Monitoring dashboard - coming soon',
                systemHealth: 'healthy',
                alerts: [],
                metrics: {},
            },
        });
    });
}
//# sourceMappingURL=monitoring.js.map