import { createServiceLogger } from '@fineprintai/shared-logger';
import { analysisCache } from '@fineprintai/shared-cache';
import { PrismaClient } from '@prisma/client';
import { AnalysisService } from './analysis';

const logger = createServiceLogger('dashboard-service');
const prisma = new PrismaClient();

export interface DashboardData {
  // Overview stats
  overview: {
    totalAnalyses: number;
    completedAnalyses: number;
    pendingAnalyses: number;
    failedAnalyses: number;
    avgRiskScore: number;
    completionRate: number;
    totalDocuments: number;
    storageUsed: number; // in bytes
  };

  // Recent activity
  recentActivity: Array<{
    id: string;
    type: 'analysis_created' | 'analysis_completed' | 'document_uploaded' | 'report_generated';
    title: string;
    description: string;
    timestamp: Date;
    status?: string;
    metadata?: any;
  }>;

  // Risk distribution
  riskDistribution: {
    minimal: number;
    low: number;
    moderate: number;
    high: number;
    critical: number;
  };

  // Category analysis
  topCategories: Array<{
    category: string;
    count: number;
    avgSeverity: number;
    trendDirection: 'up' | 'down' | 'stable';
    trendPercentage: number;
  }>;

  // Time-based trends
  trends: {
    analysisVolume: Array<{
      date: string;
      count: number;
      completedCount: number;
    }>;
    riskTrends: Array<{
      date: string;
      avgRiskScore: number;
      documentCount: number;
    }>;
    categoryTrends: Array<{
      category: string;
      data: Array<{
        date: string;
        count: number;
      }>;
    }>;
  };

  // Performance metrics
  performance: {
    avgProcessingTime: number;
    successRate: number;
    queueStatus: {
      pending: number;
      processing: number;
      avgWaitTime: number;
    };
    systemHealth: {
      status: 'healthy' | 'warning' | 'critical';
      issues: string[];
      uptime: number;
    };
  };

  // User insights
  insights: Array<{
    id: string;
    type: 'recommendation' | 'alert' | 'trend' | 'achievement';
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    actionable: boolean;
    actionText?: string;
    actionUrl?: string;
    createdAt: Date;
  }>;

  // Quota and usage
  usage: {
    current: {
      analyses: number;
      storage: number;
      apiCalls: number;
    };
    limits: {
      analyses: number;
      storage: number;
      apiCalls: number;
    };
    resetDate: Date;
    utilizationPercentage: {
      analyses: number;
      storage: number;
      apiCalls: number;
    };
  };

  // Document types analysis
  documentTypes: Array<{
    type: string;
    count: number;
    avgRiskScore: number;
    recentCount: number; // Last 30 days
    trendDirection: 'up' | 'down' | 'stable';
  }>;

  // Comparison data
  comparisons: {
    prevPeriod: {
      totalAnalyses: number;
      avgRiskScore: number;
      completionRate: number;
      changePercentage: {
        analyses: number;
        riskScore: number;
        completionRate: number;
      };
    };
    benchmarks: {
      industryAvgRiskScore?: number;
      teamAvgRiskScore?: number;
      userRanking?: number;
      totalUsers?: number;
    };
  };
}

export interface DashboardFilters {
  dateRange?: {
    start: Date;
    end: Date;
  };
  documentTypes?: string[];
  riskLevels?: string[];
  status?: string[];
  teamId?: string;
}

export class DashboardService {
  private analysisService: AnalysisService;

  constructor() {
    this.analysisService = new AnalysisService();
  }

  async getDashboardData(userId: string, filters?: DashboardFilters): Promise<DashboardData> {
    const cacheKey = `dashboard:${userId}:${JSON.stringify(filters)}`;
    
    try {
      // Check cache first (5 minute cache)
      const cached = await analysisCache.get<DashboardData>(cacheKey);
      if (cached) {
        logger.debug('Dashboard data found in cache', { userId });
        return cached;
      }

      logger.info('Generating dashboard data', { userId, filters });

      // Get date range for queries
      const dateRange = this.getDateRange(filters);

      // Fetch all dashboard data in parallel
      const [
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
      ] = await Promise.all([
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

      const dashboardData: DashboardData = {
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

      // Cache for 5 minutes
      await analysisCache.set(cacheKey, dashboardData, 300);

      logger.info('Dashboard data generated successfully', {
        userId,
        totalAnalyses: overview.totalAnalyses,
        avgRiskScore: overview.avgRiskScore
      });

      return dashboardData;

    } catch (error) {
      logger.error('Failed to generate dashboard data', {
        error: error.message,
        userId,
        filters
      });
      throw error;
    }
  }

  async getTeamDashboard(teamId: string, filters?: DashboardFilters): Promise<DashboardData> {
    try {
      logger.info('Generating team dashboard data', { teamId, filters });

      // Similar to user dashboard but aggregated for team
      const dateRange = this.getDateRange(filters);

      const [
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
      ] = await Promise.all([
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

    } catch (error) {
      logger.error('Failed to generate team dashboard data', {
        error: error.message,
        teamId,
        filters
      });
      throw error;
    }
  }

  async getAnalyticsReport(
    userId: string,
    type: 'weekly' | 'monthly' | 'quarterly',
    format: 'json' | 'csv' | 'pdf'
  ): Promise<{ data: any; format: string; filename: string }> {
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
      } else if (format === 'csv') {
        const csvData = this.convertToCSV(reportData);
        return {
          data: csvData,
          format: 'text/csv',
          filename: `${filename}.csv`
        };
      } else if (format === 'pdf') {
        // PDF generation would be implemented with a PDF library
        return {
          data: reportData, // Would be PDF buffer
          format: 'application/pdf',
          filename: `${filename}.pdf`
        };
      }

      throw new Error(`Unsupported format: ${format}`);

    } catch (error) {
      logger.error('Failed to generate analytics report', {
        error: error.message,
        userId,
        type,
        format
      });
      throw error;
    }
  }

  private getDateRange(filters?: DashboardFilters): { start: Date; end: Date } {
    if (filters?.dateRange) {
      return filters.dateRange;
    }

    // Default to last 30 days
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);

    return { start, end };
  }

  private getReportDateRange(type: 'weekly' | 'monthly' | 'quarterly'): { start: Date; end: Date } {
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

  private async getOverviewStats(userId: string, dateRange: { start: Date; end: Date }) {
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

  private async getDocumentStats(userId: string, dateRange: { start: Date; end: Date }) {
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
      storageUsed: (storageInfo._sum.characterCount || 0) * 2 // Rough bytes estimate
    };
  }

  private async getRecentActivity(userId: string, dateRange: { start: Date; end: Date }) {
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

    // Add analysis activities
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

    // Add document activities
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

    // Sort by timestamp and return top 15
    return activities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 15);
  }

  private async getRiskDistribution(userId: string, dateRange: { start: Date; end: Date }) {
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
      if (score >= 80) distribution.critical++;
      else if (score >= 60) distribution.high++;
      else if (score >= 40) distribution.moderate++;
      else if (score >= 20) distribution.low++;
      else distribution.minimal++;
    }

    return distribution;
  }

  private async getTopCategories(userId: string, dateRange: { start: Date; end: Date }) {
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
      
      // Convert severity to numeric for averaging
      const severityScore = { low: 1, medium: 2, high: 3, critical: 4 }[finding.severity] || 1;
      stats.severitySum += severityScore;

      // Count recent findings (last 7 days)
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

  private calculateTrendDirection(total: number, recent: number): 'up' | 'down' | 'stable' {
    const expectedRecent = total * (7 / 30); // Expected for 7 days out of 30
    const threshold = expectedRecent * 0.2; // 20% threshold

    if (recent > expectedRecent + threshold) return 'up';
    if (recent < expectedRecent - threshold) return 'down';
    return 'stable';
  }

  private calculateTrendPercentage(total: number, recent: number): number {
    const expectedRecent = total * (7 / 30);
    if (expectedRecent === 0) return 0;
    return Math.round(((recent - expectedRecent) / expectedRecent) * 100);
  }

  private async getTrends(userId: string, dateRange: { start: Date; end: Date }) {
    // Generate daily data points
    const dailyAnalyses = await this.getDailyAnalysisTrends(userId, dateRange);
    const dailyRiskTrends = await this.getDailyRiskTrends(userId, dateRange);
    const categoryTrends = await this.getCategoryTrends(userId, dateRange);

    return {
      analysisVolume: dailyAnalyses,
      riskTrends: dailyRiskTrends,
      categoryTrends
    };
  }

  private async getDailyAnalysisTrends(userId: string, dateRange: { start: Date; end: Date }) {
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
    
    // Initialize all dates in range
    const currentDate = new Date(dateRange.start);
    while (currentDate <= dateRange.end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      dailyData.set(dateStr, { count: 0, completedCount: 0 });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Populate with actual data
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

  private async getDailyRiskTrends(userId: string, dateRange: { start: Date; end: Date }) {
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
      if (!analysis.completedAt) continue;
      
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

  private async getCategoryTrends(userId: string, dateRange: { start: Date; end: Date }) {
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

    // Convert to array format and get top categories
    return Array.from(categoryData.entries())
      .map(([category, dateMap]) => ({
        category,
        data: Array.from(dateMap.entries()).map(([date, count]) => ({ date, count }))
      }))
      .slice(0, 5); // Top 5 categories
  }

  private async getPerformanceMetrics(userId: string, dateRange: { start: Date; end: Date }) {
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
        status: 'healthy' as const,
        issues: [],
        uptime: 99.9
      }
    };
  }

  private async getAvgProcessingTime(userId: string, dateRange: { start: Date; end: Date }): Promise<number> {
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

  private async getSuccessRate(userId: string, dateRange: { start: Date; end: Date }): Promise<number> {
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

  private async getQueueStatus() {
    // This would integrate with your queue system
    return {
      pending: 0,
      processing: 0,
      avgWaitTime: 0
    };
  }

  private async getInsights(userId: string, dateRange: { start: Date; end: Date }) {
    const insights = [];

    // Generate insights based on user data
    const stats = await this.analysisService.getAnalysisStats(userId);
    
    if (stats.avgRiskScore > 70) {
      insights.push({
        id: 'high-risk-trend',
        type: 'alert' as const,
        title: 'High Risk Score Trend',
        description: `Your documents have an average risk score of ${Math.round(stats.avgRiskScore)}%, which is above the recommended threshold.`,
        priority: 'high' as const,
        actionable: true,
        actionText: 'View Risk Analysis',
        actionUrl: '/dashboard/risk',
        createdAt: new Date()
      });
    }

    if (stats.completionRate < 80) {
      insights.push({
        id: 'low-completion-rate',
        type: 'recommendation' as const,
        title: 'Analysis Completion Rate',
        description: `${Math.round(stats.completionRate)}% of your analyses complete successfully. Consider reviewing failed analyses.`,
        priority: 'medium' as const,
        actionable: true,
        actionText: 'View Failed Analyses',
        actionUrl: '/dashboard/analyses?status=failed',
        createdAt: new Date()
      });
    }

    return insights;
  }

  private async getUsageData(userId: string) {
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

    // Get current usage
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
      apiCalls: analysisCount * 2 // Rough estimate
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

  private async getDocumentTypesAnalysis(userId: string, dateRange: { start: Date; end: Date }) {
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

      // Add risk scores
      for (const analysis of doc.analyses) {
        if (analysis.overallRiskScore) {
          stats.riskScores.push(analysis.overallRiskScore.toNumber());
        }
      }

      // Count recent documents (last 7 days)
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

  private async getComparisonData(userId: string, dateRange: { start: Date; end: Date }) {
    // Get previous period data
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
        // These would come from aggregated data across all users
        industryAvgRiskScore: 45,
        teamAvgRiskScore: 42,
        userRanking: 150,
        totalUsers: 1000
      }
    };
  }

  private calculatePercentageChange(oldValue: number, newValue: number): number {
    if (oldValue === 0) return newValue > 0 ? 100 : 0;
    return Math.round(((newValue - oldValue) / oldValue) * 100);
  }

  private convertToCSV(data: any): string {
    // Simple CSV conversion - in production you'd use a proper CSV library
    const headers = ['Metric', 'Value'];
    const rows = [
      ['Total Analyses', data.summary.totalAnalyses],
      ['Completed Analyses', data.summary.completedAnalyses],
      ['Average Risk Score', data.summary.avgRiskScore],
      ['Completion Rate', data.summary.completionRate]
    ];

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  // Team-specific methods (similar to user methods but aggregated)
  private async getTeamOverviewStats(teamId: string, dateRange: { start: Date; end: Date }) {
    // Implementation similar to getOverviewStats but for team
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
      avgRiskScore: 0, // Would calculate from team data
      completionRate: total > 0 ? (completed / total) * 100 : 0,
      totalDocuments: 0, // Would calculate from team data
      storageUsed: 0 // Would calculate from team data
    };
  }

  // Additional team methods would follow similar pattern...
  private async getTeamRecentActivity(teamId: string, dateRange: { start: Date; end: Date }) {
    return []; // Placeholder implementation
  }

  private async getTeamRiskDistribution(teamId: string, dateRange: { start: Date; end: Date }) {
    return { minimal: 0, low: 0, moderate: 0, high: 0, critical: 0 }; // Placeholder
  }

  private async getTeamTopCategories(teamId: string, dateRange: { start: Date; end: Date }) {
    return []; // Placeholder implementation
  }

  private async getTeamTrends(teamId: string, dateRange: { start: Date; end: Date }) {
    return { analysisVolume: [], riskTrends: [], categoryTrends: [] }; // Placeholder
  }

  private async getTeamPerformanceMetrics(teamId: string, dateRange: { start: Date; end: Date }) {
    return {
      avgProcessingTime: 0,
      successRate: 0,
      queueStatus: { pending: 0, processing: 0, avgWaitTime: 0 },
      systemHealth: { status: 'healthy' as const, issues: [], uptime: 99.9 }
    };
  }

  private async getTeamInsights(teamId: string, dateRange: { start: Date; end: Date }) {
    return []; // Placeholder implementation
  }

  private async getTeamUsageData(teamId: string) {
    return {
      current: { analyses: 0, storage: 0, apiCalls: 0 },
      limits: { analyses: 1000, storage: 1024 * 1024 * 1024, apiCalls: 10000 },
      resetDate: new Date(),
      utilizationPercentage: { analyses: 0, storage: 0, apiCalls: 0 }
    };
  }

  private async getTeamDocumentTypesAnalysis(teamId: string, dateRange: { start: Date; end: Date }) {
    return []; // Placeholder implementation
  }

  private async getTeamComparisonData(teamId: string, dateRange: { start: Date; end: Date }) {
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

// Singleton instance
export const dashboardService = new DashboardService();