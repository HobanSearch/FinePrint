"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphEmbeddingsService = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const axios_1 = __importDefault(require("axios"));
const config_1 = require("@fineprintai/shared-config");
const logger = (0, logger_1.createServiceLogger)('graph-embeddings-service');
class GraphEmbeddingsService {
    neo4jService;
    qdrantUrl;
    initialized = false;
    constructor(neo4jService) {
        this.neo4jService = neo4jService;
        this.qdrantUrl = config_1.config.qdrant?.url || 'http://localhost:6333';
    }
    async initialize() {
        try {
            await this.initializeQdrantCollections();
            this.initialized = true;
            logger.info('Graph Embeddings Service initialized');
        }
        catch (error) {
            logger.error('Failed to initialize Graph Embeddings Service', { error });
            throw error;
        }
    }
    async updateDocumentEmbeddings(documentId) {
        try {
            const query = `
        MATCH (d:Document {id: $documentId})
        OPTIONAL MATCH (d)-[:CONTAINS]->(c:LegalClause)
        RETURN d, collect(c) AS clauses
      `;
            const result = await this.neo4jService.executeQuery(query, { documentId });
            if (result.records.length === 0) {
                throw new Error(`Document not found: ${documentId}`);
            }
            const document = result.records[0].get('d').properties;
            const clauses = result.records[0].get('clauses').map((c) => c.properties);
            const documentEmbedding = await this.generateTextEmbedding(document.content);
            await this.storeEmbedding(documentId, 'DOCUMENT', documentEmbedding);
            for (const clause of clauses) {
                if (clause.text_content) {
                    const clauseEmbedding = await this.generateTextEmbedding(clause.text_content);
                    await this.storeEmbedding(clause.id, 'CLAUSE', clauseEmbedding);
                }
            }
            logger.info('Document embeddings updated', {
                documentId,
                clausesCount: clauses.length
            });
        }
        catch (error) {
            logger.error('Failed to update document embeddings', { error, documentId });
            throw error;
        }
    }
    async findSimilarNodes(nodeId, nodeType, limit = 10, threshold = 0.7) {
        try {
            const embedding = await this.getEmbedding(nodeId);
            if (!embedding) {
                throw new Error(`Embedding not found for node: ${nodeId}`);
            }
            const collection = nodeType ? `legal_${nodeType.toLowerCase()}` : 'legal_all';
            const searchResponse = await axios_1.default.post(`${this.qdrantUrl}/collections/${collection}/points/search`, {
                vector: embedding,
                limit: limit + 1,
                score_threshold: threshold,
            });
            const similarNodes = searchResponse.data.result
                .filter((point) => point.id !== nodeId)
                .slice(0, limit);
            const results = [];
            for (const point of similarNodes) {
                const nodeData = await this.getNodeData(point.id);
                if (nodeData) {
                    results.push({
                        node_id: point.id,
                        node_type: nodeData.type,
                        similarity_score: point.score,
                        data: nodeData.properties,
                    });
                }
            }
            return results;
        }
        catch (error) {
            logger.error('Failed to find similar nodes', { error, nodeId });
            throw error;
        }
    }
    async retrainGraphEmbeddings() {
        try {
            logger.info('Starting graph embeddings retraining...');
            const query = `
        MATCH (n)
        WHERE n:LegalConcept OR n:LegalClause OR n:Pattern OR n:Document
        RETURN n, labels(n)[0] AS type
      `;
            const result = await this.neo4jService.executeQuery(query);
            const nodes = result.records.map(record => ({
                id: record.get('n').properties.id,
                type: record.get('type'),
                properties: record.get('n').properties,
            }));
            const batchSize = 50;
            for (let i = 0; i < nodes.length; i += batchSize) {
                const batch = nodes.slice(i, i + batchSize);
                await this.processBatchEmbeddings(batch);
                logger.debug('Processed embeddings batch', {
                    batchIndex: Math.floor(i / batchSize) + 1,
                    totalBatches: Math.ceil(nodes.length / batchSize),
                });
            }
            logger.info('Graph embeddings retraining completed', {
                totalNodes: nodes.length,
            });
        }
        catch (error) {
            logger.error('Failed to retrain graph embeddings', { error });
            throw error;
        }
    }
    async healthCheck() {
        try {
            const response = await axios_1.default.get(`${this.qdrantUrl}/collections`);
            return response.status === 200;
        }
        catch (error) {
            logger.error('Qdrant health check failed', { error });
            return false;
        }
    }
    async shutdown() {
        this.initialized = false;
        logger.info('Graph Embeddings Service shutdown completed');
    }
    async initializeQdrantCollections() {
        const collections = [
            'legal_concepts',
            'legal_clauses',
            'legal_patterns',
            'legal_documents',
            'legal_all'
        ];
        for (const collection of collections) {
            try {
                await axios_1.default.get(`${this.qdrantUrl}/collections/${collection}`);
                logger.debug('Qdrant collection exists', { collection });
            }
            catch (error) {
                if (error.response?.status === 404) {
                    await axios_1.default.put(`${this.qdrantUrl}/collections/${collection}`, {
                        vectors: {
                            size: 384,
                            distance: 'Cosine',
                        },
                    });
                    logger.info('Qdrant collection created', { collection });
                }
                else {
                    throw error;
                }
            }
        }
    }
    async generateTextEmbedding(text) {
        try {
            const mockEmbedding = new Array(384).fill(0).map(() => Math.random() * 2 - 1);
            return mockEmbedding;
        }
        catch (error) {
            logger.error('Failed to generate text embedding', { error });
            throw error;
        }
    }
    async storeEmbedding(nodeId, nodeType, embedding) {
        try {
            const collections = [`legal_${nodeType.toLowerCase()}`, 'legal_all'];
            const point = {
                id: nodeId,
                vector: embedding,
                payload: {
                    node_type: nodeType,
                    created_at: new Date().toISOString(),
                },
            };
            for (const collection of collections) {
                await axios_1.default.put(`${this.qdrantUrl}/collections/${collection}/points`, {
                    points: [point],
                });
            }
            logger.debug('Embedding stored', { nodeId, nodeType });
        }
        catch (error) {
            logger.error('Failed to store embedding', { error, nodeId });
            throw error;
        }
    }
    async getEmbedding(nodeId) {
        try {
            const response = await axios_1.default.get(`${this.qdrantUrl}/collections/legal_all/points/${nodeId}`);
            return response.data.result?.vector || null;
        }
        catch (error) {
            if (error.response?.status === 404) {
                return null;
            }
            logger.error('Failed to get embedding', { error, nodeId });
            throw error;
        }
    }
    async getNodeData(nodeId) {
        try {
            const query = `
        MATCH (n {id: $nodeId})
        RETURN n, labels(n)[0] AS type
      `;
            const result = await this.neo4jService.executeQuery(query, { nodeId });
            if (result.records.length === 0) {
                return null;
            }
            return {
                type: result.records[0].get('type'),
                properties: result.records[0].get('n').properties,
            };
        }
        catch (error) {
            logger.error('Failed to get node data', { error, nodeId });
            return null;
        }
    }
    async processBatchEmbeddings(nodes) {
        for (const node of nodes) {
            try {
                let textContent = '';
                switch (node.type) {
                    case 'LegalConcept':
                        textContent = `${node.properties.name} ${node.properties.description}`;
                        break;
                    case 'LegalClause':
                        textContent = node.properties.text_content || node.properties.description;
                        break;
                    case 'Pattern':
                        textContent = `${node.properties.name} ${node.properties.description}`;
                        break;
                    case 'Document':
                        textContent = node.properties.content?.substring(0, 2000) || node.properties.title;
                        break;
                    default:
                        continue;
                }
                if (textContent.trim()) {
                    const embedding = await this.generateTextEmbedding(textContent);
                    await this.storeEmbedding(node.id, node.type, embedding);
                }
            }
            catch (error) {
                logger.warn('Failed to process node embedding', { error, nodeId: node.id });
            }
        }
    }
}
exports.GraphEmbeddingsService = GraphEmbeddingsService;
//# sourceMappingURL=graph-embeddings-service.js.map