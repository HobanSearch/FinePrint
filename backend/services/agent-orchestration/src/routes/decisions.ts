import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Logger } from '../utils/logger';

const logger = Logger.child({ component: 'decision-routes' });

export default async function decisionRoutes(fastify: FastifyInstance) {
  const { decisionEngine } = fastify.orchestrationServices;

  // Get decision metrics
  fastify.get('/metrics', {
    schema: {
      tags: ['decisions'],
      summary: 'Get decision engine metrics',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = decisionEngine.getMetrics();

      reply.send({
        success: true,
        data: metrics,
      });
    } catch (error) {
      logger.error('Failed to get decision metrics', { error: error.message });
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve decision metrics',
      });
    }
  });

  // Get decision policies
  fastify.get('/policies', {
    schema: {
      tags: ['decisions'],
      summary: 'Get all decision policies',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const policies = Array.from(decisionEngine.getPolicies().values());

      reply.send({
        success: true,
        data: policies,
      });
    } catch (error) {
      logger.error('Failed to get decision policies', { error: error.message });
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve decision policies',
      });
    }
  });

  // Make a decision (for testing)
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
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const requestData = {
        id: require('uuid').v4(),
        timeout: 30000,
        metadata: {},
        createdAt: new Date(),
        ...request.body,
      } as any;

      const result = await decisionEngine.makeDecision(requestData);

      reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to make decision', { error: error.message });
      reply.status(400).send({
        success: false,
        error: error.message,
      });
    }
  });

  // Get audit log
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
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { requestId } = request.params as any;
      const auditLog = decisionEngine.getAuditLog(requestId);

      reply.send({
        success: true,
        data: auditLog,
      });
    } catch (error) {
      logger.error('Failed to get audit log', { error: error.message });
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve audit log',
      });
    }
  });
}