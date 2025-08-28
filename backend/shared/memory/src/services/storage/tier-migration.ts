/**
 * Tier Migration Service
 * Handles automatic data migration between storage tiers based on access patterns and age
 */

import * as cron from 'node-cron';
import { StorageTier, ImportanceLevel, AccessPattern, MemoryType } from '../../types';
import { Logger } from '../../utils/logger';  
import { Metrics } from '../../utils/metrics';

export interface TierMigrationConfig {
  hotToWarmDays: number;
  warmToColdDays: number;
  batchSize: number;
  migrationSchedule: string;
  dryRun?: boolean;
  importanceWeights: Record<ImportanceLevel, number>;
  accessPatternWeights: Record<AccessPattern, number>;
}

export interface MigrationCandidate {
  memoryId: string;
  currentTier: StorageTier;
  targetTier: StorageTier;
  priority: number;
  reason: string;
  metadata: {
    age: number;
    accessCount: number;
    lastAccessed: Date;
    importance: ImportanceLevel;
    accessPattern: AccessPattern;
    size: number;
  };
}

export interface MigrationResult {
  successful: number;
  failed: number;
  skipped: number;
  errors: Array<{ memoryId: string; error: string }>;
  totalTime: number;
  bytesTransferred: number;
}

export class TierMigrationService {
  private logger: Logger;
  private metrics: Metrics;
  private config: TierMigrationConfig;
  private storageManager: any; // Will be injected
  private migrationJob?: any;
  private isRunning = false;

  constructor(options: { storageManager: any; config: TierMigrationConfig }) {
    this.storageManager = options.storageManager;
    this.config = {
      importanceWeights: {
        [ImportanceLevel.CRITICAL]: 1.0,
        [ImportanceLevel.HIGH]: 0.8,
        [ImportanceLevel.MEDIUM]: 0.6,
        [ImportanceLevel.LOW]: 0.4,
        [ImportanceLevel.TRANSIENT]: 0.2,
      },
      accessPatternWeights: {
        [AccessPattern.FREQUENT]: 1.0,
        [AccessPattern.REGULAR]: 0.7,
        [AccessPattern.OCCASIONAL]: 0.4,
        [AccessPattern.RARE]: 0.1,
      },
      ...options.config,
    };
    
    this.logger = Logger.getInstance('TierMigration');
    this.metrics = Metrics.getInstance();

    this.startScheduledMigrations();
  }

  /**
   * Start scheduled migrations based on cron schedule
   */
  private startScheduledMigrations(): void {
    if (this.config.migrationSchedule) {
      this.migrationJob = cron.schedule(
        this.config.migrationSchedule,
        async () => {
          try {
            await this.runAutomaticMigration();
          } catch (error) {
            this.logger.error('Scheduled migration failed:', error);
          }
        },
        { scheduled: false }
      );

      this.migrationJob.start();
      this.logger.info(`Scheduled migrations started with schedule: ${this.config.migrationSchedule}`);
    }
  }

  /**
   * Run automatic migration across all tiers
   */
  async runAutomaticMigration(): Promise<MigrationResult> {
    if (this.isRunning) {
      this.logger.warn('Migration already in progress, skipping');
      return {
        successful: 0,
        failed: 0,
        skipped: 0,
        errors: [{ memoryId: 'N/A', error: 'Migration already in progress' }],
        totalTime: 0,
        bytesTransferred: 0,
      };
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      this.logger.info('Starting automatic tier migration');

      // Find migration candidates
      const candidates = await this.findMigrationCandidates();
      this.logger.info(`Found ${candidates.length} migration candidates`);

      // Execute migrations in priority order
      const result = await this.executeMigrations(candidates);
      
      const totalTime = Date.now() - startTime;
      result.totalTime = totalTime;

      this.logger.info(`Migration completed: ${result.successful} successful, ${result.failed} failed, ${result.skipped} skipped (${totalTime}ms)`);
      
      // Record metrics
      this.metrics.histogram('tier_migration.duration', totalTime);
      this.metrics.increment('tier_migration.runs');
      this.metrics.gauge('tier_migration.successful', result.successful);
      this.metrics.gauge('tier_migration.failed', result.failed);
      this.metrics.gauge('tier_migration.bytes_transferred', result.bytesTransferred);

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Move specific memory to target tier
   */
  async moveMemoryToTier(memoryId: string, targetTier: StorageTier): Promise<void> {
    const startTime = Date.now();

    try {
      this.logger.info(`Moving memory ${memoryId} to ${targetTier} tier`);

      // Get current memory data
      const memory = await this.storageManager.retrieveMemory(memoryId);
      if (!memory) {
        throw new Error(`Memory ${memoryId} not found`);
      }

      // Determine current tier
      const currentTier = await this.determineCurrentTier(memoryId);
      
      if (currentTier === targetTier) {
        this.logger.debug(`Memory ${memoryId} already in ${targetTier} tier`);
        return;
      }

      // Execute tier-specific migration
      await this.migrateBetweenTiers(memory, currentTier, targetTier);

      const responseTime = Date.now() - startTime;
      this.metrics.histogram('tier_migration.single.duration', responseTime);
      this.metrics.increment(`tier_migration.${currentTier.toLowerCase()}_to_${targetTier.toLowerCase()}`);

      this.logger.info(`Successfully moved memory ${memoryId} from ${currentTier} to ${targetTier} (${responseTime}ms)`);
    } catch (error) {
      this.metrics.increment('tier_migration.single.errors');
      this.logger.error(`Failed to move memory ${memoryId} to ${targetTier}:`, error);
      throw error;
    }
  }

  /**
   * Find memories that should be migrated between tiers
   */
  private async findMigrationCandidates(): Promise<MigrationCandidate[]> {
    const candidates: MigrationCandidate[] = [];
    const now = new Date();

    try {
      // Get statistics from PostgreSQL (authoritative source)
      const stats = await this.storageManager.postgresql.getStats();
      
      // Query memories that might need migration
      const memories = await this.storageManager.postgresql.search(
        {
          // No specific filters - check all memories
        },
        {
          pageSize: 10000, // Large batch for analysis
          sortBy: 'updatedAt',
          sortOrder: 'asc', // Oldest first
        }
      );

      for (const memory of memories.results) {
        const candidate = await this.evaluateMemoryForMigration(memory, now);
        if (candidate) {
          candidates.push(candidate);
        }
      }

      // Sort by priority (higher is more urgent)
      candidates.sort((a, b) => b.priority - a.priority);
      
      return candidates.slice(0, this.config.batchSize * 3); // Allow some buffer
    } catch (error) {
      this.logger.error('Failed to find migration candidates:', error);
      return [];
    }
  }

  /**
   * Evaluate if a memory should be migrated and determine target tier
   */
  private async evaluateMemoryForMigration(
    memory: any, 
    now: Date
  ): Promise<MigrationCandidate | null> {
    try {
      const currentTier = await this.determineCurrentTier(memory.id);
      const age = Math.floor((now.getTime() - memory.createdAt.getTime()) / (1000 * 60 * 60 * 24)); // days
      const hoursSinceAccess = memory.lastAccessedAt 
        ? Math.floor((now.getTime() - memory.lastAccessedAt.getTime()) / (1000 * 60 * 60))
        : age * 24;

      // Determine access pattern based on access frequency
      let accessPattern: AccessPattern;
      if (memory.accessCount > 100) accessPattern = AccessPattern.FREQUENT;
      else if (memory.accessCount > 50) accessPattern = AccessPattern.REGULAR;
      else if (memory.accessCount > 10) accessPattern = AccessPattern.OCCASIONAL;
      else accessPattern = AccessPattern.RARE;

      // Calculate migration priority score
      const importanceWeight = this.config.importanceWeights[memory.importanceLevel] || 0.5;
      const accessWeight = this.config.accessPatternWeights[accessPattern];
      
      // Base priority on age, but adjust for importance and access patterns
      let priority = age * (1 - importanceWeight) * (1 - accessWeight);

      let targetTier: StorageTier | null = null;
      let reason = '';

      // Hot to Warm migration rules
      if (currentTier === StorageTier.HOT) {
        if (age >= this.config.hotToWarmDays || 
            (hoursSinceAccess > 24 && memory.importanceLevel === ImportanceLevel.TRANSIENT)) {
          targetTier = StorageTier.WARM;
          reason = `Hot tier memory aged ${age} days, ${hoursSinceAccess}h since last access`;
          priority += 100; // Hot tier migrations are higher priority
        }
      }

      // Warm to Cold migration rules
      if (currentTier === StorageTier.WARM) {
        if (age >= this.config.warmToColdDays && 
            memory.importanceLevel !== ImportanceLevel.CRITICAL &&
            accessPattern === AccessPattern.RARE) {
          targetTier = StorageTier.COLD;
          reason = `Warm tier memory aged ${age} days, rarely accessed`;
          priority += 50;
        }
      }

      // Cold to Warm migration rules (restore frequently accessed)
      if (currentTier === StorageTier.COLD) {
        if (memory.accessCount > 5 && hoursSinceAccess < 48) {
          targetTier = StorageTier.WARM;
          reason = `Cold tier memory recently accessed ${memory.accessCount} times`;
          priority += 200; // High priority to restore active data
        }
      }

      if (targetTier && targetTier !== currentTier) {
        return {
          memoryId: memory.id,
          currentTier,
          targetTier,
          priority,
          reason,
          metadata: {
            age,
            accessCount: memory.accessCount,
            lastAccessed: memory.lastAccessedAt || memory.createdAt,
            importance: memory.importanceLevel,
            accessPattern,
            size: JSON.stringify(memory.content).length,
          },
        };
      }

      return null;
    } catch (error) {
      this.logger.warn(`Failed to evaluate memory ${memory.id} for migration:`, error);
      return null;
    }
  }

  /**
   * Execute a batch of migrations
   */
  private async executeMigrations(candidates: MigrationCandidate[]): Promise<MigrationResult> {
    const result: MigrationResult = {
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      totalTime: 0,
      bytesTransferred: 0,
    };

    const batches = this.chunkArray(candidates, this.config.batchSize);
    
    for (const batch of batches) {
      const batchPromises = batch.map(async (candidate) => {
        try {
          if (this.config.dryRun) {
            this.logger.info(`[DRY RUN] Would migrate ${candidate.memoryId} from ${candidate.currentTier} to ${candidate.targetTier}: ${candidate.reason}`);
            result.skipped++;
            return;
          }

          await this.moveMemoryToTier(candidate.memoryId, candidate.targetTier);
          result.successful++;
          result.bytesTransferred += candidate.metadata.size;
        } catch (error) {
          result.failed++;
          result.errors.push({
            memoryId: candidate.memoryId,
            error: error.message,
          });
          this.logger.error(`Failed to migrate memory ${candidate.memoryId}:`, error);
        }
      });

      await Promise.all(batchPromises);
      
      // Small delay between batches to avoid overwhelming storage systems
      if (batches.indexOf(batch) < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return result;
  }

  /**
   * Migrate memory between specific tiers
   */
  private async migrateBetweenTiers(
    memory: any,
    fromTier: StorageTier,
    toTier: StorageTier
  ): Promise<void> {
    switch (`${fromTier}->${toTier}`) {
      case 'HOT->WARM':
        // Data already exists in PostgreSQL, just remove from Redis
        await this.storageManager.redis.delete(memory.id);
        break;

      case 'HOT->COLD':
        // Archive to S3 and remove from Redis
        await this.storageManager.s3.archive(memory);
        await this.storageManager.redis.delete(memory.id);
        // Update PostgreSQL to mark as archived
        await this.updateMemoryTierStatus(memory.id, StorageTier.COLD);
        break;

      case 'WARM->HOT':
        // Cache in Redis (data already in PostgreSQL)
        const cachedMemory = {
          id: memory.id,
          type: memory.type,
          title: memory.title,
          content: memory.content,
          metadata: memory.metadata,
          embedding: [],
          importance: memory.importanceLevel || ImportanceLevel.MEDIUM,
          accessCount: memory.accessCount || 0,
          lastAccessed: new Date(),
          createdAt: memory.createdAt,
          version: 1,
        };
        await this.storageManager.redis.store(cachedMemory);
        break;

      case 'WARM->COLD':
        // Archive to S3 and update PostgreSQL status
        await this.storageManager.s3.archive(memory);
        await this.updateMemoryTierStatus(memory.id, StorageTier.COLD);
        break;

      case 'COLD->WARM':
        // Data should already be restored to PostgreSQL
        // Just update tier status
        await this.updateMemoryTierStatus(memory.id, StorageTier.WARM);
        break;

      case 'COLD->HOT':
        // Restore to both PostgreSQL and Redis
        await this.updateMemoryTierStatus(memory.id, StorageTier.WARM);
        // Then move to hot
        await this.migrateBetweenTiers(memory, StorageTier.WARM, StorageTier.HOT);
        break;

      default:
        throw new Error(`Unsupported migration path: ${fromTier} -> ${toTier}`);
    }
  }

  /**
   * Determine which tier currently holds the authoritative copy of a memory
   */
  private async determineCurrentTier(memoryId: string): Promise<StorageTier> {
    // Check Redis first (hot tier)
    try {
      const cached = await this.storageManager.redis.retrieve(memoryId);
      if (cached) return StorageTier.HOT;
    } catch (error) {
      // Redis miss is expected
    }

    // Check PostgreSQL metadata for tier status
    try {
      const memory = await this.storageManager.postgresql.retrieve(memoryId);
      if (memory && memory.metadata.currentTier) {
        return memory.metadata.currentTier as StorageTier;
      }
      if (memory) return StorageTier.WARM; // Default if not specified
    } catch (error) {
      // Continue to check S3
    }

    // Check if in cold storage (S3)
    try {
      const s3Key = await this.getS3KeyForMemory(memoryId);
      if (s3Key) {
        const archived = await this.storageManager.s3.retrieve(s3Key);
        if (archived) return StorageTier.COLD;
      }
    } catch (error) {
      // S3 miss
    }

    throw new Error(`Memory ${memoryId} not found in any storage tier`);
  }

  /**
   * Update memory tier status in PostgreSQL
   */
  private async updateMemoryTierStatus(memoryId: string, tier: StorageTier): Promise<void> {
    try {
      await this.storageManager.postgresql.update(memoryId, {
        metadata: { currentTier: tier },
      });
    } catch (error) {
      this.logger.error(`Failed to update tier status for memory ${memoryId}:`, error);
      throw error;
    }
  }

  /**
   * Get S3 key for memory (helper method)
   */
  private async getS3KeyForMemory(memoryId: string): Promise<string | null> {
    try {
      const memory = await this.storageManager.postgresql.retrieve(memoryId);
      return memory?.metadata.s3Location as string || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Utility method to chunk array into batches
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Get migration statistics
   */
  async getMigrationStats(): Promise<{
    isRunning: boolean;
    lastRun?: Date;
    totalMigrations: number;
    successRate: number;
    averageMigrationTime: number;
    tierDistribution: Record<StorageTier, number>;
  }> {
    const stats = await this.storageManager.getStorageStats();
    
    return {
      isRunning: this.isRunning,
      lastRun: undefined, // Would track from metrics/database
      totalMigrations: this.metrics.getCounterValue('tier_migration.runs') || 0,
      successRate: 0.95, // Would calculate from actual metrics
      averageMigrationTime: this.metrics.getHistogramStats('tier_migration.duration')?.avg || 0,
      tierDistribution: stats.tierDistribution,
    };
  }

  /**
   * Stop scheduled migrations
   */
  stop(): void {
    if (this.migrationJob) {
      this.migrationJob.stop();
      this.logger.info('Scheduled migrations stopped');
    }
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    this.stop();
    
    // Wait for current migration to complete
    let attempts = 0;
    while (this.isRunning && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
    
    if (this.isRunning) {
      this.logger.warn('Migration still running after 30 seconds, forcing shutdown');
    }
    
    this.logger.info('Tier migration service shutdown complete');
  }
}