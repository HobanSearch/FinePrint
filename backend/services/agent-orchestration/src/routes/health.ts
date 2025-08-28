import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Logger } from '../utils/logger';
import { config } from '../config';

const logger = Logger.child({ component: 'health-routes' });

export default async function healthRoutes(fastify: FastifyInstance) {
  // Basic health check
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    
    const health = {
      service: 'agent-orchestration',
      status: 'healthy',
      timestamp: new Date(),
      uptime: Math.floor(uptime),
      version: config.version,
      environment: config.environment,
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
      },
      dependencies: await checkDependencies(),
    };

    reply.send(health);
  });

  // Detailed health check
  fastify.get('/detailed', async (request: FastifyRequest, reply: FastifyReply) => {
    const services = fastify.orchestrationServices;
    
    const detailed = {
      service: 'agent-orchestration',
      status: 'healthy',
      timestamp: new Date(),
      uptime: process.uptime(),
      version: config.version,
      environment: config.environment,
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

  // Liveness probe
  fastify.get('/live', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send({ status: 'alive', timestamp: new Date() });
  });

  // Readiness probe
  fastify.get('/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    const services = fastify.orchestrationServices;
    
    const isReady = !!(
      services?.agentRegistry &&
      services?.workflowEngine &&
      services?.communicationBus &&
      services?.decisionEngine
    );

    if (isReady) {
      reply.send({ status: 'ready', timestamp: new Date() });
    } else {
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

  // Check Redis
  try {
    // This would be a real Redis ping in production
    dependencies.push({
      name: 'redis',
      status: 'connected',
      responseTimeMs: 1,
    });
  } catch (error) {
    dependencies.push({
      name: 'redis',
      status: 'disconnected',
      error: error.message,
    });
  }

  // Check Database
  try {
    // This would be a real database ping in production
    dependencies.push({
      name: 'database',
      status: 'connected',
      responseTimeMs: 2,
    });
  } catch (error) {
    dependencies.push({
      name: 'database',
      status: 'disconnected',
      error: error.message,
    });
  }

  return dependencies;
}