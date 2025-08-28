/**
 * Memory Service Unit Tests
 */

import { MemoryService } from '../src/services/memory-service';
import { MemoryEntry, MemoryType } from '../src/types/memory.types';
import Redis from 'ioredis-mock';
import { Pool } from 'pg';
import { S3Client } from '@aws-sdk/client-s3';

// Mock dependencies
jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('pg');
jest.mock('@aws-sdk/client-s3');

const mockPool = {
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn(),
};

const mockS3Client = {
  send: jest.fn(),
};

describe('MemoryService', () => {
  let memoryService: MemoryService;
  let redisClient: Redis;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create service instance
    redisClient = new Redis();
    (Pool as jest.MockedClass<typeof Pool>).mockImplementation(() => mockPool as any);
    (S3Client as jest.MockedClass<typeof S3Client>).mockImplementation(() => mockS3Client as any);
    
    memoryService = new MemoryService({
      redis: redisClient,
      postgres: mockPool as any,
      s3: mockS3Client as any,
    });
  });

  afterEach(async () => {
    await redisClient.flushall();
    redisClient.disconnect();
  });

  describe('Memory Storage', () => {
    it('should store memory in appropriate tier', async () => {
      const memory: MemoryEntry = {
        id: 'mem_123',
        agentId: 'agent_123',
        type: MemoryType.SHORT_TERM,
        content: 'User prefers email communication',
        timestamp: new Date(),
        metadata: {
          userId: 'user_123',
          source: 'conversation',
          confidence: 0.9,
        },
      };

      await memoryService.store(memory);

      // Should store in Redis (hot tier)
      const stored = await redisClient.get(`memory:${memory.id}`);
      expect(stored).toBeTruthy();
      
      const parsed = JSON.parse(stored!);
      expect(parsed.content).toBe(memory.content);
    });

    it('should retrieve memory by ID', async () => {
      const memory: MemoryEntry = {
        id: 'mem_456',
        agentId: 'agent_123',
        type: MemoryType.EPISODIC,
        content: 'Customer complained about pricing',
        timestamp: new Date(),
        metadata: {
          userId: 'user_456',
          sentiment: 'negative',
        },
      };

      await memoryService.store(memory);
      const retrieved = await memoryService.retrieve(memory.id);

      expect(retrieved).toBeTruthy();
      expect(retrieved?.content).toBe(memory.content);
      expect(retrieved?.metadata.sentiment).toBe('negative');
    });

    it('should search memories by agent', async () => {
      // Store multiple memories
      await memoryService.store({
        id: 'mem_1',
        agentId: 'agent_123',
        type: MemoryType.SHORT_TERM,
        content: 'Memory 1',
        timestamp: new Date(),
        metadata: {},
      });

      await memoryService.store({
        id: 'mem_2',
        agentId: 'agent_123',
        type: MemoryType.SHORT_TERM,
        content: 'Memory 2',
        timestamp: new Date(),
        metadata: {},
      });

      await memoryService.store({
        id: 'mem_3',
        agentId: 'agent_456',
        type: MemoryType.SHORT_TERM,
        content: 'Memory 3',
        timestamp: new Date(),
        metadata: {},
      });

      const memories = await memoryService.search({
        agentId: 'agent_123',
      });

      expect(memories).toHaveLength(2);
      expect(memories.map(m => m.content)).toContain('Memory 1');
      expect(memories.map(m => m.content)).toContain('Memory 2');
    });

    it('should handle memory type-specific storage', async () => {
      const workingMemory: MemoryEntry = {
        id: 'wm_123',
        agentId: 'agent_123',
        type: MemoryType.WORKING,
        content: 'Current task context',
        timestamp: new Date(),
        metadata: {
          ttl: 300, // 5 minutes
        },
      };

      await memoryService.store(workingMemory);

      // Should be in Redis with TTL
      const ttl = await redisClient.ttl(`memory:${workingMemory.id}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(300);
    });
  });

  describe('Memory Lifecycle', () => {
    it('should promote memory from hot to warm tier', async () => {
      const memory: MemoryEntry = {
        id: 'mem_promote',
        agentId: 'agent_123',
        type: MemoryType.LONG_TERM,
        content: 'Important business rule',
        timestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days old
        metadata: {},
      };

      // Mock PostgreSQL response
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await memoryService.promoteToWarm(memory);

      // Should be stored in PostgreSQL
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO memories'),
        expect.any(Array)
      );
    });

    it('should archive memory to cold tier', async () => {
      const memory: MemoryEntry = {
        id: 'mem_archive',
        agentId: 'agent_123',
        type: MemoryType.SEMANTIC,
        content: 'Historical data',
        timestamp: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // 35 days old
        metadata: {},
      };

      // Mock S3 response
      mockS3Client.send.mockResolvedValueOnce({});

      await memoryService.archiveToCold(memory);

      // Should be stored in S3
      expect(mockS3Client.send).toHaveBeenCalled();
    });

    it('should update memory', async () => {
      const memory: MemoryEntry = {
        id: 'mem_update',
        agentId: 'agent_123',
        type: MemoryType.SHORT_TERM,
        content: 'Original content',
        timestamp: new Date(),
        metadata: { version: 1 },
      };

      await memoryService.store(memory);

      const updated = await memoryService.update(memory.id, {
        content: 'Updated content',
        metadata: { version: 2 },
      });

      expect(updated?.content).toBe('Updated content');
      expect(updated?.metadata.version).toBe(2);
    });

    it('should delete memory', async () => {
      const memory: MemoryEntry = {
        id: 'mem_delete',
        agentId: 'agent_123',
        type: MemoryType.SHORT_TERM,
        content: 'To be deleted',
        timestamp: new Date(),
        metadata: {},
      };

      await memoryService.store(memory);
      await memoryService.delete(memory.id);

      const retrieved = await memoryService.retrieve(memory.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Cross-Agent Memory Sharing', () => {
    it('should share memory between agents', async () => {
      const sharedMemory: MemoryEntry = {
        id: 'mem_shared',
        agentId: 'agent_123',
        type: MemoryType.SHARED,
        content: 'Customer preference: No emails on weekends',
        timestamp: new Date(),
        metadata: {
          sharedWith: ['agent_456', 'agent_789'],
        },
      };

      await memoryService.store(sharedMemory);

      // Agent 456 should be able to access
      const memories = await memoryService.search({
        agentId: 'agent_456',
        includeShared: true,
      });

      expect(memories).toHaveLength(1);
      expect(memories[0].content).toBe(sharedMemory.content);
    });

    it('should handle memory access control', async () => {
      const privateMemory: MemoryEntry = {
        id: 'mem_private',
        agentId: 'agent_123',
        type: MemoryType.PROCEDURAL,
        content: 'Internal process',
        timestamp: new Date(),
        metadata: {
          private: true,
        },
      };

      await memoryService.store(privateMemory);

      // Other agents should not access
      const memories = await memoryService.search({
        agentId: 'agent_456',
        includeShared: true,
      });

      expect(memories).toHaveLength(0);
    });
  });

  describe('Memory Search and Retrieval', () => {
    it('should search by metadata filters', async () => {
      await memoryService.store({
        id: 'mem_customer1',
        agentId: 'agent_123',
        type: MemoryType.EPISODIC,
        content: 'Customer interaction',
        timestamp: new Date(),
        metadata: {
          customerId: 'cust_123',
          channel: 'email',
        },
      });

      await memoryService.store({
        id: 'mem_customer2',
        agentId: 'agent_123',
        type: MemoryType.EPISODIC,
        content: 'Another interaction',
        timestamp: new Date(),
        metadata: {
          customerId: 'cust_456',
          channel: 'chat',
        },
      });

      const memories = await memoryService.search({
        agentId: 'agent_123',
        metadata: {
          channel: 'email',
        },
      });

      expect(memories).toHaveLength(1);
      expect(memories[0].metadata.customerId).toBe('cust_123');
    });

    it('should search by time range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

      await memoryService.store({
        id: 'mem_recent',
        agentId: 'agent_123',
        type: MemoryType.SHORT_TERM,
        content: 'Recent memory',
        timestamp: now,
        metadata: {},
      });

      await memoryService.store({
        id: 'mem_old',
        agentId: 'agent_123',
        type: MemoryType.SHORT_TERM,
        content: 'Old memory',
        timestamp: twoDaysAgo,
        metadata: {},
      });

      const memories = await memoryService.search({
        agentId: 'agent_123',
        startTime: yesterday,
        endTime: new Date(),
      });

      expect(memories).toHaveLength(1);
      expect(memories[0].content).toBe('Recent memory');
    });

    it('should perform semantic search', async () => {
      // Mock vector similarity search
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'mem_sem1',
            content: 'Customer wants refund for damaged product',
            similarity: 0.92,
          },
          {
            id: 'mem_sem2',
            content: 'User requested return due to defect',
            similarity: 0.88,
          },
        ],
      });

      const results = await memoryService.semanticSearch(
        'refund request',
        { limit: 5, threshold: 0.8 }
      );

      expect(results).toHaveLength(2);
      expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
    });
  });

  describe('Memory Statistics', () => {
    it('should get memory statistics', async () => {
      // Store various types of memories
      await memoryService.store({
        id: 'mem_st1',
        agentId: 'agent_123',
        type: MemoryType.SHORT_TERM,
        content: 'Short term',
        timestamp: new Date(),
        metadata: {},
      });

      await memoryService.store({
        id: 'mem_lt1',
        agentId: 'agent_123',
        type: MemoryType.LONG_TERM,
        content: 'Long term',
        timestamp: new Date(),
        metadata: {},
      });

      const stats = await memoryService.getStatistics('agent_123');

      expect(stats.totalMemories).toBe(2);
      expect(stats.byType[MemoryType.SHORT_TERM]).toBe(1);
      expect(stats.byType[MemoryType.LONG_TERM]).toBe(1);
    });

    it('should track memory usage', async () => {
      const largeMemory: MemoryEntry = {
        id: 'mem_large',
        agentId: 'agent_123',
        type: MemoryType.SEMANTIC,
        content: 'x'.repeat(1000), // 1KB content
        timestamp: new Date(),
        metadata: {},
      };

      await memoryService.store(largeMemory);

      const usage = await memoryService.getMemoryUsage('agent_123');

      expect(usage.totalBytes).toBeGreaterThan(1000);
      expect(usage.byTier.hot).toBeGreaterThan(0);
    });
  });

  describe('Memory Consolidation', () => {
    it('should consolidate similar memories', async () => {
      await memoryService.store({
        id: 'mem_dup1',
        agentId: 'agent_123',
        type: MemoryType.EPISODIC,
        content: 'Customer prefers morning calls',
        timestamp: new Date(),
        metadata: { confidence: 0.8 },
      });

      await memoryService.store({
        id: 'mem_dup2',
        agentId: 'agent_123',
        type: MemoryType.EPISODIC,
        content: 'Customer likes to be called in the morning',
        timestamp: new Date(),
        metadata: { confidence: 0.9 },
      });

      const consolidated = await memoryService.consolidateMemories('agent_123');

      expect(consolidated.merged).toBeGreaterThan(0);
      expect(consolidated.removed).toBeGreaterThan(0);
    });

    it('should create summary memories', async () => {
      // Store multiple related memories
      const memories = [];
      for (let i = 0; i < 10; i++) {
        memories.push({
          id: `mem_episode_${i}`,
          agentId: 'agent_123',
          type: MemoryType.EPISODIC,
          content: `Customer interaction ${i}`,
          timestamp: new Date(),
          metadata: { customerId: 'cust_123' },
        });
      }

      await Promise.all(memories.map(m => memoryService.store(m)));

      const summary = await memoryService.createSummary('agent_123', {
        customerId: 'cust_123',
      });

      expect(summary).toBeTruthy();
      expect(summary?.type).toBe(MemoryType.SEMANTIC);
      expect(summary?.content).toContain('summary');
    });
  });

  describe('Performance Optimization', () => {
    it('should batch store memories efficiently', async () => {
      const memories: MemoryEntry[] = Array.from({ length: 100 }, (_, i) => ({
        id: `mem_batch_${i}`,
        agentId: 'agent_123',
        type: MemoryType.SHORT_TERM,
        content: `Memory ${i}`,
        timestamp: new Date(),
        metadata: {},
      }));

      const start = Date.now();
      await memoryService.batchStore(memories);
      const duration = Date.now() - start;

      // Should be fast with batch operation
      expect(duration).toBeLessThan(1000);

      // Verify all stored
      const stored = await memoryService.search({
        agentId: 'agent_123',
        limit: 100,
      });
      expect(stored).toHaveLength(100);
    });

    it('should use caching for frequently accessed memories', async () => {
      const memory: MemoryEntry = {
        id: 'mem_cached',
        agentId: 'agent_123',
        type: MemoryType.PROCEDURAL,
        content: 'Frequently used procedure',
        timestamp: new Date(),
        metadata: { hot: true },
      };

      await memoryService.store(memory);

      // First access - from storage
      const first = await memoryService.retrieve(memory.id);
      
      // Subsequent accesses - from cache
      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        await memoryService.retrieve(memory.id);
      }
      const duration = Date.now() - start;

      // Should be very fast due to caching
      expect(duration).toBeLessThan(50);
    });
  });

  describe('Error Handling', () => {
    it('should handle storage failures gracefully', async () => {
      // Force Redis error
      redisClient.disconnect();

      const memory: MemoryEntry = {
        id: 'mem_error',
        agentId: 'agent_123',
        type: MemoryType.SHORT_TERM,
        content: 'Test memory',
        timestamp: new Date(),
        metadata: {},
      };

      // Should fallback to PostgreSQL
      await memoryService.store(memory);
      
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should validate memory entries', async () => {
      const invalidMemory = {
        // Missing required fields
        content: 'Invalid memory',
      } as any;

      await expect(memoryService.store(invalidMemory)).rejects.toThrow();
    });

    it('should handle concurrent access', async () => {
      const memory: MemoryEntry = {
        id: 'mem_concurrent',
        agentId: 'agent_123',
        type: MemoryType.SHORT_TERM,
        content: 'Original',
        timestamp: new Date(),
        metadata: { version: 1 },
      };

      await memoryService.store(memory);

      // Simulate concurrent updates
      const updates = Array.from({ length: 10 }, (_, i) => 
        memoryService.update(memory.id, {
          content: `Update ${i}`,
          metadata: { version: i + 2 },
        })
      );

      const results = await Promise.all(updates);
      
      // Should handle all updates
      expect(results.every(r => r !== null)).toBe(true);
    });
  });
});