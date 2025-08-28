import { createServiceLogger } from '@fineprintai/shared-logger';
import { Neo4jService } from './neo4j-service';
import { LegalOntologyService, LegalConcept, LegalClause, Pattern, Document } from './legal-ontology-service';
import { SemanticSearchService } from './semantic-search-service';
import { GraphEmbeddingsService } from './graph-embeddings-service';
import { z } from 'zod';
import axios from 'axios';
import { config } from '@fineprintai/shared-config';

const logger = createServiceLogger('knowledge-graph-service');

// Knowledge Graph Query Schemas
export const KnowledgeQuerySchema = z.object({
  query: z.string(),
  type: z.enum(['CONCEPT', 'CLAUSE', 'PATTERN', 'DOCUMENT', 'GENERAL']).default('GENERAL'),
  filters: z.object({
    category: z.string().optional(),
    severity: z.array(z.string()).optional(),
    difficulty_range: z.array(z.number()).length(2).optional(),
    confidence_threshold: z.number().min(0).max(1).optional(),
    jurisdiction: z.string().optional(),
    document_type: z.string().optional(),
  }).optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export const GraphReasoningRequestSchema = z.object({
  question: z.string(),
  context: z.object({
    document_id: z.string().optional(),
    clause_ids: z.array(z.string()).optional(),
    concept_ids: z.array(z.string()).optional(),
  }).optional(),
  reasoning_depth: z.enum(['SHALLOW', 'MEDIUM', 'DEEP']).default('MEDIUM'),
  include_explanations: z.boolean().default(true),
});

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

/**
 * Main Knowledge Graph Service - Orchestrates all graph operations
 * and provides high-level APIs for knowledge management and reasoning
 */
export class KnowledgeGraphService {
  private neo4jService: Neo4jService;
  private ontologyService: LegalOntologyService;
  private semanticSearchService: SemanticSearchService;
  private embeddingsService: GraphEmbeddingsService;
  private initialized = false;

  constructor() {
    this.neo4jService = new Neo4jService();
    this.ontologyService = new LegalOntologyService(this.neo4jService);
    this.semanticSearchService = new SemanticSearchService(this.neo4jService);
    this.embeddingsService = new GraphEmbeddingsService(this.neo4jService);
  }

  /**
   * Initialize all services and set up the knowledge graph
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Knowledge Graph Service...');

      // Initialize Neo4j connection
      await this.neo4jService.initialize();

      // Initialize legal ontology
      await this.ontologyService.initialize();

      // Initialize semantic search
      await this.semanticSearchService.initialize();

      // Initialize graph embeddings
      await this.embeddingsService.initialize();

      this.initialized = true;
      logger.info('Knowledge Graph Service initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize Knowledge Graph Service', { error });
      throw error;
    }
  }

  // ===== KNOWLEDGE QUERY INTERFACE =====

  /**
   * Query the knowledge graph with semantic understanding
   */
  async queryKnowledge(request: KnowledgeQuery): Promise<{
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
  }> {
    const startTime = Date.now();
    const validatedRequest = KnowledgeQuerySchema.parse(request);

    try {
      logger.debug('Processing knowledge query', { 
        query: validatedRequest.query.substring(0, 100),
        type: validatedRequest.type 
      });

      // Expand query semantically
      const semanticExpansions = await this.semanticSearchService.expandQuery(validatedRequest.query);
      
      // Execute type-specific search
      const results = await this.executeTypedSearch(validatedRequest, semanticExpansions);

      const queryTime = Date.now() - startTime;

      logger.info('Knowledge query completed', {
        resultsCount: results.length,
        queryTime,
        queryType: validatedRequest.type,
      });

      return {
        results,
        total: results.length,
        query_time_ms: queryTime,
        semantic_expansions: semanticExpansions,
      };

    } catch (error) {
      logger.error('Knowledge query failed', { error, request: validatedRequest });
      throw error;
    }
  }

  /**
   * Perform graph-based reasoning to answer complex questions
   */
  async reasonAboutLegalConcepts(request: GraphReasoningRequest): Promise<GraphReasoningResult> {
    const validatedRequest = GraphReasoningRequestSchema.parse(request);
    
    try {
      logger.debug('Starting graph reasoning', { 
        question: validatedRequest.question.substring(0, 100),
        depth: validatedRequest.reasoning_depth 
      });

      // Step 1: Extract entities and concepts from the question
      const entities = await this.extractEntitiesFromQuestion(validatedRequest.question);
      
      // Step 2: Build reasoning path through the graph
      const reasoningPath = await this.buildReasoningPath(
        entities,
        validatedRequest.context,
        validatedRequest.reasoning_depth
      );

      // Step 3: Generate answer using graph traversal results
      const answer = await this.generateGraphBasedAnswer(
        validatedRequest.question,
        reasoningPath,
        validatedRequest.include_explanations
      );

      // Step 4: Find supporting evidence
      const supportingEvidence = await this.findSupportingEvidence(entities, reasoningPath);

      // Step 5: Generate alternative perspectives
      const alternativePerspectives = await this.generateAlternativePerspectives(
        validatedRequest.question,
        reasoningPath
      );

      const result: GraphReasoningResult = {
        answer: answer.text,
        confidence: answer.confidence,
        reasoning_path: reasoningPath,
        supporting_evidence: supportingEvidence,
        alternative_perspectives: alternativePerspectives,
        limitations: answer.limitations,
      };

      logger.info('Graph reasoning completed', {
        confidence: result.confidence,
        pathSteps: result.reasoning_path.length,
        evidenceCount: result.supporting_evidence.length,
      });

      return result;

    } catch (error) {
      logger.error('Graph reasoning failed', { error, request: validatedRequest });
      throw error;
    }
  }

  // ===== KNOWLEDGE MANAGEMENT =====

  /**
   * Add new knowledge from document analysis
   */
  async addKnowledgeFromDocument(
    document: Partial<Document>,
    clauses: Array<Partial<LegalClause>>,
    concepts: Array<{ conceptId: string; relevance: number }>
  ): Promise<{ documentId: string; clausesAdded: number; conceptsLinked: number }> {
    try {
      // Create document
      const createdDocument = await this.ontologyService.createDocument(document);

      // Create clauses and link to concepts
      let clausesAdded = 0;
      for (const clause of clauses) {
        const clauseWithDocument = { ...clause, document_id: createdDocument.id };
        const relatedConcepts = concepts
          .filter(c => c.relevance > 0.5)
          .map(c => c.conceptId);
        
        await this.ontologyService.createLegalClause(clauseWithDocument, relatedConcepts);
        clausesAdded++;
      }

      // Update graph embeddings
      await this.embeddingsService.updateDocumentEmbeddings(createdDocument.id);

      logger.info('Knowledge added from document', {
        documentId: createdDocument.id,
        clausesAdded,
        conceptsLinked: concepts.length,
      });

      return {
        documentId: createdDocument.id,
        clausesAdded,
        conceptsLinked: concepts.length,
      };

    } catch (error) {
      logger.error('Failed to add knowledge from document', { error });
      throw error;
    }
  }

  /**
   * Update knowledge base with new patterns
   */
  async updatePatternKnowledge(
    patterns: Array<Partial<Pattern>>,
    performanceMetrics: Array<{ patternId: string; accuracy: number; falsePositiveRate: number }>
  ): Promise<{ patternsUpdated: number; performanceImproved: number }> {
    try {
      let patternsUpdated = 0;
      let performanceImproved = 0;

      for (const pattern of patterns) {
        const createdPattern = await this.ontologyService.createPattern(pattern);
        patternsUpdated++;

        // Check if performance improved
        const metrics = performanceMetrics.find(m => m.patternId === createdPattern.id);
        if (metrics && metrics.accuracy > 0.8) {
          performanceImproved++;
        }
      }

      // Retrain embeddings if significant changes
      if (patternsUpdated > 10) {
        await this.embeddingsService.retrainGraphEmbeddings();
      }

      logger.info('Pattern knowledge updated', { patternsUpdated, performanceImproved });

      return { patternsUpdated, performanceImproved };

    } catch (error) {
      logger.error('Failed to update pattern knowledge', { error });
      throw error;
    }
  }

  // ===== ANALYTICS AND INSIGHTS =====

  /**
   * Get comprehensive knowledge graph statistics
   */
  async getKnowledgeGraphStats(): Promise<KnowledgeGraphStats> {
    try {
      const statsQuery = `
        CALL {
          MATCH (n) RETURN count(n) AS totalNodes, collect(DISTINCT labels(n)) AS nodeTypes
        }
        CALL {
          MATCH ()-[r]->() RETURN count(r) AS totalRels, collect(DISTINCT type(r)) AS relTypes
        }
        CALL {
          MATCH (lc:LegalConcept) 
          RETURN count(lc) AS conceptCount, 
                 collect(lc.category) AS categories,
                 collect(lc.difficulty_level) AS difficulties
        }
        CALL {
          MATCH (clause:LegalClause)
          RETURN count(clause) AS clauseCount,
                 collect(clause.severity) AS severities,
                 avg(clause.confidence_score) AS avgConfidence
        }
        CALL {
          MATCH (p:Pattern)
          RETURN count(p) AS patternCount,
                 count(CASE WHEN p.enabled THEN 1 END) AS enabledPatterns,
                 avg(p.accuracy) AS avgAccuracy
        }
        CALL {
          MATCH (d:Document)
          RETURN count(d) AS docCount,
                 collect(d.document_type) AS docTypes,
                 collect(d.jurisdiction) AS jurisdictions
        }
        RETURN *
      `;

      const result = await this.neo4jService.executeQuery(statsQuery, {}, { cache: true });
      const record = result.records[0];

      // Process the results into structured stats
      const stats: KnowledgeGraphStats = {
        nodes: {
          total: record.get('totalNodes').toNumber(),
          by_type: this.countItems(record.get('nodeTypes').flat()),
        },
        relationships: {
          total: record.get('totalRels').toNumber(),
          by_type: this.countItems(record.get('relTypes')),
        },
        concepts: {
          total: record.get('conceptCount').toNumber(),
          by_category: this.countItems(record.get('categories')),
          difficulty_distribution: this.countItems(record.get('difficulties').map((d: any) => `Level ${d}`)),
        },
        clauses: {
          total: record.get('clauseCount').toNumber(),
          by_severity: this.countItems(record.get('severities')),
          average_confidence: record.get('avgConfidence') || 0,
        },
        patterns: {
          total: record.get('patternCount').toNumber(),
          enabled: record.get('enabledPatterns').toNumber(),
          average_accuracy: record.get('avgAccuracy') || 0,
        },
        documents: {
          total: record.get('docCount').toNumber(),
          by_type: this.countItems(record.get('docTypes')),
          by_jurisdiction: this.countItems(record.get('jurisdictions').filter((j: any) => j !== null)),
        },
      };

      return stats;

    } catch (error) {
      logger.error('Failed to get knowledge graph stats', { error });
      throw error;
    }
  }

  /**
   * Get insights about knowledge gaps and learning opportunities
   */
  async getKnowledgeInsights(): Promise<{
    knowledge_gaps: Array<{ category: string; missing_concepts: number; urgency: number }>;
    learning_opportunities: Array<{ concept: LegalConcept; difficulty_increase: number; readiness_score: number }>;
    pattern_performance: Array<{ pattern: Pattern; performance_trend: 'IMPROVING' | 'DECLINING' | 'STABLE' }>;
    recommendation: string;
  }> {
    try {
      // Identify knowledge gaps
      const gapsQuery = `
        MATCH (lc:LegalConcept)
        WITH lc.category AS category, count(lc) AS conceptCount
        WHERE conceptCount < 5
        RETURN category, conceptCount, 
               CASE 
                 WHEN conceptCount < 2 THEN 10
                 WHEN conceptCount < 4 THEN 7
                 ELSE 5
               END AS urgency
        ORDER BY urgency DESC
      `;

      const gapsResult = await this.neo4jService.executeQuery(gapsQuery, {}, { cache: true });
      const knowledge_gaps = gapsResult.records.map(record => ({
        category: record.get('category'),
        missing_concepts: 10 - record.get('conceptCount').toNumber(),
        urgency: record.get('urgency').toNumber(),
      }));

      // Find learning opportunities (concepts ready for difficulty increase)
      const opportunitiesQuery = `
        MATCH (lc:LegalConcept)<-[:RELATES_TO]-(clause:LegalClause)
        WHERE clause.confidence_score > 0.8 AND lc.difficulty_level < 8
        WITH lc, count(clause) AS high_confidence_clauses, avg(clause.confidence_score) AS avg_confidence
        WHERE high_confidence_clauses >= 3
        RETURN lc, high_confidence_clauses, avg_confidence,
               (avg_confidence * 0.7 + (high_confidence_clauses / 10.0) * 0.3) AS readiness_score
        ORDER BY readiness_score DESC
        LIMIT 10
      `;

      const opportunitiesResult = await this.neo4jService.executeQuery(opportunitiesQuery, {}, { cache: true });
      const learning_opportunities = opportunitiesResult.records.map(record => ({
        concept: record.get('lc').properties,
        difficulty_increase: 1,
        readiness_score: record.get('readiness_score'),
      }));

      // Analyze pattern performance trends (simplified for demo)
      const patternsQuery = `
        MATCH (p:Pattern)
        WHERE p.enabled = true
        RETURN p,
               CASE 
                 WHEN p.accuracy > 0.9 THEN 'IMPROVING'
                 WHEN p.accuracy < 0.7 THEN 'DECLINING'
                 ELSE 'STABLE'
               END AS trend
        ORDER BY p.accuracy DESC
        LIMIT 10
      `;

      const patternsResult = await this.neo4jService.executeQuery(patternsQuery, {}, { cache: true });
      const pattern_performance = patternsResult.records.map(record => ({
        pattern: record.get('p').properties,
        performance_trend: record.get('trend') as 'IMPROVING' | 'DECLINING' | 'STABLE',
      }));

      // Generate recommendation
      const recommendation = this.generateKnowledgeRecommendation(
        knowledge_gaps,
        learning_opportunities,
        pattern_performance
      );

      return {
        knowledge_gaps,
        learning_opportunities,
        pattern_performance,
        recommendation,
      };

    } catch (error) {
      logger.error('Failed to get knowledge insights', { error });
      throw error;
    }
  }

  // ===== HEALTH AND MAINTENANCE =====

  /**
   * Health check for all services
   */
  async healthCheck(): Promise<boolean> {
    try {
      const neo4jHealthy = await this.neo4jService.healthCheck();
      const embeddingsHealthy = await this.embeddingsService.healthCheck();
      
      return neo4jHealthy && embeddingsHealthy && this.initialized;
    } catch (error) {
      logger.error('Health check failed', { error });
      return false;
    }
  }

  /**
   * Shutdown all services
   */
  async shutdown(): Promise<void> {
    try {
      await this.embeddingsService.shutdown();
      await this.neo4jService.shutdown();
      
      this.initialized = false;
      logger.info('Knowledge Graph Service shutdown completed');
    } catch (error) {
      logger.error('Error during shutdown', { error });
      throw error;
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  private async executeTypedSearch(
    request: KnowledgeQuery,
    semanticExpansions: string[]
  ): Promise<Array<{ type: string; id: string; score: number; data: any; explanation?: string }>> {
    const results = [];

    switch (request.type) {
      case 'CONCEPT':
        const concepts = await this.ontologyService.searchLegalConcepts(
          request.query,
          request.filters?.category,
          request.filters?.difficulty_range as [number, number]
        );
        results.push(...concepts.map(c => ({
          type: 'CONCEPT',
          id: c.id,
          score: 0.9, // Would be calculated by semantic search
          data: c,
        })));
        break;

      case 'CLAUSE':
        const clauses = await this.ontologyService.getClausesBySeverity(
          request.filters?.severity || ['HIGH', 'CRITICAL'],
          request.filters?.confidence_threshold || 0.7
        );
        results.push(...clauses.slice(0, request.limit).map(c => ({
          type: 'CLAUSE',
          id: c.id,
          score: c.confidence_score,
          data: c,
        })));
        break;

      case 'PATTERN':
        const patterns = await this.ontologyService.getPatternsByEffectiveness(0.8);
        results.push(...patterns.slice(0, request.limit).map(p => ({
          type: 'PATTERN',
          id: p.id,
          score: p.accuracy,
          data: p,
        })));
        break;

      default:
        // GENERAL search across all types
        const generalResults = await this.semanticSearchService.searchAcrossTypes(
          request.query,
          request.limit
        );
        results.push(...generalResults);
    }

    return results.slice(request.offset, request.offset + request.limit);
  }

  private async extractEntitiesFromQuestion(question: string): Promise<string[]> {
    // This would typically use NLP/NER, simplified for demo
    const legalTerms = [
      'data', 'privacy', 'liability', 'termination', 'arbitration',
      'consent', 'cookies', 'sharing', 'third party', 'license'
    ];
    
    return legalTerms.filter(term => 
      question.toLowerCase().includes(term.toLowerCase())
    );
  }

  private async buildReasoningPath(
    entities: string[],
    context: any,
    depth: string
  ): Promise<Array<{ step: number; operation: string; nodes_involved: string[]; reasoning: string }>> {
    // Simplified reasoning path construction
    const path = [];
    
    for (let i = 0; i < entities.length; i++) {
      path.push({
        step: i + 1,
        operation: 'CONCEPT_LOOKUP',
        nodes_involved: [entities[i]],
        reasoning: `Looking up legal concept: ${entities[i]}`,
      });
    }

    return path;
  }

  private async generateGraphBasedAnswer(
    question: string,
    reasoningPath: any[],
    includeExplanations: boolean
  ): Promise<{ text: string; confidence: number; limitations: string[] }> {
    // This would integrate with DSPy service for actual answer generation
    return {
      text: `Based on the knowledge graph analysis, the answer involves ${reasoningPath.length} legal concepts with interconnected relationships.`,
      confidence: 0.8,
      limitations: ['Answer based on available knowledge graph data', 'May not reflect latest legal changes'],
    };
  }

  private async findSupportingEvidence(
    entities: string[],
    reasoningPath: any[]
  ): Promise<Array<{ type: 'CONCEPT' | 'CLAUSE' | 'PATTERN' | 'DOCUMENT'; id: string; relevance_score: number; excerpt: string }>> {
    // Simplified evidence finding
    return entities.map(entity => ({
      type: 'CONCEPT' as const,
      id: entity,
      relevance_score: 0.8,
      excerpt: `Evidence related to ${entity}`,
    }));
  }

  private async generateAlternativePerspectives(
    question: string,
    reasoningPath: any[]
  ): Promise<string[]> {
    return [
      'From a consumer protection standpoint...',
      'Considering jurisdictional differences...',
      'From a business compliance perspective...',
    ];
  }

  private countItems(items: any[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of items) {
      if (item !== null && item !== undefined) {
        counts[String(item)] = (counts[String(item)] || 0) + 1;
      }
    }
    return counts;
  }

  private generateKnowledgeRecommendation(
    gaps: any[],
    opportunities: any[],
    patterns: any[]
  ): string {
    if (gaps.length > 0) {
      return `Priority: Address knowledge gaps in ${gaps[0].category} category. Consider adding ${gaps[0].missing_concepts} more concepts.`;
    } else if (opportunities.length > 0) {
      return `Opportunity: Concept "${opportunities[0].concept.name}" is ready for difficulty advancement.`;
    } else {
      return 'Knowledge graph is well-balanced. Focus on pattern optimization.';
    }
  }

  // ===== GETTER METHODS FOR EXTERNAL ACCESS =====

  getNeo4jService(): Neo4jService {
    return this.neo4jService;
  }

  getOntologyService(): LegalOntologyService {
    return this.ontologyService;
  }

  getSemanticSearchService(): SemanticSearchService {
    return this.semanticSearchService;
  }

  getEmbeddingsService(): GraphEmbeddingsService {
    return this.embeddingsService;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}