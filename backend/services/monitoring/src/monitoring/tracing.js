"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpanStatusCode = exports.SpanKind = exports.context = exports.trace = exports.TracingUtils = void 0;
exports.initializeTracing = initializeTracing;
exports.traceMethod = traceMethod;
exports.createTracingMiddleware = createTracingMiddleware;
exports.shutdownTracing = shutdownTracing;
const sdk_node_1 = require("@opentelemetry/sdk-node");
const auto_instrumentations_node_1 = require("@opentelemetry/auto-instrumentations-node");
const sdk_metrics_1 = require("@opentelemetry/sdk-metrics");
const exporter_jaeger_1 = require("@opentelemetry/exporter-jaeger");
const resources_1 = require("@opentelemetry/resources");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const logger_1 = require("@fineprintai/shared-logger");
const config_1 = require("@fineprintai/shared-config");
const api_1 = require("@opentelemetry/api");
Object.defineProperty(exports, "trace", { enumerable: true, get: function () { return api_1.trace; } });
Object.defineProperty(exports, "context", { enumerable: true, get: function () { return api_1.context; } });
Object.defineProperty(exports, "SpanKind", { enumerable: true, get: function () { return api_1.SpanKind; } });
Object.defineProperty(exports, "SpanStatusCode", { enumerable: true, get: function () { return api_1.SpanStatusCode; } });
const logger = (0, logger_1.createServiceLogger)('tracing');
let sdk = null;
let tracer = null;
function initializeTracing() {
    if (sdk) {
        logger.warn('Tracing already initialized');
        return;
    }
    logger.info('Initializing OpenTelemetry tracing', {
        serviceName: config_1.config.services.monitoring.name,
        version: config_1.config.services.monitoring.version,
        jaegerEndpoint: config_1.config.monitoring.jaeger.endpoint,
    });
    try {
        const resource = new resources_1.Resource({
            [semantic_conventions_1.SemanticResourceAttributes.SERVICE_NAME]: config_1.config.monitoring.jaeger.serviceName,
            [semantic_conventions_1.SemanticResourceAttributes.SERVICE_VERSION]: config_1.config.services.monitoring.version,
            [semantic_conventions_1.SemanticResourceAttributes.SERVICE_INSTANCE_ID]: `${config_1.config.services.monitoring.name}-${Date.now()}`,
            [semantic_conventions_1.SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config_1.config.NODE_ENV,
        });
        const traceExporter = config_1.config.monitoring.jaeger.endpoint
            ? new exporter_jaeger_1.JaegerExporter({
                endpoint: config_1.config.monitoring.jaeger.endpoint,
                tags: [
                    { key: 'service.name', value: config_1.config.monitoring.jaeger.serviceName },
                    { key: 'service.version', value: config_1.config.services.monitoring.version },
                    { key: 'environment', value: config_1.config.NODE_ENV },
                ],
            })
            : undefined;
        sdk = new sdk_node_1.NodeSDK({
            resource,
            traceExporter,
            metricReader: new sdk_metrics_1.PeriodicExportingMetricReader({
                exporter: new sdk_metrics_1.ConsoleMetricExporter(),
                exportIntervalMillis: 30000,
                exportTimeoutMillis: 5000,
            }),
            instrumentations: [
                (0, auto_instrumentations_node_1.getNodeAutoInstrumentations)({
                    '@opentelemetry/instrumentation-fs': {
                        enabled: false,
                    },
                    '@opentelemetry/instrumentation-dns': {
                        enabled: false,
                    },
                    '@opentelemetry/instrumentation-http': {
                        ignoreIncomingRequestHook: (req) => {
                            const url = req.url || '';
                            return url.includes('/health') || url.includes('/metrics');
                        },
                        ignoreOutgoingRequestHook: (options) => {
                            const hostname = options.hostname || options.host;
                            return hostname === 'localhost' || hostname === '127.0.0.1';
                        },
                    },
                    '@opentelemetry/instrumentation-mongodb': {
                        enabled: true,
                        enhancedDatabaseReporting: true,
                    },
                    '@opentelemetry/instrumentation-redis': {
                        enabled: true,
                        dbStatementSerializer: (cmdName, cmdArgs) => {
                            return `${cmdName} ${cmdArgs.map(() => '?').join(' ')}`;
                        },
                    },
                }),
            ],
        });
        sdk.start();
        tracer = api_1.trace.getTracer(config_1.config.monitoring.jaeger.serviceName, config_1.config.services.monitoring.version);
        logger.info('OpenTelemetry tracing initialized successfully');
    }
    catch (error) {
        logger.error('Failed to initialize OpenTelemetry tracing', { error });
        throw error;
    }
}
class TracingUtils {
    static getTracer() {
        if (!tracer) {
            throw new Error('Tracing not initialized. Call initializeTracing() first.');
        }
        return tracer;
    }
    static startSpan(name, options = {}) {
        const tracer = this.getTracer();
        const span = tracer.startSpan(name, {
            kind: options.kind || api_1.SpanKind.INTERNAL,
            attributes: options.attributes,
        }, options.parent ? api_1.trace.setSpan(api_1.context.active(), options.parent) : undefined);
        return span;
    }
    static async traceFunction(name, fn, options = {}) {
        const span = this.startSpan(name, options);
        try {
            const result = await fn(span);
            span.setStatus({ code: api_1.SpanStatusCode.OK });
            return result;
        }
        catch (error) {
            span.setStatus({
                code: api_1.SpanStatusCode.ERROR,
                message: error instanceof Error ? error.message : 'Unknown error',
            });
            span.recordException(error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
        finally {
            span.end();
        }
    }
    static async traceDocumentCrawl(url, userId, fn) {
        return this.traceFunction('document.crawl', fn, {
            kind: api_1.SpanKind.CLIENT,
            attributes: {
                'document.url': url,
                'user.id': userId,
                'operation.type': 'crawl',
            },
        });
    }
    static async traceChangeDetection(documentId, changeType, fn) {
        return this.traceFunction('document.change_detection', fn, {
            attributes: {
                'document.id': documentId,
                'change.type': changeType,
                'operation.type': 'analysis',
            },
        });
    }
    static async traceWebhookDelivery(webhookId, eventType, targetUrl, fn) {
        return this.traceFunction('webhook.delivery', fn, {
            kind: api_1.SpanKind.CLIENT,
            attributes: {
                'webhook.id': webhookId,
                'webhook.event_type': eventType,
                'webhook.target_url': targetUrl,
                'operation.type': 'delivery',
            },
        });
    }
    static async traceAlertProcessing(alertId, severity, ruleId, fn) {
        return this.traceFunction('alert.process', fn, {
            attributes: {
                'alert.id': alertId,
                'alert.severity': severity,
                'alert.rule_id': ruleId,
                'operation.type': 'alert_processing',
            },
        });
    }
    static async traceDatabaseOperation(operation, collection, fn) {
        return this.traceFunction(`db.${operation}`, fn, {
            kind: api_1.SpanKind.CLIENT,
            attributes: {
                'db.operation': operation,
                'db.collection.name': collection,
                'db.system': 'mongodb',
            },
        });
    }
    static async traceQueueJob(queueName, jobType, jobId, fn) {
        return this.traceFunction(`queue.${queueName}.${jobType}`, fn, {
            attributes: {
                'queue.name': queueName,
                'job.type': jobType,
                'job.id': jobId,
                'operation.type': 'queue_processing',
            },
        });
    }
    static async traceCircuitBreakerCall(breakerName, fn) {
        return this.traceFunction(`circuit_breaker.${breakerName}`, fn, {
            attributes: {
                'circuit_breaker.name': breakerName,
                'operation.type': 'circuit_breaker_call',
            },
        });
    }
    static addSpanAttributes(attributes) {
        const currentSpan = api_1.trace.getActiveSpan();
        if (currentSpan) {
            for (const [key, value] of Object.entries(attributes)) {
                currentSpan.setAttribute(key, value);
            }
        }
    }
    static addSpanEvent(name, attributes) {
        const currentSpan = api_1.trace.getActiveSpan();
        if (currentSpan) {
            currentSpan.addEvent(name, attributes);
        }
    }
    static recordException(error, attributes) {
        const currentSpan = api_1.trace.getActiveSpan();
        if (currentSpan) {
            currentSpan.recordException(error, attributes);
            currentSpan.setStatus({
                code: api_1.SpanStatusCode.ERROR,
                message: error.message,
            });
        }
    }
    static setSpanError(message, error) {
        const currentSpan = api_1.trace.getActiveSpan();
        if (currentSpan) {
            currentSpan.setStatus({
                code: api_1.SpanStatusCode.ERROR,
                message,
            });
            if (error) {
                currentSpan.recordException(error);
            }
        }
    }
    static setSpanOK() {
        const currentSpan = api_1.trace.getActiveSpan();
        if (currentSpan) {
            currentSpan.setStatus({ code: api_1.SpanStatusCode.OK });
        }
    }
    static getCurrentTraceId() {
        const currentSpan = api_1.trace.getActiveSpan();
        if (currentSpan) {
            const spanContext = currentSpan.spanContext();
            return spanContext.traceId;
        }
        return undefined;
    }
    static getCurrentSpanId() {
        const currentSpan = api_1.trace.getActiveSpan();
        if (currentSpan) {
            const spanContext = currentSpan.spanContext();
            return spanContext.spanId;
        }
        return undefined;
    }
    static createChildSpan(name, attributes) {
        const tracer = this.getTracer();
        return tracer.startSpan(name, { attributes });
    }
    static withSpan(span, fn) {
        return api_1.context.with(api_1.trace.setSpan(api_1.context.active(), span), fn);
    }
    static async withSpanAsync(span, fn) {
        return api_1.context.with(api_1.trace.setSpan(api_1.context.active(), span), fn);
    }
}
exports.TracingUtils = TracingUtils;
function traceMethod(operationName, options = {}) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const spanName = operationName || `${target.constructor.name}.${propertyKey}`;
        descriptor.value = async function (...args) {
            return TracingUtils.traceFunction(spanName, async (span) => {
                span.setAttributes({
                    'method.class': target.constructor.name,
                    'method.name': propertyKey,
                    ...options.attributes,
                });
                return originalMethod.apply(this, args);
            }, { kind: options.kind });
        };
        return descriptor;
    };
}
function createTracingMiddleware() {
    return async (request, reply, next) => {
        const span = TracingUtils.startSpan(`HTTP ${request.method} ${request.url}`, {
            kind: api_1.SpanKind.SERVER,
            attributes: {
                'http.method': request.method,
                'http.url': request.url,
                'http.scheme': request.protocol,
                'http.host': request.hostname,
                'http.user_agent': request.headers['user-agent'] || '',
                'user.id': request.headers['x-user-id'] || 'anonymous',
            },
        });
        try {
            await TracingUtils.withSpanAsync(span, async () => {
                await next();
            });
            span.setAttributes({
                'http.status_code': reply.statusCode,
                'http.response.size': reply.getHeader('content-length') || 0,
            });
            span.setStatus({ code: api_1.SpanStatusCode.OK });
        }
        catch (error) {
            span.setStatus({
                code: api_1.SpanStatusCode.ERROR,
                message: error instanceof Error ? error.message : 'Unknown error',
            });
            span.recordException(error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
        finally {
            span.end();
        }
    };
}
async function shutdownTracing() {
    if (sdk) {
        logger.info('Shutting down OpenTelemetry tracing...');
        try {
            await sdk.shutdown();
            sdk = null;
            tracer = null;
            logger.info('OpenTelemetry tracing shutdown complete');
        }
        catch (error) {
            logger.error('Error shutting down OpenTelemetry tracing', { error });
            throw error;
        }
    }
}
//# sourceMappingURL=tracing.js.map