"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitoringRoutes = monitoringRoutes;
const tosMonitoring_1 = require("../services/tosMonitoring");
const changeDetection_1 = require("../services/changeDetection");
const documentCrawler_1 = require("../services/documentCrawler");
const scheduler_1 = require("../services/scheduler");
const mongoChangeStream_1 = require("../services/mongoChangeStream");
const tracing_1 = require("../monitoring/tracing");
const metrics_1 = require("../monitoring/metrics");
const createMonitoringJobSchema = {
    body: {
        type: 'object',
        required: ['documentId', 'url', 'userId', 'frequency'],
        properties: {
            documentId: { type: 'string' },
            url: { type: 'string', format: 'uri' },
            userId: { type: 'string' },
            teamId: { type: 'string' },
            frequency: { type: 'number', minimum: 300 },
            crawlConfig: {
                type: 'object',
                properties: {
                    userAgent: { type: 'string' },
                    timeout: { type: 'number' },
                    followRedirects: { type: 'boolean' },
                    respectRobotsTxt: { type: 'boolean' },
                },
            },
        },
    },
};
const updateMonitoringJobSchema = {
    params: {
        type: 'object',
        required: ['jobId'],
        properties: {
            jobId: { type: 'string' },
        },
    },
    body: {
        type: 'object',
        properties: {
            frequency: { type: 'number', minimum: 300 },
            isActive: { type: 'boolean' },
            crawlConfig: {
                type: 'object',
                properties: {
                    userAgent: { type: 'string' },
                    timeout: { type: 'number' },
                    followRedirects: { type: 'boolean' },
                    respectRobotsTxt: { type: 'boolean' },
                },
            },
        },
    },
};
const analyzeChangesSchema = {
    body: {
        type: 'object',
        required: ['oldContent', 'newContent', 'documentType'],
        properties: {
            oldContent: { type: 'string' },
            newContent: { type: 'string' },
            documentType: { type: 'string' },
            language: { type: 'string' },
        },
    },
};
async function monitoringRoutes(server) {
    server.post('/jobs', {
        schema: createMonitoringJobSchema,
    }, async (request, reply) => {
        const startTime = Date.now();
        try {
            const job = await tracing_1.TracingUtils.traceFunction('monitoring.create_job', async (span) => {
                span.setAttributes({
                    'document.id': request.body.documentId,
                    'document.url': request.body.url,
                    'user.id': request.body.userId,
                    'job.frequency': request.body.frequency,
                });
                return await tosMonitoring_1.tosMonitoringService.createMonitoringJob(request.body);
            });
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/monitoring/jobs', 201, Date.now() - startTime, request.body.userId);
            reply.code(201);
            return {
                success: true,
                data: job,
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/monitoring/jobs', 500, duration, request.body.userId);
            reply.code(500);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    });
    server.put('/jobs/:jobId', {
        schema: updateMonitoringJobSchema,
    }, async (request, reply) => {
        const startTime = Date.now();
        try {
            const job = await tracing_1.TracingUtils.traceFunction('monitoring.update_job', async (span) => {
                span.setAttributes({
                    'job.id': request.params.jobId,
                });
                return await tosMonitoring_1.tosMonitoringService.updateMonitoringJob(request.params.jobId, request.body);
            });
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/monitoring/jobs/:jobId', 200, Date.now() - startTime);
            return {
                success: true,
                data: job,
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/monitoring/jobs/:jobId', error instanceof Error && error.message.includes('not found') ? 404 : 500, duration);
            reply.code(error instanceof Error && error.message.includes('not found') ? 404 : 500);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    });
    server.delete('/jobs/:jobId', async (request, reply) => {
        const startTime = Date.now();
        try {
            await tracing_1.TracingUtils.traceFunction('monitoring.delete_job', async (span) => {
                span.setAttributes({
                    'job.id': request.params.jobId,
                });
                await tosMonitoring_1.tosMonitoringService.deleteMonitoringJob(request.params.jobId);
            });
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/monitoring/jobs/:jobId', 204, Date.now() - startTime);
            reply.code(204);
            return;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/monitoring/jobs/:jobId', error instanceof Error && error.message.includes('not found') ? 404 : 500, duration);
            reply.code(error instanceof Error && error.message.includes('not found') ? 404 : 500);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    });
    server.post('/jobs/:jobId/process', async (request, reply) => {
        const startTime = Date.now();
        try {
            await tracing_1.TracingUtils.traceFunction('monitoring.process_job', async (span) => {
                span.setAttributes({
                    'job.id': request.params.jobId,
                    'trigger': 'manual',
                });
                await tosMonitoring_1.tosMonitoringService.processMonitoringJob(request.params.jobId);
            });
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/monitoring/jobs/:jobId/process', 200, Date.now() - startTime);
            return {
                success: true,
                message: 'Job processing initiated',
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/monitoring/jobs/:jobId/process', 500, duration);
            reply.code(500);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    });
    server.post('/analyze-changes', {
        schema: analyzeChangesSchema,
    }, async (request, reply) => {
        const startTime = Date.now();
        try {
            const analysis = await tracing_1.TracingUtils.traceChangeDetection('manual-analysis', request.body.documentType, async (span) => {
                span.setAttributes({
                    'content.old_length': request.body.oldContent.length,
                    'content.new_length': request.body.newContent.length,
                    'document.type': request.body.documentType,
                    'language': request.body.language || 'unknown',
                });
                return await changeDetection_1.changeDetectionEngine.analyzeChanges(request.body);
            });
            const duration = Date.now() - startTime;
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/monitoring/analyze-changes', 200, duration);
            metrics_1.metricsCollector.recordChangeAnalysis(analysis.changeType, duration, request.body.documentType);
            return {
                success: true,
                data: analysis,
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/monitoring/analyze-changes', 500, duration);
            reply.code(500);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    });
    server.post('/test-crawl', async (request, reply) => {
        const startTime = Date.now();
        try {
            const result = await tracing_1.TracingUtils.traceDocumentCrawl(request.body.url, 'test-user', async (span) => {
                span.setAttributes({
                    'crawl.test': true,
                    'crawl.url': request.body.url,
                });
                return await documentCrawler_1.documentCrawlerService.crawlDocument(request.body.url, request.body.options);
            });
            const duration = Date.now() - startTime;
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/monitoring/test-crawl', 200, duration);
            metrics_1.metricsCollector.recordDocumentCrawl(result.success ? 'success' : 'failure', duration, 'test-user');
            return {
                success: true,
                data: result,
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/monitoring/test-crawl', 500, duration);
            reply.code(500);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    });
    server.get('/stats', async (request, reply) => {
        const startTime = Date.now();
        try {
            const [tosStats, schedulerStats, changeStreamStats,] = await Promise.all([
                tosMonitoring_1.tosMonitoringService.getMonitoringStats(),
                scheduler_1.schedulerService.getTaskStatus(),
                mongoChangeStream_1.mongoChangeStreamService.getConnectionStats(),
            ]);
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/monitoring/stats', 200, Date.now() - startTime);
            return {
                success: true,
                data: {
                    monitoring: tosStats,
                    scheduler: schedulerStats,
                    changeStreams: changeStreamStats,
                    timestamp: new Date().toISOString(),
                },
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/monitoring/stats', 500, duration);
            reply.code(500);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    });
    server.get('/documents/:documentId/versions', async (request, reply) => {
        const startTime = Date.now();
        try {
            const limit = request.query.limit ? parseInt(request.query.limit) : 10;
            const versions = await tracing_1.TracingUtils.traceFunction('monitoring.get_versions', async (span) => {
                span.setAttributes({
                    'document.id': request.params.documentId,
                    'query.limit': limit,
                });
                return await tosMonitoring_1.tosMonitoringService.getDocumentVersionHistory(request.params.documentId, limit);
            });
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/monitoring/documents/:documentId/versions', 200, Date.now() - startTime);
            return {
                success: true,
                data: versions,
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/monitoring/documents/:documentId/versions', 500, duration);
            reply.code(500);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    });
    server.get('/scheduler/tasks', async (request, reply) => {
        const startTime = Date.now();
        try {
            const tasks = scheduler_1.schedulerService.getAllTasks();
            const status = scheduler_1.schedulerService.getTaskStatus();
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/monitoring/scheduler/tasks', 200, Date.now() - startTime);
            return {
                success: true,
                data: {
                    tasks,
                    status,
                },
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/monitoring/scheduler/tasks', 500, duration);
            reply.code(500);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    });
    server.post('/scheduler/tasks/:taskId/run', async (request, reply) => {
        const startTime = Date.now();
        try {
            await tracing_1.TracingUtils.traceFunction('monitoring.run_task', async (span) => {
                span.setAttributes({
                    'task.id': request.params.taskId,
                    'trigger': 'manual',
                });
                await scheduler_1.schedulerService.runTaskNow(request.params.taskId);
            });
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/monitoring/scheduler/tasks/:taskId/run', 200, Date.now() - startTime);
            return {
                success: true,
                message: 'Task executed successfully',
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/monitoring/scheduler/tasks/:taskId/run', error instanceof Error && error.message.includes('not found') ? 404 : 500, duration);
            reply.code(error instanceof Error && error.message.includes('not found') ? 404 : 500);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    });
}
//# sourceMappingURL=monitoring.js.map