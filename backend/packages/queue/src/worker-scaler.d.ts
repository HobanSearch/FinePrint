import { Worker } from 'bullmq';
import Redis from 'ioredis';
import EventEmitter from 'eventemitter3';
import { WorkerScalingConfig, QueueMetrics } from '@fineprintai/shared-types';
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
export declare class WorkerScaler extends EventEmitter {
    private connection;
    private scalingConfigs;
    private workers;
    private scalingHistory;
    private processorFunctions;
    private scalingLocks;
    private monitoringInterval;
    private lastScaleActions;
    private consecutiveScaleUps;
    private consecutiveScaleDowns;
    constructor(connection: Redis);
    registerQueue(queueName: string, config: WorkerScalingConfig, processorFunction: Function, initialWorkers?: WorkerInfo[]): void;
    scaleWorkers(queueName: string, targetWorkers: number, trigger?: 'manual'): Promise<boolean>;
    evaluateScaling(queueName: string, metrics: QueueMetrics): Promise<boolean>;
    getWorkerInfo(queueName: string): WorkerInfo[];
    getScalingHistory(queueName: string, limit?: number): ScalingEvent[];
    getScalingStats(queueName: string): {
        currentWorkers: number;
        minWorkers: number;
        maxWorkers: number;
        totalScaleUps: number;
        totalScaleDowns: number;
        lastScaleAction?: Date;
        avgWorkersLast24h: number;
    };
    addWorker(queueName: string, worker: Worker, workerId?: string): WorkerInfo;
    removeWorker(queueName: string, workerId?: string): Promise<boolean>;
    private shouldScaleUp;
    private shouldScaleDown;
    private calculateScaleUpTarget;
    private calculateScaleDownTarget;
    private executeScaling;
    private getActiveWorkerCount;
    private setupWorkerListeners;
    private recordScalingEvent;
    private startMonitoring;
    private monitorWorkerHealth;
    close(): Promise<void>;
}
export default WorkerScaler;
//# sourceMappingURL=worker-scaler.d.ts.map