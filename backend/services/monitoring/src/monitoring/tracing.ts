import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PeriodicExportingMetricReader, ConsoleMetricExporter } from '@opentelemetry/sdk-metrics';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { config } from '@fineprintai/shared-config';
import {
  trace,
  context,
  SpanKind,
  SpanStatusCode,
  Span,
  Tracer,
} from '@opentelemetry/api';

const logger = createServiceLogger('tracing');

let sdk: NodeSDK | null = null;
let tracer: Tracer | null = null;

// Initialize OpenTelemetry
export function initializeTracing(): void {
  if (sdk) {
    logger.warn('Tracing already initialized');
    return;
  }

  logger.info('Initializing OpenTelemetry tracing', {
    serviceName: config.services.monitoring.name,
    version: config.services.monitoring.version,
    jaegerEndpoint: config.monitoring.jaeger.endpoint,
  });

  try {
    // Create resource
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: config.monitoring.jaeger.serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: config.services.monitoring.version,
      [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: `${config.services.monitoring.name}-${Date.now()}`,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.NODE_ENV,
    });

    // Create Jaeger exporter if endpoint is configured
    const traceExporter = config.monitoring.jaeger.endpoint
      ? new JaegerExporter({
          endpoint: config.monitoring.jaeger.endpoint,
          // Additional Jaeger configuration
          tags: [
            { key: 'service.name', value: config.monitoring.jaeger.serviceName },
            { key: 'service.version', value: config.services.monitoring.version },
            { key: 'environment', value: config.NODE_ENV },
          ],
        })
      : undefined;

    // Create SDK
    sdk = new NodeSDK({
      resource,
      traceExporter,
      metricReader: new PeriodicExportingMetricReader({
        exporter: new ConsoleMetricExporter(),
        exportIntervalMillis: 30000,
        exportTimeoutMillis: 5000,
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable specific instrumentations if needed
          '@opentelemetry/instrumentation-fs': {
            enabled: false, // File system operations can be noisy
          },
          '@opentelemetry/instrumentation-dns': {
            enabled: false, // DNS lookups can be noisy
          },
          // Configure HTTP instrumentation
          '@opentelemetry/instrumentation-http': {
            ignoreIncomingRequestHook: (req) => {
              // Ignore health checks and metrics endpoints
              const url = req.url || '';
              return url.includes('/health') || url.includes('/metrics');
            },
            ignoreOutgoingRequestHook: (options) => {
              // Ignore internal health checks
              const hostname = options.hostname || options.host;
              return hostname === 'localhost' || hostname === '127.0.0.1';
            },
          },
          // Configure database instrumentation
          '@opentelemetry/instrumentation-mongodb': {
            enabled: true,
            enhancedDatabaseReporting: true,
          },
          '@opentelemetry/instrumentation-redis': {
            enabled: true,
            dbStatementSerializer: (cmdName, cmdArgs) => {
              // Sanitize sensitive data
              return `${cmdName} ${cmdArgs.map(() => '?').join(' ')}`;
            },
          },
        }),
      ],
    });

    // Start the SDK
    sdk.start();

    // Get tracer instance
    tracer = trace.getTracer(config.monitoring.jaeger.serviceName, config.services.monitoring.version);

    logger.info('OpenTelemetry tracing initialized successfully');

  } catch (error) {
    logger.error('Failed to initialize OpenTelemetry tracing', { error });
    throw error;
  }
}

// Tracing utilities
export class TracingUtils {
  private static getTracer(): Tracer {
    if (!tracer) {
      throw new Error('Tracing not initialized. Call initializeTracing() first.');
    }
    return tracer;
  }

  /**
   * Create and start a new span
   */
  static startSpan(
    name: string,
    options: {
      kind?: SpanKind;
      attributes?: Record<string, string | number | boolean>;
      parent?: Span | undefined;
    } = {}
  ): Span {
    const tracer = this.getTracer();
    
    const span = tracer.startSpan(name, {
      kind: options.kind || SpanKind.INTERNAL,
      attributes: options.attributes,
    }, options.parent ? trace.setSpan(context.active(), options.parent) : undefined);

    return span;
  }

  /**
   * Wrap a function with tracing
   */
  static async traceFunction<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    options: {
      kind?: SpanKind;
      attributes?: Record<string, string | number | boolean>;
    } = {}
  ): Promise<T> {
    const span = this.startSpan(name, options);
    
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Trace document crawling operation
   */
  static async traceDocumentCrawl<T>(
    url: string,
    userId: string,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    return this.traceFunction(
      'document.crawl',
      fn,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          'document.url': url,
          'user.id': userId,
          'operation.type': 'crawl',
        },
      }
    );
  }

  /**
   * Trace change detection operation
   */
  static async traceChangeDetection<T>(
    documentId: string,
    changeType: string,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    return this.traceFunction(
      'document.change_detection',
      fn,
      {
        attributes: {
          'document.id': documentId,
          'change.type': changeType,
          'operation.type': 'analysis',
        },
      }
    );
  }

  /**
   * Trace webhook delivery
   */
  static async traceWebhookDelivery<T>(
    webhookId: string,
    eventType: string,
    targetUrl: string,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    return this.traceFunction(
      'webhook.delivery',
      fn,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          'webhook.id': webhookId,
          'webhook.event_type': eventType,
          'webhook.target_url': targetUrl,
          'operation.type': 'delivery',
        },
      }
    );
  }

  /**
   * Trace alert processing
   */
  static async traceAlertProcessing<T>(
    alertId: string,
    severity: string,
    ruleId: string,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    return this.traceFunction(
      'alert.process',
      fn,
      {
        attributes: {
          'alert.id': alertId,
          'alert.severity': severity,
          'alert.rule_id': ruleId,
          'operation.type': 'alert_processing',
        },
      }
    );
  }

  /**
   * Trace database operations
   */
  static async traceDatabaseOperation<T>(
    operation: string,
    collection: string,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    return this.traceFunction(
      `db.${operation}`,
      fn,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          'db.operation': operation,
          'db.collection.name': collection,
          'db.system': 'mongodb',
        },
      }
    );
  }

  /**
   * Trace queue job processing
   */
  static async traceQueueJob<T>(
    queueName: string,
    jobType: string,
    jobId: string,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    return this.traceFunction(
      `queue.${queueName}.${jobType}`,
      fn,
      {
        attributes: {
          'queue.name': queueName,
          'job.type': jobType,
          'job.id': jobId,
          'operation.type': 'queue_processing',
        },
      }
    );
  }

  /**
   * Trace circuit breaker operations
   */
  static async traceCircuitBreakerCall<T>(
    breakerName: string,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    return this.traceFunction(
      `circuit_breaker.${breakerName}`,
      fn,
      {
        attributes: {
          'circuit_breaker.name': breakerName,
          'operation.type': 'circuit_breaker_call',
        },
      }
    );
  }

  /**
   * Add custom attributes to current span
   */
  static addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
    const currentSpan = trace.getActiveSpan();
    if (currentSpan) {
      for (const [key, value] of Object.entries(attributes)) {
        currentSpan.setAttribute(key, value);
      }
    }
  }

  /**
   * Add span event (log within span context)
   */
  static addSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
    const currentSpan = trace.getActiveSpan();
    if (currentSpan) {
      currentSpan.addEvent(name, attributes);
    }
  }

  /**
   * Record an exception in the current span
   */
  static recordException(error: Error, attributes?: Record<string, string | number | boolean>): void {
    const currentSpan = trace.getActiveSpan();
    if (currentSpan) {
      currentSpan.recordException(error, attributes);
      currentSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    }
  }

  /**
   * Set span status to error
   */
  static setSpanError(message: string, error?: Error): void {
    const currentSpan = trace.getActiveSpan();
    if (currentSpan) {
      currentSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message,
      });
      if (error) {
        currentSpan.recordException(error);
      }
    }
  }

  /**
   * Set span status to OK
   */
  static setSpanOK(): void {
    const currentSpan = trace.getActiveSpan();
    if (currentSpan) {
      currentSpan.setStatus({ code: SpanStatusCode.OK });
    }
  }

  /**
   * Get trace ID of current span
   */
  static getCurrentTraceId(): string | undefined {
    const currentSpan = trace.getActiveSpan();
    if (currentSpan) {
      const spanContext = currentSpan.spanContext();
      return spanContext.traceId;
    }
    return undefined;
  }

  /**
   * Get span ID of current span
   */
  static getCurrentSpanId(): string | undefined {
    const currentSpan = trace.getActiveSpan();
    if (currentSpan) {
      const spanContext = currentSpan.spanContext();
      return spanContext.spanId;
    }
    return undefined;
  }

  /**
   * Create a child span from current context
   */
  static createChildSpan(
    name: string,
    attributes?: Record<string, string | number | boolean>
  ): Span {
    const tracer = this.getTracer();
    return tracer.startSpan(name, { attributes });
  }

  /**
   * Execute function with span context
   */
  static withSpan<T>(span: Span, fn: () => T): T {
    return context.with(trace.setSpan(context.active(), span), fn);
  }

  /**
   * Execute async function with span context
   */
  static async withSpanAsync<T>(span: Span, fn: () => Promise<T>): Promise<T> {
    return context.with(trace.setSpan(context.active(), span), fn);
  }
}

// Custom span decorators for common operations
export function traceMethod(
  operationName?: string,
  options: {
    attributes?: Record<string, string | number | boolean>;
    kind?: SpanKind;
  } = {}
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const spanName = operationName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      return TracingUtils.traceFunction(
        spanName,
        async (span) => {
          // Add method-specific attributes
          span.setAttributes({
            'method.class': target.constructor.name,
            'method.name': propertyKey,
            ...options.attributes,
          });

          return originalMethod.apply(this, args);
        },
        { kind: options.kind }
      );
    };

    return descriptor;
  };
}

// HTTP request tracing middleware
export function createTracingMiddleware() {
  return async (request: any, reply: any, next: () => void) => {
    const span = TracingUtils.startSpan(`HTTP ${request.method} ${request.url}`, {
      kind: SpanKind.SERVER,
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

      // Add response attributes
      span.setAttributes({
        'http.status_code': reply.statusCode,
        'http.response.size': reply.getHeader('content-length') || 0,
      });

      span.setStatus({ code: SpanStatusCode.OK });

    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  };
}

// Graceful shutdown
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    logger.info('Shutting down OpenTelemetry tracing...');
    
    try {
      await sdk.shutdown();
      sdk = null;
      tracer = null;
      logger.info('OpenTelemetry tracing shutdown complete');
    } catch (error) {
      logger.error('Error shutting down OpenTelemetry tracing', { error });
      throw error;
    }
  }
}

// Export utilities
export { trace, context, SpanKind, SpanStatusCode };