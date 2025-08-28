"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookRoutes = webhookRoutes;
const webhookService_1 = require("../services/webhookService");
const tracing_1 = require("../monitoring/tracing");
const metrics_1 = require("../monitoring/metrics");
const createWebhookSchema = {
    body: {
        type: 'object',
        required: ['userId', 'url', 'events'],
        properties: {
            userId: { type: 'string' },
            teamId: { type: 'string' },
            url: { type: 'string', format: 'uri' },
            secret: { type: 'string' },
            events: {
                type: 'array',
                items: {
                    type: 'string',
                    enum: [
                        'document.change.detected',
                        'document.risk.increased',
                        'document.risk.decreased',
                        'monitoring.error',
                        'monitoring.resumed',
                        'analysis.completed'
                    ]
                },
                minItems: 1,
            },
            headers: {
                type: 'object',
                additionalProperties: { type: 'string' },
            },
        },
    },
};
const updateWebhookSchema = {
    params: {
        type: 'object',
        required: ['webhookId'],
        properties: {
            webhookId: { type: 'string' },
        },
    },
    body: {
        type: 'object',
        properties: {
            url: { type: 'string', format: 'uri' },
            secret: { type: 'string' },
            events: {
                type: 'array',
                items: { type: 'string' },
            },
            isActive: { type: 'boolean' },
            headers: {
                type: 'object',
                additionalProperties: { type: 'string' },
            },
        },
    },
};
async function webhookRoutes(server) {
    server.post('/', {
        schema: createWebhookSchema,
    }, async (request, reply) => {
        const startTime = Date.now();
        try {
            const webhook = await tracing_1.TracingUtils.traceFunction('webhook.create', async (span) => {
                span.setAttributes({
                    'webhook.url': request.body.url,
                    'webhook.events': request.body.events.join(','),
                    'user.id': request.body.userId,
                });
                return await webhookService_1.webhookService.createWebhookEndpoint(request.body);
            });
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/webhooks', 201, Date.now() - startTime, request.body.userId);
            reply.code(201);
            return {
                success: true,
                data: webhook,
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/webhooks', 500, duration, request.body.userId);
            reply.code(500);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    });
    server.put('/:webhookId', {
        schema: updateWebhookSchema,
    }, async (request, reply) => {
        const startTime = Date.now();
        try {
            const webhook = await tracing_1.TracingUtils.traceFunction('webhook.update', async (span) => {
                span.setAttributes({
                    'webhook.id': request.params.webhookId,
                });
                return await webhookService_1.webhookService.updateWebhookEndpoint(request.params.webhookId, request.body);
            });
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/webhooks/:webhookId', 200, Date.now() - startTime);
            return {
                success: true,
                data: webhook,
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/webhooks/:webhookId', statusCode, duration);
            reply.code(statusCode);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    });
    server.delete('/:webhookId', async (request, reply) => {
        const startTime = Date.now();
        try {
            await tracing_1.TracingUtils.traceFunction('webhook.delete', async (span) => {
                span.setAttributes({
                    'webhook.id': request.params.webhookId,
                });
                await webhookService_1.webhookService.deleteWebhookEndpoint(request.params.webhookId);
            });
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/webhooks/:webhookId', 204, Date.now() - startTime);
            reply.code(204);
            return;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/webhooks/:webhookId', statusCode, duration);
            reply.code(statusCode);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    });
    server.post('/:webhookId/test', async (request, reply) => {
        const startTime = Date.now();
        try {
            const testResult = await tracing_1.TracingUtils.traceWebhookDelivery(request.params.webhookId, 'webhook.test', 'test', async (span) => {
                span.setAttributes({
                    'webhook.id': request.params.webhookId,
                    'webhook.test': true,
                });
                return await webhookService_1.webhookService.testWebhookEndpoint(request.params.webhookId);
            });
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/webhooks/:webhookId/test', 200, Date.now() - startTime);
            metrics_1.metricsCollector.recordWebhookDelivery(testResult.success ? 'success' : 'failure', testResult.responseTime, request.params.webhookId, 'webhook.test');
            return {
                success: true,
                data: testResult,
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/webhooks/:webhookId/test', statusCode, duration);
            reply.code(statusCode);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    });
    server.get('/stats', async (request, reply) => {
        const startTime = Date.now();
        try {
            const stats = await webhookService_1.webhookService.getWebhookStats();
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/webhooks/stats', 200, Date.now() - startTime);
            return {
                success: true,
                data: stats,
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            metrics_1.metricsCollector.recordHttpRequest(request.method, '/api/v1/webhooks/stats', 500, duration);
            reply.code(500);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    });
}
//# sourceMappingURL=webhooks.js.map