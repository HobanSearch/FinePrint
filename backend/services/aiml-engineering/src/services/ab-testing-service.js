"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ABTestingService = exports.ABTestConfigSchema = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const events_1 = require("events");
const uuid_1 = require("uuid");
const zod_1 = require("zod");
const logger = (0, logger_1.createServiceLogger)('ab-testing-service');
exports.ABTestConfigSchema = zod_1.z.object({
    test_name: zod_1.z.string(),
    description: zod_1.z.string().optional(),
    model_variants: zod_1.z.array(zod_1.z.object({
        model_id: zod_1.z.string(),
        model_name: zod_1.z.string(),
        traffic_percentage: zod_1.z.number().min(0).max(100),
    })),
    traffic_allocation: zod_1.z.object({
        control_percentage: zod_1.z.number().min(10).max(90).default(50),
        treatment_percentage: zod_1.z.number().min(10).max(90).default(50),
    }),
    success_metrics: zod_1.z.array(zod_1.z.enum(['accuracy', 'response_time', 'user_satisfaction', 'conversion_rate', 'error_rate'])),
    statistical_config: zod_1.z.object({
        confidence_level: zod_1.z.number().min(0.9).max(0.99).default(0.95),
        minimum_sample_size: zod_1.z.number().min(100).default(1000),
        maximum_duration_days: zod_1.z.number().min(1).max(30).default(14),
        effect_size_threshold: zod_1.z.number().min(0.01).max(0.5).default(0.05),
    }),
    stopping_criteria: zod_1.z.object({
        early_stopping_enabled: zod_1.z.boolean().default(true),
        significance_threshold: zod_1.z.number().min(0.01).max(0.1).default(0.05),
        minimum_effect_size: zod_1.z.number().min(0.01).max(0.2).default(0.02),
        max_runtime_hours: zod_1.z.number().min(1).max(720).default(168),
    }),
    targeting_criteria: zod_1.z.object({
        user_segments: zod_1.z.array(zod_1.z.string()).optional(),
        geographic_regions: zod_1.z.array(zod_1.z.string()).optional(),
        device_types: zod_1.z.array(zod_1.z.string()).optional(),
        time_of_day: zod_1.z.object({
            start_hour: zod_1.z.number().min(0).max(23).optional(),
            end_hour: zod_1.z.number().min(0).max(23).optional(),
        }).optional(),
    }).optional(),
});
class ABTestingService extends events_1.EventEmitter {
    prisma;
    cache;
    activeTests = new Map();
    testResults = new Map();
    constructor(prisma) {
        super();
        this.prisma = prisma;
        this.cache = new cache_1.CacheService('ab-testing');
        this.startBackgroundMonitoring();
    }
    async createTest(config) {
        const testId = (0, uuid_1.v4)();
        const variants = config.model_variants.map((variant, index) => ({
            id: (0, uuid_1.v4)(),
            model_id: variant.model_id,
            model_name: variant.model_name,
            is_control: index === 0,
            traffic_percentage: variant.traffic_percentage,
            sample_size: 0,
            metrics: {
                accuracy: 0,
                avg_response_time: 0,
                error_rate: 0,
                user_satisfaction: 0,
                conversion_rate: 0,
                confidence_intervals: {},
            },
            performance_data: [],
        }));
        const test = {
            id: testId,
            name: config.test_name,
            config,
            status: 'draft',
            variants,
            metrics: {
                total_requests: 0,
                successful_requests: 0,
                failed_requests: 0,
                avg_response_time: 0,
                p95_response_time: 0,
                conversion_rate: 0,
                user_satisfaction_score: 0,
            },
            statistical_results: null,
            winner: null,
            confidence_level: 0,
            created_at: new Date(),
            current_sample_size: 0,
            estimated_completion: null,
        };
        this.activeTests.set(testId, test);
        this.testResults.set(testId, []);
        await this.cache.set(`test:${testId}`, test, 3600 * 24 * 30);
        logger.info('A/B test created', { testId, variantCount: variants.length });
        return test;
    }
    async startTest(testId) {
        const test = this.activeTests.get(testId);
        if (!test) {
            throw new Error('Test not found');
        }
        if (test.status !== 'draft') {
            throw new Error(`Cannot start test in status: ${test.status}`);
        }
        const totalTraffic = test.variants.reduce((sum, v) => sum + v.traffic_percentage, 0);
        if (Math.abs(totalTraffic - 100) > 0.01) {
            throw new Error('Traffic allocation must sum to 100%');
        }
        test.status = 'running';
        test.started_at = new Date();
        const hoursToCompletion = this.estimateCompletionTime(test);
        test.estimated_completion = new Date(Date.now() + hoursToCompletion * 60 * 60 * 1000);
        await this.cache.set(`test:${testId}`, test, 3600 * 24 * 30);
        logger.info('A/B test started', {
            testId,
            estimatedCompletion: test.estimated_completion,
            minSampleSize: test.config.statistical_config.minimum_sample_size,
        });
        this.emit('test:started', test);
        return test;
    }
    async stopTest(testId, reason = 'Manual stop') {
        const test = this.activeTests.get(testId);
        if (!test) {
            throw new Error('Test not found');
        }
        if (test.status !== 'running') {
            throw new Error(`Cannot stop test in status: ${test.status}`);
        }
        test.status = 'stopped';
        test.completed_at = new Date();
        await this.performFinalAnalysis(test);
        await this.cache.set(`test:${testId}`, test, 3600 * 24 * 30);
        logger.info('A/B test stopped', { testId, reason, sampleSize: test.current_sample_size });
        this.emit('test:stopped', { test, reason });
        return test;
    }
    async recordResult(result) {
        const test = this.activeTests.get(result.test_id);
        if (!test || test.status !== 'running') {
            return;
        }
        const variant = this.selectVariant(test, result.user_id);
        if (!variant) {
            return;
        }
        const fullResult = {
            ...result,
            variant_id: variant.id,
        };
        const results = this.testResults.get(result.test_id) || [];
        results.push(fullResult);
        this.testResults.set(result.test_id, results);
        this.updateVariantMetrics(variant, fullResult);
        this.updateTestMetrics(test, fullResult);
        test.current_sample_size++;
        if (test.config.stopping_criteria.early_stopping_enabled) {
            await this.checkEarlyStoppingConditions(test);
        }
        if (this.shouldCompleteTest(test)) {
            await this.completeTest(test.id);
        }
    }
    selectVariant(test, userId) {
        const hash = this.hashUserId(userId);
        const randomValue = hash % 100;
        let cumulativePercentage = 0;
        for (const variant of test.variants) {
            cumulativePercentage += variant.traffic_percentage;
            if (randomValue < cumulativePercentage) {
                return variant;
            }
        }
        return test.variants[0];
    }
    hashUserId(userId) {
        let hash = 0;
        for (let i = 0; i < userId.length; i++) {
            const char = userId.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }
    updateVariantMetrics(variant, result) {
        variant.sample_size++;
        const n = variant.sample_size;
        variant.metrics.avg_response_time =
            ((variant.metrics.avg_response_time * (n - 1)) + result.response_time) / n;
        const wasError = result.error_occurred ? 1 : 0;
        variant.metrics.error_rate =
            ((variant.metrics.error_rate * (n - 1)) + wasError) / n;
        if (result.accuracy_score !== undefined) {
            variant.metrics.accuracy =
                ((variant.metrics.accuracy * (n - 1)) + result.accuracy_score) / n;
        }
        if (result.user_feedback !== undefined) {
            variant.metrics.user_satisfaction =
                ((variant.metrics.user_satisfaction * (n - 1)) + result.user_feedback) / n;
        }
        const wasConversion = result.conversion ? 1 : 0;
        variant.metrics.conversion_rate =
            ((variant.metrics.conversion_rate * (n - 1)) + wasConversion) / n;
        variant.performance_data.push({
            timestamp: result.timestamp,
            metric_name: 'response_time',
            value: result.response_time,
            sample_count: n,
        });
        if (variant.performance_data.length > 1000) {
            variant.performance_data = variant.performance_data.slice(-1000);
        }
    }
    updateTestMetrics(test, result) {
        test.metrics.total_requests++;
        if (result.error_occurred) {
            test.metrics.failed_requests++;
        }
        else {
            test.metrics.successful_requests++;
        }
        const n = test.metrics.total_requests;
        test.metrics.avg_response_time =
            ((test.metrics.avg_response_time * (n - 1)) + result.response_time) / n;
        if (result.conversion) {
            test.metrics.conversion_rate =
                ((test.metrics.conversion_rate * (n - 1)) + 1) / n;
        }
        if (result.user_feedback !== undefined) {
            test.metrics.user_satisfaction_score =
                ((test.metrics.user_satisfaction_score * (n - 1)) + result.user_feedback) / n;
        }
        const allResults = this.testResults.get(test.id) || [];
        const responseTimes = allResults.map(r => r.response_time).sort((a, b) => a - b);
        test.metrics.p95_response_time = responseTimes[Math.floor(responseTimes.length * 0.95)] || 0;
    }
    async checkEarlyStoppingConditions(test) {
        if (test.current_sample_size < test.config.statistical_config.minimum_sample_size) {
            return;
        }
        const analysis = this.performStatisticalAnalysis(test);
        test.statistical_results = analysis;
        const criteria = test.config.stopping_criteria;
        if (analysis.is_significant &&
            analysis.effect_size >= criteria.minimum_effect_size &&
            analysis.p_value <= criteria.significance_threshold) {
            logger.info('Early stopping triggered - significant results', {
                testId: test.id,
                pValue: analysis.p_value,
                effectSize: analysis.effect_size,
            });
            await this.completeTest(test.id);
        }
    }
    performStatisticalAnalysis(test) {
        const controlVariant = test.variants.find(v => v.is_control);
        const treatmentVariant = test.variants.find(v => !v.is_control);
        if (!controlVariant || !treatmentVariant) {
            throw new Error('Control and treatment variants required for analysis');
        }
        const controlRate = controlVariant.metrics.conversion_rate;
        const treatmentRate = treatmentVariant.metrics.conversion_rate;
        const controlSample = controlVariant.sample_size;
        const treatmentSample = treatmentVariant.sample_size;
        const pooledRate = ((controlRate * controlSample) + (treatmentRate * treatmentSample)) / (controlSample + treatmentSample);
        const standardError = Math.sqrt(pooledRate * (1 - pooledRate) * ((1 / controlSample) + (1 / treatmentSample)));
        const zScore = Math.abs(treatmentRate - controlRate) / standardError;
        const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore)));
        const effectSize = Math.abs(treatmentRate - controlRate);
        const isSignificant = pValue <= test.config.statistical_config.confidence_level;
        const ciMargin = 1.96 * standardError;
        const lowerBound = (treatmentRate - controlRate) - ciMargin;
        const upperBound = (treatmentRate - controlRate) + ciMargin;
        const power = this.calculateStatisticalPower(effectSize, controlSample + treatmentSample);
        const requiredSampleSize = this.calculateRequiredSampleSize(effectSize, 0.8, 0.05);
        const bayesianProbability = treatmentRate > controlRate ?
            Math.min(0.99, 0.5 + (zScore / 10)) :
            Math.max(0.01, 0.5 - (zScore / 10));
        return {
            is_significant: isSignificant,
            p_value: pValue,
            effect_size: effectSize,
            confidence_interval: { lower: lowerBound, upper: upperBound },
            statistical_power: power,
            required_sample_size: requiredSampleSize,
            bayesian_probability: bayesianProbability,
        };
    }
    normalCDF(x) {
        return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
    }
    erf(x) {
        const a1 = 0.254829592;
        const a2 = -0.284496736;
        const a3 = 1.421413741;
        const a4 = -1.453152027;
        const a5 = 1.061405429;
        const p = 0.3275911;
        const sign = x >= 0 ? 1 : -1;
        x = Math.abs(x);
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return sign * y;
    }
    calculateStatisticalPower(effectSize, sampleSize) {
        const standardError = Math.sqrt(2 / sampleSize);
        const zScore = effectSize / standardError;
        return this.normalCDF(zScore - 1.96);
    }
    calculateRequiredSampleSize(effectSize, power, alpha) {
        const zAlpha = 1.96;
        const zBeta = 0.84;
        const n = 2 * Math.pow(zAlpha + zBeta, 2) / Math.pow(effectSize, 2);
        return Math.ceil(n);
    }
    async completeTest(testId) {
        const test = this.activeTests.get(testId);
        if (!test || test.status !== 'running') {
            return;
        }
        test.status = 'completed';
        test.completed_at = new Date();
        await this.performFinalAnalysis(test);
        await this.cache.set(`test:${testId}`, test, 3600 * 24 * 30);
        logger.info('A/B test completed', {
            testId,
            winner: test.winner,
            confidence: test.confidence_level,
        });
        this.emit('test:completed', test);
    }
    async performFinalAnalysis(test) {
        if (test.variants.length < 2) {
            return;
        }
        test.statistical_results = this.performStatisticalAnalysis(test);
        if (test.statistical_results.is_significant) {
            const treatmentVariant = test.variants.find(v => !v.is_control);
            const controlVariant = test.variants.find(v => v.is_control);
            if (treatmentVariant && controlVariant) {
                if (treatmentVariant.metrics.conversion_rate > controlVariant.metrics.conversion_rate) {
                    test.winner = treatmentVariant.model_name;
                }
                else {
                    test.winner = controlVariant.model_name;
                }
                test.confidence_level = 1 - test.statistical_results.p_value;
            }
        }
        for (const variant of test.variants) {
            variant.metrics.confidence_intervals = this.calculateConfidenceIntervals(variant);
        }
    }
    calculateConfidenceIntervals(variant) {
        const n = variant.sample_size;
        if (n < 30) {
            return {};
        }
        const intervals = {};
        const p = variant.metrics.conversion_rate;
        const seP = Math.sqrt((p * (1 - p)) / n);
        const marginP = 1.96 * seP;
        intervals.conversion_rate = {
            lower: Math.max(0, p - marginP),
            upper: Math.min(1, p + marginP),
        };
        const rt = variant.metrics.avg_response_time;
        const estimatedStdDev = rt * 0.3;
        const seRT = estimatedStdDev / Math.sqrt(n);
        const marginRT = 1.96 * seRT;
        intervals.avg_response_time = {
            lower: Math.max(0, rt - marginRT),
            upper: rt + marginRT,
        };
        return intervals;
    }
    shouldCompleteTest(test) {
        const config = test.config.statistical_config;
        const criteria = test.config.stopping_criteria;
        if (test.current_sample_size >= config.minimum_sample_size) {
            return true;
        }
        if (test.started_at) {
            const hoursRunning = (Date.now() - test.started_at.getTime()) / (1000 * 60 * 60);
            if (hoursRunning >= criteria.max_runtime_hours) {
                return true;
            }
        }
        return false;
    }
    estimateCompletionTime(test) {
        const minSampleSize = test.config.statistical_config.minimum_sample_size;
        const maxDuration = test.config.stopping_criteria.max_runtime_hours;
        const estimatedRequestsPerHour = 100;
        const hoursToReachSample = minSampleSize / estimatedRequestsPerHour;
        return Math.min(hoursToReachSample, maxDuration);
    }
    startBackgroundMonitoring() {
        setInterval(() => {
            this.monitorActiveTests();
        }, 5 * 60 * 1000);
    }
    async monitorActiveTests() {
        for (const [testId, test] of this.activeTests) {
            if (test.status === 'running') {
                try {
                    if (this.shouldCompleteTest(test)) {
                        await this.completeTest(testId);
                    }
                    await this.cache.set(`test:${testId}`, test, 3600 * 24 * 30);
                }
                catch (error) {
                    logger.error('Error monitoring test', { testId, error });
                }
            }
        }
    }
    async getTest(testId) {
        let test = this.activeTests.get(testId);
        if (!test) {
            test = await this.cache.get(`test:${testId}`);
            if (test) {
                this.activeTests.set(testId, test);
            }
        }
        return test || null;
    }
    async listTests() {
        return Array.from(this.activeTests.values());
    }
    async getTestResults(testId) {
        return this.testResults.get(testId) || [];
    }
    async exportTestData(testId) {
        const test = await this.getTest(testId);
        const results = await this.getTestResults(testId);
        return {
            test_info: test,
            raw_results: results,
            aggregated_metrics: test?.variants.map(v => ({
                variant_name: v.model_name,
                sample_size: v.sample_size,
                metrics: v.metrics,
            })),
            statistical_analysis: test?.statistical_results,
        };
    }
}
exports.ABTestingService = ABTestingService;
//# sourceMappingURL=ab-testing-service.js.map