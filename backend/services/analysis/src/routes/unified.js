"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unifiedRoutes = unifiedRoutes;
const zod_1 = require("zod");
const logger_1 = require("@fineprintai/shared-logger");
const middleware_1 = require("@fineprintai/shared-middleware");
const analysisEngine_1 = require("../services/analysisEngine");
const documentPipeline_1 = require("../services/documentPipeline");
const dashboardService_1 = require("../services/dashboardService");
const reportGenerator_1 = require("../services/reportGenerator");
const changeMonitor_1 = require("../services/changeMonitor");
const exportService_1 = require("../services/exportService");
const logger = (0, logger_1.createServiceLogger)('unified-routes');
const unifiedAnalysisRequestSchema = zod_1.z.object({
    content: zod_1.z.string().optional(),
    url: zod_1.z.string().url().optional(),
    documentType: zod_1.z.enum(['terms_of_service', 'privacy_policy', 'eula', 'cookie_policy', 'data_processing_agreement', 'service_agreement', 'other']).optional(),
    language: zod_1.z.string().default('en'),
    priority: zod_1.z.enum(['low', 'normal', 'high']).default('normal'),
    options: zod_1.z.object({
        modelPreference: zod_1.z.enum(['speed', 'accuracy', 'balanced']).optional(),
        includeEmbeddings: zod_1.z.boolean().optional(),
        includeSimilarDocuments: zod_1.z.boolean().optional(),
        enableChangeMonitoring: zod_1.z.boolean().optional(),
        generateReport: zod_1.z.boolean().optional(),
        customPatterns: zod_1.z.array(zod_1.z.string()).optional(),
        webhookUrl: zod_1.z.string().url().optional()
    }).optional()
}).refine(data => data.content || data.url, {
    message: "Either 'content' or 'url' must be provided",
});
const dashboardFiltersSchema = zod_1.z.object({
    dateRange: zod_1.z.object({
        start: zod_1.z.string().transform(str => new Date(str)),
        end: zod_1.z.string().transform(str => new Date(str))
    }).optional(),
    documentTypes: zod_1.z.array(zod_1.z.string()).optional(),
    riskLevels: zod_1.z.array(zod_1.z.string()).optional(),
    status: zod_1.z.array(zod_1.z.string()).optional()
});
const reportRequestSchema = zod_1.z.object({
    type: zod_1.z.enum(['analysis', 'dashboard', 'comparison', 'compliance', 'executive']),
    format: zod_1.z.enum(['pdf', 'json', 'csv', 'xlsx', 'html']),
    analysisIds: zod_1.z.array(zod_1.z.string()).optional(),
    dateRange: zod_1.z.object({
        start: zod_1.z.string().transform(str => new Date(str)),
        end: zod_1.z.string().transform(str => new Date(str))
    }).optional(),
    options: zod_1.z.object({
        includeCharts: zod_1.z.boolean().optional(),
        includeRawData: zod_1.z.boolean().optional(),
        includeRecommendations: zod_1.z.boolean().optional(),
        includeExecutiveSummary: zod_1.z.boolean().optional(),
        branding: zod_1.z.object({
            companyName: zod_1.z.string().optional(),
            colors: zod_1.z.object({
                primary: zod_1.z.string(),
                secondary: zod_1.z.string()
            }).optional()
        }).optional()
    }).optional()
});
const exportRequestSchema = zod_1.z.object({
    type: zod_1.z.enum(['analysis', 'findings', 'dashboard', 'compliance', 'bulk']),
    format: zod_1.z.enum(['pdf', 'json', 'csv', 'xlsx', 'xml', 'zip']),
    analysisIds: zod_1.z.array(zod_1.z.string()).optional(),
    documentIds: zod_1.z.array(zod_1.z.string()).optional(),
    dateRange: zod_1.z.object({
        start: zod_1.z.string().transform(str => new Date(str)),
        end: zod_1.z.string().transform(str => new Date(str))
    }).optional(),
    filters: zod_1.z.object({
        documentTypes: zod_1.z.array(zod_1.z.string()).optional(),
        riskLevels: zod_1.z.array(zod_1.z.string()).optional(),
        categories: zod_1.z.array(zod_1.z.string()).optional(),
        severities: zod_1.z.array(zod_1.z.string()).optional(),
        status: zod_1.z.array(zod_1.z.string()).optional()
    }).optional(),
    options: zod_1.z.object({
        includeMetadata: zod_1.z.boolean().optional(),
        includeRawData: zod_1.z.boolean().optional(),
        includeCharts: zod_1.z.boolean().optional(),
        includeRecommendations: zod_1.z.boolean().optional(),
        groupBy: zod_1.z.enum(['document', 'category', 'severity', 'date']).optional(),
        sortBy: zod_1.z.enum(['date', 'risk', 'title', 'type']).optional(),
        sortOrder: zod_1.z.enum(['asc', 'desc']).optional()
    }).optional()
});
const changeMonitorRequestSchema = zod_1.z.object({
    url: zod_1.z.string().url(),
    analysisId: zod_1.z.string(),
    enabled: zod_1.z.boolean().default(true),
    checkInterval: zod_1.z.number().min(300).max(86400),
    sensitivity: zod_1.z.enum(['low', 'medium', 'high']).default('medium'),
    alertTypes: zod_1.z.array(zod_1.z.enum(['email', 'webhook', 'websocket', 'sms'])),
    webhookUrl: zod_1.z.string().url().optional(),
    emailRecipients: zod_1.z.array(zod_1.z.string().email()).optional(),
    schedule: zod_1.z.string().optional(),
    keywordsToWatch: zod_1.z.array(zod_1.z.string()).optional(),
    sectionsToWatch: zod_1.z.array(zod_1.z.string()).optional()
});
async function unifiedRoutes(server) {
    server.register(async function (server) {
        server.post('/unified/analysis', {
            preHandler: [middleware_1.authenticateToken, (0, middleware_1.requireSubscription)(['starter', 'professional', 'team', 'enterprise'])],
            schema: {
                tags: ['Unified Analysis'],
                summary: 'Create unified document analysis',
                description: 'Create a comprehensive document analysis with all integrated features',
                body: {
                    type: 'object',
                    properties: {
                        content: { type: 'string' },
                        url: { type: 'string', format: 'uri' },
                        documentType: {
                            type: 'string',
                            enum: ['terms_of_service', 'privacy_policy', 'eula', 'cookie_policy', 'data_processing_agreement', 'service_agreement', 'other']
                        },
                        language: { type: 'string', default: 'en' },
                        priority: { type: 'string', enum: ['low', 'normal', 'high'], default: 'normal' },
                        options: {
                            type: 'object',
                            properties: {
                                modelPreference: { type: 'string', enum: ['speed', 'accuracy', 'balanced'] },
                                includeEmbeddings: { type: 'boolean' },
                                includeSimilarDocuments: { type: 'boolean' },
                                enableChangeMonitoring: { type: 'boolean' },
                                generateReport: { type: 'boolean' },
                                customPatterns: { type: 'array', items: { type: 'string' } },
                                webhookUrl: { type: 'string', format: 'uri' }
                            }
                        }
                    },
                    anyOf: [
                        { required: ['content'] },
                        { required: ['url'] }
                    ]
                },
                security: [{ bearerAuth: [] }],
                response: {
                    201: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            data: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string' },
                                    status: { type: 'string' },
                                    documentId: { type: 'string' },
                                    createdAt: { type: 'string' },
                                    quota: {
                                        type: 'object',
                                        properties: {
                                            used: { type: 'number' },
                                            limit: { type: 'number' },
                                            resetDate: { type: 'string' }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const body = unifiedAnalysisRequestSchema.parse(request.body);
            try {
                const result = await analysisEngine_1.unifiedAnalysisEngine.createAnalysis({
                    content: body.content,
                    url: body.url,
                    userId: user.id,
                    teamId: user.teamId,
                    documentType: body.documentType,
                    language: body.language,
                    priority: body.priority,
                    options: body.options
                });
                return reply.status(201).send({
                    success: true,
                    data: result
                });
            }
            catch (error) {
                logger.error('Failed to create unified analysis', { error: error.message, userId: user.id });
                throw error;
            }
        });
        server.get('/unified/analysis/:id', {
            preHandler: [middleware_1.authenticateToken],
            schema: {
                tags: ['Unified Analysis'],
                summary: 'Get unified analysis',
                params: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' }
                    },
                    required: ['id']
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const { id } = request.params;
            try {
                const analysis = await analysisEngine_1.unifiedAnalysisEngine.getAnalysis(id, user.id);
                if (!analysis) {
                    return reply.status(404).send({
                        success: false,
                        error: 'NOT_FOUND',
                        message: 'Analysis not found'
                    });
                }
                return reply.send({
                    success: true,
                    data: analysis
                });
            }
            catch (error) {
                logger.error('Failed to get unified analysis', { error: error.message, analysisId: id, userId: user.id });
                throw error;
            }
        });
        server.get('/unified/analysis', {
            preHandler: [middleware_1.authenticateToken],
            schema: {
                tags: ['Unified Analysis'],
                summary: 'List user analyses',
                querystring: {
                    type: 'object',
                    properties: {
                        page: { type: 'string', default: '1' },
                        limit: { type: 'string', default: '20' },
                        status: { type: 'string' },
                        documentType: { type: 'string' },
                        sortBy: { type: 'string', enum: ['created', 'completed', 'risk_score'] },
                        sortOrder: { type: 'string', enum: ['asc', 'desc'] }
                    }
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const query = request.query;
            try {
                const result = await analysisEngine_1.unifiedAnalysisEngine.getUserAnalyses(user.id, {
                    page: parseInt(query.page) || 1,
                    limit: parseInt(query.limit) || 20,
                    status: query.status,
                    documentType: query.documentType,
                    sortBy: query.sortBy,
                    sortOrder: query.sortOrder
                });
                return reply.send({
                    success: true,
                    data: result.analyses,
                    pagination: result.pagination,
                    stats: result.stats
                });
            }
            catch (error) {
                logger.error('Failed to list user analyses', { error: error.message, userId: user.id });
                throw error;
            }
        });
        server.delete('/unified/analysis/:id', {
            preHandler: [middleware_1.authenticateToken],
            schema: {
                tags: ['Unified Analysis'],
                summary: 'Cancel analysis',
                params: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' }
                    },
                    required: ['id']
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const { id } = request.params;
            try {
                const cancelled = await analysisEngine_1.unifiedAnalysisEngine.cancelAnalysis(id, user.id);
                if (!cancelled) {
                    return reply.status(404).send({
                        success: false,
                        error: 'NOT_FOUND',
                        message: 'Analysis not found or cannot be cancelled'
                    });
                }
                return reply.send({
                    success: true,
                    message: 'Analysis cancelled successfully'
                });
            }
            catch (error) {
                logger.error('Failed to cancel analysis', { error: error.message, analysisId: id, userId: user.id });
                throw error;
            }
        });
    });
    server.register(async function (server) {
        server.get('/dashboard', {
            preHandler: [middleware_1.authenticateToken],
            schema: {
                tags: ['Dashboard'],
                summary: 'Get dashboard data',
                querystring: {
                    type: 'object',
                    properties: {
                        dateRange: { type: 'string' },
                        documentTypes: { type: 'string' },
                        riskLevels: { type: 'string' },
                        status: { type: 'string' }
                    }
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const query = request.query;
            try {
                const filters = {};
                if (query.dateRange) {
                    const [start, end] = query.dateRange.split(',');
                    filters.dateRange = { start: new Date(start), end: new Date(end) };
                }
                if (query.documentTypes) {
                    filters.documentTypes = query.documentTypes.split(',');
                }
                if (query.riskLevels) {
                    filters.riskLevels = query.riskLevels.split(',');
                }
                if (query.status) {
                    filters.status = query.status.split(',');
                }
                const dashboardData = await dashboardService_1.dashboardService.getDashboardData(user.id, filters);
                return reply.send({
                    success: true,
                    data: dashboardData
                });
            }
            catch (error) {
                logger.error('Failed to get dashboard data', { error: error.message, userId: user.id });
                throw error;
            }
        });
        server.get('/dashboard/team/:teamId', {
            preHandler: [middleware_1.authenticateToken],
            schema: {
                tags: ['Dashboard'],
                summary: 'Get team dashboard data',
                params: {
                    type: 'object',
                    properties: {
                        teamId: { type: 'string' }
                    },
                    required: ['teamId']
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const { teamId } = request.params;
            try {
                if (user.teamId !== teamId) {
                    return reply.status(403).send({
                        success: false,
                        error: 'FORBIDDEN',
                        message: 'Access denied to team dashboard'
                    });
                }
                const dashboardData = await dashboardService_1.dashboardService.getTeamDashboard(teamId);
                return reply.send({
                    success: true,
                    data: dashboardData
                });
            }
            catch (error) {
                logger.error('Failed to get team dashboard data', { error: error.message, teamId, userId: user.id });
                throw error;
            }
        });
    });
    server.register(async function (server) {
        server.post('/reports', {
            preHandler: [middleware_1.authenticateToken, (0, middleware_1.requireSubscription)(['professional', 'team', 'enterprise'])],
            schema: {
                tags: ['Reports'],
                summary: 'Generate report',
                body: {
                    type: 'object',
                    properties: {
                        type: { type: 'string', enum: ['analysis', 'dashboard', 'comparison', 'compliance', 'executive'] },
                        format: { type: 'string', enum: ['pdf', 'json', 'csv', 'xlsx', 'html'] },
                        analysisIds: { type: 'array', items: { type: 'string' } },
                        dateRange: {
                            type: 'object',
                            properties: {
                                start: { type: 'string', format: 'date-time' },
                                end: { type: 'string', format: 'date-time' }
                            }
                        },
                        options: {
                            type: 'object',
                            properties: {
                                includeCharts: { type: 'boolean' },
                                includeRawData: { type: 'boolean' },
                                includeRecommendations: { type: 'boolean' },
                                includeExecutiveSummary: { type: 'boolean' }
                            }
                        }
                    },
                    required: ['type', 'format']
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const body = reportRequestSchema.parse(request.body);
            try {
                const report = await reportGenerator_1.reportGenerator.generateReport({
                    type: body.type,
                    format: body.format,
                    userId: user.id,
                    teamId: user.teamId,
                    analysisIds: body.analysisIds,
                    dateRange: body.dateRange,
                    options: body.options
                });
                return reply.status(201).send({
                    success: true,
                    data: report
                });
            }
            catch (error) {
                logger.error('Failed to generate report', { error: error.message, userId: user.id });
                throw error;
            }
        });
        server.get('/reports', {
            preHandler: [middleware_1.authenticateToken],
            schema: {
                tags: ['Reports'],
                summary: 'List user reports',
                querystring: {
                    type: 'object',
                    properties: {
                        page: { type: 'string', default: '1' },
                        limit: { type: 'string', default: '20' },
                        type: { type: 'string' },
                        format: { type: 'string' }
                    }
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const query = request.query;
            try {
                const result = await reportGenerator_1.reportGenerator.listUserReports(user.id, {
                    page: parseInt(query.page) || 1,
                    limit: parseInt(query.limit) || 20,
                    type: query.type,
                    format: query.format
                });
                return reply.send({
                    success: true,
                    data: result.reports,
                    pagination: result.pagination
                });
            }
            catch (error) {
                logger.error('Failed to list user reports', { error: error.message, userId: user.id });
                throw error;
            }
        });
        server.get('/reports/:id', {
            preHandler: [middleware_1.authenticateToken],
            schema: {
                tags: ['Reports'],
                summary: 'Get report',
                params: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' }
                    },
                    required: ['id']
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const { id } = request.params;
            try {
                const report = await reportGenerator_1.reportGenerator.getReport(id, user.id);
                if (!report) {
                    return reply.status(404).send({
                        success: false,
                        error: 'NOT_FOUND',
                        message: 'Report not found'
                    });
                }
                return reply.send({
                    success: true,
                    data: report
                });
            }
            catch (error) {
                logger.error('Failed to get report', { error: error.message, reportId: id, userId: user.id });
                throw error;
            }
        });
        server.get('/reports/:id/download', {
            preHandler: [middleware_1.authenticateToken],
            schema: {
                tags: ['Reports'],
                summary: 'Download report',
                params: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' }
                    },
                    required: ['id']
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const { id } = request.params;
            try {
                const report = await reportGenerator_1.reportGenerator.getReport(id, user.id);
                if (!report) {
                    return reply.status(404).send({
                        success: false,
                        error: 'NOT_FOUND',
                        message: 'Report not found'
                    });
                }
                reply.type(report.mimeType);
                reply.header('Content-Disposition', `attachment; filename="${report.fileName}"`);
                const fs = require('fs');
                return reply.send(fs.createReadStream(report.filePath));
            }
            catch (error) {
                logger.error('Failed to download report', { error: error.message, reportId: id, userId: user.id });
                throw error;
            }
        });
    });
    server.register(async function (server) {
        server.post('/exports', {
            preHandler: [middleware_1.authenticateToken, (0, middleware_1.requireSubscription)(['professional', 'team', 'enterprise'])],
            schema: {
                tags: ['Exports'],
                summary: 'Create data export',
                body: {
                    type: 'object',
                    properties: {
                        type: { type: 'string', enum: ['analysis', 'findings', 'dashboard', 'compliance', 'bulk'] },
                        format: { type: 'string', enum: ['pdf', 'json', 'csv', 'xlsx', 'xml', 'zip'] },
                        analysisIds: { type: 'array', items: { type: 'string' } },
                        documentIds: { type: 'array', items: { type: 'string' } },
                        dateRange: {
                            type: 'object',
                            properties: {
                                start: { type: 'string', format: 'date-time' },
                                end: { type: 'string', format: 'date-time' }
                            }
                        },
                        filters: {
                            type: 'object',
                            properties: {
                                documentTypes: { type: 'array', items: { type: 'string' } },
                                riskLevels: { type: 'array', items: { type: 'string' } },
                                categories: { type: 'array', items: { type: 'string' } },
                                severities: { type: 'array', items: { type: 'string' } },
                                status: { type: 'array', items: { type: 'string' } }
                            }
                        },
                        options: {
                            type: 'object',
                            properties: {
                                includeMetadata: { type: 'boolean' },
                                includeRawData: { type: 'boolean' },
                                includeCharts: { type: 'boolean' },
                                includeRecommendations: { type: 'boolean' },
                                groupBy: { type: 'string', enum: ['document', 'category', 'severity', 'date'] },
                                sortBy: { type: 'string', enum: ['date', 'risk', 'title', 'type'] },
                                sortOrder: { type: 'string', enum: ['asc', 'desc'] }
                            }
                        }
                    },
                    required: ['type', 'format']
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const body = exportRequestSchema.parse(request.body);
            try {
                const exportResult = await exportService_1.exportService.exportData({
                    type: body.type,
                    format: body.format,
                    userId: user.id,
                    teamId: user.teamId,
                    analysisIds: body.analysisIds,
                    documentIds: body.documentIds,
                    dateRange: body.dateRange,
                    filters: body.filters,
                    options: body.options
                });
                return reply.status(201).send({
                    success: true,
                    data: exportResult
                });
            }
            catch (error) {
                logger.error('Failed to create export', { error: error.message, userId: user.id });
                throw error;
            }
        });
        server.get('/exports', {
            preHandler: [middleware_1.authenticateToken],
            schema: {
                tags: ['Exports'],
                summary: 'List user exports',
                querystring: {
                    type: 'object',
                    properties: {
                        page: { type: 'string', default: '1' },
                        limit: { type: 'string', default: '20' },
                        type: { type: 'string' },
                        format: { type: 'string' },
                        status: { type: 'string' }
                    }
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const query = request.query;
            try {
                const result = await exportService_1.exportService.listUserExports(user.id, {
                    page: parseInt(query.page) || 1,
                    limit: parseInt(query.limit) || 20,
                    type: query.type,
                    format: query.format,
                    status: query.status
                });
                return reply.send({
                    success: true,
                    data: result.exports,
                    pagination: result.pagination
                });
            }
            catch (error) {
                logger.error('Failed to list user exports', { error: error.message, userId: user.id });
                throw error;
            }
        });
        server.get('/exports/:id/download', {
            preHandler: [middleware_1.authenticateToken],
            schema: {
                tags: ['Exports'],
                summary: 'Download export',
                params: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' }
                    },
                    required: ['id']
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const { id } = request.params;
            try {
                const exportRecord = await exportService_1.exportService.getExport(id, user.id);
                if (!exportRecord) {
                    return reply.status(404).send({
                        success: false,
                        error: 'NOT_FOUND',
                        message: 'Export not found'
                    });
                }
                reply.type(exportRecord.mimeType);
                reply.header('Content-Disposition', `attachment; filename="${exportRecord.fileName}"`);
                const fs = require('fs');
                return reply.send(fs.createReadStream(exportRecord.filePath));
            }
            catch (error) {
                logger.error('Failed to download export', { error: error.message, exportId: id, userId: user.id });
                throw error;
            }
        });
    });
    server.register(async function (server) {
        server.post('/monitoring', {
            preHandler: [middleware_1.authenticateToken, (0, middleware_1.requireSubscription)(['professional', 'team', 'enterprise'])],
            schema: {
                tags: ['Change Monitoring'],
                summary: 'Create change monitor',
                body: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', format: 'uri' },
                        analysisId: { type: 'string' },
                        enabled: { type: 'boolean', default: true },
                        checkInterval: { type: 'number', minimum: 300, maximum: 86400 },
                        sensitivity: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
                        alertTypes: { type: 'array', items: { type: 'string', enum: ['email', 'webhook', 'websocket', 'sms'] } },
                        webhookUrl: { type: 'string', format: 'uri' },
                        emailRecipients: { type: 'array', items: { type: 'string', format: 'email' } },
                        schedule: { type: 'string' },
                        keywordsToWatch: { type: 'array', items: { type: 'string' } },
                        sectionsToWatch: { type: 'array', items: { type: 'string' } }
                    },
                    required: ['url', 'analysisId', 'checkInterval', 'alertTypes']
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const body = changeMonitorRequestSchema.parse(request.body);
            try {
                const monitor = await changeMonitor_1.changeMonitoringService.createMonitor({
                    url: body.url,
                    analysisId: body.analysisId,
                    userId: user.id,
                    teamId: user.teamId,
                    enabled: body.enabled,
                    checkInterval: body.checkInterval,
                    sensitivity: body.sensitivity,
                    alertTypes: body.alertTypes,
                    webhookUrl: body.webhookUrl,
                    emailRecipients: body.emailRecipients,
                    schedule: body.schedule,
                    keywordsToWatch: body.keywordsToWatch,
                    sectionsToWatch: body.sectionsToWatch
                });
                return reply.status(201).send({
                    success: true,
                    data: monitor
                });
            }
            catch (error) {
                logger.error('Failed to create change monitor', { error: error.message, userId: user.id });
                throw error;
            }
        });
        server.get('/monitoring', {
            preHandler: [middleware_1.authenticateToken],
            schema: {
                tags: ['Change Monitoring'],
                summary: 'List user change monitors',
                querystring: {
                    type: 'object',
                    properties: {
                        page: { type: 'string', default: '1' },
                        limit: { type: 'string', default: '20' },
                        status: { type: 'string' },
                        enabled: { type: 'string' }
                    }
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const query = request.query;
            try {
                const result = await changeMonitor_1.changeMonitoringService.listUserMonitors(user.id, {
                    page: parseInt(query.page) || 1,
                    limit: parseInt(query.limit) || 20,
                    status: query.status,
                    enabled: query.enabled === 'true' ? true : query.enabled === 'false' ? false : undefined
                });
                return reply.send({
                    success: true,
                    data: result.monitors,
                    pagination: result.pagination
                });
            }
            catch (error) {
                logger.error('Failed to list change monitors', { error: error.message, userId: user.id });
                throw error;
            }
        });
        server.get('/monitoring/:id', {
            preHandler: [middleware_1.authenticateToken],
            schema: {
                tags: ['Change Monitoring'],
                summary: 'Get change monitor',
                params: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' }
                    },
                    required: ['id']
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const { id } = request.params;
            try {
                const monitor = await changeMonitor_1.changeMonitoringService.getMonitor(id, user.id);
                if (!monitor) {
                    return reply.status(404).send({
                        success: false,
                        error: 'NOT_FOUND',
                        message: 'Change monitor not found'
                    });
                }
                return reply.send({
                    success: true,
                    data: monitor
                });
            }
            catch (error) {
                logger.error('Failed to get change monitor', { error: error.message, monitorId: id, userId: user.id });
                throw error;
            }
        });
        server.put('/monitoring/:id', {
            preHandler: [middleware_1.authenticateToken],
            schema: {
                tags: ['Change Monitoring'],
                summary: 'Update change monitor',
                params: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' }
                    },
                    required: ['id']
                },
                body: {
                    type: 'object',
                    properties: {
                        enabled: { type: 'boolean' },
                        checkInterval: { type: 'number' },
                        sensitivity: { type: 'string', enum: ['low', 'medium', 'high'] },
                        alertTypes: { type: 'array', items: { type: 'string' } },
                        webhookUrl: { type: 'string' },
                        emailRecipients: { type: 'array', items: { type: 'string' } }
                    }
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const { id } = request.params;
            const updates = request.body;
            try {
                const monitor = await changeMonitor_1.changeMonitoringService.updateMonitor(id, user.id, updates);
                return reply.send({
                    success: true,
                    data: monitor
                });
            }
            catch (error) {
                logger.error('Failed to update change monitor', { error: error.message, monitorId: id, userId: user.id });
                throw error;
            }
        });
        server.post('/monitoring/:id/check', {
            preHandler: [middleware_1.authenticateToken],
            schema: {
                tags: ['Change Monitoring'],
                summary: 'Perform manual check',
                params: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' }
                    },
                    required: ['id']
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const { id } = request.params;
            try {
                const result = await changeMonitor_1.changeMonitoringService.manualCheck(id, user.id);
                return reply.send({
                    success: true,
                    data: result,
                    message: result ? 'Changes detected' : 'No changes detected'
                });
            }
            catch (error) {
                logger.error('Failed to perform manual check', { error: error.message, monitorId: id, userId: user.id });
                throw error;
            }
        });
        server.get('/monitoring/:id/changes', {
            preHandler: [middleware_1.authenticateToken],
            schema: {
                tags: ['Change Monitoring'],
                summary: 'Get change history',
                params: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' }
                    },
                    required: ['id']
                },
                querystring: {
                    type: 'object',
                    properties: {
                        page: { type: 'string', default: '1' },
                        limit: { type: 'string', default: '20' },
                        changeType: { type: 'string' }
                    }
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const { id } = request.params;
            const query = request.query;
            try {
                const result = await changeMonitor_1.changeMonitoringService.getChangeHistory(id, user.id, {
                    page: parseInt(query.page) || 1,
                    limit: parseInt(query.limit) || 20,
                    changeType: query.changeType
                });
                return reply.send({
                    success: true,
                    data: result.changes,
                    pagination: result.pagination
                });
            }
            catch (error) {
                logger.error('Failed to get change history', { error: error.message, monitorId: id, userId: user.id });
                throw error;
            }
        });
    });
    server.register(async function (server) {
        server.post('/documents/process', {
            preHandler: [middleware_1.authenticateToken],
            schema: {
                tags: ['Document Processing'],
                summary: 'Process document',
                description: 'Process a document through the unified pipeline',
                consumes: ['multipart/form-data'],
                body: {
                    type: 'object',
                    properties: {
                        content: { type: 'string' },
                        url: { type: 'string', format: 'uri' },
                        title: { type: 'string' },
                        documentType: { type: 'string' },
                        language: { type: 'string' },
                        options: {
                            type: 'object',
                            properties: {
                                enableOCR: { type: 'boolean' },
                                preserveFormatting: { type: 'boolean' },
                                extractImages: { type: 'boolean' },
                                detectLanguage: { type: 'boolean' },
                                validateContent: { type: 'boolean' },
                                enableDuplicateDetection: { type: 'boolean' }
                            }
                        }
                    }
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const data = await request.file();
            try {
                let documentInput = {
                    userId: user.id,
                    teamId: user.teamId
                };
                if (data) {
                    const buffer = await data.toBuffer();
                    documentInput.fileBuffer = buffer;
                    documentInput.filename = data.filename;
                }
                else {
                    const body = request.body;
                    documentInput.content = body.content;
                    documentInput.url = body.url;
                    documentInput.title = body.title;
                    documentInput.documentType = body.documentType;
                    documentInput.language = body.language;
                    documentInput.options = body.options;
                }
                const processedDocument = await documentPipeline_1.documentPipeline.processDocument(documentInput);
                return reply.status(201).send({
                    success: true,
                    data: processedDocument
                });
            }
            catch (error) {
                logger.error('Failed to process document', { error: error.message, userId: user.id });
                throw error;
            }
        });
        server.get('/documents/:id', {
            preHandler: [middleware_1.authenticateToken],
            schema: {
                tags: ['Document Processing'],
                summary: 'Get processed document',
                params: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' }
                    },
                    required: ['id']
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const { id } = request.params;
            try {
                const document = await documentPipeline_1.documentPipeline.getDocument(id, user.id);
                if (!document) {
                    return reply.status(404).send({
                        success: false,
                        error: 'NOT_FOUND',
                        message: 'Document not found'
                    });
                }
                return reply.send({
                    success: true,
                    data: document
                });
            }
            catch (error) {
                logger.error('Failed to get document', { error: error.message, documentId: id, userId: user.id });
                throw error;
            }
        });
        server.get('/documents/search', {
            preHandler: [middleware_1.authenticateToken],
            schema: {
                tags: ['Document Processing'],
                summary: 'Search documents',
                querystring: {
                    type: 'object',
                    properties: {
                        text: { type: 'string' },
                        documentType: { type: 'string' },
                        language: { type: 'string' },
                        limit: { type: 'string', default: '20' },
                        offset: { type: 'string', default: '0' }
                    }
                }
            }
        }, async (request, reply) => {
            const user = request.user;
            const query = request.query;
            try {
                const documents = await documentPipeline_1.documentPipeline.searchDocuments(user.id, {
                    text: query.text,
                    documentType: query.documentType,
                    language: query.language,
                    limit: parseInt(query.limit) || 20,
                    offset: parseInt(query.offset) || 0
                });
                return reply.send({
                    success: true,
                    data: documents
                });
            }
            catch (error) {
                logger.error('Failed to search documents', { error: error.message, userId: user.id });
                throw error;
            }
        });
    });
}
//# sourceMappingURL=unified.js.map