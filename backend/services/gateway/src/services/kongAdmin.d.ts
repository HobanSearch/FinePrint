export interface KongService {
    id: string;
    name: string;
    protocol: string;
    host: string;
    port: number;
    path?: string;
    retries?: number;
    connect_timeout?: number;
    write_timeout?: number;
    read_timeout?: number;
    tags?: string[];
}
export interface KongRoute {
    id: string;
    name: string;
    protocols: string[];
    methods?: string[];
    hosts?: string[];
    paths?: string[];
    service: {
        id: string;
    };
    strip_path?: boolean;
    preserve_host?: boolean;
    tags?: string[];
}
export interface KongUpstream {
    id: string;
    name: string;
    algorithm: string;
    healthchecks?: {
        active?: {
            type: string;
            http_path: string;
            healthy: {
                interval: number;
                successes: number;
            };
            unhealthy: {
                interval: number;
                http_failures: number;
                timeouts: number;
            };
        };
        passive?: {
            healthy: {
                successes: number;
            };
            unhealthy: {
                http_failures: number;
                timeouts: number;
            };
        };
    };
    tags?: string[];
}
export interface KongTarget {
    id: string;
    upstream: {
        id: string;
    };
    target: string;
    weight: number;
    tags?: string[];
}
export interface KongPlugin {
    id: string;
    name: string;
    config: Record<string, any>;
    service?: {
        id: string;
    };
    route?: {
        id: string;
    };
    consumer?: {
        id: string;
    };
    enabled: boolean;
    tags?: string[];
}
export interface KongConsumer {
    id: string;
    username: string;
    custom_id?: string;
    tags?: string[];
}
interface KongAdminConfig {
    adminUrl: string;
    adminToken?: string;
    timeout?: number;
}
export declare class KongAdminService {
    private client;
    private config;
    constructor(config: KongAdminConfig);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    getStatus(): Promise<any>;
    getHealth(): Promise<any>;
    getServices(): Promise<KongService[]>;
    getService(id: string): Promise<KongService>;
    createService(service: Partial<KongService>): Promise<KongService>;
    updateService(id: string, service: Partial<KongService>): Promise<KongService>;
    deleteService(id: string): Promise<void>;
    getRoutes(): Promise<KongRoute[]>;
    getRoute(id: string): Promise<KongRoute>;
    createRoute(route: Partial<KongRoute>): Promise<KongRoute>;
    updateRoute(id: string, route: Partial<KongRoute>): Promise<KongRoute>;
    deleteRoute(id: string): Promise<void>;
    getUpstreams(): Promise<KongUpstream[]>;
    getUpstream(id: string): Promise<KongUpstream>;
    createUpstream(upstream: Partial<KongUpstream>): Promise<KongUpstream>;
    updateUpstream(id: string, upstream: Partial<KongUpstream>): Promise<KongUpstream>;
    deleteUpstream(id: string): Promise<void>;
    getTargets(upstreamId: string): Promise<KongTarget[]>;
    addTarget(upstreamId: string, target: Partial<KongTarget>): Promise<KongTarget>;
    updateTarget(upstreamId: string, targetId: string, target: Partial<KongTarget>): Promise<KongTarget>;
    deleteTarget(upstreamId: string, targetId: string): Promise<void>;
    getPlugins(): Promise<KongPlugin[]>;
    getPlugin(id: string): Promise<KongPlugin>;
    createPlugin(plugin: Partial<KongPlugin>): Promise<KongPlugin>;
    updatePlugin(id: string, plugin: Partial<KongPlugin>): Promise<KongPlugin>;
    deletePlugin(id: string): Promise<void>;
    getConsumers(): Promise<KongConsumer[]>;
    getConsumer(id: string): Promise<KongConsumer>;
    createConsumer(consumer: Partial<KongConsumer>): Promise<KongConsumer>;
    updateConsumer(id: string, consumer: Partial<KongConsumer>): Promise<KongConsumer>;
    deleteConsumer(id: string): Promise<void>;
    getConfigValidation(): Promise<any>;
    reloadConfiguration(): Promise<any>;
    getMetrics(): Promise<any>;
    getServicesByTag(tag: string): Promise<KongService[]>;
    getRoutesByTag(tag: string): Promise<KongRoute[]>;
    getPluginsByTag(tag: string): Promise<KongPlugin[]>;
    bulkCreateServices(services: Partial<KongService>[]): Promise<KongService[]>;
    bulkDeleteServices(serviceIds: string[]): Promise<void>;
}
export {};
//# sourceMappingURL=kongAdmin.d.ts.map