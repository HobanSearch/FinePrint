import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { QualityAssuranceService } from '@/services/quality-assurance-service';
import { QualityAssessmentRequestSchema, APIResponse } from '@/types';
import { Logger } from '@/utils/logger';

const logger = Logger.getInstance();
const qualityService = new QualityAssuranceService();

export default async function qualityRoutes(fastify: FastifyInstance): Promise<void> {
  
  /**
   * Assess code quality
   */
  fastify.post('/assess', {
    schema: {
      body: QualityAssessmentRequestSchema,
    },
    preHandler: fastify.auth([fastify.verifyJWT]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      logger.info('Quality assessment request received', {
        userId: request.user?.id,
        language: request.body.language,
        codeLength: request.body.code.length,
      });

      const result = await qualityService.assessCode(request.body as any);

      logger.info('Quality assessment completed', {
        requestId: result.id,
        overallScore: result.overallScore,
        issuesCount: result.assessments.reduce((sum, a) => sum + a.issues.length, 0),
      });

      const response: APIResponse = {
        success: true,
        data: result,
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Quality assessment failed', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'QUALITY_ASSESSMENT_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });

  /**
   * Auto-fix code issues
   */
  fastify.post('/autofix', {
    schema: {
      body: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          language: { type: 'string' },
          issues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                severity: { type: 'string' },
                message: { type: 'string' },
                line: { type: 'number' },
                column: { type: 'number' },
                fixSuggestion: { type: 'string' },
              },
            },
          },
        },
        required: ['code', 'language', 'issues'],
      },
    },
    preHandler: fastify.auth([fastify.verifyJWT]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { code, language, issues } = request.body as {
        code: string;
        language: string;
        issues: any[];
      };

      logger.info('Auto-fix request received', {
        userId: request.user?.id,
        language,
        issuesCount: issues.length,
      });

      const result = await qualityService.autoFix(code, language, issues);

      logger.info('Auto-fix completed', {
        appliedFixesCount: result.appliedFixes.length,
        remainingIssuesCount: result.remainingIssues.length,
      });

      const response: APIResponse = {
        success: true,
        data: result,
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Auto-fix failed', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'AUTO_FIX_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });

  /**
   * Generate quality report
   */
  fastify.post('/report', {
    schema: {
      body: {
        type: 'object',
        properties: {
          results: {
            type: 'array',
            items: { type: 'object' },
          },
          format: {
            type: 'string',
            enum: ['json', 'html', 'markdown'],
            default: 'json',
          },
        },
        required: ['results'],
      },
    },
    preHandler: fastify.auth([fastify.verifyJWT]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { results, format = 'json' } = request.body as {
        results: any[];
        format?: 'json' | 'html' | 'markdown';
      };

      logger.info('Quality report generation request received', {
        userId: request.user?.id,
        resultsCount: results.length,
        format,
      });

      const report = await qualityService.generateReport(results, format);

      logger.info('Quality report generated', {
        format,
        reportLength: report.length,
      });

      const contentType = {
        json: 'application/json',
        html: 'text/html',
        markdown: 'text/markdown',
      }[format];

      if (format === 'json') {
        const response: APIResponse = {
          success: true,
          data: { report: JSON.parse(report) },
        };
        return reply.send(response);
      } else {
        return reply
          .header('Content-Type', contentType)
          .send(report);
      }
    } catch (error) {
      logger.error('Quality report generation failed', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'QUALITY_REPORT_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });

  /**
   * Get quality standards and rules
   */
  fastify.get('/standards', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const response: APIResponse = {
        success: true,
        data: {
          checkTypes: [
            'syntax',
            'formatting',
            'security',
            'performance',
            'accessibility',
            'best_practices',
            'testing',
            'documentation',
          ],
          severityLevels: [
            'info',
            'warning',
            'error',
            'critical',
          ],
          languages: [
            'typescript',
            'javascript',
            'python',
            'java',
            'go',
            'rust',
            'php',
            'ruby',
            'html',
            'css',
            'json',
            'yaml',
          ],
          frameworks: [
            'react',
            'vue',
            'angular',
            'svelte',
            'express',
            'fastify',
            'django',
            'flask',
            'spring',
          ],
          qualityThresholds: {
            minimum: 60,
            good: 80,
            excellent: 90,
          },
          metrics: [
            'complexity',
            'maintainability_index',
            'test_coverage',
            'duplicated_lines',
            'technical_debt',
            'security_score',
            'accessibility_score',
          ],
        },
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Failed to get quality standards', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'QUALITY_STANDARDS_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });

  /**
   * Get quality metrics for code
   */
  fastify.post('/metrics', {
    schema: {
      body: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          language: { type: 'string' },
        },
        required: ['code', 'language'],
      },
    },
    preHandler: fastify.auth([fastify.verifyJWT]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { code, language } = request.body as {
        code: string;
        language: string;
      };

      logger.info('Quality metrics request received', {
        userId: request.user?.id,
        language,
        codeLength: code.length,
      });

      // This would calculate actual metrics
      const metrics = {
        linesOfCode: code.split('\n').length,
        complexity: 1,
        maintainabilityIndex: 85,
        testCoverage: 0,
        duplicatedLines: 0,
        technicalDebt: 0,
        securityScore: 90,
        accessibilityScore: 85,
      };

      logger.info('Quality metrics calculated', {
        linesOfCode: metrics.linesOfCode,
        complexity: metrics.complexity,
        maintainabilityIndex: metrics.maintainabilityIndex,
      });

      const response: APIResponse = {
        success: true,
        data: { metrics },
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Quality metrics calculation failed', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'QUALITY_METRICS_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });

  /**
   * Get quality history
   */
  fastify.get('/history', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 50 },
          offset: { type: 'number', default: 0 },
          language: { type: 'string' },
        },
      },
    },
    preHandler: fastify.auth([fastify.verifyJWT]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { limit = 50, offset = 0, language } = request.query as {
        limit?: number;
        offset?: number;
        language?: string;
      };

      logger.info('Quality history request received', {
        userId: request.user?.id,
        limit,
        offset,
        language,
      });

      // This would query the database
      const response: APIResponse = {
        success: true,
        data: {
          assessments: [],
          total: 0,
          limit,
          offset,
        },
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Failed to get quality history', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'QUALITY_HISTORY_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });
}