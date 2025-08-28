"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = agentRoutes;
const agent_1 = require("../types/agent");
const logger_1 = require("../utils/logger");
const logger = logger_1.Logger.child({ component: 'agent-routes' });
async function agentRoutes(fastify) {
    const { agentRegistry } = fastify.orchestrationServices;
    fastify.get('/', {
        schema: {
            tags: ['agents'],
            summary: 'Get all registered agents',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string' },
                                    type: { type: 'string' },
                                    name: { type: 'string' },
                                    status: { type: 'string' },
                                    currentLoad: { type: 'number' },
                                    capabilities: { type: 'array', items: { type: 'string' } },
                                },
                            },
                        },
                    },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const agents = agentRegistry.getAllAgents();
            reply.send({
                success: true,
                data: agents.map(agent => ({
                    id: agent.id,
                    type: agent.registration.type,
                    name: agent.registration.name,
                    status: agent.status,
                    currentLoad: agent.currentLoad,
                    capabilities: agent.registration.capabilities,
                    endpoint: agent.registration.endpoint,
                    lastHealthCheck: agent.lastHealthCheck,
                    activeTaskCount: agent.activeTaskCount,
                    completedTaskCount: agent.completedTaskCount,
                })),
            });
        }
        catch (error) {
            logger.error('Failed to get agents', { error: error.message });
            reply.status(500).send({
                success: false,
                error: 'Failed to retrieve agents',
            });
        }
    });
    fastify.post('/', {
        schema: {
            tags: ['agents'],
            summary: 'Register a new agent',
            body: {
                type: 'object',
                required: ['type', 'name', 'capabilities', 'endpoint'],
                properties: {
                    type: { type: 'string' },
                    name: { type: 'string' },
                    version: { type: 'string' },
                    capabilities: { type: 'array', items: { type: 'string' } },
                    endpoint: { type: 'string', format: 'uri' },
                    healthCheckPath: { type: 'string' },
                    priority: { type: 'number', minimum: 1, maximum: 10 },
                    maxConcurrentTasks: { type: 'number', minimum: 1 },
                    timeout: { type: 'number', minimum: 1000 },
                },
            },
            response: {
                201: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'object',
                            properties: {
                                agentId: { type: 'string' },
                            },
                        },
                    },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const registration = agent_1.AgentRegistrationSchema.parse({
                id: require('uuid').v4(),
                ...request.body,
            });
            const agentId = await agentRegistry.registerAgent(registration);
            reply.status(201).send({
                success: true,
                data: { agentId },
            });
        }
        catch (error) {
            logger.error('Failed to register agent', { error: error.message });
            reply.status(400).send({
                success: false,
                error: error.message,
            });
        }
    });
    fastify.get('/:agentId', {
        schema: {
            tags: ['agents'],
            summary: 'Get agent by ID',
            params: {
                type: 'object',
                properties: {
                    agentId: { type: 'string' },
                },
                required: ['agentId'],
            },
        },
    }, async (request, reply) => {
        try {
            const { agentId } = request.params;
            const agent = agentRegistry.getAgent(agentId);
            if (!agent) {
                return reply.status(404).send({
                    success: false,
                    error: 'Agent not found',
                });
            }
            reply.send({
                success: true,
                data: agent,
            });
        }
        catch (error) {
            logger.error('Failed to get agent', { error: error.message });
            reply.status(500).send({
                success: false,
                error: 'Failed to retrieve agent',
            });
        }
    });
    fastify.delete('/:agentId', {
        schema: {
            tags: ['agents'],
            summary: 'Unregister an agent',
            params: {
                type: 'object',
                properties: {
                    agentId: { type: 'string' },
                },
                required: ['agentId'],
            },
        },
    }, async (request, reply) => {
        try {
            const { agentId } = request.params;
            await agentRegistry.unregisterAgent(agentId);
            reply.send({
                success: true,
                message: 'Agent unregistered successfully',
            });
        }
        catch (error) {
            logger.error('Failed to unregister agent', { error: error.message });
            reply.status(400).send({
                success: false,
                error: error.message,
            });
        }
    });
    fastify.get('/:agentId/metrics', {
        schema: {
            tags: ['agents'],
            summary: 'Get agent metrics',
            params: {
                type: 'object',
                properties: {
                    agentId: { type: 'string' },
                },
                required: ['agentId'],
            },
        },
    }, async (request, reply) => {
        try {
            const { agentId } = request.params;
            const metrics = agentRegistry.getAgentMetrics(agentId);
            reply.send({
                success: true,
                data: metrics,
            });
        }
        catch (error) {
            logger.error('Failed to get agent metrics', { error: error.message });
            reply.status(500).send({
                success: false,
                error: 'Failed to retrieve agent metrics',
            });
        }
    });
    fastify.post('/search', {
        schema: {
            tags: ['agents'],
            summary: 'Find agents by criteria',
            body: {
                type: 'object',
                properties: {
                    type: { type: 'string' },
                    capabilities: { type: 'array', items: { type: 'string' } },
                    status: {
                        oneOf: [
                            { type: 'string' },
                            { type: 'array', items: { type: 'string' } },
                        ],
                    },
                    minLoad: { type: 'number' },
                    maxLoad: { type: 'number' },
                    tags: { type: 'array', items: { type: 'string' } },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const criteria = request.body;
            const agents = await agentRegistry.findAgents(criteria);
            reply.send({
                success: true,
                data: agents.map(agent => ({
                    id: agent.id,
                    type: agent.registration.type,
                    name: agent.registration.name,
                    status: agent.status,
                    currentLoad: agent.currentLoad,
                    capabilities: agent.registration.capabilities,
                })),
            });
        }
        catch (error) {
            logger.error('Failed to search agents', { error: error.message });
            reply.status(500).send({
                success: false,
                error: 'Failed to search agents',
            });
        }
    });
    fastify.get('/stats', {
        schema: {
            tags: ['agents'],
            summary: 'Get agent statistics',
        },
    }, async (request, reply) => {
        try {
            const stats = agentRegistry.getAgentStats();
            reply.send({
                success: true,
                data: stats,
            });
        }
        catch (error) {
            logger.error('Failed to get agent stats', { error: error.message });
            reply.status(500).send({
                success: false,
                error: 'Failed to retrieve agent statistics',
            });
        }
    });
}
//# sourceMappingURL=agents.js.map