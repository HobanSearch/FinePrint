import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { LegalAnalysisSignature, LegalAnalysisInput } from '../services/dspy-service-new';

const dspyRoutes: FastifyPluginAsync = async (fastify) => {
  const { dspyService } = fastify;

  // Request/Response Schemas
  const AnalyzeDocumentRequest = z.object({
    document_content: z.string().min(1).max(100000),
    document_type: z.enum(['terms_of_service', 'privacy_policy', 'eula', 'license']),
    language: z.string().optional().default('en'),
    analysis_depth: z.enum(['basic', 'detailed', 'comprehensive']).optional().default('detailed'),
    module_name: z.string().optional(), // Allow specifying specific module
  });

  const HealthCheckResponse = z.object({
    status: z.string(),
    ollama_healthy: z.boolean(),
    modules_loaded: z.number(),
    timestamp: z.string(),
  });

  // Analyze Document Endpoint
  fastify.post('/analyze', {
    schema: {
      body: AnalyzeDocumentRequest,
      response: {
        200: {
          type: 'object',
          properties: {
            risk_score: { type: 'number', minimum: 0, maximum: 100 },
            executive_summary: { type: 'string' },
            key_findings: { type: 'array', items: { type: 'string' } },
            recommendations: { type: 'array', items: { type: 'string' } },
            findings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  category: { type: 'string' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                  confidence_score: { type: 'number', minimum: 0, maximum: 1 },
                  text_excerpt: { type: 'string' },
                  recommendation: { type: 'string' },
                  impact_explanation: { type: 'string' },
                },
                required: ['category', 'title', 'description', 'severity', 'confidence_score'],
              },
            },
            dspy_metadata: {
              type: 'object',
              properties: {
                module_used: { type: 'string' },
                optimization_version: { type: 'string' },
                compilation_timestamp: { type: 'string' },
                performance_metrics: {
                  type: 'object',
                  properties: {
                    response_time_ms: { type: 'number' },
                    token_usage: { type: 'number' },
                    confidence_score: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    preHandler: [fastify.authenticate], // Require authentication
  }, async (request, reply) => {
    const startTime = Date.now();
    
    try {
      const body = AnalyzeDocumentRequest.parse(request.body);
      
      // Prepare analysis input
      const analysisInput: LegalAnalysisInput = {
        document_content: body.document_content,
        document_type: body.document_type,
        language: body.language,
        analysis_depth: body.analysis_depth,
      };

      // Get module for metrics
      const moduleName = body.module_name || dspyService.getModule('chain_of_thought')?.name || 'chain_of_thought';
      const module = dspyService.getModule(moduleName);
      
      if (!module) {
        reply.code(400).send({
          error: 'InvalidModule',
          message: `Module '${moduleName}' not found`,
        });
        return;
      }

      // Perform analysis
      const result = await dspyService.analyzeDocument(analysisInput);
      
      const responseTime = Date.now() - startTime;

      // Record metrics
      await metricsCollector.recordMetric({
        module_name: moduleName,
        module_version: module.version,
        operation: 'predict',
        input_size: body.document_content.length,
        output_size: JSON.stringify(result).length,
        latency_ms: responseTime,
        success: true,
        accuracy_score: result.dspy_metadata.performance_metrics.confidence_score,
        confidence_score: result.dspy_metadata.performance_metrics.confidence_score,
        token_usage: result.dspy_metadata.performance_metrics.token_usage,
        model_used: dspyService['config'].default_model,
        metadata: {
          document_type: body.document_type,
          analysis_depth: body.analysis_depth,
          findings_count: result.findings.length,
        },
      });

      // Update module registry stats
      const moduleMetadata = moduleRegistry.getModuleByName(moduleName);
      if (moduleMetadata) {
        await moduleRegistry.updateModuleStats(moduleMetadata.id, {
          latency_ms: responseTime,
          success: true,
          accuracy: result.dspy_metadata.performance_metrics.confidence_score,
        });
      }

      reply.send(result);

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      fastify.log.error('DSPy analysis failed', {
        error: error.message,
        stack: error.stack,
        responseTime,
      });

      // Record error metric
      await metricsCollector.recordMetric({
        module_name: 'unknown',
        module_version: '1.0.0',
        operation: 'predict',
        input_size: (request.body as any)?.document_content?.length || 0,
        output_size: 0,
        latency_ms: responseTime,
        success: false,
        error_type: error.constructor.name,
      });

      const statusCode = error.statusCode || 500;
      reply.code(statusCode).send({
        error: error.name || 'AnalysisError',
        message: statusCode === 500 ? 'Internal server error during analysis' : error.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Batch Analysis Endpoint
  fastify.post('/analyze/batch', {
    schema: {
      body: {
        type: 'object',
        properties: {
          documents: {
            type: 'array',
            items: AnalyzeDocumentRequest,
            minItems: 1,
            maxItems: 10, // Limit batch size
          },
        },
        required: ['documents'],
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const startTime = Date.now();
    const { documents } = request.body as { documents: z.infer<typeof AnalyzeDocumentRequest>[] };
    
    try {
      const results = await Promise.allSettled(
        documents.map(async (doc, index) => {
          const analysisInput: LegalAnalysisInput = {
            document_content: doc.document_content,
            document_type: doc.document_type,
            language: doc.language,
            analysis_depth: doc.analysis_depth,
          };

          return {
            index,
            result: await dspyService.analyzeDocument(analysisInput),
          };
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.length - successful;
      const responseTime = Date.now() - startTime;

      // Record batch metrics
      await metricsCollector.recordMetric({
        module_name: 'batch_analysis',
        module_version: '1.0.0',
        operation: 'predict',
        input_size: documents.reduce((sum, doc) => sum + doc.document_content.length, 0),
        output_size: JSON.stringify(results).length,
        latency_ms: responseTime,
        success: failed === 0,
        metadata: {
          batch_size: documents.length,
          successful_analyses: successful,
          failed_analyses: failed,
        },
      });

      reply.send({
        total: documents.length,
        successful,
        failed,
        processing_time_ms: responseTime,
        results: results.map((result, index) => ({
          index,
          status: result.status,
          data: result.status === 'fulfilled' ? result.value.result : undefined,
          error: result.status === 'rejected' ? result.reason.message : undefined,
        })),
      });

    } catch (error) {
      fastify.log.error('Batch analysis failed', { error: error.message });
      
      reply.code(500).send({
        error: 'BatchAnalysisError',
        message: 'Failed to process batch analysis',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Get Available Modules
  fastify.get('/modules', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const modules = dspyService.listModules();
      const moduleDetails = await Promise.all(
        modules.map(async (moduleName) => {
          const module = dspyService.getModule(moduleName);
          const metadata = moduleRegistry.getModuleByName(moduleName);
          
          return {
            name: moduleName,
            signature: module?.signature,
            description: module?.description,
            version: module?.version,
            compiled: module?.compiled,
            optimization_history: module?.optimization_history || [],
            usage_stats: metadata?.performance_stats,
          };
        })
      );

      reply.send({
        modules: moduleDetails,
        total: moduleDetails.length,
      });

    } catch (error) {
      fastify.log.error('Failed to get modules', { error: error.message });
      reply.code(500).send({
        error: 'ModulesError',
        message: 'Failed to retrieve module information',
      });
    }
  });

  // Get Module Details
  fastify.get('/modules/:moduleName', {
    schema: {
      params: {
        type: 'object',
        properties: {
          moduleName: { type: 'string' },
        },
        required: ['moduleName'],
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const { moduleName } = request.params as { moduleName: string };
      
      const module = dspyService.getModule(moduleName);
      if (!module) {
        reply.code(404).send({
          error: 'ModuleNotFound',
          message: `Module '${moduleName}' not found`,
        });
        return;
      }

      const metadata = moduleRegistry.getModuleByName(moduleName);
      
      reply.send({
        name: moduleName,
        signature: module.signature,
        description: module.description,
        version: module.version,
        compiled: module.compiled,
        optimization_history: module.optimization_history,
        usage_stats: metadata?.performance_stats,
        metadata: metadata?.registration,
      });

    } catch (error) {
      fastify.log.error('Failed to get module details', { error: error.message });
      reply.code(500).send({
        error: 'ModuleDetailsError',
        message: 'Failed to retrieve module details',
      });
    }
  });

  // Health Check
  fastify.get('/health', async (request, reply) => {
    try {
      const ollamaHealthy = await dspyService.healthCheck();
      const modulesLoaded = dspyService.listModules().length;
      
      const health = {
        status: 'ok',
        ollama_healthy: ollamaHealthy,
        modules_loaded: modulesLoaded,
        timestamp: new Date().toISOString(),
      };

      reply.send(health);

    } catch (error) {
      fastify.log.error('Health check failed', { error: error.message });
      reply.code(503).send({
        status: 'error',
        ollama_healthy: false,
        modules_loaded: 0,
        timestamp: new Date().toISOString(),
        error: error.message,
      });
    }
  });

  // Test Module Endpoint (for development/testing)
  fastify.post('/test/:moduleName', {
    schema: {
      params: {
        type: 'object',
        properties: {
          moduleName: { type: 'string' },
        },
        required: ['moduleName'],
      },
      body: {
        type: 'object',
        properties: {
          input: { type: 'object' },
        },
        required: ['input'],
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const { moduleName } = request.params as { moduleName: string };
      const { input } = request.body as { input: any };
      
      const module = dspyService.getModule(moduleName);
      if (!module) {
        reply.code(404).send({
          error: 'ModuleNotFound',
          message: `Module '${moduleName}' not found`,
        });
        return;
      }

      const startTime = Date.now();
      const result = await module.predict(input);
      const responseTime = Date.now() - startTime;

      // Record test metric
      await metricsCollector.recordMetric({
        module_name: moduleName,
        module_version: module.version,
        operation: 'predict',
        input_size: JSON.stringify(input).length,
        output_size: JSON.stringify(result).length,
        latency_ms: responseTime,
        success: true,
        metadata: {
          test_mode: true,
        },
      });

      reply.send({
        module: moduleName,
        input,
        output: result,
        processing_time_ms: responseTime,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      fastify.log.error('Module test failed', { 
        error: error.message,
        moduleName: (request.params as any)?.moduleName,
      });
      
      reply.code(500).send({
        error: 'ModuleTestError',
        message: 'Failed to test module',
        timestamp: new Date().toISOString(),
      });
    }
  });
};

export { dspyRoutes };