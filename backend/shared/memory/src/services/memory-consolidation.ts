/**
 * Memory Consolidation Service
 * Automatically merges similar memories and optimizes memory storage
 */

import * as cron from 'node-cron';
import { StorageManager } from './storage/storage-manager';
import { EmbeddingService } from './embedding-service';
import { 
  MemoryType, 
  ImportanceLevel, 
  MemorySearchResult,
  ConsolidationConfig 
} from '../types';
import { Logger } from '../utils/logger';
import { Metrics } from '../utils/metrics';

export interface MemoryConsolidationConfig {
  enabled: boolean;
  threshold: number;
  schedule: string;
  batchSize: number;
  strategies: {
    merge: boolean;
    summarize: boolean;
    prioritize: boolean;
  };
  typeSpecificRules: Record<MemoryType, {
    enabled: boolean;
    threshold: number;
    maxAge: number; // days
  }>;
}

export interface ConsolidationCandidate {
  primaryMemory: MemorySearchResult;
  similarMemories: Array<{
    memory: MemorySearchResult;
    similarity: number;
    consolidationScore: number;
  }>;
  strategy: 'merge' | 'summarize' | 'prioritize';
  estimatedBenefit: number;
}

export interface ConsolidationResult {
  successful: number;
  failed: number;
  spaceSaved: number;
  memoryCount: {
    before: number;
    after: number;
  };
  errors: Array<{ memoryId: string; error: string }>;
}

export class MemoryConsolidationService {
  private storageManager: StorageManager;
  private embeddingService: EmbeddingService;  
  private logger: Logger;
  private metrics: Metrics;
  private config: MemoryConsolidationConfig;
  private consolidationJob?: any;
  private isRunning = false;

  constructor(options: { storageManager: StorageManager; config: MemoryConsolidationConfig }) {
    this.storageManager = options.storageManager;
    this.config = {
      typeSpecificRules: {
        [MemoryType.WORKING]: { enabled: true, threshold: 0.9, maxAge: 1 },
        [MemoryType.EPISODIC]: { enabled: true, threshold: 0.8, maxAge: 30 },
        [MemoryType.SEMANTIC]: { enabled: true, threshold: 0.7, maxAge: 90 },
        [MemoryType.PROCEDURAL]: { enabled: true, threshold: 0.75, maxAge: 180 },
        [MemoryType.SHARED]: { enabled: false, threshold: 0.8, maxAge: 60 },
        [MemoryType.BUSINESS]: { enabled: true, threshold: 0.8, maxAge: 365 },
      },
      ...options.config,
    };
    
    this.logger = Logger.getInstance('MemoryConsolidation');
    this.metrics = Metrics.getInstance();
    this.embeddingService = new EmbeddingService();

    if (this.config.enabled) {
      this.startScheduledConsolidation();
    }
  }

  /**
   * Start scheduled consolidation based on cron schedule
   */
  private startScheduledConsolidation(): void {
    if (this.config.schedule) {
      this.consolidationJob = cron.schedule(
        this.config.schedule,
        async () => {
          try {
            await this.runConsolidation();
          } catch (error) {
            this.logger.error('Scheduled consolidation failed:', error);
          }
        },
        { scheduled: false }
      );

      this.consolidationJob.start();
      this.logger.info(`Scheduled consolidation started with schedule: ${this.config.schedule}`);
    }
  }

  /**
   * Run automatic memory consolidation
   */
  async runConsolidation(): Promise<ConsolidationResult> {
    if (this.isRunning) {
      this.logger.warn('Consolidation already in progress, skipping');
      return this.createEmptyResult();
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      this.logger.info('Starting memory consolidation');

      // Find consolidation candidates
      const candidates = await this.findConsolidationCandidates();
      this.logger.info(`Found ${candidates.length} consolidation candidates`);

      if (candidates.length === 0) {
        return this.createEmptyResult();
      }

      // Execute consolidation
      const result = await this.executeConsolidation(candidates);
      
      const totalTime = Date.now() - startTime;
      this.logger.info(`Consolidation completed: ${result.successful} successful, ${result.failed} failed (${totalTime}ms)`);
      
      // Record metrics
      this.metrics.histogram('memory_consolidation.duration', totalTime);
      this.metrics.increment('memory_consolidation.runs');
      this.metrics.gauge('memory_consolidation.successful', result.successful);
      this.metrics.gauge('memory_consolidation.space_saved', result.spaceSaved);

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Schedule consolidation check for a specific memory
   */
  async scheduleConsolidationCheck(memoryId: string): Promise<void> {
    try {
      // Check if this memory should trigger consolidation
      const memory = await this.storageManager.retrieveMemory(memoryId);
      if (!memory) return;

      const typeRule = this.config.typeSpecificRules[memory.type];
      if (!typeRule?.enabled) return;

      // Find similar memories
      const similarMemories = await this.findSimilarMemories(memory);
      
      if (similarMemories.length > 0) {
        this.logger.debug(`Scheduled consolidation check found ${similarMemories.length} similar memories for ${memoryId}`);
        
        // Queue for consolidation (in a real implementation, this would use a job queue)
        setTimeout(() => {
          this.consolidateMemoryGroup([memory, ...similarMemories.map(s => s.memory)]).catch(error => {
            this.logger.error(`Failed to consolidate memory group for ${memoryId}:`, error);
          });
        }, 1000);
      }
    } catch (error) {
      this.logger.error(`Failed to schedule consolidation check for ${memoryId}:`, error);
    }
  }

  /**
   * Find memories that are candidates for consolidation
   */
  private async findConsolidationCandidates(): Promise<ConsolidationCandidate[]> {
    const candidates: ConsolidationCandidate[] = [];

    try {
      // Process each memory type
      for (const [memoryType, typeRule] of Object.entries(this.config.typeSpecificRules)) {
        if (!typeRule.enabled) continue;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - typeRule.maxAge);

        // Get memories of this type that are old enough for consolidation
        const searchResult = await this.storageManager.searchMemories({
          types: [memoryType as MemoryType],
          dateRange: {
            from: cutoffDate,
            to: new Date(),
          },
        }, {
          pageSize: 1000,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        });

        // Group similar memories
        const groupedMemories = await this.groupSimilarMemories(
          searchResult.results,
          typeRule.threshold
        );

        // Create consolidation candidates from groups
        for (const group of groupedMemories) {
          if (group.length > 1) {
            const candidate = await this.createConsolidationCandidate(group, typeRule.threshold);
            if (candidate) {
              candidates.push(candidate);
            }
          }
        }
      }

      // Sort by estimated benefit (highest first)
      candidates.sort((a, b) => b.estimatedBenefit - a.estimatedBenefit);
      
      return candidates.slice(0, this.config.batchSize);
    } catch (error) {
      this.logger.error('Failed to find consolidation candidates:', error);
      return [];
    }
  }

  /**
   * Group similar memories together
   */
  private async groupSimilarMemories(
    memories: MemorySearchResult[],
    threshold: number
  ): Promise<MemorySearchResult[][]> {
    const groups: MemorySearchResult[][] = [];
    const processed = new Set<string>();

    for (const memory of memories) {
      if (processed.has(memory.id)) continue;

      const similarMemories = await this.findSimilarMemories(memory, threshold);
      const group = [memory, ...similarMemories.map(s => s.memory)];
      
      // Mark all memories in this group as processed
      group.forEach(m => processed.add(m.id));
      
      if (group.length > 1) {
        groups.push(group);
      }
    }

    return groups;
  }

  /**
   * Find memories similar to the given memory
   */
  private async findSimilarMemories(
    memory: MemorySearchResult,
    threshold?: number
  ): Promise<Array<{ memory: MemorySearchResult; similarity: number }>> {
    try {
      // Generate embedding for the memory content
      const queryText = `${memory.title} ${JSON.stringify(memory.content)}`;
      const embedding = await this.embeddingService.generateEmbedding(queryText);

      // Search for similar memories
      const similarResults = await this.storageManager.vectorSearch(
        embedding,
        {
          algorithm: 'cosine',
          threshold: threshold || this.config.threshold,
          maxResults: 10,
          includeMetadata: true,
        },
        {
          types: [memory.type],
          // Exclude the original memory
        }
      );

      return similarResults
        .filter(result => result.memory.id !== memory.id)
        .map(result => ({
          memory: result.memory,
          similarity: result.similarity,
        }));
    } catch (error) {
      this.logger.error(`Failed to find similar memories for ${memory.id}:`, error);
      return [];
    }
  }

  /**
   * Create consolidation candidate from a group of similar memories
   */
  private async createConsolidationCandidate(
    memories: MemorySearchResult[],
    threshold: number
  ): Promise<ConsolidationCandidate | null> {
    if (memories.length < 2) return null;

    try {
      // Select primary memory (most important or most recent)
      const primaryMemory = this.selectPrimaryMemory(memories);
      const otherMemories = memories.filter(m => m.id !== primaryMemory.id);

      // Calculate consolidation scores
      const similarMemories = await Promise.all(
        otherMemories.map(async (memory) => {
          const similarity = await this.calculateSimilarity(primaryMemory, memory);
          const consolidationScore = this.calculateConsolidationScore(
            primaryMemory,
            memory,
            similarity
          );
          
          return {
            memory,
            similarity,
            consolidationScore,
          };
        })
      );

      // Determine best consolidation strategy
      const strategy = this.selectConsolidationStrategy(primaryMemory, similarMemories);
      
      // Estimate benefit
      const estimatedBenefit = this.estimateConsolidationBenefit(primaryMemory, similarMemories);

      return {
        primaryMemory,
        similarMemories,
        strategy,
        estimatedBenefit,
      };
    } catch (error) {
      this.logger.error('Failed to create consolidation candidate:', error);
      return null;
    }
  }

  /**
   * Execute consolidation for multiple candidates
   */
  private async executeConsolidation(candidates: ConsolidationCandidate[]): Promise<ConsolidationResult> {
    const result: ConsolidationResult = {
      successful: 0,
      failed: 0,
      spaceSaved: 0,
      memoryCount: {
        before: 0,
        after: 0,
      },
      errors: [],
    };

    for (const candidate of candidates) {
      try {
        const beforeCount = candidate.similarMemories.length + 1;
        const beforeSize = this.calculateMemoryGroupSize([
          candidate.primaryMemory,
          ...candidate.similarMemories.map(s => s.memory),
        ]);

        const afterResult = await this.consolidateMemoryGroup([
          candidate.primaryMemory,
          ...candidate.similarMemories.map(s => s.memory),
        ], candidate.strategy);

        const afterSize = this.calculateMemoryGroupSize(afterResult.consolidatedMemories);

        result.successful++;
        result.spaceSaved += beforeSize - afterSize;
        result.memoryCount.before += beforeCount;
        result.memoryCount.after += afterResult.consolidatedMemories.length;
      } catch (error) {
        result.failed++;
        result.errors.push({
          memoryId: candidate.primaryMemory.id,
          error: error.message,
        });
        this.logger.error(`Failed to consolidate memory group for ${candidate.primaryMemory.id}:`, error);
      }
    }

    return result;
  }

  /**
   * Consolidate a group of similar memories
   */
  async consolidateMemoryGroup(
    memories: MemorySearchResult[],
    strategy: 'merge' | 'summarize' | 'prioritize' = 'merge'
  ): Promise<{
    consolidatedMemories: MemorySearchResult[];
    originalCount: number;
    spaceSaved: number;
  }> {
    const originalCount = memories.length;
    const originalSize = this.calculateMemoryGroupSize(memories);

    try {
      let consolidatedMemories: MemorySearchResult[];

      switch (strategy) {
        case 'merge':
          consolidatedMemories = await this.mergeMemories(memories);
          break;
        case 'summarize':
          consolidatedMemories = await this.summarizeMemories(memories);
          break;
        case 'prioritize':
          consolidatedMemories = await this.prioritizeMemories(memories);
          break;
        default:
          throw new Error(`Unknown consolidation strategy: ${strategy}`);
      }

      const newSize = this.calculateMemoryGroupSize(consolidatedMemories);
      const spaceSaved = originalSize - newSize;

      this.logger.info(`Consolidated ${originalCount} memories into ${consolidatedMemories.length} using ${strategy} strategy (saved ${spaceSaved} bytes)`);

      return {
        consolidatedMemories,
        originalCount,
        spaceSaved,
      };
    } catch (error) {
      this.logger.error('Failed to consolidate memory group:', error);
      throw error;
    }
  }

  /**
   * Merge multiple memories into one comprehensive memory
   */
  private async mergeMemories(memories: MemorySearchResult[]): Promise<MemorySearchResult[]> {
    if (memories.length <= 1) return memories;

    const primaryMemory = this.selectPrimaryMemory(memories);
    const otherMemories = memories.filter(m => m.id !== primaryMemory.id);

    // Merge content
    const mergedContent = {
      ...primaryMemory.content,
      merged_from: otherMemories.map(m => m.id),
      merged_content: otherMemories.map(m => ({
        id: m.id,
        title: m.title,
        content: m.content,
        createdAt: m.createdAt,
      })),
    };

    // Merge metadata
    const mergedMetadata = {
      ...primaryMemory.metadata,
      consolidation_type: 'merge',
      consolidation_date: new Date(),
      original_count: memories.length,
    };

    // Update the primary memory with merged content
    await this.storageManager.updateMemory(primaryMemory.id, {
      title: `${primaryMemory.title} (Consolidated)`,
      content: mergedContent,
      metadata: mergedMetadata,
    });

    // Delete other memories
    for (const memory of otherMemories) {
      await this.storageManager.deleteMemory(memory.id);
    }

    // Return the updated primary memory (simplified)
    return [{
      ...primaryMemory,
      title: `${primaryMemory.title} (Consolidated)`,
      content: mergedContent,
      metadata: mergedMetadata,
    }];
  }

  /**
   * Summarize multiple memories into a single summary
   */
  private async summarizeMemories(memories: MemorySearchResult[]): Promise<MemorySearchResult[]> {
    if (memories.length <= 1) return memories;

    // This would use an LLM to generate a summary
    // For now, create a simple consolidated summary
    
    const primaryMemory = this.selectPrimaryMemory(memories);
    const summaryContent = {
      summary: `Consolidated summary of ${memories.length} related memories`,
      key_points: memories.map(m => m.title),
      original_memories: memories.map(m => ({
        id: m.id,
        title: m.title,
        created: m.createdAt,
      })),
      consolidation_method: 'summarize',
    };

    // Create new consolidated memory
    const consolidatedId = await this.storageManager.createMemory({
      type: primaryMemory.type,
      category: `consolidated_${primaryMemory.type.toLowerCase()}`,
      title: `Summary: ${primaryMemory.title}`,
      description: `Consolidated summary of ${memories.length} related memories`,
      content: summaryContent,
      metadata: {
        consolidation_type: 'summarize',
        consolidation_date: new Date(),
        original_count: memories.length,
      },
      agentId: 'system', // System-generated consolidation
    });

    // Delete original memories
    for (const memory of memories) {
      await this.storageManager.deleteMemory(memory.id);
    }

    // Return the new consolidated memory (simplified representation)
    return [{
      id: consolidatedId,
      type: primaryMemory.type,
      title: `Summary: ${primaryMemory.title}`,
      content: summaryContent,
      metadata: {
        consolidation_type: 'summarize',
        consolidation_date: new Date(),
        original_count: memories.length,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }];
  }

  /**
   * Keep only the most important memories, delete the rest
   */
  private async prioritizeMemories(memories: MemorySearchResult[]): Promise<MemorySearchResult[]> {
    // Sort by importance (would use actual importance scores from the database)
    const sortedMemories = [...memories].sort((a, b) => {
      // Simple heuristic: newer and longer content is more important
      const scoreA = (a.createdAt.getTime() / 1000000) + JSON.stringify(a.content).length;
      const scoreB = (b.createdAt.getTime() / 1000000) + JSON.stringify(b.content).length;
      return scoreB - scoreA;
    });

    // Keep top 30% of memories
    const keepCount = Math.max(1, Math.ceil(memories.length * 0.3));
    const keepMemories = sortedMemories.slice(0, keepCount);
    const deleteMemories = sortedMemories.slice(keepCount);

    // Delete lower priority memories
    for (const memory of deleteMemories) {
      await this.storageManager.deleteMemory(memory.id);
    }

    return keepMemories;
  }

  // Helper methods

  private selectPrimaryMemory(memories: MemorySearchResult[]): MemorySearchResult {
    // Select the most recent or most comprehensive memory as primary
    return memories.reduce((primary, current) => {
      const primaryScore = primary.createdAt.getTime() + JSON.stringify(primary.content).length;
      const currentScore = current.createdAt.getTime() + JSON.stringify(current.content).length;
      return currentScore > primaryScore ? current : primary;
    });
  }

  private async calculateSimilarity(memory1: MemorySearchResult, memory2: MemorySearchResult): Promise<number> {
    try {
      const text1 = `${memory1.title} ${JSON.stringify(memory1.content)}`;
      const text2 = `${memory2.title} ${JSON.stringify(memory2.content)}`;
      
      const [embedding1, embedding2] = await Promise.all([
        this.embeddingService.generateEmbedding(text1),
        this.embeddingService.generateEmbedding(text2),
      ]);

      return this.embeddingService.calculateSimilarity(embedding1, embedding2);
    } catch (error) {
      this.logger.error('Failed to calculate similarity:', error);
      return 0;
    }
  }

  private calculateConsolidationScore(
    primary: MemorySearchResult,
    secondary: MemorySearchResult,
    similarity: number
  ): number {
    // Calculate a score that considers similarity, age, and size
    const ageDiff = Math.abs(primary.createdAt.getTime() - secondary.createdAt.getTime()) / (1000 * 60 * 60 * 24); // days
    const sizeFactor = JSON.stringify(secondary.content).length / 1000; // KB
    
    return similarity * 0.7 + (1 / (1 + ageDiff * 0.1)) * 0.2 + Math.min(sizeFactor, 1) * 0.1;
  }

  private selectConsolidationStrategy(
    primaryMemory: MemorySearchResult,
    similarMemories: Array<{ memory: MemorySearchResult; similarity: number }>
  ): 'merge' | 'summarize' | 'prioritize' {
    const avgSimilarity = similarMemories.reduce((sum, s) => sum + s.similarity, 0) / similarMemories.length;
    const totalMemories = similarMemories.length + 1;

    if (avgSimilarity > 0.9 && totalMemories <= 5) {
      return 'merge';
    } else if (totalMemories > 10) {
      return 'prioritize';
    } else {
      return 'summarize';
    }
  }

  private estimateConsolidationBenefit(
    primaryMemory: MemorySearchResult,
    similarMemories: Array<{ memory: MemorySearchResult; similarity: number }>
  ): number {
    const totalSize = this.calculateMemoryGroupSize([
      primaryMemory,
      ...similarMemories.map(s => s.memory),
    ]);
    
    const avgSimilarity = similarMemories.reduce((sum, s) => sum + s.similarity, 0) / similarMemories.length;
    const redundancyFactor = avgSimilarity * similarMemories.length;
    
    return totalSize * redundancyFactor;
  }

  private calculateMemoryGroupSize(memories: MemorySearchResult[]): number {
    return memories.reduce((total, memory) => {
      return total + JSON.stringify(memory).length;
    }, 0);
  }

  private createEmptyResult(): ConsolidationResult {
    return {
      successful: 0,
      failed: 0,
      spaceSaved: 0,
      memoryCount: { before: 0, after: 0 },
      errors: [],
    };
  }

  /**
   * Check if consolidation service is healthy
   */
  isHealthy(): boolean {
    return this.config.enabled && !this.isRunning;
  }

  /**
   * Clean up consolidation data for a deleted memory
   */
  async cleanupMemoryConsolidation(memoryId: string): Promise<void> {
    // This would clean up any consolidation-related data
    this.logger.debug(`Cleaning up consolidation data for memory ${memoryId}`);
  }

  /**
   * Stop scheduled consolidation and shutdown
   */
  async shutdown(): Promise<void> {
    if (this.consolidationJob) {
      this.consolidationJob.stop();
    }
    
    // Wait for current consolidation to complete
    let attempts = 0;
    while (this.isRunning && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
    
    this.logger.info('Memory consolidation service shutdown complete');
  }
}