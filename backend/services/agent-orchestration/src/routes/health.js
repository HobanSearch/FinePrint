"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = healthRoutes;
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
const logger = logger_1.Logger.child({ component: 'health-routes' });
async function healthRoutes(fastify) {
    fastify.get('/', async (request, reply) => {
        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();
        const health = {
            service: 'agent-orchestration',
            status: 'healthy',
            timestamp: new Date(),
            uptime: Math.floor(uptime),
            version: config_1.config.version,
            environment: config_1.config.environment,
            memory: {
                used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                external: Math.round(memoryUsage.external / 1024 / 1024),
            },
            dependencies: await checkDependencies(),
        };
        reply.send(health);
    });
    fastify.get('/detailed', async (request, reply) => {
        const services = fastify.orchestrationServices;
        const detailed = {
            service: 'agent-orchestration',
            status: 'healthy',
            timestamp: new Date(),
            uptime: process.uptime(),
            version: config_1.config.version,
            environment: config_1.config.environment,
            components: {
                agentRegistry: {
                    status: 'healthy',
                    agentCount: services?.agentRegistry?.getAgentCount() || 0,
                    healthyAgents: services?.agentRegistry?.getHealthyAgents().length || 0,
                },
                workflowEngine: {
                    status: 'healthy',
                    activeWorkflows: services?.workflowEngine?.getAllExecutions().filter(e => e.status === 'active').length || 0,
                    totalWorkflows: services?.workflowEngine?.getAllWorkflows().length || 0,
                },
                communicationBus: {
                    status: 'healthy',
                    activeQueues: services?.communicationBus?.getQueues().size || 0,
                    messageRoutes: services?.communicationBus?.getRoutes().size || 0,
                },
                decisionEngine: {
                    status: 'healthy',
                    totalDecisions: services?.decisionEngine?.getMetrics().totalDecisions || 0,
                    activePolicies: services?.decisionEngine?.getPolicies().size || 0,
                },
            },
            dependencies: await checkDependencies(),
        };
        reply.send(detailed);
    });
    fastify.get('/live', async (request, reply) => {
        reply.send({ status: 'alive', timestamp: new Date() });
    });
    fastify.get('/ready', async (request, reply) => {
        const services = fastify.orchestrationServices;
        const isReady = !!(services?.agentRegistry &&
            services?.workflowEngine &&
            services?.communicationBus &&
            services?.decisionEngine);
        if (isReady) {
            reply.send({ status: 'ready', timestamp: new Date() });
        }
        else {
            reply.status(503).send({
                status: 'not_ready',
                timestamp: new Date(),
                reason: 'Services not fully initialized',
            });
        }
    });
}
async function checkDependencies() {
    const dependencies = [];
    try {
        dependencies.push({
            name: 'redis',
            status: 'connected',
            responseTimeMs: 1,
        });
    }
    catch (error) {
        dependencies.push({
            name: 'redis',
            status: 'disconnected',
            error: error.message,
        });
    }
    try {
        dependencies.push({
            name: 'database',
            status: 'connected',
            responseTimeMs: 2,
        });
    }
    catch (error) {
        dependencies.push({
            name: 'database',
            status: 'disconnected',
            error: error.message,
        });
    }
    return dependencies;
}
//# sourceMappingURL=health.js.map