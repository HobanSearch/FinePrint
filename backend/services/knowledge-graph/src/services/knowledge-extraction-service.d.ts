import { KnowledgeGraphService } from './knowledge-graph-service';
import { z } from 'zod';
export declare const ExtractionRequestSchema: any;
export declare const ExtractionResultSchema: any;
export type ExtractionRequest = z.infer<typeof ExtractionRequestSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
export interface TextSegment {
    text: string;
    start_position: number;
    end_position: number;
    segment_type: 'PARAGRAPH' | 'SECTION' | 'CLAUSE' | 'LIST_ITEM';
    importance_score: number;
}
export interface ConceptCandidate {
    text: string;
    confidence: number;
    position: {
        start: number;
        end: number;
    };
    features: {
        pos_tags: string[];
        entities: string[];
        legal_indicators: string[];
        context_clues: string[];
    };
}
export declare class KnowledgeExtractionService {
    private knowledgeGraph;
    private sentenceTokenizer;
    private wordTokenizer;
    private stemmer;
    private posClassifier;
    constructor(knowledgeGraph: KnowledgeGraphService);
    private initializeNLPTools;
    extractKnowledge(request: ExtractionRequest): Promise<ExtractionResult>;
    batchExtractKnowledge(requests: ExtractionRequest[], batchSize?: number): Promise<ExtractionResult[]>;
    private preprocessDocument;
    private cleanText;
    private segmentDocument;
    private classifySegmentType;
    private scoreSegmentImportance;
    private extractConcepts;
    private extractConceptCandidates;
    private calculateConceptCandidateConfidence;
    private findLegalIndicators;
    private extractContextClues;
    private extractClauses;
    private inferRelationships;
    private getAllExistingConcepts;
    private matchOrCreateConcept;
    private calculateTextSimilarity;
    private inferConceptCategory;
    private deduplicateConcepts;
    private getActivePatterns;
    private matchPatterns;
    private performSemanticMatch;
    private createClauseFromMatch;
    private extractRiskFactors;
    private extractImpactAreas;
    private assessClauseRisk;
    private createDocumentEntity;
    private generateContentHash;
    private storeExtractedKnowledge;
    private calculateQualityMetrics;
    private inferConceptRelationship;
    private inferConceptClauseRelationship;
}
//# sourceMappingURL=knowledge-extraction-service.d.ts.map