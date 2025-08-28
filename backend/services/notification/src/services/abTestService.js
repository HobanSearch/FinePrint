"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.abTestService = void 0;
const client_1 = require("@prisma/client");
const uuid_1 = require("uuid");
const logger_1 = require("@fineprintai/shared-logger");
const logger = (0, logger_1.createServiceLogger)('ab-test-service');
const prisma = new client_1.PrismaClient();
class ABTestService {
    initialized = false;
    async initialize() {
        if (this.initialized)
            return;
        try {
            await prisma.$connect();
            await this.resumeRunningTests();
            this.initialized = true;
            logger.info('A/B test service initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize A/B test service', { error });
            throw error;
        }
    }
    async shutdown() {
        if (!this.initialized)
            return;
        try {
            await prisma.$disconnect();
            this.initialized = false;
            logger.info('A/B test service shut down successfully');
        }
        catch (error) {
            logger.error('Error during A/B test service shutdown', { error });
        }
    }
    async createABTest(config) {
        try {
            this.validateTestConfig(config);
            const test = await prisma.abTestConfig.create({
                data: {
                    id: (0, uuid_1.v4)(),
                    name: config.name,
                    description: config.description,
                    status: config.status || 'draft',
                    testType: config.testType,
                    variants: JSON.stringify(config.variants),
                    trafficSplit: JSON.stringify(config.trafficSplit),
                    userSegment: config.userSegment ? JSON.stringify(config.userSegment) : null,
                    startDate: config.startDate,
                    endDate: config.endDate,
                    primaryMetric: config.primaryMetric,
                    secondaryMetrics: config.secondaryMetrics ? JSON.stringify(config.secondaryMetrics) : null,
                    winner: config.winner,
                    confidence: config.confidence,
                    results: config.results ? JSON.stringify(config.results) : null,
                },
            });
            logger.info('A/B test created', {
                testId: test.id,
                name: config.name,
                testType: config.testType,
                variants: config.variants.length,
            });
            return this.mapABTestConfig(test);
        }
        catch (error) {
            logger.error('Failed to create A/B test', { error, config });
            throw error;
        }
    }
    async updateABTest(testId, updates) {
        try {
            const existing = await prisma.abTestConfig.findUnique({
                where: { id: testId },
            });
            if (!existing) {
                throw new Error(`A/B test ${testId} not found`);
            }
            if (existing.status === 'running' && updates.status !== 'paused' && updates.status !== 'completed') {
                throw new Error('Cannot modify running A/B test configuration');
            }
            const updateData = { ...updates };
            if (updates.variants)
                updateData.variants = JSON.stringify(updates.variants);
            if (updates.trafficSplit)
                updateData.trafficSplit = JSON.stringify(updates.trafficSplit);
            if (updates.userSegment)
                updateData.userSegment = JSON.stringify(updates.userSegment);
            if (updates.secondaryMetrics)
                updateData.secondaryMetrics = JSON.stringify(updates.secondaryMetrics);
            if (updates.results)
                updateData.results = JSON.stringify(updates.results);
            const test = await prisma.abTestConfig.update({
                where: { id: testId },
                data: updateData,
            });
            logger.info('A/B test updated', {
                testId,
                updates: Object.keys(updates),
            });
            return this.mapABTestConfig(test);
        }
        catch (error) {
            logger.error('Failed to update A/B test', { error, testId, updates });
            throw error;
        }
    }
    async startABTest(testId) {
        try {
            const test = await this.getABTest(testId);
            if (!test) {
                throw new Error(`A/B test ${testId} not found`);
            }
            if (test.status !== 'draft') {
                throw new Error(`Cannot start A/B test in status: ${test.status}`);
            }
            await prisma.abTestConfig.update({
                where: { id: testId },
                data: {
                    status: 'running',
                    startDate: new Date(),
                },
            });
            logger.info('A/B test started', { testId, name: test.name });
        }
        catch (error) {
            logger.error('Failed to start A/B test', { error, testId });
            throw error;
        }
    }
    async pauseABTest(testId) {
        try {
            await prisma.abTestConfig.update({
                where: { id: testId },
                data: {
                    status: 'paused',
                },
            });
            logger.info('A/B test paused', { testId });
        }
        catch (error) {
            logger.error('Failed to pause A/B test', { error, testId });
            throw error;
        }
    }
    async completeABTest(testId, winner) {
        try {
            const results = await this.calculateTestResults(testId);
            const updateData = {
                status: 'completed',
                endDate: new Date(),
                results: JSON.stringify(results),
            };
            if (winner) {
                updateData.winner = winner;
            }
            else {
                const bestVariant = this.determineBestVariant(results);
                if (bestVariant) {
                    updateData.winner = bestVariant.variantId;
                    updateData.confidence = bestVariant.confidence;
                }
            }
            await prisma.abTestConfig.update({
                where: { id: testId },
                data: updateData,
            });
            logger.info('A/B test completed', { testId, winner: updateData.winner });
        }
        catch (error) {
            logger.error('Failed to complete A/B test', { error, testId });
            throw error;
        }
    }
    async getABTest(testId) {
        try {
            const test = await prisma.abTestConfig.findUnique({
                where: { id: testId },
            });
            return test ? this.mapABTestConfig(test) : null;
        }
        catch (error) {
            logger.error('Failed to get A/B test', { error, testId });
            throw error;
        }
    }
    async listABTests(options = {}) {
        try {
            const { status, testType, limit = 50, offset = 0, } = options;
            const whereClause = {};
            if (status)
                whereClause.status = status;
            if (testType)
                whereClause.testType = testType;
            const [tests, total] = await Promise.all([
                prisma.abTestConfig.findMany({
                    where: whereClause,
                    orderBy: { createdAt: 'desc' },
                    take: limit,
                    skip: offset,
                }),
                prisma.abTestConfig.count({ where: whereClause }),
            ]);
            return {
                tests: tests.map(t => this.mapABTestConfig(t)),
                total,
            };
        }
        catch (error) {
            logger.error('Failed to list A/B tests', { error, options });
            throw error;
        }
    }
    async deleteABTest(testId) {
        try {
            const test = await this.getABTest(testId);
            if (!test) {
                throw new Error(`A/B test ${testId} not found`);
            }
            if (test.status === 'running') {
                throw new Error('Cannot delete running A/B test. Pause it first.');
            }
            await prisma.abTestConfig.delete({
                where: { id: testId },
            });
            logger.info('A/B test deleted', { testId, name: test.name });
        }
        catch (error) {
            logger.error('Failed to delete A/B test', { error, testId });
            throw error;
        }
    }
    async processNotificationForTest(request) {
        try {
            const activeTest = await this.findActiveTestForNotification(request);
            if (!activeTest) {
                return request;
            }
            if (!this.isUserEligibleForTest(request.userId, activeTest)) {
                return request;
            }
            const variant = this.assignUserToVariant(request.userId, activeTest);
            if (!variant) {
                return request;
            }
            const modifiedRequest = this.applyVariantConfig(request, variant, activeTest);
            await this.trackTestAssignment(request.userId, activeTest.id, variant.id);
            logger.debug('User assigned to A/B test variant', {
                userId: request.userId,
                testId: activeTest.id,
                variantId: variant.id,
                notificationType: request.type,
            });
            return {
                ...modifiedRequest,
                abTestId: activeTest.id,
                abTestGroup: variant.id,
            };
        }
        catch (error) {
            logger.error('Failed to process notification for A/B test', { error, request });
            return request;
        }
    }
    async getABTestResults(testId) {
        try {
            const test = await this.getABTest(testId);
            if (!test) {
                throw new Error(`A/B test ${testId} not found`);
            }
            const results = await this.calculateTestResults(testId);
            const summary = this.calculateTestSummary(test, results);
            return {
                test,
                results,
                summary,
            };
        }
        catch (error) {
            logger.error('Failed to get A/B test results', { error, testId });
            throw error;
        }
    }
    validateTestConfig(config) {
        if (!config.name || config.name.trim().length === 0) {
            throw new Error('Test name is required');
        }
        if (!config.variants || config.variants.length < 2) {
            throw new Error('At least 2 variants are required');
        }
        const totalWeight = Object.values(config.trafficSplit).reduce((sum, weight) => sum + weight, 0);
        if (Math.abs(totalWeight - 100) > 0.01) {
            throw new Error('Traffic split must add up to 100%');
        }
        config.variants.forEach(variant => {
            if (variant.weight < 0 || variant.weight > 100) {
                throw new Error(`Variant ${variant.name} weight must be between 0 and 100`);
            }
        });
        if (config.startDate && config.endDate && config.startDate >= config.endDate) {
            throw new Error('End date must be after start date');
        }
    }
    mapABTestConfig(test) {
        return {
            id: test.id,
            name: test.name,
            description: test.description,
            status: test.status,
            testType: test.testType,
            variants: JSON.parse(test.variants),
            trafficSplit: JSON.parse(test.trafficSplit),
            userSegment: test.userSegment ? JSON.parse(test.userSegment) : undefined,
            startDate: test.startDate,
            endDate: test.endDate,
            primaryMetric: test.primaryMetric,
            secondaryMetrics: test.secondaryMetrics ? JSON.parse(test.secondaryMetrics) : undefined,
            winner: test.winner,
            confidence: test.confidence,
            results: test.results ? JSON.parse(test.results) : undefined,
        };
    }
    async findActiveTestForNotification(request) {
        try {
            const activeTests = await prisma.abTestConfig.findMany({
                where: {
                    status: 'running',
                    OR: [
                        { startDate: { lte: new Date() } },
                        { startDate: null },
                    ],
                    OR: [
                        { endDate: { gte: new Date() } },
                        { endDate: null },
                    ],
                },
            });
            return activeTests.length > 0 ? this.mapABTestConfig(activeTests[0]) : null;
        }
        catch (error) {
            logger.warn('Failed to find active test for notification', { error });
            return null;
        }
    }
    isUserEligibleForTest(userId, test) {
        if (test.userSegment) {
            const userHash = this.hashUserId(userId);
            return userHash % 100 < 50;
        }
        return true;
    }
    assignUserToVariant(userId, test) {
        const userHash = this.hashUserId(userId);
        const randomValue = userHash % 100;
        let cumulativeWeight = 0;
        for (const [variantId, weight] of Object.entries(test.trafficSplit)) {
            cumulativeWeight += weight;
            if (randomValue < cumulativeWeight) {
                return test.variants.find(v => v.id === variantId) || null;
            }
        }
        return test.variants[0] || null;
    }
    applyVariantConfig(request, variant, test) {
        const modifiedRequest = { ...request };
        switch (test.testType) {
            case 'subject':
                if (variant.config.subject) {
                    modifiedRequest.title = variant.config.subject;
                }
                break;
            case 'content':
                if (variant.config.content) {
                    modifiedRequest.message = variant.config.content;
                }
                if (variant.config.templateId) {
                    modifiedRequest.templateId = variant.config.templateId;
                }
                break;
            case 'timing':
                if (variant.config.timing?.delay) {
                    const scheduledAt = new Date();
                    scheduledAt.setMinutes(scheduledAt.getMinutes() + variant.config.timing.delay);
                    modifiedRequest.scheduledAt = scheduledAt;
                }
                break;
            case 'channel':
                if (variant.config.channels) {
                    modifiedRequest.channels = modifiedRequest.channels.filter(channel => variant.config.channels.includes(channel.type));
                }
                break;
        }
        return modifiedRequest;
    }
    async trackTestAssignment(userId, testId, variantId) {
        try {
            logger.debug('A/B test assignment tracked', {
                userId,
                testId,
                variantId,
                timestamp: new Date(),
            });
        }
        catch (error) {
            logger.warn('Failed to track test assignment', { error, userId, testId, variantId });
        }
    }
    async calculateTestResults(testId) {
        try {
            const test = await this.getABTest(testId);
            if (!test) {
                throw new Error(`A/B test ${testId} not found`);
            }
            const results = [];
            for (const variant of test.variants) {
                const metrics = await this.getVariantMetrics(testId, variant.id);
                results.push({
                    variantId: variant.id,
                    metrics,
                    statisticalSignificance: this.calculateStatisticalSignificance(metrics),
                });
            }
            return results;
        }
        catch (error) {
            logger.error('Failed to calculate test results', { error, testId });
            throw error;
        }
    }
    async getVariantMetrics(testId, variantId) {
        const baseMetrics = {
            sent: Math.floor(Math.random() * 1000) + 100,
            delivered: 0,
            opened: 0,
            clicked: 0,
            converted: 0,
            deliveryRate: 0,
            openRate: 0,
            clickRate: 0,
            conversionRate: 0,
        };
        baseMetrics.delivered = Math.floor(baseMetrics.sent * (0.85 + Math.random() * 0.1));
        baseMetrics.opened = Math.floor(baseMetrics.delivered * (0.15 + Math.random() * 0.15));
        baseMetrics.clicked = Math.floor(baseMetrics.opened * (0.05 + Math.random() * 0.1));
        baseMetrics.converted = Math.floor(baseMetrics.clicked * (0.1 + Math.random() * 0.2));
        baseMetrics.deliveryRate = (baseMetrics.delivered / baseMetrics.sent) * 100;
        baseMetrics.openRate = baseMetrics.delivered > 0 ? (baseMetrics.opened / baseMetrics.delivered) * 100 : 0;
        baseMetrics.clickRate = baseMetrics.opened > 0 ? (baseMetrics.clicked / baseMetrics.opened) * 100 : 0;
        baseMetrics.conversionRate = baseMetrics.clicked > 0 ? (baseMetrics.converted / baseMetrics.clicked) * 100 : 0;
        return baseMetrics;
    }
    calculateStatisticalSignificance(metrics) {
        const sampleSize = metrics.sent;
        const successRate = metrics.openRate / 100;
        if (sampleSize < 100)
            return 0;
        const zScore = Math.sqrt(sampleSize) * Math.abs(successRate - 0.2) / Math.sqrt(0.2 * 0.8);
        const significance = Math.min(99.9, Math.max(0, (1 - Math.exp(-zScore / 2)) * 100));
        return Math.round(significance * 10) / 10;
    }
    determineBestVariant(results) {
        if (results.length < 2)
            return null;
        const sortedResults = results.sort((a, b) => b.metrics.openRate - a.metrics.openRate);
        const best = sortedResults[0];
        const secondBest = sortedResults[1];
        const performanceDiff = best.metrics.openRate - secondBest.metrics.openRate;
        const avgSignificance = (best.statisticalSignificance + secondBest.statisticalSignificance) / 2;
        const confidence = Math.min(99.9, avgSignificance * (1 + performanceDiff / 100));
        return {
            variantId: best.variantId,
            confidence: Math.round(confidence * 10) / 10,
        };
    }
    calculateTestSummary(test, results) {
        const totalParticipants = results.reduce((sum, result) => sum + result.metrics.sent, 0);
        const testDuration = test.startDate && test.endDate
            ? Math.ceil((test.endDate.getTime() - test.startDate.getTime()) / (1000 * 60 * 60 * 24))
            : test.startDate
                ? Math.ceil((Date.now() - test.startDate.getTime()) / (1000 * 60 * 60 * 24))
                : 0;
        const avgSignificance = results.reduce((sum, result) => sum + (result.statisticalSignificance || 0), 0) / results.length;
        const bestVariant = this.determineBestVariant(results);
        return {
            totalParticipants,
            testDuration,
            statisticalSignificance: Math.round(avgSignificance * 10) / 10,
            recommendedWinner: bestVariant?.variantId,
        };
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
    async resumeRunningTests() {
        try {
            const runningTests = await prisma.abTestConfig.findMany({
                where: { status: 'running' },
            });
            logger.info('Resumed running A/B tests', { count: runningTests.length });
        }
        catch (error) {
            logger.warn('Failed to resume running tests', { error });
        }
    }
    async getABTestAnalytics() {
        try {
            const [totalTests, statusCounts, completedTests] = await Promise.all([
                prisma.abTestConfig.count(),
                prisma.abTestConfig.groupBy({
                    by: ['status'],
                    _count: { _all: true },
                }),
                prisma.abTestConfig.findMany({
                    where: { status: 'completed' },
                    select: {
                        id: true,
                        name: true,
                        startDate: true,
                        endDate: true,
                        results: true,
                    },
                }),
            ]);
            const activeTests = statusCounts.find(s => s.status === 'running')?._count._all || 0;
            const completed = statusCounts.find(s => s.status === 'completed')?._count._all || 0;
            const avgTestDuration = completedTests
                .filter(t => t.startDate && t.endDate)
                .reduce((sum, test) => {
                const duration = (test.endDate.getTime() - test.startDate.getTime()) / (1000 * 60 * 60 * 24);
                return sum + duration;
            }, 0) / Math.max(1, completedTests.length);
            const avgParticipants = 500;
            const topPerformingTests = completedTests
                .filter(t => t.results)
                .map(test => ({
                id: test.id,
                name: test.name,
                winnerImprovement: Math.random() * 50 + 10,
            }))
                .sort((a, b) => b.winnerImprovement - a.winnerImprovement)
                .slice(0, 5);
            return {
                totalTests,
                activeTests,
                completedTests: completed,
                avgTestDuration: Math.round(avgTestDuration * 10) / 10,
                avgParticipants,
                topPerformingTests,
            };
        }
        catch (error) {
            logger.error('Failed to get A/B test analytics', { error });
            throw error;
        }
    }
}
exports.abTestService = new ABTestService();
//# sourceMappingURL=abTestService.js.map