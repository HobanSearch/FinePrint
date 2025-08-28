"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = mlopsRoutes;
async function mlopsRoutes(fastify) {
    const aimlServices = fastify.aimlServices;
    fastify.get('/status', async (request, reply) => {
        try {
            const status = aimlServices.mlOpsOrchestrator.getServiceMetrics();
            return reply.code(200).send({ success: true, status });
        }
        catch (error) {
            return reply.code(400).send({ error: error.message });
        }
    });
}
//# sourceMappingURL=mlops.js.map