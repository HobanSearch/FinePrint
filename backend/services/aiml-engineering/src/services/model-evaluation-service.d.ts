import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
export declare const EvaluationConfigSchema: any;
export type EvaluationConfig = z.infer<typeof EvaluationConfigSchema>;
export interface ModelEvaluation {
    id: string;
    name: string;
    config: EvaluationConfig;
    status: 'pending' | 'running' | 'completed' | 'failed';
    results: EvaluationResults[];
    comparison_analysis?: ComparisonAnalysis;
    validation_status: 'passed' | 'failed' | 'pending';
    recommendations: Recommendation[];
    created_at: Date;
    completed_at?: Date;
    error_message?: string;
}
export interface EvaluationResults {
    model_id: string;
    model_name: string;
    metrics: MetricResults;
    performance_stats: PerformanceStats;
    error_analysis: ErrorAnalysis;
    sample_predictions: PredictionSample[];
}
export interface MetricResults {
    accuracy?: number;
    f1_score?: number;
    precision?: number;
    recall?: number;
    rouge_l?: number;
    bleu_score?: number;
    perplexity?: number;
    avg_latency_ms?: number;
    throughput_rps?: number;
    error_rate?: number;
}
export interface PerformanceStats {
    total_predictions: number;
    successful_predictions: number;
    failed_predictions: number;
    avg_response_time: number;
    p95_response_time: number;
    p99_response_time: number;
    memory_usage_mb: number;
    cpu_utilization: number;
}
export interface ErrorAnalysis {
    error_types: Record<string, number>;
    common_failure_patterns: string[];
    problematic_input_types: string[];
    improvement_suggestions: string[];
}
export interface PredictionSample {
    input: string;
    expected_output: string;
    predicted_output: string;
    confidence_score: number;
    is_correct: boolean;
    error_type?: string;
}
export interface ComparisonAnalysis {
    statistical_significance: Record<string, boolean>;
    performance_differences: Record<string, number>;
    winner: string | null;
    confidence_intervals: Record<string, {
        lower: number;
        upper: number;
    }>;
    effect_sizes: Record<string, number>;
}
export interface Recommendation {
    type: 'performance' | 'deployment' | 'training' | 'data';
    priority: 'high' | 'medium' | 'low';
    description: string;
    action_items: string[];
    expected_impact: string;
}
export declare class ModelEvaluationService {
    private prisma;
    private cache;
    private performanceMonitor;
    private modelRegistry;
    private activeEvaluations;
    constructor(prisma: PrismaClient);
    startEvaluation(config: EvaluationConfig): Promise<ModelEvaluation>;
    private evaluateModel;
    private loadTestDataset;
    private sampleTestData;
    private runModelPrediction;
    private evaluatePrediction;
    private classifyError;
    private calculateMetrics;
    private calculatePerformanceStats;
    private analyzeErrors;
    private performComparisonAnalysis;
    private validateResults;
    private generateRecommendations;
    private calculateRougeL;
    private longestCommonSubsequence;
    private getMetricValue;
    private performTTest;
    private determineWinner;
    private calculateOverallScore;
    private identifyFailurePatterns;
    private identifyProblematicInputs;
    private generateImprovementSuggestions;
    getEvaluation(evaluationId: string): Promise<ModelEvaluation | null>;
    listEvaluations(): Promise<ModelEvaluation[]>;
    cancelEvaluation(evaluationId: string): Promise<void>;
    exportResults(evaluationId: string, format?: 'json' | 'csv'): Promise<string>;
    private convertToCsv;
}
//# sourceMappingURL=model-evaluation-service.d.ts.map