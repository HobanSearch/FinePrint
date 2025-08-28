import { EventEmitter } from 'events';
export interface ResourceUsage {
    gpu_utilization: number;
    gpu_memory_used: number;
    gpu_memory_total: number;
    cpu_utilization: number;
    memory_used_mb: number;
    disk_usage_mb: number;
}
export declare class ResourceOptimizer extends EventEmitter {
    private cache;
    private optimizationInterval?;
    constructor();
    initialize(): Promise<void>;
    getResourceUsage(): Promise<ResourceUsage>;
    startOptimizationScheduler(): Promise<void>;
    stopOptimizationScheduler(): Promise<void>;
}
//# sourceMappingURL=resource-optimizer.d.ts.map