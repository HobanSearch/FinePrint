/**
 * Memory Lifecycle Service
 * Manages memory retention, archival, and cleanup based on policies
 */

import * as cron from 'node-cron';
import { StorageManager } from './storage/storage-manager';
import { 
  MemoryType, 
  ImportanceLevel, 
  StorageTier,
  LifecyclePolicies 
} from '../types';
import { Logger } from '../utils/logger';
import { Metrics } from '../utils/metrics';

export interface MemoryLifecycleConfig {
  enabled: boolean;
  cleanupSchedule: string;
  retentionPolicies: Record<MemoryType, Record<ImportanceLevel, number>>;
  archivalPolicies: {
    hotToWarm: number;
    warmToCold: number;
  };
  cleanupBatchSize: number;
  dryRun: boolean;
}

export interface LifecycleResult {
  archived: number;
  deleted: number;
  errors: number;
  totalProcessed: number;
  spaceSaved: number;
}

export class MemoryLifecycleService {
  private storageManager: StorageManager;
  private logger: Logger;
  private metrics: Metrics;
  private config: MemoryLifecycleConfig;
  private lifecycleJob?: any;
  private isRunning = false;

  constructor(options: { storageManager: StorageManager; config: MemoryLifecycleConfig }) {
    this.storageManager = options.storageManager;
    this.config = {
      retentionPolicies: {
        [MemoryType.WORKING]: {
          [ImportanceLevel.CRITICAL]: 30,
          [ImportanceLevel.HIGH]: 7,
          [ImportanceLevel.MEDIUM]: 3,
          [ImportanceLevel.LOW]: 1,
          [ImportanceLevel.TRANSIENT]: 0.5,
        },
        [MemoryType.EPISODIC]: {
          [ImportanceLevel.CRITICAL]: 365,
          [ImportanceLevel.HIGH]: 180,
          [ImportanceLevel.MEDIUM]: 90,
          [ImportanceLevel.LOW]: 30,
          [ImportanceLevel.TRANSIENT]: 7,
        },
        [MemoryType.SEMANTIC]: {
          [ImportanceLevel.CRITICAL]: -1, // Never delete
          [ImportanceLevel.HIGH]: 730,
          [ImportanceLevel.MEDIUM]: 365,
          [ImportanceLevel.LOW]: 180,
          [ImportanceLevel.TRANSIENT]: 30,
        },
        [MemoryType.PROCEDURAL]: {
          [ImportanceLevel.CRITICAL]: -1,
          [ImportanceLevel.HIGH]: 730,
          [ImportanceLevel.MEDIUM]: 365,
          [ImportanceLevel.LOW]: 180,
          [ImportanceLevel.TRANSIENT]: 90,
        },
        [MemoryType.SHARED]: {
          [ImportanceLevel.CRITICAL]: 365,
          [ImportanceLevel.HIGH]: 180,
          [ImportanceLevel.MEDIUM]: 90,
          [ImportanceLevel.LOW]: 30,
          [ImportanceLevel.TRANSIENT]: 7,
        },
        [MemoryType.BUSINESS]: {
          [ImportanceLevel.CRITICAL]: -1,
          [ImportanceLevel.HIGH]: 1095, // 3 years
          [ImportanceLevel.MEDIUM]: 730,
          [ImportanceLevel.LOW]: 365,
          [ImportanceLevel.TRANSIENT]: 90,
        },
      },
      ...options.config,
    };
    
    this.logger = Logger.getInstance('MemoryLifecycle');  
    this.metrics = Metrics.getInstance();

    if (this.config.enabled) {
      this.startScheduledLifecycle();
    }
  }

  private startScheduledLifecycle(): void {
    if (this.config.cleanupSchedule) {
      this.lifecycleJob = cron.schedule(
        this.config.cleanupSchedule,
        async () => {
          try {
            await this.runLifecycleManagement();
          } catch (error) {
            this.logger.error('Scheduled lifecycle management failed:', error);
          }
        },
        { scheduled: false }
      );

      this.lifecycleJob.start();
      this.logger.info(`Scheduled lifecycle management started: ${this.config.cleanupSchedule}`);
    }
  }

  async runLifecycleManagement(): Promise<LifecycleResult> {
    if (this.isRunning) {
      this.logger.warn('Lifecycle management already running');
      return this.createEmptyResult();
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      this.logger.info('Starting memory lifecycle management');

      const result: LifecycleResult = {
        archived: 0,
        deleted: 0,
        errors: 0,
        totalProcessed: 0,
        spaceSaved: 0,
      };

      // Process each memory type
      for (const memoryType of Object.values(MemoryType)) {
        const typeResult = await this.processMemoryType(memoryType);
        result.archived += typeResult.archived;
        result.deleted += typeResult.deleted;
        result.errors += typeResult.errors;
        result.totalProcessed += typeResult.totalProcessed;
        result.spaceSaved += typeResult.spaceSaved;
      }

      const totalTime = Date.now() - startTime;
      this.logger.info(`Lifecycle management completed: ${result.totalProcessed} processed, ${result.archived} archived, ${result.deleted} deleted (${totalTime}ms)`);

      this.metrics.histogram('memory_lifecycle.duration', totalTime);
      this.metrics.gauge('memory_lifecycle.archived', result.archived);  
      this.metrics.gauge('memory_lifecycle.deleted', result.deleted);

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  private async processMemoryType(memoryType: MemoryType): Promise<LifecycleResult> {
    const result = this.createEmptyResult();
    
    try {
      // Get memories of this type
      const searchResult = await this.storageManager.searchMemories({
        types: [memoryType],
      }, {
        pageSize: this.config.cleanupBatchSize,
        sortBy: 'createdAt',
        sortOrder: 'asc', // Oldest first
      });

      for (const memory of searchResult.results) {
        try {
          const action = await this.determineMemoryAction(memory, memoryType);
          
          switch (action) {
            case 'archive':
              if (!this.config.dryRun) {
                await this.storageManager.moveMemoryToTier(memory.id, StorageTier.COLD);
              }
              result.archived++;
              break;
              
            case 'delete':
              if (!this.config.dryRun) {
                await this.storageManager.deleteMemory(memory.id);
              }
              result.deleted++;
              result.spaceSaved += this.estimateMemorySize(memory);
              break;
              
            case 'keep':
              // No action needed
              break;
          }
          
          result.totalProcessed++;
        } catch (error) {
          result.errors++;
          this.logger.error(`Failed to process memory ${memory.id}:`, error);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to process memory type ${memoryType}:`, error);
      result.errors++;
    }

    return result;
  }

  private async determineMemoryAction(
    memory: any,
    memoryType: MemoryType
  ): Promise<'keep' | 'archive' | 'delete'> {
    const now = new Date();
    const age = Math.floor((now.getTime() - memory.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    
    // Get retention policy for this memory type and importance
    const importance = memory.importanceLevel || ImportanceLevel.MEDIUM;
    const retentionDays = this.config.retentionPolicies[memoryType]?.[importance];
    
    if (retentionDays === undefined) return 'keep';
    if (retentionDays === -1) return 'keep'; // Never delete
    
    // Check if memory should be deleted
    if (age > retentionDays) {
      return 'delete';
    }
    
    // Check if memory should be archived
    const archiveThreshold = Math.max(retentionDays * 0.5, this.config.archivalPolicies.warmToCold);
    if (age > archiveThreshold && memory.currentTier !== StorageTier.COLD) {
      return 'archive';
    }
    
    return 'keep';
  }

  private estimateMemorySize(memory: any): number {
    return JSON.stringify(memory).length;
  }

  private createEmptyResult(): LifecycleResult {
    return {
      archived: 0,
      deleted: 0,
      errors: 0,
      totalProcessed: 0,
      spaceSaved: 0,
    };
  }

  isHealthy(): boolean {
    return this.config.enabled;
  }

  async shutdown(): Promise<void> {
    if (this.lifecycleJob) {
      this.lifecycleJob.stop();
    }
    
    let attempts = 0;
    while (this.isRunning && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
    
    this.logger.info('Memory lifecycle service shutdown complete');
  }
}