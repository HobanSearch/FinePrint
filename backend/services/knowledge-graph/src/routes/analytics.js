"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsRoutes = analyticsRoutes;
async function analyticsRoutes(server) {
    const graphAnalytics = server.graphAnalytics;
    server.get('/graph', {
        schema: {
            tags: ['Analytics'],
            summary: 'Get comprehensive graph analytics',
            description: 'Retrieve detailed analytics about knowledge graph performance and insights',
        },
    }, async (request, reply) => {
        try {
            const analytics = await graphAnalytics.getGraphAnalytics();
            return analytics;
        }
        catch (error) {
            reply.status(500);
            return { error: 'Failed to get graph analytics', message: error.message };
        }
    });
    server.get('/evolution', {
        schema: {
            tags: ['Analytics'],
            summary: 'Analyze knowledge evolution',
            querystring: {
                type: 'object',
                properties: {
                    period: { type: 'string', enum: ['DAILY', 'WEEKLY', 'MONTHLY'], default: 'WEEKLY' },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const evolution = await graphAnalytics.analyzeKnowledgeEvolution(request.query.period);
            return evolution;
        }
        catch (error) {
            reply.status(500);
            return { error: 'Failed to analyze knowledge evolution', message: error.message };
        }
    });
    server.get('/curriculum-optimization', {
        schema: {
            tags: ['Analytics'],
            summary: 'Get curriculum optimization recommendations',
            description: 'Get recommendations for optimizing curriculum and learning paths',
        },
    }, async (request, reply) => {
        try {
            const recommendations = await graphAnalytics.getCurriculumOptimizationRecommendations();
            return recommendations;
        }
        catch (error) {
            reply.status(500);
            return { error: 'Failed to get curriculum optimization recommendations', message: error.message };
        }
    });
}
//# sourceMappingURL=analytics.js.map