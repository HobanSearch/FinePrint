import { createServiceLogger } from '@fineprintai/shared-logger';
import { Neo4jService } from './neo4j-service';
import axios from 'axios';
import { config } from '@fineprintai/shared-config';
import * as _ from 'lodash';

const logger = createServiceLogger('graph-embeddings-service');

export interface GraphEmbedding {
  node_id: string;
  node_type: string;
  embedding: number[];
  created_at: Date;
  updated_at: Date;
}

export interface SimilarityResult {
  node_id: string;
  node_type: string;
  similarity_score: number;
  data: any;
}

/**
 * Graph Embeddings Service - Manages vector embeddings for graph nodes
 * and integrates with Qdrant for similarity search
 */
export class GraphEmbeddingsService {
  private neo4jService: Neo4jService;
  private qdrantUrl: string;
  private initialized = false;

  constructor(neo4jService: Neo4jService) {
    this.neo4jService = neo4jService;
    this.qdrantUrl = config.qdrant?.url || 'http://localhost:6333';
  }

  async initialize(): Promise<void> {
    try {
      // Initialize Qdrant collections
      await this.initializeQdrantCollections();
      
      this.initialized = true;
      logger.info('Graph Embeddings Service initialized');
    } catch (error) {
      logger.error('Failed to initialize Graph Embeddings Service', { error });
      throw error;
    }
  }

  /**
   * Generate embeddings for a document and its clauses
   */
  async updateDocumentEmbeddings(documentId: string): Promise<void> {
    try {
      // Get document and its clauses
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
      const clauses = result.records[0].get('clauses').map((c: any) => c.properties);
      
      // Generate embeddings
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
      
    } catch (error) {
      logger.error('Failed to update document embeddings', { error, documentId });
      throw error;
    }
  }

  /**
   * Find similar nodes using embedding similarity
   */
  async findSimilarNodes(
    nodeId: string,
    nodeType?: string,
    limit: number = 10,
    threshold: number = 0.7
  ): Promise<SimilarityResult[]> {
    try {
      // Get the embedding for the query node
      const embedding = await this.getEmbedding(nodeId);
      if (!embedding) {
        throw new Error(`Embedding not found for node: ${nodeId}`);
      }
      
      // Search Qdrant for similar embeddings
      const collection = nodeType ? `legal_${nodeType.toLowerCase()}` : 'legal_all';
      const searchResponse = await axios.post(`${this.qdrantUrl}/collections/${collection}/points/search`, {
        vector: embedding,
        limit: limit + 1, // +1 to account for the query node itself
        score_threshold: threshold,
      });
      
      const similarNodes = searchResponse.data.result
        .filter((point: any) => point.id !== nodeId) // Exclude the query node
        .slice(0, limit);
      
      // Get full node data from Neo4j
      const results: SimilarityResult[] = [];
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
      
    } catch (error) {
      logger.error('Failed to find similar nodes', { error, nodeId });
      throw error;
    }
  }

  /**
   * Retrain graph embeddings based on updated relationships
   */
  async retrainGraphEmbeddings(): Promise<void> {
    try {
      logger.info('Starting graph embeddings retraining...');
      
      // Get all nodes that need embedding updates
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
      
      // Process nodes in batches
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
      
    } catch (error) {
      logger.error('Failed to retrain graph embeddings', { error });
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.qdrantUrl}/collections`);
      return response.status === 200;
    } catch (error) {
      logger.error('Qdrant health check failed', { error });
      return false;
    }
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
    logger.info('Graph Embeddings Service shutdown completed');
  }

  // ===== PRIVATE METHODS =====

  private async initializeQdrantCollections(): Promise<void> {
    const collections = [
      'legal_concepts',
      'legal_clauses', 
      'legal_patterns',
      'legal_documents',
      'legal_all'
    ];
    
    for (const collection of collections) {
      try {
        // Check if collection exists
        await axios.get(`${this.qdrantUrl}/collections/${collection}`);
        logger.debug('Qdrant collection exists', { collection });
      } catch (error: any) {
        if (error.response?.status === 404) {
          // Create collection
          await axios.put(`${this.qdrantUrl}/collections/${collection}`, {
            vectors: {
              size: 384, // Standard embedding size for legal text
              distance: 'Cosine',
            },
          });
          logger.info('Qdrant collection created', { collection });
        } else {
          throw error;
        }
      }
    }
  }

  private async generateTextEmbedding(text: string): Promise<number[]> {
    try {
      // Use local embeddings service or external API
      // For demo, return mock embedding
      const mockEmbedding = new Array(384).fill(0).map(() => Math.random() * 2 - 1);
      return mockEmbedding;
      
      /* Real implementation would look like:
      const response = await axios.post('http://localhost:8000/embed', {
        text: text.substring(0, 8000), // Limit text length
      });
      return response.data.embedding;
      */
    } catch (error) {
      logger.error('Failed to generate text embedding', { error });
      throw error;
    }
  }

  private async storeEmbedding(
    nodeId: string,
    nodeType: string,
    embedding: number[]
  ): Promise<void> {
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
        await axios.put(`${this.qdrantUrl}/collections/${collection}/points`, {
          points: [point],
        });
      }
      
      logger.debug('Embedding stored', { nodeId, nodeType });
      
    } catch (error) {
      logger.error('Failed to store embedding', { error, nodeId });
      throw error;
    }
  }

  private async getEmbedding(nodeId: string): Promise<number[] | null> {
    try {
      const response = await axios.get(`${this.qdrantUrl}/collections/legal_all/points/${nodeId}`);
      return response.data.result?.vector || null;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      logger.error('Failed to get embedding', { error, nodeId });
      throw error;
    }
  }

  private async getNodeData(nodeId: string): Promise<{ type: string; properties: any } | null> {
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
    } catch (error) {
      logger.error('Failed to get node data', { error, nodeId });
      return null;
    }
  }

  private async processBatchEmbeddings(
    nodes: Array<{ id: string; type: string; properties: any }>
  ): Promise<void> {
    for (const node of nodes) {
      try {
        let textContent = '';
        
        // Extract text content based on node type
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
        
      } catch (error) {
        logger.warn('Failed to process node embedding', { error, nodeId: node.id });
      }
    }
  }
}