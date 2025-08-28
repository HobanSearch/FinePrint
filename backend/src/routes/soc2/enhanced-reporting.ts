/**
 * Fine Print AI - Enhanced SOC2 Reporting API Routes
 */

import { FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { EnhancedSOC2ReportingService } from '../../services/soc2/enhanced-reporting';
import { logger } from '../../utils/logger';

const enhancedReportingRoutes: FastifyPluginAsync = async (fastify) => {
  const prisma = new PrismaClient();
  const reportingService = new EnhancedSOC2ReportingService(prisma);

  // Schema definitions
  const generateReportSchema = {
    type: 'object',
    properties: {
      reportType: {
        type: 'string',
        enum: ['readiness', 'gap_analysis', 'continuous'],
      },
      scope: {
        type: 'array',
        items: { type: 'string' },
        default: ['security', 'availability', 'processing_integrity', 'confidentiality', 'privacy'],
      },
      period: {
        type: 'string',
        enum: ['daily', 'weekly', 'monthly'],
        default: 'monthly',
      },
      targetFramework: {
        type: 'string',
        enum: ['soc2_type1', 'soc2_type2', 'iso27001', 'nist'],
        default: 'soc2_type2',
      },
      options: {
        type: 'object',
        properties: {
          includeEvidence: { type: 'boolean', default: true },
          includeTrends: { type: 'boolean', default: true },
          format: {
            type: 'string',
            enum: ['json', 'html', 'pdf', 'docx', 'xlsx'],
            default: 'json',
          },
        },
      },
    },
    required: ['reportType'],
  };

  /**
   * Generate audit readiness report
   */
  fastify.post('/generate/readiness', {
    schema: {
      description: 'Generate comprehensive audit readiness report',
      tags: ['SOC2 Enhanced Reporting'],
      body: {
        type: 'object',
        properties: {
          scope: {
            type: 'array',
            items: { type: 'string' },
            default: ['security', 'availability', 'processing_integrity', 'confidentiality', 'privacy'],
          },
          options: {
            type: 'object',
            properties: {
              includeEvidence: { type: 'boolean', default: true },
              includeTrends: { type: 'boolean', default: true },
              format: {
                type: 'string',
                enum: ['json', 'html', 'pdf'],
                default: 'json',
              },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            reportId: { type: 'string' },
            report: { type: 'object' },
            exportPath: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { scope = ['security', 'availability', 'processing_integrity', 'confidentiality', 'privacy'], options = {} } = request.body as any;

      logger.info('Generating audit readiness report', { scope, options });

      const report = await reportingService.generateAuditReadinessReport(scope, options);

      return reply.send({
        success: true,
        reportId: report.id,
        report,
        exportPath: options.format !== 'json' ? `./reports/${report.id}.${options.format}` : null,
      });
    } catch (error) {
      logger.error('Error generating audit readiness report:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to generate audit readiness report',
      });
    }
  });

  /**
   * Generate gap analysis report
   */
  fastify.post('/generate/gap-analysis', {
    schema: {
      description: 'Generate gap analysis report against target framework',
      tags: ['SOC2 Enhanced Reporting'],
      body: {
        type: 'object',
        properties: {
          targetFramework: {
            type: 'string',
            enum: ['soc2_type1', 'soc2_type2', 'iso27001', 'nist'],
          },
          scope: {
            type: 'array',
            items: { type: 'string' },
            default: ['security', 'availability', 'processing_integrity', 'confidentiality', 'privacy'],
          },
          format: {
            type: 'string',
            enum: ['json', 'html', 'pdf'],
            default: 'json',
          },
        },
        required: ['targetFramework'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            reportId: { type: 'string' },
            report: { type: 'object' },
            exportPath: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { targetFramework, scope = ['security', 'availability', 'processing_integrity', 'confidentiality', 'privacy'], format = 'json' } = request.body as any;

      logger.info('Generating gap analysis report', { targetFramework, scope });

      const report = await reportingService.generateGapAnalysisReport(targetFramework, scope);

      // Export if non-JSON format requested
      let exportPath = null;
      if (format !== 'json') {
        exportPath = await reportingService.exportReport(report, format);
      }

      return reply.send({
        success: true,
        reportId: report.id,
        report,
        exportPath,
      });
    } catch (error) {
      logger.error('Error generating gap analysis report:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to generate gap analysis report',
      });
    }
  });

  /**
   * Generate continuous monitoring report
   */
  fastify.post('/generate/continuous', {
    schema: {
      description: 'Generate continuous monitoring report for specified period',
      tags: ['SOC2 Enhanced Reporting'],
      body: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['daily', 'weekly', 'monthly'],
          },
          scope: {
            type: 'array',
            items: { type: 'string' },
            default: ['security', 'availability', 'processing_integrity', 'confidentiality', 'privacy'],
          },
          format: {
            type: 'string',
            enum: ['json', 'html', 'pdf'],
            default: 'json',
          },
        },
        required: ['period'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            reportId: { type: 'string' },
            report: { type: 'object' },
            exportPath: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { period, scope = ['security', 'availability', 'processing_integrity', 'confidentiality', 'privacy'], format = 'json' } = request.body as any;

      logger.info('Generating continuous monitoring report', { period, scope });

      const report = await reportingService.generateContinuousMonitoringReport(period, scope);

      // Export if non-JSON format requested
      let exportPath = null;
      if (format !== 'json') {
        exportPath = await reportingService.exportReport(report, format);
      }

      return reply.send({
        success: true,
        reportId: report.id,
        report,
        exportPath,
      });
    } catch (error) {
      logger.error('Error generating continuous monitoring report:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to generate continuous monitoring report',
      });
    }
  });

  /**
   * Get historical reports
   */
  fastify.get('/reports', {
    schema: {
      description: 'Get list of generated reports with filtering',
      tags: ['SOC2 Enhanced Reporting'],
      querystring: {
        type: 'object',
        properties: {
          reportType: {
            type: 'string',
            enum: ['readiness', 'gap_analysis', 'continuous', 'annual'],
          },
          scope: { type: 'string' },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' },
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            reports: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  reportType: { type: 'string' },
                  scope: { type: 'array', items: { type: 'string' } },
                  summary: { type: 'object' },
                  generatedAt: { type: 'string', format: 'date-time' },
                  generatedBy: { type: 'string' },
                },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                pages: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { reportType, scope, startDate, endDate, page = 1, limit = 20 } = request.query as any;

      const whereClause: any = {};
      
      if (reportType) whereClause.reportType = reportType;
      if (scope) whereClause.scope = { has: scope };
      if (startDate || endDate) {
        whereClause.generatedAt = {};
        if (startDate) whereClause.generatedAt.gte = new Date(startDate);
        if (endDate) whereClause.generatedAt.lte = new Date(endDate);
      }

      const [reports, total] = await Promise.all([
        prisma.sOC2Report.findMany({
          where: whereClause,
          select: {
            id: true,
            reportType: true,
            scope: true,
            summary: true,
            generatedAt: true,
            generatedBy: true,
          },
          orderBy: { generatedAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.sOC2Report.count({ where: whereClause }),
      ]);

      return reply.send({
        success: true,
        reports,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error('Error fetching reports:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch reports',
      });
    }
  });

  /**
   * Get specific report details
   */
  fastify.get('/reports/:reportId', {
    schema: {
      description: 'Get detailed report by ID',
      tags: ['SOC2 Enhanced Reporting'],
      params: {
        type: 'object',
        properties: {
          reportId: { type: 'string' },
        },
        required: ['reportId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            report: { type: 'object' },
          },
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { reportId } = request.params as any;

      const report = await prisma.sOC2Report.findUnique({
        where: { id: reportId },
      });

      if (!report) {
        return reply.status(404).send({
          success: false,
          error: 'Report not found',
        });
      }

      return reply.send({
        success: true,
        report,
      });
    } catch (error) {
      logger.error('Error fetching report:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch report',
      });
    }
  });

  /**
   * Export existing report in different format
   */
  fastify.post('/reports/:reportId/export', {
    schema: {
      description: 'Export existing report in specified format',
      tags: ['SOC2 Enhanced Reporting'],
      params: {
        type: 'object',
        properties: {
          reportId: { type: 'string' },
        },
        required: ['reportId'],
      },
      body: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['html', 'pdf', 'docx', 'xlsx'],
          },
        },
        required: ['format'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            exportPath: { type: 'string' },
            downloadUrl: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { reportId } = request.params as any;
      const { format } = request.body as any;

      // Get report from database
      const reportData = await prisma.sOC2Report.findUnique({
        where: { id: reportId },
      });

      if (!reportData) {
        return reply.status(404).send({
          success: false,
          error: 'Report not found',
        });
      }

      // Convert database record to AuditReport format
      const report = {
        id: reportData.id,
        reportType: reportData.reportType,
        period: {
          startDate: reportData.startDate,
          endDate: reportData.endDate,
        },
        scope: reportData.scope,
        summary: reportData.summary,
        findings: reportData.findings,
        recommendations: reportData.recommendations,
        evidenceGaps: reportData.evidenceGaps,
        trendAnalysis: reportData.trendAnalysis,
        generatedAt: reportData.generatedAt,
        generatedBy: reportData.generatedBy,
      };

      // Export report
      const exportPath = await reportingService.exportReport(report as any, format);
      const downloadUrl = `/api/soc2/enhanced-reporting/downloads/${reportId}.${format}`;

      return reply.send({
        success: true,
        exportPath,
        downloadUrl,
      });
    } catch (error) {
      logger.error('Error exporting report:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to export report',
      });
    }
  });

  /**
   * Get trend analysis for controls
   */
  fastify.get('/trends', {
    schema: {
      description: 'Get trend analysis for controls over time',
      tags: ['SOC2 Enhanced Reporting'],
      querystring: {
        type: 'object',
        properties: {
          scope: {
            type: 'array',
            items: { type: 'string' },
          },
          timeframe: {
            type: 'string',
            enum: ['30d', '90d', '180d', '365d'],
            default: '90d',
          },
          controlIds: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            trendAnalysis: { type: 'object' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { scope = ['security', 'availability', 'processing_integrity', 'confidentiality', 'privacy'], timeframe = '90d', controlIds } = request.query as any;

      // Calculate date range
      const days = parseInt(timeframe.replace('d', ''));
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      // Generate trend analysis (this would use the private method in the service)
      // For now, we'll create a simplified version
      const trends = {
        timeframe: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
        overallTrend: 'stable',
        controlTrends: [],
        industryBenchmarks: [],
        seasonalPatterns: [],
        predictiveInsights: [],
      };

      return reply.send({
        success: true,
        trendAnalysis: trends,
      });
    } catch (error) {
      logger.error('Error generating trend analysis:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to generate trend analysis',
      });
    }
  });

  /**
   * Get compliance score history
   */
  fastify.get('/compliance-scores/history', {
    schema: {
      description: 'Get compliance score history over time',
      tags: ['SOC2 Enhanced Reporting'],
      querystring: {
        type: 'object',
        properties: {
          timeframe: {
            type: 'string',
            enum: ['30d', '90d', '180d', '365d'],
            default: '90d',
          },
          category: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            scoreHistory: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string', format: 'date' },
                  overallScore: { type: 'number' },
                  categoryScores: { type: 'object' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { timeframe = '90d', category } = request.query as any;

      // Calculate date range
      const days = parseInt(timeframe.replace('d', ''));
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      // Get historical monitoring data
      const monitoringData = await prisma.sOC2MonitoringData.findMany({
        where: {
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
          ...(category && { category }),
        },
        orderBy: { timestamp: 'asc' },
      });

      // Transform data for response
      const scoreHistory = monitoringData.map(data => ({
        date: data.timestamp.toISOString().split('T')[0],
        overallScore: data.overallScore,
        categoryScores: data.categoryScores,
      }));

      return reply.send({
        success: true,
        scoreHistory,
      });
    } catch (error) {
      logger.error('Error fetching compliance score history:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch compliance score history',
      });
    }
  });

  /**
   * Download exported report file
   */
  fastify.get('/downloads/:filename', {
    schema: {
      description: 'Download exported report file',
      tags: ['SOC2 Enhanced Reporting'],
      params: {
        type: 'object',
        properties: {
          filename: { type: 'string' },
        },
        required: ['filename'],
      },
    },
  }, async (request, reply) => {
    try {
      const { filename } = request.params as any;
      const filepath = `./reports/${filename}`;

      // Check if file exists
      try {
        await require('fs').promises.access(filepath);
      } catch {
        return reply.status(404).send({
          success: false,
          error: 'File not found',
        });
      }

      // Set appropriate headers
      const extension = filename.split('.').pop();
      const contentTypes: Record<string, string> = {
        'html': 'text/html',
        'pdf': 'application/pdf',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'json': 'application/json',
      };

      reply.header('Content-Type', contentTypes[extension || 'json'] || 'application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);

      return reply.sendFile(filename, './reports');
    } catch (error) {
      logger.error('Error downloading file:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to download file',
      });
    }
  });
};

export default enhancedReportingRoutes;