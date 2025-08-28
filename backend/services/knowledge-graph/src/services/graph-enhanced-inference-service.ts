import { createServiceLogger } from '@fineprintai/shared-logger';
import { KnowledgeGraphService } from './knowledge-graph-service';
import { LegalConcept, LegalClause } from './legal-ontology-service';
import axios from 'axios';
import { config } from '@fineprintai/shared-config';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import * as _ from 'lodash';

const logger = createServiceLogger('graph-enhanced-inference-service');

// Enhanced Inference Schemas
export const GraphEnhancedPromptSchema = z.object({
  base_prompt: z.string(),
  context_nodes: z.array(z.object({
    node_id: z.string(),
    node_type: z.enum(['CONCEPT', 'CLAUSE', 'PATTERN', 'DOCUMENT']),
    relevance_score: z.number().min(0).max(1),
  })),
  reasoning_depth: z.enum(['SHALLOW', 'MEDIUM', 'DEEP']).default('MEDIUM'),
  include_relationships: z.boolean().default(true),
  include_examples: z.boolean().default(true),
  max_context_nodes: z.number().min(1).max(50).default(20),
});

export const InferenceRequestSchema = z.object({
  query: z.string(),
  document_content: z.string().optional(),
  context_type: z.enum(['DOCUMENT_ANALYSIS', 'CONCEPT_EXPLANATION', 'LEGAL_REASONING']),
  use_graph_context: z.boolean().default(true),
  use_curriculum_guidance: z.boolean().default(false),
  inference_parameters: z.object({
    temperature: z.number().min(0).max(2).default(0.1),
    max_tokens: z.number().min(1).max(8192).default(2048),
    top_p: z.number().min(0).max(1).default(0.9),
    frequency_penalty: z.number().min(-2).max(2).default(0),
  }).optional(),
  curriculum_context: z.object({
    learner_id: z.string(),
    current_difficulty: z.number().min(1).max(10),
    focus_concepts: z.array(z.string()),
  }).optional(),
});

export const EnhancedInferenceResultSchema = z.object({
  inference_id: z.string(),
  original_query: z.string(),
  enhanced_response: z.string(),
  confidence_score: z.number().min(0).max(1),
  graph_context_used: z.array(z.object({
    node_id: z.string(),
    node_type: z.string(),
    contribution_score: z.number(),
    reasoning: z.string(),
  })),
  curriculum_adaptations: z.array(z.object({
    adaptation_type: z.string(),
    description: z.string(),
    difficulty_adjustment: z.number(),
  })).optional(),
  reasoning_path: z.array(z.object({
    step: z.number(),
    reasoning_type: z.string(),
    graph_nodes_consulted: z.array(z.string()),
    conclusion: z.string(),
  })),
  alternative_perspectives: z.array(z.string()),
  knowledge_gaps_identified: z.array(z.string()),
  performance_metrics: z.object({
    inference_time_ms: z.number(),
    graph_query_time_ms: z.number(),
    context_nodes_processed: z.number(),
    dspy_calls_made: z.number(),
  }),
});

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

/**
 * Graph-Enhanced Inference Service - Integrates knowledge graph context
 * with DSPy reasoning for improved legal analysis and curriculum-aware responses
 */
export class GraphEnhancedInferenceService {
  private knowledgeGraph: KnowledgeGraphService;
  private dspyServiceUrl: string;

  constructor(knowledgeGraph: KnowledgeGraphService) {
    this.knowledgeGraph = knowledgeGraph;
    this.dspyServiceUrl = config.services?.dspy || 'http://localhost:3004';
  }

  /**
   * Perform graph-enhanced inference with curriculum awareness
   */
  async performEnhancedInference(request: InferenceRequest): Promise<EnhancedInferenceResult> {
    const startTime = Date.now();
    const inferenceId = nanoid();

    try {
      logger.info('Starting graph-enhanced inference', {
        inferenceId,
        contextType: request.context_type,
        useGraphContext: request.use_graph_context,
        useCurriculumGuidance: request.use_curriculum_guidance,
      });

      const validatedRequest = InferenceRequestSchema.parse(request);

      // Step 1: Build graph context
      let graphContext: GraphContext | null = null;
      const graphQueryStartTime = Date.now();
      
      if (validatedRequest.use_graph_context) {
        graphContext = await this.buildGraphContext(validatedRequest);
      }
      
      const graphQueryTime = Date.now() - graphQueryStartTime;

      // Step 2: Create enhanced prompt with graph context
      const enhancedPrompt = await this.createEnhancedPrompt(
        validatedRequest,
        graphContext
      );

      // Step 3: Apply curriculum adaptations if requested
      let curriculumAdaptations: any[] = [];
      if (validatedRequest.use_curriculum_guidance && validatedRequest.curriculum_context) {
        const adaptedPrompt = await this.applyCurriculumAdaptations(
          enhancedPrompt,
          validatedRequest.curriculum_context
        );
        enhancedPrompt.base_prompt = adaptedPrompt.adapted_prompt;
        curriculumAdaptations = adaptedPrompt.adaptations;
      }

      // Step 4: Execute enhanced inference with DSPy
      const dspyResponse = await this.executeDSPyInference(
        enhancedPrompt,
        validatedRequest.inference_parameters
      );

      // Step 5: Analyze reasoning path
      const reasoningPath = await this.analyzeReasoningPath(
        dspyResponse,
        graphContext
      );

      // Step 6: Generate alternative perspectives
      const alternativePerspectives = await this.generateAlternativePerspectives(
        validatedRequest.query,
        graphContext
      );

      // Step 7: Identify knowledge gaps
      const knowledgeGaps = await this.identifyKnowledgeGaps(
        validatedRequest.query,
        graphContext,
        dspyResponse
      );

      const totalTime = Date.now() - startTime;

      // Step 8: Compile enhanced result
      const result: EnhancedInferenceResult = {
        inference_id: inferenceId,
        original_query: validatedRequest.query,
        enhanced_response: dspyResponse.response,
        confidence_score: dspyResponse.confidence,
        graph_context_used: this.extractGraphContextContributions(graphContext, dspyResponse),
        curriculum_adaptations: curriculumAdaptations.length > 0 ? curriculumAdaptations : undefined,
        reasoning_path: reasoningPath,
        alternative_perspectives: alternativePerspectives,
        knowledge_gaps_identified: knowledgeGaps,
        performance_metrics: {
          inference_time_ms: totalTime,
          graph_query_time_ms: graphQueryTime,
          context_nodes_processed: graphContext ? this.countContextNodes(graphContext) : 0,
          dspy_calls_made: 1,
        },
      };

      logger.info('Graph-enhanced inference completed', {
        inferenceId,
        totalTime,
        graphQueryTime,
        confidence: result.confidence_score,
        contextNodesUsed: result.graph_context_used.length,
        reasoningSteps: result.reasoning_path.length,
      });

      return EnhancedInferenceResultSchema.parse(result);

    } catch (error) {
      logger.error('Graph-enhanced inference failed', {
        error,
        inferenceId,
        processingTime: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Batch process multiple inference requests with graph context sharing
   */
  async batchEnhancedInference(
    requests: InferenceRequest[],
    shareContext: boolean = true
  ): Promise<EnhancedInferenceResult[]> {
    const results: EnhancedInferenceResult[] = [];
    let sharedGraphContext: GraphContext | null = null;

    if (shareContext && requests.length > 1) {
      // Build shared context from all queries
      sharedGraphContext = await this.buildSharedGraphContext(requests);
    }

    for (const request of requests) {
      try {
        let enhancedRequest = request;
        
        if (shareContext && sharedGraphContext) {
          // Use shared context to avoid redundant graph queries
          enhancedRequest = {
            ...request,
            use_graph_context: true,
          };
        }

        const result = await this.performEnhancedInference(enhancedRequest);
        results.push(result);

      } catch (error) {
        logger.error('Batch inference item failed', { error, query: request.query });
        // Continue with other requests
      }
    }

    return results;
  }

  // ===== GRAPH CONTEXT BUILDING =====

  private async buildGraphContext(request: InferenceRequest): Promise<GraphContext> {
    const context: GraphContext = {
      concepts: [],
      clauses: [],
      patterns: [],
      domain_knowledge: {
        jurisdiction_specific: {},
        precedent_cases: [],
      },
    };

    try {
      // Extract key terms from query for context retrieval
      const keyTerms = this.extractKeyTerms(request.query);

      // Get relevant concepts
      const concepts = await this.getRelevantConcepts(keyTerms, 10);
      context.concepts = await this.enrichConceptsWithRelationships(concepts);

      // Get relevant clauses
      if (request.document_content) {
        context.clauses = await this.getRelevantClauses(
          request.document_content,
          keyTerms,
          10
        );
      }

      // Get applicable patterns
      context.patterns = await this.getApplicablePatterns(keyTerms, request.context_type);

      // Add domain-specific knowledge
      context.domain_knowledge = await this.buildDomainKnowledge(keyTerms);

      logger.debug('Graph context built', {
        conceptsCount: context.concepts.length,
        clausesCount: context.clauses.length,
        patternsCount: context.patterns.length,
      });

      return context;

    } catch (error) {
      logger.error('Failed to build graph context', { error });
      return context; // Return partial context
    }
  }

  private extractKeyTerms(query: string): string[] {
    // Simple keyword extraction - in production would use NLP
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    const words = query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    return [...new Set(words)];
  }

  private async getRelevantConcepts(
    keyTerms: string[],
    limit: number
  ): Promise<Array<{ concept: LegalConcept; relevance: number }>> {
    const results = [];

    for (const term of keyTerms.slice(0, 5)) { // Limit terms to avoid too many queries
      try {
        const concepts = await this.knowledgeGraph.getOntologyService()
          .searchLegalConcepts(term);

        for (const concept of concepts.slice(0, 3)) {
          const relevance = this.calculateConceptRelevance(concept, keyTerms);
          results.push({ concept, relevance });
        }
      } catch (error) {
        logger.warn('Failed to get concepts for term', { error, term });
      }
    }

    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  private async enrichConceptsWithRelationships(
    concepts: Array<{ concept: LegalConcept; relevance: number }>
  ): Promise<GraphContext['concepts']> {
    const enrichedConcepts = [];

    for (const { concept, relevance } of concepts) {
      try {
        const relationships = await this.knowledgeGraph.getOntologyService()
          .getRelatedConcepts(concept.id, undefined, 1);

        enrichedConcepts.push({
          concept,
          relevance,
          relationships: relationships.map(rel => ({
            target_id: rel.concept.id,
            relationship_type: rel.relationship,
            strength: 1.0 / rel.depth, // Closer relationships have higher strength
          })),
        });
      } catch (error) {
        logger.warn('Failed to enrich concept with relationships', { 
          error, 
          conceptId: concept.id 
        });
        
        // Add without relationships
        enrichedConcepts.push({
          concept,
          relevance,
          relationships: [],
        });
      }
    }

    return enrichedConcepts;
  }

  private async getRelevantClauses(
    documentContent: string,
    keyTerms: string[],
    limit: number
  ): Promise<GraphContext['clauses']> {
    try {
      // Use embeddings service to find similar clauses
      const embeddingsService = this.knowledgeGraph.getEmbeddingsService();
      
      // For demo, return simplified results
      return [];
      
    } catch (error) {
      logger.warn('Failed to get relevant clauses', { error });
      return [];
    }
  }

  private async getApplicablePatterns(
    keyTerms: string[],
    contextType: string
  ): Promise<GraphContext['patterns']> {
    try {
      const patterns = await this.knowledgeGraph.getOntologyService()
        .getPatternsByEffectiveness(0.7);

      return patterns.slice(0, 5).map(pattern => ({
        pattern_id: pattern.id,
        pattern_name: pattern.name,
        accuracy: pattern.accuracy,
        applicability: this.calculatePatternApplicability(pattern, keyTerms),
      }));

    } catch (error) {
      logger.warn('Failed to get applicable patterns', { error });
      return [];
    }
  }

  private async buildDomainKnowledge(keyTerms: string[]): Promise<GraphContext['domain_knowledge']> {
    // Simplified domain knowledge - in production would query external sources
    return {
      jurisdiction_specific: {
        gdpr_applicable: keyTerms.includes('data') || keyTerms.includes('privacy'),
        ccpa_applicable: keyTerms.includes('california') || keyTerms.includes('consumer'),
      },
      precedent_cases: [],
    };
  }

  // ===== PROMPT ENHANCEMENT =====

  private async createEnhancedPrompt(
    request: InferenceRequest,
    graphContext: GraphContext | null
  ): Promise<GraphEnhancedPrompt> {
    let enhancedPrompt = request.query;

    if (graphContext) {
      // Add concept context
      if (graphContext.concepts.length > 0) {
        const conceptContext = this.buildConceptContext(graphContext.concepts);
        enhancedPrompt += `\n\nRelevant Legal Concepts:\n${conceptContext}`;
      }

      // Add clause context
      if (graphContext.clauses.length > 0) {
        const clauseContext = this.buildClauseContext(graphContext.clauses);
        enhancedPrompt += `\n\nRelevant Legal Clauses:\n${clauseContext}`;
      }

      // Add pattern context
      if (graphContext.patterns.length > 0) {
        const patternContext = this.buildPatternContext(graphContext.patterns);
        enhancedPrompt += `\n\nApplicable Patterns:\n${patternContext}`;
      }

      // Add domain knowledge
      if (Object.keys(graphContext.domain_knowledge.jurisdiction_specific).length > 0) {
        const domainContext = this.buildDomainContext(graphContext.domain_knowledge);
        enhancedPrompt += `\n\nDomain Knowledge:\n${domainContext}`;
      }
    }

    // Add reasoning instructions
    enhancedPrompt += '\n\nPlease provide a comprehensive analysis considering the above context. ';
    enhancedPrompt += 'Explain your reasoning step by step and reference specific concepts or clauses when applicable.';

    const contextNodes = [];
    if (graphContext) {
      // Build context nodes array
      contextNodes.push(
        ...graphContext.concepts.map(c => ({
          node_id: c.concept.id,
          node_type: 'CONCEPT' as const,
          relevance_score: c.relevance,
        })),
        ...graphContext.clauses.map(c => ({
          node_id: c.clause.id,
          node_type: 'CLAUSE' as const,
          relevance_score: c.relevance,
        }))
      );
    }

    return {
      base_prompt: enhancedPrompt,
      context_nodes: contextNodes,
      reasoning_depth: 'MEDIUM',
      include_relationships: true,
      include_examples: true,
      max_context_nodes: 20,
    };
  }

  private buildConceptContext(concepts: GraphContext['concepts']): string {
    return concepts
      .slice(0, 5)
      .map(({ concept, relevance, relationships }) => {
        let context = `- ${concept.name} (relevance: ${relevance.toFixed(2)}): ${concept.description}`;
        
        if (relationships.length > 0) {
          const relatedConcepts = relationships
            .slice(0, 3)
            .map(rel => `${rel.relationship_type} ${rel.target_id}`)
            .join(', ');
          context += ` [Related: ${relatedConcepts}]`;
        }
        
        return context;
      })
      .join('\n');
  }

  private buildClauseContext(clauses: GraphContext['clauses']): string {
    return clauses
      .slice(0, 3)
      .map(({ clause, relevance, similarity_score }) => 
        `- ${clause.title} (relevance: ${relevance.toFixed(2)}, similarity: ${similarity_score.toFixed(2)}): ${clause.description}`
      )
      .join('\n');
  }

  private buildPatternContext(patterns: GraphContext['patterns']): string {
    return patterns
      .slice(0, 3)
      .map(pattern => 
        `- ${pattern.pattern_name} (accuracy: ${pattern.accuracy.toFixed(2)}, applicability: ${pattern.applicability.toFixed(2)})`
      )
      .join('\n');
  }

  private buildDomainContext(domainKnowledge: GraphContext['domain_knowledge']): string {
    const items = [];
    
    for (const [key, value] of Object.entries(domainKnowledge.jurisdiction_specific)) {
      if (value) {
        items.push(`- ${key.replace('_', ' ').toUpperCase()}: ${value}`);
      }
    }
    
    return items.join('\n');
  }

  // ===== CURRICULUM ADAPTATIONS =====

  private async applyCurriculumAdaptations(
    prompt: GraphEnhancedPrompt,
    curriculumContext: NonNullable<InferenceRequest['curriculum_context']>
  ): Promise<{
    adapted_prompt: string;
    adaptations: Array<{
      adaptation_type: string;
      description: string;
      difficulty_adjustment: number;
    }>;
  }> {
    const adaptations = [];
    let adaptedPrompt = prompt.base_prompt;

    // Adjust complexity based on learner's current difficulty level
    if (curriculumContext.current_difficulty <= 3) {
      adaptedPrompt += '\n\nPlease provide a simplified explanation suitable for beginners. ';
      adaptedPrompt += 'Define technical terms and use concrete examples.';
      
      adaptations.push({
        adaptation_type: 'COMPLEXITY_REDUCTION',
        description: 'Simplified language and added definitions for beginner level',
        difficulty_adjustment: -2,
      });
    } else if (curriculumContext.current_difficulty >= 8) {
      adaptedPrompt += '\n\nPlease provide an advanced analysis with nuanced legal reasoning. ';
      adaptedPrompt += 'Consider edge cases and jurisdictional variations.';
      
      adaptations.push({
        adaptation_type: 'COMPLEXITY_INCREASE',
        description: 'Advanced analysis with edge cases for expert level',
        difficulty_adjustment: 2,
      });
    }

    // Focus on specific concepts if provided
    if (curriculumContext.focus_concepts.length > 0) {
      const focusConcepts = curriculumContext.focus_concepts.join(', ');
      adaptedPrompt += `\n\nPay special attention to these concepts: ${focusConcepts}.`;
      
      adaptations.push({
        adaptation_type: 'CONCEPT_FOCUS',
        description: `Emphasized focus concepts: ${focusConcepts}`,
        difficulty_adjustment: 0,
      });
    }

    return { adapted_prompt: adaptedPrompt, adaptations };
  }

  // ===== DSPY INTEGRATION =====

  private async executeDSPyInference(
    enhancedPrompt: GraphEnhancedPrompt,
    parameters?: InferenceRequest['inference_parameters']
  ): Promise<{ response: string; confidence: number; metadata: any }> {
    try {
      const dspyRequest = {
        document_content: enhancedPrompt.base_prompt,
        document_type: 'terms_of_service', // Default
        language: 'en',
        analysis_depth: 'detailed',
        // Add inference parameters if provided
        ...parameters,
      };

      const response = await axios.post(`${this.dspyServiceUrl}/analyze`, dspyRequest, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const dspyResult = response.data;

      return {
        response: dspyResult.executive_summary || 'Analysis completed successfully',
        confidence: this.calculateResponseConfidence(dspyResult),
        metadata: dspyResult.dspy_metadata || {},
      };

    } catch (error) {
      logger.error('DSPy inference failed', { error });
      
      // Fallback response
      return {
        response: 'Unable to complete enhanced analysis due to service unavailability.',
        confidence: 0.1,
        metadata: { error: 'DSPy service unavailable' },
      };
    }
  }

  // ===== ANALYSIS AND REASONING =====

  private async analyzeReasoningPath(
    dspyResponse: any,
    graphContext: GraphContext | null
  ): Promise<EnhancedInferenceResult['reasoning_path']> {
    const reasoningPath = [];

    // Step 1: Graph context analysis
    if (graphContext) {
      reasoningPath.push({
        step: 1,
        reasoning_type: 'GRAPH_CONTEXT_ANALYSIS',
        graph_nodes_consulted: [
          ...graphContext.concepts.map(c => c.concept.id),
          ...graphContext.clauses.map(c => c.clause.id),
        ],
        conclusion: `Analyzed ${graphContext.concepts.length} concepts and ${graphContext.clauses.length} clauses for context`,
      });
    }

    // Step 2: Pattern matching
    if (graphContext?.patterns.length > 0) {
      reasoningPath.push({
        step: 2,
        reasoning_type: 'PATTERN_MATCHING',
        graph_nodes_consulted: graphContext.patterns.map(p => p.pattern_id),
        conclusion: `Applied ${graphContext.patterns.length} legal patterns for analysis`,
      });
    }

    // Step 3: DSPy reasoning
    reasoningPath.push({
      step: reasoningPath.length + 1,
      reasoning_type: 'DSPY_REASONING',
      graph_nodes_consulted: [],
      conclusion: 'Applied DSPy reasoning modules for comprehensive analysis',
    });

    return reasoningPath;
  }

  private async generateAlternativePerspectives(
    query: string,
    graphContext: GraphContext | null
  ): Promise<string[]> {
    const perspectives = [];

    // Jurisdiction-based perspectives
    if (graphContext?.domain_knowledge.jurisdiction_specific.gdpr_applicable) {
      perspectives.push('From a GDPR compliance perspective, consider data subject rights and lawful basis requirements.');
    }

    if (graphContext?.domain_knowledge.jurisdiction_specific.ccpa_applicable) {
      perspectives.push('Under CCPA, consumers have rights to know, delete, and opt-out of the sale of personal information.');
    }

    // Risk-based perspectives
    perspectives.push('From a risk management standpoint, evaluate potential liability exposure and mitigation strategies.');

    // User experience perspective
    perspectives.push('Consider the user experience impact and potential for consumer confusion or unfair practices.');

    return perspectives.slice(0, 3); // Limit to most relevant perspectives
  }

  private async identifyKnowledgeGaps(
    query: string,
    graphContext: GraphContext | null,
    dspyResponse: any
  ): Promise<string[]> {
    const gaps = [];

    // Check for missing concept coverage
    const queryTerms = this.extractKeyTerms(query);
    const coveredTerms = graphContext?.concepts.map(c => c.concept.name.toLowerCase()) || [];
    
    const uncoveredTerms = queryTerms.filter(term => 
      !coveredTerms.some(covered => covered.includes(term))
    );

    if (uncoveredTerms.length > 0) {
      gaps.push(`Missing concept coverage for: ${uncoveredTerms.join(', ')}`);
    }

    // Check for low-confidence areas
    if (dspyResponse.confidence < 0.7) {
      gaps.push('Low confidence in analysis - may need additional training data');
    }

    // Check for pattern coverage
    if (!graphContext?.patterns.length) {
      gaps.push('No applicable patterns found - pattern database may need expansion');
    }

    return gaps;
  }

  // ===== HELPER METHODS =====

  private calculateConceptRelevance(concept: LegalConcept, keyTerms: string[]): number {
    let relevance = 0;

    // Check name matching
    const nameWords = concept.name.toLowerCase().split(/\s+/);
    const nameMatches = keyTerms.filter(term => 
      nameWords.some(word => word.includes(term) || term.includes(word))
    ).length;
    relevance += (nameMatches / keyTerms.length) * 0.5;

    // Check keyword matching
    const keywordMatches = keyTerms.filter(term =>
      concept.keywords.some(keyword => 
        keyword.toLowerCase().includes(term) || term.includes(keyword.toLowerCase())
      )
    ).length;
    relevance += (keywordMatches / keyTerms.length) * 0.3;

    // Add importance weight
    relevance += concept.importance_weight * 0.2;

    return Math.min(1.0, relevance);
  }

  private calculatePatternApplicability(pattern: any, keyTerms: string[]): number {
    // Simple applicability based on pattern description matching
    const patternWords = pattern.description.toLowerCase().split(/\s+/);
    const matches = keyTerms.filter(term =>
      patternWords.some(word => word.includes(term))
    ).length;
    
    return matches / keyTerms.length;
  }

  private calculateResponseConfidence(dspyResult: any): number {
    if (dspyResult.dspy_metadata?.performance_metrics?.confidence_score) {
      return dspyResult.dspy_metadata.performance_metrics.confidence_score;
    }
    
    // Estimate confidence based on response quality indicators
    let confidence = 0.5;
    
    if (dspyResult.findings && dspyResult.findings.length > 0) {
      const avgConfidence = dspyResult.findings.reduce((sum: number, finding: any) => 
        sum + (finding.confidence_score || 0.5), 0
      ) / dspyResult.findings.length;
      confidence = avgConfidence;
    }
    
    return confidence;
  }

  private extractGraphContextContributions(
    graphContext: GraphContext | null,
    dspyResponse: any
  ): EnhancedInferenceResult['graph_context_used'] {
    if (!graphContext) return [];

    const contributions = [];

    // Add concept contributions
    for (const { concept, relevance } of graphContext.concepts.slice(0, 5)) {
      contributions.push({
        node_id: concept.id,
        node_type: 'CONCEPT',
        contribution_score: relevance,
        reasoning: `Provided context for ${concept.category.toLowerCase()} domain knowledge`,
      });
    }

    // Add clause contributions
    for (const { clause, relevance } of graphContext.clauses.slice(0, 3)) {
      contributions.push({
        node_id: clause.id,
        node_type: 'CLAUSE',
        contribution_score: relevance,
        reasoning: `Provided similar clause example with ${clause.severity.toLowerCase()} severity`,
      });
    }

    return contributions.sort((a, b) => b.contribution_score - a.contribution_score);
  }

  private countContextNodes(graphContext: GraphContext): number {
    return graphContext.concepts.length + 
           graphContext.clauses.length + 
           graphContext.patterns.length;
  }

  private async buildSharedGraphContext(requests: InferenceRequest[]): Promise<GraphContext> {
    // Extract key terms from all requests
    const allKeyTerms = requests.flatMap(req => this.extractKeyTerms(req.query));
    const uniqueKeyTerms = [...new Set(allKeyTerms)];

    // Build context using combined key terms
    const sharedRequest: InferenceRequest = {
      query: uniqueKeyTerms.join(' '),
      context_type: 'LEGAL_REASONING',
      use_graph_context: true,
    };

    return this.buildGraphContext(sharedRequest);
  }
}