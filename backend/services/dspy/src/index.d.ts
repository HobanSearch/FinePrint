import { DSPyService } from './services/dspy-service';
import { OptimizationEngine } from './services/optimization-engine';
import { ModuleRegistry } from './services/module-registry';
import { MetricsCollector } from './services/metrics-collector';
declare module 'fastify' {
    interface FastifyInstance {
        dspyService: DSPyService;
        optimizationEngine: OptimizationEngine;
        moduleRegistry: ModuleRegistry;
        metricsCollector: MetricsCollector;
    }
}
//# sourceMappingURL=index.d.ts.map