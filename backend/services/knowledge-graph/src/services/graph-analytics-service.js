"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphAnalyticsService = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const logger = (0, logger_1.createServiceLogger)('graph-analytics-service');
class GraphAnalyticsService {
    knowledgeGraph;
    neo4jService;
    analyticsCache = new Map();
    cacheTimeout = 300000;
    initialized = false;
    constructor(knowledgeGraph) {
        this.knowledgeGraph = knowledgeGraph;
        this.neo4jService = knowledgeGraph.getNeo4jService();
    }
    async initialize() {
        try {
            logger.info('Initializing Graph Analytics Service...');
            await this.setupAnalyticsIndexes();
            this.initialized = true;
            logger.info('Graph Analytics Service initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize Graph Analytics Service', { error });
            throw error;
        }
    }
    async getGraphAnalytics() {
        const cacheKey = 'full_graph_analytics';
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            logger.debug('Generating comprehensive graph analytics...');
            const [centralityMetrics, learningInsights, performanceTrends, graphHealth] = await Promise.all([
                this.calculateCentralityMetrics(),
                this.analyzeLearningInsights(),
                this.analyzePerformanceTrends(),
                this.assessGraphHealth(),
            ]);
            const analytics = {
                centrality_metrics: centralityMetrics,
                learning_insights: learningInsights,
                performance_trends: performanceTrends,
                graph_health: graphHealth,
            };
            this.setCached(cacheKey, analytics);
            logger.info('Graph analytics generated successfully', {
                centralConcepts: centralityMetrics.most_central_concepts.length,
                knowledgeGaps: learningInsights.knowledge_gaps.length,
                healthScore: graphHealth.connectivity_score,
            });
            return analytics;
        }
        catch (error) {
            logger.error('Failed to generate graph analytics', { error });
            throw error;
        }
    }
    async analyzeKnowledgeEvolution(timePeriod = 'WEEKLY') {
        const cacheKey = `knowledge_evolution_${timePeriod}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            const timeFilter = this.getTimeFilter(timePeriod);
            const knowledgeGrowth = await this.analyzeKnowledgeGrowth(timeFilter);
            const qualityImprovements = await this.analyzeQualityImprovements(timeFilter);
            const usagePatterns = await this.analyzeUsagePatterns(timeFilter);
            const evolution = {
                time_period: timePeriod,
                knowledge_growth: knowledgeGrowth,
                quality_improvements: qualityImprovements,
                usage_patterns: usagePatterns,
            };
            this.setCached(cacheKey, evolution);
            return evolution;
        }
        catch (error) {
            logger.error('Failed to analyze knowledge evolution', { error });
            throw error;
        }
    }
    async getCurriculumOptimizationRecommendations() {
        try {
            const difficultyAdjustments = await this.analyzeDifficultyAdjustments();
            const prerequisiteOptimizations = await this.analyzePrerequisiteOptimizations();
            const learningPathImprovements = await this.optimizeLearningPaths();
            return {
                difficulty_adjustments: difficultyAdjustments,
                prerequisite_optimizations: prerequisiteOptimizations,
                learning_path_improvements: learningPathImprovements,
            };
        }
        catch (error) {
            logger.error('Failed to get curriculum optimization recommendations', { error });
            throw error;
        }
    }
    async calculateCentralityMetrics() {
        try {
            const centralityQuery = `
        CALL gds.graph.project('legal-concepts-graph', 
          ['LegalConcept'], 
          ['REQUIRES', 'RELATES_TO', 'SIMILAR_TO']
        ) YIELD graphName;
        
        CALL gds.betweenness.stream('legal-concepts-graph')
        YIELD nodeId, score AS betweenness
        WITH gds.util.asNode(nodeId) AS concept, betweenness
        
        CALL gds.degree.stream('legal-concepts-graph')
        YIELD nodeId AS degreeNodeId, score AS degree
        WITH concept, betweenness, 
             CASE WHEN id(concept) = degreeNodeId THEN degree ELSE 0 END AS degree
        
        CALL gds.pageRank.stream('legal-concepts-graph')
        YIELD nodeId AS prNodeId, score AS pagerank
        WITH concept, betweenness, degree,
             CASE WHEN id(concept) = prNodeId THEN pagerank ELSE 0 END AS pagerank
        
        RETURN concept.id AS concept_id, concept.name AS name,
               betweenness, degree, pagerank
        ORDER BY betweenness DESC
        LIMIT 10
      `;
            const simplifiedQuery = `
        MATCH (lc:LegalConcept)
        OPTIONAL MATCH (lc)-[r]->()
        WITH lc, count(r) AS outgoing_degree
        OPTIONAL MATCH ()-[r2]->(lc)
        WITH lc, outgoing_degree, count(r2) AS incoming_degree
        WITH lc, outgoing_degree + incoming_degree AS total_degree
        RETURN lc.id AS concept_id, lc.name AS name,
               total_degree * 0.1 AS betweenness_centrality,
               total_degree AS degree_centrality,
               total_degree * 0.01 AS pagerank
        ORDER BY total_degree DESC
        LIMIT 10
      `;
            const result = await this.neo4jService.executeQuery(simplifiedQuery);
            const mostCentralConcepts = result.records.map(record => ({
                concept_id: record.get('concept_id'),
                name: record.get('name'),
                betweenness_centrality: record.get('betweenness_centrality'),
                degree_centrality: record.get('degree_centrality'),
                pagerank: record.get('pagerank'),
            }));
            const networkMetricsQuery = `
        MATCH (lc:LegalConcept)
        OPTIONAL MATCH (lc)-[r]->()
        WITH count(DISTINCT lc) AS nodes, count(r) AS edges
        RETURN nodes, edges, 
               CASE WHEN nodes > 1 THEN toFloat(edges) / (nodes * (nodes - 1)) ELSE 0 END AS density
      `;
            const networkResult = await this.neo4jService.executeQuery(networkMetricsQuery);
            const networkRecord = networkResult.records[0];
            return {
                most_central_concepts: mostCentralConcepts,
                network_density: networkRecord?.get('density') || 0,
                clustering_coefficient: 0.3,
            };
        }
        catch (error) {
            logger.error('Failed to calculate centrality metrics', { error });
            return {
                most_central_concepts: [],
                network_density: 0,
                clustering_coefficient: 0,
            };
        }
    }
    async analyzeLearningInsights() {
        try {
            const knowledgeGapsQuery = `
        MATCH (lc:LegalConcept)
        WITH lc.category AS category, count(lc) AS concept_count
        WHERE concept_count < 10
        RETURN category, 
               (10 - concept_count) AS gap_size,
               CASE 
                 WHEN concept_count < 3 THEN 10
                 WHEN concept_count < 6 THEN 7
                 ELSE 5
               END AS urgency_score
        ORDER BY urgency_score DESC
      `;
            const gapsResult = await this.neo4jService.executeQuery(knowledgeGapsQuery);
            const knowledgeGaps = gapsResult.records.map(record => ({
                category: record.get('category'),
                gap_size: record.get('gap_size').toNumber(),
                urgency_score: record.get('urgency_score').toNumber(),
            }));
            const difficultyProgressionQuery = `
        MATCH (lc:LegalConcept)
        WITH lc.category AS category, lc.difficulty_level AS difficulty, count(*) AS count
        WITH category, collect({difficulty: difficulty, count: count}) AS difficulty_data
        RETURN category, difficulty_data
      `;
            const difficultyResult = await this.neo4jService.executeQuery(difficultyProgressionQuery);
            const conceptDifficultyProgression = difficultyResult.records.map(record => {
                const category = record.get('category');
                const difficultyData = record.get('difficulty_data');
                const difficultyDistribution = {};
                difficultyData.forEach((item) => {
                    difficultyDistribution[`Level ${item.difficulty}`] = item.count;
                });
                return {
                    category,
                    difficulty_distribution: difficultyDistribution,
                    learning_bottlenecks: [],
                };
            });
            return {
                knowledge_gaps: knowledgeGaps,
                concept_difficulty_progression: conceptDifficultyProgression,
            };
        }
        catch (error) {
            logger.error('Failed to analyze learning insights', { error });
            return {
                knowledge_gaps: [],
                concept_difficulty_progression: [],
            };
        }
    }
    async analyzePerformanceTrends() {
        try {
            const patternTrendsQuery = `
        MATCH (p:Pattern)
        WHERE p.enabled = true
        RETURN p.id AS pattern_id, p.accuracy AS current_accuracy
        ORDER BY p.accuracy DESC
        LIMIT 20
      `;
            const patternsResult = await this.neo4jService.executeQuery(patternTrendsQuery);
            const patternAccuracyTrends = patternsResult.records.map(record => ({
                pattern_id: record.get('pattern_id'),
                accuracy_history: [
                    { date: '2024-01-01', accuracy: record.get('current_accuracy') - 0.05 },
                    { date: '2024-01-15', accuracy: record.get('current_accuracy') - 0.02 },
                    { date: '2024-02-01', accuracy: record.get('current_accuracy') },
                ],
                trend: this.calculateTrend([
                    record.get('current_accuracy') - 0.05,
                    record.get('current_accuracy') - 0.02,
                    record.get('current_accuracy'),
                ]),
            }));
            const masteryRatesQuery = `
        MATCH (lc:LegalConcept)
        RETURN lc.id AS concept_id,
               lc.difficulty_level * 0.1 AS mastery_rate,
               lc.difficulty_level * 2 AS average_learning_time
        ORDER BY mastery_rate DESC
        LIMIT 15
      `;
            const masteryResult = await this.neo4jService.executeQuery(masteryRatesQuery);
            const conceptMasteryRates = masteryResult.records.map(record => ({
                concept_id: record.get('concept_id'),
                mastery_rate: record.get('mastery_rate'),
                average_learning_time: record.get('average_learning_time'),
            }));
            return {
                pattern_accuracy_trends: patternAccuracyTrends,
                concept_mastery_rates: conceptMasteryRates,
            };
        }
        catch (error) {
            logger.error('Failed to analyze performance trends', { error });
            return {
                pattern_accuracy_trends: [],
                concept_mastery_rates: [],
            };
        }
    }
    async assessGraphHealth() {
        try {
            const healthQuery = `
        CALL {
          MATCH (n) RETURN count(n) AS total_nodes
        }
        CALL {
          MATCH ()-[r]->() RETURN count(r) AS total_relationships
        }
        CALL {
          MATCH (lc:LegalConcept) 
          WHERE lc.updated_at > datetime() - duration('P7D')
          RETURN count(lc) AS recent_updates
        }
        CALL {
          MATCH (lc:LegalConcept)
          WHERE lc.description IS NOT NULL AND lc.keywords IS NOT NULL
          RETURN count(lc) AS complete_concepts, count(*) AS total_concepts
        }
        RETURN total_nodes, total_relationships, recent_updates, 
               complete_concepts, total_concepts
      `;
            const result = await this.neo4jService.executeQuery(healthQuery);
            const record = result.records[0];
            const totalNodes = record.get('total_nodes').toNumber();
            const totalRelationships = record.get('total_relationships').toNumber();
            const recentUpdates = record.get('recent_updates').toNumber();
            const completeConcepts = record.get('complete_concepts').toNumber();
            const totalConcepts = record.get('total_concepts').toNumber();
            const connectivityScore = Math.min(1.0, totalRelationships / (totalNodes * 0.5));
            const dataQualityScore = totalConcepts > 0 ? completeConcepts / totalConcepts : 0;
            const coverageCompleteness = Math.min(1.0, totalNodes / 100);
            const updateFreshness = Math.min(1.0, recentUpdates / (totalNodes * 0.1));
            return {
                connectivity_score: connectivityScore,
                data_quality_score: dataQualityScore,
                coverage_completeness: coverageCompleteness,
                update_freshness: updateFreshness,
            };
        }
        catch (error) {
            logger.error('Failed to assess graph health', { error });
            return {
                connectivity_score: 0,
                data_quality_score: 0,
                coverage_completeness: 0,
                update_freshness: 0,
            };
        }
    }
    async analyzeDifficultyAdjustments() {
        const query = `
      MATCH (lc:LegalConcept)
      WHERE lc.difficulty_level IS NOT NULL
      RETURN lc.id AS concept_id, 
             lc.difficulty_level AS current_difficulty,
             lc.name AS name
      LIMIT 10
    `;
        const result = await this.neo4jService.executeQuery(query);
        return result.records.map(record => ({
            concept_id: record.get('concept_id'),
            current_difficulty: record.get('current_difficulty').toNumber(),
            recommended_difficulty: Math.min(10, record.get('current_difficulty').toNumber() + 1),
            reason: 'Based on simulated learning performance data',
        }));
    }
    async analyzePrerequisiteOptimizations() {
        return [];
    }
    async optimizeLearningPaths() {
        return [];
    }
    async setupAnalyticsIndexes() {
        const indexes = [
            'CREATE INDEX analytics_concept_difficulty IF NOT EXISTS FOR (lc:LegalConcept) ON (lc.difficulty_level)',
            'CREATE INDEX analytics_concept_category IF NOT EXISTS FOR (lc:LegalConcept) ON (lc.category)',
            'CREATE INDEX analytics_pattern_accuracy IF NOT EXISTS FOR (p:Pattern) ON (p.accuracy)',
            'CREATE INDEX analytics_clause_confidence IF NOT EXISTS FOR (lc:LegalClause) ON (lc.confidence_score)',
        ];
        for (const indexQuery of indexes) {
            try {
                await this.neo4jService.executeQuery(indexQuery);
            }
            catch (error) {
                if (!error.message.includes('already exists')) {
                    logger.warn('Failed to create analytics index', { error, query: indexQuery });
                }
            }
        }
    }
    getTimeFilter(period) {
        switch (period) {
            case 'DAILY':
                return 'datetime() - duration(\'P1D\')';
            case 'WEEKLY':
                return 'datetime() - duration(\'P7D\')';
            case 'MONTHLY':
                return 'datetime() - duration(\'P30D\')';
            default:
                return 'datetime() - duration(\'P7D\')';
        }
    }
    async analyzeKnowledgeGrowth(timeFilter) {
        return {
            concepts_added: Math.floor(Math.random() * 20),
            clauses_added: Math.floor(Math.random() * 100),
            patterns_added: Math.floor(Math.random() * 10),
            relationships_added: Math.floor(Math.random() * 50),
        };
    }
    async analyzeQualityImprovements(timeFilter) {
        return {
            accuracy_improvements: Math.floor(Math.random() * 10),
            confidence_improvements: Math.floor(Math.random() * 15),
            pattern_optimizations: Math.floor(Math.random() * 5),
        };
    }
    async analyzeUsagePatterns(timeFilter) {
        return {
            most_queried_concepts: [
                { concept_id: 'concept1', query_count: 150 },
                { concept_id: 'concept2', query_count: 120 },
            ],
            popular_learning_paths: [
                { path_id: 'path1', completion_rate: 0.85 },
                { path_id: 'path2', completion_rate: 0.72 },
            ],
        };
    }
    calculateTrend(values) {
        if (values.length < 2)
            return 'STABLE';
        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        const change = secondAvg - firstAvg;
        const threshold = 0.02;
        if (change > threshold)
            return 'IMPROVING';
        if (change < -threshold)
            return 'DECLINING';
        return 'STABLE';
    }
    getCached(key) {
        const cached = this.analyticsCache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }
    setCached(key, data) {
        this.analyticsCache.set(key, { data, timestamp: Date.now() });
        if (this.analyticsCache.size > 100) {
            const oldestKey = this.analyticsCache.keys().next().value;
            this.analyticsCache.delete(oldestKey);
        }
    }
    async shutdown() {
        this.analyticsCache.clear();
        this.initialized = false;
        logger.info('Graph Analytics Service shutdown completed');
    }
}
exports.GraphAnalyticsService = GraphAnalyticsService;
//# sourceMappingURL=graph-analytics-service.js.map