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
exports.ModelRegistry = exports.ModelMetadataSchema = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const zod_1 = require("zod");
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
const semver = __importStar(require("semver"));
const tar = __importStar(require("tar"));
const logger = (0, logger_1.createServiceLogger)('model-registry');
exports.ModelMetadataSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    version: zod_1.z.string().refine(v => semver.valid(v), 'Invalid semantic version'),
    type: zod_1.z.enum(['huggingface', 'pytorch', 'tensorflow', 'onnx', 'custom']),
    description: zod_1.z.string().optional(),
    base_model: zod_1.z.string().optional(),
    task: zod_1.z.enum(['classification', 'regression', 'generation', 'embedding', 'custom']),
    domain: zod_1.z.enum(['legal', 'general', 'custom']).default('legal'),
    path: zod_1.z.string(),
    size_bytes: zod_1.z.number().min(0).optional(),
    framework_version: zod_1.z.string().optional(),
    training_job_id: zod_1.z.string().optional(),
    parent_model_id: zod_1.z.string().optional(),
    tags: zod_1.z.array(zod_1.z.string()).default([]),
    performance_metrics: zod_1.z.object({
        accuracy: zod_1.z.number().min(0).max(1).optional(),
        f1_score: zod_1.z.number().min(0).max(1).optional(),
        precision: zod_1.z.number().min(0).max(1).optional(),
        recall: zod_1.z.number().min(0).max(1).optional(),
        loss: zod_1.z.number().min(0).optional(),
        inference_time_ms: zod_1.z.number().min(0).optional(),
        throughput_requests_per_second: zod_1.z.number().min(0).optional(),
        custom_metrics: zod_1.z.record(zod_1.z.number()).optional(),
    }).optional(),
    resource_requirements: zod_1.z.object({
        gpu_memory_mb: zod_1.z.number().min(0).optional(),
        cpu_cores: zod_1.z.number().min(1).default(1),
        memory_mb: zod_1.z.number().min(128).default(512),
        disk_space_mb: zod_1.z.number().min(0).optional(),
        gpu_required: zod_1.z.boolean().default(false),
    }).optional(),
    deployment_config: zod_1.z.object({
        container_image: zod_1.z.string().optional(),
        environment_variables: zod_1.z.record(zod_1.z.string()).optional(),
        ports: zod_1.z.array(zod_1.z.number()).optional(),
        health_check_endpoint: zod_1.z.string().optional(),
        startup_timeout_seconds: zod_1.z.number().min(1).default(300),
    }).optional(),
    validation_results: zod_1.z.object({
        validation_score: zod_1.z.number().min(0).max(1).optional(),
        test_accuracy: zod_1.z.number().min(0).max(1).optional(),
        benchmark_results: zod_1.z.record(zod_1.z.any()).optional(),
        validation_date: zod_1.z.string().optional(),
    }).optional(),
    created_at: zod_1.z.string(),
    updated_at: zod_1.z.string().optional(),
    created_by: zod_1.z.string().optional(),
    status: zod_1.z.enum(['draft', 'training', 'validated', 'deployed', 'archived', 'deprecated']).default('draft'),
});
class ModelRegistry {
    cache;
    models = new Map();
    versions = new Map();
    artifacts = new Map();
    registryPath;
    artifactsPath;
    constructor() {
        this.cache = new cache_1.CacheService();
        this.registryPath = path.join(process.cwd(), 'data', 'model-registry');
        this.artifactsPath = path.join(process.cwd(), 'data', 'model-artifacts');
    }
    async initialize() {
        try {
            logger.info('Initializing Model Registry');
            await fs.ensureDir(this.registryPath);
            await fs.ensureDir(this.artifactsPath);
            await fs.ensureDir(path.join(this.registryPath, 'metadata'));
            await fs.ensureDir(path.join(this.registryPath, 'versions'));
            await this.loadModelsFromDisk();
            logger.info('Model Registry initialized successfully', {
                modelsLoaded: this.models.size,
                registryPath: this.registryPath,
            });
        }
        catch (error) {
            logger.error('Failed to initialize Model Registry', { error: error.message });
            throw error;
        }
    }
    async loadModelsFromDisk() {
        try {
            const metadataDir = path.join(this.registryPath, 'metadata');
            const files = await fs.readdir(metadataDir).catch(() => []);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const metadataPath = path.join(metadataDir, file);
                    const metadata = await fs.readJSON(metadataPath);
                    const modelId = path.basename(file, '.json');
                    this.models.set(modelId, metadata);
                    await this.loadModelVersions(modelId, metadata.name);
                }
            }
            logger.info(`Loaded ${this.models.size} models from registry`);
        }
        catch (error) {
            logger.warn('Failed to load some models from disk', { error: error.message });
        }
    }
    async loadModelVersions(modelId, modelName) {
        try {
            const versionsDir = path.join(this.registryPath, 'versions', modelName);
            const files = await fs.readdir(versionsDir).catch(() => []);
            const versions = [];
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const versionPath = path.join(versionsDir, file);
                    const version = await fs.readJSON(versionPath);
                    versions.push(version);
                }
            }
            versions.sort((a, b) => semver.rcompare(a.version, b.version));
            this.versions.set(modelName, versions);
        }
        catch (error) {
            logger.warn(`Failed to load versions for model ${modelName}`, { error: error.message });
        }
    }
    async registerModel(metadata) {
        try {
            const completeMetadata = {
                ...metadata,
                created_at: metadata.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
                status: metadata.status || 'draft',
            };
            const validatedMetadata = exports.ModelMetadataSchema.parse(completeMetadata);
            const modelId = (0, uuid_1.v4)();
            this.models.set(modelId, validatedMetadata);
            await this.saveModelMetadata(modelId, validatedMetadata);
            await this.createModelVersion(modelId, validatedMetadata, 'Initial model registration');
            await this.cache.set(`model:${modelId}`, JSON.stringify(validatedMetadata), 3600);
            logger.info('Model registered successfully', {
                modelId,
                name: validatedMetadata.name,
                version: validatedMetadata.version,
                type: validatedMetadata.type,
            });
            return modelId;
        }
        catch (error) {
            logger.error('Failed to register model', { error: error.message, metadata });
            throw error;
        }
    }
    async saveModelMetadata(modelId, metadata) {
        const metadataPath = path.join(this.registryPath, 'metadata', `${modelId}.json`);
        await fs.writeJSON(metadataPath, metadata, { spaces: 2 });
    }
    async createModelVersion(modelId, metadata, changelog) {
        const version = {
            id: (0, uuid_1.v4)(),
            model_name: metadata.name,
            version: metadata.version,
            metadata: { ...metadata },
            changelog,
            created_at: new Date().toISOString(),
            is_latest: true,
            download_count: 0,
            deployment_count: 0,
        };
        const existingVersions = this.versions.get(metadata.name) || [];
        existingVersions.forEach(v => { v.is_latest = false; });
        existingVersions.unshift(version);
        this.versions.set(metadata.name, existingVersions);
        const versionsDir = path.join(this.registryPath, 'versions', metadata.name);
        await fs.ensureDir(versionsDir);
        const versionPath = path.join(versionsDir, `${metadata.version}.json`);
        await fs.writeJSON(versionPath, version, { spaces: 2 });
    }
    async updateModel(modelId, updates) {
        const existingModel = this.models.get(modelId);
        if (!existingModel) {
            throw new Error(`Model ${modelId} not found`);
        }
        try {
            const updatedMetadata = {
                ...existingModel,
                ...updates,
                updated_at: new Date().toISOString(),
            };
            const validatedMetadata = exports.ModelMetadataSchema.parse(updatedMetadata);
            const versionChanged = existingModel.version !== validatedMetadata.version;
            this.models.set(modelId, validatedMetadata);
            await this.saveModelMetadata(modelId, validatedMetadata);
            if (versionChanged) {
                await this.createModelVersion(modelId, validatedMetadata, 'Model updated');
            }
            await this.cache.set(`model:${modelId}`, JSON.stringify(validatedMetadata), 3600);
            logger.info('Model updated successfully', {
                modelId,
                name: validatedMetadata.name,
                version: validatedMetadata.version,
                versionChanged,
            });
        }
        catch (error) {
            logger.error('Failed to update model', { error: error.message, modelId });
            throw error;
        }
    }
    async getModel(modelId) {
        try {
            const cached = await this.cache.get(`model:${modelId}`);
            if (cached) {
                return JSON.parse(cached);
            }
            const model = this.models.get(modelId);
            if (model) {
                await this.cache.set(`model:${modelId}`, JSON.stringify(model), 3600);
                return model;
            }
            return null;
        }
        catch (error) {
            logger.error('Failed to get model', { error: error.message, modelId });
            return null;
        }
    }
    async getModelByName(name, version) {
        const versions = this.versions.get(name);
        if (!versions || versions.length === 0) {
            return null;
        }
        if (version) {
            const specificVersion = versions.find(v => v.version === version);
            return specificVersion ? specificVersion.metadata : null;
        }
        const latestVersion = versions.find(v => v.is_latest);
        return latestVersion ? latestVersion.metadata : versions[0].metadata;
    }
    async listModels(filters) {
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
                models = models.filter(m => filters.tags.some(tag => m.tags.includes(tag)));
            }
        }
        return models.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    async getModelVersions(modelName) {
        return this.versions.get(modelName) || [];
    }
    async getLatestVersion(modelName) {
        const versions = this.versions.get(modelName);
        if (!versions || versions.length === 0) {
            return null;
        }
        return versions.find(v => v.is_latest) || versions[0];
    }
    async promoteModel(modelId, newStatus) {
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
    async archiveModel(modelId) {
        await this.promoteModel(modelId, 'archived');
    }
    async deprecateModel(modelId) {
        await this.promoteModel(modelId, 'deprecated');
    }
    async deleteModel(modelId, force = false) {
        const model = this.models.get(modelId);
        if (!model) {
            throw new Error(`Model ${modelId} not found`);
        }
        if (model.status === 'deployed' && !force) {
            throw new Error('Cannot delete deployed model without force flag');
        }
        try {
            this.models.delete(modelId);
            const metadataPath = path.join(this.registryPath, 'metadata', `${modelId}.json`);
            await fs.remove(metadataPath).catch(() => { });
            const versionsDir = path.join(this.registryPath, 'versions', model.name);
            await fs.remove(versionsDir).catch(() => { });
            this.versions.delete(model.name);
            await this.deleteModelArtifacts(modelId);
            await this.cache.del(`model:${modelId}`);
            logger.info('Model deleted', { modelId, name: model.name });
        }
        catch (error) {
            logger.error('Failed to delete model', { error: error.message, modelId });
            throw error;
        }
    }
    async addArtifact(modelId, artifactType, filePath, fileName, compress = true) {
        const model = this.models.get(modelId);
        if (!model) {
            throw new Error(`Model ${modelId} not found`);
        }
        try {
            const artifactId = (0, uuid_1.v4)();
            const fileStats = await fs.stat(filePath);
            const actualFileName = fileName || path.basename(filePath);
            const artifactDir = path.join(this.artifactsPath, modelId);
            await fs.ensureDir(artifactDir);
            let finalPath = path.join(artifactDir, actualFileName);
            let compressed = false;
            let fileSize = fileStats.size;
            if (compress && fileStats.size > 1024 * 1024) {
                const compressedPath = finalPath + '.tar.gz';
                await tar.create({
                    gzip: true,
                    file: compressedPath,
                }, [filePath]);
                finalPath = compressedPath;
                compressed = true;
                fileSize = (await fs.stat(compressedPath)).size;
            }
            else {
                await fs.copy(filePath, finalPath);
            }
            const checksum = await this.calculateChecksum(finalPath);
            const artifact = {
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
            const modelArtifacts = this.artifacts.get(modelId) || [];
            modelArtifacts.push(artifact);
            this.artifacts.set(modelId, modelArtifacts);
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
        }
        catch (error) {
            logger.error('Failed to add artifact', { error: error.message, modelId });
            throw error;
        }
    }
    async calculateChecksum(filePath) {
        const crypto = await import('crypto');
        const hash = crypto.createHash('sha256');
        const stream = await fs.createReadStream(filePath);
        return new Promise((resolve, reject) => {
            stream.on('data', data => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }
    async getModelArtifacts(modelId) {
        return this.artifacts.get(modelId) || [];
    }
    async downloadArtifact(modelId, artifactId) {
        const artifacts = this.artifacts.get(modelId);
        if (!artifacts) {
            throw new Error(`No artifacts found for model ${modelId}`);
        }
        const artifact = artifacts.find(a => a.id === artifactId);
        if (!artifact) {
            throw new Error(`Artifact ${artifactId} not found`);
        }
        const currentChecksum = await this.calculateChecksum(artifact.file_path);
        if (currentChecksum !== artifact.checksum) {
            throw new Error('Artifact checksum verification failed');
        }
        const versions = this.versions.get(this.models.get(modelId).name);
        if (versions) {
            const latestVersion = versions.find(v => v.is_latest);
            if (latestVersion) {
                latestVersion.download_count++;
            }
        }
        return artifact.file_path;
    }
    async deleteModelArtifacts(modelId) {
        try {
            const artifactDir = path.join(this.artifactsPath, modelId);
            await fs.remove(artifactDir);
            this.artifacts.delete(modelId);
        }
        catch (error) {
            logger.warn('Failed to delete model artifacts', { error: error.message, modelId });
        }
    }
    async searchModels(query, filters) {
        const models = await this.listModels(filters);
        if (!query.trim()) {
            return models;
        }
        const queryLower = query.toLowerCase();
        return models.filter(model => model.name.toLowerCase().includes(queryLower) ||
            model.description?.toLowerCase().includes(queryLower) ||
            model.tags.some(tag => tag.toLowerCase().includes(queryLower)) ||
            model.type.toLowerCase().includes(queryLower) ||
            model.task.toLowerCase().includes(queryLower));
    }
    async compareModels(modelIds) {
        const models = await Promise.all(modelIds.map(id => this.getModel(id)));
        const validModels = models.filter(m => m !== null);
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
    comparePerformanceMetrics(models) {
        const metrics = ['accuracy', 'f1_score', 'precision', 'recall', 'inference_time_ms'];
        const comparison = {};
        metrics.forEach(metric => {
            const values = models.map(m => m.performance_metrics?.[metric]);
            const validValues = values.filter(v => v !== undefined);
            if (validValues.length > 0) {
                comparison[metric] = {
                    values: values,
                    best_index: validValues.indexOf(metric === 'inference_time_ms'
                        ? Math.min(...validValues)
                        : Math.max(...validValues)),
                    avg: validValues.reduce((sum, v) => sum + v, 0) / validValues.length,
                };
            }
        });
        return comparison;
    }
    compareResourceRequirements(models) {
        const requirements = ['gpu_memory_mb', 'cpu_cores', 'memory_mb'];
        const comparison = {};
        requirements.forEach(req => {
            const values = models.map(m => m.resource_requirements?.[req]);
            const validValues = values.filter(v => v !== undefined);
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
    checkCompatibility(models) {
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
        }, {});
        const typeCounts = models.reduce((acc, model) => {
            acc[model.type] = (acc[model.type] || 0) + 1;
            return acc;
        }, {});
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
exports.ModelRegistry = ModelRegistry;
//# sourceMappingURL=model-registry.js.map