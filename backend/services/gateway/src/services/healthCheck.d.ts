import { KongAdminService } from './kongAdmin';
export interface HealthCheckConfig {
    kongAdmin: KongAdminService;
    services: string[];
    redisUrl: string;
    checkInterval: number;
}
export interface ServiceHealth {
    name: string;
    status: 'healthy' | 'unhealthy' | 'degraded';
    responseTime?: number;
    error?: string;
    lastCheck: Date;
    consecutiveFailures: number;
    uptime?: string;
}
export interface SystemHealth {
    overall: 'healthy' | 'unhealthy' | 'degraded';
    kong: {
        status: 'healthy' | 'unhealthy';
        version?: string;
        plugins?: number;
        uptime?: number;
    };
    redis: {
        status: 'healthy' | 'unhealthy';
        latency?: number;
        memory?: string;
        connections?: number;
    };
    services: ServiceHealth[];
    lastUpdate: Date;
}
export declare class HealthCheckService {
    private config;
    private redis;
    private intervalId?;
    private healthStatus;
    private readonly maxConsecutiveFailures;
    constructor(config: HealthCheckConfig);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    private performHealthChecks;
    private checkKongHealth;
    private checkRedisHealth;
    private checkBackendServices;
    private updateOverallHealth;
    private storeHealthStatus;
    private getServicePort;
    getHealthStatus(): SystemHealth;
    getServiceHealth(serviceName: string): ServiceHealth | undefined;
    isHealthy(): boolean;
    isReady(): boolean;
    triggerHealthCheck(): Promise<SystemHealth>;
    getHealthHistory(hours?: number): Promise<any[]>;
}
//# sourceMappingURL=healthCheck.d.ts.map