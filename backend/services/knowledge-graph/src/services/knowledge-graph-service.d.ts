import { Neo4jService } from './neo4j-service';
import { LegalOntologyService, LegalConcept, LegalClause, Pattern, Document } from './legal-ontology-service';
import { SemanticSearchService } from './semantic-search-service';
import { GraphEmbeddingsService } from './graph-embeddings-service';
import { z } from 'zod';
export declare const KnowledgeQuerySchema: any;
export declare const GraphReasoningRequestSchema: any;
export type KnowledgeQuery = z.infer<typeof KnowledgeQuerySchema>;
export type GraphReasoningRequest = z.infer<typeof GraphReasoningRequestSchema>;
export interface KnowledgeGraphStats {
    nodes: {
        total: number;
        by_type: Record<string, number>;
    };
    relationships: {
        total: number;
        by_type: Record<string, number>;
    };
    concepts: {
        total: number;
        by_category: Record<string, number>;
        difficulty_distribution: Record<string, number>;
    };
    clauses: {
        total: number;
        by_severity: Record<string, number>;
        average_confidence: number;
    };
    patterns: {
        total: number;
        enabled: number;
        average_accuracy: number;
    };
    documents: {
        total: number;
        by_type: Record<string, number>;
        by_jurisdiction: Record<string, number>;
    };
}
export interface GraphReasoningResult {
    answer: string;
    confidence: number;
    reasoning_path: Array<{
        step: number;
        operation: string;
        nodes_involved: string[];
        reasoning: string;
    }>;
    supporting_evidence: Array<{
        type: 'CONCEPT' | 'CLAUSE' | 'PATTERN' | 'DOCUMENT';
        id: string;
        relevance_score: number;
        excerpt: string;
    }>;
    alternative_perspectives: string[];
    limitations: string[];
}
export declare class KnowledgeGraphService {
    private neo4jService;
    private ontologyService;
    private semanticSearchService;
    private embeddingsService;
    private initialized;
    constructor();
    initialize(): Promise<void>;
    queryKnowledge(request: KnowledgeQuery): Promise<{
        results: Array<{
            type: string;
            id: string;
            score: number;
            data: any;
            explanation?: string;
        }>;
        total: number;
        query_time_ms: number;
        semantic_expansions?: string[];
    }>;
    reasonAboutLegalConcepts(request: GraphReasoningRequest): Promise<GraphReasoningResult>;
    addKnowledgeFromDocument(document: Partial<Document>, clauses: Array<Partial<LegalClause>>, concepts: Array<{
        conceptId: string;
        relevance: number;
    }>): Promise<{
        documentId: string;
        clausesAdded: number;
        conceptsLinked: number;
    }>;
    updatePatternKnowledge(patterns: Array<Partial<Pattern>>, performanceMetrics: Array<{
        patternId: string;
        accuracy: number;
        falsePositiveRate: number;
    }>): Promise<{
        patternsUpdated: number;
        performanceImproved: number;
    }>;
    getKnowledgeGraphStats(): Promise<KnowledgeGraphStats>;
    getKnowledgeInsights(): Promise<{
        knowledge_gaps: Array<{
            category: string;
            missing_concepts: number;
            urgency: number;
        }>;
        learning_opportunities: Array<{
            concept: LegalConcept;
            difficulty_increase: number;
            readiness_score: number;
        }>;
        pattern_performance: Array<{
            pattern: Pattern;
            performance_trend: 'IMPROVING' | 'DECLINING' | 'STABLE';
        }>;
        recommendation: string;
    }>;
    healthCheck(): Promise<boolean>;
    shutdown(): Promise<void>;
    private executeTypedSearch;
    private extractEntitiesFromQuestion;
    private buildReasoningPath;
    private generateGraphBasedAnswer;
    private findSupportingEvidence;
    private generateAlternativePerspectives;
    private countItems;
    private generateKnowledgeRecommendation;
    getNeo4jService(): Neo4jService;
    getOntologyService(): LegalOntologyService;
    getSemanticSearchService(): SemanticSearchService;
    getEmbeddingsService(): GraphEmbeddingsService;
    isInitialized(): boolean;
}
//# sourceMappingURL=knowledge-graph-service.d.ts.map