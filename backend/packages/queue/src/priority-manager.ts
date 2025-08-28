import { SubscriptionTier, PriorityConfig } from '@fineprintai/shared-types';
import { createServiceLogger } from '@fineprintai/logger';

const logger = createServiceLogger('priority-manager');

/**
 * Manages job priorities based on subscription tiers and queue configurations
 */
export class PriorityManager {
  private readonly defaultPriorityConfig: PriorityConfig = {
    [SubscriptionTier.FREE]: 1,
    [SubscriptionTier.STARTER]: 5,
    [SubscriptionTier.PROFESSIONAL]: 10,
    [SubscriptionTier.TEAM]: 15,
    [SubscriptionTier.ENTERPRISE]: 20,
  };

  private customConfigs: Map<string, PriorityConfig> = new Map();

  constructor() {
    logger.info('Priority Manager initialized');
  }

  /**
   * Set custom priority configuration for a specific queue
   */
  public setQueuePriorityConfig(queueName: string, config: Partial<PriorityConfig>): void {
    const fullConfig = { ...this.defaultPriorityConfig, ...config };
    this.customConfigs.set(queueName, fullConfig);
    
    logger.info(`Custom priority config set for queue '${queueName}'`, { config: fullConfig });
  }

  /**
   * Get priority for a job based on subscription tier and queue
   */
  public getPriority(
    subscriptionTier: SubscriptionTier = SubscriptionTier.FREE,
    queueName?: string,
    customPriority?: number
  ): number {
    // If custom priority is provided, use it (but still apply tier multiplier)
    if (customPriority !== undefined) {
      const tierMultiplier = this.getTierMultiplier(subscriptionTier);
      return customPriority * tierMultiplier;
    }

    // Use queue-specific config if available
    const config = queueName && this.customConfigs.has(queueName)
      ? this.customConfigs.get(queueName)!
      : this.defaultPriorityConfig;

    return config[subscriptionTier];
  }

  /**
   * Get multiplier for subscription tier (used for custom priorities)
   */
  private getTierMultiplier(tier: SubscriptionTier): number {
    const multipliers = {
      [SubscriptionTier.FREE]: 1,
      [SubscriptionTier.STARTER]: 2,
      [SubscriptionTier.PROFESSIONAL]: 3,
      [SubscriptionTier.TEAM]: 4,
      [SubscriptionTier.ENTERPRISE]: 5,
    };
    return multipliers[tier];
  }

  /**
   * Calculate dynamic priority based on various factors
   */
  public calculateDynamicPriority(params: {
    subscriptionTier: SubscriptionTier;
    queueName?: string;
    urgency?: 'low' | 'medium' | 'high' | 'critical';
    businessValue?: number; // 1-10 scale
    userCount?: number; // For team/enterprise accounts
    deadline?: Date;
  }): number {
    let basePriority = this.getPriority(params.subscriptionTier, params.queueName);

    // Apply urgency multiplier
    if (params.urgency) {
      const urgencyMultipliers = {
        low: 0.5,
        medium: 1,
        high: 1.5,
        critical: 2,
      };
      basePriority *= urgencyMultipliers[params.urgency];
    }

    // Apply business value modifier
    if (params.businessValue) {
      basePriority += params.businessValue;
    }

    // Apply user count bonus for team/enterprise
    if (params.userCount && params.userCount > 1) {
      const userBonus = Math.min(params.userCount * 0.1, 2); // Max 2 points bonus
      basePriority += userBonus;
    }

    // Apply deadline urgency
    if (params.deadline) {
      const now = new Date();
      const timeToDeadline = params.deadline.getTime() - now.getTime();
      const hoursToDeadline = timeToDeadline / (1000 * 60 * 60);

      if (hoursToDeadline <= 1) {
        basePriority *= 2; // Double priority if deadline is within 1 hour
      } else if (hoursToDeadline <= 24) {
        basePriority *= 1.5; // 1.5x priority if deadline is within 24 hours
      }
    }

    return Math.round(basePriority);
  }

  /**
   * Get priority configuration for a queue
   */
  public getQueuePriorityConfig(queueName: string): PriorityConfig {
    return this.customConfigs.get(queueName) || this.defaultPriorityConfig;
  }

  /**
   * Get all configured queues
   */
  public getConfiguredQueues(): string[] {
    return Array.from(this.customConfigs.keys());
  }

  /**
   * Reset queue priority configuration to default
   */
  public resetQueuePriorityConfig(queueName: string): void {
    this.customConfigs.delete(queueName);
    logger.info(`Priority config reset to default for queue '${queueName}'`);
  }

  /**
   * Get priority statistics across all tiers
   */
  public getPriorityStats(queueName?: string): {
    tier: SubscriptionTier;
    priority: number;
    percentage: number;
  }[] {
    const config = queueName && this.customConfigs.has(queueName)
      ? this.customConfigs.get(queueName)!
      : this.defaultPriorityConfig;

    const total = Object.values(config).reduce((sum, priority) => sum + priority, 0);

    return Object.entries(config).map(([tier, priority]) => ({
      tier: tier as SubscriptionTier,
      priority,
      percentage: Math.round((priority / total) * 100),
    }));
  }
}

// Export singleton
export const priorityManager = new PriorityManager();
export default priorityManager;