import { z } from 'zod';
import { logger } from '../utils/logger.js';
const ABTestConfigSchema = z.object({
    name: z.string(),
    description: z.string(),
    hypothesis: z.string(),
    metric: z.enum(['conversion_rate', 'click_through_rate', 'engagement_rate', 'bounce_rate', 'time_on_page']),
    variants: z.array(z.object({
        name: z.string(),
        description: z.string(),
        weight: z.number().min(0).max(1),
        config: z.record(z.any()),
    })).min(2).max(5),
    targetAudience: z.object({
        percentage: z.number().min(0).max(1),
        segments: z.array(z.string()).optional(),
        excludeSegments: z.array(z.string()).optional(),
    }),
    duration: z.object({
        startDate: z.date(),
        endDate: z.date().optional(),
        maxDurationDays: z.number().default(30),
    }),
    significance: z.object({
        confidenceLevel: z.number().min(0.8).max(0.99).default(0.95),
        minimumSampleSize: z.number().default(100),
        minimumDetectableEffect: z.number().default(0.05),
    }),
    autoWinner: z.object({
        enabled: z.boolean().default(true),
        minRunDays: z.number().default(7),
        maxRunDays: z.number().default(30),
        significanceThreshold: z.number().default(0.95),
    }).optional(),
});
const ConversionEventSchema = z.object({
    sessionId: z.string(),
    userId: z.string().optional(),
    testId: z.string(),
    variantId: z.string(),
    eventType: z.enum(['view', 'click', 'conversion', 'bounce']),
    timestamp: z.date(),
    metadata: z.record(z.any()).optional(),
});
export class ABTestingFramework {
    uxAnalytics;
    database;
    activeTests = new Map();
    userAssignments = new Map();
    isInitialized = false;
    constructor(uxAnalytics, database) {
        this.uxAnalytics = uxAnalytics;
        this.database = database;
    }
    async initialize() {
        try {
            logger.info('Initializing A/B Testing Framework');
            await this.ensureTestingTables();
            await this.loadActiveTests();
            this.setupTestMonitoring();
            this.isInitialized = true;
            logger.info('A/B Testing Framework initialized successfully');
        }
        catch (error) {
            logger.error(error, 'Failed to initialize A/B Testing Framework');
            throw error;
        }
    }
    async healthCheck() {
        try {
            return this.isInitialized && await this.database.healthCheck();
        }
        catch {
            return false;
        }
    }
    async createTest(config) {
        const validated = ABTestConfigSchema.parse(config);
        logger.info({ testName: validated.name }, 'Creating A/B test');
        const totalWeight = validated.variants.reduce((sum, v) => sum + v.weight, 0);
        if (Math.abs(totalWeight - 1) > 0.001) {
            throw new Error('Variant weights must sum to 1.0');
        }
        const test = {
            id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: validated.name,
            description: validated.description,
            hypothesis: validated.hypothesis,
            status: 'draft',
            metric: validated.metric,
            variants: validated.variants.map((v, index) => ({
                id: `variant_${index}_${Date.now()}`,
                name: v.name,
                description: v.description,
                weight: v.weight,
                config: v.config,
                isControl: index === 0,
            })),
            targetAudience: validated.targetAudience,
            duration: validated.duration,
            significance: validated.significance,
            autoWinner: validated.autoWinner,
            createdAt: new Date(),
            updatedAt: new Date(),
            metrics: {
                totalParticipants: 0,
                conversionRate: 0,
                confidence: 0,
                variants: {},
            },
        };
        test.variants.forEach(variant => {
            test.metrics.variants[variant.id] = {
                participants: 0,
                conversions: 0,
                conversionRate: 0,
                confidence: 0,
                isWinner: false,
                performance: {
                    clicks: 0,
                    views: 0,
                    bounces: 0,
                    timeOnPage: 0,
                },
            };
        });
        await this.database.query(`INSERT INTO ab_tests 
       (id, name, description, hypothesis, status, metric, variants, target_audience, duration, significance, auto_winner, metrics, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`, [
            test.id,
            test.name,
            test.description,
            test.hypothesis,
            test.status,
            test.metric,
            JSON.stringify(test.variants),
            JSON.stringify(test.targetAudience),
            JSON.stringify(test.duration),
            JSON.stringify(test.significance),
            JSON.stringify(test.autoWinner),
            JSON.stringify(test.metrics),
            test.createdAt,
            test.updatedAt,
        ]);
        logger.info({ testId: test.id, variantsCount: test.variants.length }, 'A/B test created');
        return test;
    }
    async startTest(testId) {
        const test = await this.getTest(testId);
        if (!test) {
            throw new Error(`Test with id ${testId} not found`);
        }
        if (test.status !== 'draft') {
            throw new Error(`Test ${testId} is not in draft status`);
        }
        test.status = 'running';
        test.duration.startDate = new Date();
        test.updatedAt = new Date();
        if (!test.duration.endDate) {
            test.duration.endDate = new Date(test.duration.startDate.getTime() + (test.duration.maxDurationDays * 24 * 60 * 60 * 1000));
        }
        await this.database.query(`UPDATE ab_tests 
       SET status = $2, duration = $3, updated_at = $4
       WHERE id = $1`, [testId, test.status, JSON.stringify(test.duration), test.updatedAt]);
        this.activeTests.set(testId, test);
        logger.info({ testId, startDate: test.duration.startDate }, 'A/B test started');
        return test;
    }
    async stopTest(testId, reason) {
        const test = await this.getTest(testId);
        if (!test) {
            throw new Error(`Test with id ${testId} not found`);
        }
        if (test.status !== 'running') {
            throw new Error(`Test ${testId} is not running`);
        }
        test.status = 'stopped';
        test.updatedAt = new Date();
        test.stoppedReason = reason;
        await this.database.query(`UPDATE ab_tests 
       SET status = $2, stopped_reason = $3, updated_at = $4
       WHERE id = $1`, [testId, test.status, reason, test.updatedAt]);
        this.activeTests.delete(testId);
        logger.info({ testId, reason }, 'A/B test stopped');
        return test;
    }
    async assignUserToVariant(userId, testId, sessionId) {
        const test = this.activeTests.get(testId);
        if (!test || test.status !== 'running') {
            throw new Error(`Test ${testId} is not active`);
        }
        if (!this.userAssignments.has(userId)) {
            this.userAssignments.set(userId, new Map());
        }
        const userTests = this.userAssignments.get(userId);
        if (userTests.has(testId)) {
            const variantId = userTests.get(testId);
            const variant = test.variants.find(v => v.id === variantId);
            return {
                testId,
                variantId,
                variantName: variant.name,
            };
        }
        if (!await this.isUserEligible(userId, test)) {
            throw new Error(`User ${userId} is not eligible for test ${testId}`);
        }
        const variantId = this.selectVariantByWeight(test.variants, userId);
        const variant = test.variants.find(v => v.id === variantId);
        userTests.set(testId, variantId);
        await this.database.query(`INSERT INTO ab_test_assignments (test_id, variant_id, user_id, session_id, assigned_at)
       VALUES ($1, $2, $3, $4, $5)`, [testId, variantId, userId, sessionId, new Date()]);
        logger.debug({
            testId,
            variantId,
            userId,
            variantName: variant.name,
        }, 'User assigned to A/B test variant');
        return {
            testId,
            variantId,
            variantName: variant.name,
        };
    }
    async getUserVariant(userId, testId) {
        const userTests = this.userAssignments.get(userId);
        if (!userTests || !userTests.has(testId)) {
            return null;
        }
        const test = this.activeTests.get(testId);
        if (!test) {
            return null;
        }
        const variantId = userTests.get(testId);
        const variant = test.variants.find(v => v.id === variantId);
        return {
            testId,
            variantId,
            variantName: variant.name,
        };
    }
    async trackConversion(event) {
        const validated = ConversionEventSchema.parse({
            ...event,
            timestamp: new Date(),
        });
        await this.database.query(`INSERT INTO ab_test_events 
       (session_id, user_id, test_id, variant_id, event_type, timestamp, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
            validated.sessionId,
            validated.userId,
            validated.testId,
            validated.variantId,
            validated.eventType,
            validated.timestamp,
            JSON.stringify(validated.metadata || {}),
        ]);
        await this.updateTestMetrics(validated.testId);
        logger.debug({
            testId: validated.testId,
            variantId: validated.variantId,
            eventType: validated.eventType,
        }, 'A/B test event tracked');
    }
    async analyzeTestResults(testId) {
        const test = await this.getTest(testId);
        if (!test) {
            throw new Error(`Test with id ${testId} not found`);
        }
        logger.info({ testId }, 'Analyzing A/B test results');
        const eventsResult = await this.database.query(`SELECT 
         variant_id,
         event_type,
         COUNT(*) as event_count,
         COUNT(DISTINCT session_id) as unique_sessions
       FROM ab_test_events 
       WHERE test_id = $1
       GROUP BY variant_id, event_type`, [testId]);
        const variantMetrics = {};
        for (const variant of test.variants) {
            const variantEvents = eventsResult.rows.filter(row => row.variant_id === variant.id);
            const views = variantEvents.find(e => e.event_type === 'view')?.event_count || 0;
            const clicks = variantEvents.find(e => e.event_type === 'click')?.event_count || 0;
            const conversions = variantEvents.find(e => e.event_type === 'conversion')?.event_count || 0;
            const bounces = variantEvents.find(e => e.event_type === 'bounce')?.event_count || 0;
            const uniqueSessions = variantEvents.reduce((sum, e) => sum + parseInt(e.unique_sessions), 0);
            variantMetrics[variant.id] = {
                participants: uniqueSessions,
                conversions,
                conversionRate: uniqueSessions > 0 ? conversions / uniqueSessions : 0,
                confidence: 0,
                isWinner: false,
                performance: {
                    views,
                    clicks,
                    bounces,
                    timeOnPage: 0,
                },
            };
        }
        const significance = await this.calculateStatisticalSignificance(variantMetrics, test);
        const winner = this.determineWinner(variantMetrics, significance, test);
        const result = {
            testId,
            status: test.status,
            duration: {
                startDate: test.duration.startDate,
                endDate: test.duration.endDate || new Date(),
                daysRun: Math.ceil((Date.now() - test.duration.startDate.getTime()) / (24 * 60 * 60 * 1000)),
            },
            participants: Object.values(variantMetrics).reduce((sum, v) => sum + v.participants, 0),
            variants: test.variants.map(variant => ({
                id: variant.id,
                name: variant.name,
                isControl: variant.isControl,
                metrics: variantMetrics[variant.id],
                uplift: this.calculateUplift(variantMetrics[variant.id], variantMetrics, variant.isControl),
            })),
            significance,
            winner,
            recommendation: this.generateRecommendation(variantMetrics, significance, winner, test),
            generatedAt: new Date(),
        };
        return result;
    }
    async calculateStatisticalSignificance(variantMetrics, test) {
        const variants = Object.entries(variantMetrics);
        const controlVariant = test.variants.find(v => v.isControl);
        if (!controlVariant) {
            throw new Error('No control variant found');
        }
        const controlMetrics = variantMetrics[controlVariant.id];
        let maxConfidence = 0;
        let isSignificant = false;
        for (const [variantId, metrics] of variants) {
            if (variantId === controlVariant.id)
                continue;
            const confidence = this.calculateTTestConfidence(controlMetrics.conversions, controlMetrics.participants, metrics.conversions, metrics.participants);
            metrics.confidence = confidence;
            maxConfidence = Math.max(maxConfidence, confidence);
            if (confidence >= test.significance.confidenceLevel) {
                isSignificant = true;
            }
        }
        return {
            isSignificant,
            confidenceLevel: maxConfidence,
            pValue: 1 - maxConfidence,
            effect: this.calculateEffectSize(controlMetrics, variantMetrics),
            sampleSize: Object.values(variantMetrics).reduce((sum, v) => sum + v.participants, 0),
            minimumSampleSizeReached: this.checkMinimumSampleSize(variantMetrics, test),
        };
    }
    async checkAutoWinner(testId) {
        const test = this.activeTests.get(testId);
        if (!test || !test.autoWinner?.enabled)
            return;
        const result = await this.analyzeTestResults(testId);
        const autoConfig = test.autoWinner;
        if (result.duration.daysRun < autoConfig.minRunDays)
            return;
        if (!result.significance.isSignificant)
            return;
        if (result.significance.confidenceLevel >= autoConfig.significanceThreshold) {
            await this.declareWinner(testId, result.winner?.variantId, 'auto');
        }
        else if (result.duration.daysRun >= autoConfig.maxRunDays) {
            await this.stopTest(testId, 'Maximum duration reached without significant results');
        }
    }
    async declareWinner(testId, winnerVariantId, source = 'manual') {
        const test = await this.getTest(testId);
        if (!test) {
            throw new Error(`Test with id ${testId} not found`);
        }
        test.status = 'completed';
        test.winner = {
            variantId: winnerVariantId,
            declaredAt: new Date(),
            source,
        };
        test.updatedAt = new Date();
        await this.database.query(`UPDATE ab_tests 
       SET status = $2, winner = $3, updated_at = $4
       WHERE id = $1`, [testId, test.status, JSON.stringify(test.winner), test.updatedAt]);
        this.activeTests.delete(testId);
        logger.info({
            testId,
            winnerVariantId,
            source,
        }, 'A/B test winner declared');
        return test;
    }
    async ensureTestingTables() {
        await this.database.query(`
      CREATE TABLE IF NOT EXISTS ab_tests (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        hypothesis TEXT,
        status VARCHAR(50) NOT NULL,
        metric VARCHAR(100) NOT NULL,
        variants JSONB NOT NULL,
        target_audience JSONB NOT NULL,
        duration JSONB NOT NULL,
        significance JSONB NOT NULL,
        auto_winner JSONB,
        metrics JSONB NOT NULL,
        winner JSONB,
        stopped_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await this.database.query(`
      CREATE TABLE IF NOT EXISTS ab_test_assignments (
        id SERIAL PRIMARY KEY,
        test_id VARCHAR(255) NOT NULL,
        variant_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255),
        session_id VARCHAR(255),
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(test_id, user_id)
      )
    `);
        await this.database.query(`
      CREATE TABLE IF NOT EXISTS ab_test_events (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255),
        test_id VARCHAR(255) NOT NULL,
        variant_id VARCHAR(255) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        metadata JSONB DEFAULT '{}'
      )
    `);
        await this.database.query(`
      CREATE INDEX IF NOT EXISTS idx_ab_test_events_test_variant 
      ON ab_test_events(test_id, variant_id, event_type)
    `);
        await this.database.query(`
      CREATE INDEX IF NOT EXISTS idx_ab_test_assignments_user 
      ON ab_test_assignments(user_id, test_id)
    `);
    }
    async loadActiveTests() {
        const result = await this.database.query(`SELECT * FROM ab_tests WHERE status = 'running'`);
        for (const row of result.rows) {
            const test = {
                id: row.id,
                name: row.name,
                description: row.description,
                hypothesis: row.hypothesis,
                status: row.status,
                metric: row.metric,
                variants: JSON.parse(row.variants),
                targetAudience: JSON.parse(row.target_audience),
                duration: JSON.parse(row.duration),
                significance: JSON.parse(row.significance),
                autoWinner: JSON.parse(row.auto_winner || 'null'),
                metrics: JSON.parse(row.metrics),
                winner: JSON.parse(row.winner || 'null'),
                stoppedReason: row.stopped_reason,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            };
            this.activeTests.set(test.id, test);
        }
        logger.info({ activeTestsCount: this.activeTests.size }, 'Loaded active A/B tests');
    }
    setupTestMonitoring() {
        setInterval(async () => {
            for (const testId of this.activeTests.keys()) {
                try {
                    await this.checkAutoWinner(testId);
                }
                catch (error) {
                    logger.error(error, `Failed to check auto-winner for test: ${testId}`);
                }
            }
        }, 60 * 60 * 1000);
    }
    async getTest(testId) {
        if (this.activeTests.has(testId)) {
            return this.activeTests.get(testId);
        }
        const result = await this.database.query('SELECT * FROM ab_tests WHERE id = $1', [testId]);
        if (result.rows.length === 0)
            return null;
        const row = result.rows[0];
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            hypothesis: row.hypothesis,
            status: row.status,
            metric: row.metric,
            variants: JSON.parse(row.variants),
            targetAudience: JSON.parse(row.target_audience),
            duration: JSON.parse(row.duration),
            significance: JSON.parse(row.significance),
            autoWinner: JSON.parse(row.auto_winner || 'null'),
            metrics: JSON.parse(row.metrics),
            winner: JSON.parse(row.winner || 'null'),
            stoppedReason: row.stopped_reason,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    async isUserEligible(userId, test) {
        const hash = this.hashUserId(userId);
        const userPercentage = hash / 0xffffffff;
        if (userPercentage > test.targetAudience.percentage) {
            return false;
        }
        return true;
    }
    selectVariantByWeight(variants, userId) {
        const hash = this.hashUserId(userId);
        const random = (hash % 1000000) / 1000000;
        let cumulativeWeight = 0;
        for (const variant of variants) {
            cumulativeWeight += variant.weight;
            if (random <= cumulativeWeight) {
                return variant.id;
            }
        }
        return variants[0].id;
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
    async updateTestMetrics(testId) {
    }
    calculateTTestConfidence(controlConversions, controlParticipants, testConversions, testParticipants) {
        if (controlParticipants === 0 || testParticipants === 0)
            return 0;
        const p1 = controlConversions / controlParticipants;
        const p2 = testConversions / testParticipants;
        const pooledP = (controlConversions + testConversions) / (controlParticipants + testParticipants);
        const pooledSE = Math.sqrt(pooledP * (1 - pooledP) * (1 / controlParticipants + 1 / testParticipants));
        if (pooledSE === 0)
            return 0;
        const zScore = Math.abs(p2 - p1) / pooledSE;
        const confidence = Math.min(0.99, Math.max(0, 1 - 2 * (1 - this.normalCDF(zScore))));
        return confidence;
    }
    normalCDF(z) {
        return 0.5 * (1 + this.erf(z / Math.sqrt(2)));
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
    calculateEffectSize(controlMetrics, variantMetrics) {
        const control = controlMetrics.conversionRate;
        const variants = Object.values(variantMetrics).filter(v => v !== controlMetrics);
        const maxVariant = variants.reduce((max, v) => v.conversionRate > max.conversionRate ? v : max, variants[0]);
        if (!maxVariant)
            return 0;
        const pooledSD = Math.sqrt(((controlMetrics.participants - 1) * Math.pow(control * (1 - control), 2) +
            (maxVariant.participants - 1) * Math.pow(maxVariant.conversionRate * (1 - maxVariant.conversionRate), 2)) /
            (controlMetrics.participants + maxVariant.participants - 2));
        if (pooledSD === 0)
            return 0;
        return Math.abs(maxVariant.conversionRate - control) / pooledSD;
    }
    checkMinimumSampleSize(variantMetrics, test) {
        return Object.values(variantMetrics).every(metrics => metrics.participants >= test.significance.minimumSampleSize);
    }
    determineWinner(variantMetrics, significance, test) {
        if (!significance.isSignificant)
            return null;
        let winner = null;
        let maxConversionRate = 0;
        for (const variant of test.variants) {
            const metrics = variantMetrics[variant.id];
            if (metrics.conversionRate > maxConversionRate &&
                metrics.confidence >= test.significance.confidenceLevel) {
                maxConversionRate = metrics.conversionRate;
                winner = {
                    variantId: variant.id,
                    variantName: variant.name,
                    confidence: metrics.confidence,
                };
            }
        }
        return winner;
    }
    calculateUplift(variantMetrics, allMetrics, isControl) {
        if (isControl)
            return 0;
        const controlMetrics = Object.values(allMetrics).find((_, index, array) => {
            return index === 0;
        });
        if (!controlMetrics || controlMetrics.conversionRate === 0)
            return 0;
        return ((variantMetrics.conversionRate - controlMetrics.conversionRate) / controlMetrics.conversionRate) * 100;
    }
    generateRecommendation(variantMetrics, significance, winner, test) {
        if (!significance.isSignificant) {
            if (!significance.minimumSampleSizeReached) {
                return 'Continue test to reach minimum sample size for reliable results.';
            }
            return 'No significant difference detected. Consider testing with larger differences or longer duration.';
        }
        if (winner) {
            const winnerMetrics = variantMetrics[winner.variantId];
            const controlMetrics = Object.values(variantMetrics)[0];
            const uplift = ((winnerMetrics.conversionRate - controlMetrics.conversionRate) / controlMetrics.conversionRate) * 100;
            return `Implement ${winner.variantName} - shows ${uplift.toFixed(1)}% improvement with ${(winner.confidence * 100).toFixed(1)}% confidence.`;
        }
        return 'Statistical significance detected but no clear winner. Review individual variant performance.';
    }
}
//# sourceMappingURL=ab-testing-framework.js.map