"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardService = exports.DashboardService = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const client_1 = require("@prisma/client");
const analysis_1 = require("./analysis");
const logger = (0, logger_1.createServiceLogger)('dashboard-service');
const prisma = new client_1.PrismaClient();
class DashboardService {
    analysisService;
    constructor() {
        this.analysisService = new analysis_1.AnalysisService();
    }
    async getDashboardData(userId, filters) {
        const cacheKey = `dashboard:${userId}:${JSON.stringify(filters)}`;
        try {
            const cached = await cache_1.analysisCache.get(cacheKey);
            if (cached) {
                logger.debug('Dashboard data found in cache', { userId });
                return cached;
            }
            logger.info('Generating dashboard data', { userId, filters });
            const dateRange = this.getDateRange(filters);
            const [overview, recentActivity, riskDistribution, topCategories, trends, performance, insights, usage, documentTypes, comparisons] = await Promise.all([
                this.getOverviewStats(userId, dateRange),
                this.getRecentActivity(userId, dateRange),
                this.getRiskDistribution(userId, dateRange),
                this.getTopCategories(userId, dateRange),
                this.getTrends(userId, dateRange),
                this.getPerformanceMetrics(userId, dateRange),
                this.getInsights(userId, dateRange),
                this.getUsageData(userId),
                this.getDocumentTypesAnalysis(userId, dateRange),
                this.getComparisonData(userId, dateRange)
            ]);
            const dashboardData = {
                overview,
                recentActivity,
                riskDistribution,
                topCategories,
                trends,
                performance,
                insights,
                usage,
                documentTypes,
                comparisons
            };
            await cache_1.analysisCache.set(cacheKey, dashboardData, 300);
            logger.info('Dashboard data generated successfully', {
                userId,
                totalAnalyses: overview.totalAnalyses,
                avgRiskScore: overview.avgRiskScore
            });
            return dashboardData;
        }
        catch (error) {
            logger.error('Failed to generate dashboard data', {
                error: error.message,
                userId,
                filters
            });
            throw error;
        }
    }
    async getTeamDashboard(teamId, filters) {
        try {
            logger.info('Generating team dashboard data', { teamId, filters });
            const dateRange = this.getDateRange(filters);
            const [overview, recentActivity, riskDistribution, topCategories, trends, performance, insights, usage, documentTypes, comparisons] = await Promise.all([
                this.getTeamOverviewStats(teamId, dateRange),
                this.getTeamRecentActivity(teamId, dateRange),
                this.getTeamRiskDistribution(teamId, dateRange),
                this.getTeamTopCategories(teamId, dateRange),
                this.getTeamTrends(teamId, dateRange),
                this.getTeamPerformanceMetrics(teamId, dateRange),
                this.getTeamInsights(teamId, dateRange),
                this.getTeamUsageData(teamId),
                this.getTeamDocumentTypesAnalysis(teamId, dateRange),
                this.getTeamComparisonData(teamId, dateRange)
            ]);
            return {
                overview,
                recentActivity,
                riskDistribution,
                topCategories,
                trends,
                performance,
                insights,
                usage,
                documentTypes,
                comparisons
            };
        }
        catch (error) {
            logger.error('Failed to generate team dashboard data', {
                error: error.message,
                teamId,
                filters
            });
            throw error;
        }
    }
    async getAnalyticsReport(userId, type, format) {
        try {
            const dateRange = this.getReportDateRange(type);
            const dashboardData = await this.getDashboardData(userId, { dateRange });
            const reportData = {
                reportType: type,
                generatedAt: new Date(),
                period: dateRange,
                summary: dashboardData.overview,
                trends: dashboardData.trends,
                insights: dashboardData.insights,
                performance: dashboardData.performance
            };
            const filename = `analytics-${type}-${userId}-${new Date().toISOString().split('T')[0]}`;
            if (format === 'json') {
                return {
                    data: reportData,
                    format: 'application/json',
                    filename: `${filename}.json`
                };
            }
            else if (format === 'csv') {
                const csvData = this.convertToCSV(reportData);
                return {
                    data: csvData,
                    format: 'text/csv',
                    filename: `${filename}.csv`
                };
            }
            else if (format === 'pdf') {
                return {
                    data: reportData,
                    format: 'application/pdf',
                    filename: `${filename}.pdf`
                };
            }
            throw new Error(`Unsupported format: ${format}`);
        }
        catch (error) {
            logger.error('Failed to generate analytics report', {
                error: error.message,
                userId,
                type,
                format
            });
            throw error;
        }
    }
    getDateRange(filters) {
        if (filters?.dateRange) {
            return filters.dateRange;
        }
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        return { start, end };
    }
    getReportDateRange(type) {
        const end = new Date();
        const start = new Date();
        switch (type) {
            case 'weekly':
                start.setDate(start.getDate() - 7);
                break;
            case 'monthly':
                start.setMonth(start.getMonth() - 1);
                break;
            case 'quarterly':
                start.setMonth(start.getMonth() - 3);
                break;
        }
        return { start, end };
    }
    async getOverviewStats(userId, dateRange) {
        const [analysisStats, documentStats] = await Promise.all([
            this.analysisService.getAnalysisStats(userId),
            this.getDocumentStats(userId, dateRange)
        ]);
        return {
            totalAnalyses: analysisStats.totalAnalyses,
            completedAnalyses: analysisStats.completedAnalyses,
            pendingAnalyses: analysisStats.pendingAnalyses,
            failedAnalyses: analysisStats.failedAnalyses,
            avgRiskScore: analysisStats.avgRiskScore,
            completionRate: analysisStats.completionRate,
            totalDocuments: documentStats.total,
            storageUsed: documentStats.storageUsed
        };
    }
    async getDocumentStats(userId, dateRange) {
        const [total, storageInfo] = await Promise.all([
            prisma.document.count({
                where: {
                    userId,
                    createdAt: { gte: dateRange.start, lte: dateRange.end },
                    deletedAt: null
                }
            }),
            prisma.document.aggregate({
                where: {
                    userId,
                    deletedAt: null
                },
                _sum: { characterCount: true }
            })
        ]);
        return {
            total,
            storageUsed: (storageInfo._sum.characterCount || 0) * 2
        };
    }
    async getRecentActivity(userId, dateRange) {
        const [analyses, documents] = await Promise.all([
            prisma.documentAnalysis.findMany({
                where: {
                    userId,
                    createdAt: { gte: dateRange.start, lte: dateRange.end }
                },
                include: { document: { select: { title: true } } },
                orderBy: { createdAt: 'desc' },
                take: 20
            }),
            prisma.document.findMany({
                where: {
                    userId,
                    createdAt: { gte: dateRange.start, lte: dateRange.end }
                },
                orderBy: { createdAt: 'desc' },
                take: 10
            })
        ]);
        const activities = [];
        for (const analysis of analyses) {
            activities.push({
                id: analysis.id,
                type: analysis.status === 'completed' ? 'analysis_completed' : 'analysis_created',
                title: `Analysis ${analysis.status}`,
                description: `Document: ${analysis.document.title}`,
                timestamp: analysis.completedAt || analysis.createdAt,
                status: analysis.status,
                metadata: {
                    riskScore: analysis.overallRiskScore,
                    documentId: analysis.documentId
                }
            });
        }
        for (const document of documents) {
            activities.push({
                id: document.id,
                type: 'document_uploaded',
                title: 'Document uploaded',
                description: document.title,
                timestamp: document.createdAt,
                metadata: {
                    documentType: document.documentType,
                    wordCount: document.wordCount
                }
            });
        }
        return activities
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, 15);
    }
    async getRiskDistribution(userId, dateRange) {
        const analyses = await prisma.documentAnalysis.findMany({
            where: {
                userId,
                status: 'completed',
                completedAt: { gte: dateRange.start, lte: dateRange.end },
                overallRiskScore: { not: null }
            },
            select: { overallRiskScore: true }
        });
        const distribution = { minimal: 0, low: 0, moderate: 0, high: 0, critical: 0 };
        for (const analysis of analyses) {
            const score = analysis.overallRiskScore?.toNumber() || 0;
            if (score >= 80)
                distribution.critical++;
            else if (score >= 60)
                distribution.high++;
            else if (score >= 40)
                distribution.moderate++;
            else if (score >= 20)
                distribution.low++;
            else
                distribution.minimal++;
        }
        return distribution;
    }
    async getTopCategories(userId, dateRange) {
        const findings = await prisma.analysisFinding.findMany({
            where: {
                analysis: {
                    userId,
                    status: 'completed',
                    completedAt: { gte: dateRange.start, lte: dateRange.end }
                }
            },
            select: {
                category: true,
                severity: true,
                createdAt: true
            }
        });
        const categoryStats = new Map();
        for (const finding of findings) {
            const category = finding.category;
            if (!categoryStats.has(category)) {
                categoryStats.set(category, {
                    count: 0,
                    severitySum: 0,
                    recentCount: 0
                });
            }
            const stats = categoryStats.get(category);
            stats.count++;
            const severityScore = { low: 1, medium: 2, high: 3, critical: 4 }[finding.severity] || 1;
            stats.severitySum += severityScore;
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            if (finding.createdAt >= weekAgo) {
                stats.recentCount++;
            }
        }
        return Array.from(categoryStats.entries())
            .map(([category, stats]) => ({
            category,
            count: stats.count,
            avgSeverity: stats.severitySum / stats.count,
            trendDirection: this.calculateTrendDirection(stats.count, stats.recentCount),
            trendPercentage: this.calculateTrendPercentage(stats.count, stats.recentCount)
        }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    }
    calculateTrendDirection(total, recent) {
        const expectedRecent = total * (7 / 30);
        const threshold = expectedRecent * 0.2;
        if (recent > expectedRecent + threshold)
            return 'up';
        if (recent < expectedRecent - threshold)
            return 'down';
        return 'stable';
    }
    calculateTrendPercentage(total, recent) {
        const expectedRecent = total * (7 / 30);
        if (expectedRecent === 0)
            return 0;
        return Math.round(((recent - expectedRecent) / expectedRecent) * 100);
    }
    async getTrends(userId, dateRange) {
        const dailyAnalyses = await this.getDailyAnalysisTrends(userId, dateRange);
        const dailyRiskTrends = await this.getDailyRiskTrends(userId, dateRange);
        const categoryTrends = await this.getCategoryTrends(userId, dateRange);
        return {
            analysisVolume: dailyAnalyses,
            riskTrends: dailyRiskTrends,
            categoryTrends
        };
    }
    async getDailyAnalysisTrends(userId, dateRange) {
        const analyses = await prisma.documentAnalysis.findMany({
            where: {
                userId,
                createdAt: { gte: dateRange.start, lte: dateRange.end }
            },
            select: {
                createdAt: true,
                status: true,
                completedAt: true
            },
            orderBy: { createdAt: 'asc' }
        });
        const dailyData = new Map();
        const currentDate = new Date(dateRange.start);
        while (currentDate <= dateRange.end) {
            const dateStr = currentDate.toISOString().split('T')[0];
            dailyData.set(dateStr, { count: 0, completedCount: 0 });
            currentDate.setDate(currentDate.getDate() + 1);
        }
        for (const analysis of analyses) {
            const createdDate = analysis.createdAt.toISOString().split('T')[0];
            const data = dailyData.get(createdDate);
            if (data) {
                data.count++;
                if (analysis.status === 'completed') {
                    data.completedCount++;
                }
            }
        }
        return Array.from(dailyData.entries()).map(([date, data]) => ({
            date,
            count: data.count,
            completedCount: data.completedCount
        }));
    }
    async getDailyRiskTrends(userId, dateRange) {
        const analyses = await prisma.documentAnalysis.findMany({
            where: {
                userId,
                status: 'completed',
                completedAt: { gte: dateRange.start, lte: dateRange.end },
                overallRiskScore: { not: null }
            },
            select: {
                completedAt: true,
                overallRiskScore: true
            }
        });
        const dailyData = new Map();
        for (const analysis of analyses) {
            if (!analysis.completedAt)
                continue;
            const date = analysis.completedAt.toISOString().split('T')[0];
            const riskScore = analysis.overallRiskScore?.toNumber() || 0;
            if (!dailyData.has(date)) {
                dailyData.set(date, { totalRisk: 0, count: 0 });
            }
            const data = dailyData.get(date);
            data.totalRisk += riskScore;
            data.count++;
        }
        return Array.from(dailyData.entries()).map(([date, data]) => ({
            date,
            avgRiskScore: data.count > 0 ? data.totalRisk / data.count : 0,
            documentCount: data.count
        }));
    }
    async getCategoryTrends(userId, dateRange) {
        const findings = await prisma.analysisFinding.findMany({
            where: {
                analysis: {
                    userId,
                    status: 'completed',
                    completedAt: { gte: dateRange.start, lte: dateRange.end }
                }
            },
            select: {
                category: true,
                createdAt: true
            }
        });
        const categoryData = new Map();
        for (const finding of findings) {
            const category = finding.category;
            const date = finding.createdAt.toISOString().split('T')[0];
            if (!categoryData.has(category)) {
                categoryData.set(category, new Map());
            }
            const categoryMap = categoryData.get(category);
            categoryMap.set(date, (categoryMap.get(date) || 0) + 1);
        }
        return Array.from(categoryData.entries())
            .map(([category, dateMap]) => ({
            category,
            data: Array.from(dateMap.entries()).map(([date, count]) => ({ date, count }))
        }))
            .slice(0, 5);
    }
    async getPerformanceMetrics(userId, dateRange) {
        const [avgProcessingTime, successRate, queueStatus] = await Promise.all([
            this.getAvgProcessingTime(userId, dateRange),
            this.getSuccessRate(userId, dateRange),
            this.getQueueStatus()
        ]);
        return {
            avgProcessingTime,
            successRate,
            queueStatus,
            systemHealth: {
                status: 'healthy',
                issues: [],
                uptime: 99.9
            }
        };
    }
    async getAvgProcessingTime(userId, dateRange) {
        const result = await prisma.documentAnalysis.aggregate({
            where: {
                userId,
                status: 'completed',
                completedAt: { gte: dateRange.start, lte: dateRange.end },
                processingTimeMs: { not: null }
            },
            _avg: { processingTimeMs: true }
        });
        return result._avg.processingTimeMs?.toNumber() || 0;
    }
    async getSuccessRate(userId, dateRange) {
        const [total, completed] = await Promise.all([
            prisma.documentAnalysis.count({
                where: {
                    userId,
                    createdAt: { gte: dateRange.start, lte: dateRange.end }
                }
            }),
            prisma.documentAnalysis.count({
                where: {
                    userId,
                    status: 'completed',
                    createdAt: { gte: dateRange.start, lte: dateRange.end }
                }
            })
        ]);
        return total > 0 ? (completed / total) * 100 : 0;
    }
    async getQueueStatus() {
        return {
            pending: 0,
            processing: 0,
            avgWaitTime: 0
        };
    }
    async getInsights(userId, dateRange) {
        const insights = [];
        const stats = await this.analysisService.getAnalysisStats(userId);
        if (stats.avgRiskScore > 70) {
            insights.push({
                id: 'high-risk-trend',
                type: 'alert',
                title: 'High Risk Score Trend',
                description: `Your documents have an average risk score of ${Math.round(stats.avgRiskScore)}%, which is above the recommended threshold.`,
                priority: 'high',
                actionable: true,
                actionText: 'View Risk Analysis',
                actionUrl: '/dashboard/risk',
                createdAt: new Date()
            });
        }
        if (stats.completionRate < 80) {
            insights.push({
                id: 'low-completion-rate',
                type: 'recommendation',
                title: 'Analysis Completion Rate',
                description: `${Math.round(stats.completionRate)}% of your analyses complete successfully. Consider reviewing failed analyses.`,
                priority: 'medium',
                actionable: true,
                actionText: 'View Failed Analyses',
                actionUrl: '/dashboard/analyses?status=failed',
                createdAt: new Date()
            });
        }
        return insights;
    }
    async getUsageData(userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { subscription: true }
        });
        const planLimits = {
            free: { analyses: 5, storage: 10 * 1024 * 1024, apiCalls: 100 },
            starter: { analyses: 100, storage: 100 * 1024 * 1024, apiCalls: 1000 },
            professional: { analyses: 500, storage: 500 * 1024 * 1024, apiCalls: 5000 },
            team: { analyses: 1000, storage: 1024 * 1024 * 1024, apiCalls: 10000 },
            enterprise: { analyses: 10000, storage: 10 * 1024 * 1024 * 1024, apiCalls: 100000 }
        };
        const planType = user?.subscription?.planType || 'free';
        const limits = planLimits[planType] || planLimits.free;
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const [analysisCount, storageUsed] = await Promise.all([
            prisma.documentAnalysis.count({
                where: {
                    userId,
                    createdAt: { gte: startOfMonth }
                }
            }),
            prisma.document.aggregate({
                where: {
                    userId,
                    deletedAt: null
                },
                _sum: { characterCount: true }
            })
        ]);
        const current = {
            analyses: analysisCount,
            storage: (storageUsed._sum.characterCount || 0) * 2,
            apiCalls: analysisCount * 2
        };
        const resetDate = new Date(startOfMonth);
        resetDate.setMonth(resetDate.getMonth() + 1);
        return {
            current,
            limits,
            resetDate,
            utilizationPercentage: {
                analyses: (current.analyses / limits.analyses) * 100,
                storage: (current.storage / limits.storage) * 100,
                apiCalls: (current.apiCalls / limits.apiCalls) * 100
            }
        };
    }
    async getDocumentTypesAnalysis(userId, dateRange) {
        const documents = await prisma.document.findMany({
            where: {
                userId,
                createdAt: { gte: dateRange.start, lte: dateRange.end },
                deletedAt: null
            },
            include: {
                analyses: {
                    where: { status: 'completed' },
                    select: { overallRiskScore: true }
                }
            }
        });
        const typeStats = new Map();
        for (const doc of documents) {
            const type = doc.documentType;
            if (!typeStats.has(type)) {
                typeStats.set(type, {
                    count: 0,
                    riskScores: [],
                    recentCount: 0
                });
            }
            const stats = typeStats.get(type);
            stats.count++;
            for (const analysis of doc.analyses) {
                if (analysis.overallRiskScore) {
                    stats.riskScores.push(analysis.overallRiskScore.toNumber());
                }
            }
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            if (doc.createdAt >= weekAgo) {
                stats.recentCount++;
            }
        }
        return Array.from(typeStats.entries()).map(([type, stats]) => ({
            type,
            count: stats.count,
            avgRiskScore: stats.riskScores.length > 0 ?
                stats.riskScores.reduce((a, b) => a + b, 0) / stats.riskScores.length : 0,
            recentCount: stats.recentCount,
            trendDirection: this.calculateTrendDirection(stats.count, stats.recentCount)
        }));
    }
    async getComparisonData(userId, dateRange) {
        const prevPeriodStart = new Date(dateRange.start);
        const prevPeriodEnd = new Date(dateRange.end);
        const daysDiff = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));
        prevPeriodStart.setDate(prevPeriodStart.getDate() - daysDiff);
        prevPeriodEnd.setDate(prevPeriodEnd.getDate() - daysDiff);
        const [currentStats, prevStats] = await Promise.all([
            this.getOverviewStats(userId, dateRange),
            this.getOverviewStats(userId, { start: prevPeriodStart, end: prevPeriodEnd })
        ]);
        const changePercentage = {
            analyses: this.calculatePercentageChange(prevStats.totalAnalyses, currentStats.totalAnalyses),
            riskScore: this.calculatePercentageChange(prevStats.avgRiskScore, currentStats.avgRiskScore),
            completionRate: this.calculatePercentageChange(prevStats.completionRate, currentStats.completionRate)
        };
        return {
            prevPeriod: {
                totalAnalyses: prevStats.totalAnalyses,
                avgRiskScore: prevStats.avgRiskScore,
                completionRate: prevStats.completionRate,
                changePercentage
            },
            benchmarks: {
                industryAvgRiskScore: 45,
                teamAvgRiskScore: 42,
                userRanking: 150,
                totalUsers: 1000
            }
        };
    }
    calculatePercentageChange(oldValue, newValue) {
        if (oldValue === 0)
            return newValue > 0 ? 100 : 0;
        return Math.round(((newValue - oldValue) / oldValue) * 100);
    }
    convertToCSV(data) {
        const headers = ['Metric', 'Value'];
        const rows = [
            ['Total Analyses', data.summary.totalAnalyses],
            ['Completed Analyses', data.summary.completedAnalyses],
            ['Average Risk Score', data.summary.avgRiskScore],
            ['Completion Rate', data.summary.completionRate]
        ];
        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
    async getTeamOverviewStats(teamId, dateRange) {
        const [total, completed, pending, failed] = await Promise.all([
            prisma.documentAnalysis.count({
                where: {
                    user: { teamId },
                    createdAt: { gte: dateRange.start, lte: dateRange.end }
                }
            }),
            prisma.documentAnalysis.count({
                where: {
                    user: { teamId },
                    status: 'completed',
                    createdAt: { gte: dateRange.start, lte: dateRange.end }
                }
            }),
            prisma.documentAnalysis.count({
                where: {
                    user: { teamId },
                    status: 'pending',
                    createdAt: { gte: dateRange.start, lte: dateRange.end }
                }
            }),
            prisma.documentAnalysis.count({
                where: {
                    user: { teamId },
                    status: 'failed',
                    createdAt: { gte: dateRange.start, lte: dateRange.end }
                }
            })
        ]);
        return {
            totalAnalyses: total,
            completedAnalyses: completed,
            pendingAnalyses: pending,
            failedAnalyses: failed,
            avgRiskScore: 0,
            completionRate: total > 0 ? (completed / total) * 100 : 0,
            totalDocuments: 0,
            storageUsed: 0
        };
    }
    async getTeamRecentActivity(teamId, dateRange) {
        return [];
    }
    async getTeamRiskDistribution(teamId, dateRange) {
        return { minimal: 0, low: 0, moderate: 0, high: 0, critical: 0 };
    }
    async getTeamTopCategories(teamId, dateRange) {
        return [];
    }
    async getTeamTrends(teamId, dateRange) {
        return { analysisVolume: [], riskTrends: [], categoryTrends: [] };
    }
    async getTeamPerformanceMetrics(teamId, dateRange) {
        return {
            avgProcessingTime: 0,
            successRate: 0,
            queueStatus: { pending: 0, processing: 0, avgWaitTime: 0 },
            systemHealth: { status: 'healthy', issues: [], uptime: 99.9 }
        };
    }
    async getTeamInsights(teamId, dateRange) {
        return [];
    }
    async getTeamUsageData(teamId) {
        return {
            current: { analyses: 0, storage: 0, apiCalls: 0 },
            limits: { analyses: 1000, storage: 1024 * 1024 * 1024, apiCalls: 10000 },
            resetDate: new Date(),
            utilizationPercentage: { analyses: 0, storage: 0, apiCalls: 0 }
        };
    }
    async getTeamDocumentTypesAnalysis(teamId, dateRange) {
        return [];
    }
    async getTeamComparisonData(teamId, dateRange) {
        return {
            prevPeriod: {
                totalAnalyses: 0,
                avgRiskScore: 0,
                completionRate: 0,
                changePercentage: { analyses: 0, riskScore: 0, completionRate: 0 }
            },
            benchmarks: {}
        };
    }
}
exports.DashboardService = DashboardService;
exports.dashboardService = new DashboardService();
//# sourceMappingURL=dashboardService.js.map