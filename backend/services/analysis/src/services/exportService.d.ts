export interface ExportRequest {
    type: 'analysis' | 'findings' | 'dashboard' | 'compliance' | 'bulk';
    format: 'pdf' | 'json' | 'csv' | 'xlsx' | 'xml' | 'zip';
    userId: string;
    teamId?: string;
    analysisIds?: string[];
    documentIds?: string[];
    dateRange?: {
        start: Date;
        end: Date;
    };
    filters?: {
        documentTypes?: string[];
        riskLevels?: ('minimal' | 'low' | 'moderate' | 'high' | 'critical')[];
        categories?: string[];
        severities?: ('low' | 'medium' | 'high' | 'critical')[];
        status?: ('pending' | 'processing' | 'completed' | 'failed')[];
    };
    options?: {
        includeMetadata?: boolean;
        includeRawData?: boolean;
        includeCharts?: boolean;
        includeRecommendations?: boolean;
        template?: string;
        customFields?: string[];
        groupBy?: 'document' | 'category' | 'severity' | 'date';
        sortBy?: 'date' | 'risk' | 'title' | 'type';
        sortOrder?: 'asc' | 'desc';
        compression?: boolean;
        password?: string;
    };
    templateOptions?: {
        logoUrl?: string;
        companyName?: string;
        colors?: {
            primary: string;
            secondary: string;
            accent: string;
        };
        fonts?: {
            heading: string;
            body: string;
        };
        layout?: 'portrait' | 'landscape';
        pageSize?: 'A4' | 'Letter' | 'Legal';
    };
}
export interface ExportResult {
    id: string;
    type: string;
    format: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    downloadUrl: string;
    expiresAt: Date;
    recordCount: number;
    processingTime: number;
    status: 'completed' | 'failed';
    errorMessage?: string;
    createdAt: Date;
    metadata: {
        userId: string;
        teamId?: string;
        filters?: any;
        options?: any;
    };
}
export interface ExportTemplate {
    id: string;
    name: string;
    description: string;
    type: string;
    format: string;
    template: any;
    isDefault: boolean;
    isPublic: boolean;
    userId?: string;
    teamId?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare class ExportService {
    private analysisService;
    private readonly EXPORTS_DIR;
    private readonly TEMPLATES_DIR;
    constructor();
    exportData(request: ExportRequest): Promise<ExportResult>;
    getExport(exportId: string, userId: string): Promise<ExportResult | null>;
    listUserExports(userId: string, options?: {
        page?: number;
        limit?: number;
        type?: string;
        format?: string;
        status?: string;
    }): Promise<{
        exports: ExportResult[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    deleteExport(exportId: string, userId: string): Promise<boolean>;
    createTemplate(template: Omit<ExportTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<ExportTemplate>;
    getTemplates(userId: string, options?: {
        type?: string;
        format?: string;
        includePublic?: boolean;
    }): Promise<ExportTemplate[]>;
    bulkExport(request: ExportRequest & {
        exportAll: boolean;
    }): Promise<ExportResult>;
    private validateExportRequest;
    private gatherExportData;
    private gatherAnalysisExportData;
    private gatherFindingsExportData;
    private gatherDashboardExportData;
    private gatherComplianceExportData;
    private gatherBulkExportData;
    private getUserDocuments;
    private applyFilters;
    private applySorting;
    private generateExportFile;
    private generateJSONExport;
    private generateCSVExport;
    private generateXLSXExport;
    private generatePDFExport;
    private generateXMLExport;
    private formatDataForExport;
    private formatAnalysisData;
    private formatFindingsData;
    private formatDashboardData;
    private convertAnalysesToCSV;
    private convertFindingsToCSV;
    private addAnalysesToWorkbook;
    private addFindingsToWorkbook;
    private addDashboardToWorkbook;
    private createAnalysesWorkbook;
    private convertToXML;
    private objectToXML;
    private escapeXML;
    private generateFileName;
    private getFileExtension;
    private getRecordCount;
    private getRiskLevel;
    private groupBySeverity;
    private groupByCategory;
    private groupByDocument;
    private generateComplianceRecommendations;
    private storeExportMetadata;
    private storeFailedExport;
    private getMimeType;
    private mapDatabaseToExportResult;
    private mapDatabaseToTemplate;
    private ensureDirectoriesExist;
}
export declare const exportService: ExportService;
//# sourceMappingURL=exportService.d.ts.map