import { GatedLoRAService } from './services/gated-lora-service';
import { TrainingEngine } from './services/training-engine';
import { ModelRegistry } from './services/model-registry';
import { PerformanceMonitor } from './services/performance-monitor';
declare module 'fastify' {
    interface FastifyInstance {
        gatedLoRAService: GatedLoRAService;
        trainingEngine: TrainingEngine;
        modelRegistry: ModelRegistry;
        performanceMonitor: PerformanceMonitor;
    }
}
//# sourceMappingURL=index.d.ts.map