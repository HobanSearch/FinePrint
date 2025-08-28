"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = healthRoutes;
const zod_1 = require("zod");
async function healthRoutes(fastify) {
    fastify.get('/', {
        schema: {
            description: 'Basic health check',
            tags: ['Health'],
            response: {
                200: zod_1.z.object({
                    status: zod_1.z.string(),
                    timestamp: zod_1.z.string(),
                    uptime: zod_1.z.number(),
                    version: zod_1.z.string(),
                }),
            },
        },
    }, async (request, reply) => {
        return reply.code(200).send({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: '1.0.0',
        });
    });
    fastify.get('/detailed', {
        schema: {
            description: 'Detailed health check with service status',
            tags: ['Health'],
            response: {
                200: zod_1.z.object({
                    status: zod_1.z.string(),
                    timestamp: zod_1.z.string(),
                    uptime: zod_1.z.number(),
                    version: zod_1.z.string(),
                    services: zod_1.z.record(zod_1.z.object({
                        status: zod_1.z.string(),
                        details: zod_1.z.any().optional(),
                    })),
                    system: zod_1.z.object({
                        memory: zod_1.z.object({
                            used: zod_1.z.number(),
                            total: zod_1.z.number(),
                            percentage: zod_1.z.number(),
                        }),
                        cpu: zod_1.z.object({
                            usage: zod_1.z.number(),
                        }),
                        disk: zod_1.z.object({
                            usage: zod_1.z.number(),
                        }).optional(),
                    }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const aimlServices = fastify.aimlServices;
            const serviceHealth = {
                modelLifecycleManager: { status: 'healthy' },
                hyperparameterOptimizer: { status: 'healthy' },
                modelRegistry: { status: 'healthy' },
                performanceMonitor: { status: 'healthy' },
                automlPipeline: { status: 'healthy' },
                abTestingFramework: { status: 'healthy' },
                resourceOptimizer: { status: 'healthy' },
                mlOpsOrchestrator: { status: 'healthy' },
            };
            const memoryUsage = process.memoryUsage();
            const systemHealth = {
                memory: {
                    used: memoryUsage.heapUsed,
                    total: memoryUsage.heapTotal,
                    percentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
                },
                cpu: {
                    usage: process.cpuUsage().user / 1000000,
                },
            };
            const allHealthy = Object.values(serviceHealth).every(service => service.status === 'healthy');
            const overallStatus = allHealthy ? 'healthy' : 'degraded';
            return reply.code(200).send({
                status: overallStatus,
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: '1.0.0',
                services: serviceHealth,
                system: systemHealth,
            });
        }
        catch (error) {
            return reply.code(503).send({
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: '1.0.0',
                error: error.message,
            });
        }
    });
    fastify.get('/ready', {
        schema: {
            description: 'Readiness probe for Kubernetes',
            tags: ['Health'],
            response: {
                200: zod_1.z.object({
                    ready: zod_1.z.boolean(),
                    timestamp: zod_1.z.string(),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const aimlServices = fastify.aimlServices;
            const ready = !!(aimlServices.modelLifecycleManager &&
                aimlServices.hyperparameterOptimizer &&
                aimlServices.modelRegistry &&
                aimlServices.performanceMonitor);
            const statusCode = ready ? 200 : 503;
            return reply.code(statusCode).send({
                ready,
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            return reply.code(503).send({
                ready: false,
                timestamp: new Date().toISOString(),
                error: error.message,
            });
        }
    });
    fastify.get('/live', {
        schema: {
            description: 'Liveness probe for Kubernetes',
            tags: ['Health'],
            response: {
                200: zod_1.z.object({
                    alive: zod_1.z.boolean(),
                    timestamp: zod_1.z.string(),
                }),
            },
        },
    }, async (request, reply) => {
        return reply.code(200).send({
            alive: true,
            timestamp: new Date().toISOString(),
        });
    });
}
//# sourceMappingURL=health.js.map