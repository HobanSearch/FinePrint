"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = communicationRoutes;
const logger_1 = require("../utils/logger");
const logger = logger_1.Logger.child({ component: 'communication-routes' });
async function communicationRoutes(fastify) {
    const { communicationBus } = fastify.orchestrationServices;
    fastify.get('/stats', {
        schema: {
            tags: ['communication'],
            summary: 'Get communication bus statistics',
        },
    }, async (request, reply) => {
        try {
            const stats = {
                queues: communicationBus.getQueues().size,
                routes: communicationBus.getRoutes().size,
                channels: communicationBus.getChannels().size,
                totalMessages: communicationBus.getMetrics().size,
            };
            reply.send({
                success: true,
                data: stats,
            });
        }
        catch (error) {
            logger.error('Failed to get communication stats', { error: error.message });
            reply.status(500).send({
                success: false,
                error: 'Failed to retrieve communication statistics',
            });
        }
    });
    fastify.get('/metrics', {
        schema: {
            tags: ['communication'],
            summary: 'Get message metrics',
        },
    }, async (request, reply) => {
        try {
            const metrics = Array.from(communicationBus.getMetrics().values());
            reply.send({
                success: true,
                data: metrics,
            });
        }
        catch (error) {
            logger.error('Failed to get message metrics', { error: error.message });
            reply.status(500).send({
                success: false,
                error: 'Failed to retrieve message metrics',
            });
        }
    });
    fastify.post('/send', {
        schema: {
            tags: ['communication'],
            summary: 'Send a test message',
            body: {
                type: 'object',
                required: ['to', 'subject', 'payload'],
                properties: {
                    to: { type: 'string' },
                    subject: { type: 'string' },
                    payload: { type: 'object' },
                    type: { type: 'string' },
                    priority: { type: 'number' },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const { to, subject, payload, type = 'event', priority = 5 } = request.body;
            await communicationBus.publish({
                id: require('uuid').v4(),
                type: type,
                from: 'orchestration-api',
                to,
                subject,
                payload,
                timestamp: new Date(),
                priority: priority,
            });
            reply.send({
                success: true,
                message: 'Message sent successfully',
            });
        }
        catch (error) {
            logger.error('Failed to send message', { error: error.message });
            reply.status(400).send({
                success: false,
                error: error.message,
            });
        }
    });
}
//# sourceMappingURL=communication.js.map