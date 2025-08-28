/**
 * Memory Service - Core Memory Management
 * Provides high-level memory operations with business logic
 */

import { StorageManager } from './storage/storage-manager';
import { MemoryConsolidationService } from './memory-consolidation';
import { MemoryLifecycleService } from './memory-lifecycle';
import { MemorySharingService } from './memory-sharing';
import { 
  CreateMemoryInput,
  UpdateMemoryInput,
  MemoryFilter,
  MemorySearchResult,
  VectorSearchConfig,
  MemoryType,
  StorageTier,
  ImportanceLevel,
  MemoryServiceError,
  MemoryNotFoundError,
  MemoryValidationError,
  MemoryPermissionError,
  CreateMemorySchema,
  UpdateMemorySchema,
  MemoryFilterSchema
} from '../types';
import { Logger } from '../utils/logger';
import { Metrics } from '../utils/metrics';

export interface MemoryServiceConfig {
  storage: any; // StorageManagerConfig
  consolidation: {
    enabled: boolean;
    threshold: number;
    schedule: string;
  };
  lifecycle: {
    enabled: boolean;
    cleanupSchedule: string;
    retentionPolicies: Record<MemoryType, Record<ImportanceLevel, number>>;
  };
  sharing: {
    enabled: boolean;
    defaultPermissions: {
      canRead: boolean;
      canWrite: boolean;
      canDelete: boolean;
      canShare: boolean;
    };
  };
  security: {
    encryptionEnabled: boolean;
    accessLogging: boolean;
    auditTrail: boolean;
  };
}

export class MemoryService {
  private storageManager: StorageManager;
  private consolidationService: MemoryConsolidationService;
  private lifecycleService: MemoryLifecycleService;
  private sharingService: MemorySharingService;
  private logger: Logger;
  private metrics: Metrics;
  private config: MemoryServiceConfig;

  constructor(config: MemoryServiceConfig) {
    this.config = config;
    this.logger = Logger.getInstance('MemoryService');
    this.metrics = Metrics.getInstance();

    // Initialize core services
    this.storageManager = new StorageManager(config.storage);
    this.consolidationService = new MemoryConsolidationService({
      storageManager: this.storageManager,
      config: config.consolidation,
    });
    this.lifecycleService = new MemoryLifecycleService({
      storageManager: this.storageManager,
      config: config.lifecycle,
    });
    this.sharingService = new MemorySharingService({
      storageManager: this.storageManager,
      config: config.sharing,
    });
  }

  /**
   * Create a new memory with validation and business logic
   */
  async createMemory(
    input: CreateMemoryInput,
    options: {
      validateInput?: boolean;
      generateEmbedding?: boolean;
      notifyAgents?: boolean;
    } = {}
  ): Promise<string> {
    const startTime = Date.now();
    
    try {
      // Validate input
      if (options.validateInput !== false) {
        const validation = CreateMemorySchema.safeParse(input);
        if (!validation.success) {
          throw new MemoryValidationError(
            'Invalid memory input',
            validation.error.format()
          );
        }
      }

      // Check agent permissions
      await this.checkAgentPermissions(input.agentId, 'CREATE');

      // Enhance input with metadata
      const enhancedInput = await this.enhanceMemoryInput(input);

      // Create memory through storage manager
      const memoryId = await this.storageManager.createMemory(enhancedInput);

      // Log audit trail
      if (this.config.security.auditTrail) {
        await this.logMemoryOperation(memoryId, 'CREATE', input.agentId, {
          type: input.type,
          category: input.category,
          title: input.title,
        });
      }

      // Trigger consolidation check if enabled
      if (this.config.consolidation.enabled) {
        this.consolidationService.scheduleConsolidationCheck(memoryId).catch(error => {
          this.logger.warn(`Failed to schedule consolidation check for ${memoryId}:`, error);
        });
      }

      const responseTime = Date.now() - startTime;
      this.metrics.histogram('memory_service.create.duration', responseTime);
      this.metrics.increment('memory_service.create.success');
      this.metrics.increment(`memory_service.create.${input.type.toLowerCase()}`);

      this.logger.info(`Created memory ${memoryId} for agent ${input.agentId} (${responseTime}ms)`);

      return memoryId;
    } catch (error) {
      this.metrics.increment('memory_service.create.errors');
      if (error instanceof MemoryServiceError) {
        throw error;
      }
      throw new MemoryServiceError(`Failed to create memory: ${error.message}`, 'CREATE_FAILED');
    }
  }

  /**
   * Retrieve memory with access control and caching
   */
  async retrieveMemory(
    memoryId: string,
    agentId: string,
    options: {
      includeRelations?: boolean;
      updateAccessCount?: boolean;
    } = {}
  ): Promise<MemorySearchResult | null> {
    const startTime = Date.now();
    
    try {
      // Check access permissions
      await this.checkMemoryAccess(memoryId, agentId, 'READ');

      // Retrieve from storage
      const memory = await this.storageManager.retrieveMemory(memoryId);
      
      if (!memory) {
        this.metrics.increment('memory_service.retrieve.not_found');
        return null;
      }

      // Update access tracking if requested
      if (options.updateAccessCount !== false) {
        this.updateMemoryAccessTracking(memoryId, agentId).catch(error => {
          this.logger.warn(`Failed to update access tracking for ${memoryId}:`, error);
        });
      }

      // Log access if security logging is enabled
      if (this.config.security.accessLogging) {
        await this.logMemoryOperation(memoryId, 'READ', agentId);
      }

      const responseTime = Date.now() - startTime;
      this.metrics.histogram('memory_service.retrieve.duration', responseTime);
      this.metrics.increment('memory_service.retrieve.success');

      this.logger.debug(`Retrieved memory ${memoryId} for agent ${agentId} (${responseTime}ms)`);

      return memory;
    } catch (error) {
      this.metrics.increment('memory_service.retrieve.errors');
      if (error instanceof MemoryServiceError) {
        throw error;
      }
      throw new MemoryServiceError(`Failed to retrieve memory: ${error.message}`, 'RETRIEVE_FAILED');
    }
  }

  /**
   * Update memory with validation and change tracking
   */
  async updateMemory(
    memoryId: string,
    updates: UpdateMemoryInput,
    agentId: string,
    options: {
      validateUpdates?: boolean;
      trackChanges?: boolean;
    } = {}
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Validate input
      if (options.validateUpdates !== false) {
        const validation = UpdateMemorySchema.safeParse(updates);
        if (!validation.success) {
          throw new MemoryValidationError(
            'Invalid memory updates',
            validation.error.format()
          );
        }
      }

      // Check permissions
      await this.checkMemoryAccess(memoryId, agentId, 'UPDATE');

      // Get current memory for change tracking
      let previousMemory;
      if (options.trackChanges !== false || this.config.security.auditTrail) {
        previousMemory = await this.storageManager.retrieveMemory(memoryId);
        if (!previousMemory) {
          throw new MemoryNotFoundError(memoryId);
        }
      }

      // Update memory
      await this.storageManager.updateMemory(memoryId, updates);

      // Log changes if audit trail is enabled
      if (this.config.security.auditTrail && previousMemory) {
        await this.logMemoryOperation(memoryId, 'UPDATE', agentId, {
          previousValue: previousMemory,
          newValue: updates,
          changes: this.calculateChanges(previousMemory, updates),
        });
      }

      const responseTime = Date.now() - startTime;
      this.metrics.histogram('memory_service.update.duration', responseTime);
      this.metrics.increment('memory_service.update.success');

      this.logger.info(`Updated memory ${memoryId} by agent ${agentId} (${responseTime}ms)`);
    } catch (error) {
      this.metrics.increment('memory_service.update.errors');
      if (error instanceof MemoryServiceError) {
        throw error;
      }
      throw new MemoryServiceError(`Failed to update memory: ${error.message}`, 'UPDATE_FAILED');
    }
  }

  /**
   * Delete memory with access control and cleanup
   */
  async deleteMemory(
    memoryId: string,
    agentId: string,
    options: {
      hardDelete?: boolean;
      cleanupRelations?: boolean;
    } = {}
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Check permissions
      await this.checkMemoryAccess(memoryId, agentId, 'DELETE');

      // Get memory for audit logging
      let memory;
      if (this.config.security.auditTrail) {
        memory = await this.storageManager.retrieveMemory(memoryId);
      }

      // Delete memory
      await this.storageManager.deleteMemory(memoryId);

      // Cleanup related data if requested
      if (options.cleanupRelations !== false) {
        await this.cleanupMemoryRelations(memoryId);
      }

      // Log deletion
      if (this.config.security.auditTrail && memory) {
        await this.logMemoryOperation(memoryId, 'DELETE', agentId, {
          deletedMemory: memory,
          hardDelete: options.hardDelete || false,
        });
      }

      const responseTime = Date.now() - startTime;
      this.metrics.histogram('memory_service.delete.duration', responseTime);
      this.metrics.increment('memory_service.delete.success');

      this.logger.info(`Deleted memory ${memoryId} by agent ${agentId} (${responseTime}ms)`);
    } catch (error) {
      this.metrics.increment('memory_service.delete.errors');
      if (error instanceof MemoryServiceError) {
        throw error;
      }
      throw new MemoryServiceError(`Failed to delete memory: ${error.message}`, 'DELETE_FAILED');
    }
  }

  /**
   * Search memories with intelligent routing and caching
   */
  async searchMemories(
    filters: MemoryFilter,
    agentId: string,
    options: {
      page?: number;
      pageSize?: number;
      sortBy?: 'createdAt' | 'updatedAt' | 'importanceScore' | 'accessCount';
      sortOrder?: 'asc' | 'desc';
      preferTier?: StorageTier;
      includeShared?: boolean;
    } = {}
  ): Promise<{ results: MemorySearchResult[]; total: number; metadata: any }> {
    const startTime = Date.now();
    
    try {
      // Validate filters
      const validation = MemoryFilterSchema.safeParse(filters);
      if (!validation.success) {
        throw new MemoryValidationError(
          'Invalid search filters',
          validation.error.format()
        );
      }

      // Apply agent-specific filters
      const agentFilters = await this.applyAgentFilters(filters, agentId, options.includeShared);

      // Execute search
      const searchResult = await this.storageManager.searchMemories(agentFilters, options);

      // Filter results based on permissions
      const filteredResults = await this.filterResultsByPermissions(
        searchResult.results,
        agentId
      );

      const responseTime = Date.now() - startTime;
      this.metrics.histogram('memory_service.search.duration', responseTime);
      this.metrics.increment('memory_service.search.success');
      this.metrics.gauge('memory_service.search.results', filteredResults.length);

      this.logger.debug(`Searched memories for agent ${agentId}: ${filteredResults.length}/${searchResult.total} (${responseTime}ms)`);

      return {
        results: filteredResults,
        total: searchResult.total,
        metadata: {
          tier: searchResult.tier,
          responseTime,
          filtered: searchResult.results.length - filteredResults.length,
        },
      };
    } catch (error) {
      this.metrics.increment('memory_service.search.errors');
      if (error instanceof MemoryServiceError) {
        throw error;
      }
      throw new MemoryServiceError(`Failed to search memories: ${error.message}`, 'SEARCH_FAILED');
    }
  }

  /**
   * Vector similarity search with semantic understanding
   */
  async vectorSearch(
    query: string,
    agentId: string,
    config: VectorSearchConfig,
    filters?: MemoryFilter
  ): Promise<Array<{ memory: MemorySearchResult; similarity: number; explanation?: string }>> {
    const startTime = Date.now();
    
    try {
      // Generate query embedding
      const queryEmbedding = await this.storageManager.postgresql.embeddingService?.generateEmbedding(query);
      if (!queryEmbedding) {
        throw new MemoryServiceError('Embedding service not available', 'EMBEDDING_ERROR');
      }

      // Apply agent-specific filters
      const agentFilters = await this.applyAgentFilters(filters || {}, agentId, true);

      // Execute vector search
      const searchResults = await this.storageManager.vectorSearch(
        queryEmbedding,
        config,
        agentFilters
      );

      // Filter results by permissions and add explanations
      const enrichedResults = [];
      for (const result of searchResults) {
        try {
          await this.checkMemoryAccess(result.memory.id, agentId, 'READ');
          
          enrichedResults.push({
            memory: result.memory,
            similarity: result.similarity,
            explanation: await this.generateSimilarityExplanation(query, result.memory, result.similarity),
          });
        } catch (error) {
          // Skip memories the agent can't access
          continue;
        }
      }

      const responseTime = Date.now() - startTime;
      this.metrics.histogram('memory_service.vector_search.duration', responseTime);
      this.metrics.increment('memory_service.vector_search.success');
      this.metrics.gauge('memory_service.vector_search.results', enrichedResults.length);

      this.logger.debug(`Vector search for agent ${agentId}: ${enrichedResults.length} similar memories (${responseTime}ms)`);

      return enrichedResults;
    } catch (error) {
      this.metrics.increment('memory_service.vector_search.errors');
      if (error instanceof MemoryServiceError) {
        throw error;
      }
      throw new MemoryServiceError(`Failed to perform vector search: ${error.message}`, 'VECTOR_SEARCH_FAILED');
    }
  }

  /**
   * Share memory with another agent
   */
  async shareMemory(
    memoryId: string,
    fromAgentId: string,
    toAgentId: string,
    permissions: {
      canRead: boolean;
      canWrite: boolean;
      canDelete: boolean;
      canShare: boolean;
    },
    options: {
      validUntil?: Date;
      reason?: string;
    } = {}
  ): Promise<void> {
    try {
      // Check if source agent can share
      await this.checkMemoryAccess(memoryId, fromAgentId, 'SHARE');

      // Create sharing record
      await this.sharingService.shareMemory({
        ownerAgentId: fromAgentId,
        targetAgentId: toAgentId,
        memoryId,
        permissions,
        validUntil: options.validUntil,
      });

      // Log sharing action
      if (this.config.security.auditTrail) {
        await this.logMemoryOperation(memoryId, 'SHARE', fromAgentId, {
          targetAgent: toAgentId,
          permissions,
          reason: options.reason,
        });
      }

      this.metrics.increment('memory_service.share.success');
      this.logger.info(`Memory ${memoryId} shared from ${fromAgentId} to ${toAgentId}`);
    } catch (error) {
      this.metrics.increment('memory_service.share.errors');
      throw error;
    }
  }

  /**
   * Get memory statistics for an agent
   */
  async getAgentMemoryStats(agentId: string): Promise<{
    totalMemories: number;
    memoryTypes: Record<MemoryType, number>;
    storageUsage: number;
    recentActivity: number;
    sharedMemories: number;
    topCategories: Array<{ category: string; count: number }>;
  }> {
    try {
      // This would aggregate data from the storage manager and other services
      const [storageStats, sharingStats] = await Promise.all([
        this.storageManager.getStorageStats(),
        this.sharingService.getAgentSharingStats(agentId),
      ]);

      // Filter by agent
      const agentStats = {
        totalMemories: 0, // Would need to filter from storage stats
        memoryTypes: {} as Record<MemoryType, number>,
        storageUsage: 0,
        recentActivity: 0,
        sharedMemories: sharingStats.incomingShares + sharingStats.outgoingShares,
        topCategories: [],
      };

      return agentStats;
    } catch (error) {
      this.logger.error(`Failed to get agent memory stats for ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Health check for memory service
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    services: {
      storage: any;
      consolidation: boolean;
      lifecycle: boolean;
      sharing: boolean;
    };
    metrics: {
      totalMemories: number;
      activeAgents: number;
      avgResponseTime: number;
    };
  }> {
    try {
      const [storageHealth, storageStats] = await Promise.all([
        this.storageManager.healthCheck(),
        this.storageManager.getStorageStats(),
      ]);

      return {
        healthy: storageHealth.overall,
        services: {
          storage: storageHealth,
          consolidation: this.consolidationService.isHealthy(),
          lifecycle: this.lifecycleService.isHealthy(),
          sharing: this.sharingService.isHealthy(),
        },
        metrics: {
          totalMemories: storageStats.totalMemories,
          activeAgents: 0, // Would track from recent activity
          avgResponseTime: this.metrics.getHistogramStats('memory_service.retrieve.duration')?.avg || 0,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        services: {
          storage: { overall: false, error: error.message },
          consolidation: false,
          lifecycle: false,
          sharing: false,
        },
        metrics: {
          totalMemories: 0,
          activeAgents: 0,
          avgResponseTime: 0,
        },
      };
    }
  }

  /**
   * Shutdown memory service gracefully
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down memory service...');
    
    await Promise.all([
      this.storageManager.close(),
      this.consolidationService.shutdown(),
      this.lifecycleService.shutdown(),
      this.sharingService.shutdown(),
    ]);

    this.logger.info('Memory service shutdown complete');
  }

  // Private helper methods

  private async enhanceMemoryInput(input: CreateMemoryInput): Promise<CreateMemoryInput> {
    return {
      ...input,
      metadata: {
        ...input.metadata,
        createdBy: input.agentId,
        source: 'memory_service',
        version: 1,
      },
    };
  }

  private async checkAgentPermissions(agentId: string, operation: string): Promise<void> {
    // This would integrate with your agent management system
    // For now, allow all operations
    return;
  }

  private async checkMemoryAccess(
    memoryId: string,
    agentId: string,
    operation: 'READ' | 'UPDATE' | 'DELETE' | 'SHARE'
  ): Promise<void> {
    // Check if agent owns the memory
    const memory = await this.storageManager.retrieveMemory(memoryId);
    if (!memory) {
      throw new MemoryNotFoundError(memoryId);
    }

    // Check if memory belongs to agent or is shared
    const hasAccess = await this.sharingService.checkAccess(memoryId, agentId, operation);
    if (!hasAccess) {
      throw new MemoryPermissionError(agentId, operation);
    }
  }

  private async applyAgentFilters(
    filters: MemoryFilter,
    agentId: string,
    includeShared: boolean = false
  ): Promise<MemoryFilter> {
    let agentIds = [agentId];
    
    if (includeShared) {
      const sharedMemoryAgents = await this.sharingService.getSharedMemoryAgents(agentId);
      agentIds = [...agentIds, ...sharedMemoryAgents];
    }

    return {
      ...filters,
      agentIds: filters.agentIds ? filters.agentIds.filter(id => agentIds.includes(id)) : agentIds,
    };
  }

  private async filterResultsByPermissions(
    results: MemorySearchResult[],
    agentId: string
  ): Promise<MemorySearchResult[]> {
    const filtered: MemorySearchResult[] = [];
    
    for (const result of results) {
      try {
        await this.checkMemoryAccess(result.id, agentId, 'READ');
        filtered.push(result);
      } catch (error) {
        // Skip memories the agent can't access
        continue;
      }
    }
    
    return filtered;
  }

  private async updateMemoryAccessTracking(memoryId: string, agentId: string): Promise<void> {
    // Update access count and last accessed time
    try {
      await this.storageManager.updateMemory(memoryId, {
        metadata: {
          lastAccessedBy: agentId,
          lastAccessedAt: new Date(),
        },
      });
    } catch (error) {
      // Don't fail the main operation if access tracking fails
      this.logger.warn(`Failed to update access tracking for ${memoryId}:`, error);
    }
  }

  private async logMemoryOperation(
    memoryId: string,
    action: string,
    agentId: string,
    details?: any
  ): Promise<void> {
    // This would log to your audit system
    this.logger.info('Memory operation', {
      memoryId,
      action,
      agentId,
      timestamp: new Date(),
      details,
    });
  }

  private calculateChanges(previous: any, updates: any): Record<string, { from: any; to: any }> {
    const changes: Record<string, { from: any; to: any }> = {};
    
    for (const [key, newValue] of Object.entries(updates)) {
      if (previous[key] !== newValue) {
        changes[key] = {
          from: previous[key],
          to: newValue,
        };
      }
    }
    
    return changes;
  }

  private async cleanupMemoryRelations(memoryId: string): Promise<void> {
    // Clean up related data when memory is deleted
    // This would remove sharing records, consolidation references, etc.
    try {
      await this.sharingService.cleanupMemorySharing(memoryId);
      await this.consolidationService.cleanupMemoryConsolidation(memoryId);
    } catch (error) {
      this.logger.warn(`Failed to cleanup relations for ${memoryId}:`, error);
    }
  }

  private async generateSimilarityExplanation(
    query: string,
    memory: MemorySearchResult,
    similarity: number
  ): Promise<string> {
    // Generate human-readable explanation of why this memory is similar
    const score = Math.round(similarity * 100);
    return `${score}% similarity - matches content about ${memory.title}`;
  }
}