import { EventEmitter } from 'events';
export declare class ResourceManager extends EventEmitter {
    constructor();
    initialize(): Promise<void>;
    startOptimization(): Promise<void>;
    stop(): Promise<void>;
}
//# sourceMappingURL=resource-manager.d.ts.map