import { createServiceLogger } from '@fineprintai/shared-logger';
import { CacheService } from '@fineprintai/shared-cache';
import { DSPyService, DSPyModule, OptimizationRecord } from './dspy-service';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';

const logger = createServiceLogger('module-registry');

// Module Registration Schema
export const ModuleRegistration = z.object({
  name: z.string().min(1).max(100),
  signature: z.string().min(1),
  description: z.string().min(1).max(500),
  category: z.enum(['legal_analysis', 'document_comparison', 'risk_assessment', 'compliance_check', 'custom']),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
  requirements: z.object({
    min_dataset_size: z.number().min(1).default(10),
    supported_languages: z.array(z.string()).default(['en']),
    max_input_length: z.number().min(100).default(10000),
  }).optional(),
});

export type ModuleRegistrationType = z.infer<typeof ModuleRegistration>;

// Module Metadata
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

// Custom Module Interface
export interface CustomModule extends DSPyModule {
  metadata: ModuleMetadata;
  loadFromFile(filePath: string): Promise<void>;
  saveToFile(filePath: string): Promise<void>;
}

export class ModuleRegistry {
  private dspyService: DSPyService;
  private cache: CacheService;
  private modules: Map<string, ModuleMetadata> = new Map();
  private moduleInstances: Map<string, DSPyModule> = new Map();
  private registryPath: string;

  constructor(dspyService: DSPyService) {
    this.dspyService = dspyService;
    this.cache = new CacheService();
    this.registryPath = path.join(process.cwd(), 'data', 'dspy-modules');
    
    this.initializeRegistry();
  }

  private async initializeRegistry(): Promise<void> {
    try {
      // Ensure registry directory exists
      await fs.mkdir(this.registryPath, { recursive: true });
      
      // Load existing modules from filesystem
      await this.loadModulesFromDisk();
      
      // Register built-in modules
      await this.registerBuiltinModules();
      
      logger.info('Module registry initialized', {
        totalModules: this.modules.size,
        registryPath: this.registryPath,
      });
    } catch (error) {
      logger.error('Failed to initialize module registry', { error });
      throw error;
    }
  }

  private async loadModulesFromDisk(): Promise<void> {
    try {
      const files = await fs.readdir(this.registryPath);
      const metadataFiles = files.filter(f => f.endsWith('.metadata.json'));
      
      for (const metadataFile of metadataFiles) {
        const metadataPath = path.join(this.registryPath, metadataFile);
        const metadataContent = await fs.readFile(metadataPath, 'utf-8');
        const metadata: ModuleMetadata = JSON.parse(metadataContent);
        
        this.modules.set(metadata.id, metadata);
        
        // Load module instance if implementation file exists
        const moduleFile = metadataFile.replace('.metadata.json', '.js');
        const modulePath = path.join(this.registryPath, moduleFile);
        
        try {
          await fs.access(modulePath);
          // In a real implementation, we would dynamically load the module
          // For now, we'll create a placeholder
          logger.debug('Module implementation found', { 
            moduleId: metadata.id, 
            modulePath 
          });
        } catch {
          logger.debug('No implementation file found', { 
            moduleId: metadata.id 
          });
        }
      }
      
      logger.info('Loaded modules from disk', { 
        modulesLoaded: metadataFiles.length 
      });
    } catch (error) {
      logger.warn('Failed to load some modules from disk', { error });
    }
  }

  private async registerBuiltinModules(): Promise<void> {
    // Register the built-in modules that are already created in DSPyService
    const builtinModules = [
      {
        name: 'chain_of_thought',
        category: 'legal_analysis' as const,
        description: 'Chain of Thought reasoning for systematic legal document analysis',
      },
      {
        name: 'react',
        category: 'legal_analysis' as const,
        description: 'ReAct (Reason + Act) for detailed legal analysis with iterative reasoning',
      },
      {
        name: 'multi_hop',
        category: 'legal_analysis' as const,
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

  private async registerBuiltinModule(
    module: DSPyModule, 
    category: ModuleRegistrationType['category'],
    description: string
  ): Promise<void> {
    const metadata: ModuleMetadata = {
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
        average_accuracy: 0.8, // Default for built-ins
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

  async registerModule(registration: ModuleRegistrationType, moduleCode?: string): Promise<string> {
    try {
      // Validate registration
      const validatedRegistration = ModuleRegistration.parse(registration);
      
      // Check for name conflicts
      const existingModule = Array.from(this.modules.values())
        .find(m => m.registration.name === validatedRegistration.name);
      
      if (existingModule) {
        throw new Error(`Module with name '${validatedRegistration.name}' already exists`);
      }

      // Generate unique ID
      const moduleId = this.generateModuleId(validatedRegistration.name);
      
      // Create metadata
      const metadata: ModuleMetadata = {
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

      // Save to filesystem
      await this.saveModuleMetadata(metadata);
      
      if (moduleCode) {
        const moduleFilePath = path.join(this.registryPath, `${moduleId}.js`);
        await fs.writeFile(moduleFilePath, moduleCode, 'utf-8');
        metadata.file_path = moduleFilePath;
      }

      // Register in memory
      this.modules.set(moduleId, metadata);
      
      // Cache module info
      await this.cache.set(`module:${moduleId}`, JSON.stringify(metadata), 3600);

      logger.info('Module registered successfully', {
        moduleId,
        name: validatedRegistration.name,
        category: validatedRegistration.category,
        version: validatedRegistration.version,
      });

      return moduleId;
    } catch (error) {
      logger.error('Failed to register module', { error, registration });
      throw error;
    }
  }

  async updateModule(moduleId: string, updates: Partial<ModuleRegistrationType>): Promise<void> {
    const metadata = this.modules.get(moduleId);
    if (!metadata) {
      throw new Error(`Module '${moduleId}' not found`);
    }

    // Update registration
    const updatedRegistration = {
      ...metadata.registration,
      ...updates,
    };

    // Validate updated registration
    const validatedRegistration = ModuleRegistration.parse(updatedRegistration);

    // Update metadata
    const updatedMetadata: ModuleMetadata = {
      ...metadata,
      registration: validatedRegistration,
      updated_at: new Date().toISOString(),
    };

    // Save to filesystem
    await this.saveModuleMetadata(updatedMetadata);
    
    // Update in memory
    this.modules.set(moduleId, updatedMetadata);
    
    // Update cache
    await this.cache.set(`module:${moduleId}`, JSON.stringify(updatedMetadata), 3600);

    logger.info('Module updated successfully', {
      moduleId,
      name: validatedRegistration.name,
      version: validatedRegistration.version,
    });
  }

  async deleteModule(moduleId: string): Promise<void> {
    const metadata = this.modules.get(moduleId);
    if (!metadata) {
      throw new Error(`Module '${moduleId}' not found`);
    }

    if (metadata.id.startsWith('builtin_')) {
      throw new Error('Cannot delete built-in modules');
    }

    try {
      // Remove files
      const metadataPath = path.join(this.registryPath, `${moduleId}.metadata.json`);
      await fs.unlink(metadataPath);
      
      if (metadata.file_path) {
        await fs.unlink(metadata.file_path);
      }

      // Remove from memory
      this.modules.delete(moduleId);
      this.moduleInstances.delete(moduleId);
      
      // Remove from cache
      await this.cache.del(`module:${moduleId}`);

      logger.info('Module deleted successfully', {
        moduleId,
        name: metadata.registration.name,
      });
    } catch (error) {
      logger.error('Failed to delete module', { error, moduleId });
      throw error;
    }
  }

  getModule(moduleId: string): ModuleMetadata | undefined {
    return this.modules.get(moduleId);
  }

  getModuleByName(name: string): ModuleMetadata | undefined {
    return Array.from(this.modules.values())
      .find(m => m.registration.name === name);
  }

  listModules(filters?: {
    category?: ModuleRegistrationType['category'];
    status?: ModuleMetadata['status'];
    author?: string;
    tags?: string[];
  }): ModuleMetadata[] {
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
        modules = modules.filter(m => 
          filters.tags!.some(tag => m.registration.tags?.includes(tag))
        );
      }
    }

    return modules.sort((a, b) => a.registration.name.localeCompare(b.registration.name));
  }

  async updateModuleStats(moduleId: string, stats: {
    latency_ms: number;
    success: boolean;
    accuracy?: number;
  }): Promise<void> {
    const metadata = this.modules.get(moduleId);
    if (!metadata) {
      return;
    }

    // Update performance stats
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

    // Update metadata
    const updatedMetadata: ModuleMetadata = {
      ...metadata,
      usage_count: metadata.usage_count + 1,
      performance_stats: updatedStats,
      updated_at: new Date().toISOString(),
    };

    this.modules.set(moduleId, updatedMetadata);
    
    // Periodically save to disk (every 10 uses)
    if (updatedMetadata.usage_count % 10 === 0) {
      await this.saveModuleMetadata(updatedMetadata);
    }
  }

  async getModuleInstance(moduleId: string): Promise<DSPyModule | undefined> {
    const instance = this.moduleInstances.get(moduleId);
    if (instance) {
      return instance;
    }

    const metadata = this.modules.get(moduleId);
    if (!metadata || !metadata.file_path) {
      return undefined;
    }

    // In a real implementation, we would dynamically load the module
    // For now, return undefined for custom modules
    logger.warn('Dynamic module loading not implemented', { moduleId });
    return undefined;
  }

  private async saveModuleMetadata(metadata: ModuleMetadata): Promise<void> {
    const metadataPath = path.join(this.registryPath, `${metadata.id}.metadata.json`);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  }

  private generateModuleId(name: string): string {
    const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 5);
    return `${sanitizedName}_${timestamp}_${random}`;
  }

  async exportModule(moduleId: string): Promise<{
    metadata: ModuleMetadata;
    code?: string;
  }> {
    const metadata = this.modules.get(moduleId);
    if (!metadata) {
      throw new Error(`Module '${moduleId}' not found`);
    }

    let code: string | undefined;
    if (metadata.file_path) {
      try {
        code = await fs.readFile(metadata.file_path, 'utf-8');
      } catch (error) {
        logger.warn('Failed to read module code', { error, moduleId });
      }
    }

    return { metadata, code };
  }

  async importModule(moduleData: {
    metadata: ModuleMetadata;
    code?: string;
  }): Promise<string> {
    const { metadata, code } = moduleData;
    
    // Generate new ID to avoid conflicts
    const newModuleId = this.generateModuleId(metadata.registration.name);
    
    const newMetadata: ModuleMetadata = {
      ...metadata,
      id: newModuleId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'experimental', // Import as experimental
      usage_count: 0,
      performance_stats: {
        average_accuracy: 0,
        average_latency_ms: 0,
        total_predictions: 0,
        success_rate: 0,
      },
    };

    // Save metadata
    await this.saveModuleMetadata(newMetadata);
    
    // Save code if provided
    if (code) {
      const moduleFilePath = path.join(this.registryPath, `${newModuleId}.js`);
      await fs.writeFile(moduleFilePath, code, 'utf-8');
      newMetadata.file_path = moduleFilePath;
    }

    // Register in memory
    this.modules.set(newModuleId, newMetadata);

    logger.info('Module imported successfully', {
      originalId: metadata.id,
      newModuleId,
      name: newMetadata.registration.name,
    });

    return newModuleId;
  }

  getRegistryStats(): {
    total_modules: number;
    by_category: Record<string, number>;
    by_status: Record<string, number>;
    total_usage: number;
    average_accuracy: number;
  } {
    const modules = Array.from(this.modules.values());
    
    const byCategory: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalUsage = 0;
    let totalAccuracy = 0;
    let modulesWithAccuracy = 0;

    modules.forEach(module => {
      // Count by category
      byCategory[module.registration.category] = (byCategory[module.registration.category] || 0) + 1;
      
      // Count by status
      byStatus[module.status] = (byStatus[module.status] || 0) + 1;
      
      // Sum usage
      totalUsage += module.usage_count;
      
      // Sum accuracy
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