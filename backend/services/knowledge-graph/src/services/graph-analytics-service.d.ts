import { KnowledgeGraphService } from './knowledge-graph-service';
export interface GraphAnalytics {
    centrality_metrics: {
        most_central_concepts: Array<{
            concept_id: string;
            name: string;
            betweenness_centrality: number;
            degree_centrality: number;
            pagerank: number;
        }>;
        network_density: number;
        clustering_coefficient: number;
    };
    learning_insights: {
        knowledge_gaps: Array<{
            category: string;
            gap_size: number;
            urgency_score: number;
        }>;
        concept_difficulty_progression: Array<{
            category: string;
            difficulty_distribution: Record<string, number>;
            learning_bottlenecks: string[];
        }>;
    };
    performance_trends: {
        pattern_accuracy_trends: Array<{
            pattern_id: string;
            accuracy_history: Array<{
                date: string;
                accuracy: number;
            }>;
            trend: 'IMPROVING' | 'DECLINING' | 'STABLE';
        }>;
        concept_mastery_rates: Array<{
            concept_id: string;
            mastery_rate: number;
            average_learning_time: number;
        }>;
    };
    graph_health: {
        connectivity_score: number;
        data_quality_score: number;
        coverage_completeness: number;
        update_freshness: number;
    };
}
export interface KnowledgeEvolution {
    time_period: string;
    knowledge_growth: {
        concepts_added: number;
        clauses_added: number;
        patterns_added: number;
        relationships_added: number;
    };
    quality_improvements: {
        accuracy_improvements: number;
        confidence_improvements: number;
        pattern_optimizations: number;
    };
    usage_patterns: {
        most_queried_concepts: Array<{
            concept_id: string;
            query_count: number;
        }>;
        popular_learning_paths: Array<{
            path_id: string;
            completion_rate: number;
        }>;
    };
}
export declare class GraphAnalyticsService {
    private knowledgeGraph;
    private neo4jService;
    private analyticsCache;
    private readonly cacheTimeout;
    private initialized;
    constructor(knowledgeGraph: KnowledgeGraphService);
    initialize(): Promise<void>;
    getGraphAnalytics(): Promise<GraphAnalytics>;
    analyzeKnowledgeEvolution(timePeriod?: 'DAILY' | 'WEEKLY' | 'MONTHLY'): Promise<KnowledgeEvolution>;
    getCurriculumOptimizationRecommendations(): Promise<{
        difficulty_adjustments: Array<{
            concept_id: string;
            current_difficulty: number;
            recommended_difficulty: number;
            reason: string;
        }>;
        prerequisite_optimizations: Array<{
            concept_id: string;
            missing_prerequisites: string[];
            suggested_prerequisites: string[];
        }>;
        learning_path_improvements: Array<{
            current_path: string[];
            optimized_path: string[];
            improvement_score: number;
        }>;
    }>;
    private calculateCentralityMetrics;
    private analyzeLearningInsights;
    private analyzePerformanceTrends;
    private assessGraphHealth;
    private analyzeDifficultyAdjustments;
    private analyzePrerequisiteOptimizations;
    private optimizeLearningPaths;
    private setupAnalyticsIndexes;
    private getTimeFilter;
    private analyzeKnowledgeGrowth;
    private analyzeQualityImprovements;
    private analyzeUsagePatterns;
    private calculateTrend;
    private getCached;
    private setCached;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=graph-analytics-service.d.ts.map