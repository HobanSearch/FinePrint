"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportService = exports.ExportService = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const client_1 = require("@prisma/client");
const analysis_1 = require("./analysis");
const reportGenerator_1 = require("./reportGenerator");
const dashboardService_1 = require("./dashboardService");
const XLSX = __importStar(require("xlsx"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const archiver_1 = __importDefault(require("archiver"));
const logger = (0, logger_1.createServiceLogger)('export-service');
const prisma = new client_1.PrismaClient();
class ExportService {
    analysisService;
    EXPORTS_DIR = '/tmp/exports';
    TEMPLATES_DIR = path_1.default.join(__dirname, '../templates/exports');
    constructor() {
        this.analysisService = new analysis_1.AnalysisService();
        this.ensureDirectoriesExist();
    }
    async exportData(request) {
        const exportId = crypto_1.default.randomUUID();
        const startTime = Date.now();
        logger.info('Starting data export', {
            exportId,
            type: request.type,
            format: request.format,
            userId: request.userId
        });
        try {
            this.validateExportRequest(request);
            const data = await this.gatherExportData(request);
            const filteredData = this.applyFilters(data, request.filters);
            const sortedData = this.applySorting(filteredData, request.options);
            const exportFile = await this.generateExportFile(exportId, request, sortedData);
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
        }
        catch (error) {
            logger.error('Export failed', {
                error: error.message,
                exportId,
                type: request.type,
                format: request.format,
                userId: request.userId
            });
            await this.storeFailedExport(exportId, request, error.message, Date.now() - startTime);
            throw error;
        }
    }
    async getExport(exportId, userId) {
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
        }
        catch (error) {
            logger.error('Failed to get export', { error: error.message, exportId, userId });
            throw error;
        }
    }
    async listUserExports(userId, options = {}) {
        try {
            const { page = 1, limit = 20 } = options;
            const skip = (page - 1) * limit;
            const where = {
                userId,
                expiresAt: { gt: new Date() }
            };
            if (options.type)
                where.type = options.type;
            if (options.format)
                where.format = options.format;
            if (options.status)
                where.status = options.status;
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
        }
        catch (error) {
            logger.error('Failed to list user exports', { error: error.message, userId });
            throw error;
        }
    }
    async deleteExport(exportId, userId) {
        try {
            const exportRecord = await prisma.export.findFirst({
                where: { id: exportId, userId }
            });
            if (!exportRecord) {
                return false;
            }
            try {
                await promises_1.default.unlink(exportRecord.filePath);
            }
            catch (error) {
                logger.warn('Failed to delete export file', { error: error.message, filePath: exportRecord.filePath });
            }
            await prisma.export.delete({
                where: { id: exportId }
            });
            logger.info('Export deleted successfully', { exportId, userId });
            return true;
        }
        catch (error) {
            logger.error('Failed to delete export', { error: error.message, exportId, userId });
            throw error;
        }
    }
    async createTemplate(template) {
        try {
            const templateId = crypto_1.default.randomUUID();
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
        }
        catch (error) {
            logger.error('Failed to create export template', { error: error.message });
            throw error;
        }
    }
    async getTemplates(userId, options = {}) {
        try {
            const where = {
                OR: [
                    { userId },
                    ...(options.includePublic ? [{ isPublic: true }] : [])
                ]
            };
            if (options.type)
                where.type = options.type;
            if (options.format)
                where.format = options.format;
            const templates = await prisma.exportTemplate.findMany({
                where,
                orderBy: [
                    { isDefault: 'desc' },
                    { name: 'asc' }
                ]
            });
            return templates.map(t => this.mapDatabaseToTemplate(t));
        }
        catch (error) {
            logger.error('Failed to get templates', { error: error.message, userId });
            throw error;
        }
    }
    async bulkExport(request) {
        const exportId = crypto_1.default.randomUUID();
        const startTime = Date.now();
        logger.info('Starting bulk export', {
            exportId,
            userId: request.userId,
            exportAll: request.exportAll
        });
        try {
            const allData = await this.gatherBulkExportData(request);
            const archivePath = path_1.default.join(this.EXPORTS_DIR, `bulk-export-${exportId}.zip`);
            const archive = (0, archiver_1.default)('zip', { zlib: { level: 9 } });
            const stream = promises_1.default.createWriteStream(archivePath);
            archive.pipe(stream);
            if (allData.analyses.length > 0) {
                const analysesData = this.formatDataForExport('analysis', allData.analyses, request);
                archive.append(JSON.stringify(analysesData, null, 2), { name: 'analyses.json' });
                if (request.format === 'xlsx') {
                    const workbook = this.createAnalysesWorkbook(allData.analyses);
                    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
                    archive.append(buffer, { name: 'analyses.xlsx' });
                }
            }
            if (allData.findings.length > 0) {
                const findingsData = this.formatDataForExport('findings', allData.findings, request);
                archive.append(JSON.stringify(findingsData, null, 2), { name: 'findings.json' });
                if (request.format === 'csv') {
                    const csvData = this.convertFindingsToCSV(allData.findings);
                    archive.append(csvData, { name: 'findings.csv' });
                }
            }
            if (allData.documents.length > 0) {
                const documentsData = this.formatDataForExport('documents', allData.documents, request);
                archive.append(JSON.stringify(documentsData, null, 2), { name: 'documents.json' });
            }
            if (allData.dashboard) {
                archive.append(JSON.stringify(allData.dashboard, null, 2), { name: 'dashboard.json' });
            }
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
            await new Promise((resolve, reject) => {
                stream.on('close', resolve);
                stream.on('error', reject);
            });
            const stats = await promises_1.default.stat(archivePath);
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
        }
        catch (error) {
            logger.error('Bulk export failed', { error: error.message, exportId });
            throw error;
        }
    }
    validateExportRequest(request) {
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
    async gatherExportData(request) {
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
    async gatherAnalysisExportData(request) {
        let analyses = [];
        if (request.analysisIds && request.analysisIds.length > 0) {
            for (const analysisId of request.analysisIds) {
                const analysis = await this.analysisService.getAnalysisById(analysisId, request.userId);
                if (analysis) {
                    analyses.push(analysis);
                }
            }
        }
        else {
            const result = await this.analysisService.getUserAnalyses(request.userId, {
                page: 1,
                limit: 1000,
                status: request.filters?.status?.[0]
            });
            analyses = result.analyses;
        }
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
    async gatherFindingsExportData(request) {
        const where = {
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
    async gatherDashboardExportData(request) {
        const dashboardData = await dashboardService_1.dashboardService.getDashboardData(request.userId, request.dateRange ? { dateRange: request.dateRange } : undefined);
        return {
            dashboard: dashboardData,
            exportedAt: new Date(),
            period: request.dateRange
        };
    }
    async gatherComplianceExportData(request) {
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
    async gatherBulkExportData(request) {
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
    async getUserDocuments(userId, filters) {
        const where = {
            userId,
            deletedAt: null
        };
        if (filters?.documentTypes) {
            where.documentType = { in: filters.documentTypes };
        }
        return await prisma.document.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 1000
        });
    }
    applyFilters(data, filters) {
        if (!filters)
            return data;
        if (data.analyses) {
            if (filters.documentTypes) {
                data.analyses = data.analyses.filter((a) => filters.documentTypes.includes(a.document?.documentType));
            }
            if (filters.riskLevels) {
                data.analyses = data.analyses.filter((a) => {
                    const riskLevel = this.getRiskLevel(a.overallRiskScore || 0);
                    return filters.riskLevels.includes(riskLevel);
                });
            }
            if (filters.status) {
                data.analyses = data.analyses.filter((a) => filters.status.includes(a.status));
            }
        }
        if (data.findings) {
            if (filters.categories) {
                data.findings = data.findings.filter((f) => filters.categories.includes(f.category));
            }
            if (filters.severities) {
                data.findings = data.findings.filter((f) => filters.severities.includes(f.severity));
            }
        }
        return data;
    }
    applySorting(data, options) {
        if (!options?.sortBy)
            return data;
        const sortOrder = options.sortOrder || 'desc';
        const sortMultiplier = sortOrder === 'asc' ? 1 : -1;
        if (data.analyses) {
            data.analyses.sort((a, b) => {
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
    async generateExportFile(exportId, request, data) {
        const fileName = this.generateFileName(request, exportId);
        const filePath = path_1.default.join(this.EXPORTS_DIR, fileName);
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
        const stats = await promises_1.default.stat(filePath);
        return {
            fileName,
            filePath,
            fileSize: stats.size
        };
    }
    async generateJSONExport(filePath, data, request) {
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
        await promises_1.default.writeFile(filePath, JSON.stringify(exportData, null, 2));
    }
    async generateCSVExport(filePath, data, request) {
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
        await promises_1.default.writeFile(filePath, csvContent);
    }
    async generateXLSXExport(filePath, data, request) {
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
    async generatePDFExport(filePath, data, request) {
        const reportRequest = {
            type: request.type,
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
        const report = await reportGenerator_1.reportGenerator.generateReport(reportRequest);
        await promises_1.default.copyFile(report.filePath, filePath);
    }
    async generateXMLExport(filePath, data, request) {
        const xmlData = this.convertToXML(data, request.type);
        await promises_1.default.writeFile(filePath, xmlData);
    }
    formatDataForExport(type, data, request) {
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
    formatAnalysisData(data, options) {
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
    formatFindingsData(data, options) {
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
    formatDashboardData(data, options) {
        return {
            overview: data.overview,
            riskDistribution: data.riskDistribution,
            topCategories: data.topCategories,
            trends: options?.includeCharts ? data.trends : undefined,
            performance: data.performance,
            insights: data.insights.slice(0, 10),
            usage: options?.includeMetadata ? data.usage : undefined
        };
    }
    convertAnalysesToCSV(analyses) {
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
        return [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    }
    convertFindingsToCSV(findings) {
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
        return [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    }
    addAnalysesToWorkbook(workbook, analyses) {
        const summaryData = [
            ['Total Analyses', analyses.length],
            ['Completed', analyses.filter(a => a.status === 'completed').length],
            ['Average Risk Score', Math.round(analyses.reduce((sum, a) => sum + (a.overallRiskScore || 0), 0) / analyses.length)]
        ];
        const summarySheet = XLSX.utils.aoa_to_sheet([['Metric', 'Value'], ...summaryData]);
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
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
    addFindingsToWorkbook(workbook, findings) {
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
        const categoryStats = this.groupByCategory(findings);
        const categoryData = Object.entries(categoryStats).map(([category, count]) => [category, count]);
        const categorySheet = XLSX.utils.aoa_to_sheet([['Category', 'Count'], ...categoryData]);
        XLSX.utils.book_append_sheet(workbook, categorySheet, 'By Category');
    }
    addDashboardToWorkbook(workbook, dashboard) {
        const overviewData = Object.entries(dashboard.overview).map(([key, value]) => [key, value]);
        const overviewSheet = XLSX.utils.aoa_to_sheet([['Metric', 'Value'], ...overviewData]);
        XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Overview');
        const riskData = Object.entries(dashboard.riskDistribution).map(([level, count]) => [level, count]);
        const riskSheet = XLSX.utils.aoa_to_sheet([['Risk Level', 'Count'], ...riskData]);
        XLSX.utils.book_append_sheet(workbook, riskSheet, 'Risk Distribution');
        if (dashboard.topCategories.length > 0) {
            const categoriesSheet = XLSX.utils.json_to_sheet(dashboard.topCategories);
            XLSX.utils.book_append_sheet(workbook, categoriesSheet, 'Top Categories');
        }
    }
    createAnalysesWorkbook(analyses) {
        const workbook = XLSX.utils.book_new();
        this.addAnalysesToWorkbook(workbook, analyses);
        return workbook;
    }
    convertToXML(data, type) {
        const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n';
        const rootElement = `<${type}_export>`;
        const rootElementClose = `</${type}_export>`;
        const xmlBody = this.objectToXML(data, type);
        return xmlHeader + rootElement + '\n' + xmlBody + '\n' + rootElementClose;
    }
    objectToXML(obj, elementName, indent = '  ') {
        if (typeof obj !== 'object' || obj === null) {
            return `${indent}<${elementName}>${this.escapeXML(String(obj))}</${elementName}>`;
        }
        if (Array.isArray(obj)) {
            return obj.map((item, index) => this.objectToXML(item, `${elementName}_${index}`, indent)).join('\n');
        }
        let xml = `${indent}<${elementName}>`;
        for (const [key, value] of Object.entries(obj)) {
            xml += '\n' + this.objectToXML(value, key, indent + '  ');
        }
        xml += `\n${indent}</${elementName}>`;
        return xml;
    }
    escapeXML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
    generateFileName(request, exportId) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const extension = this.getFileExtension(request.format);
        return `${request.type}-export-${timestamp}-${exportId.substring(0, 8)}.${extension}`;
    }
    getFileExtension(format) {
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
    getRecordCount(data) {
        if (data.analyses)
            return data.analyses.length;
        if (data.findings)
            return data.findings.length;
        if (data.documents)
            return data.documents.length;
        return 0;
    }
    getRiskLevel(score) {
        if (score >= 80)
            return 'critical';
        if (score >= 60)
            return 'high';
        if (score >= 40)
            return 'moderate';
        if (score >= 20)
            return 'low';
        return 'minimal';
    }
    groupBySeverity(findings) {
        return findings.reduce((acc, finding) => {
            const severity = finding.severity;
            acc[severity] = (acc[severity] || 0) + 1;
            return acc;
        }, {});
    }
    groupByCategory(findings) {
        return findings.reduce((acc, finding) => {
            const category = finding.category;
            acc[category] = (acc[category] || 0) + 1;
            return acc;
        }, {});
    }
    groupByDocument(findings) {
        return findings.reduce((acc, finding) => {
            const docId = finding.analysis?.document?.id || 'unknown';
            acc[docId] = (acc[docId] || 0) + 1;
            return acc;
        }, {});
    }
    generateComplianceRecommendations(findings) {
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
    async storeExportMetadata(data) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
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
    async storeFailedExport(exportId, request, errorMessage, processingTime) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 1);
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
    getMimeType(format) {
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
    mapDatabaseToExportResult(exportRecord) {
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
    mapDatabaseToTemplate(template) {
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
    async ensureDirectoriesExist() {
        try {
            await promises_1.default.mkdir(this.EXPORTS_DIR, { recursive: true });
            await promises_1.default.mkdir(this.TEMPLATES_DIR, { recursive: true });
        }
        catch (error) {
            logger.warn('Failed to create directories', { error: error.message });
        }
    }
}
exports.ExportService = ExportService;
exports.exportService = new ExportService();
//# sourceMappingURL=exportService.js.map