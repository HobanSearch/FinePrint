import { Neo4jService } from './neo4j-service';
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
export declare class GraphEmbeddingsService {
    private neo4jService;
    private qdrantUrl;
    private initialized;
    constructor(neo4jService: Neo4jService);
    initialize(): Promise<void>;
    updateDocumentEmbeddings(documentId: string): Promise<void>;
    findSimilarNodes(nodeId: string, nodeType?: string, limit?: number, threshold?: number): Promise<SimilarityResult[]>;
    retrainGraphEmbeddings(): Promise<void>;
    healthCheck(): Promise<boolean>;
    shutdown(): Promise<void>;
    private initializeQdrantCollections;
    private generateTextEmbedding;
    private storeEmbedding;
    private getEmbedding;
    private getNodeData;
    private processBatchEmbeddings;
}
//# sourceMappingURL=graph-embeddings-service.d.ts.map