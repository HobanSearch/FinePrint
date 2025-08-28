"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KnowledgeGraphService = exports.GraphReasoningRequestSchema = exports.KnowledgeQuerySchema = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const neo4j_service_1 = require("./neo4j-service");
const legal_ontology_service_1 = require("./legal-ontology-service");
const semantic_search_service_1 = require("./semantic-search-service");
const graph_embeddings_service_1 = require("./graph-embeddings-service");
const zod_1 = require("zod");
const logger = (0, logger_1.createServiceLogger)('knowledge-graph-service');
exports.KnowledgeQuerySchema = zod_1.z.object({
    query: zod_1.z.string(),
    type: zod_1.z.enum(['CONCEPT', 'CLAUSE', 'PATTERN', 'DOCUMENT', 'GENERAL']).default('GENERAL'),
    filters: zod_1.z.object({
        category: zod_1.z.string().optional(),
        severity: zod_1.z.array(zod_1.z.string()).optional(),
        difficulty_range: zod_1.z.array(zod_1.z.number()).length(2).optional(),
        confidence_threshold: zod_1.z.number().min(0).max(1).optional(),
        jurisdiction: zod_1.z.string().optional(),
        document_type: zod_1.z.string().optional(),
    }).optional(),
    limit: zod_1.z.number().min(1).max(100).default(20),
    offset: zod_1.z.number().min(0).default(0),
});
exports.GraphReasoningRequestSchema = zod_1.z.object({
    question: zod_1.z.string(),
    context: zod_1.z.object({
        document_id: zod_1.z.string().optional(),
        clause_ids: zod_1.z.array(zod_1.z.string()).optional(),
        concept_ids: zod_1.z.array(zod_1.z.string()).optional(),
    }).optional(),
    reasoning_depth: zod_1.z.enum(['SHALLOW', 'MEDIUM', 'DEEP']).default('MEDIUM'),
    include_explanations: zod_1.z.boolean().default(true),
});
class KnowledgeGraphService {
    neo4jService;
    ontologyService;
    semanticSearchService;
    embeddingsService;
    initialized = false;
    constructor() {
        this.neo4jService = new neo4j_service_1.Neo4jService();
        this.ontologyService = new legal_ontology_service_1.LegalOntologyService(this.neo4jService);
        this.semanticSearchService = new semantic_search_service_1.SemanticSearchService(this.neo4jService);
        this.embeddingsService = new graph_embeddings_service_1.GraphEmbeddingsService(this.neo4jService);
    }
    async initialize() {
        try {
            logger.info('Initializing Knowledge Graph Service...');
            await this.neo4jService.initialize();
            await this.ontologyService.initialize();
            await this.semanticSearchService.initialize();
            await this.embeddingsService.initialize();
            this.initialized = true;
            logger.info('Knowledge Graph Service initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize Knowledge Graph Service', { error });
            throw error;
        }
    }
    async queryKnowledge(request) {
        const startTime = Date.now();
        const validatedRequest = exports.KnowledgeQuerySchema.parse(request);
        try {
            logger.debug('Processing knowledge query', {
                query: validatedRequest.query.substring(0, 100),
                type: validatedRequest.type
            });
            const semanticExpansions = await this.semanticSearchService.expandQuery(validatedRequest.query);
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
        }
        catch (error) {
            logger.error('Knowledge query failed', { error, request: validatedRequest });
            throw error;
        }
    }
    async reasonAboutLegalConcepts(request) {
        const validatedRequest = exports.GraphReasoningRequestSchema.parse(request);
        try {
            logger.debug('Starting graph reasoning', {
                question: validatedRequest.question.substring(0, 100),
                depth: validatedRequest.reasoning_depth
            });
            const entities = await this.extractEntitiesFromQuestion(validatedRequest.question);
            const reasoningPath = await this.buildReasoningPath(entities, validatedRequest.context, validatedRequest.reasoning_depth);
            const answer = await this.generateGraphBasedAnswer(validatedRequest.question, reasoningPath, validatedRequest.include_explanations);
            const supportingEvidence = await this.findSupportingEvidence(entities, reasoningPath);
            const alternativePerspectives = await this.generateAlternativePerspectives(validatedRequest.question, reasoningPath);
            const result = {
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
        }
        catch (error) {
            logger.error('Graph reasoning failed', { error, request: validatedRequest });
            throw error;
        }
    }
    async addKnowledgeFromDocument(document, clauses, concepts) {
        try {
            const createdDocument = await this.ontologyService.createDocument(document);
            let clausesAdded = 0;
            for (const clause of clauses) {
                const clauseWithDocument = { ...clause, document_id: createdDocument.id };
                const relatedConcepts = concepts
                    .filter(c => c.relevance > 0.5)
                    .map(c => c.conceptId);
                await this.ontologyService.createLegalClause(clauseWithDocument, relatedConcepts);
                clausesAdded++;
            }
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
        }
        catch (error) {
            logger.error('Failed to add knowledge from document', { error });
            throw error;
        }
    }
    async updatePatternKnowledge(patterns, performanceMetrics) {
        try {
            let patternsUpdated = 0;
            let performanceImproved = 0;
            for (const pattern of patterns) {
                const createdPattern = await this.ontologyService.createPattern(pattern);
                patternsUpdated++;
                const metrics = performanceMetrics.find(m => m.patternId === createdPattern.id);
                if (metrics && metrics.accuracy > 0.8) {
                    performanceImproved++;
                }
            }
            if (patternsUpdated > 10) {
                await this.embeddingsService.retrainGraphEmbeddings();
            }
            logger.info('Pattern knowledge updated', { patternsUpdated, performanceImproved });
            return { patternsUpdated, performanceImproved };
        }
        catch (error) {
            logger.error('Failed to update pattern knowledge', { error });
            throw error;
        }
    }
    async getKnowledgeGraphStats() {
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
            const stats = {
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
                    difficulty_distribution: this.countItems(record.get('difficulties').map((d) => `Level ${d}`)),
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
                    by_jurisdiction: this.countItems(record.get('jurisdictions').filter((j) => j !== null)),
                },
            };
            return stats;
        }
        catch (error) {
            logger.error('Failed to get knowledge graph stats', { error });
            throw error;
        }
    }
    async getKnowledgeInsights() {
        try {
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
                performance_trend: record.get('trend'),
            }));
            const recommendation = this.generateKnowledgeRecommendation(knowledge_gaps, learning_opportunities, pattern_performance);
            return {
                knowledge_gaps,
                learning_opportunities,
                pattern_performance,
                recommendation,
            };
        }
        catch (error) {
            logger.error('Failed to get knowledge insights', { error });
            throw error;
        }
    }
    async healthCheck() {
        try {
            const neo4jHealthy = await this.neo4jService.healthCheck();
            const embeddingsHealthy = await this.embeddingsService.healthCheck();
            return neo4jHealthy && embeddingsHealthy && this.initialized;
        }
        catch (error) {
            logger.error('Health check failed', { error });
            return false;
        }
    }
    async shutdown() {
        try {
            await this.embeddingsService.shutdown();
            await this.neo4jService.shutdown();
            this.initialized = false;
            logger.info('Knowledge Graph Service shutdown completed');
        }
        catch (error) {
            logger.error('Error during shutdown', { error });
            throw error;
        }
    }
    async executeTypedSearch(request, semanticExpansions) {
        const results = [];
        switch (request.type) {
            case 'CONCEPT':
                const concepts = await this.ontologyService.searchLegalConcepts(request.query, request.filters?.category, request.filters?.difficulty_range);
                results.push(...concepts.map(c => ({
                    type: 'CONCEPT',
                    id: c.id,
                    score: 0.9,
                    data: c,
                })));
                break;
            case 'CLAUSE':
                const clauses = await this.ontologyService.getClausesBySeverity(request.filters?.severity || ['HIGH', 'CRITICAL'], request.filters?.confidence_threshold || 0.7);
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
                const generalResults = await this.semanticSearchService.searchAcrossTypes(request.query, request.limit);
                results.push(...generalResults);
        }
        return results.slice(request.offset, request.offset + request.limit);
    }
    async extractEntitiesFromQuestion(question) {
        const legalTerms = [
            'data', 'privacy', 'liability', 'termination', 'arbitration',
            'consent', 'cookies', 'sharing', 'third party', 'license'
        ];
        return legalTerms.filter(term => question.toLowerCase().includes(term.toLowerCase()));
    }
    async buildReasoningPath(entities, context, depth) {
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
    async generateGraphBasedAnswer(question, reasoningPath, includeExplanations) {
        return {
            text: `Based on the knowledge graph analysis, the answer involves ${reasoningPath.length} legal concepts with interconnected relationships.`,
            confidence: 0.8,
            limitations: ['Answer based on available knowledge graph data', 'May not reflect latest legal changes'],
        };
    }
    async findSupportingEvidence(entities, reasoningPath) {
        return entities.map(entity => ({
            type: 'CONCEPT',
            id: entity,
            relevance_score: 0.8,
            excerpt: `Evidence related to ${entity}`,
        }));
    }
    async generateAlternativePerspectives(question, reasoningPath) {
        return [
            'From a consumer protection standpoint...',
            'Considering jurisdictional differences...',
            'From a business compliance perspective...',
        ];
    }
    countItems(items) {
        const counts = {};
        for (const item of items) {
            if (item !== null && item !== undefined) {
                counts[String(item)] = (counts[String(item)] || 0) + 1;
            }
        }
        return counts;
    }
    generateKnowledgeRecommendation(gaps, opportunities, patterns) {
        if (gaps.length > 0) {
            return `Priority: Address knowledge gaps in ${gaps[0].category} category. Consider adding ${gaps[0].missing_concepts} more concepts.`;
        }
        else if (opportunities.length > 0) {
            return `Opportunity: Concept "${opportunities[0].concept.name}" is ready for difficulty advancement.`;
        }
        else {
            return 'Knowledge graph is well-balanced. Focus on pattern optimization.';
        }
    }
    getNeo4jService() {
        return this.neo4jService;
    }
    getOntologyService() {
        return this.ontologyService;
    }
    getSemanticSearchService() {
        return this.semanticSearchService;
    }
    getEmbeddingsService() {
        return this.embeddingsService;
    }
    isInitialized() {
        return this.initialized;
    }
}
exports.KnowledgeGraphService = KnowledgeGraphService;
//# sourceMappingURL=knowledge-graph-service.js.map