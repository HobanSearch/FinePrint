"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRoutes = registerRoutes;
const knowledge_graph_1 = require("./knowledge-graph");
const curriculum_learning_1 = require("./curriculum-learning");
const semantic_search_1 = require("./semantic-search");
const analytics_1 = require("./analytics");
const knowledge_extraction_1 = require("./knowledge-extraction");
const graph_inference_1 = require("./graph-inference");
const health_1 = require("./health");
async function registerRoutes(server) {
    await server.register(health_1.healthRoutes);
    await server.register(async function (server) {
        server.addHook('onRequest', async (request, reply) => {
            if (process.env.NODE_ENV !== 'development') {
            }
        });
        await server.register(knowledge_graph_1.knowledgeGraphRoutes, { prefix: '/api/knowledge-graph' });
        await server.register(curriculum_learning_1.curriculumLearningRoutes, { prefix: '/api/curriculum' });
        await server.register(semantic_search_1.semanticSearchRoutes, { prefix: '/api/search' });
        await server.register(analytics_1.analyticsRoutes, { prefix: '/api/analytics' });
        await server.register(knowledge_extraction_1.knowledgeExtractionRoutes, { prefix: '/api/extraction' });
        await server.register(graph_inference_1.graphInferenceRoutes, { prefix: '/api/inference' });
    });
}
//# sourceMappingURL=index.js.map