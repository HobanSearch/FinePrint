import { EventEmitter } from 'events';
import { ModelLifecycleManager } from './model-lifecycle-manager';
import { HyperparameterOptimizer } from './hyperparameter-optimizer';
import { ModelRegistry } from './model-registry';
import { PerformanceMonitor } from './performance-monitor';
import { AutoMLPipeline } from './automl-pipeline';
import { ABTestingFramework } from './ab-testing-framework';
import { ResourceOptimizer } from './resource-optimizer';
export declare class MLOpsOrchestrator extends EventEmitter {
    private modelLifecycleManager;
    private hyperparameterOptimizer;
    private modelRegistry;
    private performanceMonitor;
    private automlPipeline;
    private abTestingFramework;
    private resourceOptimizer;
    constructor(modelLifecycleManager: ModelLifecycleManager, hyperparameterOptimizer: HyperparameterOptimizer, modelRegistry: ModelRegistry, performanceMonitor: PerformanceMonitor, automlPipeline: AutoMLPipeline, abTestingFramework: ABTestingFramework, resourceOptimizer: ResourceOptimizer);
    initialize(): Promise<void>;
    startOrchestration(): Promise<void>;
    stopOrchestration(): Promise<void>;
    getServiceMetrics(): {
        orchestration_active: boolean;
        workflows_running: number;
        workflows_completed: number;
    };
}
//# sourceMappingURL=mlops-orchestrator.d.ts.map