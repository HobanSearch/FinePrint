import { DSPyService, DSPyModule, OptimizationRecord } from './dspy-service';
import { z } from 'zod';
export declare const ModuleRegistration: any;
export type ModuleRegistrationType = z.infer<typeof ModuleRegistration>;
export interface ModuleMetadata {
    id: string;
    registration: ModuleRegistrationType;
    created_at: string;
    updated_at: string;
    status: 'active' | 'deprecated' | 'experimental';
    usage_count: number;
    performance_stats: {
        average_accuracy: number;
        average_latency_ms: number;
        total_predictions: number;
        success_rate: number;
    };
    optimization_history: OptimizationRecord[];
    file_path?: string;
}
export interface CustomModule extends DSPyModule {
    metadata: ModuleMetadata;
    loadFromFile(filePath: string): Promise<void>;
    saveToFile(filePath: string): Promise<void>;
}
export declare class ModuleRegistry {
    private dspyService;
    private cache;
    private modules;
    private moduleInstances;
    private registryPath;
    constructor(dspyService: DSPyService);
    private initializeRegistry;
    private loadModulesFromDisk;
    private registerBuiltinModules;
    private registerBuiltinModule;
    registerModule(registration: ModuleRegistrationType, moduleCode?: string): Promise<string>;
    updateModule(moduleId: string, updates: Partial<ModuleRegistrationType>): Promise<void>;
    deleteModule(moduleId: string): Promise<void>;
    getModule(moduleId: string): ModuleMetadata | undefined;
    getModuleByName(name: string): ModuleMetadata | undefined;
    listModules(filters?: {
        category?: ModuleRegistrationType['category'];
        status?: ModuleMetadata['status'];
        author?: string;
        tags?: string[];
    }): ModuleMetadata[];
    updateModuleStats(moduleId: string, stats: {
        latency_ms: number;
        success: boolean;
        accuracy?: number;
    }): Promise<void>;
    getModuleInstance(moduleId: string): Promise<DSPyModule | undefined>;
    private saveModuleMetadata;
    private generateModuleId;
    exportModule(moduleId: string): Promise<{
        metadata: ModuleMetadata;
        code?: string;
    }>;
    importModule(moduleData: {
        metadata: ModuleMetadata;
        code?: string;
    }): Promise<string>;
    getRegistryStats(): {
        total_modules: number;
        by_category: Record<string, number>;
        by_status: Record<string, number>;
        total_usage: number;
        average_accuracy: number;
    };
}
//# sourceMappingURL=module-registry.d.ts.map