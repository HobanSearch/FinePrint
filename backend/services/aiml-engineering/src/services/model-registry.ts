import { createServiceLogger } from '@fineprintai/shared-logger';
import { CacheService } from '@fineprintai/shared-cache';
import { z } from 'zod';
import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as semver from 'semver';
import * as tar from 'tar';

const logger = createServiceLogger('model-registry');

// Model Metadata Schema
export const ModelMetadataSchema = z.object({
  name: z.string().min(1),
  version: z.string().refine(v => semver.valid(v), 'Invalid semantic version'),
  type: z.enum(['huggingface', 'pytorch', 'tensorflow', 'onnx', 'custom']),
  description: z.string().optional(),
  base_model: z.string().optional(),
  task: z.enum(['classification', 'regression', 'generation', 'embedding', 'custom']),
  domain: z.enum(['legal', 'general', 'custom']).default('legal'),
  path: z.string(),
  size_bytes: z.number().min(0).optional(),
  framework_version: z.string().optional(),
  training_job_id: z.string().optional(),
  parent_model_id: z.string().optional(),
  tags: z.array(z.string()).default([]),
  performance_metrics: z.object({
    accuracy: z.number().min(0).max(1).optional(),
    f1_score: z.number().min(0).max(1).optional(),
    precision: z.number().min(0).max(1).optional(),
    recall: z.number().min(0).max(1).optional(),
    loss: z.number().min(0).optional(),
    inference_time_ms: z.number().min(0).optional(),
    throughput_requests_per_second: z.number().min(0).optional(),
    custom_metrics: z.record(z.number()).optional(),
  }).optional(),
  resource_requirements: z.object({
    gpu_memory_mb: z.number().min(0).optional(),
    cpu_cores: z.number().min(1).default(1),
    memory_mb: z.number().min(128).default(512),
    disk_space_mb: z.number().min(0).optional(),
    gpu_required: z.boolean().default(false),
  }).optional(),
  deployment_config: z.object({
    container_image: z.string().optional(),
    environment_variables: z.record(z.string()).optional(),
    ports: z.array(z.number()).optional(),
    health_check_endpoint: z.string().optional(),
    startup_timeout_seconds: z.number().min(1).default(300),
  }).optional(),
  validation_results: z.object({
    validation_score: z.number().min(0).max(1).optional(),
    test_accuracy: z.number().min(0).max(1).optional(),
    benchmark_results: z.record(z.any()).optional(),
    validation_date: z.string().optional(),
  }).optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
  created_by: z.string().optional(),
  status: z.enum(['draft', 'training', 'validated', 'deployed', 'archived', 'deprecated']).default('draft'),
});

export type ModelMetadata = z.infer<typeof ModelMetadataSchema>;

// Model Version History
export interface ModelVersion {
  id: string;
  model_name: string;
  version: string;
  metadata: ModelMetadata;
  changelog: string;
  created_at: string;
  is_latest: boolean;
  download_count: number;
  deployment_count: number;
}

// Model Artifact
export interface ModelArtifact {
  id: string;
  model_id: string;
  artifact_type: 'model_weights' | 'tokenizer' | 'config' | 'training_data' | 'documentation' | 'other';
  file_path: string;
  file_name: string;
  file_size_bytes: number;
  checksum: string;
  compressed: boolean;
  created_at: string;
}

export class ModelRegistry {
  private cache: CacheService;
  private models: Map<string, ModelMetadata> = new Map();
  private versions: Map<string, ModelVersion[]> = new Map();
  private artifacts: Map<string, ModelArtifact[]> = new Map();
  
  private registryPath: string;
  private artifactsPath: string;

  constructor() {
    this.cache = new CacheService();
    this.registryPath = path.join(process.cwd(), 'data', 'model-registry');
    this.artifactsPath = path.join(process.cwd(), 'data', 'model-artifacts');
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Model Registry');

      // Ensure directories exist
      await fs.ensureDir(this.registryPath);
      await fs.ensureDir(this.artifactsPath);
      await fs.ensureDir(path.join(this.registryPath, 'metadata'));
      await fs.ensureDir(path.join(this.registryPath, 'versions'));

      // Load existing models
      await this.loadModelsFromDisk();

      logger.info('Model Registry initialized successfully', {
        modelsLoaded: this.models.size,
        registryPath: this.registryPath,
      });
    } catch (error) {
      logger.error('Failed to initialize Model Registry', { error: error.message });
      throw error;
    }
  }

  private async loadModelsFromDisk(): Promise<void> {
    try {
      const metadataDir = path.join(this.registryPath, 'metadata');
      const files = await fs.readdir(metadataDir).catch(() => []);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const metadataPath = path.join(metadataDir, file);
          const metadata: ModelMetadata = await fs.readJSON(metadataPath);
          const modelId = path.basename(file, '.json');
          
          this.models.set(modelId, metadata);
          
          // Load versions
          await this.loadModelVersions(modelId, metadata.name);
        }
      }

      logger.info(`Loaded ${this.models.size} models from registry`);
    } catch (error) {
      logger.warn('Failed to load some models from disk', { error: error.message });
    }
  }

  private async loadModelVersions(modelId: string, modelName: string): Promise<void> {
    try {
      const versionsDir = path.join(this.registryPath, 'versions', modelName);
      const files = await fs.readdir(versionsDir).catch(() => []);
      
      const versions: ModelVersion[] = [];
      for (const file of files) {
        if (file.endsWith('.json')) {
          const versionPath = path.join(versionsDir, file);
          const version: ModelVersion = await fs.readJSON(versionPath);
          versions.push(version);
        }
      }
      
      // Sort versions by semantic version
      versions.sort((a, b) => semver.rcompare(a.version, b.version));
      this.versions.set(modelName, versions);
      
    } catch (error) {
      logger.warn(`Failed to load versions for model ${modelName}`, { error: error.message });
    }
  }

  async registerModel(metadata: Partial<ModelMetadata>): Promise<string> {
    try {
      // Validate and complete metadata
      const completeMetadata: ModelMetadata = {
        ...metadata,
        created_at: metadata.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: metadata.status || 'draft',
      } as ModelMetadata;

      const validatedMetadata = ModelMetadataSchema.parse(completeMetadata);
      
      const modelId = uuidv4();
      
      // Store metadata
      this.models.set(modelId, validatedMetadata);
      
      // Save to disk
      await this.saveModelMetadata(modelId, validatedMetadata);
      
      // Create version entry
      await this.createModelVersion(modelId, validatedMetadata, 'Initial model registration');
      
      // Cache model info
      await this.cache.set(`model:${modelId}`, JSON.stringify(validatedMetadata), 3600);
      
      logger.info('Model registered successfully', {
        modelId,
        name: validatedMetadata.name,
        version: validatedMetadata.version,
        type: validatedMetadata.type,
      });

      return modelId;
    } catch (error) {
      logger.error('Failed to register model', { error: error.message, metadata });
      throw error;
    }
  }

  private async saveModelMetadata(modelId: string, metadata: ModelMetadata): Promise<void> {
    const metadataPath = path.join(this.registryPath, 'metadata', `${modelId}.json`);
    await fs.writeJSON(metadataPath, metadata, { spaces: 2 });
  }

  private async createModelVersion(
    modelId: string, 
    metadata: ModelMetadata, 
    changelog: string
  ): Promise<void> {
    const version: ModelVersion = {
      id: uuidv4(),
      model_name: metadata.name,
      version: metadata.version,
      metadata: { ...metadata },
      changelog,
      created_at: new Date().toISOString(),
      is_latest: true,
      download_count: 0,
      deployment_count: 0,
    };

    // Update previous latest version
    const existingVersions = this.versions.get(metadata.name) || [];
    existingVersions.forEach(v => { v.is_latest = false; });
    
    // Add new version
    existingVersions.unshift(version);
    this.versions.set(metadata.name, existingVersions);

    // Save version to disk
    const versionsDir = path.join(this.registryPath, 'versions', metadata.name);
    await fs.ensureDir(versionsDir);
    
    const versionPath = path.join(versionsDir, `${metadata.version}.json`);
    await fs.writeJSON(versionPath, version, { spaces: 2 });
  }

  async updateModel(modelId: string, updates: Partial<ModelMetadata>): Promise<void> {
    const existingModel = this.models.get(modelId);
    if (!existingModel) {
      throw new Error(`Model ${modelId} not found`);
    }

    try {
      const updatedMetadata: ModelMetadata = {
        ...existingModel,
        ...updates,
        updated_at: new Date().toISOString(),
      };

      const validatedMetadata = ModelMetadataSchema.parse(updatedMetadata);
      
      // Check if version changed
      const versionChanged = existingModel.version !== validatedMetadata.version;
      
      this.models.set(modelId, validatedMetadata);
      await this.saveModelMetadata(modelId, validatedMetadata);
      
      if (versionChanged) {
        await this.createModelVersion(modelId, validatedMetadata, 'Model updated');
      }
      
      // Update cache
      await this.cache.set(`model:${modelId}`, JSON.stringify(validatedMetadata), 3600);
      
      logger.info('Model updated successfully', {
        modelId,
        name: validatedMetadata.name,
        version: validatedMetadata.version,
        versionChanged,
      });
    } catch (error) {
      logger.error('Failed to update model', { error: error.message, modelId });
      throw error;
    }
  }

  async getModel(modelId: string): Promise<ModelMetadata | null> {
    try {
      // Try cache first
      const cached = await this.cache.get(`model:${modelId}`);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get from memory
      const model = this.models.get(modelId);
      if (model) {
        // Update cache
        await this.cache.set(`model:${modelId}`, JSON.stringify(model), 3600);
        return model;
      }

      return null;
    } catch (error) {
      logger.error('Failed to get model', { error: error.message, modelId });
      return null;
    }
  }

  async getModelByName(name: string, version?: string): Promise<ModelMetadata | null> {
    const versions = this.versions.get(name);
    if (!versions || versions.length === 0) {
      return null;
    }

    if (version) {
      const specificVersion = versions.find(v => v.version === version);
      return specificVersion ? specificVersion.metadata : null;
    }

    // Return latest version
    const latestVersion = versions.find(v => v.is_latest);
    return latestVersion ? latestVersion.metadata : versions[0].metadata;
  }

  async listModels(filters?: {
    type?: string;
    task?: string;
    status?: string;
    tags?: string[];
    domain?: string;
  }): Promise<ModelMetadata[]> {
    let models = Array.from(this.models.values());

    if (filters) {
      if (filters.type) {
        models = models.filter(m => m.type === filters.type);
      }
      if (filters.task) {
        models = models.filter(m => m.task === filters.task);
      }
      if (filters.status) {
        models = models.filter(m => m.status === filters.status);
      }
      if (filters.domain) {
        models = models.filter(m => m.domain === filters.domain);
      }
      if (filters.tags && filters.tags.length > 0) {
        models = models.filter(m => 
          filters.tags!.some(tag => m.tags.includes(tag))
        );
      }
    }

    return models.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  async getModelVersions(modelName: string): Promise<ModelVersion[]> {
    return this.versions.get(modelName) || [];
  }

  async getLatestVersion(modelName: string): Promise<ModelVersion | null> {
    const versions = this.versions.get(modelName);
    if (!versions || versions.length === 0) {
      return null;
    }

    return versions.find(v => v.is_latest) || versions[0];
  }

  async promoteModel(modelId: string, newStatus: ModelMetadata['status']): Promise<void> {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    await this.updateModel(modelId, { status: newStatus });
    
    logger.info('Model promoted', {
      modelId,
      name: model.name,
      oldStatus: model.status,
      newStatus,
    });
  }

  async archiveModel(modelId: string): Promise<void> {
    await this.promoteModel(modelId, 'archived');
  }

  async deprecateModel(modelId: string): Promise<void> {
    await this.promoteModel(modelId, 'deprecated');
  }

  async deleteModel(modelId: string, force: boolean = false): Promise<void> {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    if (model.status === 'deployed' && !force) {
      throw new Error('Cannot delete deployed model without force flag');
    }

    try {
      // Remove from memory
      this.models.delete(modelId);
      
      // Remove from disk
      const metadataPath = path.join(this.registryPath, 'metadata', `${modelId}.json`);
      await fs.remove(metadataPath).catch(() => {});
      
      // Remove versions
      const versionsDir = path.join(this.registryPath, 'versions', model.name);
      await fs.remove(versionsDir).catch(() => {});
      this.versions.delete(model.name);
      
      // Remove artifacts
      await this.deleteModelArtifacts(modelId);
      
      // Remove from cache
      await this.cache.del(`model:${modelId}`);
      
      logger.info('Model deleted', { modelId, name: model.name });
    } catch (error) {
      logger.error('Failed to delete model', { error: error.message, modelId });
      throw error;
    }
  }

  // Artifact Management
  async addArtifact(
    modelId: string,
    artifactType: ModelArtifact['artifact_type'],
    filePath: string,
    fileName?: string,
    compress: boolean = true
  ): Promise<string> {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    try {
      const artifactId = uuidv4();
      const fileStats = await fs.stat(filePath);
      const actualFileName = fileName || path.basename(filePath);
      
      // Create artifact directory
      const artifactDir = path.join(this.artifactsPath, modelId);
      await fs.ensureDir(artifactDir);
      
      let finalPath = path.join(artifactDir, actualFileName);
      let compressed = false;
      let fileSize = fileStats.size;
      
      if (compress && fileStats.size > 1024 * 1024) { // Compress files > 1MB
        const compressedPath = finalPath + '.tar.gz';
        await tar.create({
          gzip: true,
          file: compressedPath,
        }, [filePath]);
        
        finalPath = compressedPath;
        compressed = true;
        fileSize = (await fs.stat(compressedPath)).size;
      } else {
        await fs.copy(filePath, finalPath);
      }
      
      // Calculate checksum
      const checksum = await this.calculateChecksum(finalPath);
      
      const artifact: ModelArtifact = {
        id: artifactId,
        model_id: modelId,
        artifact_type: artifactType,
        file_path: finalPath,
        file_name: actualFileName,
        file_size_bytes: fileSize,
        checksum,
        compressed,
        created_at: new Date().toISOString(),
      };
      
      // Store artifact info
      const modelArtifacts = this.artifacts.get(modelId) || [];
      modelArtifacts.push(artifact);
      this.artifacts.set(modelId, modelArtifacts);
      
      // Save to disk
      const artifactsIndexPath = path.join(artifactDir, 'artifacts.json');
      await fs.writeJSON(artifactsIndexPath, modelArtifacts, { spaces: 2 });
      
      logger.info('Artifact added to model', {
        modelId,
        artifactId,
        artifactType,
        fileName: actualFileName,
        compressed,
        size: fileSize,
      });
      
      return artifactId;
    } catch (error) {
      logger.error('Failed to add artifact', { error: error.message, modelId });
      throw error;
    }
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256');
    const stream = await fs.createReadStream(filePath);
    
    return new Promise((resolve, reject) => {
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async getModelArtifacts(modelId: string): Promise<ModelArtifact[]> {
    return this.artifacts.get(modelId) || [];
  }

  async downloadArtifact(modelId: string, artifactId: string): Promise<string> {
    const artifacts = this.artifacts.get(modelId);
    if (!artifacts) {
      throw new Error(`No artifacts found for model ${modelId}`);
    }
    
    const artifact = artifacts.find(a => a.id === artifactId);
    if (!artifact) {
      throw new Error(`Artifact ${artifactId} not found`);
    }
    
    // Verify checksum
    const currentChecksum = await this.calculateChecksum(artifact.file_path);
    if (currentChecksum !== artifact.checksum) {
      throw new Error('Artifact checksum verification failed');
    }
    
    // Increment download count
    const versions = this.versions.get(this.models.get(modelId)!.name);
    if (versions) {
      const latestVersion = versions.find(v => v.is_latest);
      if (latestVersion) {
        latestVersion.download_count++;
      }
    }
    
    return artifact.file_path;
  }

  private async deleteModelArtifacts(modelId: string): Promise<void> {
    try {
      const artifactDir = path.join(this.artifactsPath, modelId);
      await fs.remove(artifactDir);
      this.artifacts.delete(modelId);
    } catch (error) {
      logger.warn('Failed to delete model artifacts', { error: error.message, modelId });
    }
  }

  // Search and Discovery
  async searchModels(query: string, filters?: any): Promise<ModelMetadata[]> {
    const models = await this.listModels(filters);
    
    if (!query.trim()) {
      return models;
    }
    
    const queryLower = query.toLowerCase();
    
    return models.filter(model => 
      model.name.toLowerCase().includes(queryLower) ||
      model.description?.toLowerCase().includes(queryLower) ||
      model.tags.some(tag => tag.toLowerCase().includes(queryLower)) ||
      model.type.toLowerCase().includes(queryLower) ||
      model.task.toLowerCase().includes(queryLower)
    );
  }

  // Model Comparison
  async compareModels(modelIds: string[]): Promise<any> {
    const models = await Promise.all(
      modelIds.map(id => this.getModel(id))
    );
    
    const validModels = models.filter(m => m !== null) as ModelMetadata[];
    
    if (validModels.length < 2) {
      throw new Error('At least 2 valid models required for comparison');
    }
    
    return {
      models: validModels.map(model => ({
        id: modelIds[models.indexOf(model)],
        name: model.name,
        version: model.version,
        type: model.type,
        task: model.task,
        performance_metrics: model.performance_metrics,
        resource_requirements: model.resource_requirements,
        status: model.status,
      })),
      comparison: {
        performance: this.comparePerformanceMetrics(validModels),
        resources: this.compareResourceRequirements(validModels),
        compatibility: this.checkCompatibility(validModels),
      },
    };
  }

  private comparePerformanceMetrics(models: ModelMetadata[]): any {
    const metrics = ['accuracy', 'f1_score', 'precision', 'recall', 'inference_time_ms'];
    const comparison: any = {};
    
    metrics.forEach(metric => {
      const values = models.map(m => m.performance_metrics?.[metric as keyof typeof m.performance_metrics]);
      const validValues = values.filter(v => v !== undefined) as number[];
      
      if (validValues.length > 0) {
        comparison[metric] = {
          values: values,
          best_index: validValues.indexOf(
            metric === 'inference_time_ms' 
              ? Math.min(...validValues) 
              : Math.max(...validValues)
          ),
          avg: validValues.reduce((sum, v) => sum + v, 0) / validValues.length,
        };
      }
    });
    
    return comparison;
  }

  private compareResourceRequirements(models: ModelMetadata[]): any {
    const requirements = ['gpu_memory_mb', 'cpu_cores', 'memory_mb'];
    const comparison: any = {};
    
    requirements.forEach(req => {
      const values = models.map(m => m.resource_requirements?.[req as keyof typeof m.resource_requirements]);
      const validValues = values.filter(v => v !== undefined) as number[];
      
      if (validValues.length > 0) {
        comparison[req] = {
          values: values,
          min_index: validValues.indexOf(Math.min(...validValues)),
          max_index: validValues.indexOf(Math.max(...validValues)),
          avg: validValues.reduce((sum, v) => sum + v, 0) / validValues.length,
        };
      }
    });
    
    return comparison;
  }

  private checkCompatibility(models: ModelMetadata[]): any {
    return {
      same_framework: models.every(m => m.type === models[0].type),
      same_task: models.every(m => m.task === models[0].task),
      same_domain: models.every(m => m.domain === models[0].domain),
      gpu_compatibility: models.map(m => m.resource_requirements?.gpu_required || false),
    };
  }

  getServiceMetrics() {
    const models = Array.from(this.models.values());
    const totalVersions = Array.from(this.versions.values()).reduce((sum, versions) => sum + versions.length, 0);
    const totalArtifacts = Array.from(this.artifacts.values()).reduce((sum, artifacts) => sum + artifacts.length, 0);
    
    const statusCounts = models.reduce((acc, model) => {
      acc[model.status] = (acc[model.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const typeCounts = models.reduce((acc, model) => {
      acc[model.type] = (acc[model.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      total_models: models.length,
      total_versions: totalVersions,
      total_artifacts: totalArtifacts,
      models_by_status: statusCounts,
      models_by_type: typeCounts,
      deployed_models: models.filter(m => m.status === 'deployed').length,
      avg_versions_per_model: models.length > 0 ? totalVersions / models.length : 0,
    };
  }
}