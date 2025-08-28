import { DocumentChunk } from './textProcessor';
export interface EmbeddingVector {
    id: string;
    vector: number[];
    metadata: {
        documentId?: string;
        chunkId?: string;
        text: string;
        category?: string;
        position?: number;
        length?: number;
        createdAt: Date;
    };
}
export interface SemanticSearchResult {
    id: string;
    score: number;
    text: string;
    metadata: any;
    documentId?: string;
    chunkId?: string;
}
export interface SimilaritySearchOptions {
    query: string;
    topK?: number;
    threshold?: number;
    filter?: {
        documentId?: string;
        category?: string;
        dateRange?: {
            start: Date;
            end: Date;
        };
    };
}
export interface EmbeddingStats {
    totalVectors: number;
    dimensions: number;
    collections: string[];
    lastIndexed: Date;
    storageSize: number;
}
export declare class EmbeddingService {
    private ollamaClient;
    private qdrantClient;
    private embeddingModel;
    private collectionName;
    private vectorDimensions;
    constructor();
    initialize(): Promise<void>;
    private ensureEmbeddingModel;
    private initializeQdrantCollection;
    generateEmbedding(text: string): Promise<number[]>;
    generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
    indexDocumentChunks(documentId: string, chunks: DocumentChunk[], metadata?: {
        [key: string]: any;
    }): Promise<void>;
    searchSimilar(options: SimilaritySearchOptions): Promise<SemanticSearchResult[]>;
    findSimilarDocuments(documentId: string, topK?: number, threshold?: number): Promise<SemanticSearchResult[]>;
    getDocumentVectors(documentId: string): Promise<any[]>;
    deleteDocumentVectors(documentId: string): Promise<void>;
    getEmbeddingStats(): Promise<EmbeddingStats>;
    createEmbeddingIndex(texts: string[], metadata?: Array<{
        [key: string]: any;
    }>): Promise<string[]>;
    clusterDocuments(documentIds: string[], numClusters?: number): Promise<{
        [clusterId: string]: string[];
    }>;
    private performKMeansClustering;
    private calculateEuclideanDistance;
    healthCheck(): Promise<boolean>;
}
export declare const embeddingService: EmbeddingService;
//# sourceMappingURL=embeddings.d.ts.map