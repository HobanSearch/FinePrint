/**
 * Memory API Routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { MemoryEntry, MemoryQuery } from '../services/memory-persistence-engine';

// Schema definitions
const MemoryEntrySchema = Type.Object({
  serviceId: Type.String(),
  agentId: Type.String(),
  memoryType: Type.Union([
    Type.Literal('working'),
    Type.Literal('episodic'),
    Type.Literal('semantic'),
    Type.Literal('procedural'),
    Type.Literal('business'),
  ]),
  domain: Type.String(),
  content: Type.Any(),
  metadata: Type.Object({
    timestamp: Type.String({ format: 'date-time' }),
    version: Type.Number(),
    tags: Type.Array(Type.String()),
    correlationId: Type.Optional(Type.String()),
    sessionId: Type.Optional(Type.String()),
    userId: Type.Optional(Type.String()),
    importance: Type.Number({ minimum: 0, maximum: 10 }),
    accessCount: Type.Number(),
    lastAccessed: Type.String({ format: 'date-time' }),
    expiresAt: Type.Optional(Type.String({ format: 'date-time' })),
  }),
  embeddings: Type.Optional(Type.Array(Type.Number())),
  relationships: Type.Object({
    relatedMemories: Type.Array(Type.String()),
    causedBy: Type.Optional(Type.String()),
    causes: Type.Optional(Type.Array(Type.String())),
  }),
});

const MemoryQuerySchema = Type.Object({
  serviceId: Type.Optional(Type.String()),
  agentId: Type.Optional(Type.String()),
  memoryType: Type.Optional(Type.String()),
  domain: Type.Optional(Type.String()),
  tags: Type.Optional(Type.Array(Type.String())),
  startDate: Type.Optional(Type.String({ format: 'date-time' })),
  endDate: Type.Optional(Type.String({ format: 'date-time' })),
  minImportance: Type.Optional(Type.Number()),
  searchText: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 1000 })),
  offset: Type.Optional(Type.Number({ minimum: 0 })),
});

const SimilaritySearchSchema = Type.Object({
  embeddings: Type.Array(Type.Number()),
  domain: Type.String(),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  threshold: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
});

type MemoryEntryInput = Static<typeof MemoryEntrySchema>;
type MemoryQueryInput = Static<typeof MemoryQuerySchema>;
type SimilaritySearchInput = Static<typeof SimilaritySearchSchema>;

export default async function memoryRoutes(fastify: FastifyInstance) {
  // Store a new memory
  fastify.post<{ Body: MemoryEntryInput }>(
    '/',
    {
      schema: {
        body: MemoryEntrySchema,
        response: {
          200: Type.Object({
            id: Type.String(),
            message: Type.String(),
          }),
        },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const memory = request.body;
      
      // Convert string dates to Date objects
      memory.metadata.timestamp = new Date(memory.metadata.timestamp);
      memory.metadata.lastAccessed = new Date(memory.metadata.lastAccessed);
      if (memory.metadata.expiresAt) {
        memory.metadata.expiresAt = new Date(memory.metadata.expiresAt);
      }

      const storedMemory = await fastify.memoryEngine.storeMemory(memory);

      // Sync with other services
      await fastify.crossServiceSync.syncMemory(storedMemory);

      return {
        id: storedMemory.id,
        message: 'Memory stored successfully',
      };
    }
  );

  // Get memory by ID
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        params: Type.Object({
          id: Type.String(),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const memory = await fastify.memoryEngine.getMemory(request.params.id);
      
      if (!memory) {
        return reply.code(404).send({ error: 'Memory not found' });
      }

      return memory;
    }
  );

  // Query memories
  fastify.post<{ Body: MemoryQueryInput }>(
    '/query',
    {
      schema: {
        body: MemoryQuerySchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const query: MemoryQuery = {
        ...request.body,
        startDate: request.body.startDate ? new Date(request.body.startDate) : undefined,
        endDate: request.body.endDate ? new Date(request.body.endDate) : undefined,
      };

      const memories = await fastify.memoryEngine.queryMemories(query);
      
      return {
        memories,
        total: memories.length,
      };
    }
  );

  // Search by similarity
  fastify.post<{ Body: SimilaritySearchInput }>(
    '/search/similarity',
    {
      schema: {
        body: SimilaritySearchSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { embeddings, domain, limit = 10, threshold = 0.7 } = request.body;

      const results = await fastify.memoryEngine.searchBySimilarity(
        embeddings,
        domain,
        limit,
        threshold
      );

      return {
        results,
        total: results.length,
      };
    }
  );

  // Get memory aggregations
  fastify.get<{
    Querystring: {
      serviceId: string;
      domain: string;
      startDate?: string;
      endDate?: string;
    };
  }>(
    '/aggregations',
    {
      schema: {
        querystring: Type.Object({
          serviceId: Type.String(),
          domain: Type.String(),
          startDate: Type.Optional(Type.String({ format: 'date-time' })),
          endDate: Type.Optional(Type.String({ format: 'date-time' })),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { serviceId, domain, startDate, endDate } = request.query;

      const timeRange = {
        start: startDate ? new Date(startDate) : new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: endDate ? new Date(endDate) : new Date(),
      };

      const aggregations = await fastify.memoryEngine.getMemoryAggregations(
        serviceId,
        domain,
        timeRange
      );

      return aggregations;
    }
  );

  // Create memory relationship
  fastify.post<{
    Body: {
      sourceId: string;
      targetId: string;
      relationshipType: 'causes' | 'references' | 'follows';
    };
  }>(
    '/relationships',
    {
      schema: {
        body: Type.Object({
          sourceId: Type.String(),
          targetId: Type.String(),
          relationshipType: Type.Union([
            Type.Literal('causes'),
            Type.Literal('references'),
            Type.Literal('follows'),
          ]),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { sourceId, targetId, relationshipType } = request.body;

      await fastify.memoryEngine.createMemoryRelationship(
        sourceId,
        targetId,
        relationshipType
      );

      return {
        message: 'Relationship created successfully',
      };
    }
  );

  // Get related memories
  fastify.get<{
    Params: { id: string };
    Querystring: {
      relationshipType?: string;
      depth?: string;
    };
  }>(
    '/:id/related',
    {
      schema: {
        params: Type.Object({
          id: Type.String(),
        }),
        querystring: Type.Object({
          relationshipType: Type.Optional(Type.String()),
          depth: Type.Optional(Type.String()),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { id } = request.params;
      const { relationshipType, depth } = request.query;

      const relatedMemories = await fastify.memoryEngine.getRelatedMemories(
        id,
        relationshipType,
        depth ? parseInt(depth) : 1
      );

      return {
        memories: relatedMemories,
        total: relatedMemories.length,
      };
    }
  );

  // Archive old memories (admin only)
  fastify.post(
    '/archive',
    {
      preHandler: [fastify.authenticate, fastify.authorize(['admin'])],
    },
    async (request, reply) => {
      const archivedCount = await fastify.memoryEngine.archiveOldMemories();

      return {
        message: 'Archival process completed',
        archivedCount,
      };
    }
  );
}