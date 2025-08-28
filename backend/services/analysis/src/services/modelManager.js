"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.modelManager = exports.ModelManager = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("@fineprintai/shared-config");
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const logger = (0, logger_1.createServiceLogger)('model-manager');
class ModelManager {
    client;
    availableModels = new Map();
    modelQueue = new Map();
    modelMetrics = new Map();
    SUPPORTED_MODELS = {
        'mistral:7b': {
            capabilities: {
                documentAnalysis: true,
                embedding: false,
                codeGeneration: false,
                reasoning: true,
                maxContextLength: 8192,
                languages: ['en', 'es', 'fr', 'de', 'it']
            },
            performance: {
                avgTokensPerSecond: 45,
                avgMemoryUsage: 4000,
                avgAnalysisTime: 3500,
                accuracy: 0.92,
                lastBenchmark: new Date()
            }
        },
        'llama2:13b': {
            capabilities: {
                documentAnalysis: true,
                embedding: false,
                codeGeneration: true,
                reasoning: true,
                maxContextLength: 4096,
                languages: ['en', 'es', 'fr', 'de']
            },
            performance: {
                avgTokensPerSecond: 25,
                avgMemoryUsage: 8000,
                avgAnalysisTime: 6000,
                accuracy: 0.95,
                lastBenchmark: new Date()
            }
        },
        'phi:3b': {
            capabilities: {
                documentAnalysis: true,
                embedding: true,
                codeGeneration: true,
                reasoning: true,
                maxContextLength: 2048,
                languages: ['en']
            },
            performance: {
                avgTokensPerSecond: 80,
                avgMemoryUsage: 2000,
                avgAnalysisTime: 2000,
                accuracy: 0.88,
                lastBenchmark: new Date()
            }
        }
    };
    constructor() {
        this.client = axios_1.default.create({
            baseURL: config_1.config.ai.ollama.url,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        this.initializeModelMetrics();
    }
    initializeModelMetrics() {
        Object.entries(this.SUPPORTED_MODELS).forEach(([model, config]) => {
            this.modelMetrics.set(model, config.performance);
        });
    }
    async initialize() {
        try {
            logger.info('Initializing Model Manager');
            await this.refreshAvailableModels();
            await this.ensureRequiredModels();
            this.startHealthChecks();
            logger.info('Model Manager initialized successfully', {
                availableModels: Array.from(this.availableModels.keys())
            });
        }
        catch (error) {
            logger.error('Failed to initialize Model Manager', { error: error.message });
            throw error;
        }
    }
    async refreshAvailableModels() {
        try {
            const response = await this.client.get('/api/tags');
            const models = response.data.models || [];
            this.availableModels.clear();
            for (const model of models) {
                const modelName = model.name.toLowerCase();
                const supportedConfig = this.SUPPORTED_MODELS[modelName];
                if (supportedConfig) {
                    this.availableModels.set(modelName, {
                        name: model.name,
                        tag: model.tag || 'latest',
                        size: model.size || 0,
                        digest: model.digest || '',
                        modifiedAt: new Date(model.modified_at || Date.now()),
                        parameterSize: this.extractParameterSize(modelName),
                        quantizationLevel: this.extractQuantizationLevel(model.name),
                        capabilities: supportedConfig.capabilities,
                        performance: this.modelMetrics.get(modelName) || supportedConfig.performance
                    });
                }
            }
            await cache_1.analysisCache.set('available_models', Array.from(this.availableModels.keys()), 300);
            logger.info('Available models refreshed', {
                count: this.availableModels.size,
                models: Array.from(this.availableModels.keys())
            });
        }
        catch (error) {
            logger.error('Failed to refresh available models', { error: error.message });
            throw error;
        }
    }
    async ensureRequiredModels() {
        const requiredModels = Object.keys(this.SUPPORTED_MODELS);
        const missingModels = [];
        for (const modelName of requiredModels) {
            if (!this.availableModels.has(modelName)) {
                missingModels.push(modelName);
            }
        }
        if (missingModels.length > 0) {
            logger.info('Missing required models, attempting to download', { missingModels });
            for (const modelName of missingModels) {
                try {
                    await this.downloadModel(modelName);
                }
                catch (error) {
                    logger.warn(`Failed to download model ${modelName}`, { error: error.message });
                }
            }
            await this.refreshAvailableModels();
        }
    }
    async downloadModel(modelName, onProgress) {
        try {
            logger.info('Starting model download', { modelName });
            const response = await this.client.post('/api/pull', {
                name: modelName,
                stream: false
            });
            if (response.status === 200) {
                logger.info('Model downloaded successfully', { modelName });
                await this.refreshAvailableModels();
                return true;
            }
            return false;
        }
        catch (error) {
            logger.error('Model download failed', {
                error: error.message,
                modelName
            });
            return false;
        }
    }
    async removeModel(modelName) {
        try {
            logger.info('Removing model', { modelName });
            const response = await this.client.delete('/api/delete', {
                data: { name: modelName }
            });
            if (response.status === 200) {
                this.availableModels.delete(modelName);
                this.modelQueue.delete(modelName);
                await cache_1.analysisCache.del('available_models');
                logger.info('Model removed successfully', { modelName });
                return true;
            }
            return false;
        }
        catch (error) {
            logger.error('Model removal failed', {
                error: error.message,
                modelName
            });
            return false;
        }
    }
    selectOptimalModel(requirements) {
        const { contentLength = 0, priority = 'balanced', language = 'en', documentType = 'general' } = requirements;
        const candidateModels = Array.from(this.availableModels.entries())
            .filter(([name, info]) => {
            if (!info.capabilities.languages.includes(language)) {
                return false;
            }
            if (contentLength > info.capabilities.maxContextLength) {
                return false;
            }
            if (!info.capabilities.documentAnalysis) {
                return false;
            }
            if (this.modelQueue.get(name)) {
                return false;
            }
            return true;
        });
        if (candidateModels.length === 0) {
            const fallbackModel = Array.from(this.availableModels.keys())[0] || 'mistral:7b';
            return {
                model: fallbackModel,
                reason: 'No optimal model found, using fallback',
                expectedPerformance: { speed: 'medium', accuracy: 'medium', resourceUsage: 'medium' }
            };
        }
        let selectedModel;
        let reason;
        switch (priority) {
            case 'speed':
                selectedModel = candidateModels.sort((a, b) => b[1].performance.avgTokensPerSecond - a[1].performance.avgTokensPerSecond)[0];
                reason = 'Selected for fastest processing speed';
                break;
            case 'accuracy':
                selectedModel = candidateModels.sort((a, b) => b[1].performance.accuracy - a[1].performance.accuracy)[0];
                reason = 'Selected for highest accuracy';
                break;
            case 'balanced':
            default:
                selectedModel = candidateModels.sort((a, b) => {
                    const scoreA = this.calculateModelScore(a[1], contentLength);
                    const scoreB = this.calculateModelScore(b[1], contentLength);
                    return scoreB - scoreA;
                })[0];
                reason = 'Selected for balanced performance';
                break;
        }
        const performance = this.getExpectedPerformance(selectedModel[1]);
        return {
            model: selectedModel[0],
            reason,
            expectedPerformance: performance
        };
    }
    calculateModelScore(model, contentLength) {
        const speedWeight = 0.3;
        const accuracyWeight = 0.4;
        const resourceWeight = 0.2;
        const contextWeight = 0.1;
        const speedScore = Math.min(model.performance.avgTokensPerSecond / 100, 1);
        const accuracyScore = model.performance.accuracy;
        const resourceScore = 1 - (model.performance.avgMemoryUsage / 10000);
        const contextScore = contentLength < model.capabilities.maxContextLength ? 1 : 0.5;
        return (speedScore * speedWeight) +
            (accuracyScore * accuracyWeight) +
            (resourceScore * resourceWeight) +
            (contextScore * contextWeight);
    }
    getExpectedPerformance(model) {
        const speed = model.performance.avgTokensPerSecond > 60 ? 'fast' :
            model.performance.avgTokensPerSecond > 30 ? 'medium' : 'slow';
        const accuracy = model.performance.accuracy > 0.93 ? 'high' :
            model.performance.accuracy > 0.85 ? 'medium' : 'low';
        const resourceUsage = model.performance.avgMemoryUsage < 3000 ? 'low' :
            model.performance.avgMemoryUsage < 6000 ? 'medium' : 'high';
        return { speed, accuracy, resourceUsage };
    }
    async reserveModel(modelName) {
        if (this.modelQueue.get(modelName)) {
            return false;
        }
        this.modelQueue.set(modelName, true);
        return true;
    }
    releaseModel(modelName) {
        this.modelQueue.set(modelName, false);
    }
    async updateModelPerformance(modelName, metrics) {
        const current = this.modelMetrics.get(modelName);
        if (!current)
            return;
        const updated = {
            ...current,
            ...(metrics.tokensPerSecond && { avgTokensPerSecond: metrics.tokensPerSecond }),
            ...(metrics.memoryUsage && { avgMemoryUsage: metrics.memoryUsage }),
            ...(metrics.analysisTime && { avgAnalysisTime: metrics.analysisTime }),
            ...(metrics.accuracy && { accuracy: metrics.accuracy }),
            lastBenchmark: new Date()
        };
        this.modelMetrics.set(modelName, updated);
        const modelInfo = this.availableModels.get(modelName);
        if (modelInfo) {
            modelInfo.performance = updated;
            this.availableModels.set(modelName, modelInfo);
        }
        logger.info('Model performance updated', { modelName, metrics });
    }
    getModelInfo(modelName) {
        return this.availableModels.get(modelName) || null;
    }
    getAvailableModels() {
        return Array.from(this.availableModels.values());
    }
    getModelStatus() {
        const status = {};
        for (const [name, info] of this.availableModels) {
            status[name] = {
                available: true,
                busy: this.modelQueue.get(name) || false,
                performance: info.performance
            };
        }
        return status;
    }
    extractParameterSize(modelName) {
        const match = modelName.match(/(\d+)b/i);
        return match ? `${match[1]}B` : 'Unknown';
    }
    extractQuantizationLevel(modelName) {
        if (modelName.includes('q4'))
            return 'Q4';
        if (modelName.includes('q8'))
            return 'Q8';
        if (modelName.includes('f16'))
            return 'F16';
        return 'Default';
    }
    startHealthChecks() {
        setInterval(async () => {
            try {
                await this.performHealthCheck();
            }
            catch (error) {
                logger.error('Health check failed', { error: error.message });
            }
        }, 5 * 60 * 1000);
    }
    async performHealthCheck() {
        logger.debug('Performing model health check');
        for (const modelName of this.availableModels.keys()) {
            try {
                const testResponse = await this.client.post('/api/generate', {
                    model: modelName,
                    prompt: 'Test',
                    stream: false,
                    options: { num_predict: 1 }
                }, { timeout: 10000 });
                if (testResponse.status !== 200) {
                    logger.warn('Model health check failed', { modelName, status: testResponse.status });
                }
            }
            catch (error) {
                logger.warn('Model not responsive during health check', {
                    modelName,
                    error: error.message
                });
            }
        }
    }
    async benchmarkModel(modelName) {
        logger.info('Starting model benchmark', { modelName });
        const testDocument = 'This is a test privacy policy document. We collect your personal information including email, name, and usage data. We may share this information with third parties for marketing purposes. You cannot opt out of data collection.';
        const startTime = Date.now();
        const startMemory = process.memoryUsage().heapUsed;
        try {
            const response = await this.client.post('/api/generate', {
                model: modelName,
                prompt: `Analyze this document for privacy concerns: ${testDocument}`,
                stream: false,
                options: {
                    temperature: 0.1,
                    num_predict: 200
                }
            });
            const endTime = Date.now();
            const endMemory = process.memoryUsage().heapUsed;
            const analysisTime = endTime - startTime;
            const memoryUsage = endMemory - startMemory;
            const tokenCount = response.data.eval_count || 100;
            const tokensPerSecond = tokenCount / (analysisTime / 1000);
            const performance = {
                avgTokensPerSecond: tokensPerSecond,
                avgMemoryUsage: memoryUsage / 1024 / 1024,
                avgAnalysisTime: analysisTime,
                accuracy: 0.9,
                lastBenchmark: new Date()
            };
            await this.updateModelPerformance(modelName, performance);
            logger.info('Model benchmark completed', { modelName, performance });
            return performance;
        }
        catch (error) {
            logger.error('Model benchmark failed', { modelName, error: error.message });
            throw error;
        }
    }
}
exports.ModelManager = ModelManager;
exports.modelManager = new ModelManager();
//# sourceMappingURL=modelManager.js.map