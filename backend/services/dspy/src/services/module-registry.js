"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModuleRegistry = exports.ModuleRegistration = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const zod_1 = require("zod");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const logger = (0, logger_1.createServiceLogger)('module-registry');
exports.ModuleRegistration = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    signature: zod_1.z.string().min(1),
    description: zod_1.z.string().min(1).max(500),
    category: zod_1.z.enum(['legal_analysis', 'document_comparison', 'risk_assessment', 'compliance_check', 'custom']),
    version: zod_1.z.string().regex(/^\d+\.\d+\.\d+$/),
    author: zod_1.z.string().optional(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
    requirements: zod_1.z.object({
        min_dataset_size: zod_1.z.number().min(1).default(10),
        supported_languages: zod_1.z.array(zod_1.z.string()).default(['en']),
        max_input_length: zod_1.z.number().min(100).default(10000),
    }).optional(),
});
class ModuleRegistry {
    dspyService;
    cache;
    modules = new Map();
    moduleInstances = new Map();
    registryPath;
    constructor(dspyService) {
        this.dspyService = dspyService;
        this.cache = new cache_1.CacheService();
        this.registryPath = path.join(process.cwd(), 'data', 'dspy-modules');
        this.initializeRegistry();
    }
    async initializeRegistry() {
        try {
            await fs.mkdir(this.registryPath, { recursive: true });
            await this.loadModulesFromDisk();
            await this.registerBuiltinModules();
            logger.info('Module registry initialized', {
                totalModules: this.modules.size,
                registryPath: this.registryPath,
            });
        }
        catch (error) {
            logger.error('Failed to initialize module registry', { error });
            throw error;
        }
    }
    async loadModulesFromDisk() {
        try {
            const files = await fs.readdir(this.registryPath);
            const metadataFiles = files.filter(f => f.endsWith('.metadata.json'));
            for (const metadataFile of metadataFiles) {
                const metadataPath = path.join(this.registryPath, metadataFile);
                const metadataContent = await fs.readFile(metadataPath, 'utf-8');
                const metadata = JSON.parse(metadataContent);
                this.modules.set(metadata.id, metadata);
                const moduleFile = metadataFile.replace('.metadata.json', '.js');
                const modulePath = path.join(this.registryPath, moduleFile);
                try {
                    await fs.access(modulePath);
                    logger.debug('Module implementation found', {
                        moduleId: metadata.id,
                        modulePath
                    });
                }
                catch {
                    logger.debug('No implementation file found', {
                        moduleId: metadata.id
                    });
                }
            }
            logger.info('Loaded modules from disk', {
                modulesLoaded: metadataFiles.length
            });
        }
        catch (error) {
            logger.warn('Failed to load some modules from disk', { error });
        }
    }
    async registerBuiltinModules() {
        const builtinModules = [
            {
                name: 'chain_of_thought',
                category: 'legal_analysis',
                description: 'Chain of Thought reasoning for systematic legal document analysis',
            },
            {
                name: 'react',
                category: 'legal_analysis',
                description: 'ReAct (Reason + Act) for detailed legal analysis with iterative reasoning',
            },
            {
                name: 'multi_hop',
                category: 'legal_analysis',
                description: 'Multi-hop reasoning for comprehensive legal document analysis',
            },
        ];
        for (const builtin of builtinModules) {
            const module = this.dspyService.getModule(builtin.name);
            if (module) {
                await this.registerBuiltinModule(module, builtin.category, builtin.description);
            }
        }
    }
    async registerBuiltinModule(module, category, description) {
        const metadata = {
            id: `builtin_${module.name}`,
            registration: {
                name: module.name,
                signature: module.signature,
                description,
                category,
                version: module.version,
                author: 'Fine Print AI Team',
                tags: ['builtin', 'legal', 'analysis'],
                requirements: {
                    min_dataset_size: 10,
                    supported_languages: ['en'],
                    max_input_length: 10000,
                },
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            status: 'active',
            usage_count: 0,
            performance_stats: {
                average_accuracy: 0.8,
                average_latency_ms: 2000,
                total_predictions: 0,
                success_rate: 0.95,
            },
            optimization_history: module.optimization_history,
        };
        this.modules.set(metadata.id, metadata);
        this.moduleInstances.set(metadata.id, module);
        logger.debug('Built-in module registered', {
            moduleId: metadata.id,
            name: module.name
        });
    }
    async registerModule(registration, moduleCode) {
        try {
            const validatedRegistration = exports.ModuleRegistration.parse(registration);
            const existingModule = Array.from(this.modules.values())
                .find(m => m.registration.name === validatedRegistration.name);
            if (existingModule) {
                throw new Error(`Module with name '${validatedRegistration.name}' already exists`);
            }
            const moduleId = this.generateModuleId(validatedRegistration.name);
            const metadata = {
                id: moduleId,
                registration: validatedRegistration,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                status: 'experimental',
                usage_count: 0,
                performance_stats: {
                    average_accuracy: 0,
                    average_latency_ms: 0,
                    total_predictions: 0,
                    success_rate: 0,
                },
                optimization_history: [],
            };
            await this.saveModuleMetadata(metadata);
            if (moduleCode) {
                const moduleFilePath = path.join(this.registryPath, `${moduleId}.js`);
                await fs.writeFile(moduleFilePath, moduleCode, 'utf-8');
                metadata.file_path = moduleFilePath;
            }
            this.modules.set(moduleId, metadata);
            await this.cache.set(`module:${moduleId}`, JSON.stringify(metadata), 3600);
            logger.info('Module registered successfully', {
                moduleId,
                name: validatedRegistration.name,
                category: validatedRegistration.category,
                version: validatedRegistration.version,
            });
            return moduleId;
        }
        catch (error) {
            logger.error('Failed to register module', { error, registration });
            throw error;
        }
    }
    async updateModule(moduleId, updates) {
        const metadata = this.modules.get(moduleId);
        if (!metadata) {
            throw new Error(`Module '${moduleId}' not found`);
        }
        const updatedRegistration = {
            ...metadata.registration,
            ...updates,
        };
        const validatedRegistration = exports.ModuleRegistration.parse(updatedRegistration);
        const updatedMetadata = {
            ...metadata,
            registration: validatedRegistration,
            updated_at: new Date().toISOString(),
        };
        await this.saveModuleMetadata(updatedMetadata);
        this.modules.set(moduleId, updatedMetadata);
        await this.cache.set(`module:${moduleId}`, JSON.stringify(updatedMetadata), 3600);
        logger.info('Module updated successfully', {
            moduleId,
            name: validatedRegistration.name,
            version: validatedRegistration.version,
        });
    }
    async deleteModule(moduleId) {
        const metadata = this.modules.get(moduleId);
        if (!metadata) {
            throw new Error(`Module '${moduleId}' not found`);
        }
        if (metadata.id.startsWith('builtin_')) {
            throw new Error('Cannot delete built-in modules');
        }
        try {
            const metadataPath = path.join(this.registryPath, `${moduleId}.metadata.json`);
            await fs.unlink(metadataPath);
            if (metadata.file_path) {
                await fs.unlink(metadata.file_path);
            }
            this.modules.delete(moduleId);
            this.moduleInstances.delete(moduleId);
            await this.cache.del(`module:${moduleId}`);
            logger.info('Module deleted successfully', {
                moduleId,
                name: metadata.registration.name,
            });
        }
        catch (error) {
            logger.error('Failed to delete module', { error, moduleId });
            throw error;
        }
    }
    getModule(moduleId) {
        return this.modules.get(moduleId);
    }
    getModuleByName(name) {
        return Array.from(this.modules.values())
            .find(m => m.registration.name === name);
    }
    listModules(filters) {
        let modules = Array.from(this.modules.values());
        if (filters) {
            if (filters.category) {
                modules = modules.filter(m => m.registration.category === filters.category);
            }
            if (filters.status) {
                modules = modules.filter(m => m.status === filters.status);
            }
            if (filters.author) {
                modules = modules.filter(m => m.registration.author === filters.author);
            }
            if (filters.tags && filters.tags.length > 0) {
                modules = modules.filter(m => filters.tags.some(tag => m.registration.tags?.includes(tag)));
            }
        }
        return modules.sort((a, b) => a.registration.name.localeCompare(b.registration.name));
    }
    async updateModuleStats(moduleId, stats) {
        const metadata = this.modules.get(moduleId);
        if (!metadata) {
            return;
        }
        const currentStats = metadata.performance_stats;
        const totalPredictions = currentStats.total_predictions + 1;
        const updatedStats = {
            average_latency_ms: (currentStats.average_latency_ms * currentStats.total_predictions + stats.latency_ms) / totalPredictions,
            total_predictions: totalPredictions,
            success_rate: (currentStats.success_rate * currentStats.total_predictions + (stats.success ? 1 : 0)) / totalPredictions,
            average_accuracy: stats.accuracy
                ? (currentStats.average_accuracy * currentStats.total_predictions + stats.accuracy) / totalPredictions
                : currentStats.average_accuracy,
        };
        const updatedMetadata = {
            ...metadata,
            usage_count: metadata.usage_count + 1,
            performance_stats: updatedStats,
            updated_at: new Date().toISOString(),
        };
        this.modules.set(moduleId, updatedMetadata);
        if (updatedMetadata.usage_count % 10 === 0) {
            await this.saveModuleMetadata(updatedMetadata);
        }
    }
    async getModuleInstance(moduleId) {
        const instance = this.moduleInstances.get(moduleId);
        if (instance) {
            return instance;
        }
        const metadata = this.modules.get(moduleId);
        if (!metadata || !metadata.file_path) {
            return undefined;
        }
        logger.warn('Dynamic module loading not implemented', { moduleId });
        return undefined;
    }
    async saveModuleMetadata(metadata) {
        const metadataPath = path.join(this.registryPath, `${metadata.id}.metadata.json`);
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    }
    generateModuleId(name) {
        const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 5);
        return `${sanitizedName}_${timestamp}_${random}`;
    }
    async exportModule(moduleId) {
        const metadata = this.modules.get(moduleId);
        if (!metadata) {
            throw new Error(`Module '${moduleId}' not found`);
        }
        let code;
        if (metadata.file_path) {
            try {
                code = await fs.readFile(metadata.file_path, 'utf-8');
            }
            catch (error) {
                logger.warn('Failed to read module code', { error, moduleId });
            }
        }
        return { metadata, code };
    }
    async importModule(moduleData) {
        const { metadata, code } = moduleData;
        const newModuleId = this.generateModuleId(metadata.registration.name);
        const newMetadata = {
            ...metadata,
            id: newModuleId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            status: 'experimental',
            usage_count: 0,
            performance_stats: {
                average_accuracy: 0,
                average_latency_ms: 0,
                total_predictions: 0,
                success_rate: 0,
            },
        };
        await this.saveModuleMetadata(newMetadata);
        if (code) {
            const moduleFilePath = path.join(this.registryPath, `${newModuleId}.js`);
            await fs.writeFile(moduleFilePath, code, 'utf-8');
            newMetadata.file_path = moduleFilePath;
        }
        this.modules.set(newModuleId, newMetadata);
        logger.info('Module imported successfully', {
            originalId: metadata.id,
            newModuleId,
            name: newMetadata.registration.name,
        });
        return newModuleId;
    }
    getRegistryStats() {
        const modules = Array.from(this.modules.values());
        const byCategory = {};
        const byStatus = {};
        let totalUsage = 0;
        let totalAccuracy = 0;
        let modulesWithAccuracy = 0;
        modules.forEach(module => {
            byCategory[module.registration.category] = (byCategory[module.registration.category] || 0) + 1;
            byStatus[module.status] = (byStatus[module.status] || 0) + 1;
            totalUsage += module.usage_count;
            if (module.performance_stats.average_accuracy > 0) {
                totalAccuracy += module.performance_stats.average_accuracy;
                modulesWithAccuracy++;
            }
        });
        return {
            total_modules: modules.length,
            by_category: byCategory,
            by_status: byStatus,
            total_usage: totalUsage,
            average_accuracy: modulesWithAccuracy > 0 ? totalAccuracy / modulesWithAccuracy : 0,
        };
    }
}
exports.ModuleRegistry = ModuleRegistry;
//# sourceMappingURL=module-registry.js.map