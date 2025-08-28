import { createServiceLogger } from '@fineprintai/shared-logger';
import { analysisCache } from '@fineprintai/shared-cache';
import { PrismaClient } from '@prisma/client';
import { AnalysisService } from './analysis';
import { reportGenerator, ReportRequest } from './reportGenerator';
import { dashboardService } from './dashboardService';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import archiver from 'archiver';

const logger = createServiceLogger('export-service');
const prisma = new PrismaClient();

export interface ExportRequest {
  type: 'analysis' | 'findings' | 'dashboard' | 'compliance' | 'bulk';
  format: 'pdf' | 'json' | 'csv' | 'xlsx' | 'xml' | 'zip';
  userId: string;
  teamId?: string;
  
  // Data selection
  analysisIds?: string[];
  documentIds?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  
  // Filters
  filters?: {
    documentTypes?: string[];
    riskLevels?: ('minimal' | 'low' | 'moderate' | 'high' | 'critical')[];
    categories?: string[];
    severities?: ('low' | 'medium' | 'high' | 'critical')[];
    status?: ('pending' | 'processing' | 'completed' | 'failed')[];
  };
  
  // Export options
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
  
  // Templates and customization
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

export class ExportService {
  private analysisService: AnalysisService;
  private readonly EXPORTS_DIR = '/tmp/exports';
  private readonly TEMPLATES_DIR = path.join(__dirname, '../templates/exports');

  constructor() {
    this.analysisService = new AnalysisService();
    this.ensureDirectoriesExist();
  }

  async exportData(request: ExportRequest): Promise<ExportResult> {
    const exportId = crypto.randomUUID();
    const startTime = Date.now();

    logger.info('Starting data export', {
      exportId,
      type: request.type,
      format: request.format,
      userId: request.userId
    });

    try {
      // Validate request
      this.validateExportRequest(request);

      // Gather data based on export type
      const data = await this.gatherExportData(request);

      // Apply filters and sorting
      const filteredData = this.applyFilters(data, request.filters);
      const sortedData = this.applySorting(filteredData, request.options);

      // Generate export file
      const exportFile = await this.generateExportFile(exportId, request, sortedData);

      // Store export metadata
      const exportResult = await this.storeExportMetadata({
        id: exportId,
        type: request.type,
        format: request.format,
        fileName: exportFile.fileName,
        filePath: exportFile.filePath,
        fileSize: exportFile.fileSize,
        recordCount: this.getRecordCount(sortedData),
        processingTime: Date.now() - startTime,
        userId: request.userId,
        teamId: request.teamId,
        filters: request.filters,
        options: request.options
      });

      logger.info('Export completed successfully', {
        exportId,
        fileName: exportResult.fileName,
        fileSize: exportResult.fileSize,
        recordCount: exportResult.recordCount,
        processingTime: exportResult.processingTime
      });

      return exportResult;

    } catch (error) {
      logger.error('Export failed', {
        error: error.message,
        exportId,
        type: request.type,
        format: request.format,
        userId: request.userId
      });

      // Store failed export record
      await this.storeFailedExport(exportId, request, error.message, Date.now() - startTime);
      
      throw error;
    }
  }

  async getExport(exportId: string, userId: string): Promise<ExportResult | null> {
    try {
      const exportRecord = await prisma.export.findFirst({
        where: {
          id: exportId,
          userId,
          expiresAt: { gt: new Date() }
        }
      });

      if (!exportRecord) {
        return null;
      }

      return this.mapDatabaseToExportResult(exportRecord);

    } catch (error) {
      logger.error('Failed to get export', { error: error.message, exportId, userId });
      throw error;
    }
  }

  async listUserExports(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      type?: string;
      format?: string;
      status?: string;
    } = {}
  ): Promise<{
    exports: ExportResult[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const { page = 1, limit = 20 } = options;
      const skip = (page - 1) * limit;

      const where: any = {
        userId,
        expiresAt: { gt: new Date() }
      };

      if (options.type) where.type = options.type;
      if (options.format) where.format = options.format;
      if (options.status) where.status = options.status;

      const [exports, total] = await Promise.all([
        prisma.export.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.export.count({ where })
      ]);

      return {
        exports: exports.map(e => this.mapDatabaseToExportResult(e)),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      logger.error('Failed to list user exports', { error: error.message, userId });
      throw error;
    }
  }

  async deleteExport(exportId: string, userId: string): Promise<boolean> {
    try {
      const exportRecord = await prisma.export.findFirst({
        where: { id: exportId, userId }
      });

      if (!exportRecord) {
        return false;
      }

      // Delete file
      try {
        await fs.unlink(exportRecord.filePath);
      } catch (error) {
        logger.warn('Failed to delete export file', { error: error.message, filePath: exportRecord.filePath });
      }

      // Delete database record
      await prisma.export.delete({
        where: { id: exportId }
      });

      logger.info('Export deleted successfully', { exportId, userId });
      return true;

    } catch (error) {
      logger.error('Failed to delete export', { error: error.message, exportId, userId });
      throw error;
    }
  }

  async createTemplate(template: Omit<ExportTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<ExportTemplate> {
    try {
      const templateId = crypto.randomUUID();

      const created = await prisma.exportTemplate.create({
        data: {
          id: templateId,
          name: template.name,
          description: template.description,
          type: template.type,
          format: template.format,
          template: template.template,
          isDefault: template.isDefault,
          isPublic: template.isPublic,
          userId: template.userId,
          teamId: template.teamId
        }
      });

      logger.info('Export template created', { templateId, name: template.name });
      return this.mapDatabaseToTemplate(created);

    } catch (error) {
      logger.error('Failed to create export template', { error: error.message });
      throw error;
    }
  }

  async getTemplates(
    userId: string,
    options: {
      type?: string;
      format?: string;
      includePublic?: boolean;
    } = {}
  ): Promise<ExportTemplate[]> {
    try {
      const where: any = {
        OR: [
          { userId },
          ...(options.includePublic ? [{ isPublic: true }] : [])
        ]
      };

      if (options.type) where.type = options.type;
      if (options.format) where.format = options.format;

      const templates = await prisma.exportTemplate.findMany({
        where,
        orderBy: [
          { isDefault: 'desc' },
          { name: 'asc' }
        ]
      });

      return templates.map(t => this.mapDatabaseToTemplate(t));

    } catch (error) {
      logger.error('Failed to get templates', { error: error.message, userId });
      throw error;
    }
  }

  async bulkExport(request: ExportRequest & { exportAll: boolean }): Promise<ExportResult> {
    const exportId = crypto.randomUUID();
    const startTime = Date.now();

    logger.info('Starting bulk export', {
      exportId,
      userId: request.userId,
      exportAll: request.exportAll
    });

    try {
      // Get all user data based on filters
      const allData = await this.gatherBulkExportData(request);

      // Create ZIP archive with multiple files
      const archivePath = path.join(this.EXPORTS_DIR, `bulk-export-${exportId}.zip`);
      const archive = archiver('zip', { zlib: { level: 9 } });
      const stream = fs.createWriteStream(archivePath);

      archive.pipe(stream);

      // Add analyses export
      if (allData.analyses.length > 0) {
        const analysesData = this.formatDataForExport('analysis', allData.analyses, request);
        archive.append(JSON.stringify(analysesData, null, 2), { name: 'analyses.json' });
        
        if (request.format === 'xlsx') {
          const workbook = this.createAnalysesWorkbook(allData.analyses);
          const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
          archive.append(buffer, { name: 'analyses.xlsx' });
        }
      }

      // Add findings export
      if (allData.findings.length > 0) {
        const findingsData = this.formatDataForExport('findings', allData.findings, request);
        archive.append(JSON.stringify(findingsData, null, 2), { name: 'findings.json' });
        
        if (request.format === 'csv') {
          const csvData = this.convertFindingsToCSV(allData.findings);
          archive.append(csvData, { name: 'findings.csv' });
        }
      }

      // Add documents export
      if (allData.documents.length > 0) {
        const documentsData = this.formatDataForExport('documents', allData.documents, request);
        archive.append(JSON.stringify(documentsData, null, 2), { name: 'documents.json' });
      }

      // Add dashboard data
      if (allData.dashboard) {
        archive.append(JSON.stringify(allData.dashboard, null, 2), { name: 'dashboard.json' });
      }

      // Add metadata
      const metadata = {
        exportId,
        exportedAt: new Date(),
        userId: request.userId,
        totalRecords: {
          analyses: allData.analyses.length,
          findings: allData.findings.length,
          documents: allData.documents.length
        },
        filters: request.filters,
        options: request.options
      };
      archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

      await archive.finalize();

      // Wait for archive to complete
      await new Promise((resolve, reject) => {
        stream.on('close', resolve);
        stream.on('error', reject);
      });

      const stats = await fs.stat(archivePath);

      // Store export metadata
      const exportResult = await this.storeExportMetadata({
        id: exportId,
        type: 'bulk',
        format: 'zip',
        fileName: `bulk-export-${exportId}.zip`,
        filePath: archivePath,
        fileSize: stats.size,
        recordCount: allData.analyses.length + allData.findings.length + allData.documents.length,
        processingTime: Date.now() - startTime,
        userId: request.userId,
        teamId: request.teamId,
        filters: request.filters,
        options: request.options
      });

      logger.info('Bulk export completed', {
        exportId,
        fileSize: stats.size,
        totalRecords: exportResult.recordCount,
        processingTime: exportResult.processingTime
      });

      return exportResult;

    } catch (error) {
      logger.error('Bulk export failed', { error: error.message, exportId });
      throw error;
    }
  }

  private validateExportRequest(request: ExportRequest): void {
    if (!request.userId) {
      throw new Error('User ID is required');
    }

    if (!['analysis', 'findings', 'dashboard', 'compliance', 'bulk'].includes(request.type)) {
      throw new Error('Invalid export type');
    }

    if (!['pdf', 'json', 'csv', 'xlsx', 'xml', 'zip'].includes(request.format)) {
      throw new Error('Invalid export format');
    }

    if (request.type === 'analysis' && (!request.analysisIds || request.analysisIds.length === 0)) {
      if (!request.dateRange && !request.filters) {
        throw new Error('Analysis IDs, date range, or filters are required for analysis exports');
      }
    }
  }

  private async gatherExportData(request: ExportRequest): Promise<any> {
    switch (request.type) {
      case 'analysis':
        return this.gatherAnalysisExportData(request);
      case 'findings':
        return this.gatherFindingsExportData(request);
      case 'dashboard':
        return this.gatherDashboardExportData(request);
      case 'compliance':
        return this.gatherComplianceExportData(request);
      case 'bulk':
        return this.gatherBulkExportData(request);
      default:
        throw new Error(`Unsupported export type: ${request.type}`);
    }
  }

  private async gatherAnalysisExportData(request: ExportRequest): Promise<any> {
    let analyses = [];

    if (request.analysisIds && request.analysisIds.length > 0) {
      // Export specific analyses
      for (const analysisId of request.analysisIds) {
        const analysis = await this.analysisService.getAnalysisById(analysisId, request.userId);
        if (analysis) {
          analyses.push(analysis);
        }
      }
    } else {
      // Export based on filters and date range
      const result = await this.analysisService.getUserAnalyses(request.userId, {
        page: 1,
        limit: 1000, // Large limit for export
        status: request.filters?.status?.[0]
      });
      analyses = result.analyses;
    }

    // Get document details
    const documentIds = [...new Set(analyses.map(a => a.documentId))];
    const documents = await prisma.document.findMany({
      where: {
        id: { in: documentIds },
        userId: request.userId
      }
    });

    const documentMap = new Map(documents.map(d => [d.id, d]));

    return {
      analyses: analyses.map(analysis => ({
        ...analysis,
        document: documentMap.get(analysis.documentId)
      })),
      summary: {
        totalAnalyses: analyses.length,
        avgRiskScore: analyses.reduce((sum, a) => sum + (a.overallRiskScore || 0), 0) / analyses.length,
        completedAnalyses: analyses.filter(a => a.status === 'completed').length
      }
    };
  }

  private async gatherFindingsExportData(request: ExportRequest): Promise<any> {
    const where: any = {
      analysis: { userId: request.userId }
    };

    if (request.filters?.categories) {
      where.category = { in: request.filters.categories };
    }

    if (request.filters?.severities) {
      where.severity = { in: request.filters.severities };
    }

    if (request.analysisIds) {
      where.analysisId = { in: request.analysisIds };
    }

    const findings = await prisma.analysisFinding.findMany({
      where,
      include: {
        analysis: {
          include: {
            document: {
              select: {
                id: true,
                title: true,
                documentType: true
              }
            }
          }
        }
      },
      orderBy: { severity: 'desc' }
    });

    return {
      findings,
      summary: {
        totalFindings: findings.length,
        bySeverity: this.groupBySeverity(findings),
        byCategory: this.groupByCategory(findings)
      }
    };
  }

  private async gatherDashboardExportData(request: ExportRequest): Promise<any> {
    const dashboardData = await dashboardService.getDashboardData(
      request.userId,
      request.dateRange ? { dateRange: request.dateRange } : undefined
    );

    return {
      dashboard: dashboardData,
      exportedAt: new Date(),
      period: request.dateRange
    };
  }

  private async gatherComplianceExportData(request: ExportRequest): Promise<any> {
    // Get compliance-related findings
    const complianceCategories = [
      'Data Privacy',
      'User Rights',
      'Regulatory Compliance',
      'GDPR',
      'CCPA',
      'COPPA'
    ];

    const findings = await prisma.analysisFinding.findMany({
      where: {
        analysis: { userId: request.userId },
        category: { in: complianceCategories }
      },
      include: {
        analysis: {
          include: {
            document: true
          }
        }
      }
    });

    const complianceReport = {
      totalFindings: findings.length,
      criticalIssues: findings.filter(f => f.severity === 'critical').length,
      highIssues: findings.filter(f => f.severity === 'high').length,
      byCategory: this.groupByCategory(findings),
      byDocument: this.groupByDocument(findings),
      recommendations: this.generateComplianceRecommendations(findings)
    };

    return {
      findings,
      report: complianceReport,
      exportedAt: new Date()
    };
  }

  private async gatherBulkExportData(request: ExportRequest): Promise<any> {
    const [analyses, findings, documents, dashboard] = await Promise.all([
      this.gatherAnalysisExportData({ ...request, type: 'analysis' }),
      this.gatherFindingsExportData({ ...request, type: 'findings' }),
      this.getUserDocuments(request.userId, request.filters),
      this.gatherDashboardExportData({ ...request, type: 'dashboard' })
    ]);

    return {
      analyses: analyses.analyses || [],
      findings: findings.findings || [],
      documents,
      dashboard: dashboard.dashboard
    };
  }

  private async getUserDocuments(userId: string, filters?: any): Promise<any[]> {
    const where: any = {
      userId,
      deletedAt: null
    };

    if (filters?.documentTypes) {
      where.documentType = { in: filters.documentTypes };
    }

    return await prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 1000 // Limit for performance
    });
  }

  private applyFilters(data: any, filters?: ExportRequest['filters']): any {
    if (!filters) return data;

    // Apply filters based on data structure
    if (data.analyses) {
      if (filters.documentTypes) {
        data.analyses = data.analyses.filter((a: any) => 
          filters.documentTypes!.includes(a.document?.documentType)
        );
      }

      if (filters.riskLevels) {
        data.analyses = data.analyses.filter((a: any) => {
          const riskLevel = this.getRiskLevel(a.overallRiskScore || 0);
          return filters.riskLevels!.includes(riskLevel);
        });
      }

      if (filters.status) {
        data.analyses = data.analyses.filter((a: any) => 
          filters.status!.includes(a.status)
        );
      }
    }

    if (data.findings) {
      if (filters.categories) {
        data.findings = data.findings.filter((f: any) => 
          filters.categories!.includes(f.category)
        );
      }

      if (filters.severities) {
        data.findings = data.findings.filter((f: any) => 
          filters.severities!.includes(f.severity)
        );
      }
    }

    return data;
  }

  private applySorting(data: any, options?: ExportRequest['options']): any {
    if (!options?.sortBy) return data;

    const sortOrder = options.sortOrder || 'desc';
    const sortMultiplier = sortOrder === 'asc' ? 1 : -1;

    if (data.analyses) {
      data.analyses.sort((a: any, b: any) => {
        switch (options.sortBy) {
          case 'date':
            return (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) * sortMultiplier;
          case 'risk':
            return ((b.overallRiskScore || 0) - (a.overallRiskScore || 0)) * sortMultiplier;
          case 'title':
            return (a.document?.title || '').localeCompare(b.document?.title || '') * sortMultiplier;
          case 'type':
            return (a.document?.documentType || '').localeCompare(b.document?.documentType || '') * sortMultiplier;
          default:
            return 0;
        }
      });
    }

    return data;
  }

  private async generateExportFile(
    exportId: string,
    request: ExportRequest,
    data: any
  ): Promise<{ fileName: string; filePath: string; fileSize: number }> {
    const fileName = this.generateFileName(request, exportId);
    const filePath = path.join(this.EXPORTS_DIR, fileName);

    switch (request.format) {
      case 'json':
        await this.generateJSONExport(filePath, data, request);
        break;
      case 'csv':
        await this.generateCSVExport(filePath, data, request);
        break;
      case 'xlsx':
        await this.generateXLSXExport(filePath, data, request);
        break;
      case 'pdf':
        await this.generatePDFExport(filePath, data, request);
        break;
      case 'xml':
        await this.generateXMLExport(filePath, data, request);
        break;
      default:
        throw new Error(`Unsupported format: ${request.format}`);
    }

    const stats = await fs.stat(filePath);
    return {
      fileName,
      filePath,
      fileSize: stats.size
    };
  }

  private async generateJSONExport(filePath: string, data: any, request: ExportRequest): Promise<void> {
    const exportData = {
      exportMetadata: {
        type: request.type,
        format: request.format,
        exportedAt: new Date(),
        userId: request.userId,
        filters: request.filters,
        options: request.options
      },
      data: this.formatDataForExport(request.type, data, request)
    };

    await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));
  }

  private async generateCSVExport(filePath: string, data: any, request: ExportRequest): Promise<void> {
    let csvContent = '';

    switch (request.type) {
      case 'analysis':
        csvContent = this.convertAnalysesToCSV(data.analyses || []);
        break;
      case 'findings':
        csvContent = this.convertFindingsToCSV(data.findings || []);
        break;
      default:
        throw new Error(`CSV export not supported for type: ${request.type}`);
    }

    await fs.writeFile(filePath, csvContent);
  }

  private async generateXLSXExport(filePath: string, data: any, request: ExportRequest): Promise<void> {
    const workbook = XLSX.utils.book_new();

    switch (request.type) {
      case 'analysis':
        this.addAnalysesToWorkbook(workbook, data.analyses || []);
        break;
      case 'findings':
        this.addFindingsToWorkbook(workbook, data.findings || []);
        break;
      case 'dashboard':
        this.addDashboardToWorkbook(workbook, data.dashboard);
        break;
      default:
        const sheet = XLSX.utils.json_to_sheet([data]);
        XLSX.utils.book_append_sheet(workbook, sheet, 'Data');
    }

    XLSX.writeFile(workbook, filePath);
  }

  private async generatePDFExport(filePath: string, data: any, request: ExportRequest): Promise<void> {
    // Use the report generator for PDF exports
    const reportRequest: ReportRequest = {
      type: request.type as any,
      format: 'pdf',
      userId: request.userId,
      teamId: request.teamId,
      analysisIds: request.analysisIds,
      dateRange: request.dateRange,
      options: {
        includeCharts: request.options?.includeCharts,
        includeRawData: request.options?.includeRawData,
        includeRecommendations: request.options?.includeRecommendations,
        branding: request.templateOptions ? {
          companyName: request.templateOptions.companyName,
          colors: request.templateOptions.colors
        } : undefined
      }
    };

    const report = await reportGenerator.generateReport(reportRequest);
    
    // Copy the generated report to the export path
    await fs.copyFile(report.filePath, filePath);
  }

  private async generateXMLExport(filePath: string, data: any, request: ExportRequest): Promise<void> {
    const xmlData = this.convertToXML(data, request.type);
    await fs.writeFile(filePath, xmlData);
  }

  private formatDataForExport(type: string, data: any, request: ExportRequest): any {
    switch (type) {
      case 'analysis':
        return this.formatAnalysisData(data, request.options);
      case 'findings':
        return this.formatFindingsData(data, request.options);
      case 'dashboard':
        return this.formatDashboardData(data, request.options);
      default:
        return data;
    }
  }

  private formatAnalysisData(data: any, options?: ExportRequest['options']): any {
    if (Array.isArray(data)) {
      return data.map(analysis => ({
        id: analysis.id,
        documentTitle: analysis.document?.title,
        documentType: analysis.document?.documentType,
        status: analysis.status,
        overallRiskScore: analysis.overallRiskScore,
        findingsCount: analysis.findings?.length || 0,
        executiveSummary: options?.includeRawData ? analysis.executiveSummary : undefined,
        keyFindings: analysis.keyFindings,
        recommendations: options?.includeRecommendations ? analysis.recommendations : undefined,
        createdAt: analysis.createdAt,
        completedAt: analysis.completedAt,
        ...(options?.includeMetadata && {
          processingTimeMs: analysis.processingTimeMs,
          modelUsed: analysis.modelUsed
        })
      }));
    }

    return data;
  }

  private formatFindingsData(data: any, options?: ExportRequest['options']): any {
    if (Array.isArray(data)) {
      return data.map(finding => ({
        id: finding.id,
        analysisId: finding.analysisId,
        documentTitle: finding.analysis?.document?.title,
        category: finding.category,
        title: finding.title,
        description: finding.description,
        severity: finding.severity,
        confidenceScore: finding.confidenceScore,
        textExcerpt: options?.includeRawData ? finding.textExcerpt : undefined,
        recommendation: options?.includeRecommendations ? finding.recommendation : undefined,
        impactExplanation: finding.impactExplanation,
        createdAt: finding.createdAt
      }));
    }

    return data;
  }

  private formatDashboardData(data: any, options?: ExportRequest['options']): any {
    return {
      overview: data.overview,
      riskDistribution: data.riskDistribution,
      topCategories: data.topCategories,
      trends: options?.includeCharts ? data.trends : undefined,
      performance: data.performance,
      insights: data.insights.slice(0, 10), // Limit insights
      usage: options?.includeMetadata ? data.usage : undefined
    };
  }

  private convertAnalysesToCSV(analyses: any[]): string {
    const headers = [
      'ID', 'Document Title', 'Document Type', 'Status', 'Risk Score',
      'Findings Count', 'Created At', 'Completed At'
    ];

    const rows = analyses.map(analysis => [
      analysis.id,
      analysis.document?.title || '',
      analysis.document?.documentType || '',
      analysis.status,
      analysis.overallRiskScore || 0,
      analysis.findings?.length || 0,
      analysis.createdAt,
      analysis.completedAt || ''
    ]);

    return [headers, ...rows].map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
  }

  private convertFindingsToCSV(findings: any[]): string {
    const headers = [
      'ID', 'Analysis ID', 'Document Title', 'Category', 'Title',
      'Severity', 'Confidence', 'Description', 'Recommendation'
    ];

    const rows = findings.map(finding => [
      finding.id,
      finding.analysisId,
      finding.analysis?.document?.title || '',
      finding.category,
      finding.title,
      finding.severity,
      finding.confidenceScore || 0,
      finding.description?.substring(0, 200) || '',
      finding.recommendation?.substring(0, 200) || ''
    ]);

    return [headers, ...rows].map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
  }

  private addAnalysesToWorkbook(workbook: XLSX.WorkBook, analyses: any[]): void {
    // Summary sheet
    const summaryData = [
      ['Total Analyses', analyses.length],
      ['Completed', analyses.filter(a => a.status === 'completed').length],
      ['Average Risk Score', Math.round(analyses.reduce((sum, a) => sum + (a.overallRiskScore || 0), 0) / analyses.length)]
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet([['Metric', 'Value'], ...summaryData]);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    // Analyses sheet
    const analysesData = analyses.map(analysis => ({
      'ID': analysis.id,
      'Document Title': analysis.document?.title || '',
      'Document Type': analysis.document?.documentType || '',
      'Status': analysis.status,
      'Risk Score': analysis.overallRiskScore || 0,
      'Findings': analysis.findings?.length || 0,
      'Created': analysis.createdAt,
      'Completed': analysis.completedAt || ''
    }));
    const analysesSheet = XLSX.utils.json_to_sheet(analysesData);
    XLSX.utils.book_append_sheet(workbook, analysesSheet, 'Analyses');
  }

  private addFindingsToWorkbook(workbook: XLSX.WorkBook, findings: any[]): void {
    const findingsData = findings.map(finding => ({
      'ID': finding.id,
      'Analysis ID': finding.analysisId,
      'Document': finding.analysis?.document?.title || '',
      'Category': finding.category,
      'Title': finding.title,
      'Severity': finding.severity,
      'Confidence': finding.confidenceScore || 0,
      'Description': finding.description?.substring(0, 100) || ''
    }));

    const findingsSheet = XLSX.utils.json_to_sheet(findingsData);
    XLSX.utils.book_append_sheet(workbook, findingsSheet, 'Findings');

    // Summary by category
    const categoryStats = this.groupByCategory(findings);
    const categoryData = Object.entries(categoryStats).map(([category, count]) => [category, count]);
    const categorySheet = XLSX.utils.aoa_to_sheet([['Category', 'Count'], ...categoryData]);
    XLSX.utils.book_append_sheet(workbook, categorySheet, 'By Category');
  }

  private addDashboardToWorkbook(workbook: XLSX.WorkBook, dashboard: any): void {
    // Overview
    const overviewData = Object.entries(dashboard.overview).map(([key, value]) => [key, value]);
    const overviewSheet = XLSX.utils.aoa_to_sheet([['Metric', 'Value'], ...overviewData]);
    XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Overview');

    // Risk distribution
    const riskData = Object.entries(dashboard.riskDistribution).map(([level, count]) => [level, count]);
    const riskSheet = XLSX.utils.aoa_to_sheet([['Risk Level', 'Count'], ...riskData]);
    XLSX.utils.book_append_sheet(workbook, riskSheet, 'Risk Distribution');

    // Top categories
    if (dashboard.topCategories.length > 0) {
      const categoriesSheet = XLSX.utils.json_to_sheet(dashboard.topCategories);
      XLSX.utils.book_append_sheet(workbook, categoriesSheet, 'Top Categories');
    }
  }

  private createAnalysesWorkbook(analyses: any[]): XLSX.WorkBook {
    const workbook = XLSX.utils.book_new();
    this.addAnalysesToWorkbook(workbook, analyses);
    return workbook;
  }

  private convertToXML(data: any, type: string): string {
    const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n';
    const rootElement = `<${type}_export>`;
    const rootElementClose = `</${type}_export>`;
    
    const xmlBody = this.objectToXML(data, type);
    
    return xmlHeader + rootElement + '\n' + xmlBody + '\n' + rootElementClose;
  }

  private objectToXML(obj: any, elementName: string, indent: string = '  '): string {
    if (typeof obj !== 'object' || obj === null) {
      return `${indent}<${elementName}>${this.escapeXML(String(obj))}</${elementName}>`;
    }

    if (Array.isArray(obj)) {
      return obj.map((item, index) => 
        this.objectToXML(item, `${elementName}_${index}`, indent)
      ).join('\n');
    }

    let xml = `${indent}<${elementName}>`;
    for (const [key, value] of Object.entries(obj)) {
      xml += '\n' + this.objectToXML(value, key, indent + '  ');
    }
    xml += `\n${indent}</${elementName}>`;
    
    return xml;
  }

  private escapeXML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private generateFileName(request: ExportRequest, exportId: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const extension = this.getFileExtension(request.format);
    return `${request.type}-export-${timestamp}-${exportId.substring(0, 8)}.${extension}`;
  }

  private getFileExtension(format: string): string {
    const extensions = {
      json: 'json',
      csv: 'csv',
      xlsx: 'xlsx',
      pdf: 'pdf',
      xml: 'xml',
      zip: 'zip'
    };
    return extensions[format] || 'txt';
  }

  private getRecordCount(data: any): number {
    if (data.analyses) return data.analyses.length;
    if (data.findings) return data.findings.length;
    if (data.documents) return data.documents.length;
    return 0;
  }

  private getRiskLevel(score: number): 'minimal' | 'low' | 'moderate' | 'high' | 'critical' {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'moderate';
    if (score >= 20) return 'low';
    return 'minimal';
  }

  private groupBySeverity(findings: any[]): { [severity: string]: number } {
    return findings.reduce((acc, finding) => {
      const severity = finding.severity;
      acc[severity] = (acc[severity] || 0) + 1;
      return acc;
    }, {});
  }

  private groupByCategory(findings: any[]): { [category: string]: number } {
    return findings.reduce((acc, finding) => {
      const category = finding.category;
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});
  }

  private groupByDocument(findings: any[]): { [documentId: string]: number } {
    return findings.reduce((acc, finding) => {
      const docId = finding.analysis?.document?.id || 'unknown';
      acc[docId] = (acc[docId] || 0) + 1;
      return acc;
    }, {});
  }

  private generateComplianceRecommendations(findings: any[]): string[] {
    const recommendations = [];
    
    const criticalFindings = findings.filter(f => f.severity === 'critical');
    if (criticalFindings.length > 0) {
      recommendations.push('Address all critical compliance issues immediately to avoid legal risks');
    }

    const privacyFindings = findings.filter(f => f.category.toLowerCase().includes('privacy'));
    if (privacyFindings.length > 5) {
      recommendations.push('Review and update privacy policies to ensure GDPR/CCPA compliance');
    }

    const dataFindings = findings.filter(f => f.category.toLowerCase().includes('data'));
    if (dataFindings.length > 3) {
      recommendations.push('Implement stronger data protection measures and user consent mechanisms');
    }

    return recommendations;
  }

  private async storeExportMetadata(data: {
    id: string;
    type: string;
    format: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    recordCount: number;
    processingTime: number;
    userId: string;
    teamId?: string;
    filters?: any;
    options?: any;
  }): Promise<ExportResult> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Exports expire in 7 days

    const exportRecord = await prisma.export.create({
      data: {
        id: data.id,
        type: data.type,
        format: data.format,
        fileName: data.fileName,
        filePath: data.filePath,
        fileSize: data.fileSize,
        mimeType: this.getMimeType(data.format),
        recordCount: data.recordCount,
        processingTime: data.processingTime,
        status: 'completed',
        userId: data.userId,
        teamId: data.teamId,
        expiresAt,
        metadata: {
          filters: data.filters,
          options: data.options
        }
      }
    });

    return this.mapDatabaseToExportResult(exportRecord);
  }

  private async storeFailedExport(
    exportId: string,
    request: ExportRequest,
    errorMessage: string,
    processingTime: number
  ): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1); // Failed exports expire in 1 day

    await prisma.export.create({
      data: {
        id: exportId,
        type: request.type,
        format: request.format,
        fileName: `failed-export-${exportId}`,
        filePath: '',
        fileSize: 0,
        mimeType: '',
        recordCount: 0,
        processingTime,
        status: 'failed',
        errorMessage,
        userId: request.userId,
        teamId: request.teamId,
        expiresAt,
        metadata: {
          filters: request.filters,
          options: request.options
        }
      }
    });
  }

  private getMimeType(format: string): string {
    const mimeTypes = {
      json: 'application/json',
      csv: 'text/csv',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf',
      xml: 'application/xml',
      zip: 'application/zip'
    };
    return mimeTypes[format] || 'application/octet-stream';
  }

  private mapDatabaseToExportResult(exportRecord: any): ExportResult {
    return {
      id: exportRecord.id,
      type: exportRecord.type,
      format: exportRecord.format,
      fileName: exportRecord.fileName,
      filePath: exportRecord.filePath,
      fileSize: exportRecord.fileSize,
      mimeType: exportRecord.mimeType,
      downloadUrl: `/api/exports/${exportRecord.id}/download`,
      expiresAt: exportRecord.expiresAt,
      recordCount: exportRecord.recordCount,
      processingTime: exportRecord.processingTime,
      status: exportRecord.status,
      errorMessage: exportRecord.errorMessage,
      createdAt: exportRecord.createdAt,
      metadata: {
        userId: exportRecord.userId,
        teamId: exportRecord.teamId,
        filters: exportRecord.metadata?.filters,
        options: exportRecord.metadata?.options
      }
    };
  }

  private mapDatabaseToTemplate(template: any): ExportTemplate {
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      type: template.type,
      format: template.format,
      template: template.template,
      isDefault: template.isDefault,
      isPublic: template.isPublic,
      userId: template.userId,
      teamId: template.teamId,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt
    };
  }

  private async ensureDirectoriesExist(): Promise<void> {
    try {
      await fs.mkdir(this.EXPORTS_DIR, { recursive: true });
      await fs.mkdir(this.TEMPLATES_DIR, { recursive: true });
    } catch (error) {
      logger.warn('Failed to create directories', { error: error.message });
    }
  }
}

// Singleton instance
export const exportService = new ExportService();