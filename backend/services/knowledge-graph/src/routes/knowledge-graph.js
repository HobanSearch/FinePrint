"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.knowledgeGraphRoutes = knowledgeGraphRoutes;
async function knowledgeGraphRoutes(server) {
    const knowledgeGraph = server.knowledgeGraph;
    server.post('/query', {
        schema: {
            tags: ['Knowledge Graph'],
            summary: 'Query the knowledge graph',
            description: 'Search for concepts, clauses, patterns, or documents using semantic understanding',
            body: {
                type: 'object',
                required: ['query'],
                properties: {
                    query: { type: 'string', minLength: 1 },
                    type: {
                        type: 'string',
                        enum: ['CONCEPT', 'CLAUSE', 'PATTERN', 'DOCUMENT', 'GENERAL'],
                        default: 'GENERAL',
                    },
                    filters: {
                        type: 'object',
                        properties: {
                            category: { type: 'string' },
                            severity: { type: 'array', items: { type: 'string' } },
                            difficulty_range: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
                            confidence_threshold: { type: 'number', minimum: 0, maximum: 1 },
                            jurisdiction: { type: 'string' },
                            document_type: { type: 'string' },
                        },
                    },
                    limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
                    offset: { type: 'number', minimum: 0, default: 0 },
                },
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        results: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    type: { type: 'string' },
                                    id: { type: 'string' },
                                    score: { type: 'number' },
                                    data: { type: 'object' },
                                    explanation: { type: 'string' },
                                },
                            },
                        },
                        total: { type: 'number' },
                        query_time_ms: { type: 'number' },
                        semantic_expansions: { type: 'array', items: { type: 'string' } },
                    },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const result = await knowledgeGraph.queryKnowledge(request.body);
            return result;
        }
        catch (error) {
            request.log.error('Knowledge graph query failed', { error, body: request.body });
            reply.status(500);
            return { error: 'Failed to query knowledge graph', message: error.message };
        }
    });
    server.post('/reason', {
        schema: {
            tags: ['Knowledge Graph'],
            summary: 'Graph-based legal reasoning',
            description: 'Answer complex legal questions using graph traversal and reasoning',
            body: {
                type: 'object',
                required: ['question'],
                properties: {
                    question: { type: 'string', minLength: 1 },
                    context: {
                        type: 'object',
                        properties: {
                            document_id: { type: 'string' },
                            clause_ids: { type: 'array', items: { type: 'string' } },
                            concept_ids: { type: 'array', items: { type: 'string' } },
                        },
                    },
                    reasoning_depth: {
                        type: 'string',
                        enum: ['SHALLOW', 'MEDIUM', 'DEEP'],
                        default: 'MEDIUM',
                    },
                    include_explanations: { type: 'boolean', default: true },
                },
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        answer: { type: 'string' },
                        confidence: { type: 'number' },
                        reasoning_path: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    step: { type: 'number' },
                                    operation: { type: 'string' },
                                    nodes_involved: { type: 'array', items: { type: 'string' } },
                                    reasoning: { type: 'string' },
                                },
                            },
                        },
                        supporting_evidence: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    type: { type: 'string' },
                                    id: { type: 'string' },
                                    relevance_score: { type: 'number' },
                                    excerpt: { type: 'string' },
                                },
                            },
                        },
                        alternative_perspectives: { type: 'array', items: { type: 'string' } },
                        limitations: { type: 'array', items: { type: 'string' } },
                    },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const result = await knowledgeGraph.reasonAboutLegalConcepts(request.body);
            return result;
        }
        catch (error) {
            request.log.error('Graph reasoning failed', { error, body: request.body });
            reply.status(500);
            return { error: 'Failed to perform graph reasoning', message: error.message };
        }
    });
    server.get('/stats', {
        schema: {
            tags: ['Knowledge Graph'],
            summary: 'Get knowledge graph statistics',
            description: 'Retrieve comprehensive statistics about the knowledge graph',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        nodes: {
                            type: 'object',
                            properties: {
                                total: { type: 'number' },
                                by_type: { type: 'object' },
                            },
                        },
                        relationships: {
                            type: 'object',
                            properties: {
                                total: { type: 'number' },
                                by_type: { type: 'object' },
                            },
                        },
                        concepts: {
                            type: 'object',
                            properties: {
                                total: { type: 'number' },
                                by_category: { type: 'object' },
                                difficulty_distribution: { type: 'object' },
                            },
                        },
                        clauses: {
                            type: 'object',
                            properties: {
                                total: { type: 'number' },
                                by_severity: { type: 'object' },
                                average_confidence: { type: 'number' },
                            },
                        },
                        patterns: {
                            type: 'object',
                            properties: {
                                total: { type: 'number' },
                                enabled: { type: 'number' },
                                average_accuracy: { type: 'number' },
                            },
                        },
                        documents: {
                            type: 'object',
                            properties: {
                                total: { type: 'number' },
                                by_type: { type: 'object' },
                                by_jurisdiction: { type: 'object' },
                            },
                        },
                    },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const stats = await knowledgeGraph.getKnowledgeGraphStats();
            return stats;
        }
        catch (error) {
            request.log.error('Failed to get knowledge graph stats', { error });
            reply.status(500);
            return { error: 'Failed to retrieve statistics', message: error.message };
        }
    });
    server.get('/insights', {
        schema: {
            tags: ['Knowledge Graph'],
            summary: 'Get knowledge insights',
            description: 'Get insights about knowledge gaps and learning opportunities',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        knowledge_gaps: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    category: { type: 'string' },
                                    missing_concepts: { type: 'number' },
                                    urgency: { type: 'number' },
                                },
                            },
                        },
                        learning_opportunities: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    concept: { type: 'object' },
                                    difficulty_increase: { type: 'number' },
                                    readiness_score: { type: 'number' },
                                },
                            },
                        },
                        pattern_performance: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    pattern: { type: 'object' },
                                    performance_trend: { type: 'string' },
                                },
                            },
                        },
                        recommendation: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const insights = await knowledgeGraph.getKnowledgeInsights();
            return insights;
        }
        catch (error) {
            request.log.error('Failed to get knowledge insights', { error });
            reply.status(500);
            return { error: 'Failed to retrieve insights', message: error.message };
        }
    });
}
//# sourceMappingURL=knowledge-graph.js.map