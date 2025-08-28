import { EventEmitter } from 'events';
import { ModelLifecycleManager } from './model-lifecycle-manager';
import { HyperparameterOptimizer } from './hyperparameter-optimizer';
import { ModelRegistry } from './model-registry';
export declare class AutoMLPipeline extends EventEmitter {
    private modelLifecycleManager;
    private hyperparameterOptimizer;
    private modelRegistry;
    constructor(modelLifecycleManager: ModelLifecycleManager, hyperparameterOptimizer: HyperparameterOptimizer, modelRegistry: ModelRegistry);
    initialize(): Promise<void>;
    startAutoMLPipeline(config: any): Promise<string>;
    getServiceMetrics(): {
        pipelines_running: number;
        pipelines_completed: number;
        avg_pipeline_duration_hours: number;
    };
}
//# sourceMappingURL=automl-pipeline.d.ts.map