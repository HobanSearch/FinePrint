import { KnowledgeGraphService } from './knowledge-graph-service';
import { LegalConcept, LegalClause } from './legal-ontology-service';
import { z } from 'zod';
export declare const GraphEnhancedPromptSchema: any;
export declare const InferenceRequestSchema: any;
export declare const EnhancedInferenceResultSchema: any;
export type GraphEnhancedPrompt = z.infer<typeof GraphEnhancedPromptSchema>;
export type InferenceRequest = z.infer<typeof InferenceRequestSchema>;
export type EnhancedInferenceResult = z.infer<typeof EnhancedInferenceResultSchema>;
export interface GraphContext {
    concepts: Array<{
        concept: LegalConcept;
        relevance: number;
        relationships: Array<{
            target_id: string;
            relationship_type: string;
            strength: number;
        }>;
    }>;
    clauses: Array<{
        clause: LegalClause;
        relevance: number;
        similarity_score: number;
    }>;
    patterns: Array<{
        pattern_id: string;
        pattern_name: string;
        accuracy: number;
        applicability: number;
    }>;
    domain_knowledge: {
        jurisdiction_specific: Record<string, any>;
        precedent_cases: Array<{
            case_id: string;
            relevance: number;
            outcome: string;
        }>;
    };
}
export declare class GraphEnhancedInferenceService {
    private knowledgeGraph;
    private dspyServiceUrl;
    constructor(knowledgeGraph: KnowledgeGraphService);
    performEnhancedInference(request: InferenceRequest): Promise<EnhancedInferenceResult>;
    batchEnhancedInference(requests: InferenceRequest[], shareContext?: boolean): Promise<EnhancedInferenceResult[]>;
    private buildGraphContext;
    private extractKeyTerms;
    private getRelevantConcepts;
    private enrichConceptsWithRelationships;
    private getRelevantClauses;
    private getApplicablePatterns;
    private buildDomainKnowledge;
    private createEnhancedPrompt;
    private buildConceptContext;
    private buildClauseContext;
    private buildPatternContext;
    private buildDomainContext;
    private applyCurriculumAdaptations;
    private executeDSPyInference;
    private analyzeReasoningPath;
    private generateAlternativePerspectives;
    private identifyKnowledgeGaps;
    private calculateConceptRelevance;
    private calculatePatternApplicability;
    private calculateResponseConfidence;
    private extractGraphContextContributions;
    private countContextNodes;
    private buildSharedGraphContext;
}
//# sourceMappingURL=graph-enhanced-inference-service.d.ts.map