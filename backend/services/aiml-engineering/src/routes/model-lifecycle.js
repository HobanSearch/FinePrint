"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = modelLifecycleRoutes;
const zod_1 = require("zod");
const model_lifecycle_manager_1 = require("../services/model-lifecycle-manager");
async function modelLifecycleRoutes(fastify) {
    const aimlServices = fastify.aimlServices;
    fastify.post('/start', {
        schema: {
            description: 'Start a new model training job',
            tags: ['Training'],
            body: model_lifecycle_manager_1.TrainingConfigSchema,
            response: {
                200: zod_1.z.object({
                    success: zod_1.z.boolean(),
                    job_id: zod_1.z.string(),
                    message: zod_1.z.string(),
                }),
                400: zod_1.z.object({
                    error: zod_1.z.string(),
                    details: zod_1.z.any().optional(),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const jobId = await aimlServices.modelLifecycleManager.startTraining(request.body);
            return reply.code(200).send({
                success: true,
                job_id: jobId,
                message: 'Training job started successfully',
            });
        }
        catch (error) {
            return reply.code(400).send({
                error: error.message,
                details: error.details,
            });
        }
    });
    fastify.post('/stop/:jobId', {
        schema: {
            description: 'Stop a running training job',
            tags: ['Training'],
            params: zod_1.z.object({
                jobId: zod_1.z.string(),
            }),
            response: {
                200: zod_1.z.object({
                    success: zod_1.z.boolean(),
                    message: zod_1.z.string(),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            await aimlServices.modelLifecycleManager.stopTraining(request.params.jobId);
            return reply.code(200).send({
                success: true,
                message: 'Training job stopped successfully',
            });
        }
        catch (error) {
            return reply.code(400).send({
                error: error.message,
            });
        }
    });
    fastify.post('/pause/:jobId', {
        schema: {
            description: 'Pause a running training job',
            tags: ['Training'],
            params: zod_1.z.object({
                jobId: zod_1.z.string(),
            }),
        },
    }, async (request, reply) => {
        try {
            await aimlServices.modelLifecycleManager.pauseTraining(request.params.jobId);
            return reply.code(200).send({
                success: true,
                message: 'Training job paused successfully',
            });
        }
        catch (error) {
            return reply.code(400).send({
                error: error.message,
            });
        }
    });
    fastify.post('/resume/:jobId', {
        schema: {
            description: 'Resume a paused training job',
            tags: ['Training'],
            params: zod_1.z.object({
                jobId: zod_1.z.string(),
            }),
        },
    }, async (request, reply) => {
        try {
            await aimlServices.modelLifecycleManager.resumeTraining(request.params.jobId);
            return reply.code(200).send({
                success: true,
                message: 'Training job resumed successfully',
            });
        }
        catch (error) {
            return reply.code(400).send({
                error: error.message,
            });
        }
    });
    fastify.get('/jobs/:jobId', {
        schema: {
            description: 'Get training job details',
            tags: ['Training'],
            params: zod_1.z.object({
                jobId: zod_1.z.string(),
            }),
        },
    }, async (request, reply) => {
        try {
            const job = aimlServices.modelLifecycleManager.getJob(request.params.jobId);
            if (!job) {
                return reply.code(404).send({
                    error: 'Training job not found',
                });
            }
            return reply.code(200).send({
                success: true,
                job,
            });
        }
        catch (error) {
            return reply.code(400).send({
                error: error.message,
            });
        }
    });
    fastify.get('/jobs', {
        schema: {
            description: 'List training jobs with optional filtering',
            tags: ['Training'],
            querystring: zod_1.z.object({
                status: zod_1.z.enum(['pending', 'running', 'completed', 'failed', 'cancelled', 'paused']).optional(),
                limit: zod_1.z.number().min(1).max(100).default(20).optional(),
                offset: zod_1.z.number().min(0).default(0).optional(),
            }),
        },
    }, async (request, reply) => {
        try {
            const { status, limit = 20, offset = 0 } = request.query;
            let jobs = aimlServices.modelLifecycleManager.listJobs(status);
            const total = jobs.length;
            jobs = jobs.slice(offset, offset + limit);
            return reply.code(200).send({
                success: true,
                jobs,
                pagination: {
                    total,
                    limit,
                    offset,
                    has_more: offset + limit < total,
                },
            });
        }
        catch (error) {
            return reply.code(400).send({
                error: error.message,
            });
        }
    });
    fastify.get('/jobs/:jobId/logs', {
        schema: {
            description: 'Get training job logs',
            tags: ['Training'],
            params: zod_1.z.object({
                jobId: zod_1.z.string(),
            }),
            querystring: zod_1.z.object({
                limit: zod_1.z.number().min(1).max(1000).default(100).optional(),
                level: zod_1.z.enum(['info', 'warning', 'error', 'debug']).optional(),
            }),
        },
    }, async (request, reply) => {
        try {
            const { limit = 100, level } = request.query;
            let logs = aimlServices.modelLifecycleManager.getJobLogs(request.params.jobId, limit);
            if (level) {
                logs = logs.filter(log => log.level === level);
            }
            return reply.code(200).send({
                success: true,
                logs,
            });
        }
        catch (error) {
            return reply.code(400).send({
                error: error.message,
            });
        }
    });
    fastify.post('/validate', {
        schema: {
            description: 'Validate a trained model',
            tags: ['Training'],
            body: zod_1.z.object({
                model_path: zod_1.z.string(),
                validation_dataset: zod_1.z.string(),
                metrics_to_compute: zod_1.z.array(zod_1.z.string()).optional(),
                batch_size: zod_1.z.number().min(1).optional(),
                max_samples: zod_1.z.number().min(1).optional(),
            }),
        },
    }, async (request, reply) => {
        try {
            const jobId = await aimlServices.modelLifecycleManager.validateModel(request.body);
            return reply.code(200).send({
                success: true,
                validation_job_id: jobId,
                message: 'Model validation started',
            });
        }
        catch (error) {
            return reply.code(400).send({
                error: error.message,
            });
        }
    });
    fastify.get('/metrics', {
        schema: {
            description: 'Get model lifecycle management metrics',
            tags: ['Training', 'Metrics'],
        },
    }, async (request, reply) => {
        try {
            const metrics = aimlServices.modelLifecycleManager.getServiceMetrics();
            return reply.code(200).send({
                success: true,
                metrics,
            });
        }
        catch (error) {
            return reply.code(400).send({
                error: error.message,
            });
        }
    });
}
//# sourceMappingURL=model-lifecycle.js.map