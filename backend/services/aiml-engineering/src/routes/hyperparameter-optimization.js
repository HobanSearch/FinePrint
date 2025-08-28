"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = hyperparameterOptimizationRoutes;
const hyperparameter_optimizer_1 = require("../services/hyperparameter-optimizer");
async function hyperparameterOptimizationRoutes(fastify) {
    const aimlServices = fastify.aimlServices;
    fastify.post('/start', {
        schema: {
            description: 'Start a hyperparameter optimization study',
            tags: ['Optimization'],
            body: hyperparameter_optimizer_1.OptimizationConfigSchema,
        },
    }, async (request, reply) => {
        try {
            const studyId = await aimlServices.hyperparameterOptimizer.startOptimization(request.body);
            return reply.code(200).send({ success: true, study_id: studyId });
        }
        catch (error) {
            return reply.code(400).send({ error: error.message });
        }
    });
    fastify.get('/studies', async (request, reply) => {
        try {
            const studies = aimlServices.hyperparameterOptimizer.listStudies();
            return reply.code(200).send({ success: true, studies });
        }
        catch (error) {
            return reply.code(400).send({ error: error.message });
        }
    });
}
//# sourceMappingURL=hyperparameter-optimization.js.map