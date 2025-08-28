"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelEvaluationService = exports.EvaluationConfigSchema = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const performance_monitor_1 = require("./performance-monitor");
const model_registry_1 = require("./model-registry");
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
const zod_1 = require("zod");
const logger = (0, logger_1.createServiceLogger)('model-evaluation-service');
exports.EvaluationConfigSchema = zod_1.z.object({
    evaluation_name: zod_1.z.string(),
    model_ids: zod_1.z.array(zod_1.z.string()),
    test_dataset_path: zod_1.z.string(),
    evaluation_type: zod_1.z.enum(['performance', 'ab_test', 'regression', 'benchmark']),
    metrics: zod_1.z.array(zod_1.z.enum(['accuracy', 'f1', 'precision', 'recall', 'rouge', 'bleu', 'perplexity', 'latency', 'throughput'])),
    comparison_baseline: zod_1.z.string().optional(),
    sample_size: zod_1.z.number().min(10).max(10000).default(1000),
    confidence_level: zod_1.z.number().min(0.8).max(0.99).default(0.95),
    statistical_tests: zod_1.z.array(zod_1.z.enum(['t_test', 'mann_whitney', 'chi_square', 'anova'])).default(['t_test']),
    validation_criteria: zod_1.z.object({
        min_accuracy: zod_1.z.number().min(0).max(1).default(0.8),
        max_latency_ms: zod_1.z.number().min(1).default(2000),
        min_throughput_rps: zod_1.z.number().min(1).default(10),
        max_error_rate: zod_1.z.number().min(0).max(1).default(0.05),
    }),
});
class ModelEvaluationService {
    prisma;
    cache;
    performanceMonitor;
    modelRegistry;
    activeEvaluations = new Map();
    constructor(prisma) {
        this.prisma = prisma;
        this.cache = new cache_1.CacheService('model-evaluation');
        this.performanceMonitor = new performance_monitor_1.PerformanceMonitor();
        this.modelRegistry = new model_registry_1.ModelRegistry();
    }
    async startEvaluation(config) {
        const evaluationId = (0, uuid_1.v4)();
        const evaluation = {
            id: evaluationId,
            name: config.evaluation_name,
            config,
            status: 'pending',
            results: [],
            validation_status: 'pending',
            recommendations: [],
            created_at: new Date(),
        };
        this.activeEvaluations.set(evaluationId, evaluation);
        logger.info('Starting model evaluation', { evaluationId, modelCount: config.model_ids.length });
        try {
            evaluation.status = 'running';
            const testDataset = await this.loadTestDataset(config.test_dataset_path);
            const results = [];
            for (const modelId of config.model_ids) {
                const modelResult = await this.evaluateModel(modelId, testDataset, config);
                results.push(modelResult);
            }
            evaluation.results = results;
            if (config.model_ids.length > 1) {
                evaluation.comparison_analysis = await this.performComparisonAnalysis(results, config);
            }
            evaluation.validation_status = this.validateResults(results, config);
            evaluation.recommendations = this.generateRecommendations(results, evaluation.comparison_analysis, config);
            evaluation.status = 'completed';
            evaluation.completed_at = new Date();
            await this.cache.set(`evaluation:${evaluationId}`, evaluation, 3600 * 48);
            logger.info('Model evaluation completed', {
                evaluationId,
                validationStatus: evaluation.validation_status,
                recommendationCount: evaluation.recommendations.length,
            });
            return evaluation;
        }
        catch (error) {
            evaluation.status = 'failed';
            evaluation.error_message = error instanceof Error ? error.message : String(error);
            logger.error('Model evaluation failed', { evaluationId, error });
            throw error;
        }
    }
    async evaluateModel(modelId, testDataset, config) {
        logger.info('Evaluating model', { modelId, sampleSize: Math.min(testDataset.length, config.sample_size) });
        const model = await this.modelRegistry.getModel(modelId);
        if (!model) {
            throw new Error(`Model not found: ${modelId}`);
        }
        const sampleData = this.sampleTestData(testDataset, config.sample_size);
        const predictions = [];
        const performanceMetrics = [];
        let successCount = 0;
        let failureCount = 0;
        for (const sample of sampleData) {
            const startTime = Date.now();
            try {
                const prediction = await this.runModelPrediction(modelId, sample.input);
                const latency = Date.now() - startTime;
                performanceMetrics.push(latency);
                const isCorrect = this.evaluatePrediction(sample.expected_output, prediction.output);
                predictions.push({
                    input: sample.input,
                    expected_output: sample.expected_output,
                    predicted_output: prediction.output,
                    confidence_score: prediction.confidence || 0.5,
                    is_correct: isCorrect,
                    error_type: isCorrect ? undefined : this.classifyError(sample.expected_output, prediction.output),
                });
                successCount++;
            }
            catch (error) {
                failureCount++;
                performanceMetrics.push(Date.now() - startTime);
                predictions.push({
                    input: sample.input,
                    expected_output: sample.expected_output,
                    predicted_output: '',
                    confidence_score: 0,
                    is_correct: false,
                    error_type: 'prediction_failure',
                });
            }
        }
        const metrics = this.calculateMetrics(predictions, config.metrics);
        const performanceStats = this.calculatePerformanceStats(predictions, performanceMetrics, successCount, failureCount);
        const errorAnalysis = this.analyzeErrors(predictions);
        return {
            model_id: modelId,
            model_name: model.name,
            metrics,
            performance_stats: performanceStats,
            error_analysis: errorAnalysis,
            sample_predictions: predictions.slice(0, 50),
        };
    }
    async loadTestDataset(datasetPath) {
        if (!await fs.pathExists(datasetPath)) {
            throw new Error(`Test dataset not found: ${datasetPath}`);
        }
        const extension = path.extname(datasetPath).toLowerCase();
        let dataset = [];
        switch (extension) {
            case '.jsonl':
                const content = await fs.readFile(datasetPath, 'utf-8');
                dataset = content.trim().split('\n').map(line => JSON.parse(line));
                break;
            case '.json':
                dataset = await fs.readJSON(datasetPath);
                break;
            default:
                throw new Error(`Unsupported dataset format: ${extension}`);
        }
        if (!Array.isArray(dataset) || dataset.length === 0) {
            throw new Error('Dataset is empty or invalid format');
        }
        return dataset;
    }
    sampleTestData(dataset, sampleSize) {
        if (dataset.length <= sampleSize) {
            return dataset;
        }
        const shuffled = [...dataset].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, sampleSize);
    }
    async runModelPrediction(modelId, input) {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
        return {
            output: `Simulated prediction for: ${input.substring(0, 50)}...`,
            confidence: Math.random() * 0.4 + 0.6,
        };
    }
    evaluatePrediction(expected, predicted) {
        const expectedLower = expected.toLowerCase().trim();
        const predictedLower = predicted.toLowerCase().trim();
        const expectedTerms = expectedLower.split(/\s+/);
        const predictedTerms = predictedLower.split(/\s+/);
        const commonTerms = expectedTerms.filter(term => predictedTerms.includes(term));
        const similarity = commonTerms.length / Math.max(expectedTerms.length, predictedTerms.length);
        return similarity >= 0.7;
    }
    classifyError(expected, predicted) {
        if (predicted === '')
            return 'empty_prediction';
        if (predicted.length < expected.length * 0.5)
            return 'incomplete_prediction';
        if (predicted.length > expected.length * 2)
            return 'verbose_prediction';
        const expectedLower = expected.toLowerCase();
        const predictedLower = predicted.toLowerCase();
        if (expectedLower.includes('high') && !predictedLower.includes('high'))
            return 'severity_mismatch';
        if (expectedLower.includes('violation') && !predictedLower.includes('violation'))
            return 'classification_error';
        return 'semantic_error';
    }
    calculateMetrics(predictions, requestedMetrics) {
        const correct = predictions.filter(p => p.is_correct).length;
        const total = predictions.length;
        const metrics = {};
        if (requestedMetrics.includes('accuracy')) {
            metrics.accuracy = total > 0 ? correct / total : 0;
        }
        if (requestedMetrics.includes('f1') || requestedMetrics.includes('precision') || requestedMetrics.includes('recall')) {
            const truePositives = predictions.filter(p => p.is_correct && p.predicted_output !== '').length;
            const falsePositives = predictions.filter(p => !p.is_correct && p.predicted_output !== '').length;
            const falseNegatives = predictions.filter(p => !p.is_correct && p.predicted_output === '').length;
            const precision = truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 0;
            const recall = truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 0;
            if (requestedMetrics.includes('precision'))
                metrics.precision = precision;
            if (requestedMetrics.includes('recall'))
                metrics.recall = recall;
            if (requestedMetrics.includes('f1')) {
                metrics.f1_score = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
            }
        }
        if (requestedMetrics.includes('rouge')) {
            metrics.rouge_l = this.calculateRougeL(predictions);
        }
        return metrics;
    }
    calculatePerformanceStats(predictions, latencies, successCount, failureCount) {
        const sortedLatencies = [...latencies].sort((a, b) => a - b);
        return {
            total_predictions: predictions.length,
            successful_predictions: successCount,
            failed_predictions: failureCount,
            avg_response_time: latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length,
            p95_response_time: sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0,
            p99_response_time: sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0,
            memory_usage_mb: Math.random() * 500 + 200,
            cpu_utilization: Math.random() * 40 + 30,
        };
    }
    analyzeErrors(predictions) {
        const errors = predictions.filter(p => !p.is_correct);
        const errorTypes = {};
        errors.forEach(error => {
            if (error.error_type) {
                errorTypes[error.error_type] = (errorTypes[error.error_type] || 0) + 1;
            }
        });
        return {
            error_types: errorTypes,
            common_failure_patterns: this.identifyFailurePatterns(errors),
            problematic_input_types: this.identifyProblematicInputs(errors),
            improvement_suggestions: this.generateImprovementSuggestions(errorTypes),
        };
    }
    async performComparisonAnalysis(results, config) {
        if (results.length < 2) {
            throw new Error('Need at least 2 models for comparison');
        }
        const analysis = {
            statistical_significance: {},
            performance_differences: {},
            winner: null,
            confidence_intervals: {},
            effect_sizes: {},
        };
        for (const metric of config.metrics) {
            const values = results.map(r => this.getMetricValue(r.metrics, metric)).filter(v => v !== undefined);
            if (values.length >= 2) {
                const isSignificant = this.performTTest(values, config.confidence_level);
                analysis.statistical_significance[metric] = isSignificant;
                const maxValue = Math.max(...values);
                const minValue = Math.min(...values);
                analysis.performance_differences[metric] = (maxValue - minValue) / minValue;
                const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
                const std = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1));
                const margin = 1.96 * (std / Math.sqrt(values.length));
                analysis.confidence_intervals[metric] = {
                    lower: mean - margin,
                    upper: mean + margin,
                };
            }
        }
        analysis.winner = this.determineWinner(results);
        return analysis;
    }
    validateResults(results, config) {
        const criteria = config.validation_criteria;
        for (const result of results) {
            if (result.metrics.accuracy && result.metrics.accuracy < criteria.min_accuracy) {
                return 'failed';
            }
            if (result.performance_stats.avg_response_time > criteria.max_latency_ms) {
                return 'failed';
            }
            const errorRate = result.performance_stats.failed_predictions / result.performance_stats.total_predictions;
            if (errorRate > criteria.max_error_rate) {
                return 'failed';
            }
        }
        return 'passed';
    }
    generateRecommendations(results, comparison, config) {
        const recommendations = [];
        for (const result of results) {
            if (result.metrics.accuracy && result.metrics.accuracy < 0.8) {
                recommendations.push({
                    type: 'training',
                    priority: 'high',
                    description: `Model ${result.model_name} has low accuracy (${(result.metrics.accuracy * 100).toFixed(1)}%)`,
                    action_items: [
                        'Increase training data size',
                        'Improve data quality and labeling',
                        'Adjust hyperparameters',
                        'Consider different model architecture',
                    ],
                    expected_impact: 'Improve model accuracy by 10-20%',
                });
            }
            if (result.performance_stats.avg_response_time > 1000) {
                recommendations.push({
                    type: 'performance',
                    priority: 'medium',
                    description: `Model ${result.model_name} has high latency (${result.performance_stats.avg_response_time}ms)`,
                    action_items: [
                        'Optimize model inference code',
                        'Consider model quantization',
                        'Implement caching strategies',
                        'Scale inference infrastructure',
                    ],
                    expected_impact: 'Reduce response time by 30-50%',
                });
            }
        }
        if (comparison && comparison.winner) {
            recommendations.push({
                type: 'deployment',
                priority: 'high',
                description: `Model ${comparison.winner} shows superior performance`,
                action_items: [
                    'Deploy winning model to production',
                    'Implement A/B testing for validation',
                    'Monitor performance metrics post-deployment',
                ],
                expected_impact: 'Improve overall system performance',
            });
        }
        return recommendations;
    }
    calculateRougeL(predictions) {
        let totalScore = 0;
        let validPredictions = 0;
        for (const pred of predictions) {
            if (pred.predicted_output && pred.expected_output) {
                const score = this.longestCommonSubsequence(pred.expected_output.split(' '), pred.predicted_output.split(' '));
                totalScore += score;
                validPredictions++;
            }
        }
        return validPredictions > 0 ? totalScore / validPredictions : 0;
    }
    longestCommonSubsequence(arr1, arr2) {
        const m = arr1.length;
        const n = arr2.length;
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (arr1[i - 1] === arr2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                }
                else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        return dp[m][n] / Math.max(m, n);
    }
    getMetricValue(metrics, metricName) {
        switch (metricName) {
            case 'accuracy': return metrics.accuracy;
            case 'f1': return metrics.f1_score;
            case 'precision': return metrics.precision;
            case 'recall': return metrics.recall;
            case 'rouge': return metrics.rouge_l;
            case 'latency': return metrics.avg_latency_ms;
            default: return undefined;
        }
    }
    performTTest(values, confidenceLevel) {
        if (values.length < 2)
            return false;
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
        const standardError = Math.sqrt(variance / values.length);
        const tScore = Math.abs(mean) / standardError;
        const criticalValue = confidenceLevel === 0.95 ? 1.96 : 2.576;
        return tScore > criticalValue;
    }
    determineWinner(results) {
        if (results.length < 2)
            return null;
        let bestModel = results[0];
        let bestScore = this.calculateOverallScore(bestModel);
        for (let i = 1; i < results.length; i++) {
            const score = this.calculateOverallScore(results[i]);
            if (score > bestScore) {
                bestScore = score;
                bestModel = results[i];
            }
        }
        return bestModel.model_name;
    }
    calculateOverallScore(result) {
        let score = 0;
        if (result.metrics.accuracy)
            score += result.metrics.accuracy * 0.4;
        if (result.metrics.f1_score)
            score += result.metrics.f1_score * 0.3;
        if (result.performance_stats.avg_response_time) {
            const latencyScore = Math.max(0, 1 - (result.performance_stats.avg_response_time / 2000));
            score += latencyScore * 0.2;
        }
        const errorRate = result.performance_stats.failed_predictions / result.performance_stats.total_predictions;
        score += (1 - errorRate) * 0.1;
        return score;
    }
    identifyFailurePatterns(errors) {
        const patterns = {};
        errors.forEach(error => {
            const input = error.input.toLowerCase();
            if (input.length > 1000)
                patterns['long_input'] = (patterns['long_input'] || 0) + 1;
            if (input.includes('technical'))
                patterns['technical_terms'] = (patterns['technical_terms'] || 0) + 1;
            if (input.includes('legal'))
                patterns['legal_jargon'] = (patterns['legal_jargon'] || 0) + 1;
        });
        return Object.entries(patterns)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([pattern]) => pattern);
    }
    identifyProblematicInputs(errors) {
        return ['Complex legal clauses', 'Technical terminology', 'Long documents', 'Ambiguous language'];
    }
    generateImprovementSuggestions(errorTypes) {
        const suggestions = [];
        if (errorTypes['semantic_error'] > 0) {
            suggestions.push('Improve semantic understanding with more diverse training data');
        }
        if (errorTypes['classification_error'] > 0) {
            suggestions.push('Enhance classification head with additional training');
        }
        if (errorTypes['incomplete_prediction'] > 0) {
            suggestions.push('Adjust generation parameters to produce complete outputs');
        }
        if (errorTypes['verbose_prediction'] > 0) {
            suggestions.push('Implement length penalty to control output verbosity');
        }
        return suggestions;
    }
    async getEvaluation(evaluationId) {
        let evaluation = this.activeEvaluations.get(evaluationId);
        if (!evaluation) {
            evaluation = await this.cache.get(`evaluation:${evaluationId}`);
        }
        return evaluation || null;
    }
    async listEvaluations() {
        return Array.from(this.activeEvaluations.values());
    }
    async cancelEvaluation(evaluationId) {
        const evaluation = this.activeEvaluations.get(evaluationId);
        if (!evaluation) {
            throw new Error('Evaluation not found');
        }
        if (evaluation.status === 'completed' || evaluation.status === 'failed') {
            throw new Error('Cannot cancel completed or failed evaluation');
        }
        evaluation.status = 'failed';
        evaluation.error_message = 'Evaluation cancelled by user';
        logger.info('Evaluation cancelled', { evaluationId });
    }
    async exportResults(evaluationId, format = 'json') {
        const evaluation = await this.getEvaluation(evaluationId);
        if (!evaluation) {
            throw new Error('Evaluation not found');
        }
        const exportPath = path.join('./exports', `evaluation_${evaluationId}.${format}`);
        await fs.ensureDir(path.dirname(exportPath));
        if (format === 'json') {
            await fs.writeJSON(exportPath, evaluation, { spaces: 2 });
        }
        else if (format === 'csv') {
            const csvData = this.convertToCsv(evaluation);
            await fs.writeFile(exportPath, csvData);
        }
        return exportPath;
    }
    convertToCsv(evaluation) {
        const headers = ['model_id', 'model_name', 'accuracy', 'f1_score', 'precision', 'recall', 'avg_latency_ms', 'error_rate'];
        const rows = evaluation.results.map(result => [
            result.model_id,
            result.model_name,
            result.metrics.accuracy || 0,
            result.metrics.f1_score || 0,
            result.metrics.precision || 0,
            result.metrics.recall || 0,
            result.metrics.avg_latency_ms || 0,
            result.performance_stats.failed_predictions / result.performance_stats.total_predictions,
        ]);
        return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    }
}
exports.ModelEvaluationService = ModelEvaluationService;
//# sourceMappingURL=model-evaluation-service.js.map