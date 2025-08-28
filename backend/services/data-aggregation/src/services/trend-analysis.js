"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrendAnalysisService = void 0;
const logger_1 = require("../utils/logger");
const website_targets_1 = require("../config/website-targets");
class TrendAnalysisService {
    prisma;
    isRunning = false;
    analysisInterval = null;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async startPeriodicAnalysis() {
        if (this.isRunning) {
            logger_1.logger.warn('Trend analysis is already running');
            return;
        }
        this.isRunning = true;
        logger_1.logger.info('Starting periodic trend analysis');
        await this.runFullAnalysis();
        this.analysisInterval = setInterval(async () => {
            try {
                await this.runFullAnalysis();
            }
            catch (error) {
                logger_1.logger.error('Error in periodic trend analysis:', error);
            }
        }, 6 * 60 * 60 * 1000);
    }
    async stop() {
        this.isRunning = false;
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
            this.analysisInterval = null;
        }
        logger_1.logger.info('Trend analysis stopped');
    }
    async runFullAnalysis() {
        logger_1.logger.info('Starting full trend analysis');
        try {
            await this.calculateIndustryTrends();
            await this.analyzePatternEvolution();
            await this.generateTrendAlerts();
            logger_1.logger.info('Full trend analysis completed');
        }
        catch (error) {
            logger_1.logger.error('Error in full trend analysis:', error);
        }
    }
    async getIndustryTrends(category, days = 30) {
        try {
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
            const categories = category ? [category] : website_targets_1.WebsiteTargets.getCategories();
            const trends = [];
            for (const cat of categories) {
                const websites = website_targets_1.WebsiteTargets.getTargetsByCategory(cat);
                const websiteNames = websites.map(w => w.name);
                if (websiteNames.length === 0)
                    continue;
                const currentData = await this.getRiskScoreData(websiteNames, startDate, endDate);
                const previousStartDate = new Date(startDate.getTime() - days * 24 * 60 * 60 * 1000);
                const previousData = await this.getRiskScoreData(websiteNames, previousStartDate, startDate);
                const currentAverage = this.calculateAverage(currentData.map(d => d.value));
                const previousAverage = this.calculateAverage(previousData.map(d => d.value));
                const change = currentAverage - previousAverage;
                const changePercent = previousAverage > 0 ? (change / previousAverage) * 100 : 0;
                let trend = 'stable';
                if (Math.abs(changePercent) > 5) {
                    trend = change > 0 ? 'increasing' : 'decreasing';
                }
                const topWebsites = await this.getTopWebsitesByRisk(websiteNames, 5);
                trends.push({
                    category: cat,
                    currentAverage,
                    previousAverage,
                    change,
                    changePercent,
                    trend,
                    dataPoints: currentData,
                    topWebsites,
                });
            }
            return trends;
        }
        catch (error) {
            logger_1.logger.error('Error getting industry trends:', error);
            return [];
        }
    }
    async getRiskScoreTrends(websiteName, days = 30) {
        try {
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
            const whereClause = {
                completedAt: { gte: startDate, lte: endDate },
                status: 'completed',
                riskScore: { not: null },
            };
            if (websiteName) {
                whereClause.document = { websiteName };
            }
            const dailyData = await this.prisma.documentAnalysis.findMany({
                where: whereClause,
                select: {
                    completedAt: true,
                    riskScore: true,
                    document: {
                        select: { websiteName: true },
                    },
                },
                orderBy: { completedAt: 'asc' },
            });
            const dailyGroups = {};
            dailyData.forEach(analysis => {
                const date = analysis.completedAt.toISOString().split('T')[0];
                if (!dailyGroups[date]) {
                    dailyGroups[date] = { scores: [], websites: new Set() };
                }
                if (analysis.riskScore !== null) {
                    dailyGroups[date].scores.push(analysis.riskScore);
                    dailyGroups[date].websites.add(analysis.document.websiteName);
                }
            });
            return Object.entries(dailyGroups).map(([date, data]) => ({
                date,
                value: this.calculateAverage(data.scores),
                count: data.scores.length,
                metadata: {
                    uniqueWebsites: data.websites.size,
                    scores: data.scores,
                },
            }));
        }
        catch (error) {
            logger_1.logger.error('Error getting risk score trends:', error);
            return [];
        }
    }
    async getPatternEvolution(patternType, days = 90) {
        try {
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
            const analyses = await this.prisma.documentAnalysis.findMany({
                where: {
                    completedAt: { gte: startDate, lte: endDate },
                    status: 'completed',
                    patterns: { not: null },
                },
                select: {
                    completedAt: true,
                    patterns: true,
                    document: {
                        select: { websiteName: true },
                    },
                },
                orderBy: { completedAt: 'asc' },
            });
            const patternData = {};
            analyses.forEach(analysis => {
                const patterns = analysis.patterns || [];
                const date = analysis.completedAt.toISOString().split('T')[0];
                patterns.forEach(pattern => {
                    const type = pattern.type || 'unknown';
                    if (patternType && type !== patternType)
                        return;
                    if (!patternData[type]) {
                        patternData[type] = {
                            frequency: {},
                            severity: {},
                            websites: {},
                        };
                    }
                    patternData[type].frequency[date] = (patternData[type].frequency[date] || 0) + 1;
                    if (!patternData[type].severity[date]) {
                        patternData[type].severity[date] = [];
                    }
                    patternData[type].severity[date].push(pattern.severity || 0.5);
                    const website = analysis.document.websiteName;
                    if (!patternData[type].websites[website]) {
                        patternData[type].websites[website] = { count: 0, lastSeen: analysis.completedAt };
                    }
                    patternData[type].websites[website].count++;
                    patternData[type].websites[website].lastSeen = analysis.completedAt;
                });
            });
            return Object.entries(patternData).map(([type, data]) => {
                const frequency = Object.entries(data.frequency).map(([date, count]) => ({
                    date,
                    value: count,
                    count,
                }));
                const severity = Object.entries(data.severity).map(([date, severities]) => ({
                    date,
                    value: this.calculateAverage(severities),
                    count: severities.length,
                }));
                const affectedWebsites = Object.entries(data.websites).map(([name, info]) => ({
                    name,
                    frequency: info.count,
                    lastSeen: info.lastSeen,
                }));
                return {
                    patternType: type,
                    frequency,
                    severity,
                    affectedWebsites: affectedWebsites.sort((a, b) => b.frequency - a.frequency),
                    emergingPatterns: [],
                    decliningPatterns: [],
                };
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting pattern evolution:', error);
            return [];
        }
    }
    async generateTrendReport(options) {
        const { category, websites, days = 30 } = options;
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
        try {
            const summary = await this.generateReportSummary(startDate, endDate, category, websites);
            const categoryTrends = await this.getIndustryTrends(category, days);
            const patternEvolution = await this.getPatternEvolution(undefined, days);
            const recommendations = this.generateRecommendations(categoryTrends, patternEvolution);
            return {
                generatedAt: new Date(),
                period: { start: startDate, end: endDate, days },
                summary,
                categoryTrends,
                patternEvolution,
                recommendations,
            };
        }
        catch (error) {
            logger_1.logger.error('Error generating trend report:', error);
            throw error;
        }
    }
    async calculateIndustryTrends() {
        logger_1.logger.info('Calculating industry trends...');
    }
    async analyzePatternEvolution() {
        logger_1.logger.info('Analyzing pattern evolution...');
    }
    async generateTrendAlerts() {
        logger_1.logger.info('Generating trend alerts...');
    }
    async getRiskScoreData(websiteNames, startDate, endDate) {
        const analyses = await this.prisma.documentAnalysis.findMany({
            where: {
                completedAt: { gte: startDate, lte: endDate },
                status: 'completed',
                riskScore: { not: null },
                document: { websiteName: { in: websiteNames } },
            },
            select: {
                completedAt: true,
                riskScore: true,
            },
            orderBy: { completedAt: 'asc' },
        });
        const dailyGroups = {};
        analyses.forEach(analysis => {
            const date = analysis.completedAt.toISOString().split('T')[0];
            if (!dailyGroups[date])
                dailyGroups[date] = [];
            if (analysis.riskScore !== null) {
                dailyGroups[date].push(analysis.riskScore);
            }
        });
        return Object.entries(dailyGroups).map(([date, scores]) => ({
            date,
            value: this.calculateAverage(scores),
            count: scores.length,
        }));
    }
    async getTopWebsitesByRisk(websiteNames, limit) {
        const latestScores = await Promise.all(websiteNames.map(async (name) => {
            const latest = await this.prisma.aggregatedDocument.findFirst({
                where: { websiteName: name },
                orderBy: { lastAnalyzed: 'desc' },
                select: {
                    websiteName: true,
                    latestRiskScore: true,
                    lastAnalyzed: true,
                },
            });
            const previous = await this.prisma.documentAnalysis.findFirst({
                where: {
                    document: { websiteName: name },
                    completedAt: {
                        lt: latest?.lastAnalyzed || new Date(),
                    },
                    status: 'completed',
                },
                orderBy: { completedAt: 'desc' },
                select: { riskScore: true },
            });
            const currentScore = latest?.latestRiskScore || 0;
            const previousScore = previous?.riskScore || 0;
            const change = currentScore - previousScore;
            return {
                name,
                score: currentScore,
                change,
            };
        }));
        return latestScores
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }
    async generateReportSummary(startDate, endDate, category, websites) {
        const whereClause = {
            completedAt: { gte: startDate, lte: endDate },
            status: 'completed',
        };
        if (category) {
            const categoryWebsites = website_targets_1.WebsiteTargets.getTargetsByCategory(category);
            whereClause.document = { websiteName: { in: categoryWebsites.map(w => w.name) } };
        }
        else if (websites) {
            whereClause.document = { websiteName: { in: websites } };
        }
        const [totalDocuments, riskScoreData, categoryData] = await Promise.all([
            this.prisma.documentAnalysis.count({ where: whereClause }),
            this.prisma.documentAnalysis.aggregate({
                where: whereClause,
                _avg: { riskScore: true },
            }),
            this.prisma.documentAnalysis.groupBy({
                by: ['document'],
                where: whereClause,
                _count: true,
            }),
        ]);
        const previousStart = new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime()));
        const previousRiskData = await this.prisma.documentAnalysis.aggregate({
            where: {
                ...whereClause,
                completedAt: { gte: previousStart, lt: startDate },
            },
            _avg: { riskScore: true },
        });
        const averageRiskScore = riskScoreData._avg.riskScore || 0;
        const previousAverageRiskScore = previousRiskData._avg.riskScore || 0;
        const riskScoreChange = averageRiskScore - previousAverageRiskScore;
        return {
            totalDocuments,
            averageRiskScore,
            riskScoreChange,
            mostActiveCategory: 'technology',
            emergingRisks: [],
        };
    }
    generateRecommendations(categoryTrends, patternEvolution) {
        const recommendations = [];
        const increasingTrends = categoryTrends.filter(t => t.trend === 'increasing');
        const decreasingTrends = categoryTrends.filter(t => t.trend === 'decreasing');
        if (increasingTrends.length > 0) {
            recommendations.push(`Monitor ${increasingTrends.map(t => t.category).join(', ')} categories closely as risk scores are increasing`);
        }
        if (decreasingTrends.length > 0) {
            recommendations.push(`${decreasingTrends.map(t => t.category).join(', ')} categories show improving risk scores`);
        }
        const frequentPatterns = patternEvolution
            .filter(p => p.frequency.reduce((sum, f) => sum + f.value, 0) > 10)
            .sort((a, b) => {
            const aTotal = a.frequency.reduce((sum, f) => sum + f.value, 0);
            const bTotal = b.frequency.reduce((sum, f) => sum + f.value, 0);
            return bTotal - aTotal;
        });
        if (frequentPatterns.length > 0) {
            recommendations.push(`Pay attention to these common patterns: ${frequentPatterns.slice(0, 3).map(p => p.patternType).join(', ')}`);
        }
        return recommendations;
    }
    calculateAverage(numbers) {
        if (numbers.length === 0)
            return 0;
        return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
    }
}
exports.TrendAnalysisService = TrendAnalysisService;
//# sourceMappingURL=trend-analysis.js.map