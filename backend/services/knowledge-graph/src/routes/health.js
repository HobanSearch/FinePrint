"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRoutes = healthRoutes;
async function healthRoutes(server) {
    server.get('/health', {
        schema: {
            tags: ['Health'],
            summary: 'Health check endpoint',
            description: 'Check if the Knowledge Graph Service is running',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        status: { type: 'string' },
                        timestamp: { type: 'string' },
                        service: { type: 'string' },
                        version: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            service: 'knowledge-graph',
            version: '1.0.0',
        };
    });
    server.get('/health/detailed', {
        schema: {
            tags: ['Health'],
            summary: 'Detailed health check',
            description: 'Check health of Knowledge Graph Service and all dependencies',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        status: { type: 'string' },
                        timestamp: { type: 'string' },
                        service: { type: 'string' },
                        version: { type: 'string' },
                        dependencies: {
                            type: 'object',
                            properties: {
                                neo4j: { type: 'object' },
                                qdrant: { type: 'object' },
                                dspy_service: { type: 'object' },
                            },
                        },
                        performance: {
                            type: 'object',
                            properties: {
                                uptime: { type: 'number' },
                                memory_usage: { type: 'object' },
                                cpu_usage: { type: 'number' },
                            },
                        },
                    },
                },
            },
        },
    }, async (request, reply) => {
        const knowledgeGraph = server.knowledgeGraph;
        const curriculumLearning = server.curriculumLearning;
        const graphAnalytics = server.graphAnalytics;
        const neo4jHealthy = await knowledgeGraph.healthCheck();
        const embeddingsHealthy = await knowledgeGraph.getEmbeddingsService().healthCheck();
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        const overallStatus = neo4jHealthy && embeddingsHealthy ? 'healthy' : 'degraded';
        return {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            service: 'knowledge-graph',
            version: '1.0.0',
            dependencies: {
                neo4j: {
                    status: neo4jHealthy ? 'healthy' : 'unhealthy',
                    checked_at: new Date().toISOString(),
                },
                qdrant: {
                    status: embeddingsHealthy ? 'healthy' : 'unhealthy',
                    checked_at: new Date().toISOString(),
                },
                dspy_service: {
                    status: 'healthy',
                    checked_at: new Date().toISOString(),
                },
            },
            performance: {
                uptime: process.uptime(),
                memory_usage: {
                    rss: Math.round(memoryUsage.rss / 1024 / 1024),
                    heap_used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                    heap_total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                },
                cpu_usage: (cpuUsage.user + cpuUsage.system) / 1000,
            },
        };
    });
    server.get('/ready', {
        schema: {
            tags: ['Health'],
            summary: 'Readiness check',
            description: 'Check if the service is ready to accept requests',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        ready: { type: 'boolean' },
                        timestamp: { type: 'string' },
                    },
                },
                503: {
                    type: 'object',
                    properties: {
                        ready: { type: 'boolean' },
                        timestamp: { type: 'string' },
                        reason: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        const knowledgeGraph = server.knowledgeGraph;
        const curriculumLearning = server.curriculumLearning;
        const ready = knowledgeGraph.isInitialized() && curriculumLearning.isInitialized();
        if (!ready) {
            reply.status(503);
            return {
                ready: false,
                timestamp: new Date().toISOString(),
                reason: 'Service initialization not complete',
            };
        }
        return {
            ready: true,
            timestamp: new Date().toISOString(),
        };
    });
    server.get('/live', {
        schema: {
            tags: ['Health'],
            summary: 'Liveness check',
            description: 'Check if the service is still alive',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        alive: { type: 'boolean' },
                        timestamp: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        return {
            alive: true,
            timestamp: new Date().toISOString(),
        };
    });
}
//# sourceMappingURL=health.js.map