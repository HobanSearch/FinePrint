import { SubscriptionTier, PriorityConfig } from '@fineprintai/shared-types';
export declare class PriorityManager {
    private readonly defaultPriorityConfig;
    private customConfigs;
    constructor();
    setQueuePriorityConfig(queueName: string, config: Partial<PriorityConfig>): void;
    getPriority(subscriptionTier?: SubscriptionTier, queueName?: string, customPriority?: number): number;
    private getTierMultiplier;
    calculateDynamicPriority(params: {
        subscriptionTier: SubscriptionTier;
        queueName?: string;
        urgency?: 'low' | 'medium' | 'high' | 'critical';
        businessValue?: number;
        userCount?: number;
        deadline?: Date;
    }): number;
    getQueuePriorityConfig(queueName: string): PriorityConfig;
    getConfiguredQueues(): string[];
    resetQueuePriorityConfig(queueName: string): void;
    getPriorityStats(queueName?: string): {
        tier: SubscriptionTier;
        priority: number;
        percentage: number;
    }[];
}
export declare const priorityManager: PriorityManager;
export default priorityManager;
//# sourceMappingURL=priority-manager.d.ts.map