import { Worker } from 'bullmq';
import Redis from 'ioredis';
import EventEmitter from 'eventemitter3';
import { createServiceLogger } from '@fineprintai/logger';
import { WorkerScalingConfig, QueueMetrics } from '@fineprintai/shared-types';

const logger = createServiceLogger('worker-scaler');

export interface ScalingEvent {
  queueName: string;
  action: 'scale_up' | 'scale_down';
  currentWorkers: number;
  targetWorkers: number;
  trigger: 'queue_depth' | 'cpu_usage' | 'memory_usage' | 'manual';
  timestamp: Date;
}

export interface WorkerInfo {
  id: string;
  name: string;
  worker: Worker;
  startTime: Date;
  jobsProcessed: number;
  lastActivity: Date;
  status: 'active' | 'idle' | 'closing';
}

/**
 * Handles automatic scaling of workers based on queue metrics and system load
 */
export class WorkerScaler extends EventEmitter {
  private connection: Redis;
  private scalingConfigs: Map<string, WorkerScalingConfig> = new Map();
  private workers: Map<string, WorkerInfo[]> = new Map();
  private scalingHistory: Map<string, ScalingEvent[]> = new Map();
  private processorFunctions: Map<string, Function> = new Map();
  private scalingLocks: Map<string, boolean> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;

  // Scaling metrics
  private lastScaleActions: Map<string, Date> = new Map();
  private consecutiveScaleUps: Map<string, number> = new Map();
  private consecutiveScaleDowns: Map<string, number> = new Map();

  constructor(connection: Redis) {
    super();
    this.connection = connection;
    this.startMonitoring();
    logger.info('Worker Scaler initialized');
  }

  /**
   * Register a queue for auto-scaling
   */
  public registerQueue(
    queueName: string,
    config: WorkerScalingConfig,
    processorFunction: Function,
    initialWorkers: WorkerInfo[] = []
  ): void {
    this.scalingConfigs.set(queueName, config);
    this.processorFunctions.set(queueName, processorFunction);
    this.workers.set(queueName, initialWorkers);
    this.scalingHistory.set(queueName, []);
    this.scalingLocks.set(queueName, false);

    logger.info(`Queue '${queueName}' registered for auto-scaling`, { config });
  }

  /**
   * Manual scaling trigger
   */
  public async scaleWorkers(
    queueName: string,
    targetWorkers: number,
    trigger: 'manual' = 'manual'
  ): Promise<boolean> {
    const config = this.scalingConfigs.get(queueName);
    if (!config) {
      logger.error(`Queue '${queueName}' not registered for scaling`);
      return false;
    }

    // Validate target within bounds
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

  /**
   * Check if scaling is needed based on queue metrics
   */
  public async evaluateScaling(queueName: string, metrics: QueueMetrics): Promise<boolean> {
    const config = this.scalingConfigs.get(queueName);
    if (!config) return false;

    // Check if we're already scaling
    if (this.scalingLocks.get(queueName)) {
      return false;
    }

    const currentWorkers = this.getActiveWorkerCount(queueName);
    const lastScaleAction = this.lastScaleActions.get(queueName);
    const now = new Date();

    // Check scale-up conditions
    if (this.shouldScaleUp(metrics, config, currentWorkers)) {
      // Respect scale-up delay
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

    // Check scale-down conditions
    if (this.shouldScaleDown(metrics, config, currentWorkers)) {
      // Respect scale-down delay
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

  /**
   * Get current worker information for a queue
   */
  public getWorkerInfo(queueName: string): WorkerInfo[] {
    return this.workers.get(queueName) || [];
  }

  /**
   * Get scaling history for a queue
   */
  public getScalingHistory(queueName: string, limit: number = 50): ScalingEvent[] {
    const history = this.scalingHistory.get(queueName) || [];
    return history.slice(-limit);
  }

  /**
   * Get scaling statistics
   */
  public getScalingStats(queueName: string): {
    currentWorkers: number;
    minWorkers: number;
    maxWorkers: number;
    totalScaleUps: number;
    totalScaleDowns: number;
    lastScaleAction?: Date;
    avgWorkersLast24h: number;
  } {
    const config = this.scalingConfigs.get(queueName);
    const history = this.scalingHistory.get(queueName) || [];
    const currentWorkers = this.getActiveWorkerCount(queueName);

    // Calculate scale action counts
    const totalScaleUps = history.filter(event => event.action === 'scale_up').length;
    const totalScaleDowns = history.filter(event => event.action === 'scale_down').length;

    // Calculate average workers over last 24 hours
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

  /**
   * Add a worker to the pool
   */
  public addWorker(queueName: string, worker: Worker, workerId?: string): WorkerInfo {
    const workerInfo: WorkerInfo = {
      id: workerId || `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `${queueName}-${workerId || 'auto'}`,
      worker,
      startTime: new Date(),
      jobsProcessed: 0,
      lastActivity: new Date(),
      status: 'active',
    };

    // Set up worker event listeners
    this.setupWorkerListeners(queueName, workerInfo);

    if (!this.workers.has(queueName)) {
      this.workers.set(queueName, []);
    }
    this.workers.get(queueName)!.push(workerInfo);

    logger.info(`Worker added to queue '${queueName}'`, { workerId: workerInfo.id });
    this.emit('worker:added', { queueName, workerId: workerInfo.id });

    return workerInfo;
  }

  /**
   * Remove a worker from the pool
   */
  public async removeWorker(queueName: string, workerId?: string): Promise<boolean> {
    const workers = this.workers.get(queueName);
    if (!workers || workers.length === 0) return false;

    // Select worker to remove (LRU if no specific ID provided)
    const workerToRemove = workerId
      ? workers.find(w => w.id === workerId)
      : workers
          .filter(w => w.status !== 'closing')
          .sort((a, b) => a.lastActivity.getTime() - b.lastActivity.getTime())[0];

    if (!workerToRemove) return false;

    try {
      workerToRemove.status = 'closing';
      await workerToRemove.worker.close();

      // Remove from workers array
      const index = workers.indexOf(workerToRemove);
      if (index > -1) {
        workers.splice(index, 1);
      }

      logger.info(`Worker removed from queue '${queueName}'`, { workerId: workerToRemove.id });
      this.emit('worker:removed', { queueName, workerId: workerToRemove.id });

      return true;
    } catch (error) {
      logger.error(`Failed to remove worker from queue '${queueName}'`, {
        workerId: workerToRemove.id,
        error,
      });
      return false;
    }
  }

  // Private methods

  private shouldScaleUp(
    metrics: QueueMetrics,
    config: WorkerScalingConfig,
    currentWorkers: number
  ): boolean {
    if (currentWorkers >= config.maxWorkers) return false;

    // Primary condition: queue depth
    if (metrics.waitingJobs > config.scaleUpThreshold) {
      return true;
    }

    // Secondary conditions could be added here (CPU usage, memory, etc.)
    return false;
  }

  private shouldScaleDown(
    metrics: QueueMetrics,
    config: WorkerScalingConfig,
    currentWorkers: number
  ): boolean {
    if (currentWorkers <= config.minWorkers) return false;

    // Primary condition: low queue depth and low activity
    if (metrics.waitingJobs < config.scaleDownThreshold && metrics.activeJobs < currentWorkers / 2) {
      return true;
    }

    return false;
  }

  private calculateScaleUpTarget(
    queueName: string,
    currentWorkers: number,
    metrics: QueueMetrics,
    config: WorkerScalingConfig
  ): number {
    const consecutiveScaleUps = this.consecutiveScaleUps.get(queueName) || 0;
    
    // Progressive scaling: start with small increments, increase if needed
    let increment = 1;
    if (consecutiveScaleUps > 2) {
      increment = Math.min(Math.ceil(metrics.waitingJobs / 100), 3); // Max 3 workers at once
    }

    const target = Math.min(currentWorkers + increment, config.maxWorkers);
    
    // Update consecutive counter
    this.consecutiveScaleUps.set(queueName, consecutiveScaleUps + 1);
    this.consecutiveScaleDowns.set(queueName, 0);

    return target;
  }

  private calculateScaleDownTarget(
    queueName: string,
    currentWorkers: number,
    metrics: QueueMetrics,
    config: WorkerScalingConfig
  ): number {
    const consecutiveScaleDowns = this.consecutiveScaleDowns.get(queueName) || 0;
    
    // Conservative scaling down: usually remove 1 worker at a time
    let decrement = 1;
    if (consecutiveScaleDowns > 3 && metrics.waitingJobs === 0) {
      decrement = Math.min(Math.ceil(currentWorkers * 0.3), 2); // Max 30% or 2 workers
    }

    const target = Math.max(currentWorkers - decrement, config.minWorkers);
    
    // Update consecutive counter
    this.consecutiveScaleDowns.set(queueName, consecutiveScaleDowns + 1);
    this.consecutiveScaleUps.set(queueName, 0);

    return target;
  }

  private async executeScaling(
    queueName: string,
    targetWorkers: number,
    trigger: ScalingEvent['trigger'],
    action: ScalingEvent['action']
  ): Promise<boolean> {
    // Set scaling lock
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
        // Add workers
        const workersToAdd = targetWorkers - currentWorkers;
        for (let i = 0; i < workersToAdd; i++) {
          try {
            const worker = new Worker(queueName, processorFunction, {
              connection: this.connection,
              concurrency: 1, // Each worker handles 1 job at a time for better scaling control
            });
            this.addWorker(queueName, worker);
          } catch (error) {
            logger.error(`Failed to add worker ${i + 1} for queue '${queueName}'`, { error });
            success = false;
          }
        }
      } else {
        // Remove workers
        const workersToRemove = currentWorkers - targetWorkers;
        for (let i = 0; i < workersToRemove; i++) {
          const removed = await this.removeWorker(queueName);
          if (!removed) {
            logger.error(`Failed to remove worker ${i + 1} for queue '${queueName}'`);
            success = false;
          }
        }
      }

      // Record scaling event
      const scalingEvent: ScalingEvent = {
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
    } finally {
      // Release scaling lock
      this.scalingLocks.set(queueName, false);
    }
  }

  private getActiveWorkerCount(queueName: string): number {
    const workers = this.workers.get(queueName) || [];
    return workers.filter(worker => worker.status === 'active').length;
  }

  private setupWorkerListeners(queueName: string, workerInfo: WorkerInfo): void {
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

  private recordScalingEvent(queueName: string, event: ScalingEvent): void {
    if (!this.scalingHistory.has(queueName)) {
      this.scalingHistory.set(queueName, []);
    }

    const history = this.scalingHistory.get(queueName)!;
    history.push(event);

    // Keep only last 1000 events
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }

    logger.info(`Scaling event recorded for queue '${queueName}'`, event);
  }

  private startMonitoring(): void {
    // Monitor worker health every 30 seconds
    this.monitoringInterval = setInterval(() => {
      this.monitorWorkerHealth();
    }, 30000);

    logger.info('Worker health monitoring started');
  }

  private monitorWorkerHealth(): void {
    for (const [queueName, workers] of this.workers) {
      const now = new Date();
      
      workers.forEach(workerInfo => {
        // Check for inactive workers (no activity for 10 minutes)
        const inactiveTime = now.getTime() - workerInfo.lastActivity.getTime();
        if (inactiveTime > 10 * 60 * 1000) { // 10 minutes
          workerInfo.status = 'idle';
          
          logger.warn(`Worker marked as idle in queue '${queueName}'`, {
            workerId: workerInfo.id,
            inactiveTime: Math.round(inactiveTime / 1000),
          });
        }
      });
    }
  }

  public async close(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Close all workers
    for (const [queueName, workers] of this.workers) {
      for (const workerInfo of workers) {
        try {
          await workerInfo.worker.close();
        } catch (error) {
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

export default WorkerScaler;