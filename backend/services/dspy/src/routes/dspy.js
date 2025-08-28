"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dspyRoutes = void 0;
const zod_1 = require("zod");
const dspyRoutes = async (fastify) => {
    const { dspyService, metricsCollector, moduleRegistry } = fastify;
    const AnalyzeDocumentRequest = zod_1.z.object({
        document_content: zod_1.z.string().min(1).max(100000),
        document_type: zod_1.z.enum(['terms_of_service', 'privacy_policy', 'eula', 'license']),
        language: zod_1.z.string().optional().default('en'),
        analysis_depth: zod_1.z.enum(['basic', 'detailed', 'comprehensive']).optional().default('detailed'),
        module_name: zod_1.z.string().optional(),
    });
    const HealthCheckResponse = zod_1.z.object({
        status: zod_1.z.string(),
        ollama_healthy: zod_1.z.boolean(),
        modules_loaded: zod_1.z.number(),
        timestamp: zod_1.z.string(),
    });
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
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const startTime = Date.now();
        try {
            const body = AnalyzeDocumentRequest.parse(request.body);
            const analysisInput = {
                document_content: body.document_content,
                document_type: body.document_type,
                language: body.language,
                analysis_depth: body.analysis_depth,
            };
            const moduleName = body.module_name || dspyService.getModule('chain_of_thought')?.name || 'chain_of_thought';
            const module = dspyService.getModule(moduleName);
            if (!module) {
                reply.code(400).send({
                    error: 'InvalidModule',
                    message: `Module '${moduleName}' not found`,
                });
                return;
            }
            const result = await dspyService.analyzeDocument(analysisInput);
            const responseTime = Date.now() - startTime;
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
            const moduleMetadata = moduleRegistry.getModuleByName(moduleName);
            if (moduleMetadata) {
                await moduleRegistry.updateModuleStats(moduleMetadata.id, {
                    latency_ms: responseTime,
                    success: true,
                    accuracy: result.dspy_metadata.performance_metrics.confidence_score,
                });
            }
            reply.send(result);
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            fastify.log.error('DSPy analysis failed', {
                error: error.message,
                stack: error.stack,
                responseTime,
            });
            await metricsCollector.recordMetric({
                module_name: 'unknown',
                module_version: '1.0.0',
                operation: 'predict',
                input_size: request.body?.document_content?.length || 0,
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
    fastify.post('/analyze/batch', {
        schema: {
            body: {
                type: 'object',
                properties: {
                    documents: {
                        type: 'array',
                        items: AnalyzeDocumentRequest,
                        minItems: 1,
                        maxItems: 10,
                    },
                },
                required: ['documents'],
            },
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const startTime = Date.now();
        const { documents } = request.body;
        try {
            const results = await Promise.allSettled(documents.map(async (doc, index) => {
                const analysisInput = {
                    document_content: doc.document_content,
                    document_type: doc.document_type,
                    language: doc.language,
                    analysis_depth: doc.analysis_depth,
                };
                return {
                    index,
                    result: await dspyService.analyzeDocument(analysisInput),
                };
            }));
            const successful = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.length - successful;
            const responseTime = Date.now() - startTime;
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
        }
        catch (error) {
            fastify.log.error('Batch analysis failed', { error: error.message });
            reply.code(500).send({
                error: 'BatchAnalysisError',
                message: 'Failed to process batch analysis',
                timestamp: new Date().toISOString(),
            });
        }
    });
    fastify.get('/modules', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            const modules = dspyService.listModules();
            const moduleDetails = await Promise.all(modules.map(async (moduleName) => {
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
            }));
            reply.send({
                modules: moduleDetails,
                total: moduleDetails.length,
            });
        }
        catch (error) {
            fastify.log.error('Failed to get modules', { error: error.message });
            reply.code(500).send({
                error: 'ModulesError',
                message: 'Failed to retrieve module information',
            });
        }
    });
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
            const { moduleName } = request.params;
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
        }
        catch (error) {
            fastify.log.error('Failed to get module details', { error: error.message });
            reply.code(500).send({
                error: 'ModuleDetailsError',
                message: 'Failed to retrieve module details',
            });
        }
    });
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
        }
        catch (error) {
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
            const { moduleName } = request.params;
            const { input } = request.body;
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
        }
        catch (error) {
            fastify.log.error('Module test failed', {
                error: error.message,
                moduleName: request.params?.moduleName,
            });
            reply.code(500).send({
                error: 'ModuleTestError',
                message: 'Failed to test module',
                timestamp: new Date().toISOString(),
            });
        }
    });
};
exports.dspyRoutes = dspyRoutes;
//# sourceMappingURL=dspy.js.map