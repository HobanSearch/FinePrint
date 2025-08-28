"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = performanceMonitoringRoutes;
const zod_1 = require("zod");
async function performanceMonitoringRoutes(fastify) {
    const aimlServices = fastify.aimlServices;
    fastify.get('/dashboard/:modelId', {
        schema: {
            description: 'Get performance dashboard for a model',
            tags: ['Monitoring'],
            params: zod_1.z.object({ modelId: zod_1.z.string() }),
            querystring: zod_1.z.object({ timeRange: zod_1.z.string().default('24h') }),
        },
    }, async (request, reply) => {
        try {
            const dashboard = await aimlServices.performanceMonitor.getModelDashboard(request.params.modelId, request.query.timeRange);
            return reply.code(200).send({ success: true, dashboard });
        }
        catch (error) {
            return reply.code(400).send({ error: error.message });
        }
    });
    fastify.post('/drift-detection/configure', {
        schema: {
            description: 'Configure data drift detection for a model',
            tags: ['Monitoring'],
        },
    }, async (request, reply) => {
        try {
            await aimlServices.performanceMonitor.configureDriftDetection(request.body);
            return reply.code(200).send({ success: true, message: 'Drift detection configured' });
        }
        catch (error) {
            return reply.code(400).send({ error: error.message });
        }
    });
}
//# sourceMappingURL=performance-monitoring.js.map