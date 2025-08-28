export declare class SalesAnalyticsService {
    private prisma;
    constructor();
    getDashboardMetrics(): Promise<{
        overview: any;
        pipeline: any;
        performance: any;
        trends: any;
    }>;
    private getOverviewMetrics;
    private getPipelineMetrics;
    private getPerformanceMetrics;
    private getTrendMetrics;
    private calculateAverageSalesCycle;
    private getConversionRates;
    private calculateGrowthRates;
    getLeadSourceAnalysis(): Promise<any>;
    getSalesRepPerformance(): Promise<any>;
    getActivityAnalysis(): Promise<any>;
    generateInsights(): Promise<string[]>;
    exportAnalyticsData(format?: 'json' | 'csv'): Promise<any>;
    private convertToCSV;
}
//# sourceMappingURL=sales-analytics-service.d.ts.map