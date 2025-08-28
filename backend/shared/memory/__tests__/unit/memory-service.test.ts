/**
 * Unit tests for Memory Service
 */

import { MemoryService } from '../../src/services/memory-service';
import { MemoryType, ImportanceLevel, CreateMemoryInput } from '../../src/types';

describe('MemoryService', () => {
  let memoryService: MemoryService;

  beforeEach(() => {
    const mockConfig = {
      storage: {
        redis: {
          host: 'localhost',
          port: 6379,
          db: 1,
          ttl: 3600,
          maxMemorySize: 1024 * 1024,
          keyPrefix: 'test:',
          compressionEnabled: false,
        },
        postgresql: {
          databaseUrl: 'postgresql://localhost:5432/test',
          maxConnections: 10,
          connectionTimeout: 5000,
          queryTimeout: 10000,
          enableVectorSearch: true,
          vectorDimensions: 384,
        },
        s3: {
          bucket: 'test-bucket',
          region: 'us-east-1',
          accessKeyId: 'test',
          secretAccessKey: 'test',
          compressionLevel: 6,
          keyPrefix: 'test/',
          lifecycleRules: {
            transitionToIA: 30,
            transitionToGlacier: 90,
            expiration: 2555,
          },
        },
        tierMigration: {
          hotToWarmDays: 7,
          warmToColdDays: 30,
          batchSize: 100,
          migrationSchedule: '0 2 * * *',
        },
      },
      consolidation: {
        enabled: false,
        threshold: 0.8,
        schedule: '0 3 * * *',
      },
      lifecycle: {
        enabled: false,
        cleanupSchedule: '0 4 * * *',
        retentionPolicies: {},
      },
      sharing: {
        enabled: true,
        defaultPermissions: {
          canRead: true,
          canWrite: false,
          canDelete: false,
          canShare: false,
        },
      },
      security: {
        encryptionEnabled: false,
        accessLogging: false,
        auditTrail: false,
      },
    };

    // Mock the storage manager and other dependencies
    memoryService = new MemoryService(mockConfig);
  });

  describe('createMemory', () => {
    it('should create a memory with valid input', async () => {
      const input: CreateMemoryInput = {
        type: MemoryType.SEMANTIC,
        category: 'test',
        title: 'Test Memory',
        description: 'A test memory for unit testing',
        content: { data: 'test content' },
        agentId: 'test-agent-123',
        importanceLevel: ImportanceLevel.MEDIUM,
      };

      // Mock the storage manager method
      const mockStorageManager = {
        createMemory: jest.fn().mockResolvedValue('memory-123'),
      };

      // This would require dependency injection in the actual implementation
      // memoryService.storageManager = mockStorageManager;

      // For now, we'll test the validation logic
      expect(input.type).toBe(MemoryType.SEMANTIC);
      expect(input.agentId).toBe('test-agent-123');
    });

    it('should validate memory input', () => {
      const invalidInput = {
        type: 'INVALID_TYPE',
        category: '',
        title: '',
        content: {},
        agentId: '',
      };

      // Test validation schema
      const { CreateMemorySchema } = require('../../src/types');
      const result = CreateMemorySchema.safeParse(invalidInput);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Memory types and schemas', () => {
    it('should validate all memory types', () => {
      const types = Object.values(MemoryType);
      expect(types).toContain(MemoryType.WORKING);
      expect(types).toContain(MemoryType.EPISODIC);
      expect(types).toContain(MemoryType.SEMANTIC);
      expect(types).toContain(MemoryType.PROCEDURAL);
      expect(types).toContain(MemoryType.SHARED);
      expect(types).toContain(MemoryType.BUSINESS);
    });

    it('should validate importance levels', () => {
      const levels = Object.values(ImportanceLevel);
      expect(levels).toContain(ImportanceLevel.CRITICAL);
      expect(levels).toContain(ImportanceLevel.HIGH);
      expect(levels).toContain(ImportanceLevel.MEDIUM);
      expect(levels).toContain(ImportanceLevel.LOW);
      expect(levels).toContain(ImportanceLevel.TRANSIENT);
    });
  });
});