"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphQLSchema = GraphQLSchema;
const mercurius_1 = __importDefault(require("mercurius"));
const schema = `
  type Query {
    """Get knowledge graph statistics"""
    knowledgeGraphStats: KnowledgeGraphStats!
    
    """Search for legal concepts"""
    searchConcepts(query: String!, limit: Int = 10): [LegalConcept!]!
    
    """Get learner profile"""
    learnerProfile(learnerId: ID!): LearnerProfile
    
    """Get graph analytics"""
    graphAnalytics: GraphAnalytics!
  }

  type Mutation {
    """Create a new learner profile"""
    createLearnerProfile(input: CreateLearnerInput!): LearnerProfile!
    
    """Extract knowledge from document"""
    extractKnowledge(input: ExtractionInput!): ExtractionResult!
    
    """Perform graph-enhanced inference"""
    performInference(input: InferenceInput!): InferenceResult!
  }

  type KnowledgeGraphStats {
    totalNodes: Int!
    totalRelationships: Int!
    conceptsCount: Int!
    clausesCount: Int!
    patternsCount: Int!
    documentsCount: Int!
  }

  type LegalConcept {
    id: ID!
    name: String!
    description: String!
    category: String!
    difficultyLevel: Int!
    importanceWeight: Float!
    keywords: [String!]!
  }

  type LearnerProfile {
    id: ID!
    learnerType: String!
    currentLevel: Int!
    masteredConcepts: [String!]!
    strugglingConcepts: [String!]!
  }

  type GraphAnalytics {
    connectivityScore: Float!
    dataQualityScore: Float!
    coverageCompleteness: Float!
    updateFreshness: Float!
  }

  input CreateLearnerInput {
    learnerType: String!
    currentLevel: Int = 1
  }

  input ExtractionInput {
    documentContent: String!
    documentType: String!
    extractionDepth: String = "DETAILED"
  }

  input InferenceInput {
    query: String!
    contextType: String!
    useGraphContext: Boolean = true
  }

  type ExtractionResult {
    extractionId: ID!
    documentId: ID!
    conceptsCount: Int!
    clausesCount: Int!
    processingTimeMs: Int!
  }

  type InferenceResult {
    inferenceId: ID!
    enhancedResponse: String!
    confidenceScore: Float!
    reasoningSteps: Int!
  }
`;
const resolvers = {
    Query: {
        knowledgeGraphStats: async (root, args, context) => {
            const stats = await context.knowledgeGraph.getKnowledgeGraphStats();
            return {
                totalNodes: stats.nodes.total,
                totalRelationships: stats.relationships.total,
                conceptsCount: stats.concepts.total,
                clausesCount: stats.clauses.total,
                patternsCount: stats.patterns.total,
                documentsCount: stats.documents.total,
            };
        },
        searchConcepts: async (root, args, context) => {
            const ontologyService = context.knowledgeGraph.getOntologyService();
            const concepts = await ontologyService.searchLegalConcepts(args.query);
            return concepts.slice(0, args.limit || 10).map((concept) => ({
                id: concept.id,
                name: concept.name,
                description: concept.description,
                category: concept.category,
                difficultyLevel: concept.difficulty_level,
                importanceWeight: concept.importance_weight,
                keywords: concept.keywords,
            }));
        },
        learnerProfile: async (root, args, context) => {
            const profile = await context.curriculumLearning.getLearnerProfile(args.learnerId);
            if (!profile)
                return null;
            return {
                id: profile.id,
                learnerType: profile.learner_type,
                currentLevel: profile.current_level,
                masteredConcepts: profile.mastered_concepts,
                strugglingConcepts: profile.struggling_concepts,
            };
        },
        graphAnalytics: async (root, args, context) => {
            const analytics = await context.graphAnalytics.getGraphAnalytics();
            return {
                connectivityScore: analytics.graph_health.connectivity_score,
                dataQualityScore: analytics.graph_health.data_quality_score,
                coverageCompleteness: analytics.graph_health.coverage_completeness,
                updateFreshness: analytics.graph_health.update_freshness,
            };
        },
    },
    Mutation: {
        createLearnerProfile: async (root, args, context) => {
            const profile = await context.curriculumLearning.createLearnerProfile({
                learner_type: args.input.learnerType,
                current_level: args.input.currentLevel || 1,
            });
            return {
                id: profile.id,
                learnerType: profile.learner_type,
                currentLevel: profile.current_level,
                masteredConcepts: profile.mastered_concepts,
                strugglingConcepts: profile.struggling_concepts,
            };
        },
        extractKnowledge: async (root, args, context) => {
            const { KnowledgeExtractionService } = await import('../services/knowledge-extraction-service');
            const extractionService = new KnowledgeExtractionService(context.knowledgeGraph);
            const result = await extractionService.extractKnowledge({
                document_content: args.input.documentContent,
                document_type: args.input.documentType,
                extraction_depth: args.input.extractionDepth,
                enable_pattern_matching: true,
                enable_concept_extraction: true,
                enable_relationship_inference: true,
            });
            return {
                extractionId: result.extraction_id,
                documentId: result.document_id,
                conceptsCount: result.extracted_concepts.length,
                clausesCount: result.extracted_clauses.length,
                processingTimeMs: result.extraction_metadata.processing_time_ms,
            };
        },
        performInference: async (root, args, context) => {
            const { GraphEnhancedInferenceService } = await import('../services/graph-enhanced-inference-service');
            const inferenceService = new GraphEnhancedInferenceService(context.knowledgeGraph);
            const result = await inferenceService.performEnhancedInference({
                query: args.input.query,
                context_type: args.input.contextType,
                use_graph_context: args.input.useGraphContext !== false,
                use_curriculum_guidance: false,
            });
            return {
                inferenceId: result.inference_id,
                enhancedResponse: result.enhanced_response,
                confidenceScore: result.confidence_score,
                reasoningSteps: result.reasoning_path.length,
            };
        },
    },
};
async function GraphQLSchema(server) {
    await server.register(mercurius_1.default, {
        schema,
        resolvers,
        context: (request) => ({
            knowledgeGraph: server.knowledgeGraph,
            curriculumLearning: server.curriculumLearning,
            graphAnalytics: server.graphAnalytics,
        }),
        graphiql: process.env.NODE_ENV !== 'production',
        ide: process.env.NODE_ENV !== 'production',
    });
}
//# sourceMappingURL=schema.js.map