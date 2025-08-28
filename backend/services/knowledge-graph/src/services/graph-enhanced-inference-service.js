"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphEnhancedInferenceService = exports.EnhancedInferenceResultSchema = exports.InferenceRequestSchema = exports.GraphEnhancedPromptSchema = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const axios_1 = __importDefault(require("axios"));
const config_1 = require("@fineprintai/shared-config");
const zod_1 = require("zod");
const nanoid_1 = require("nanoid");
const logger = (0, logger_1.createServiceLogger)('graph-enhanced-inference-service');
exports.GraphEnhancedPromptSchema = zod_1.z.object({
    base_prompt: zod_1.z.string(),
    context_nodes: zod_1.z.array(zod_1.z.object({
        node_id: zod_1.z.string(),
        node_type: zod_1.z.enum(['CONCEPT', 'CLAUSE', 'PATTERN', 'DOCUMENT']),
        relevance_score: zod_1.z.number().min(0).max(1),
    })),
    reasoning_depth: zod_1.z.enum(['SHALLOW', 'MEDIUM', 'DEEP']).default('MEDIUM'),
    include_relationships: zod_1.z.boolean().default(true),
    include_examples: zod_1.z.boolean().default(true),
    max_context_nodes: zod_1.z.number().min(1).max(50).default(20),
});
exports.InferenceRequestSchema = zod_1.z.object({
    query: zod_1.z.string(),
    document_content: zod_1.z.string().optional(),
    context_type: zod_1.z.enum(['DOCUMENT_ANALYSIS', 'CONCEPT_EXPLANATION', 'LEGAL_REASONING']),
    use_graph_context: zod_1.z.boolean().default(true),
    use_curriculum_guidance: zod_1.z.boolean().default(false),
    inference_parameters: zod_1.z.object({
        temperature: zod_1.z.number().min(0).max(2).default(0.1),
        max_tokens: zod_1.z.number().min(1).max(8192).default(2048),
        top_p: zod_1.z.number().min(0).max(1).default(0.9),
        frequency_penalty: zod_1.z.number().min(-2).max(2).default(0),
    }).optional(),
    curriculum_context: zod_1.z.object({
        learner_id: zod_1.z.string(),
        current_difficulty: zod_1.z.number().min(1).max(10),
        focus_concepts: zod_1.z.array(zod_1.z.string()),
    }).optional(),
});
exports.EnhancedInferenceResultSchema = zod_1.z.object({
    inference_id: zod_1.z.string(),
    original_query: zod_1.z.string(),
    enhanced_response: zod_1.z.string(),
    confidence_score: zod_1.z.number().min(0).max(1),
    graph_context_used: zod_1.z.array(zod_1.z.object({
        node_id: zod_1.z.string(),
        node_type: zod_1.z.string(),
        contribution_score: zod_1.z.number(),
        reasoning: zod_1.z.string(),
    })),
    curriculum_adaptations: zod_1.z.array(zod_1.z.object({
        adaptation_type: zod_1.z.string(),
        description: zod_1.z.string(),
        difficulty_adjustment: zod_1.z.number(),
    })).optional(),
    reasoning_path: zod_1.z.array(zod_1.z.object({
        step: zod_1.z.number(),
        reasoning_type: zod_1.z.string(),
        graph_nodes_consulted: zod_1.z.array(zod_1.z.string()),
        conclusion: zod_1.z.string(),
    })),
    alternative_perspectives: zod_1.z.array(zod_1.z.string()),
    knowledge_gaps_identified: zod_1.z.array(zod_1.z.string()),
    performance_metrics: zod_1.z.object({
        inference_time_ms: zod_1.z.number(),
        graph_query_time_ms: zod_1.z.number(),
        context_nodes_processed: zod_1.z.number(),
        dspy_calls_made: zod_1.z.number(),
    }),
});
class GraphEnhancedInferenceService {
    knowledgeGraph;
    dspyServiceUrl;
    constructor(knowledgeGraph) {
        this.knowledgeGraph = knowledgeGraph;
        this.dspyServiceUrl = config_1.config.services?.dspy || 'http://localhost:3004';
    }
    async performEnhancedInference(request) {
        const startTime = Date.now();
        const inferenceId = (0, nanoid_1.nanoid)();
        try {
            logger.info('Starting graph-enhanced inference', {
                inferenceId,
                contextType: request.context_type,
                useGraphContext: request.use_graph_context,
                useCurriculumGuidance: request.use_curriculum_guidance,
            });
            const validatedRequest = exports.InferenceRequestSchema.parse(request);
            let graphContext = null;
            const graphQueryStartTime = Date.now();
            if (validatedRequest.use_graph_context) {
                graphContext = await this.buildGraphContext(validatedRequest);
            }
            const graphQueryTime = Date.now() - graphQueryStartTime;
            const enhancedPrompt = await this.createEnhancedPrompt(validatedRequest, graphContext);
            let curriculumAdaptations = [];
            if (validatedRequest.use_curriculum_guidance && validatedRequest.curriculum_context) {
                const adaptedPrompt = await this.applyCurriculumAdaptations(enhancedPrompt, validatedRequest.curriculum_context);
                enhancedPrompt.base_prompt = adaptedPrompt.adapted_prompt;
                curriculumAdaptations = adaptedPrompt.adaptations;
            }
            const dspyResponse = await this.executeDSPyInference(enhancedPrompt, validatedRequest.inference_parameters);
            const reasoningPath = await this.analyzeReasoningPath(dspyResponse, graphContext);
            const alternativePerspectives = await this.generateAlternativePerspectives(validatedRequest.query, graphContext);
            const knowledgeGaps = await this.identifyKnowledgeGaps(validatedRequest.query, graphContext, dspyResponse);
            const totalTime = Date.now() - startTime;
            const result = {
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
            return exports.EnhancedInferenceResultSchema.parse(result);
        }
        catch (error) {
            logger.error('Graph-enhanced inference failed', {
                error,
                inferenceId,
                processingTime: Date.now() - startTime,
            });
            throw error;
        }
    }
    async batchEnhancedInference(requests, shareContext = true) {
        const results = [];
        let sharedGraphContext = null;
        if (shareContext && requests.length > 1) {
            sharedGraphContext = await this.buildSharedGraphContext(requests);
        }
        for (const request of requests) {
            try {
                let enhancedRequest = request;
                if (shareContext && sharedGraphContext) {
                    enhancedRequest = {
                        ...request,
                        use_graph_context: true,
                    };
                }
                const result = await this.performEnhancedInference(enhancedRequest);
                results.push(result);
            }
            catch (error) {
                logger.error('Batch inference item failed', { error, query: request.query });
            }
        }
        return results;
    }
    async buildGraphContext(request) {
        const context = {
            concepts: [],
            clauses: [],
            patterns: [],
            domain_knowledge: {
                jurisdiction_specific: {},
                precedent_cases: [],
            },
        };
        try {
            const keyTerms = this.extractKeyTerms(request.query);
            const concepts = await this.getRelevantConcepts(keyTerms, 10);
            context.concepts = await this.enrichConceptsWithRelationships(concepts);
            if (request.document_content) {
                context.clauses = await this.getRelevantClauses(request.document_content, keyTerms, 10);
            }
            context.patterns = await this.getApplicablePatterns(keyTerms, request.context_type);
            context.domain_knowledge = await this.buildDomainKnowledge(keyTerms);
            logger.debug('Graph context built', {
                conceptsCount: context.concepts.length,
                clausesCount: context.clauses.length,
                patternsCount: context.patterns.length,
            });
            return context;
        }
        catch (error) {
            logger.error('Failed to build graph context', { error });
            return context;
        }
    }
    extractKeyTerms(query) {
        const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
        const words = query.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopWords.has(word));
        return [...new Set(words)];
    }
    async getRelevantConcepts(keyTerms, limit) {
        const results = [];
        for (const term of keyTerms.slice(0, 5)) {
            try {
                const concepts = await this.knowledgeGraph.getOntologyService()
                    .searchLegalConcepts(term);
                for (const concept of concepts.slice(0, 3)) {
                    const relevance = this.calculateConceptRelevance(concept, keyTerms);
                    results.push({ concept, relevance });
                }
            }
            catch (error) {
                logger.warn('Failed to get concepts for term', { error, term });
            }
        }
        return results
            .sort((a, b) => b.relevance - a.relevance)
            .slice(0, limit);
    }
    async enrichConceptsWithRelationships(concepts) {
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
                        strength: 1.0 / rel.depth,
                    })),
                });
            }
            catch (error) {
                logger.warn('Failed to enrich concept with relationships', {
                    error,
                    conceptId: concept.id
                });
                enrichedConcepts.push({
                    concept,
                    relevance,
                    relationships: [],
                });
            }
        }
        return enrichedConcepts;
    }
    async getRelevantClauses(documentContent, keyTerms, limit) {
        try {
            const embeddingsService = this.knowledgeGraph.getEmbeddingsService();
            return [];
        }
        catch (error) {
            logger.warn('Failed to get relevant clauses', { error });
            return [];
        }
    }
    async getApplicablePatterns(keyTerms, contextType) {
        try {
            const patterns = await this.knowledgeGraph.getOntologyService()
                .getPatternsByEffectiveness(0.7);
            return patterns.slice(0, 5).map(pattern => ({
                pattern_id: pattern.id,
                pattern_name: pattern.name,
                accuracy: pattern.accuracy,
                applicability: this.calculatePatternApplicability(pattern, keyTerms),
            }));
        }
        catch (error) {
            logger.warn('Failed to get applicable patterns', { error });
            return [];
        }
    }
    async buildDomainKnowledge(keyTerms) {
        return {
            jurisdiction_specific: {
                gdpr_applicable: keyTerms.includes('data') || keyTerms.includes('privacy'),
                ccpa_applicable: keyTerms.includes('california') || keyTerms.includes('consumer'),
            },
            precedent_cases: [],
        };
    }
    async createEnhancedPrompt(request, graphContext) {
        let enhancedPrompt = request.query;
        if (graphContext) {
            if (graphContext.concepts.length > 0) {
                const conceptContext = this.buildConceptContext(graphContext.concepts);
                enhancedPrompt += `\n\nRelevant Legal Concepts:\n${conceptContext}`;
            }
            if (graphContext.clauses.length > 0) {
                const clauseContext = this.buildClauseContext(graphContext.clauses);
                enhancedPrompt += `\n\nRelevant Legal Clauses:\n${clauseContext}`;
            }
            if (graphContext.patterns.length > 0) {
                const patternContext = this.buildPatternContext(graphContext.patterns);
                enhancedPrompt += `\n\nApplicable Patterns:\n${patternContext}`;
            }
            if (Object.keys(graphContext.domain_knowledge.jurisdiction_specific).length > 0) {
                const domainContext = this.buildDomainContext(graphContext.domain_knowledge);
                enhancedPrompt += `\n\nDomain Knowledge:\n${domainContext}`;
            }
        }
        enhancedPrompt += '\n\nPlease provide a comprehensive analysis considering the above context. ';
        enhancedPrompt += 'Explain your reasoning step by step and reference specific concepts or clauses when applicable.';
        const contextNodes = [];
        if (graphContext) {
            contextNodes.push(...graphContext.concepts.map(c => ({
                node_id: c.concept.id,
                node_type: 'CONCEPT',
                relevance_score: c.relevance,
            })), ...graphContext.clauses.map(c => ({
                node_id: c.clause.id,
                node_type: 'CLAUSE',
                relevance_score: c.relevance,
            })));
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
    buildConceptContext(concepts) {
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
    buildClauseContext(clauses) {
        return clauses
            .slice(0, 3)
            .map(({ clause, relevance, similarity_score }) => `- ${clause.title} (relevance: ${relevance.toFixed(2)}, similarity: ${similarity_score.toFixed(2)}): ${clause.description}`)
            .join('\n');
    }
    buildPatternContext(patterns) {
        return patterns
            .slice(0, 3)
            .map(pattern => `- ${pattern.pattern_name} (accuracy: ${pattern.accuracy.toFixed(2)}, applicability: ${pattern.applicability.toFixed(2)})`)
            .join('\n');
    }
    buildDomainContext(domainKnowledge) {
        const items = [];
        for (const [key, value] of Object.entries(domainKnowledge.jurisdiction_specific)) {
            if (value) {
                items.push(`- ${key.replace('_', ' ').toUpperCase()}: ${value}`);
            }
        }
        return items.join('\n');
    }
    async applyCurriculumAdaptations(prompt, curriculumContext) {
        const adaptations = [];
        let adaptedPrompt = prompt.base_prompt;
        if (curriculumContext.current_difficulty <= 3) {
            adaptedPrompt += '\n\nPlease provide a simplified explanation suitable for beginners. ';
            adaptedPrompt += 'Define technical terms and use concrete examples.';
            adaptations.push({
                adaptation_type: 'COMPLEXITY_REDUCTION',
                description: 'Simplified language and added definitions for beginner level',
                difficulty_adjustment: -2,
            });
        }
        else if (curriculumContext.current_difficulty >= 8) {
            adaptedPrompt += '\n\nPlease provide an advanced analysis with nuanced legal reasoning. ';
            adaptedPrompt += 'Consider edge cases and jurisdictional variations.';
            adaptations.push({
                adaptation_type: 'COMPLEXITY_INCREASE',
                description: 'Advanced analysis with edge cases for expert level',
                difficulty_adjustment: 2,
            });
        }
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
    async executeDSPyInference(enhancedPrompt, parameters) {
        try {
            const dspyRequest = {
                document_content: enhancedPrompt.base_prompt,
                document_type: 'terms_of_service',
                language: 'en',
                analysis_depth: 'detailed',
                ...parameters,
            };
            const response = await axios_1.default.post(`${this.dspyServiceUrl}/analyze`, dspyRequest, {
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
        }
        catch (error) {
            logger.error('DSPy inference failed', { error });
            return {
                response: 'Unable to complete enhanced analysis due to service unavailability.',
                confidence: 0.1,
                metadata: { error: 'DSPy service unavailable' },
            };
        }
    }
    async analyzeReasoningPath(dspyResponse, graphContext) {
        const reasoningPath = [];
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
        if (graphContext?.patterns.length > 0) {
            reasoningPath.push({
                step: 2,
                reasoning_type: 'PATTERN_MATCHING',
                graph_nodes_consulted: graphContext.patterns.map(p => p.pattern_id),
                conclusion: `Applied ${graphContext.patterns.length} legal patterns for analysis`,
            });
        }
        reasoningPath.push({
            step: reasoningPath.length + 1,
            reasoning_type: 'DSPY_REASONING',
            graph_nodes_consulted: [],
            conclusion: 'Applied DSPy reasoning modules for comprehensive analysis',
        });
        return reasoningPath;
    }
    async generateAlternativePerspectives(query, graphContext) {
        const perspectives = [];
        if (graphContext?.domain_knowledge.jurisdiction_specific.gdpr_applicable) {
            perspectives.push('From a GDPR compliance perspective, consider data subject rights and lawful basis requirements.');
        }
        if (graphContext?.domain_knowledge.jurisdiction_specific.ccpa_applicable) {
            perspectives.push('Under CCPA, consumers have rights to know, delete, and opt-out of the sale of personal information.');
        }
        perspectives.push('From a risk management standpoint, evaluate potential liability exposure and mitigation strategies.');
        perspectives.push('Consider the user experience impact and potential for consumer confusion or unfair practices.');
        return perspectives.slice(0, 3);
    }
    async identifyKnowledgeGaps(query, graphContext, dspyResponse) {
        const gaps = [];
        const queryTerms = this.extractKeyTerms(query);
        const coveredTerms = graphContext?.concepts.map(c => c.concept.name.toLowerCase()) || [];
        const uncoveredTerms = queryTerms.filter(term => !coveredTerms.some(covered => covered.includes(term)));
        if (uncoveredTerms.length > 0) {
            gaps.push(`Missing concept coverage for: ${uncoveredTerms.join(', ')}`);
        }
        if (dspyResponse.confidence < 0.7) {
            gaps.push('Low confidence in analysis - may need additional training data');
        }
        if (!graphContext?.patterns.length) {
            gaps.push('No applicable patterns found - pattern database may need expansion');
        }
        return gaps;
    }
    calculateConceptRelevance(concept, keyTerms) {
        let relevance = 0;
        const nameWords = concept.name.toLowerCase().split(/\s+/);
        const nameMatches = keyTerms.filter(term => nameWords.some(word => word.includes(term) || term.includes(word))).length;
        relevance += (nameMatches / keyTerms.length) * 0.5;
        const keywordMatches = keyTerms.filter(term => concept.keywords.some(keyword => keyword.toLowerCase().includes(term) || term.includes(keyword.toLowerCase()))).length;
        relevance += (keywordMatches / keyTerms.length) * 0.3;
        relevance += concept.importance_weight * 0.2;
        return Math.min(1.0, relevance);
    }
    calculatePatternApplicability(pattern, keyTerms) {
        const patternWords = pattern.description.toLowerCase().split(/\s+/);
        const matches = keyTerms.filter(term => patternWords.some(word => word.includes(term))).length;
        return matches / keyTerms.length;
    }
    calculateResponseConfidence(dspyResult) {
        if (dspyResult.dspy_metadata?.performance_metrics?.confidence_score) {
            return dspyResult.dspy_metadata.performance_metrics.confidence_score;
        }
        let confidence = 0.5;
        if (dspyResult.findings && dspyResult.findings.length > 0) {
            const avgConfidence = dspyResult.findings.reduce((sum, finding) => sum + (finding.confidence_score || 0.5), 0) / dspyResult.findings.length;
            confidence = avgConfidence;
        }
        return confidence;
    }
    extractGraphContextContributions(graphContext, dspyResponse) {
        if (!graphContext)
            return [];
        const contributions = [];
        for (const { concept, relevance } of graphContext.concepts.slice(0, 5)) {
            contributions.push({
                node_id: concept.id,
                node_type: 'CONCEPT',
                contribution_score: relevance,
                reasoning: `Provided context for ${concept.category.toLowerCase()} domain knowledge`,
            });
        }
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
    countContextNodes(graphContext) {
        return graphContext.concepts.length +
            graphContext.clauses.length +
            graphContext.patterns.length;
    }
    async buildSharedGraphContext(requests) {
        const allKeyTerms = requests.flatMap(req => this.extractKeyTerms(req.query));
        const uniqueKeyTerms = [...new Set(allKeyTerms)];
        const sharedRequest = {
            query: uniqueKeyTerms.join(' '),
            context_type: 'LEGAL_REASONING',
            use_graph_context: true,
        };
        return this.buildGraphContext(sharedRequest);
    }
}
exports.GraphEnhancedInferenceService = GraphEnhancedInferenceService;
//# sourceMappingURL=graph-enhanced-inference-service.js.map