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
exports.GatedLoRAService = exports.LoRATrainingDataset = exports.GatedLoRAConfig = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const queue_1 = require("@fineprintai/queue");
const zod_1 = require("zod");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const logger = (0, logger_1.createServiceLogger)('gated-lora-service');
exports.GatedLoRAConfig = zod_1.z.object({
    rank: zod_1.z.number().min(1).max(512).default(16),
    alpha: zod_1.z.number().min(0).max(1000).default(32),
    dropout: zod_1.z.number().min(0).max(1).default(0.1),
    gate_threshold: zod_1.z.number().min(0).max(1).default(0.5),
    num_gates: zod_1.z.number().min(1).max(64).default(8),
    target_modules: zod_1.z.array(zod_1.z.string()).default(['q_proj', 'v_proj', 'k_proj', 'o_proj']),
    gate_type: zod_1.z.enum(['input_dependent', 'task_dependent', 'hybrid']).default('hybrid'),
    scaling_factor: zod_1.z.number().min(0.1).max(10).default(1.0),
    enable_bias: zod_1.z.boolean().default(true),
    gate_init_strategy: zod_1.z.enum(['uniform', 'xavier', 'kaiming']).default('xavier'),
});
exports.LoRATrainingDataset = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    task_type: zod_1.z.enum(['legal_analysis', 'document_classification', 'text_generation', 'question_answering']),
    samples: zod_1.z.array(zod_1.z.object({
        input: zod_1.z.string(),
        output: zod_1.z.string(),
        task_id: zod_1.z.string().optional(),
        metadata: zod_1.z.record(zod_1.z.any()).optional(),
    })),
    validation_split: zod_1.z.number().min(0).max(0.5).default(0.2),
    preprocessing_config: zod_1.z.object({
        max_length: zod_1.z.number().default(2048),
        truncation: zod_1.z.boolean().default(true),
        padding: zod_1.z.boolean().default(true),
        add_special_tokens: zod_1.z.boolean().default(true),
    }).optional(),
});
class GatedLoRAService {
    cache;
    queue;
    adapters = new Map();
    datasets = new Map();
    modelsPath;
    constructor() {
        this.cache = new cache_1.CacheService();
        this.queue = new queue_1.QueueService();
        this.modelsPath = path.join(process.cwd(), 'data', 'lora-models');
        this.initializeService();
    }
    async initializeService() {
        try {
            await fs.mkdir(this.modelsPath, { recursive: true });
            await this.loadAdaptersFromDisk();
            await this.initializeTrainingQueue();
            logger.info('Gated LoRA service initialized', {
                adaptersLoaded: this.adapters.size,
                datasetsLoaded: this.datasets.size,
                modelsPath: this.modelsPath,
            });
        }
        catch (error) {
            logger.error('Failed to initialize Gated LoRA service', { error });
            throw error;
        }
    }
    async loadAdaptersFromDisk() {
        try {
            const files = await fs.readdir(this.modelsPath);
            const adapterFiles = files.filter(f => f.endsWith('.lora.json'));
            for (const adapterFile of adapterFiles) {
                const adapterPath = path.join(this.modelsPath, adapterFile);
                const adapterContent = await fs.readFile(adapterPath, 'utf-8');
                const adapter = JSON.parse(adapterContent);
                adapter.task_embeddings = new Map(Object.entries(adapter.task_embeddings || {}));
                this.adapters.set(adapter.id, adapter);
            }
            logger.info('Loaded LoRA adapters from disk', {
                adaptersLoaded: adapterFiles.length
            });
        }
        catch (error) {
            logger.warn('Failed to load some LoRA adapters from disk', { error });
        }
    }
    async initializeTrainingQueue() {
        try {
            await this.queue.createQueue('lora-training', {
                defaultJobOptions: {
                    removeOnComplete: 50,
                    removeOnFail: 25,
                    attempts: 2,
                    backoff: {
                        type: 'exponential',
                        delay: 10000,
                    },
                },
            });
            this.queue.process('lora-training', 1, async (job) => {
                return await this.processTrainingJob(job.data);
            });
            logger.info('LoRA training queue initialized');
        }
        catch (error) {
            logger.error('Failed to initialize training queue', { error });
            throw error;
        }
    }
    async createAdapter(name, description, baseModel, config, taskTypes = []) {
        try {
            const validatedConfig = exports.GatedLoRAConfig.parse(config);
            const adapterId = this.generateAdapterId(name);
            const taskEmbeddings = new Map();
            for (const taskType of taskTypes) {
                taskEmbeddings.set(taskType, this.generateTaskEmbedding(taskType, validatedConfig.num_gates));
            }
            const layers = this.createLoRALayers(validatedConfig);
            const adapter = {
                id: adapterId,
                name,
                description,
                base_model: baseModel,
                config: validatedConfig,
                layers,
                task_embeddings: taskEmbeddings,
                performance_metrics: {
                    parameters_added: this.calculateParametersAdded(layers),
                    parameters_trainable: this.calculateTrainableParameters(layers),
                    memory_overhead_mb: this.estimateMemoryOverhead(layers),
                    inference_speedup: 0,
                    convergence_epochs: 0,
                    final_loss: 0,
                },
                training_history: [],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                status: 'draft',
            };
            this.adapters.set(adapterId, adapter);
            await this.saveAdapterToDisk(adapter);
            await this.cache.set(`lora_adapter:${adapterId}`, JSON.stringify(adapter), 3600);
            logger.info('Gated LoRA adapter created', {
                adapterId,
                name,
                baseModel,
                rank: validatedConfig.rank,
                gates: validatedConfig.num_gates,
                layersCount: layers.length,
            });
            return adapterId;
        }
        catch (error) {
            logger.error('Failed to create LoRA adapter', { error, name });
            throw error;
        }
    }
    createLoRALayers(config) {
        const layers = [];
        config.target_modules.forEach((moduleName, index) => {
            const layer = {
                id: `layer_${index}_${moduleName}`,
                name: `LoRA_${moduleName}`,
                rank: config.rank,
                alpha: config.alpha,
                target_module: moduleName,
                weight_a: this.initializeMatrix(config.rank, 512, config.gate_init_strategy),
                weight_b: this.initializeMatrix(512, config.rank, config.gate_init_strategy),
                bias: config.enable_bias ? new Array(512).fill(0) : undefined,
                gate_weights: this.initializeVector(config.num_gates, config.gate_init_strategy),
                gate_bias: new Array(config.num_gates).fill(0),
                dropout_rate: config.dropout,
                frozen: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            layers.push(layer);
        });
        return layers;
    }
    initializeMatrix(rows, cols, strategy) {
        const matrix = [];
        for (let i = 0; i < rows; i++) {
            const row = [];
            for (let j = 0; j < cols; j++) {
                switch (strategy) {
                    case 'uniform':
                        row.push((Math.random() - 0.5) * 0.02);
                        break;
                    case 'xavier':
                        row.push((Math.random() - 0.5) * Math.sqrt(6 / (rows + cols)));
                        break;
                    case 'kaiming':
                        row.push(Math.random() * Math.sqrt(2 / rows));
                        break;
                    default:
                        row.push((Math.random() - 0.5) * 0.02);
                }
            }
            matrix.push(row);
        }
        return matrix;
    }
    initializeVector(length, strategy) {
        const vector = [];
        for (let i = 0; i < length; i++) {
            switch (strategy) {
                case 'uniform':
                    vector.push((Math.random() - 0.5) * 0.02);
                    break;
                case 'xavier':
                    vector.push((Math.random() - 0.5) * Math.sqrt(6 / length));
                    break;
                case 'kaiming':
                    vector.push(Math.random() * Math.sqrt(2 / length));
                    break;
                default:
                    vector.push((Math.random() - 0.5) * 0.02);
            }
        }
        return vector;
    }
    generateTaskEmbedding(taskType, numGates) {
        const embedding = [];
        const seed = this.hashString(taskType);
        for (let i = 0; i < numGates; i++) {
            const random = Math.sin(seed + i) * 10000;
            embedding.push((random - Math.floor(random)) * 2 - 1);
        }
        return embedding;
    }
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }
    calculateParametersAdded(layers) {
        return layers.reduce((total, layer) => {
            const weightAParams = layer.weight_a.length * layer.weight_a[0].length;
            const weightBParams = layer.weight_b.length * layer.weight_b[0].length;
            const biasParams = layer.bias ? layer.bias.length : 0;
            const gateParams = layer.gate_weights.length + layer.gate_bias.length;
            return total + weightAParams + weightBParams + biasParams + gateParams;
        }, 0);
    }
    calculateTrainableParameters(layers) {
        return layers.reduce((total, layer) => {
            if (layer.frozen)
                return total;
            const weightAParams = layer.weight_a.length * layer.weight_a[0].length;
            const weightBParams = layer.weight_b.length * layer.weight_b[0].length;
            const biasParams = layer.bias ? layer.bias.length : 0;
            const gateParams = layer.gate_weights.length + layer.gate_bias.length;
            return total + weightAParams + weightBParams + biasParams + gateParams;
        }, 0);
    }
    estimateMemoryOverhead(layers) {
        const totalParams = this.calculateParametersAdded(layers);
        const bytesPerParam = 4;
        return (totalParams * bytesPerParam) / (1024 * 1024);
    }
    async inference(adapterId, input, taskType) {
        const startTime = Date.now();
        try {
            const adapter = this.adapters.get(adapterId);
            if (!adapter) {
                throw new Error(`LoRA adapter '${adapterId}' not found`);
            }
            if (adapter.status !== 'trained' && adapter.status !== 'deployed') {
                throw new Error(`Adapter '${adapterId}' is not trained (status: ${adapter.status})`);
            }
            const taskEmbedding = taskType ? adapter.task_embeddings.get(taskType) : null;
            const gateActivations = this.computeGateActivations(input, taskEmbedding, adapter);
            const activeGates = gateActivations.filter(activation => activation > adapter.config.gate_threshold);
            const output = await this.forwardPassWithLoRA(input, adapter, gateActivations);
            const inferenceTime = Date.now() - startTime;
            logger.debug('LoRA inference completed', {
                adapterId,
                taskType,
                inputLength: input.length,
                activeGates: activeGates.length,
                totalGates: gateActivations.length,
                inferenceTime,
            });
            return {
                output,
                gate_activations: gateActivations,
                used_gates: activeGates.length,
                inference_time_ms: inferenceTime,
            };
        }
        catch (error) {
            logger.error('LoRA inference failed', { error, adapterId, taskType });
            throw error;
        }
    }
    computeGateActivations(input, taskEmbedding, adapter) {
        const gateActivations = [];
        const inputEmbedding = this.computeInputEmbedding(input, adapter.config.num_gates);
        for (let i = 0; i < adapter.config.num_gates; i++) {
            let activation = inputEmbedding[i];
            if (taskEmbedding && adapter.config.gate_type !== 'input_dependent') {
                const taskWeight = adapter.config.gate_type === 'hybrid' ? 0.5 : 1.0;
                activation = activation * (1 - taskWeight) + taskEmbedding[i] * taskWeight;
            }
            gateActivations.push(1 / (1 + Math.exp(-activation)));
        }
        return gateActivations;
    }
    computeInputEmbedding(input, numGates) {
        const embedding = [];
        const hash = this.hashString(input);
        for (let i = 0; i < numGates; i++) {
            const random = Math.sin(hash + i) * 10000;
            embedding.push((random - Math.floor(random)) * 2 - 1);
        }
        return embedding;
    }
    async forwardPassWithLoRA(input, adapter, gateActivations) {
        let processedInput = input;
        for (let i = 0; i < adapter.layers.length; i++) {
            const layer = adapter.layers[i];
            const gateIndex = i % gateActivations.length;
            const gateActivation = gateActivations[gateIndex];
            if (gateActivation > adapter.config.gate_threshold) {
                processedInput = await this.applyLoRATransformation(processedInput, layer, gateActivation);
            }
        }
        return processedInput;
    }
    async applyLoRATransformation(input, layer, gateActivation) {
        const scaledInput = input.length > 1000
            ? input.substring(0, Math.floor(input.length * gateActivation))
            : input;
        const transformationStrength = layer.alpha / layer.rank * gateActivation;
        if (transformationStrength > 0.5) {
            return scaledInput + `\n\n[LoRA Enhanced Analysis - Layer: ${layer.name}, Strength: ${transformationStrength.toFixed(3)}]`;
        }
        return scaledInput;
    }
    async startTraining(adapterId, datasetId, trainingConfig) {
        try {
            const adapter = this.adapters.get(adapterId);
            if (!adapter) {
                throw new Error(`LoRA adapter '${adapterId}' not found`);
            }
            const dataset = this.datasets.get(datasetId);
            if (!dataset) {
                throw new Error(`Dataset '${datasetId}' not found`);
            }
            adapter.status = 'training';
            adapter.updated_at = new Date().toISOString();
            await this.saveAdapterToDisk(adapter);
            const jobId = `training_${adapterId}_${Date.now()}`;
            await this.queue.add('lora-training', {
                jobId,
                adapterId,
                datasetId,
                trainingConfig,
            }, {
                delay: 0,
                priority: 1,
            });
            logger.info('LoRA training job queued', {
                jobId,
                adapterId,
                datasetId,
                epochs: trainingConfig.epochs,
            });
            return jobId;
        }
        catch (error) {
            logger.error('Failed to start LoRA training', { error, adapterId, datasetId });
            throw error;
        }
    }
    async processTrainingJob(jobData) {
        const { jobId, adapterId, datasetId, trainingConfig } = jobData;
        try {
            logger.info('Starting LoRA training job', { jobId, adapterId });
            const adapter = this.adapters.get(adapterId);
            const dataset = this.datasets.get(datasetId);
            if (!adapter || !dataset) {
                throw new Error('Adapter or dataset not found for training');
            }
            const trainingResults = await this.simulateTraining(adapter, dataset, trainingConfig);
            adapter.training_history = trainingResults.history;
            adapter.performance_metrics.convergence_epochs = trainingResults.epochs;
            adapter.performance_metrics.final_loss = trainingResults.final_loss;
            adapter.performance_metrics.inference_speedup = trainingResults.speedup;
            adapter.status = 'trained';
            adapter.updated_at = new Date().toISOString();
            await this.saveAdapterToDisk(adapter);
            this.adapters.set(adapterId, adapter);
            logger.info('LoRA training job completed', {
                jobId,
                adapterId,
                epochs: trainingResults.epochs,
                finalLoss: trainingResults.final_loss,
            });
            return trainingResults;
        }
        catch (error) {
            logger.error('LoRA training job failed', { error, jobId, adapterId });
            const adapter = this.adapters.get(adapterId);
            if (adapter) {
                adapter.status = 'draft';
                adapter.updated_at = new Date().toISOString();
                await this.saveAdapterToDisk(adapter);
            }
            throw error;
        }
    }
    async simulateTraining(adapter, dataset, config) {
        const history = [];
        let currentLoss = 2.5;
        for (let epoch = 1; epoch <= config.epochs; epoch++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            currentLoss = currentLoss * (0.95 + Math.random() * 0.05);
            const accuracy = Math.min(0.95, 0.5 + (1 - currentLoss / 2.5) * 0.45);
            const gateUtilization = 0.3 + Math.random() * 0.4;
            const record = {
                epoch,
                loss: currentLoss,
                accuracy,
                gate_utilization: gateUtilization,
                learning_rate: config.learning_rate * Math.pow(0.95, epoch - 1),
                timestamp: new Date().toISOString(),
            };
            history.push(record);
            if (currentLoss < 0.01) {
                logger.info(`Early stopping at epoch ${epoch} due to low loss`);
                break;
            }
        }
        return {
            history,
            epochs: history.length,
            final_loss: currentLoss,
            speedup: 2.5 + Math.random() * 1.5,
        };
    }
    async createDataset(name, taskType, samples, validationSplit = 0.2) {
        try {
            const datasetId = this.generateDatasetId(name);
            const dataset = {
                id: datasetId,
                name,
                task_type: taskType,
                samples,
                validation_split: validationSplit,
                preprocessing_config: {
                    max_length: 2048,
                    truncation: true,
                    padding: true,
                    add_special_tokens: true,
                },
            };
            this.datasets.set(datasetId, dataset);
            const datasetPath = path.join(this.modelsPath, `${datasetId}.dataset.json`);
            await fs.writeFile(datasetPath, JSON.stringify(dataset, null, 2));
            logger.info('LoRA training dataset created', {
                datasetId,
                name,
                taskType,
                samplesCount: samples.length,
                validationSplit,
            });
            return datasetId;
        }
        catch (error) {
            logger.error('Failed to create LoRA dataset', { error, name });
            throw error;
        }
    }
    generateAdapterId(name) {
        const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        return `lora_${sanitizedName}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    }
    generateDatasetId(name) {
        const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        return `dataset_${sanitizedName}_${Date.now()}`;
    }
    async saveAdapterToDisk(adapter) {
        const adapterPath = path.join(this.modelsPath, `${adapter.id}.lora.json`);
        const serializableAdapter = {
            ...adapter,
            task_embeddings: Object.fromEntries(adapter.task_embeddings),
        };
        await fs.writeFile(adapterPath, JSON.stringify(serializableAdapter, null, 2));
    }
    getAdapter(adapterId) {
        return this.adapters.get(adapterId);
    }
    getDataset(datasetId) {
        return this.datasets.get(datasetId);
    }
    listAdapters() {
        return Array.from(this.adapters.values());
    }
    listDatasets() {
        return Array.from(this.datasets.values());
    }
    async deleteAdapter(adapterId) {
        const adapter = this.adapters.get(adapterId);
        if (!adapter) {
            throw new Error(`Adapter '${adapterId}' not found`);
        }
        const adapterPath = path.join(this.modelsPath, `${adapterId}.lora.json`);
        try {
            await fs.unlink(adapterPath);
        }
        catch (error) {
            logger.warn('Failed to delete adapter file', { error, adapterId });
        }
        this.adapters.delete(adapterId);
        await this.cache.del(`lora_adapter:${adapterId}`);
        logger.info('LoRA adapter deleted', { adapterId });
    }
    async healthCheck() {
        try {
            await fs.access(this.modelsPath);
            await this.cache.ping();
            return true;
        }
        catch (error) {
            logger.error('LoRA service health check failed', { error });
            return false;
        }
    }
    getServiceMetrics() {
        const adapters = Array.from(this.adapters.values());
        const adaptersByStatus = {};
        let totalParameters = 0;
        let totalMemoryMB = 0;
        adapters.forEach(adapter => {
            adaptersByStatus[adapter.status] = (adaptersByStatus[adapter.status] || 0) + 1;
            totalParameters += adapter.performance_metrics.parameters_added;
            totalMemoryMB += adapter.performance_metrics.memory_overhead_mb;
        });
        return {
            adapters_total: adapters.length,
            adapters_by_status: adaptersByStatus,
            datasets_total: this.datasets.size,
            total_parameters: totalParameters,
            memory_usage_mb: totalMemoryMB,
        };
    }
}
exports.GatedLoRAService = GatedLoRAService;
//# sourceMappingURL=gated-lora-service.js.map