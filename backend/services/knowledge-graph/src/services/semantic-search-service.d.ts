import { Neo4jService } from './neo4j-service';
export interface SemanticSearchResult {
    type: 'CONCEPT' | 'CLAUSE' | 'PATTERN' | 'DOCUMENT';
    id: string;
    score: number;
    data: any;
    explanation?: string;
    semantic_features: {
        keywords: string[];
        entities: string[];
        sentiment: number;
        complexity: number;
    };
}
export declare class SemanticSearchService {
    private neo4jService;
    private stemmer;
    private tfidf;
    private initialized;
    constructor(neo4jService: Neo4jService);
    initialize(): Promise<void>;
    expandQuery(query: string): Promise<string[]>;
    searchAcrossTypes(query: string, limit?: number): Promise<SemanticSearchResult[]>;
    private searchConcepts;
    private searchClauses;
    private searchPatterns;
    private searchDocuments;
    private extractSemanticFeatures;
    private getSynonyms;
}
//# sourceMappingURL=semantic-search-service.d.ts.map