import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { WorkflowDefinitionSchema } from '../types/workflow';
import { Logger } from '../utils/logger';

const logger = Logger.child({ component: 'workflow-routes' });

interface WorkflowParamsRequest extends FastifyRequest {
  params: {
    workflowId: string;
  };
}

interface ExecutionParamsRequest extends FastifyRequest {
  params: {
    executionId: string;
  };
}

export default async function workflowRoutes(fastify: FastifyInstance) {
  const { workflowEngine } = fastify.orchestrationServices;

  // Get all workflows
  fastify.get('/', {
    schema: {
      tags: ['workflows'],
      summary: 'Get all workflow definitions',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const workflows = workflowEngine.getAllWorkflows();
      
      reply.send({
        success: true,
        data: workflows,
      });
    } catch (error) {
      logger.error('Failed to get workflows', { error: error.message });
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve workflows',
      });
    }
  });

  // Create new workflow
  fastify.post('/', {
    schema: {
      tags: ['workflows'],
      summary: 'Create a new workflow',
      body: {
        type: 'object',
        required: ['name', 'tasks', 'trigger'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          version: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          trigger: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              config: { type: 'object' },
            },
          },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                agentType: { type: 'string' },
                requiredCapabilities: { type: 'array', items: { type: 'string' } },
                dependencies: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const definition = WorkflowDefinitionSchema.parse({
        id: require('uuid').v4(),
        ...request.body,
      });

      const workflowId = await workflowEngine.createWorkflow(definition);

      reply.status(201).send({
        success: true,
        data: { workflowId },
      });
    } catch (error) {
      logger.error('Failed to create workflow', { error: error.message });
      reply.status(400).send({
        success: false,
        error: error.message,
      });
    }
  });

  // Get specific workflow
  fastify.get('/:workflowId', {
    schema: {
      tags: ['workflows'],
      summary: 'Get workflow by ID',
      params: {
        type: 'object',
        properties: {
          workflowId: { type: 'string' },
        },
        required: ['workflowId'],
      },
    },
  }, async (request: WorkflowParamsRequest, reply: FastifyReply) => {
    try {
      const { workflowId } = request.params;
      const workflow = workflowEngine.getWorkflow(workflowId);

      if (!workflow) {
        return reply.status(404).send({
          success: false,
          error: 'Workflow not found',
        });
      }

      reply.send({
        success: true,
        data: workflow,
      });
    } catch (error) {
      logger.error('Failed to get workflow', { error: error.message });
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve workflow',
      });
    }
  });

  // Execute workflow
  fastify.post('/:workflowId/execute', {
    schema: {
      tags: ['workflows'],
      summary: 'Execute a workflow',
      params: {
        type: 'object',
        properties: {
          workflowId: { type: 'string' },
        },
        required: ['workflowId'],
      },
      body: {
        type: 'object',
        properties: {
          input: { type: 'object' },
          priority: { type: 'number', minimum: 1, maximum: 10 },
          triggeredBy: { type: 'string' },
        },
      },
    },
  }, async (request: WorkflowParamsRequest, reply: FastifyReply) => {
    try {
      const { workflowId } = request.params;
      const { input = {}, priority = 5, triggeredBy = 'api' } = request.body as any;

      const executionId = await workflowEngine.executeWorkflow(
        workflowId,
        input,
        triggeredBy,
        priority
      );

      reply.status(201).send({
        success: true,
        data: { executionId },
      });
    } catch (error) {
      logger.error('Failed to execute workflow', { error: error.message });
      reply.status(400).send({
        success: false,
        error: error.message,
      });
    }
  });

  // Get workflow executions
  fastify.get('/:workflowId/executions', {
    schema: {
      tags: ['workflows'],
      summary: 'Get workflow executions',
      params: {
        type: 'object',
        properties: {
          workflowId: { type: 'string' },
        },
        required: ['workflowId'],
      },
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 100 },
          offset: { type: 'number', minimum: 0 },
        },
      },
    },
  }, async (request: WorkflowParamsRequest, reply: FastifyReply) => {
    try {
      const { workflowId } = request.params;
      const { status, limit = 50, offset = 0 } = request.query as any;

      let executions = workflowEngine.getAllExecutions()
        .filter(exec => exec.workflowId === workflowId);

      if (status) {
        executions = executions.filter(exec => exec.status === status);
      }

      // Simple pagination
      const total = executions.length;
      const paginatedExecutions = executions
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .slice(offset, offset + limit);

      reply.send({
        success: true,
        data: paginatedExecutions,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      });
    } catch (error) {
      logger.error('Failed to get workflow executions', { error: error.message });
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve workflow executions',
      });
    }
  });

  // Get specific execution
  fastify.get('/executions/:executionId', {
    schema: {
      tags: ['workflows'],
      summary: 'Get execution by ID',
      params: {
        type: 'object',
        properties: {
          executionId: { type: 'string' },
        },
        required: ['executionId'],
      },
    },
  }, async (request: ExecutionParamsRequest, reply: FastifyReply) => {
    try {
      const { executionId } = request.params;
      const execution = workflowEngine.getExecution(executionId);

      if (!execution) {
        return reply.status(404).send({
          success: false,
          error: 'Execution not found',
        });
      }

      reply.send({
        success: true,
        data: execution,
      });
    } catch (error) {
      logger.error('Failed to get execution', { error: error.message });
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve execution',
      });
    }
  });

  // Cancel execution
  fastify.post('/executions/:executionId/cancel', {
    schema: {
      tags: ['workflows'],
      summary: 'Cancel a workflow execution',
      params: {
        type: 'object',
        properties: {
          executionId: { type: 'string' },
        },
        required: ['executionId'],
      },
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
        },
      },
    },
  }, async (request: ExecutionParamsRequest, reply: FastifyReply) => {
    try {
      const { executionId } = request.params;
      const { reason = 'Cancelled by user' } = request.body as any;

      await workflowEngine.cancelExecution(executionId, reason);

      reply.send({
        success: true,
        message: 'Execution cancelled successfully',
      });
    } catch (error) {
      logger.error('Failed to cancel execution', { error: error.message });
      reply.status(400).send({
        success: false,
        error: error.message,
      });
    }
  });

  // Get workflow metrics
  fastify.get('/:workflowId/metrics', {
    schema: {
      tags: ['workflows'],
      summary: 'Get workflow metrics',
      params: {
        type: 'object',
        properties: {
          workflowId: { type: 'string' },
        },
        required: ['workflowId'],
      },
    },
  }, async (request: WorkflowParamsRequest, reply: FastifyReply) => {
    try {
      const { workflowId } = request.params;
      const metrics = await workflowEngine.getWorkflowMetrics(workflowId);

      reply.send({
        success: true,
        data: metrics,
      });
    } catch (error) {
      logger.error('Failed to get workflow metrics', { error: error.message });
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve workflow metrics',
      });
    }
  });

  // Get all templates
  fastify.get('/templates', {
    schema: {
      tags: ['workflows'],
      summary: 'Get all workflow templates',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const templates = workflowEngine.getAllTemplates();
      
      reply.send({
        success: true,
        data: templates,
      });
    } catch (error) {
      logger.error('Failed to get templates', { error: error.message });
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve templates',
      });
    }
  });

  // Instantiate template
  fastify.post('/templates/:templateId/instantiate', {
    schema: {
      tags: ['workflows'],
      summary: 'Create workflow from template',
      params: {
        type: 'object',
        properties: {
          templateId: { type: 'string' },
        },
        required: ['templateId'],
      },
      body: {
        type: 'object',
        properties: {
          customizations: { type: 'object' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { templateId } = request.params as any;
      const { customizations = {} } = request.body as any;

      const workflowId = await workflowEngine.instantiateTemplate(templateId, customizations);

      reply.status(201).send({
        success: true,
        data: { workflowId },
      });
    } catch (error) {
      logger.error('Failed to instantiate template', { error: error.message });
      reply.status(400).send({
        success: false,
        error: error.message,
      });
    }
  });
}