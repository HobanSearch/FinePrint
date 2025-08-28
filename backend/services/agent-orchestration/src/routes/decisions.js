"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = decisionRoutes;
const logger_1 = require("../utils/logger");
const logger = logger_1.Logger.child({ component: 'decision-routes' });
async function decisionRoutes(fastify) {
    const { decisionEngine } = fastify.orchestrationServices;
    fastify.get('/metrics', {
        schema: {
            tags: ['decisions'],
            summary: 'Get decision engine metrics',
        },
    }, async (request, reply) => {
        try {
            const metrics = decisionEngine.getMetrics();
            reply.send({
                success: true,
                data: metrics,
            });
        }
        catch (error) {
            logger.error('Failed to get decision metrics', { error: error.message });
            reply.status(500).send({
                success: false,
                error: 'Failed to retrieve decision metrics',
            });
        }
    });
    fastify.get('/policies', {
        schema: {
            tags: ['decisions'],
            summary: 'Get all decision policies',
        },
    }, async (request, reply) => {
        try {
            const policies = Array.from(decisionEngine.getPolicies().values());
            reply.send({
                success: true,
                data: policies,
            });
        }
        catch (error) {
            logger.error('Failed to get decision policies', { error: error.message });
            reply.status(500).send({
                success: false,
                error: 'Failed to retrieve decision policies',
            });
        }
    });
    fastify.post('/make', {
        schema: {
            tags: ['decisions'],
            summary: 'Make a decision',
            body: {
                type: 'object',
                required: ['type', 'options', 'criteria'],
                properties: {
                    type: { type: 'string' },
                    strategy: { type: 'string' },
                    options: { type: 'array' },
                    criteria: { type: 'array' },
                    constraints: { type: 'array' },
                    context: { type: 'object' },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const requestData = {
                id: require('uuid').v4(),
                timeout: 30000,
                metadata: {},
                createdAt: new Date(),
                ...request.body,
            };
            const result = await decisionEngine.makeDecision(requestData);
            reply.send({
                success: true,
                data: result,
            });
        }
        catch (error) {
            logger.error('Failed to make decision', { error: error.message });
            reply.status(400).send({
                success: false,
                error: error.message,
            });
        }
    });
    fastify.get('/audit/:requestId', {
        schema: {
            tags: ['decisions'],
            summary: 'Get decision audit log',
            params: {
                type: 'object',
                properties: {
                    requestId: { type: 'string' },
                },
                required: ['requestId'],
            },
        },
    }, async (request, reply) => {
        try {
            const { requestId } = request.params;
            const auditLog = decisionEngine.getAuditLog(requestId);
            reply.send({
                success: true,
                data: auditLog,
            });
        }
        catch (error) {
            logger.error('Failed to get audit log', { error: error.message });
            reply.status(500).send({
                success: false,
                error: 'Failed to retrieve audit log',
            });
        }
    });
}
//# sourceMappingURL=decisions.js.map