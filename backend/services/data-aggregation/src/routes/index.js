"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRoutes = registerRoutes;
const website_targets_1 = require("../config/website-targets");
const logger_1 = require("../utils/logger");
async function registerRoutes(fastify, context) {
    const { prisma, crawlerService, processorService, trendService, complianceService } = context;
    fastify.addHook('preHandler', async (request, reply) => {
        if (request.url.startsWith('/health') || request.url.startsWith('/public/')) {
            return;
        }
        const authToken = request.headers.authorization?.replace('Bearer ', '');
        if (!authToken || authToken !== process.env.SERVICE_AUTH_TOKEN) {
            return reply.code(401).send({ error: 'Unauthorized' });
        }
    });
    fastify.get('/websites', async (request, reply) => {
        try {
            return {
                websites: website_targets_1.WebsiteTargets.getAllTargets(),
                statistics: website_targets_1.WebsiteTargets.getStatistics(),
            };
        }
        catch (error) {
            logger_1.logger.error('Error fetching websites:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    fastify.get('/websites/category/:category', async (request, reply) => {
        try {
            const { category } = request.params;
            const websites = website_targets_1.WebsiteTargets.getTargetsByCategory(category);
            return { websites, category };
        }
        catch (error) {
            logger_1.logger.error('Error fetching websites by category:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    fastify.post('/crawl/start', async (request, reply) => {
        try {
            const stats = await crawlerService.crawlAllWebsites();
            return { message: 'Crawling completed', stats };
        }
        catch (error) {
            logger_1.logger.error('Error starting crawl:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    fastify.post('/crawl/:websiteName', async (request, reply) => {
        try {
            const { websiteName } = request.params;
            const results = await crawlerService.crawlSpecificWebsite(websiteName);
            return { message: 'Crawling completed', websiteName, results };
        }
        catch (error) {
            logger_1.logger.error('Error crawling specific website:', error);
            return reply.code(500).send({ error: error instanceof Error ? error.message : 'Internal server error' });
        }
    });
    fastify.get('/crawl/stats', async (request, reply) => {
        try {
            const stats = await crawlerService.getRecentStats(20);
            return { stats };
        }
        catch (error) {
            logger_1.logger.error('Error fetching crawl stats:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    fastify.get('/documents/:websiteName', async (request, reply) => {
        try {
            const { websiteName } = request.params;
            const limit = request.query.limit || 50;
            const documents = await crawlerService.getWebsiteDocuments(websiteName, limit);
            return { websiteName, documents };
        }
        catch (error) {
            logger_1.logger.error('Error fetching website documents:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    fastify.get('/processing/status', async (request, reply) => {
        try {
            const queueStatus = await processorService.getQueueStatus();
            const stats = await processorService.getProcessingStats();
            return { queueStatus, stats };
        }
        catch (error) {
            logger_1.logger.error('Error fetching processing status:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    fastify.post('/processing/reprocess/:documentId', async (request, reply) => {
        try {
            const { documentId } = request.params;
            await processorService.reprocessDocument(documentId);
            return { message: 'Document queued for reprocessing', documentId };
        }
        catch (error) {
            logger_1.logger.error('Error reprocessing document:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    fastify.get('/processing/analyses', async (request, reply) => {
        try {
            const limit = request.query.limit || 50;
            const analyses = await processorService.getRecentAnalyses(limit);
            return { analyses };
        }
        catch (error) {
            logger_1.logger.error('Error fetching recent analyses:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    fastify.get('/trends/industry', async (request, reply) => {
        try {
            const { category, days = 30 } = request.query;
            const trends = await trendService.getIndustryTrends(category, days);
            return { trends, category, periodDays: days };
        }
        catch (error) {
            logger_1.logger.error('Error fetching industry trends:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    fastify.get('/trends/risk-scores', async (request, reply) => {
        try {
            const { websiteName, days = 30 } = request.query;
            const trends = await trendService.getRiskScoreTrends(websiteName, days);
            return { trends, websiteName, periodDays: days };
        }
        catch (error) {
            logger_1.logger.error('Error fetching risk score trends:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    fastify.get('/trends/patterns', async (request, reply) => {
        try {
            const { patternType, days = 90 } = request.query;
            const evolution = await trendService.getPatternEvolution(patternType, days);
            return { evolution, patternType, periodDays: days };
        }
        catch (error) {
            logger_1.logger.error('Error fetching pattern evolution:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    fastify.post('/trends/report', async (request, reply) => {
        try {
            const { category, websites, days = 30 } = request.body;
            const report = await trendService.generateTrendReport({ category, websites, days });
            return { report };
        }
        catch (error) {
            logger_1.logger.error('Error generating trend report:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    fastify.get('/compliance/alerts', async (request, reply) => {
        try {
            const { severity, limit = 50 } = request.query;
            const alerts = await complianceService.getRecentAlerts(severity, limit);
            return { alerts };
        }
        catch (error) {
            logger_1.logger.error('Error fetching compliance alerts:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    fastify.get('/compliance/scores', async (request, reply) => {
        try {
            const scores = await complianceService.getComplianceScores();
            return { scores };
        }
        catch (error) {
            logger_1.logger.error('Error fetching compliance scores:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    fastify.get('/compliance/changes', async (request, reply) => {
        try {
            const { region, days = 30 } = request.query;
            const changes = await complianceService.getRegulatoryChanges(region, days);
            return { changes, region, periodDays: days };
        }
        catch (error) {
            logger_1.logger.error('Error fetching regulatory changes:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    fastify.get('/public/stats', async (request, reply) => {
        try {
            const [totalDocuments, lastWeekAnalyses, categories] = await Promise.all([
                prisma.aggregatedDocument.count(),
                prisma.documentAnalysis.count({
                    where: {
                        completedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
                        status: 'completed',
                    },
                }),
                prisma.aggregatedDocument.groupBy({
                    by: ['websiteName'],
                    _count: true,
                    orderBy: { _count: { websiteName: 'desc' } },
                    take: 10,
                }),
            ]);
            return {
                totalDocuments,
                lastWeekAnalyses,
                topWebsites: categories.map(c => ({
                    name: c.websiteName,
                    documentCount: c._count,
                })),
                lastUpdated: new Date().toISOString(),
            };
        }
        catch (error) {
            logger_1.logger.error('Error fetching public stats:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    fastify.get('/public/risk-comparison', async (request, reply) => {
        try {
            const websiteNames = request.query.websites?.split(',') || [];
            if (websiteNames.length === 0 || websiteNames.length > 10) {
                return reply.code(400).send({
                    error: 'Please provide 1-10 website names separated by commas'
                });
            }
            const comparisons = await Promise.all(websiteNames.map(async (name) => {
                const latestDoc = await prisma.aggregatedDocument.findFirst({
                    where: { websiteName: name.trim() },
                    orderBy: { crawledAt: 'desc' },
                    select: {
                        websiteName: true,
                        latestRiskScore: true,
                        lastAnalyzed: true,
                        documentType: true,
                    },
                });
                return latestDoc ? {
                    website: latestDoc.websiteName,
                    riskScore: latestDoc.latestRiskScore || 0,
                    lastAnalyzed: latestDoc.lastAnalyzed,
                    documentType: latestDoc.documentType,
                } : {
                    website: name.trim(),
                    riskScore: null,
                    lastAnalyzed: null,
                    documentType: null,
                    error: 'Website not found',
                };
            }));
            return { comparisons };
        }
        catch (error) {
            logger_1.logger.error('Error fetching risk comparison:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    fastify.get('/public/industry-averages', async (request, reply) => {
        try {
            const averages = await prisma.aggregatedDocument.groupBy({
                by: ['websiteName'],
                where: {
                    latestRiskScore: { not: null },
                    lastAnalyzed: { not: null },
                },
                _avg: { latestRiskScore: true },
                _count: true,
            });
            const categoryAverages = {};
            averages.forEach(avg => {
                const target = website_targets_1.WebsiteTargets.getTarget(avg.websiteName);
                const category = target?.category || 'unknown';
                if (!categoryAverages[category]) {
                    categoryAverages[category] = { average: 0, count: 0, websites: [] };
                }
                categoryAverages[category].average += avg._avg.latestRiskScore || 0;
                categoryAverages[category].count += 1;
                categoryAverages[category].websites.push(avg.websiteName);
            });
            Object.keys(categoryAverages).forEach(category => {
                categoryAverages[category].average =
                    categoryAverages[category].average / categoryAverages[category].count;
            });
            return { categoryAverages };
        }
        catch (error) {
            logger_1.logger.error('Error fetching industry averages:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    fastify.get('/search/documents', async (request, reply) => {
        try {
            const { q, category, riskLevel, limit = 20, offset = 0 } = request.query;
            const whereClause = {};
            if (q) {
                whereClause.OR = [
                    { title: { contains: q, mode: 'insensitive' } },
                    { websiteName: { contains: q, mode: 'insensitive' } },
                    { content: { contains: q, mode: 'insensitive' } },
                ];
            }
            if (category) {
                const websites = website_targets_1.WebsiteTargets.getTargetsByCategory(category);
                whereClause.websiteName = { in: websites.map(w => w.name) };
            }
            if (riskLevel) {
                const riskRanges = {
                    low: { gte: 0, lt: 0.33 },
                    medium: { gte: 0.33, lt: 0.67 },
                    high: { gte: 0.67, lte: 1 },
                };
                whereClause.latestRiskScore = riskRanges[riskLevel];
            }
            const [documents, total] = await Promise.all([
                prisma.aggregatedDocument.findMany({
                    where: whereClause,
                    take: limit,
                    skip: offset,
                    orderBy: { crawledAt: 'desc' },
                    select: {
                        id: true,
                        websiteName: true,
                        documentType: true,
                        title: true,
                        url: true,
                        latestRiskScore: true,
                        lastAnalyzed: true,
                        crawledAt: true,
                        wordCount: true,
                    },
                }),
                prisma.aggregatedDocument.count({ where: whereClause }),
            ]);
            return {
                documents,
                pagination: {
                    total,
                    limit,
                    offset,
                    hasMore: offset + limit < total,
                },
            };
        }
        catch (error) {
            logger_1.logger.error('Error searching documents:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    fastify.get('/documents/details/:documentId', async (request, reply) => {
        try {
            const { documentId } = request.params;
            const [document, analyses] = await Promise.all([
                prisma.aggregatedDocument.findUnique({
                    where: { id: documentId },
                }),
                prisma.documentAnalysis.findMany({
                    where: { documentId },
                    orderBy: { completedAt: 'desc' },
                    take: 5,
                    select: {
                        id: true,
                        riskScore: true,
                        patterns: true,
                        insights: true,
                        completedAt: true,
                        processingTimeMs: true,
                    },
                }),
            ]);
            if (!document) {
                return reply.code(404).send({ error: 'Document not found' });
            }
            return { document, recentAnalyses: analyses };
        }
        catch (error) {
            logger_1.logger.error('Error fetching document details:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    logger_1.logger.info('Data aggregation routes registered successfully');
}
//# sourceMappingURL=index.js.map