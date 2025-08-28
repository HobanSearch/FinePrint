export interface ReportRequest {
    type: 'analysis' | 'dashboard' | 'comparison' | 'compliance' | 'executive';
    format: 'pdf' | 'json' | 'csv' | 'xlsx' | 'html';
    userId: string;
    teamId?: string;
    analysisIds?: string[];
    dateRange?: {
        start: Date;
        end: Date;
    };
    options?: {
        includeCharts?: boolean;
        includeRawData?: boolean;
        includeRecommendations?: boolean;
        includeExecutiveSummary?: boolean;
        customSections?: string[];
        branding?: {
            companyName?: string;
            logo?: Buffer;
            colors?: {
                primary: string;
                secondary: string;
            };
        };
        language?: string;
        confidential?: boolean;
    };
}
export interface GeneratedReport {
    id: string;
    type: string;
    format: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    generatedAt: Date;
    expiresAt: Date;
    downloadUrl: string;
    metadata: {
        userId: string;
        teamId?: string;
        analysisCount?: number;
        dateRange?: {
            start: Date;
            end: Date;
        };
        options: any;
    };
}
export declare class ReportGenerator {
    private analysisService;
    private readonly REPORTS_DIR;
    private readonly TEMPLATE_DIR;
    constructor();
    generateReport(request: ReportRequest): Promise<GeneratedReport>;
    getReport(reportId: string, userId: string): Promise<GeneratedReport | null>;
    listUserReports(userId: string, options?: {
        page?: number;
        limit?: number;
        type?: string;
        format?: string;
    }): Promise<{
        reports: GeneratedReport[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    deleteReport(reportId: string, userId: string): Promise<boolean>;
    private validateRequest;
    private gatherReportData;
    private gatherAnalysisData;
    private gatherDashboardData;
    private gatherComparisonData;
    private gatherComplianceData;
    private gatherExecutiveData;
    private generateReportFile;
    private generatePDFReport;
    private addPDFHeader;
    private addAnalysisContentToPDF;
    private addDashboardContentToPDF;
    private addExecutiveContentToPDF;
    private addGenericContentToPDF;
    private addPDFFooter;
    private generateJSONReport;
    private generateCSVReport;
    private generateXLSXReport;
    private generateHTMLReport;
    private convertAnalysisDataToCSV;
    private convertDashboardDataToCSV;
    private addAnalysisDataToWorkbook;
    private addDashboardDataToWorkbook;
    private generateHTMLContent;
    private generateHTMLContentForType;
    private generateAnalysisHTML;
    private generateDashboardHTML;
    private generateExecutiveHTML;
    private getRiskClass;
    private getReportTitle;
    private generateFileName;
    private getFileExtension;
    private calculateComplianceRiskDistribution;
    private generateExecutiveRecommendations;
    private storeReportMetadata;
    private getMimeType;
    private mapDatabaseToReport;
    private ensureDirectoriesExist;
}
export declare const reportGenerator: ReportGenerator;
//# sourceMappingURL=reportGenerator.d.ts.map