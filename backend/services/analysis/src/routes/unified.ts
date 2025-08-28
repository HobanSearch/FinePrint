import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { authenticateToken, requireSubscription } from '@fineprintai/shared-middleware';
import type { AuthenticatedRequest } from '@fineprintai/shared-types';
import { unifiedAnalysisEngine } from '../services/analysisEngine';
import { documentPipeline } from '../services/documentPipeline';
import { dashboardService } from '../services/dashboardService';
import { reportGenerator } from '../services/reportGenerator';
import { changeMonitoringService } from '../services/changeMonitor';
import { exportService } from '../services/exportService';

const logger = createServiceLogger('unified-routes');

// Request schemas
const unifiedAnalysisRequestSchema = z.object({
  content: z.string().optional(),
  url: z.string().url().optional(),
  documentType: z.enum(['terms_of_service', 'privacy_policy', 'eula', 'cookie_policy', 'data_processing_agreement', 'service_agreement', 'other']).optional(),
  language: z.string().default('en'),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  options: z.object({
    modelPreference: z.enum(['speed', 'accuracy', 'balanced']).optional(),
    includeEmbeddings: z.boolean().optional(),
    includeSimilarDocuments: z.boolean().optional(),
    enableChangeMonitoring: z.boolean().optional(),
    generateReport: z.boolean().optional(),
    customPatterns: z.array(z.string()).optional(),
    webhookUrl: z.string().url().optional()
  }).optional()
}).refine(data => data.content || data.url, {
  message: "Either 'content' or 'url' must be provided",
});

const dashboardFiltersSchema = z.object({
  dateRange: z.object({
    start: z.string().transform(str => new Date(str)),
    end: z.string().transform(str => new Date(str))
  }).optional(),
  documentTypes: z.array(z.string()).optional(),
  riskLevels: z.array(z.string()).optional(),
  status: z.array(z.string()).optional()
});

const reportRequestSchema = z.object({
  type: z.enum(['analysis', 'dashboard', 'comparison', 'compliance', 'executive']),
  format: z.enum(['pdf', 'json', 'csv', 'xlsx', 'html']),
  analysisIds: z.array(z.string()).optional(),
  dateRange: z.object({
    start: z.string().transform(str => new Date(str)),
    end: z.string().transform(str => new Date(str))
  }).optional(),
  options: z.object({
    includeCharts: z.boolean().optional(),
    includeRawData: z.boolean().optional(),
    includeRecommendations: z.boolean().optional(),
    includeExecutiveSummary: z.boolean().optional(),
    branding: z.object({
      companyName: z.string().optional(),
      colors: z.object({
        primary: z.string(),
        secondary: z.string()
      }).optional()
    }).optional()
  }).optional()
});

const exportRequestSchema = z.object({
  type: z.enum(['analysis', 'findings', 'dashboard', 'compliance', 'bulk']),
  format: z.enum(['pdf', 'json', 'csv', 'xlsx', 'xml', 'zip']),
  analysisIds: z.array(z.string()).optional(),
  documentIds: z.array(z.string()).optional(),
  dateRange: z.object({
    start: z.string().transform(str => new Date(str)),
    end: z.string().transform(str => new Date(str))
  }).optional(),
  filters: z.object({
    documentTypes: z.array(z.string()).optional(),
    riskLevels: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    severities: z.array(z.string()).optional(),
    status: z.array(z.string()).optional()
  }).optional(),
  options: z.object({
    includeMetadata: z.boolean().optional(),
    includeRawData: z.boolean().optional(),
    includeCharts: z.boolean().optional(),
    includeRecommendations: z.boolean().optional(),
    groupBy: z.enum(['document', 'category', 'severity', 'date']).optional(),
    sortBy: z.enum(['date', 'risk', 'title', 'type']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional()
  }).optional()
});

const changeMonitorRequestSchema = z.object({
  url: z.string().url(),
  analysisId: z.string(),
  enabled: z.boolean().default(true),
  checkInterval: z.number().min(300).max(86400), // 5 minutes to 24 hours
  sensitivity: z.enum(['low', 'medium', 'high']).default('medium'),
  alertTypes: z.array(z.enum(['email', 'webhook', 'websocket', 'sms'])),
  webhookUrl: z.string().url().optional(),
  emailRecipients: z.array(z.string().email()).optional(),
  schedule: z.string().optional(),
  keywordsToWatch: z.array(z.string()).optional(),
  sectionsToWatch: z.array(z.string()).optional()
});

export async function unifiedRoutes(server: FastifyInstance) {
  // Unified Analysis Routes
  server.register(async function(server) {
    // Create unified analysis
    server.post('/unified/analysis', {
      preHandler: [authenticateToken, requireSubscription(['starter', 'professional', 'team', 'enterprise'])],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const body = unifiedAnalysisRequestSchema.parse(request.body);

      try {
        const result = await unifiedAnalysisEngine.createAnalysis({
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

      } catch (error) {
        logger.error('Failed to create unified analysis', { error: error.message, userId: user.id });
        throw error;
      }
    });

    // Get unified analysis
    server.get('/unified/analysis/:id', {
      preHandler: [authenticateToken],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };

      try {
        const analysis = await unifiedAnalysisEngine.getAnalysis(id, user.id);
        
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

      } catch (error) {
        logger.error('Failed to get unified analysis', { error: error.message, analysisId: id, userId: user.id });
        throw error;
      }
    });

    // List user analyses
    server.get('/unified/analysis', {
      preHandler: [authenticateToken],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const query = request.query as any;

      try {
        const result = await unifiedAnalysisEngine.getUserAnalyses(user.id, {
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

      } catch (error) {
        logger.error('Failed to list user analyses', { error: error.message, userId: user.id });
        throw error;
      }
    });

    // Cancel analysis
    server.delete('/unified/analysis/:id', {
      preHandler: [authenticateToken],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };

      try {
        const cancelled = await unifiedAnalysisEngine.cancelAnalysis(id, user.id);
        
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

      } catch (error) {
        logger.error('Failed to cancel analysis', { error: error.message, analysisId: id, userId: user.id });
        throw error;
      }
    });
  });

  // Dashboard Routes
  server.register(async function(server) {
    // Get dashboard data
    server.get('/dashboard', {
      preHandler: [authenticateToken],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const query = request.query as any;

      try {
        // Parse filters from query string
        const filters: any = {};
        
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

        const dashboardData = await dashboardService.getDashboardData(user.id, filters);

        return reply.send({
          success: true,
          data: dashboardData
        });

      } catch (error) {
        logger.error('Failed to get dashboard data', { error: error.message, userId: user.id });
        throw error;
      }
    });

    // Get team dashboard
    server.get('/dashboard/team/:teamId', {
      preHandler: [authenticateToken],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const { teamId } = request.params as { teamId: string };

      try {
        // Verify user has access to team
        if (user.teamId !== teamId) {
          return reply.status(403).send({
            success: false,
            error: 'FORBIDDEN',
            message: 'Access denied to team dashboard'
          });
        }

        const dashboardData = await dashboardService.getTeamDashboard(teamId);

        return reply.send({
          success: true,
          data: dashboardData
        });

      } catch (error) {
        logger.error('Failed to get team dashboard data', { error: error.message, teamId, userId: user.id });
        throw error;
      }
    });
  });

  // Report Generation Routes
  server.register(async function(server) {
    // Generate report
    server.post('/reports', {
      preHandler: [authenticateToken, requireSubscription(['professional', 'team', 'enterprise'])],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const body = reportRequestSchema.parse(request.body);

      try {
        const report = await reportGenerator.generateReport({
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

      } catch (error) {
        logger.error('Failed to generate report', { error: error.message, userId: user.id });
        throw error;
      }
    });

    // List user reports
    server.get('/reports', {
      preHandler: [authenticateToken],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const query = request.query as any;

      try {
        const result = await reportGenerator.listUserReports(user.id, {
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

      } catch (error) {
        logger.error('Failed to list user reports', { error: error.message, userId: user.id });
        throw error;
      }
    });

    // Get report
    server.get('/reports/:id', {
      preHandler: [authenticateToken],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };

      try {
        const report = await reportGenerator.getReport(id, user.id);
        
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

      } catch (error) {
        logger.error('Failed to get report', { error: error.message, reportId: id, userId: user.id });
        throw error;
      }
    });

    // Download report
    server.get('/reports/:id/download', {
      preHandler: [authenticateToken],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };

      try {
        const report = await reportGenerator.getReport(id, user.id);
        
        if (!report) {
          return reply.status(404).send({
            success: false,
            error: 'NOT_FOUND',
            message: 'Report not found'
          });
        }

        // Stream the file
        reply.type(report.mimeType);
        reply.header('Content-Disposition', `attachment; filename="${report.fileName}"`);
        
        const fs = require('fs');
        return reply.send(fs.createReadStream(report.filePath));

      } catch (error) {
        logger.error('Failed to download report', { error: error.message, reportId: id, userId: user.id });
        throw error;
      }
    });
  });

  // Export Routes
  server.register(async function(server) {
    // Create export
    server.post('/exports', {
      preHandler: [authenticateToken, requireSubscription(['professional', 'team', 'enterprise'])],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const body = exportRequestSchema.parse(request.body);

      try {
        const exportResult = await exportService.exportData({
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

      } catch (error) {
        logger.error('Failed to create export', { error: error.message, userId: user.id });
        throw error;
      }
    });

    // List user exports
    server.get('/exports', {
      preHandler: [authenticateToken],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const query = request.query as any;

      try {
        const result = await exportService.listUserExports(user.id, {
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

      } catch (error) {
        logger.error('Failed to list user exports', { error: error.message, userId: user.id });
        throw error;
      }
    });

    // Download export
    server.get('/exports/:id/download', {
      preHandler: [authenticateToken],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };

      try {
        const exportRecord = await exportService.getExport(id, user.id);
        
        if (!exportRecord) {
          return reply.status(404).send({
            success: false,
            error: 'NOT_FOUND',
            message: 'Export not found'
          });
        }

        // Stream the file
        reply.type(exportRecord.mimeType);
        reply.header('Content-Disposition', `attachment; filename="${exportRecord.fileName}"`);
        
        const fs = require('fs');
        return reply.send(fs.createReadStream(exportRecord.filePath));

      } catch (error) {
        logger.error('Failed to download export', { error: error.message, exportId: id, userId: user.id });
        throw error;
      }
    });
  });

  // Change Monitoring Routes
  server.register(async function(server) {
    // Create change monitor
    server.post('/monitoring', {
      preHandler: [authenticateToken, requireSubscription(['professional', 'team', 'enterprise'])],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const body = changeMonitorRequestSchema.parse(request.body);

      try {
        const monitor = await changeMonitoringService.createMonitor({
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

      } catch (error) {
        logger.error('Failed to create change monitor', { error: error.message, userId: user.id });
        throw error;
      }
    });

    // List user change monitors
    server.get('/monitoring', {
      preHandler: [authenticateToken],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const query = request.query as any;

      try {
        const result = await changeMonitoringService.listUserMonitors(user.id, {
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

      } catch (error) {
        logger.error('Failed to list change monitors', { error: error.message, userId: user.id });
        throw error;
      }
    });

    // Get change monitor
    server.get('/monitoring/:id', {
      preHandler: [authenticateToken],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };

      try {
        const monitor = await changeMonitoringService.getMonitor(id, user.id);
        
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

      } catch (error) {
        logger.error('Failed to get change monitor', { error: error.message, monitorId: id, userId: user.id });
        throw error;
      }
    });

    // Update change monitor
    server.put('/monitoring/:id', {
      preHandler: [authenticateToken],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };
      const updates = request.body as any;

      try {
        const monitor = await changeMonitoringService.updateMonitor(id, user.id, updates);

        return reply.send({
          success: true,
          data: monitor
        });

      } catch (error) {
        logger.error('Failed to update change monitor', { error: error.message, monitorId: id, userId: user.id });
        throw error;
      }
    });

    // Manual check
    server.post('/monitoring/:id/check', {
      preHandler: [authenticateToken],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };

      try {
        const result = await changeMonitoringService.manualCheck(id, user.id);

        return reply.send({
          success: true,
          data: result,
          message: result ? 'Changes detected' : 'No changes detected'
        });

      } catch (error) {
        logger.error('Failed to perform manual check', { error: error.message, monitorId: id, userId: user.id });
        throw error;
      }
    });

    // Get change history
    server.get('/monitoring/:id/changes', {
      preHandler: [authenticateToken],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };
      const query = request.query as any;

      try {
        const result = await changeMonitoringService.getChangeHistory(id, user.id, {
          page: parseInt(query.page) || 1,
          limit: parseInt(query.limit) || 20,
          changeType: query.changeType
        });

        return reply.send({
          success: true,
          data: result.changes,
          pagination: result.pagination
        });

      } catch (error) {
        logger.error('Failed to get change history', { error: error.message, monitorId: id, userId: user.id });
        throw error;
      }
    });
  });

  // Document Pipeline Routes
  server.register(async function(server) {
    // Process document
    server.post('/documents/process', {
      preHandler: [authenticateToken],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const data = await request.file();

      try {
        let documentInput: any = {
          userId: user.id,
          teamId: user.teamId
        };

        if (data) {
          // File upload
          const buffer = await data.toBuffer();
          documentInput.fileBuffer = buffer;
          documentInput.filename = data.filename;
        } else {
          // Direct content or URL
          const body = request.body as any;
          documentInput.content = body.content;
          documentInput.url = body.url;
          documentInput.title = body.title;
          documentInput.documentType = body.documentType;
          documentInput.language = body.language;
          documentInput.options = body.options;
        }

        const processedDocument = await documentPipeline.processDocument(documentInput);

        return reply.status(201).send({
          success: true,
          data: processedDocument
        });

      } catch (error) {
        logger.error('Failed to process document', { error: error.message, userId: user.id });
        throw error;
      }
    });

    // Get processed document
    server.get('/documents/:id', {
      preHandler: [authenticateToken],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };

      try {
        const document = await documentPipeline.getDocument(id, user.id);
        
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

      } catch (error) {
        logger.error('Failed to get document', { error: error.message, documentId: id, userId: user.id });
        throw error;
      }
    });

    // Search documents
    server.get('/documents/search', {
      preHandler: [authenticateToken],
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
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as AuthenticatedRequest).user;
      const query = request.query as any;

      try {
        const documents = await documentPipeline.searchDocuments(user.id, {
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

      } catch (error) {
        logger.error('Failed to search documents', { error: error.message, userId: user.id });
        throw error;
      }
    });
  });
}