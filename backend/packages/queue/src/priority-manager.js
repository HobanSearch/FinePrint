"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.priorityManager = exports.PriorityManager = void 0;
const types_1 = require("@fineprintai/types");
const logger_1 = require("@fineprintai/logger");
const logger = (0, logger_1.createServiceLogger)('priority-manager');
class PriorityManager {
    defaultPriorityConfig = {
        [types_1.SubscriptionTier.FREE]: 1,
        [types_1.SubscriptionTier.STARTER]: 5,
        [types_1.SubscriptionTier.PROFESSIONAL]: 10,
        [types_1.SubscriptionTier.TEAM]: 15,
        [types_1.SubscriptionTier.ENTERPRISE]: 20,
    };
    customConfigs = new Map();
    constructor() {
        logger.info('Priority Manager initialized');
    }
    setQueuePriorityConfig(queueName, config) {
        const fullConfig = { ...this.defaultPriorityConfig, ...config };
        this.customConfigs.set(queueName, fullConfig);
        logger.info(`Custom priority config set for queue '${queueName}'`, { config: fullConfig });
    }
    getPriority(subscriptionTier = types_1.SubscriptionTier.FREE, queueName, customPriority) {
        if (customPriority !== undefined) {
            const tierMultiplier = this.getTierMultiplier(subscriptionTier);
            return customPriority * tierMultiplier;
        }
        const config = queueName && this.customConfigs.has(queueName)
            ? this.customConfigs.get(queueName)
            : this.defaultPriorityConfig;
        return config[subscriptionTier];
    }
    getTierMultiplier(tier) {
        const multipliers = {
            [types_1.SubscriptionTier.FREE]: 1,
            [types_1.SubscriptionTier.STARTER]: 2,
            [types_1.SubscriptionTier.PROFESSIONAL]: 3,
            [types_1.SubscriptionTier.TEAM]: 4,
            [types_1.SubscriptionTier.ENTERPRISE]: 5,
        };
        return multipliers[tier];
    }
    calculateDynamicPriority(params) {
        let basePriority = this.getPriority(params.subscriptionTier, params.queueName);
        if (params.urgency) {
            const urgencyMultipliers = {
                low: 0.5,
                medium: 1,
                high: 1.5,
                critical: 2,
            };
            basePriority *= urgencyMultipliers[params.urgency];
        }
        if (params.businessValue) {
            basePriority += params.businessValue;
        }
        if (params.userCount && params.userCount > 1) {
            const userBonus = Math.min(params.userCount * 0.1, 2);
            basePriority += userBonus;
        }
        if (params.deadline) {
            const now = new Date();
            const timeToDeadline = params.deadline.getTime() - now.getTime();
            const hoursToDeadline = timeToDeadline / (1000 * 60 * 60);
            if (hoursToDeadline <= 1) {
                basePriority *= 2;
            }
            else if (hoursToDeadline <= 24) {
                basePriority *= 1.5;
            }
        }
        return Math.round(basePriority);
    }
    getQueuePriorityConfig(queueName) {
        return this.customConfigs.get(queueName) || this.defaultPriorityConfig;
    }
    getConfiguredQueues() {
        return Array.from(this.customConfigs.keys());
    }
    resetQueuePriorityConfig(queueName) {
        this.customConfigs.delete(queueName);
        logger.info(`Priority config reset to default for queue '${queueName}'`);
    }
    getPriorityStats(queueName) {
        const config = queueName && this.customConfigs.has(queueName)
            ? this.customConfigs.get(queueName)
            : this.defaultPriorityConfig;
        const total = Object.values(config).reduce((sum, priority) => sum + priority, 0);
        return Object.entries(config).map(([tier, priority]) => ({
            tier: tier,
            priority,
            percentage: Math.round((priority / total) * 100),
        }));
    }
}
exports.PriorityManager = PriorityManager;
exports.priorityManager = new PriorityManager();
exports.default = exports.priorityManager;
//# sourceMappingURL=priority-manager.js.map