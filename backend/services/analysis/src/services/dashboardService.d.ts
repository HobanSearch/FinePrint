export interface DashboardData {
    overview: {
        totalAnalyses: number;
        completedAnalyses: number;
        pendingAnalyses: number;
        failedAnalyses: number;
        avgRiskScore: number;
        completionRate: number;
        totalDocuments: number;
        storageUsed: number;
    };
    recentActivity: Array<{
        id: string;
        type: 'analysis_created' | 'analysis_completed' | 'document_uploaded' | 'report_generated';
        title: string;
        description: string;
        timestamp: Date;
        status?: string;
        metadata?: any;
    }>;
    riskDistribution: {
        minimal: number;
        low: number;
        moderate: number;
        high: number;
        critical: number;
    };
    topCategories: Array<{
        category: string;
        count: number;
        avgSeverity: number;
        trendDirection: 'up' | 'down' | 'stable';
        trendPercentage: number;
    }>;
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
    documentTypes: Array<{
        type: string;
        count: number;
        avgRiskScore: number;
        recentCount: number;
        trendDirection: 'up' | 'down' | 'stable';
    }>;
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
export declare class DashboardService {
    private analysisService;
    constructor();
    getDashboardData(userId: string, filters?: DashboardFilters): Promise<DashboardData>;
    getTeamDashboard(teamId: string, filters?: DashboardFilters): Promise<DashboardData>;
    getAnalyticsReport(userId: string, type: 'weekly' | 'monthly' | 'quarterly', format: 'json' | 'csv' | 'pdf'): Promise<{
        data: any;
        format: string;
        filename: string;
    }>;
    private getDateRange;
    private getReportDateRange;
    private getOverviewStats;
    private getDocumentStats;
    private getRecentActivity;
    private getRiskDistribution;
    private getTopCategories;
    private calculateTrendDirection;
    private calculateTrendPercentage;
    private getTrends;
    private getDailyAnalysisTrends;
    private getDailyRiskTrends;
    private getCategoryTrends;
    private getPerformanceMetrics;
    private getAvgProcessingTime;
    private getSuccessRate;
    private getQueueStatus;
    private getInsights;
    private getUsageData;
    private getDocumentTypesAnalysis;
    private getComparisonData;
    private calculatePercentageChange;
    private convertToCSV;
    private getTeamOverviewStats;
    private getTeamRecentActivity;
    private getTeamRiskDistribution;
    private getTeamTopCategories;
    private getTeamTrends;
    private getTeamPerformanceMetrics;
    private getTeamInsights;
    private getTeamUsageData;
    private getTeamDocumentTypesAnalysis;
    private getTeamComparisonData;
}
export declare const dashboardService: DashboardService;
//# sourceMappingURL=dashboardService.d.ts.map