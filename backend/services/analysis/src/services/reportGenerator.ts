import { createServiceLogger } from '@fineprintai/shared-logger';
import { analysisCache } from '@fineprintai/shared-cache';
import { PrismaClient } from '@prisma/client';
import { EnhancedAnalysisResult } from './enhancedAnalysis';
import { AnalysisService } from './analysis';
import { dashboardService } from './dashboardService';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { createObjectCsvWriter } from 'csv-writer';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const logger = createServiceLogger('report-generator');
const prisma = new PrismaClient();

export interface ReportRequest {
  type: 'analysis' | 'dashboard' | 'comparison' | 'compliance' | 'executive';
  format: 'pdf' | 'json' | 'csv' | 'xlsx' | 'html';
  userId: string;
  teamId?: string;
  
  // For analysis reports
  analysisIds?: string[];
  
  // For dashboard reports
  dateRange?: {
    start: Date;
    end: Date;
  };
  
  // Report options
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

export class ReportGenerator {
  private analysisService: AnalysisService;
  private readonly REPORTS_DIR = '/tmp/reports';
  private readonly TEMPLATE_DIR = path.join(__dirname, '../templates');

  constructor() {
    this.analysisService = new AnalysisService();
    this.ensureDirectoriesExist();
  }

  async generateReport(request: ReportRequest): Promise<GeneratedReport> {
    const reportId = crypto.randomUUID();
    const startTime = Date.now();

    logger.info('Starting report generation', {
      reportId,
      type: request.type,
      format: request.format,
      userId: request.userId
    });

    try {
      // Validate request
      this.validateRequest(request);

      // Gather data based on report type
      const data = await this.gatherReportData(request);

      // Generate report based on format
      const reportFile = await this.generateReportFile(reportId, request, data);

      // Store report metadata
      const report = await this.storeReportMetadata({
        id: reportId,
        type: request.type,
        format: request.format,
        fileName: reportFile.fileName,
        filePath: reportFile.filePath,
        fileSize: reportFile.fileSize,
        userId: request.userId,
        teamId: request.teamId,
        metadata: {
          analysisCount: request.analysisIds?.length,
          dateRange: request.dateRange,
          options: request.options
        }
      });

      logger.info('Report generated successfully', {
        reportId,
        fileName: report.fileName,
        fileSize: report.fileSize,
        processingTime: Date.now() - startTime
      });

      return report;

    } catch (error) {
      logger.error('Report generation failed', {
        error: error.message,
        reportId,
        type: request.type,
        format: request.format,
        userId: request.userId
      });
      throw error;
    }
  }

  async getReport(reportId: string, userId: string): Promise<GeneratedReport | null> {
    try {
      const report = await prisma.report.findFirst({
        where: {
          id: reportId,
          userId,
          expiresAt: { gt: new Date() }
        }
      });

      if (!report) {
        return null;
      }

      return this.mapDatabaseToReport(report);

    } catch (error) {
      logger.error('Failed to get report', { error: error.message, reportId, userId });
      throw error;
    }
  }

  async listUserReports(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      type?: string;
      format?: string;
    } = {}
  ): Promise<{
    reports: GeneratedReport[];
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

      const [reports, total] = await Promise.all([
        prisma.report.findMany({
          where,
          orderBy: { generatedAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.report.count({ where })
      ]);

      return {
        reports: reports.map(r => this.mapDatabaseToReport(r)),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      logger.error('Failed to list user reports', { error: error.message, userId });
      throw error;
    }
  }

  async deleteReport(reportId: string, userId: string): Promise<boolean> {
    try {
      const report = await prisma.report.findFirst({
        where: { id: reportId, userId }
      });

      if (!report) {
        return false;
      }

      // Delete file
      try {
        await fs.unlink(report.filePath);
      } catch (error) {
        logger.warn('Failed to delete report file', { error: error.message, filePath: report.filePath });
      }

      // Delete database record
      await prisma.report.delete({
        where: { id: reportId }
      });

      logger.info('Report deleted successfully', { reportId, userId });
      return true;

    } catch (error) {
      logger.error('Failed to delete report', { error: error.message, reportId, userId });
      throw error;
    }
  }

  private validateRequest(request: ReportRequest): void {
    if (!request.userId) {
      throw new Error('User ID is required');
    }

    if (request.type === 'analysis' && (!request.analysisIds || request.analysisIds.length === 0)) {
      throw new Error('Analysis IDs are required for analysis reports');
    }

    if (!['pdf', 'json', 'csv', 'xlsx', 'html'].includes(request.format)) {
      throw new Error('Unsupported report format');
    }

    if (!['analysis', 'dashboard', 'comparison', 'compliance', 'executive'].includes(request.type)) {
      throw new Error('Unsupported report type');
    }
  }

  private async gatherReportData(request: ReportRequest): Promise<any> {
    switch (request.type) {
      case 'analysis':
        return this.gatherAnalysisData(request);
      case 'dashboard':
        return this.gatherDashboardData(request);
      case 'comparison':
        return this.gatherComparisonData(request);
      case 'compliance':
        return this.gatherComplianceData(request);
      case 'executive':
        return this.gatherExecutiveData(request);
      default:
        throw new Error(`Unsupported report type: ${request.type}`);
    }
  }

  private async gatherAnalysisData(request: ReportRequest): Promise<any> {
    const analyses = [];
    
    for (const analysisId of request.analysisIds || []) {
      const analysis = await this.analysisService.getAnalysisById(analysisId, request.userId);
      if (analysis) {
        analyses.push(analysis);
      }
    }

    if (analyses.length === 0) {
      throw new Error('No valid analyses found');
    }

    // Get document details
    const documents = await prisma.document.findMany({
      where: {
        id: { in: analyses.map(a => a.documentId) },
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
        totalFindings: analyses.reduce((sum, a) => sum + (a.findings?.length || 0), 0),
        highRiskAnalyses: analyses.filter(a => (a.overallRiskScore || 0) >= 70).length
      },
      generatedAt: new Date(),
      metadata: {
        userId: request.userId,
        options: request.options
      }
    };
  }

  private async gatherDashboardData(request: ReportRequest): Promise<any> {
    const dateRange = request.dateRange || {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      end: new Date()
    };

    const dashboardData = await dashboardService.getDashboardData(request.userId, { dateRange });

    return {
      dashboard: dashboardData,
      period: dateRange,
      generatedAt: new Date(),
      metadata: {
        userId: request.userId,
        teamId: request.teamId,
        options: request.options
      }
    };
  }

  private async gatherComparisonData(request: ReportRequest): Promise<any> {
    // Implementation for comparison reports
    const dateRange = request.dateRange || {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      end: new Date()
    };

    const dashboardData = await dashboardService.getDashboardData(request.userId, { dateRange });

    return {
      comparison: dashboardData.comparisons,
      trends: dashboardData.trends,
      period: dateRange,
      generatedAt: new Date(),
      metadata: {
        userId: request.userId,
        options: request.options
      }
    };
  }

  private async gatherComplianceData(request: ReportRequest): Promise<any> {
    // Implementation for compliance reports
    const analyses = await prisma.documentAnalysis.findMany({
      where: {
        userId: request.userId,
        status: 'completed',
        ...(request.dateRange && {
          completedAt: {
            gte: request.dateRange.start,
            lte: request.dateRange.end
          }
        })
      },
      include: {
        document: true,
        findings: true
      }
    });

    const complianceFindings = analyses.flatMap(a => 
      a.findings.filter(f => 
        ['Data Privacy', 'User Rights', 'Regulatory Compliance'].includes(f.category)
      )
    );

    return {
      analyses,
      compliance: {
        totalChecks: analyses.length,
        complianceFindings: complianceFindings.length,
        criticalIssues: complianceFindings.filter(f => f.severity === 'critical').length,
        riskDistribution: this.calculateComplianceRiskDistribution(complianceFindings)
      },
      generatedAt: new Date(),
      metadata: {
        userId: request.userId,
        options: request.options
      }
    };
  }

  private async gatherExecutiveData(request: ReportRequest): Promise<any> {
    const dashboardData = await dashboardService.getDashboardData(request.userId, request.dateRange ? { dateRange: request.dateRange } : undefined);

    // Create executive summary
    const executiveSummary = {
      overview: dashboardData.overview,
      keyInsights: dashboardData.insights.slice(0, 5),
      riskSummary: {
        overallRisk: dashboardData.overview.avgRiskScore,
        riskDistribution: dashboardData.riskDistribution,
        topRisks: dashboardData.topCategories.slice(0, 3)
      },
      recommendations: this.generateExecutiveRecommendations(dashboardData),
      performance: {
        completionRate: dashboardData.overview.completionRate,
        avgProcessingTime: dashboardData.performance.avgProcessingTime,
        successRate: dashboardData.performance.successRate
      }
    };

    return {
      executive: executiveSummary,
      dashboard: dashboardData,
      generatedAt: new Date(),
      metadata: {
        userId: request.userId,
        options: request.options
      }
    };
  }

  private async generateReportFile(
    reportId: string,
    request: ReportRequest,
    data: any
  ): Promise<{ fileName: string; filePath: string; fileSize: number }> {
    const fileName = this.generateFileName(request, reportId);
    const filePath = path.join(this.REPORTS_DIR, fileName);

    switch (request.format) {
      case 'pdf':
        await this.generatePDFReport(filePath, request, data);
        break;
      case 'json':
        await this.generateJSONReport(filePath, request, data);
        break;
      case 'csv':
        await this.generateCSVReport(filePath, request, data);
        break;
      case 'xlsx':
        await this.generateXLSXReport(filePath, request, data);
        break;
      case 'html':
        await this.generateHTMLReport(filePath, request, data);
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

  private async generatePDFReport(filePath: string, request: ReportRequest, data: any): Promise<void> {
    const doc = new PDFDocument({
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    });

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Add header
    this.addPDFHeader(doc, request, data);

    // Add content based on report type
    switch (request.type) {
      case 'analysis':
        this.addAnalysisContentToPDF(doc, data);
        break;
      case 'dashboard':
        this.addDashboardContentToPDF(doc, data);
        break;
      case 'executive':
        this.addExecutiveContentToPDF(doc, data);
        break;
      default:
        this.addGenericContentToPDF(doc, data);
    }

    // Add footer
    this.addPDFFooter(doc, request);

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  private addPDFHeader(doc: PDFKit.PDFDocument, request: ReportRequest, data: any): void {
    // Company branding
    if (request.options?.branding?.companyName) {
      doc.fontSize(20).text(request.options.branding.companyName, { align: 'center' });
      doc.moveDown();
    }

    // Report title
    const title = this.getReportTitle(request.type);
    doc.fontSize(18).text(title, { align: 'center' });
    doc.moveDown();

    // Report metadata
    doc.fontSize(12);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`);
    if (data.period) {
      doc.text(`Period: ${data.period.start.toLocaleDateString()} - ${data.period.end.toLocaleDateString()}`);
    }
    
    if (request.options?.confidential) {
      doc.fillColor('red').text('CONFIDENTIAL', { align: 'right' });
      doc.fillColor('black');
    }

    doc.moveDown(2);
  }

  private addAnalysisContentToPDF(doc: PDFKit.PDFDocument, data: any): void {
    // Executive Summary
    doc.fontSize(16).text('Executive Summary');
    doc.moveDown();
    
    doc.fontSize(12);
    doc.text(`Total Analyses: ${data.summary.totalAnalyses}`);
    doc.text(`Average Risk Score: ${Math.round(data.summary.avgRiskScore)}%`);
    doc.text(`Total Findings: ${data.summary.totalFindings}`);
    doc.text(`High Risk Analyses: ${data.summary.highRiskAnalyses}`);
    doc.moveDown(2);

    // Individual Analysis Details
    doc.fontSize(16).text('Analysis Details');
    doc.moveDown();

    for (const analysis of data.analyses) {
      doc.fontSize(14).text(`Document: ${analysis.document?.title || 'Unknown'}`);
      doc.fontSize(12);
      doc.text(`Risk Score: ${analysis.overallRiskScore || 0}%`);
      doc.text(`Findings: ${analysis.findings?.length || 0}`);
      
      if (analysis.executiveSummary) {
        doc.text(`Summary: ${analysis.executiveSummary.substring(0, 200)}...`);
      }

      if (analysis.keyFindings && analysis.keyFindings.length > 0) {
        doc.text('Key Findings:');
        for (const finding of analysis.keyFindings.slice(0, 3)) {
          doc.text(`• ${finding}`);
        }
      }

      doc.moveDown(2);
    }
  }

  private addDashboardContentToPDF(doc: PDFKit.PDFDocument, data: any): void {
    const dashboard = data.dashboard;

    // Overview
    doc.fontSize(16).text('Overview');
    doc.moveDown();
    
    doc.fontSize(12);
    doc.text(`Total Analyses: ${dashboard.overview.totalAnalyses}`);
    doc.text(`Completed: ${dashboard.overview.completedAnalyses}`);
    doc.text(`Pending: ${dashboard.overview.pendingAnalyses}`);
    doc.text(`Average Risk Score: ${Math.round(dashboard.overview.avgRiskScore)}%`);
    doc.text(`Completion Rate: ${Math.round(dashboard.overview.completionRate)}%`);
    doc.moveDown(2);

    // Risk Distribution
    doc.fontSize(16).text('Risk Distribution');
    doc.moveDown();
    
    doc.fontSize(12);
    doc.text(`Critical: ${dashboard.riskDistribution.critical}`);
    doc.text(`High: ${dashboard.riskDistribution.high}`);
    doc.text(`Moderate: ${dashboard.riskDistribution.moderate}`);
    doc.text(`Low: ${dashboard.riskDistribution.low}`);
    doc.text(`Minimal: ${dashboard.riskDistribution.minimal}`);
    doc.moveDown(2);

    // Top Categories
    if (dashboard.topCategories.length > 0) {
      doc.fontSize(16).text('Top Issue Categories');
      doc.moveDown();
      
      for (const category of dashboard.topCategories.slice(0, 5)) {
        doc.fontSize(12).text(`${category.category}: ${category.count} findings`);
      }
      doc.moveDown(2);
    }

    // Insights
    if (dashboard.insights.length > 0) {
      doc.fontSize(16).text('Key Insights');
      doc.moveDown();
      
      for (const insight of dashboard.insights.slice(0, 3)) {
        doc.fontSize(14).text(insight.title);
        doc.fontSize(12).text(insight.description);
        doc.moveDown();
      }
    }
  }

  private addExecutiveContentToPDF(doc: PDFKit.PDFDocument, data: any): void {
    const executive = data.executive;

    // Executive Summary
    doc.fontSize(18).text('Executive Summary');
    doc.moveDown();

    // Key Metrics
    doc.fontSize(14).text('Key Metrics');
    doc.moveDown();
    doc.fontSize(12);
    doc.text(`Overall Risk Score: ${Math.round(executive.riskSummary.overallRisk)}%`);
    doc.text(`Completion Rate: ${Math.round(executive.performance.completionRate)}%`);
    doc.text(`Success Rate: ${Math.round(executive.performance.successRate)}%`);
    doc.moveDown(2);

    // Key Insights
    if (executive.keyInsights.length > 0) {
      doc.fontSize(14).text('Key Insights');
      doc.moveDown();
      
      for (const insight of executive.keyInsights) {
        doc.fontSize(12).text(`• ${insight.title}: ${insight.description}`);
      }
      doc.moveDown(2);
    }

    // Recommendations
    if (executive.recommendations.length > 0) {
      doc.fontSize(14).text('Recommendations');
      doc.moveDown();
      
      for (const recommendation of executive.recommendations) {
        doc.fontSize(12).text(`• ${recommendation}`);
      }
      doc.moveDown(2);
    }

    // Risk Summary
    doc.fontSize(14).text('Risk Analysis');
    doc.moveDown();
    doc.fontSize(12);
    doc.text(`Critical Risks: ${executive.riskSummary.riskDistribution.critical}`);
    doc.text(`High Risks: ${executive.riskSummary.riskDistribution.high}`);
    doc.text(`Moderate Risks: ${executive.riskSummary.riskDistribution.moderate}`);
  }

  private addGenericContentToPDF(doc: PDFKit.PDFDocument, data: any): void {
    doc.fontSize(12).text(JSON.stringify(data, null, 2));
  }

  private addPDFFooter(doc: PDFKit.PDFDocument, request: ReportRequest): void {
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      
      // Add page numbers
      doc.fontSize(10)
         .text(`Page ${i + 1} of ${pages.count}`, 
               50, doc.page.height - 50, 
               { align: 'center' });
      
      // Add generation info
      doc.text(`Generated by FinePrint AI on ${new Date().toLocaleDateString()}`,
               50, doc.page.height - 30,
               { align: 'center' });
    }
  }

  private async generateJSONReport(filePath: string, request: ReportRequest, data: any): Promise<void> {
    const jsonData = {
      reportMetadata: {
        id: crypto.randomUUID(),
        type: request.type,
        format: request.format,
        generatedAt: new Date(),
        userId: request.userId,
        options: request.options
      },
      data
    };

    await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2));
  }

  private async generateCSVReport(filePath: string, request: ReportRequest, data: any): Promise<void> {
    let records: any[] = [];

    switch (request.type) {
      case 'analysis':
        records = this.convertAnalysisDataToCSV(data);
        break;
      case 'dashboard':
        records = this.convertDashboardDataToCSV(data);
        break;
      default:
        records = [{ error: 'CSV export not supported for this report type' }];
    }

    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: Object.keys(records[0] || {}).map(key => ({ id: key, title: key }))
    });

    await csvWriter.writeRecords(records);
  }

  private async generateXLSXReport(filePath: string, request: ReportRequest, data: any): Promise<void> {
    const workbook = XLSX.utils.book_new();

    switch (request.type) {
      case 'analysis':
        this.addAnalysisDataToWorkbook(workbook, data);
        break;
      case 'dashboard':
        this.addDashboardDataToWorkbook(workbook, data);
        break;
      default:
        const sheet = XLSX.utils.json_to_sheet([data]);
        XLSX.utils.book_append_sheet(workbook, sheet, 'Data');
    }

    await XLSX.writeFile(workbook, filePath);
  }

  private async generateHTMLReport(filePath: string, request: ReportRequest, data: any): Promise<void> {
    const html = this.generateHTMLContent(request, data);
    await fs.writeFile(filePath, html);
  }

  private convertAnalysisDataToCSV(data: any): any[] {
    const records = [];
    
    for (const analysis of data.analyses) {
      records.push({
        'Analysis ID': analysis.id,
        'Document Title': analysis.document?.title || 'Unknown',
        'Risk Score': analysis.overallRiskScore || 0,
        'Status': analysis.status,
        'Findings Count': analysis.findings?.length || 0,
        'Created At': analysis.createdAt,
        'Completed At': analysis.completedAt || 'N/A'
      });

      // Add findings as separate rows
      if (analysis.findings) {
        for (const finding of analysis.findings) {
          records.push({
            'Analysis ID': analysis.id,
            'Finding Category': finding.category,
            'Finding Title': finding.title,
            'Severity': finding.severity,
            'Confidence': finding.confidenceScore || 0,
            'Description': finding.description?.substring(0, 100) || ''
          });
        }
      }
    }

    return records;
  }

  private convertDashboardDataToCSV(data: any): any[] {
    const dashboard = data.dashboard;
    const records = [];

    // Overview metrics
    records.push({
      'Metric': 'Total Analyses',
      'Value': dashboard.overview.totalAnalyses,
      'Type': 'Overview'
    });

    records.push({
      'Metric': 'Completed Analyses',
      'Value': dashboard.overview.completedAnalyses,
      'Type': 'Overview'
    });

    records.push({
      'Metric': 'Average Risk Score',
      'Value': Math.round(dashboard.overview.avgRiskScore),
      'Type': 'Overview'
    });

    // Risk distribution
    Object.entries(dashboard.riskDistribution).forEach(([level, count]) => {
      records.push({
        'Metric': `${level} Risk`,
        'Value': count,
        'Type': 'Risk Distribution'
      });
    });

    // Top categories
    dashboard.topCategories.forEach((category: any) => {
      records.push({
        'Metric': category.category,
        'Value': category.count,
        'Type': 'Top Categories'
      });
    });

    return records;
  }

  private addAnalysisDataToWorkbook(workbook: XLSX.WorkBook, data: any): void {
    // Summary sheet
    const summaryData = [
      ['Metric', 'Value'],
      ['Total Analyses', data.summary.totalAnalyses],
      ['Average Risk Score', Math.round(data.summary.avgRiskScore)],
      ['Total Findings', data.summary.totalFindings],
      ['High Risk Analyses', data.summary.highRiskAnalyses]
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    // Analyses sheet
    const analysesData = data.analyses.map((analysis: any) => ({
      'Analysis ID': analysis.id,
      'Document Title': analysis.document?.title || 'Unknown',
      'Risk Score': analysis.overallRiskScore || 0,
      'Status': analysis.status,
      'Findings': analysis.findings?.length || 0,
      'Created': analysis.createdAt,
      'Completed': analysis.completedAt || 'N/A'
    }));
    const analysesSheet = XLSX.utils.json_to_sheet(analysesData);
    XLSX.utils.book_append_sheet(workbook, analysesSheet, 'Analyses');

    // Findings sheet
    const findingsData = [];
    for (const analysis of data.analyses) {
      if (analysis.findings) {
        for (const finding of analysis.findings) {
          findingsData.push({
            'Analysis ID': analysis.id,
            'Document': analysis.document?.title || 'Unknown',
            'Category': finding.category,
            'Title': finding.title,
            'Severity': finding.severity,
            'Confidence': finding.confidenceScore || 0,
            'Description': finding.description?.substring(0, 200) || ''
          });
        }
      }
    }

    if (findingsData.length > 0) {
      const findingsSheet = XLSX.utils.json_to_sheet(findingsData);
      XLSX.utils.book_append_sheet(workbook, findingsSheet, 'Findings');
    }
  }

  private addDashboardDataToWorkbook(workbook: XLSX.WorkBook, data: any): void {
    const dashboard = data.dashboard;

    // Overview sheet
    const overviewData = Object.entries(dashboard.overview).map(([key, value]) => [key, value]);
    const overviewSheet = XLSX.utils.aoa_to_sheet([['Metric', 'Value'], ...overviewData]);
    XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Overview');

    // Risk distribution sheet
    const riskData = Object.entries(dashboard.riskDistribution).map(([level, count]) => [level, count]);
    const riskSheet = XLSX.utils.aoa_to_sheet([['Risk Level', 'Count'], ...riskData]);
    XLSX.utils.book_append_sheet(workbook, riskSheet, 'Risk Distribution');

    // Categories sheet
    if (dashboard.topCategories.length > 0) {
      const categoriesSheet = XLSX.utils.json_to_sheet(dashboard.topCategories);
      XLSX.utils.book_append_sheet(workbook, categoriesSheet, 'Top Categories');
    }

    // Trends sheet
    if (dashboard.trends.analysisVolume.length > 0) {
      const trendsSheet = XLSX.utils.json_to_sheet(dashboard.trends.analysisVolume);
      XLSX.utils.book_append_sheet(workbook, trendsSheet, 'Analysis Trends');
    }
  }

  private generateHTMLContent(request: ReportRequest, data: any): string {
    const title = this.getReportTitle(request.type);
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .section { margin: 30px 0; }
            .metric { display: inline-block; margin: 10px 20px; padding: 10px; border: 1px solid #ddd; }
            .risk-critical { color: #d32f2f; }
            .risk-high { color: #f57c00; }
            .risk-moderate { color: #fbc02d; }
            .risk-low { color: #388e3c; }
            .risk-minimal { color: #1976d2; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f5f5f5; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>${title}</h1>
            <p>Generated on ${new Date().toLocaleDateString()}</p>
            ${request.options?.confidential ? '<p style="color: red; font-weight: bold;">CONFIDENTIAL</p>' : ''}
        </div>
        
        ${this.generateHTMLContentForType(request.type, data)}
        
        <div class="footer">
            <p><small>Generated by FinePrint AI</small></p>
        </div>
    </body>
    </html>
    `;
  }

  private generateHTMLContentForType(type: string, data: any): string {
    switch (type) {
      case 'analysis':
        return this.generateAnalysisHTML(data);
      case 'dashboard':
        return this.generateDashboardHTML(data);
      case 'executive':
        return this.generateExecutiveHTML(data);
      default:
        return '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
    }
  }

  private generateAnalysisHTML(data: any): string {
    let html = `
    <div class="section">
        <h2>Executive Summary</h2>
        <div class="metric">Total Analyses: ${data.summary.totalAnalyses}</div>
        <div class="metric">Average Risk Score: ${Math.round(data.summary.avgRiskScore)}%</div>
        <div class="metric">Total Findings: ${data.summary.totalFindings}</div>
        <div class="metric">High Risk Analyses: ${data.summary.highRiskAnalyses}</div>
    </div>

    <div class="section">
        <h2>Analysis Details</h2>
        <table>
            <tr>
                <th>Document</th>
                <th>Risk Score</th>
                <th>Findings</th>
                <th>Status</th>
            </tr>
    `;

    for (const analysis of data.analyses) {
      const riskClass = this.getRiskClass(analysis.overallRiskScore || 0);
      html += `
            <tr>
                <td>${analysis.document?.title || 'Unknown'}</td>
                <td class="${riskClass}">${analysis.overallRiskScore || 0}%</td>
                <td>${analysis.findings?.length || 0}</td>
                <td>${analysis.status}</td>
            </tr>
      `;
    }

    html += `
        </table>
    </div>
    `;

    return html;
  }

  private generateDashboardHTML(data: any): string {
    const dashboard = data.dashboard;
    
    return `
    <div class="section">
        <h2>Overview</h2>
        <div class="metric">Total Analyses: ${dashboard.overview.totalAnalyses}</div>
        <div class="metric">Completed: ${dashboard.overview.completedAnalyses}</div>
        <div class="metric">Average Risk Score: ${Math.round(dashboard.overview.avgRiskScore)}%</div>
        <div class="metric">Completion Rate: ${Math.round(dashboard.overview.completionRate)}%</div>
    </div>

    <div class="section">
        <h2>Risk Distribution</h2>
        <div class="metric risk-critical">Critical: ${dashboard.riskDistribution.critical}</div>
        <div class="metric risk-high">High: ${dashboard.riskDistribution.high}</div>
        <div class="metric risk-moderate">Moderate: ${dashboard.riskDistribution.moderate}</div>
        <div class="metric risk-low">Low: ${dashboard.riskDistribution.low}</div>
        <div class="metric risk-minimal">Minimal: ${dashboard.riskDistribution.minimal}</div>
    </div>

    ${dashboard.topCategories.length > 0 ? `
    <div class="section">
        <h2>Top Categories</h2>
        <ul>
            ${dashboard.topCategories.slice(0, 5).map((cat: any) => 
              `<li>${cat.category}: ${cat.count} findings</li>`
            ).join('')}
        </ul>
    </div>
    ` : ''}
    `;
  }

  private generateExecutiveHTML(data: any): string {
    const executive = data.executive;
    
    return `
    <div class="section">
        <h2>Key Metrics</h2>
        <div class="metric">Overall Risk Score: ${Math.round(executive.riskSummary.overallRisk)}%</div>
        <div class="metric">Completion Rate: ${Math.round(executive.performance.completionRate)}%</div>
        <div class="metric">Success Rate: ${Math.round(executive.performance.successRate)}%</div>
    </div>

    ${executive.keyInsights.length > 0 ? `
    <div class="section">
        <h2>Key Insights</h2>
        <ul>
            ${executive.keyInsights.map((insight: any) => 
              `<li><strong>${insight.title}:</strong> ${insight.description}</li>`
            ).join('')}
        </ul>
    </div>
    ` : ''}

    ${executive.recommendations.length > 0 ? `
    <div class="section">
        <h2>Recommendations</h2>
        <ul>
            ${executive.recommendations.map((rec: any) => `<li>${rec}</li>`).join('')}
        </ul>
    </div>
    ` : ''}
    `;
  }

  private getRiskClass(score: number): string {
    if (score >= 80) return 'risk-critical';
    if (score >= 60) return 'risk-high';
    if (score >= 40) return 'risk-moderate';
    if (score >= 20) return 'risk-low';
    return 'risk-minimal';
  }

  private getReportTitle(type: string): string {
    const titles = {
      analysis: 'Document Analysis Report',
      dashboard: 'Dashboard Analytics Report',
      comparison: 'Comparison Analysis Report',
      compliance: 'Compliance Report',
      executive: 'Executive Summary Report'
    };
    return titles[type] || 'Analysis Report';
  }

  private generateFileName(request: ReportRequest, reportId: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const extension = this.getFileExtension(request.format);
    return `${request.type}-report-${timestamp}-${reportId.substring(0, 8)}.${extension}`;
  }

  private getFileExtension(format: string): string {
    const extensions = {
      pdf: 'pdf',
      json: 'json',
      csv: 'csv',
      xlsx: 'xlsx',
      html: 'html'
    };
    return extensions[format] || 'txt';
  }

  private calculateComplianceRiskDistribution(findings: any[]): any {
    const distribution = { critical: 0, high: 0, medium: 0, low: 0 };
    
    for (const finding of findings) {
      distribution[finding.severity] = (distribution[finding.severity] || 0) + 1;
    }

    return distribution;
  }

  private generateExecutiveRecommendations(dashboardData: any): string[] {
    const recommendations = [];

    if (dashboardData.overview.avgRiskScore > 70) {
      recommendations.push('Consider implementing stricter document review processes to reduce overall risk scores');
    }

    if (dashboardData.overview.completionRate < 80) {
      recommendations.push('Investigate and address the causes of analysis failures to improve completion rates');
    }

    if (dashboardData.riskDistribution.critical > 0) {
      recommendations.push('Immediately address all critical risk findings to ensure compliance and user safety');
    }

    if (dashboardData.topCategories.length > 0) {
      const topCategory = dashboardData.topCategories[0];
      recommendations.push(`Focus on improving ${topCategory.category} issues, which represent the highest volume of findings`);
    }

    if (recommendations.length === 0) {
      recommendations.push('Continue monitoring document analysis trends and maintain current quality standards');
    }

    return recommendations;
  }

  private async storeReportMetadata(data: {
    id: string;
    type: string;
    format: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    userId: string;
    teamId?: string;
    metadata: any;
  }): Promise<GeneratedReport> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Reports expire in 7 days

    const report = await prisma.report.create({
      data: {
        id: data.id,
        type: data.type,
        format: data.format,
        fileName: data.fileName,
        filePath: data.filePath,
        fileSize: data.fileSize,
        mimeType: this.getMimeType(data.format),
        userId: data.userId,
        teamId: data.teamId,
        expiresAt,
        metadata: data.metadata
      }
    });

    return this.mapDatabaseToReport(report);
  }

  private getMimeType(format: string): string {
    const mimeTypes = {
      pdf: 'application/pdf',
      json: 'application/json',
      csv: 'text/csv',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      html: 'text/html'
    };
    return mimeTypes[format] || 'application/octet-stream';
  }

  private mapDatabaseToReport(report: any): GeneratedReport {
    return {
      id: report.id,
      type: report.type,
      format: report.format,
      fileName: report.fileName,
      filePath: report.filePath,
      fileSize: report.fileSize,
      mimeType: report.mimeType,
      generatedAt: report.generatedAt,
      expiresAt: report.expiresAt,
      downloadUrl: `/api/reports/${report.id}/download`,
      metadata: {
        userId: report.userId,
        teamId: report.teamId,
        analysisCount: report.metadata?.analysisCount,
        dateRange: report.metadata?.dateRange,
        options: report.metadata?.options
      }
    };
  }

  private async ensureDirectoriesExist(): Promise<void> {
    try {
      await fs.mkdir(this.REPORTS_DIR, { recursive: true });
      await fs.mkdir(this.TEMPLATE_DIR, { recursive: true });
    } catch (error) {
      logger.warn('Failed to create directories', { error: error.message });
    }
  }
}

// Singleton instance
export const reportGenerator = new ReportGenerator();