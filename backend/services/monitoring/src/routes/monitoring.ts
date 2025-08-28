import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { tosMonitoringService } from '../services/tosMonitoring';
import { changeDetectionEngine } from '../services/changeDetection';
import { documentCrawlerService } from '../services/documentCrawler';
import { schedulerService } from '../services/scheduler';
import { mongoChangeStreamService } from '../services/mongoChangeStream';
import { TracingUtils } from '../monitoring/tracing';
import { metricsCollector } from '../monitoring/metrics';

// Request/Response schemas
const createMonitoringJobSchema = {
  body: {
    type: 'object',
    required: ['documentId', 'url', 'userId', 'frequency'],
    properties: {
      documentId: { type: 'string' },
      url: { type: 'string', format: 'uri' },
      userId: { type: 'string' },
      teamId: { type: 'string' },
      frequency: { type: 'number', minimum: 300 }, // Minimum 5 minutes
      crawlConfig: {
        type: 'object',
        properties: {
          userAgent: { type: 'string' },
          timeout: { type: 'number' },
          followRedirects: { type: 'boolean' },
          respectRobotsTxt: { type: 'boolean' },
        },
      },
    },
  },
};

const updateMonitoringJobSchema = {
  params: {
    type: 'object',
    required: ['jobId'],
    properties: {
      jobId: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    properties: {
      frequency: { type: 'number', minimum: 300 },
      isActive: { type: 'boolean' },
      crawlConfig: {
        type: 'object',
        properties: {
          userAgent: { type: 'string' },
          timeout: { type: 'number' },
          followRedirects: { type: 'boolean' },
          respectRobotsTxt: { type: 'boolean' },
        },
      },
    },
  },
};

const analyzeChangesSchema = {
  body: {
    type: 'object',
    required: ['oldContent', 'newContent', 'documentType'],
    properties: {
      oldContent: { type: 'string' },
      newContent: { type: 'string' },
      documentType: { type: 'string' },
      language: { type: 'string' },
    },
  },
};

export async function monitoringRoutes(server: FastifyInstance): Promise<void> {
  
  // Create monitoring job
  server.post('/jobs', {
    schema: createMonitoringJobSchema,
  }, async (request: FastifyRequest<{
    Body: {
      documentId: string;
      url: string;
      userId: string;
      teamId?: string;
      frequency: number;
      crawlConfig?: any;
    };
  }>, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const job = await TracingUtils.traceFunction(
        'monitoring.create_job',
        async (span) => {
          span.setAttributes({
            'document.id': request.body.documentId,
            'document.url': request.body.url,
            'user.id': request.body.userId,
            'job.frequency': request.body.frequency,
          });

          return await tosMonitoringService.createMonitoringJob(request.body);
        }
      );

      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/monitoring/jobs',
        201,
        Date.now() - startTime,
        request.body.userId
      );

      reply.code(201);
      return {
        success: true,
        data: job,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/monitoring/jobs',
        500,
        duration,
        request.body.userId
      );

      reply.code(500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Update monitoring job
  server.put('/jobs/:jobId', {
    schema: updateMonitoringJobSchema,
  }, async (request: FastifyRequest<{
    Params: { jobId: string };
    Body: {
      frequency?: number;
      isActive?: boolean;
      crawlConfig?: any;
    };
  }>, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const job = await TracingUtils.traceFunction(
        'monitoring.update_job',
        async (span) => {
          span.setAttributes({
            'job.id': request.params.jobId,
          });

          return await tosMonitoringService.updateMonitoringJob(
            request.params.jobId,
            request.body
          );
        }
      );

      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/monitoring/jobs/:jobId',
        200,
        Date.now() - startTime
      );

      return {
        success: true,
        data: job,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/monitoring/jobs/:jobId',
        error instanceof Error && error.message.includes('not found') ? 404 : 500,
        duration
      );

      reply.code(error instanceof Error && error.message.includes('not found') ? 404 : 500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Delete monitoring job
  server.delete('/jobs/:jobId', async (request: FastifyRequest<{
    Params: { jobId: string };
  }>, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      await TracingUtils.traceFunction(
        'monitoring.delete_job',
        async (span) => {
          span.setAttributes({
            'job.id': request.params.jobId,
          });

          await tosMonitoringService.deleteMonitoringJob(request.params.jobId);
        }
      );

      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/monitoring/jobs/:jobId',
        204,
        Date.now() - startTime
      );

      reply.code(204);
      return;

    } catch (error) {
      const duration = Date.now() - startTime;
      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/monitoring/jobs/:jobId',
        error instanceof Error && error.message.includes('not found') ? 404 : 500,
        duration
      );

      reply.code(error instanceof Error && error.message.includes('not found') ? 404 : 500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Process monitoring job manually
  server.post('/jobs/:jobId/process', async (request: FastifyRequest<{
    Params: { jobId: string };
  }>, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      await TracingUtils.traceFunction(
        'monitoring.process_job',
        async (span) => {
          span.setAttributes({
            'job.id': request.params.jobId,
            'trigger': 'manual',
          });

          await tosMonitoringService.processMonitoringJob(request.params.jobId);
        }
      );

      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/monitoring/jobs/:jobId/process',
        200,
        Date.now() - startTime
      );

      return {
        success: true,
        message: 'Job processing initiated',
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/monitoring/jobs/:jobId/process',
        500,
        duration
      );

      reply.code(500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Analyze document changes
  server.post('/analyze-changes', {
    schema: analyzeChangesSchema,
  }, async (request: FastifyRequest<{
    Body: {
      oldContent: string;
      newContent: string;
      documentType: string;
      language?: string;
    };
  }>, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const analysis = await TracingUtils.traceChangeDetection(
        'manual-analysis',
        request.body.documentType,
        async (span) => {
          span.setAttributes({
            'content.old_length': request.body.oldContent.length,
            'content.new_length': request.body.newContent.length,
            'document.type': request.body.documentType,
            'language': request.body.language || 'unknown',
          });

          return await changeDetectionEngine.analyzeChanges(request.body);
        }
      );

      const duration = Date.now() - startTime;
      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/monitoring/analyze-changes',
        200,
        duration
      );

      metricsCollector.recordChangeAnalysis(
        analysis.changeType,
        duration,
        request.body.documentType
      );

      return {
        success: true,
        data: analysis,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/monitoring/analyze-changes',
        500,
        duration
      );

      reply.code(500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Test document crawling
  server.post('/test-crawl', async (request: FastifyRequest<{
    Body: {
      url: string;
      options?: any;
    };
  }>, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const result = await TracingUtils.traceDocumentCrawl(
        request.body.url,
        'test-user',
        async (span) => {
          span.setAttributes({
            'crawl.test': true,
            'crawl.url': request.body.url,
          });

          return await documentCrawlerService.crawlDocument(
            request.body.url,
            request.body.options
          );
        }
      );

      const duration = Date.now() - startTime;
      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/monitoring/test-crawl',
        200,
        duration
      );

      metricsCollector.recordDocumentCrawl(
        result.success ? 'success' : 'failure',
        duration,
        'test-user'
      );

      return {
        success: true,
        data: result,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/monitoring/test-crawl',
        500,
        duration
      );

      reply.code(500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Get monitoring statistics
  server.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const [
        tosStats,
        schedulerStats,
        changeStreamStats,
      ] = await Promise.all([
        tosMonitoringService.getMonitoringStats(),
        schedulerService.getTaskStatus(),
        mongoChangeStreamService.getConnectionStats(),
      ]);

      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/monitoring/stats',
        200,
        Date.now() - startTime
      );

      return {
        success: true,
        data: {
          monitoring: tosStats,
          scheduler: schedulerStats,
          changeStreams: changeStreamStats,
          timestamp: new Date().toISOString(),
        },
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/monitoring/stats',
        500,
        duration
      );

      reply.code(500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Get document version history
  server.get('/documents/:documentId/versions', async (request: FastifyRequest<{
    Params: { documentId: string };
    Querystring: { limit?: string };
  }>, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const limit = request.query.limit ? parseInt(request.query.limit) : 10;
      
      const versions = await TracingUtils.traceFunction(
        'monitoring.get_versions',
        async (span) => {
          span.setAttributes({
            'document.id': request.params.documentId,
            'query.limit': limit,
          });

          return await tosMonitoringService.getDocumentVersionHistory(
            request.params.documentId,
            limit
          );
        }
      );

      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/monitoring/documents/:documentId/versions',
        200,
        Date.now() - startTime
      );

      return {
        success: true,
        data: versions,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/monitoring/documents/:documentId/versions',
        500,
        duration
      );

      reply.code(500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Get scheduled tasks status
  server.get('/scheduler/tasks', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const tasks = schedulerService.getAllTasks();
      const status = schedulerService.getTaskStatus();

      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/monitoring/scheduler/tasks',
        200,
        Date.now() - startTime
      );

      return {
        success: true,
        data: {
          tasks,
          status,
        },
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/monitoring/scheduler/tasks',
        500,
        duration
      );

      reply.code(500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Run scheduled task manually
  server.post('/scheduler/tasks/:taskId/run', async (request: FastifyRequest<{
    Params: { taskId: string };
  }>, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      await TracingUtils.traceFunction(
        'monitoring.run_task',
        async (span) => {
          span.setAttributes({
            'task.id': request.params.taskId,
            'trigger': 'manual',
          });

          await schedulerService.runTaskNow(request.params.taskId);
        }
      );

      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/monitoring/scheduler/tasks/:taskId/run',
        200,
        Date.now() - startTime
      );

      return {
        success: true,
        message: 'Task executed successfully',
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/monitoring/scheduler/tasks/:taskId/run',
        error instanceof Error && error.message.includes('not found') ? 404 : 500,
        duration
      );

      reply.code(error instanceof Error && error.message.includes('not found') ? 404 : 500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });
}