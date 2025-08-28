"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = resourceOptimizationRoutes;
async function resourceOptimizationRoutes(fastify) {
    const aimlServices = fastify.aimlServices;
    fastify.get('/usage', async (request, reply) => {
        try {
            const usage = await aimlServices.resourceOptimizer.getResourceUsage();
            return reply.code(200).send({ success: true, usage });
        }
        catch (error) {
            return reply.code(400).send({ error: error.message });
        }
    });
}
//# sourceMappingURL=resource-optimization.js.map