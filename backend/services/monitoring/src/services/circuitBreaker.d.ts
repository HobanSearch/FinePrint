import CircuitBreaker from 'opossum';
import { EventEmitter } from 'events';
interface CircuitBreakerOptions {
    timeout?: number;
    errorThresholdPercentage?: number;
    resetTimeout?: number;
    rollingCountTimeout?: number;
    rollingCountBuckets?: number;
    name?: string;
    group?: string;
    allowWarmUp?: boolean;
    volumeThreshold?: number;
}
interface CircuitBreakerStats {
    name: string;
    state: 'OPEN' | 'HALF_OPEN' | 'CLOSED';
    failureCount: number;
    successCount: number;
    rejectionCount: number;
    failureRate: number;
    averageResponseTime: number;
    lastFailureTime?: Date;
    lastSuccessTime?: Date;
}
interface CircuitBreakerGroup {
    name: string;
    breakers: Map<string, CircuitBreaker>;
    stats: {
        totalBreakers: number;
        openBreakers: number;
        halfOpenBreakers: number;
        closedBreakers: number;
    };
}
declare class CircuitBreakerService extends EventEmitter {
    private breakers;
    private groups;
    private initialized;
    private statsCollectionInterval;
    constructor();
    initialize(): Promise<void>;
    createCircuitBreaker<T extends any[], R>(name: string, action: (...args: T) => Promise<R>, options?: CircuitBreakerOptions): CircuitBreaker;
    execute<T extends any[], R>(name: string, action: (...args: T) => Promise<R>, options?: CircuitBreakerOptions): Promise<R>;
    getCircuitBreaker(name: string): CircuitBreaker | undefined;
    getAllCircuitBreakers(): Map<string, CircuitBreaker>;
    getBreakerStats(name: string): CircuitBreakerStats | undefined;
    getAllBreakerStats(): CircuitBreakerStats[];
    getGroupStats(groupName: string): CircuitBreakerGroup | undefined;
    getAllGroupStats(): CircuitBreakerGroup[];
    openCircuitBreaker(name: string): boolean;
    closeCircuitBreaker(name: string): boolean;
    resetCircuitBreaker(name: string): boolean;
    openAllBreakersInGroup(groupName: string): number;
    closeAllBreakersInGroup(groupName: string): number;
    removeCircuitBreaker(name: string): boolean;
    private setupBreakerEventListeners;
    private addBreakerToGroup;
    private updateGroupStats;
    private startStatsCollection;
    private stopStatsCollection;
    healthCheck(): Promise<void>;
    getHealthStatus(): {
        healthy: boolean;
        totalBreakers: number;
        openBreakers: number;
        halfOpenBreakers: number;
        groups: number;
        criticalBreakersOpen: string[];
    };
    updateBreakerConfig(name: string, options: Partial<CircuitBreakerOptions>): boolean;
    exportConfiguration(): Record<string, any>;
    shutdown(): Promise<void>;
}
export declare const circuitBreakerService: CircuitBreakerService;
export {};
//# sourceMappingURL=circuitBreaker.d.ts.map