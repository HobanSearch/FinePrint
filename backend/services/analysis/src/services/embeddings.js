"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.embeddingService = exports.EmbeddingService = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("@fineprintai/shared-config");
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const crypto_1 = __importDefault(require("crypto"));
const logger = (0, logger_1.createServiceLogger)('embeddings-service');
class EmbeddingService {
    ollamaClient;
    qdrantClient;
    embeddingModel;
    collectionName;
    vectorDimensions;
    constructor() {
        this.ollamaClient = axios_1.default.create({
            baseURL: config_1.config.ai.ollama.url,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        this.qdrantClient = axios_1.default.create({
            baseURL: config_1.config.vector.qdrant.url,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        this.embeddingModel = config_1.config.ai.embedding.model || 'all-MiniLM-L6-v2';
        this.collectionName = config_1.config.vector.qdrant.collection || 'document_embeddings';
        this.vectorDimensions = config_1.config.ai.embedding.dimensions || 384;
    }
    async initialize() {
        try {
            logger.info('Initializing Embedding Service');
            await this.ensureEmbeddingModel();
            await this.initializeQdrantCollection();
            logger.info('Embedding Service initialized successfully', {
                embeddingModel: this.embeddingModel,
                collectionName: this.collectionName,
                vectorDimensions: this.vectorDimensions
            });
        }
        catch (error) {
            logger.error('Failed to initialize Embedding Service', { error: error.message });
            throw error;
        }
    }
    async ensureEmbeddingModel() {
        try {
            const modelsResponse = await this.ollamaClient.get('/api/tags');
            const availableModels = modelsResponse.data.models.map((m) => m.name);
            if (!availableModels.includes(this.embeddingModel)) {
                logger.info('Embedding model not found, attempting to pull', { model: this.embeddingModel });
                await this.ollamaClient.post('/api/pull', {
                    name: this.embeddingModel
                });
                logger.info('Embedding model pulled successfully', { model: this.embeddingModel });
            }
        }
        catch (error) {
            logger.error('Failed to ensure embedding model availability', {
                error: error.message,
                model: this.embeddingModel
            });
            throw error;
        }
    }
    async initializeQdrantCollection() {
        try {
            try {
                await this.qdrantClient.get(`/collections/${this.collectionName}`);
                logger.info('Qdrant collection already exists', { collection: this.collectionName });
                return;
            }
            catch (error) {
                logger.info('Creating Qdrant collection', { collection: this.collectionName });
            }
            await this.qdrantClient.put(`/collections/${this.collectionName}`, {
                vectors: {
                    size: this.vectorDimensions,
                    distance: 'Cosine'
                },
                optimizers_config: {
                    default_segment_number: 2,
                    max_segment_size: 20000,
                    memmap_threshold: 50000,
                    indexing_threshold: 10000,
                    flush_interval_sec: 30,
                    max_optimization_threads: 2
                },
                replication_factor: 1,
                write_consistency_factor: 1
            });
            await this.qdrantClient.post(`/collections/${this.collectionName}/index`, {
                field_name: 'metadata.documentId',
                field_schema: 'keyword'
            });
            await this.qdrantClient.post(`/collections/${this.collectionName}/index`, {
                field_name: 'metadata.category',
                field_schema: 'keyword'
            });
            logger.info('Qdrant collection created successfully', { collection: this.collectionName });
        }
        catch (error) {
            logger.error('Failed to initialize Qdrant collection', {
                error: error.message,
                collection: this.collectionName
            });
            throw error;
        }
    }
    async generateEmbedding(text) {
        const cacheKey = `embedding:${crypto_1.default.createHash('sha256').update(text).digest('hex')}`;
        const cached = await cache_1.analysisCache.get(cacheKey);
        if (cached) {
            logger.debug('Using cached embedding', { textLength: text.length });
            return cached;
        }
        try {
            logger.debug('Generating embedding', { textLength: text.length, model: this.embeddingModel });
            const response = await this.ollamaClient.post('/api/embeddings', {
                model: this.embeddingModel,
                prompt: text
            });
            const embedding = response.data.embedding;
            if (!embedding || !Array.isArray(embedding)) {
                throw new Error('Invalid embedding response from Ollama');
            }
            await cache_1.analysisCache.set(cacheKey, embedding, 24 * 60 * 60);
            logger.debug('Embedding generated successfully', {
                textLength: text.length,
                dimensions: embedding.length
            });
            return embedding;
        }
        catch (error) {
            logger.error('Failed to generate embedding', {
                error: error.message,
                textLength: text.length,
                model: this.embeddingModel
            });
            throw error;
        }
    }
    async generateBatchEmbeddings(texts) {
        logger.info('Generating batch embeddings', { count: texts.length });
        const embeddings = [];
        const batchSize = 10;
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            const batchPromises = batch.map(text => this.generateEmbedding(text));
            try {
                const batchResults = await Promise.all(batchPromises);
                embeddings.push(...batchResults);
                logger.debug('Batch embeddings completed', {
                    batchIndex: Math.floor(i / batchSize) + 1,
                    totalBatches: Math.ceil(texts.length / batchSize),
                    processedCount: Math.min(i + batchSize, texts.length)
                });
            }
            catch (error) {
                logger.error('Batch embedding failed', {
                    error: error.message,
                    batchStart: i,
                    batchSize: batch.length
                });
                throw error;
            }
        }
        logger.info('Batch embeddings completed', {
            totalTexts: texts.length,
            totalEmbeddings: embeddings.length
        });
        return embeddings;
    }
    async indexDocumentChunks(documentId, chunks, metadata) {
        logger.info('Indexing document chunks', {
            documentId,
            chunksCount: chunks.length
        });
        try {
            const texts = chunks.map(chunk => chunk.content);
            const embeddings = await this.generateBatchEmbeddings(texts);
            const vectors = chunks.map((chunk, index) => ({
                id: chunk.id,
                vector: embeddings[index],
                payload: {
                    documentId,
                    chunkId: chunk.id,
                    text: chunk.content,
                    position: chunk.position,
                    length: chunk.length,
                    chunkIndex: chunk.metadata.chunkIndex,
                    totalChunks: chunk.metadata.totalChunks,
                    documentType: chunk.metadata.documentType,
                    language: chunk.metadata.language,
                    createdAt: new Date().toISOString(),
                    ...metadata
                }
            }));
            const batchSize = 100;
            for (let i = 0; i < vectors.length; i += batchSize) {
                const batch = vectors.slice(i, i + batchSize);
                await this.qdrantClient.put(`/collections/${this.collectionName}/points`, {
                    points: batch
                });
                logger.debug('Vector batch indexed', {
                    batchIndex: Math.floor(i / batchSize) + 1,
                    totalBatches: Math.ceil(vectors.length / batchSize),
                    batchSize: batch.length
                });
            }
            logger.info('Document chunks indexed successfully', {
                documentId,
                chunksCount: chunks.length,
                vectorsCount: vectors.length
            });
        }
        catch (error) {
            logger.error('Failed to index document chunks', {
                error: error.message,
                documentId,
                chunksCount: chunks.length
            });
            throw error;
        }
    }
    async searchSimilar(options) {
        const { query, topK = 10, threshold = 0.7, filter } = options;
        logger.info('Performing semantic search', {
            queryLength: query.length,
            topK,
            threshold,
            hasFilter: !!filter
        });
        try {
            const queryEmbedding = await this.generateEmbedding(query);
            const searchRequest = {
                vector: queryEmbedding,
                limit: topK,
                score_threshold: threshold,
                with_payload: true,
                with_vector: false
            };
            if (filter) {
                const qdrantFilter = { must: [] };
                if (filter.documentId) {
                    qdrantFilter.must.push({
                        key: 'documentId',
                        match: { value: filter.documentId }
                    });
                }
                if (filter.category) {
                    qdrantFilter.must.push({
                        key: 'category',
                        match: { value: filter.category }
                    });
                }
                if (filter.dateRange) {
                    qdrantFilter.must.push({
                        key: 'createdAt',
                        range: {
                            gte: filter.dateRange.start.toISOString(),
                            lte: filter.dateRange.end.toISOString()
                        }
                    });
                }
                if (qdrantFilter.must.length > 0) {
                    searchRequest.filter = qdrantFilter;
                }
            }
            const response = await this.qdrantClient.post(`/collections/${this.collectionName}/points/search`, searchRequest);
            const results = response.data.result.map((hit) => ({
                id: hit.id,
                score: hit.score,
                text: hit.payload.text,
                metadata: hit.payload,
                documentId: hit.payload.documentId,
                chunkId: hit.payload.chunkId
            }));
            logger.info('Semantic search completed', {
                queryLength: query.length,
                resultsCount: results.length,
                topScore: results.length > 0 ? results[0].score : 0
            });
            return results;
        }
        catch (error) {
            logger.error('Semantic search failed', {
                error: error.message,
                queryLength: query.length,
                topK,
                threshold
            });
            throw error;
        }
    }
    async findSimilarDocuments(documentId, topK = 5, threshold = 0.6) {
        logger.info('Finding similar documents', { documentId, topK, threshold });
        try {
            const documentChunks = await this.getDocumentVectors(documentId);
            if (documentChunks.length === 0) {
                logger.warn('No vectors found for document', { documentId });
                return [];
            }
            const representativeText = documentChunks[0].payload.text;
            const results = await this.searchSimilar({
                query: representativeText,
                topK: topK + 10,
                threshold,
                filter: {}
            });
            const similarDocuments = results
                .filter(result => result.documentId !== documentId)
                .slice(0, topK);
            logger.info('Similar documents found', {
                documentId,
                similarCount: similarDocuments.length
            });
            return similarDocuments;
        }
        catch (error) {
            logger.error('Failed to find similar documents', {
                error: error.message,
                documentId
            });
            throw error;
        }
    }
    async getDocumentVectors(documentId) {
        try {
            const response = await this.qdrantClient.post(`/collections/${this.collectionName}/points/scroll`, {
                filter: {
                    must: [
                        {
                            key: 'documentId',
                            match: { value: documentId }
                        }
                    ]
                },
                limit: 1000,
                with_payload: true,
                with_vector: false
            });
            return response.data.result.points || [];
        }
        catch (error) {
            logger.error('Failed to get document vectors', {
                error: error.message,
                documentId
            });
            throw error;
        }
    }
    async deleteDocumentVectors(documentId) {
        logger.info('Deleting document vectors', { documentId });
        try {
            await this.qdrantClient.post(`/collections/${this.collectionName}/points/delete`, {
                filter: {
                    must: [
                        {
                            key: 'documentId',
                            match: { value: documentId }
                        }
                    ]
                }
            });
            logger.info('Document vectors deleted successfully', { documentId });
        }
        catch (error) {
            logger.error('Failed to delete document vectors', {
                error: error.message,
                documentId
            });
            throw error;
        }
    }
    async getEmbeddingStats() {
        try {
            const collectionInfo = await this.qdrantClient.get(`/collections/${this.collectionName}`);
            const info = collectionInfo.data.result;
            return {
                totalVectors: info.points_count || 0,
                dimensions: info.config?.params?.vectors?.size || this.vectorDimensions,
                collections: [this.collectionName],
                lastIndexed: new Date(),
                storageSize: info.disk_data_size || 0
            };
        }
        catch (error) {
            logger.error('Failed to get embedding stats', { error: error.message });
            throw error;
        }
    }
    async createEmbeddingIndex(texts, metadata) {
        logger.info('Creating embedding index', { textsCount: texts.length });
        try {
            const embeddings = await this.generateBatchEmbeddings(texts);
            const vectorIds = [];
            const vectors = texts.map((text, index) => {
                const id = crypto_1.default.randomUUID();
                vectorIds.push(id);
                return {
                    id,
                    vector: embeddings[index],
                    payload: {
                        text,
                        createdAt: new Date().toISOString(),
                        ...(metadata && metadata[index] ? metadata[index] : {})
                    }
                };
            });
            const batchSize = 100;
            for (let i = 0; i < vectors.length; i += batchSize) {
                const batch = vectors.slice(i, i + batchSize);
                await this.qdrantClient.put(`/collections/${this.collectionName}/points`, {
                    points: batch
                });
            }
            logger.info('Embedding index created successfully', {
                textsCount: texts.length,
                vectorsCount: vectors.length
            });
            return vectorIds;
        }
        catch (error) {
            logger.error('Failed to create embedding index', {
                error: error.message,
                textsCount: texts.length
            });
            throw error;
        }
    }
    async clusterDocuments(documentIds, numClusters = 5) {
        logger.info('Clustering documents', { documentIds: documentIds.length, numClusters });
        try {
            const allVectors = [];
            for (const docId of documentIds) {
                const docVectors = await this.getDocumentVectors(docId);
                if (docVectors.length > 0) {
                    const docEmbedding = await this.generateEmbedding(docVectors[0].payload.text);
                    allVectors.push({
                        documentId: docId,
                        vector: docEmbedding
                    });
                }
            }
            const clusters = await this.performKMeansClustering(allVectors, numClusters);
            logger.info('Document clustering completed', {
                documentsProcessed: allVectors.length,
                clustersCreated: Object.keys(clusters).length
            });
            return clusters;
        }
        catch (error) {
            logger.error('Document clustering failed', {
                error: error.message,
                documentIds: documentIds.length
            });
            throw error;
        }
    }
    async performKMeansClustering(vectors, numClusters) {
        if (vectors.length === 0)
            return {};
        if (numClusters >= vectors.length) {
            const clusters = {};
            vectors.forEach((v, i) => {
                clusters[`cluster_${i}`] = [v.documentId];
            });
            return clusters;
        }
        const dimensions = vectors[0].vector.length;
        const centroids = [];
        for (let i = 0; i < numClusters; i++) {
            const randomVector = vectors[Math.floor(Math.random() * vectors.length)].vector;
            centroids.push([...randomVector]);
        }
        let assignments = new Array(vectors.length).fill(0);
        let hasChanged = true;
        let iterations = 0;
        const maxIterations = 100;
        while (hasChanged && iterations < maxIterations) {
            hasChanged = false;
            for (let i = 0; i < vectors.length; i++) {
                let minDistance = Infinity;
                let nearestCluster = 0;
                for (let j = 0; j < numClusters; j++) {
                    const distance = this.calculateEuclideanDistance(vectors[i].vector, centroids[j]);
                    if (distance < minDistance) {
                        minDistance = distance;
                        nearestCluster = j;
                    }
                }
                if (assignments[i] !== nearestCluster) {
                    assignments[i] = nearestCluster;
                    hasChanged = true;
                }
            }
            for (let j = 0; j < numClusters; j++) {
                const clusterVectors = vectors.filter((_, i) => assignments[i] === j);
                if (clusterVectors.length > 0) {
                    for (let dim = 0; dim < dimensions; dim++) {
                        centroids[j][dim] = clusterVectors.reduce((sum, v) => sum + v.vector[dim], 0) / clusterVectors.length;
                    }
                }
            }
            iterations++;
        }
        const clusters = {};
        for (let i = 0; i < numClusters; i++) {
            clusters[`cluster_${i}`] = [];
        }
        vectors.forEach((vector, index) => {
            const clusterId = `cluster_${assignments[index]}`;
            clusters[clusterId].push(vector.documentId);
        });
        return clusters;
    }
    calculateEuclideanDistance(vector1, vector2) {
        if (vector1.length !== vector2.length) {
            throw new Error('Vectors must have the same dimensions');
        }
        let sum = 0;
        for (let i = 0; i < vector1.length; i++) {
            const diff = vector1[i] - vector2[i];
            sum += diff * diff;
        }
        return Math.sqrt(sum);
    }
    async healthCheck() {
        try {
            const ollamaHealth = await this.ollamaClient.get('/api/tags', { timeout: 5000 });
            const qdrantHealth = await this.qdrantClient.get('/health', { timeout: 5000 });
            const collectionHealth = await this.qdrantClient.get(`/collections/${this.collectionName}`);
            return ollamaHealth.status === 200 &&
                qdrantHealth.status === 200 &&
                collectionHealth.status === 200;
        }
        catch (error) {
            logger.error('Embedding service health check failed', { error: error.message });
            return false;
        }
    }
}
exports.EmbeddingService = EmbeddingService;
exports.embeddingService = new EmbeddingService();
//# sourceMappingURL=embeddings.js.map