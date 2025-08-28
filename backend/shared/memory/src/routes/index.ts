/**
 * Memory Service API Routes
 * RESTful API endpoints for memory management
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MemoryService } from '../services/memory-service';
import { 
  CreateMemoryInput,
  UpdateMemoryInput,
  MemoryFilter,
  VectorSearchConfig,
  APIResponse,
  MemorySearchResponse,
  CreateMemorySchema,
  UpdateMemorySchema,
  MemoryFilterSchema
} from '../types';

export async function memoryRoutes(fastify: FastifyInstance) {
  const memoryService = fastify.memoryService as MemoryService;

  // Create memory
  fastify.post<{
    Body: CreateMemoryInput;
    Headers: { 'x-agent-id': string };
  }>('/memories', {
    schema: {
      body: CreateMemorySchema,
      headers: {
        type: 'object',
        properties: {
          'x-agent-id': { type: 'string' },
        },
        required: ['x-agent-id'],
      },
    },
  }, async (request, reply) => {
    try {
      const agentId = request.headers['x-agent-id'];
      const memoryId = await memoryService.createMemory({
        ...request.body,
        agentId,
      });

      const response: APIResponse<{ id: string }> = {
        success: true,
        data: { id: memoryId },
      };

      reply.status(201).send(response);
    } catch (error) {
      const response: APIResponse<null> = {
        success: false,
        error: {
          code: error.code || 'MEMORY_CREATE_FAILED',
          message: error.message,
        },
      };
      reply.status(error.statusCode || 500).send(response);
    }
  });

  // Get memory by ID
  fastify.get<{
    Params: { id: string };
    Headers: { 'x-agent-id': string };
  }>('/memories/:id', async (request, reply) => {
    try {
      const agentId = request.headers['x-agent-id'];
      const memory = await memoryService.retrieveMemory(
        request.params.id,
        agentId
      );

      if (!memory) {
        const response: APIResponse<null> = {
          success: false,
          error: {
            code: 'MEMORY_NOT_FOUND',
            message: 'Memory not found',
          },
        };
        reply.status(404).send(response);
        return;
      }

      const response: APIResponse<typeof memory> = {
        success: true,
        data: memory,
      };

      reply.send(response);
    } catch (error) {
      const response: APIResponse<null> = {
        success: false,
        error: {
          code: error.code || 'MEMORY_RETRIEVE_FAILED',
          message: error.message,
        },
      };
      reply.status(error.statusCode || 500).send(response);
    }
  });

  // Update memory
  fastify.put<{
    Params: { id: string };
    Body: UpdateMemoryInput;
    Headers: { 'x-agent-id': string };
  }>('/memories/:id', {
    schema: {
      body: UpdateMemorySchema,
    },
  }, async (request, reply) => {
    try {
      const agentId = request.headers['x-agent-id'];
      await memoryService.updateMemory(
        request.params.id,
        request.body,
        agentId
      );

      const response: APIResponse<{ success: boolean }> = {
        success: true,
        data: { success: true },
      };

      reply.send(response);
    } catch (error) {
      const response: APIResponse<null> = {
        success: false,
        error: {
          code: error.code || 'MEMORY_UPDATE_FAILED',
          message: error.message,
        },
      };
      reply.status(error.statusCode || 500).send(response);
    }
  });

  // Delete memory
  fastify.delete<{
    Params: { id: string };
    Headers: { 'x-agent-id': string };
  }>('/memories/:id', async (request, reply) => {
    try {
      const agentId = request.headers['x-agent-id'];
      await memoryService.deleteMemory(request.params.id, agentId);

      const response: APIResponse<{ success: boolean }> = {
        success: true,
        data: { success: true },
      };

      reply.send(response);
    } catch (error) {
      const response: APIResponse<null> = {
        success: false,
        error: {
          code: error.code || 'MEMORY_DELETE_FAILED',
          message: error.message,
        },
      };
      reply.status(error.statusCode || 500).send(response);
    }
  });

  // Search memories
  fastify.post<{
    Body: {
      filters: MemoryFilter;
      options?: {
        page?: number;
        pageSize?: number;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        includeShared?: boolean;
      };
    };
    Headers: { 'x-agent-id': string };
  }>('/memories/search', {
    schema: {
      body: {
        type: 'object',
        properties: {
          filters: MemoryFilterSchema,
          options: {
            type: 'object',
            properties: {
              page: { type: 'integer', minimum: 1 },
              pageSize: { type: 'integer', minimum: 1, maximum: 100 },
              sortBy: { type: 'string' },
              sortOrder: { type: 'string', enum: ['asc', 'desc'] },
              includeShared: { type: 'boolean' },
            },
          },
        },
        required: ['filters'],
      },
    },
  }, async (request, reply) => {
    try {
      const agentId = request.headers['x-agent-id'];
      const result = await memoryService.searchMemories(
        request.body.filters,
        agentId,
        request.body.options
      );

      const response: MemorySearchResponse = {
        success: true,
        data: result.results,
        metadata: {
          totalResults: result.total,
          searchTime: result.metadata.responseTime,
          usedIndex: true,
          queryOptimized: true,
        },
      };

      reply.send(response);
    } catch (error) {
      const response: APIResponse<null> = {
        success: false,
        error: {
          code: error.code || 'MEMORY_SEARCH_FAILED',
          message: error.message,
        },
      };
      reply.status(error.statusCode || 500).send(response);
    }
  });

  // Vector similarity search
  fastify.post<{
    Body: {
      query: string;
      config: VectorSearchConfig;
      filters?: MemoryFilter;
    };
    Headers: { 'x-agent-id': string };
  }>('/memories/vector-search', async (request, reply) => {
    try {
      const agentId = request.headers['x-agent-id'];
      const results = await memoryService.vectorSearch(
        request.body.query,
        agentId,
        request.body.config,
        request.body.filters
      );

      const response: APIResponse<typeof results> = {
        success: true,
        data: results,
      };

      reply.send(response);
    } catch (error) {
      const response: APIResponse<null> = {
        success: false,
        error: {
          code: error.code || 'VECTOR_SEARCH_FAILED',
          message: error.message,
        },
      };
      reply.status(error.statusCode || 500).send(response);
    }
  });

  // Share memory
  fastify.post<{
    Params: { id: string };
    Body: {
      targetAgentId: string;
      permissions: {
        canRead: boolean;
        canWrite: boolean;
        canDelete: boolean;
        canShare: boolean;
      };
      validUntil?: string;
      reason?: string;
    };
    Headers: { 'x-agent-id': string };
  }>('/memories/:id/share', async (request, reply) => {
    try {
      const agentId = request.headers['x-agent-id'];
      await memoryService.shareMemory(
        request.params.id,
        agentId,
        request.body.targetAgentId,
        request.body.permissions,
        {
          validUntil: request.body.validUntil ? new Date(request.body.validUntil) : undefined,
          reason: request.body.reason,
        }
      );

      const response: APIResponse<{ success: boolean }> = {
        success: true,
        data: { success: true },
      };

      reply.send(response);
    } catch (error) {
      const response: APIResponse<null> = {
        success: false,
        error: {
          code: error.code || 'MEMORY_SHARE_FAILED',
          message: error.message,
        },
      };
      reply.status(error.statusCode || 500).send(response);
    }
  });

  // Get agent memory statistics
  fastify.get<{
    Headers: { 'x-agent-id': string };
  }>('/memories/stats', async (request, reply) => {
    try {
      const agentId = request.headers['x-agent-id'];
      const stats = await memoryService.getAgentMemoryStats(agentId);

      const response: APIResponse<typeof stats> = {
        success: true,
        data: stats,
      };

      reply.send(response);
    } catch (error) {
      const response: APIResponse<null> = {
        success: false,
        error: {
          code: error.code || 'STATS_FAILED',
          message: error.message,
        },
      };
      reply.status(error.statusCode || 500).send(response);
    }
  });

  // Health check
  fastify.get('/health', async (request, reply) => {
    try {
      const health = await memoryService.healthCheck();

      if (health.healthy) {
        reply.send(health);
      } else {
        reply.status(503).send(health);
      }
    } catch (error) {
      reply.status(503).send({
        healthy: false,
        error: error.message,
      });
    }
  });
}