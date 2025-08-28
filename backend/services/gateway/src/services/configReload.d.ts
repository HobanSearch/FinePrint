import { KongAdminService } from './kongAdmin';
export interface ConfigReloadConfig {
    kongAdmin: KongAdminService;
    configPath: string;
    watchInterval: number;
}
export declare class ConfigReloadService {
    private config;
    private watcher?;
    private intervalId?;
    constructor(config: ConfigReloadConfig);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    private checkConfigChanges;
}
//# sourceMappingURL=configReload.d.ts.map