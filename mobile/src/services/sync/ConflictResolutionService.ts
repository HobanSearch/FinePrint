import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

interface ConflictItem {
  id: string;
  type: 'document' | 'analysis' | 'preferences' | 'annotation';
  localVersion: any;
  remoteVersion: any;
  lastModifiedLocal: string;
  lastModifiedRemote: string;
  deviceId: string;
  userId: string;
}

interface ConflictResolution {
  action: 'merge' | 'local' | 'remote' | 'manual';
  resolvedData?: any;
  conflictId: string;
}

interface MergeStrategy {
  type: string;
  priority: 'local' | 'remote' | 'latest' | 'merge';
  customMerger?: (local: any, remote: any) => any;
}

class ConflictResolutionService {
  private static instance: ConflictResolutionService;
  private pendingConflicts: ConflictItem[] = [];
  private mergeStrategies: Map<string, MergeStrategy> = new Map();

  static getInstance(): ConflictResolutionService {
    if (!ConflictResolutionService.instance) {
      ConflictResolutionService.instance = new ConflictResolutionService();
    }
    return ConflictResolutionService.instance;
  }

  /**
   * Initialize conflict resolution service
   */
  async initialize(): Promise<void> {
    try {
      await this.loadPendingConflicts();
      this.setupDefaultMergeStrategies();
      logger.info('ConflictResolutionService initialized');
    } catch (error) {
      logger.error('Failed to initialize ConflictResolutionService:', error);
    }
  }

  /**
   * Detect conflicts between local and remote data
   */
  async detectConflicts(
    type: ConflictItem['type'],
    localData: any,
    remoteData: any,
    itemId: string
  ): Promise<ConflictItem[]> {
    const conflicts: ConflictItem[] = [];

    // Check if both versions exist and have been modified
    if (localData && remoteData) {
      const localModified = new Date(localData.lastModified || localData.updatedAt);
      const remoteModified = new Date(remoteData.lastModified || remoteData.updatedAt);

      // If modification times are different, there might be a conflict
      if (Math.abs(localModified.getTime() - remoteModified.getTime()) > 1000) {
        const hasConflict = await this.hasDataConflict(type, localData, remoteData);
        
        if (hasConflict) {
          const conflict: ConflictItem = {
            id: itemId,
            type,
            localVersion: localData,
            remoteVersion: remoteData,
            lastModifiedLocal: localModified.toISOString(),
            lastModifiedRemote: remoteModified.toISOString(),
            deviceId: await this.getDeviceId(),
            userId: localData.userId || remoteData.userId,
          };

          conflicts.push(conflict);
          logger.info(`Conflict detected for ${type} ${itemId}`);
        }
      }
    }

    return conflicts;
  }

  /**
   * Resolve conflicts automatically or queue for manual resolution
   */
  async resolveConflicts(conflicts: ConflictItem[]): Promise<ConflictResolution[]> {
    const resolutions: ConflictResolution[] = [];

    for (const conflict of conflicts) {
      const strategy = this.mergeStrategies.get(conflict.type);
      
      if (strategy && strategy.priority !== 'manual') {
        const resolution = await this.autoResolveConflict(conflict, strategy);
        resolutions.push(resolution);
      } else {
        // Queue for manual resolution
        await this.queueForManualResolution(conflict);
        resolutions.push({
          action: 'manual',
          conflictId: conflict.id,
        });
      }
    }

    return resolutions;
  }

  /**
   * Get pending conflicts that require manual resolution
   */
  getPendingConflicts(): ConflictItem[] {
    return [...this.pendingConflicts];
  }

  /**
   * Manually resolve a conflict
   */
  async manuallyResolveConflict(
    conflictId: string,
    resolution: 'local' | 'remote' | 'merge',
    customData?: any
  ): Promise<ConflictResolution> {
    const conflictIndex = this.pendingConflicts.findIndex(c => c.id === conflictId);
    
    if (conflictIndex === -1) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    const conflict = this.pendingConflicts[conflictIndex];
    let resolvedData: any;

    switch (resolution) {
      case 'local':
        resolvedData = conflict.localVersion;
        break;
      case 'remote':
        resolvedData = conflict.remoteVersion;
        break;
      case 'merge':
        resolvedData = customData || await this.mergeData(conflict.type, conflict.localVersion, conflict.remoteVersion);
        break;
    }

    // Remove from pending conflicts
    this.pendingConflicts.splice(conflictIndex, 1);
    await this.savePendingConflicts();

    const conflictResolution: ConflictResolution = {
      action: resolution,
      resolvedData,
      conflictId,
    };

    logger.info(`Manually resolved conflict ${conflictId} with action: ${resolution}`);
    return conflictResolution;
  }

  /**
   * Setup default merge strategies for different data types
   */
  private setupDefaultMergeStrategies(): void {
    // Document merge strategy
    this.mergeStrategies.set('document', {
      type: 'document',
      priority: 'merge',
      customMerger: this.mergeDocuments.bind(this),
    });

    // Analysis merge strategy (latest wins)
    this.mergeStrategies.set('analysis', {
      type: 'analysis',
      priority: 'latest',
    });

    // Preferences merge strategy
    this.mergeStrategies.set('preferences', {
      type: 'preferences',
      priority: 'merge',
      customMerger: this.mergePreferences.bind(this),
    });

    // Annotations merge strategy
    this.mergeStrategies.set('annotation', {
      type: 'annotation',
      priority: 'merge',
      customMerger: this.mergeAnnotations.bind(this),
    });
  }

  /**
   * Automatically resolve conflicts based on strategy
   */
  private async autoResolveConflict(
    conflict: ConflictItem,
    strategy: MergeStrategy
  ): Promise<ConflictResolution> {
    let resolvedData: any;
    let action: ConflictResolution['action'];

    switch (strategy.priority) {
      case 'local':
        resolvedData = conflict.localVersion;
        action = 'local';
        break;
      case 'remote':
        resolvedData = conflict.remoteVersion;
        action = 'remote';
        break;
      case 'latest':
        const localTime = new Date(conflict.lastModifiedLocal).getTime();
        const remoteTime = new Date(conflict.lastModifiedRemote).getTime();
        if (localTime > remoteTime) {
          resolvedData = conflict.localVersion;
          action = 'local';
        } else {
          resolvedData = conflict.remoteVersion;
          action = 'remote';
        }
        break;
      case 'merge':
        if (strategy.customMerger) {
          resolvedData = strategy.customMerger(conflict.localVersion, conflict.remoteVersion);
        } else {
          resolvedData = await this.mergeData(conflict.type, conflict.localVersion, conflict.remoteVersion);
        }
        action = 'merge';
        break;
    }

    logger.info(`Auto-resolved conflict ${conflict.id} with action: ${action}`);
    return {
      action,
      resolvedData,
      conflictId: conflict.id,
    };
  }

  /**
   * Check if there's an actual data conflict
   */
  private async hasDataConflict(type: string, localData: any, remoteData: any): Promise<boolean> {
    switch (type) {
      case 'document':
        return this.hasDocumentConflict(localData, remoteData);
      case 'analysis':
        return this.hasAnalysisConflict(localData, remoteData);
      case 'preferences':
        return this.hasPreferencesConflict(localData, remoteData);
      case 'annotation':
        return this.hasAnnotationConflict(localData, remoteData);
      default:
        return JSON.stringify(localData) !== JSON.stringify(remoteData);
    }
  }

  /**
   * Merge different types of data
   */
  private async mergeData(type: string, local: any, remote: any): Promise<any> {
    switch (type) {
      case 'document':
        return this.mergeDocuments(local, remote);
      case 'preferences':
        return this.mergePreferences(local, remote);
      case 'annotation':
        return this.mergeAnnotations(local, remote);
      default:
        // Default merge: keep both versions with conflict markers
        return {
          ...remote,
          conflictData: {
            local,
            remote,
            mergedAt: new Date().toISOString(),
          },
        };
    }
  }

  // Type-specific conflict detection
  private hasDocumentConflict(local: any, remote: any): boolean {
    return (
      local.name !== remote.name ||
      local.content !== remote.content ||
      local.tags?.join(',') !== remote.tags?.join(',') ||
      JSON.stringify(local.metadata) !== JSON.stringify(remote.metadata)
    );
  }

  private hasAnalysisConflict(local: any, remote: any): boolean {
    return (
      local.riskScore !== remote.riskScore ||
      JSON.stringify(local.findings) !== JSON.stringify(remote.findings) ||
      local.analysisVersion !== remote.analysisVersion
    );
  }

  private hasPreferencesConflict(local: any, remote: any): boolean {
    return JSON.stringify(local) !== JSON.stringify(remote);
  }

  private hasAnnotationConflict(local: any, remote: any): boolean {
    return (
      local.content !== remote.content ||
      local.position?.x !== remote.position?.x ||
      local.position?.y !== remote.position?.y ||
      local.type !== remote.type
    );
  }

  // Type-specific merge functions
  private mergeDocuments(local: any, remote: any): any {
    const merged = { ...remote };

    // Keep the most recent analysis
    if (local.analysisResult && remote.analysisResult) {
      const localAnalysisTime = new Date(local.analysisResult.analyzedAt || 0).getTime();
      const remoteAnalysisTime = new Date(remote.analysisResult.analyzedAt || 0).getTime();
      
      if (localAnalysisTime > remoteAnalysisTime) {
        merged.analysisResult = local.analysisResult;
        merged.riskScore = local.riskScore;
      }
    }

    // Merge tags
    if (local.tags || remote.tags) {
      const localTags = local.tags || [];
      const remoteTags = remote.tags || [];
      merged.tags = [...new Set([...localTags, ...remoteTags])];
    }

    // Merge metadata
    merged.metadata = {
      ...remote.metadata,
      ...local.metadata,
    };

    merged.lastModified = new Date().toISOString();
    return merged;
  }

  private mergePreferences(local: any, remote: any): any {
    return {
      ...remote,
      ...local,
      notifications: {
        ...remote.notifications,
        ...local.notifications,
      },
      privacy: {
        ...remote.privacy,
        ...local.privacy,
      },
      lastModified: new Date().toISOString(),
    };
  }

  private mergeAnnotations(local: any, remote: any): any {
    // For annotations, keep both if they're at different positions
    if (local.position?.x !== remote.position?.x || local.position?.y !== remote.position?.y) {
      return [local, remote];
    }

    // If same position, merge content
    return {
      ...remote,
      content: `${local.content}\n---\n${remote.content}`,
      lastModified: new Date().toISOString(),
      mergedFrom: [local.id, remote.id],
    };
  }

  /**
   * Queue conflict for manual resolution
   */
  private async queueForManualResolution(conflict: ConflictItem): Promise<void> {
    this.pendingConflicts.push(conflict);
    await this.savePendingConflicts();
    logger.info(`Queued conflict ${conflict.id} for manual resolution`);
  }

  /**
   * Load pending conflicts from storage
   */
  private async loadPendingConflicts(): Promise<void> {
    try {
      const conflictsData = await AsyncStorage.getItem('pendingConflicts');
      if (conflictsData) {
        this.pendingConflicts = JSON.parse(conflictsData);
        logger.info(`Loaded ${this.pendingConflicts.length} pending conflicts`);
      }
    } catch (error) {
      logger.error('Failed to load pending conflicts:', error);
      this.pendingConflicts = [];
    }
  }

  /**
   * Save pending conflicts to storage
   */
  private async savePendingConflicts(): Promise<void> {
    try {
      await AsyncStorage.setItem('pendingConflicts', JSON.stringify(this.pendingConflicts));
    } catch (error) {
      logger.error('Failed to save pending conflicts:', error);
    }
  }

  /**
   * Get device ID for conflict tracking
   */
  private async getDeviceId(): Promise<string> {
    let deviceId = await AsyncStorage.getItem('deviceId');
    if (!deviceId) {
      deviceId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await AsyncStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
  }
}

export default ConflictResolutionService;