"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = modelRegistryRoutes;
const model_registry_1 = require("../services/model-registry");
async function modelRegistryRoutes(fastify) {
    const aimlServices = fastify.aimlServices;
    fastify.post('/models', {
        schema: {
            description: 'Register a new model',
            tags: ['Registry'],
            body: model_registry_1.ModelMetadataSchema.partial(),
        },
    }, async (request, reply) => {
        try {
            const modelId = await aimlServices.modelRegistry.registerModel(request.body);
            return reply.code(201).send({ success: true, model_id: modelId });
        }
        catch (error) {
            return reply.code(400).send({ error: error.message });
        }
    });
    fastify.get('/models', async (request, reply) => {
        try {
            const models = await aimlServices.modelRegistry.listModels();
            return reply.code(200).send({ success: true, models });
        }
        catch (error) {
            return reply.code(400).send({ error: error.message });
        }
    });
    fastify.get('/models/:modelId', async (request, reply) => {
        try {
            const model = await aimlServices.modelRegistry.getModel(request.params.modelId);
            if (!model) {
                return reply.code(404).send({ error: 'Model not found' });
            }
            return reply.code(200).send({ success: true, model });
        }
        catch (error) {
            return reply.code(400).send({ error: error.message });
        }
    });
}
//# sourceMappingURL=model-registry.js.map