/**
 * Comprehensive TracingService for Fine Print AI
 * Provides distributed tracing with OpenTelemetry and Jaeger integration
 */

import { EventEmitter } from 'events';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';
import {
  trace,
  context,
  SpanKind,
  SpanStatusCode,
  Span,
  Tracer,
  SpanOptions,
  Context,
  Baggage,
  BaggageEntry,
} from '@opentelemetry/api';
import { v4 as uuidv4 } from 'uuid';
import {
  TraceSpan,
  SpanLog,
  SpanStatus,
  ServiceType,
  Environment,
  LogContext,
  CorrelationContext,
} from '../types';
import { LoggerService } from './logger-service';

interface TracingConfig {
  serviceName: string;
  serviceVersion: string;
  environment: Environment;
  jaegerEndpoint?: string;
  enableJaeger: boolean;
  enablePrometheus: boolean;
  enableConsole: boolean;
  sampleRate: number; // 0.0 to 1.0
  maxSpansPerTrace: number;
  maxAttributeLength: number;
  exportTimeout: number; // milliseconds
}

interface SpanContext {
  span: Span;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startTime: number;
  tags: Record<string, any>;
  logs: SpanLog[];
}

export class TracingService extends EventEmitter {
  private config: TracingConfig;
  private sdk: NodeSDK;
  private tracer: Tracer;
  private logger?: LoggerService;
  private activeSpans: Map<string, SpanContext> = new Map();
  private traceMetrics: Map<string, any> = new Map();
  private initialized = false;

  constructor(config: TracingConfig) {
    super();
    this.config = config;
    this.setupSDK();
  }

  /**
   * Initialize the tracing service
   */
  async initialize(logger?: LoggerService): Promise<void> {
    this.logger = logger;
    
    try {
      await this.sdk.start();
      this.tracer = trace.getTracer(this.config.serviceName, this.config.serviceVersion);
      this.initialized = true;
      
      this.logger?.info('Tracing service initialized', {
        service: 'tracing-service' as ServiceType,
        environment: this.config.environment,
        version: this.config.serviceVersion,
        enabledExporters: {
          jaeger: this.config.enableJaeger,
          prometheus: this.config.enablePrometheus,
          console: this.config.enableConsole,
        },
      });
      
      this.emit('initialized');
    } catch (error) {
      this.logger?.error('Failed to initialize tracing service', {
        service: 'tracing-service' as ServiceType,
        environment: this.config.environment,
      }, error as Error);
      
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Create a new span
   */
  startSpan(
    operationName: string,
    options?: {
      parent?: Span | Context;
      kind?: SpanKind;
      attributes?: Record<string, any>;
      startTime?: number;
      correlationContext?: CorrelationContext;
    }
  ): Span {
    if (!this.initialized) {
      throw new Error('TracingService not initialized');
    }

    const spanOptions: SpanOptions = {
      kind: options?.kind || SpanKind.INTERNAL,
      attributes: {
        'service.name': this.config.serviceName,
        'service.version': this.config.serviceVersion,
        'service.environment': this.config.environment,
        ...options?.attributes,
      },
      startTime: options?.startTime,
    };

    let span: Span;
    
    if (options?.parent) {
      if (options.parent instanceof Span) {
        span = this.tracer.startSpan(operationName, spanOptions, trace.setSpan(context.active(), options.parent));
      } else {
        span = this.tracer.startSpan(operationName, spanOptions, options.parent);
      }
    } else {
      span = this.tracer.startSpan(operationName, spanOptions);
    }

    // Create span context for tracking
    const spanContext = trace.getSpanContext(span);
    const spanInfo: SpanContext = {
      span,
      traceId: spanContext?.traceId || '',
      spanId: spanContext?.spanId || '',
      parentSpanId: options?.parent ? this.getParentSpanId(options.parent) : undefined,
      startTime: Date.now(),
      tags: options?.attributes || {},
      logs: [],
    };

    this.activeSpans.set(spanInfo.spanId, spanInfo);

    // Set baggage from correlation context
    if (options?.correlationContext) {
      this.setBaggageFromCorrelation(span, options.correlationContext);
    }

    // Log span creation
    this.logger?.debug(`Span started: ${operationName}`, {
      service: 'tracing-service' as ServiceType,
      environment: this.config.environment,
      operation: operationName,
      metadata: {
        traceId: spanInfo.traceId,
        spanId: spanInfo.spanId,
        parentSpanId: spanInfo.parentSpanId,
      },
    });

    this.emit('span-started', {
      operationName,
      traceId: spanInfo.traceId,
      spanId: spanInfo.spanId,
      parentSpanId: spanInfo.parentSpanId,
    });

    return span;
  }

  /**
   * Finish a span with optional error
   */
  finishSpan(span: Span, error?: Error): void {
    const spanContext = trace.getSpanContext(span);
    if (!spanContext) return;

    const spanInfo = this.activeSpans.get(spanContext.spanId);
    if (!spanInfo) return;

    // Set error if provided
    if (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }

    // Calculate duration
    const duration = Date.now() - spanInfo.startTime;
    span.setAttributes({
      'span.duration_ms': duration,
    });

    // End the span
    span.end();

    // Create TraceSpan object for emission
    const traceSpan: TraceSpan = {
      traceId: spanInfo.traceId,
      spanId: spanInfo.spanId,
      parentSpanId: spanInfo.parentSpanId,
      operationName: span.toString(), // This might need adjustment based on actual span implementation
      startTime: new Date(spanInfo.startTime),
      endTime: new Date(),
      duration,
      tags: spanInfo.tags,
      logs: spanInfo.logs,
      status: error ? 'error' : 'ok',
      baggage: this.getBaggageFromSpan(span),
    };

    // Log span completion
    this.logger?.debug(`Span finished: ${traceSpan.operationName}`, {
      service: 'tracing-service' as ServiceType,
      environment: this.config.environment,
      operation: traceSpan.operationName,
      duration,
      metadata: {
        traceId: spanInfo.traceId,
        spanId: spanInfo.spanId,
        status: traceSpan.status,
      },
    });

    // Update metrics
    this.updateTraceMetrics(traceSpan);

    // Clean up
    this.activeSpans.delete(spanInfo.spanId);

    this.emit('span-finished', traceSpan);
  }

  /**
   * Add an event to a span
   */
  addSpanEvent(span: Span, name: string, attributes?: Record<string, any>): void {
    span.addEvent(name, attributes);
    
    const spanContext = trace.getSpanContext(span);
    if (spanContext) {
      const spanInfo = this.activeSpans.get(spanContext.spanId);
      if (spanInfo) {
        spanInfo.logs.push({
          timestamp: new Date(),
          fields: { event: name, ...attributes },
        });
      }
    }
  }

  /**
   * Set attributes on a span
   */
  setSpanAttributes(span: Span, attributes: Record<string, any>): void {
    // Filter out sensitive attributes
    const filteredAttributes = this.filterSensitiveAttributes(attributes);
    span.setAttributes(filteredAttributes);
    
    const spanContext = trace.getSpanContext(span);
    if (spanContext) {
      const spanInfo = this.activeSpans.get(spanContext.spanId);
      if (spanInfo) {
        Object.assign(spanInfo.tags, filteredAttributes);
      }
    }
  }

  /**
   * Get the active span
   */
  getActiveSpan(): Span | undefined {
    return trace.getActiveSpan();
  }

  /**
   * Run a function within a span context
   */
  runWithSpan<T>(span: Span, fn: () => T): T {
    return trace.runWithSpan(span, fn);
  }

  /**
   * Create a child span from the current active span
   */
  createChildSpan(
    operationName: string,
    attributes?: Record<string, any>,
    correlationContext?: CorrelationContext
  ): Span {
    const activeSpan = this.getActiveSpan();
    return this.startSpan(operationName, {
      parent: activeSpan,
      attributes,
      correlationContext,
    });
  }

  /**
   * Trace an async operation
   */
  async traceOperation<T>(
    operationName: string,
    operation: (span: Span) => Promise<T>,
    options?: {
      attributes?: Record<string, any>;
      correlationContext?: CorrelationContext;
      kind?: SpanKind;
    }
  ): Promise<T> {
    const span = this.startSpan(operationName, {
      attributes: options?.attributes,
      correlationContext: options?.correlationContext,
      kind: options?.kind,
    });

    try {
      const result = await this.runWithSpan(span, () => operation(span));
      this.finishSpan(span);
      return result;
    } catch (error) {
      this.finishSpan(span, error as Error);
      throw error;
    }
  }

  /**
   * Trace a synchronous operation
   */
  traceSync<T>(
    operationName: string,
    operation: (span: Span) => T,
    options?: {
      attributes?: Record<string, any>;
      correlationContext?: CorrelationContext;
      kind?: SpanKind;
    }
  ): T {
    const span = this.startSpan(operationName, {
      attributes: options?.attributes,
      correlationContext: options?.correlationContext,
      kind: options?.kind,
    });

    try {
      const result = this.runWithSpan(span, () => operation(span));
      this.finishSpan(span);
      return result;
    } catch (error) {
      this.finishSpan(span, error as Error);
      throw error;
    }
  }

  /**
   * Trace HTTP requests
   */
  traceHttpRequest(
    method: string,
    url: string,
    statusCode?: number,
    attributes?: Record<string, any>
  ): Span {
    const span = this.startSpan(`HTTP ${method}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'http.method': method,
        'http.url': url,
        'http.status_code': statusCode,
        ...attributes,
      },
    });

    return span;
  }

  /**
   * Trace database operations
   */
  traceDatabaseOperation(
    operation: string,
    table?: string,
    query?: string,
    attributes?: Record<string, any>
  ): Span {
    const span = this.startSpan(`DB ${operation}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'db.operation': operation,
        'db.table': table,
        'db.statement': query ? this.sanitizeQuery(query) : undefined,
        ...attributes,
      },
    });

    return span;
  }

  /**
   * Trace AI model operations
   */
  traceAIOperation(
    modelName: string,
    operation: string,
    inputSize?: number,
    attributes?: Record<string, any>
  ): Span {
    const span = this.startSpan(`AI ${operation}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'ai.model.name': modelName,
        'ai.operation': operation,
        'ai.input.size': inputSize,
        ...attributes,
      },
    });

    return span;
  }

  /**
   * Get trace statistics
   */
  getTraceStatistics(): {
    activeSpans: number;
    totalTraces: number;
    averageSpanDuration: number;
    errorRate: number;
  } {
    const totalSpans = this.traceMetrics.get('total_spans') || 0;
    const totalDuration = this.traceMetrics.get('total_duration') || 0;
    const errorSpans = this.traceMetrics.get('error_spans') || 0;

    return {
      activeSpans: this.activeSpans.size,
      totalTraces: totalSpans,
      averageSpanDuration: totalSpans > 0 ? totalDuration / totalSpans : 0,
      errorRate: totalSpans > 0 ? errorSpans / totalSpans : 0,
    };
  }

  /**
   * Setup OpenTelemetry SDK
   */
  private setupSDK(): void {
    const exporters = [];

    // Jaeger exporter
    if (this.config.enableJaeger) {
      exporters.push(new JaegerExporter({
        endpoint: this.config.jaegerEndpoint || 'http://localhost:14268/api/traces',
      }));
    }

    // Console exporter for development
    if (this.config.enableConsole) {
      const { ConsoleSpanExporter } = require('@opentelemetry/sdk-tracing-base');
      exporters.push(new ConsoleSpanExporter());
    }

    this.sdk = new NodeSDK({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: this.config.serviceVersion,
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: this.config.environment,
      }),
      spanProcessor: this.createSpanProcessor(exporters),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': {
            enabled: false, // Disable file system instrumentation for performance
          },
        }),
        new HttpInstrumentation({
          responseHook: (span, response) => {
            span.setAttributes({
              'http.response.size': response.headers['content-length'],
            });
          },
        }),
        new FastifyInstrumentation(),
        new RedisInstrumentation(),
      ],
    });
  }

  /**
   * Create span processor
   */
  private createSpanProcessor(exporters: any[]): any {
    const { BatchSpanProcessor, SimpleSpanProcessor } = require('@opentelemetry/sdk-tracing-base');
    
    if (exporters.length === 0) {
      return undefined;
    }

    if (exporters.length === 1) {
      if (this.config.environment === 'development') {
        return new SimpleSpanProcessor(exporters[0]);
      } else {
        return new BatchSpanProcessor(exporters[0], {
          maxExportBatchSize: 100,
          exportTimeoutMillis: this.config.exportTimeout,
          scheduledDelayMillis: 1000,
        });
      }
    }

    // Multiple exporters - create a composite processor
    const { CompositeSpanProcessor } = require('@opentelemetry/sdk-tracing-base');
    const processors = exporters.map(exporter => 
      this.config.environment === 'development' 
        ? new SimpleSpanProcessor(exporter)
        : new BatchSpanProcessor(exporter, {
            maxExportBatchSize: 100,
            exportTimeoutMillis: this.config.exportTimeout,
            scheduledDelayMillis: 1000,
          })
    );

    return new CompositeSpanProcessor(processors);
  }

  /**
   * Set baggage from correlation context
   */
  private setBaggageFromCorrelation(span: Span, correlation: CorrelationContext): void {
    const baggageEntries: Record<string, BaggageEntry> = {};
    
    if (correlation.requestId) {
      baggageEntries.requestId = { value: correlation.requestId };
    }
    if (correlation.sessionId) {
      baggageEntries.sessionId = { value: correlation.sessionId };
    }
    if (correlation.userId) {
      baggageEntries.userId = { value: correlation.userId };
    }
    if (correlation.agentId) {
      baggageEntries.agentId = { value: correlation.agentId };
    }
    if (correlation.workflowId) {
      baggageEntries.workflowId = { value: correlation.workflowId };
    }

    if (Object.keys(baggageEntries).length > 0) {
      const baggage = context.active().getValue('baggage') as Baggage || Baggage.fromEntries([]);
      const newBaggage = Baggage.fromEntries([...baggage.getAllEntries(), ...Object.entries(baggageEntries)]);
      context.with(context.active().setValue('baggage', newBaggage), () => {});
    }
  }

  /**
   * Get baggage from span
   */
  private getBaggageFromSpan(span: Span): Record<string, string> | undefined {
    const baggage = context.active().getValue('baggage') as Baggage;
    if (!baggage) return undefined;

    const baggageObj: Record<string, string> = {};
    baggage.getAllEntries().forEach(([key, entry]) => {
      baggageObj[key] = entry.value;
    });

    return Object.keys(baggageObj).length > 0 ? baggageObj : undefined;
  }

  /**
   * Get parent span ID
   */
  private getParentSpanId(parent: Span | Context): string | undefined {
    if (parent instanceof Span) {
      const spanContext = trace.getSpanContext(parent);
      return spanContext?.spanId;
    } else {
      const activeSpan = trace.getSpan(parent);
      if (activeSpan) {
        const spanContext = trace.getSpanContext(activeSpan);
        return spanContext?.spanId;
      }
    }
    return undefined;
  }

  /**
   * Filter sensitive attributes
   */
  private filterSensitiveAttributes(attributes: Record<string, any>): Record<string, any> {
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'authorization', 'cookie'];
    const filtered: Record<string, any> = {};

    Object.entries(attributes).forEach(([key, value]) => {
      const isSensitive = sensitiveKeys.some(sensitive => 
        key.toLowerCase().includes(sensitive.toLowerCase())
      );
      
      if (isSensitive) {
        filtered[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > this.config.maxAttributeLength) {
        filtered[key] = value.substring(0, this.config.maxAttributeLength) + '...';
      } else {
        filtered[key] = value;
      }
    });

    return filtered;
  }

  /**
   * Sanitize database query
   */
  private sanitizeQuery(query: string): string {
    // Remove potential sensitive data from queries
    return query
      .replace(/password\s*=\s*'[^']*'/gi, "password='[REDACTED]'")
      .replace(/token\s*=\s*'[^']*'/gi, "token='[REDACTED]'")
      .substring(0, this.config.maxAttributeLength);
  }

  /**
   * Update trace metrics
   */
  private updateTraceMetrics(traceSpan: TraceSpan): void {
    // Update total spans
    const totalSpans = (this.traceMetrics.get('total_spans') || 0) + 1;
    this.traceMetrics.set('total_spans', totalSpans);

    // Update total duration
    const totalDuration = (this.traceMetrics.get('total_duration') || 0) + (traceSpan.duration || 0);
    this.traceMetrics.set('total_duration', totalDuration);

    // Update error count
    if (traceSpan.status === 'error') {
      const errorSpans = (this.traceMetrics.get('error_spans') || 0) + 1;
      this.traceMetrics.set('error_spans', errorSpans);
    }

    // Update operation metrics
    const operationKey = `operation_${traceSpan.operationName}`;
    const operationCount = (this.traceMetrics.get(operationKey) || 0) + 1;
    this.traceMetrics.set(operationKey, operationCount);
  }

  /**
   * Shutdown tracing service
   */
  async shutdown(): Promise<void> {
    this.logger?.info('Tracing service shutting down', {
      service: 'tracing-service' as ServiceType,
      environment: this.config.environment,
    });

    // Finish all active spans
    this.activeSpans.forEach((spanInfo) => {
      this.finishSpan(spanInfo.span);
    });

    // Shutdown SDK
    if (this.initialized) {
      await this.sdk.shutdown();
    }

    this.emit('shutdown');
  }
}