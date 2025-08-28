"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkerScaler = void 0;
const bullmq_1 = require("bullmq");
const eventemitter3_1 = __importDefault(require("eventemitter3"));
const logger_1 = require("@fineprintai/logger");
const logger = (0, logger_1.createServiceLogger)('worker-scaler');
class WorkerScaler extends eventemitter3_1.default {
    connection;
    scalingConfigs = new Map();
    workers = new Map();
    scalingHistory = new Map();
    processorFunctions = new Map();
    scalingLocks = new Map();
    monitoringInterval = null;
    lastScaleActions = new Map();
    consecutiveScaleUps = new Map();
    consecutiveScaleDowns = new Map();
    constructor(connection) {
        super();
        this.connection = connection;
        this.startMonitoring();
        logger.info('Worker Scaler initialized');
    }
    registerQueue(queueName, config, processorFunction, initialWorkers = []) {
        this.scalingConfigs.set(queueName, config);
        this.processorFunctions.set(queueName, processorFunction);
        this.workers.set(queueName, initialWorkers);
        this.scalingHistory.set(queueName, []);
        this.scalingLocks.set(queueName, false);
        logger.info(`Queue '${queueName}' registered for auto-scaling`, { config });
    }
    async scaleWorkers(queueName, targetWorkers, trigger = 'manual') {
        const config = this.scalingConfigs.get(queueName);
        if (!config) {
            logger.error(`Queue '${queueName}' not registered for scaling`);
            return false;
        }
        const clampedTarget = Math.min(Math.max(targetWorkers, config.minWorkers), config.maxWorkers);
        if (clampedTarget !== targetWorkers) {
            logger.warn(`Target workers clamped for queue '${queueName}'`, {
                requested: targetWorkers,
                clamped: clampedTarget,
                min: config.minWorkers,
                max: config.maxWorkers,
            });
        }
        const currentWorkers = this.getActiveWorkerCount(queueName);
        if (clampedTarget === currentWorkers) {
            logger.debug(`No scaling needed for queue '${queueName}' - already at target`, {
                current: currentWorkers,
                target: clampedTarget,
            });
            return true;
        }
        const action = clampedTarget > currentWorkers ? 'scale_up' : 'scale_down';
        return await this.executeScaling(queueName, clampedTarget, trigger, action);
    }
    async evaluateScaling(queueName, metrics) {
        const config = this.scalingConfigs.get(queueName);
        if (!config)
            return false;
        if (this.scalingLocks.get(queueName)) {
            return false;
        }
        const currentWorkers = this.getActiveWorkerCount(queueName);
        const lastScaleAction = this.lastScaleActions.get(queueName);
        const now = new Date();
        if (this.shouldScaleUp(metrics, config, currentWorkers)) {
            if (lastScaleAction && now.getTime() - lastScaleAction.getTime() < config.scaleUpDelay) {
                logger.debug(`Scale-up delayed for queue '${queueName}'`, {
                    timeSinceLastAction: now.getTime() - lastScaleAction.getTime(),
                    requiredDelay: config.scaleUpDelay,
                });
                return false;
            }
            const targetWorkers = this.calculateScaleUpTarget(queueName, currentWorkers, metrics, config);
            return await this.executeScaling(queueName, targetWorkers, 'queue_depth', 'scale_up');
        }
        if (this.shouldScaleDown(metrics, config, currentWorkers)) {
            if (lastScaleAction && now.getTime() - lastScaleAction.getTime() < config.scaleDownDelay) {
                logger.debug(`Scale-down delayed for queue '${queueName}'`, {
                    timeSinceLastAction: now.getTime() - lastScaleAction.getTime(),
                    requiredDelay: config.scaleDownDelay,
                });
                return false;
            }
            const targetWorkers = this.calculateScaleDownTarget(queueName, currentWorkers, metrics, config);
            return await this.executeScaling(queueName, targetWorkers, 'queue_depth', 'scale_down');
        }
        return false;
    }
    getWorkerInfo(queueName) {
        return this.workers.get(queueName) || [];
    }
    getScalingHistory(queueName, limit = 50) {
        const history = this.scalingHistory.get(queueName) || [];
        return history.slice(-limit);
    }
    getScalingStats(queueName) {
        const config = this.scalingConfigs.get(queueName);
        const history = this.scalingHistory.get(queueName) || [];
        const currentWorkers = this.getActiveWorkerCount(queueName);
        const totalScaleUps = history.filter(event => event.action === 'scale_up').length;
        const totalScaleDowns = history.filter(event => event.action === 'scale_down').length;
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentHistory = history.filter(event => event.timestamp > oneDayAgo);
        const avgWorkersLast24h = recentHistory.length > 0
            ? recentHistory.reduce((sum, event) => sum + event.targetWorkers, 0) / recentHistory.length
            : currentWorkers;
        return {
            currentWorkers,
            minWorkers: config?.minWorkers || 1,
            maxWorkers: config?.maxWorkers || 10,
            totalScaleUps,
            totalScaleDowns,
            lastScaleAction: this.lastScaleActions.get(queueName),
            avgWorkersLast24h: Math.round(avgWorkersLast24h),
        };
    }
    addWorker(queueName, worker, workerId) {
        const workerInfo = {
            id: workerId || `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: `${queueName}-${workerId || 'auto'}`,
            worker,
            startTime: new Date(),
            jobsProcessed: 0,
            lastActivity: new Date(),
            status: 'active',
        };
        this.setupWorkerListeners(queueName, workerInfo);
        if (!this.workers.has(queueName)) {
            this.workers.set(queueName, []);
        }
        this.workers.get(queueName).push(workerInfo);
        logger.info(`Worker added to queue '${queueName}'`, { workerId: workerInfo.id });
        this.emit('worker:added', { queueName, workerId: workerInfo.id });
        return workerInfo;
    }
    async removeWorker(queueName, workerId) {
        const workers = this.workers.get(queueName);
        if (!workers || workers.length === 0)
            return false;
        const workerToRemove = workerId
            ? workers.find(w => w.id === workerId)
            : workers
                .filter(w => w.status !== 'closing')
                .sort((a, b) => a.lastActivity.getTime() - b.lastActivity.getTime())[0];
        if (!workerToRemove)
            return false;
        try {
            workerToRemove.status = 'closing';
            await workerToRemove.worker.close();
            const index = workers.indexOf(workerToRemove);
            if (index > -1) {
                workers.splice(index, 1);
            }
            logger.info(`Worker removed from queue '${queueName}'`, { workerId: workerToRemove.id });
            this.emit('worker:removed', { queueName, workerId: workerToRemove.id });
            return true;
        }
        catch (error) {
            logger.error(`Failed to remove worker from queue '${queueName}'`, {
                workerId: workerToRemove.id,
                error,
            });
            return false;
        }
    }
    shouldScaleUp(metrics, config, currentWorkers) {
        if (currentWorkers >= config.maxWorkers)
            return false;
        if (metrics.waitingJobs > config.scaleUpThreshold) {
            return true;
        }
        return false;
    }
    shouldScaleDown(metrics, config, currentWorkers) {
        if (currentWorkers <= config.minWorkers)
            return false;
        if (metrics.waitingJobs < config.scaleDownThreshold && metrics.activeJobs < currentWorkers / 2) {
            return true;
        }
        return false;
    }
    calculateScaleUpTarget(queueName, currentWorkers, metrics, config) {
        const consecutiveScaleUps = this.consecutiveScaleUps.get(queueName) || 0;
        let increment = 1;
        if (consecutiveScaleUps > 2) {
            increment = Math.min(Math.ceil(metrics.waitingJobs / 100), 3);
        }
        const target = Math.min(currentWorkers + increment, config.maxWorkers);
        this.consecutiveScaleUps.set(queueName, consecutiveScaleUps + 1);
        this.consecutiveScaleDowns.set(queueName, 0);
        return target;
    }
    calculateScaleDownTarget(queueName, currentWorkers, metrics, config) {
        const consecutiveScaleDowns = this.consecutiveScaleDowns.get(queueName) || 0;
        let decrement = 1;
        if (consecutiveScaleDowns > 3 && metrics.waitingJobs === 0) {
            decrement = Math.min(Math.ceil(currentWorkers * 0.3), 2);
        }
        const target = Math.max(currentWorkers - decrement, config.minWorkers);
        this.consecutiveScaleDowns.set(queueName, consecutiveScaleDowns + 1);
        this.consecutiveScaleUps.set(queueName, 0);
        return target;
    }
    async executeScaling(queueName, targetWorkers, trigger, action) {
        this.scalingLocks.set(queueName, true);
        try {
            const currentWorkers = this.getActiveWorkerCount(queueName);
            const processorFunction = this.processorFunctions.get(queueName);
            if (!processorFunction) {
                logger.error(`No processor function found for queue '${queueName}'`);
                return false;
            }
            logger.info(`Executing scaling for queue '${queueName}'`, {
                action,
                currentWorkers,
                targetWorkers,
                trigger,
            });
            let success = true;
            if (action === 'scale_up') {
                const workersToAdd = targetWorkers - currentWorkers;
                for (let i = 0; i < workersToAdd; i++) {
                    try {
                        const worker = new bullmq_1.Worker(queueName, processorFunction, {
                            connection: this.connection,
                            concurrency: 1,
                        });
                        this.addWorker(queueName, worker);
                    }
                    catch (error) {
                        logger.error(`Failed to add worker ${i + 1} for queue '${queueName}'`, { error });
                        success = false;
                    }
                }
            }
            else {
                const workersToRemove = currentWorkers - targetWorkers;
                for (let i = 0; i < workersToRemove; i++) {
                    const removed = await this.removeWorker(queueName);
                    if (!removed) {
                        logger.error(`Failed to remove worker ${i + 1} for queue '${queueName}'`);
                        success = false;
                    }
                }
            }
            const scalingEvent = {
                queueName,
                action,
                currentWorkers,
                targetWorkers,
                trigger,
                timestamp: new Date(),
            };
            this.recordScalingEvent(queueName, scalingEvent);
            this.lastScaleActions.set(queueName, new Date());
            this.emit('scaling:completed', scalingEvent);
            return success;
        }
        finally {
            this.scalingLocks.set(queueName, false);
        }
    }
    getActiveWorkerCount(queueName) {
        const workers = this.workers.get(queueName) || [];
        return workers.filter(worker => worker.status === 'active').length;
    }
    setupWorkerListeners(queueName, workerInfo) {
        workerInfo.worker.on('completed', () => {
            workerInfo.jobsProcessed++;
            workerInfo.lastActivity = new Date();
            workerInfo.status = 'active';
        });
        workerInfo.worker.on('failed', () => {
            workerInfo.lastActivity = new Date();
        });
        workerInfo.worker.on('error', (error) => {
            logger.error(`Worker error in queue '${queueName}'`, {
                workerId: workerInfo.id,
                error: error.message,
            });
        });
        workerInfo.worker.on('stalled', () => {
            workerInfo.lastActivity = new Date();
            logger.warn(`Worker stalled in queue '${queueName}'`, {
                workerId: workerInfo.id,
            });
        });
    }
    recordScalingEvent(queueName, event) {
        if (!this.scalingHistory.has(queueName)) {
            this.scalingHistory.set(queueName, []);
        }
        const history = this.scalingHistory.get(queueName);
        history.push(event);
        if (history.length > 1000) {
            history.splice(0, history.length - 1000);
        }
        logger.info(`Scaling event recorded for queue '${queueName}'`, event);
    }
    startMonitoring() {
        this.monitoringInterval = setInterval(() => {
            this.monitorWorkerHealth();
        }, 30000);
        logger.info('Worker health monitoring started');
    }
    monitorWorkerHealth() {
        for (const [queueName, workers] of this.workers) {
            const now = new Date();
            workers.forEach(workerInfo => {
                const inactiveTime = now.getTime() - workerInfo.lastActivity.getTime();
                if (inactiveTime > 10 * 60 * 1000) {
                    workerInfo.status = 'idle';
                    logger.warn(`Worker marked as idle in queue '${queueName}'`, {
                        workerId: workerInfo.id,
                        inactiveTime: Math.round(inactiveTime / 1000),
                    });
                }
            });
        }
    }
    async close() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        for (const [queueName, workers] of this.workers) {
            for (const workerInfo of workers) {
                try {
                    await workerInfo.worker.close();
                }
                catch (error) {
                    logger.error(`Failed to close worker in queue '${queueName}'`, {
                        workerId: workerInfo.id,
                        error,
                    });
                }
            }
        }
        logger.info('Worker Scaler closed');
    }
}
exports.WorkerScaler = WorkerScaler;
exports.default = WorkerScaler;
//# sourceMappingURL=worker-scaler.js.map