import { KongAdminService } from './kongAdmin';
export interface MetricsConfig {
    kongAdmin: KongAdminService;
    prometheusPort: number;
}
export declare class MetricsService {
    private config;
    private server?;
    constructor(config: MetricsConfig);
    initialize(): Promise<void>;
    startMetricsServer(): Promise<void>;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=metrics.d.ts.map