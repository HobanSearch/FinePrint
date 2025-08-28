import { EventEmitter } from 'events';
import { ModelRegistry } from './model-registry';
import { PerformanceMonitor } from './performance-monitor';
export declare class ABTestingFramework extends EventEmitter {
    private modelRegistry;
    private performanceMonitor;
    constructor(modelRegistry: ModelRegistry, performanceMonitor: PerformanceMonitor);
    initialize(): Promise<void>;
    createExperiment(config: any): Promise<string>;
    getServiceMetrics(): {
        active_experiments: number;
        completed_experiments: number;
        models_compared: number;
    };
}
//# sourceMappingURL=ab-testing-framework.d.ts.map