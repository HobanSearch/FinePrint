"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = automlRoutes;
async function automlRoutes(fastify) {
    const aimlServices = fastify.aimlServices;
    fastify.post('/start', async (request, reply) => {
        try {
            const pipelineId = await aimlServices.automlPipeline.startAutoMLPipeline(request.body);
            return reply.code(200).send({ success: true, pipeline_id: pipelineId });
        }
        catch (error) {
            return reply.code(400).send({ error: error.message });
        }
    });
}
//# sourceMappingURL=automl.js.map