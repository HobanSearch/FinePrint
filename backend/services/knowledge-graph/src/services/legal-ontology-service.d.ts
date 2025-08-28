import { Neo4jService } from './neo4j-service';
import { z } from 'zod';
export declare const LegalConceptSchema: any;
export declare const LegalClauseSchema: any;
export declare const PatternSchema: any;
export declare const DocumentSchema: any;
export declare const JurisdictionSchema: any;
export type LegalConcept = z.infer<typeof LegalConceptSchema>;
export type LegalClause = z.infer<typeof LegalClauseSchema>;
export type Pattern = z.infer<typeof PatternSchema>;
export type Document = z.infer<typeof DocumentSchema>;
export type Jurisdiction = z.infer<typeof JurisdictionSchema>;
export declare enum RelationshipType {
    CONTAINS = "CONTAINS",
    REFERENCES = "REFERENCES",
    CONTRADICTS = "CONTRADICTS",
    IMPLIES = "IMPLIES",
    REQUIRES = "REQUIRES",
    OVERRIDES = "OVERRIDES",
    SIMILAR_TO = "SIMILAR_TO",
    DERIVED_FROM = "DERIVED_FROM",
    APPLIES_TO = "APPLIES_TO",
    GOVERNED_BY = "GOVERNED_BY",
    MATCHES = "MATCHES",
    DEPENDS_ON = "DEPENDS_ON",
    CONFLICTS_WITH = "CONFLICTS_WITH",
    STRENGTHENS = "STRENGTHENS",
    WEAKENS = "WEAKENS"
}
export declare class LegalOntologyService {
    private neo4jService;
    constructor(neo4jService: Neo4jService);
    initialize(): Promise<void>;
    createLegalConcept(concept: Partial<LegalConcept>): Promise<LegalConcept>;
    getLegalConcept(id: string): Promise<LegalConcept | null>;
    searchLegalConcepts(query: string, category?: string, difficultyRange?: [number, number]): Promise<LegalConcept[]>;
    getConceptsByDifficulty(minLevel: number, maxLevel: number, category?: string): Promise<LegalConcept[]>;
    createLegalClause(clause: Partial<LegalClause>, conceptIds?: string[]): Promise<LegalClause>;
    getClausesBySeverity(severity: string[], minConfidence?: number, limit?: number): Promise<LegalClause[]>;
    createPattern(pattern: Partial<Pattern>): Promise<Pattern>;
    getPatternsByEffectiveness(minAccuracy?: number): Promise<Pattern[]>;
    createDocument(document: Partial<Document>, jurisdictionCode?: string): Promise<Document>;
    createRelationship(fromNodeId: string, toNodeId: string, relationshipType: RelationshipType, properties?: Record<string, any>): Promise<void>;
    getRelatedConcepts(conceptId: string, relationshipTypes?: RelationshipType[], maxDepth?: number): Promise<{
        concept: LegalConcept;
        relationship: string;
        depth: number;
    }[]>;
    findSimilarClauses(clauseId: string, similarityThreshold?: number, limit?: number): Promise<{
        clause: LegalClause;
        similarity: number;
    }[]>;
    getConceptPrerequisites(conceptId: string): Promise<LegalConcept[]>;
    private createCoreOntology;
    private createCommonPatterns;
    private createJurisdictions;
    private createConceptRelationships;
}
//# sourceMappingURL=legal-ontology-service.d.ts.map