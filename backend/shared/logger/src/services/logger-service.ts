/**
 * Comprehensive LoggerService for Fine Print AI
 * Provides structured logging with correlation ID tracking, multiple transports, and business intelligence
 */

import pino, { Logger as PinoLogger } from 'pino';
import { createNamespace, getNamespace, Namespace } from 'cls-hooked';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import {
  LogLevel,
  LogEntry,
  LogContext,
  CorrelationContext,
  EventCategory,
  ErrorDetails,
  ServiceType,
  Environment,
  LoggerConfig,
  BusinessContext,
  TechnicalContext,
  SecurityContext
} from '../types';
import { MetricsService } from './metrics-service';
import { StreamingService } from './streaming-service';

// Correlation context namespace for request tracking
const CORRELATION_NAMESPACE = 'correlation-context';

export class LoggerService extends EventEmitter {
  private logger: PinoLogger;
  private config: LoggerConfig;
  private correlationNamespace: Namespace;
  private metricsService?: MetricsService;
  private streamingService?: StreamingService;
  private logBuffer: LogEntry[] = [];
  private bufferFlushInterval: NodeJS.Timeout;
  private redactPatterns: RegExp[];

  constructor(config: LoggerConfig) {
    super();
    this.config = config;
    this.correlationNamespace = getNamespace(CORRELATION_NAMESPACE) || createNamespace(CORRELATION_NAMESPACE);
    this.redactPatterns = this.createRedactPatterns(config.redactFields);
    this.logger = this.createPinoLogger();
    this.setupBufferFlushing();
    this.setupEventHandlers();
  }

  /**
   * Initialize logger with metrics and streaming services
   */
  async initialize(metricsService?: MetricsService, streamingService?: StreamingService): Promise<void> {
    this.metricsService = metricsService;
    this.streamingService = streamingService;
    
    this.info('Logger service initialized', {
      service: 'logger-service' as ServiceType,
      environment: this.config.environment,
      version: '1.0.0',
      enabledFeatures: {
        metrics: !!this.metricsService,
        streaming: !!this.streamingService,
        tracing: this.config.enableTracing,
        anomalyDetection: this.config.enableAnomalyDetection,
      },
    });
  }

  /**
   * Create correlation context for request tracking
   */
  createCorrelationContext(context?: Partial<CorrelationContext>): CorrelationContext {
    return {
      requestId: context?.requestId || uuidv4(),
      sessionId: context?.sessionId,
      userId: context?.userId,
      agentId: context?.agentId,
      workflowId: context?.workflowId,
      parentSpanId: context?.parentSpanId,
      traceId: context?.traceId || uuidv4(),
      causationId: context?.causationId,
      correlationId: context?.correlationId || uuidv4(),
    };
  }

  /**
   * Run function within correlation context
   */
  runWithCorrelation<T>(context: CorrelationContext, fn: () => T): T {
    return this.correlationNamespace.runAndReturn(() => {
      this.correlationNamespace.set('correlationContext', context);
      return fn();
    });
  }

  /**
   * Get current correlation context
   */
  getCorrelationContext(): CorrelationContext | undefined {
    return this.correlationNamespace.get('correlationContext');
  }

  /**
   * Trace level logging - most verbose
   */
  trace(message: string, context?: Partial<LogContext>): void {
    this.log('trace', message, 'technical', context);
  }

  /**
   * Debug level logging - development information
   */
  debug(message: string, context?: Partial<LogContext>): void {
    this.log('debug', message, 'technical', context);
  }

  /**
   * Info level logging - general information
   */
  info(message: string, context?: Partial<LogContext>): void {
    this.log('info', message, 'technical', context);
  }

  /**
   * Warning level logging - potential issues
   */
  warn(message: string, context?: Partial<LogContext>, error?: Error): void {
    this.log('warn', message, 'technical', context, error);
  }

  /**
   * Error level logging - application errors
   */
  error(message: string, context?: Partial<LogContext>, error?: Error): void {
    this.log('error', message, 'error', context, error);
  }

  /**
   * Fatal level logging - critical system failures
   */
  fatal(message: string, context?: Partial<LogContext>, error?: Error): void {
    this.log('fatal', message, 'error', context, error);
  }

  /**
   * Business event logging for revenue and customer tracking
   */
  business(message: string, businessContext: BusinessContext, context?: Partial<LogContext>): void {
    const enhancedContext = {
      ...context,
      businessContext,
    };
    this.log('info', message, 'business', enhancedContext);
  }

  /**
   * Performance logging with timing information
   */
  performance(operation: string, duration: number, context?: Partial<LogContext>): void {
    const performanceContext = {
      ...context,
      operation,
      duration,
      technicalContext: {
        ...context?.technicalContext,
        responseTime: duration,
      },
    };
    
    const level = duration > 5000 ? 'warn' : duration > 1000 ? 'info' : 'debug';
    this.log(level as LogLevel, `Performance: ${operation} completed in ${duration}ms`, 'performance', performanceContext);
  }

  /**
   * Security event logging for compliance and audit
   */
  security(event: string, securityContext: SecurityContext, context?: Partial<LogContext>): void {
    const enhancedContext = {
      ...context,
      securityContext,
    };
    this.log('warn', `Security Event: ${event}`, 'security', enhancedContext);
  }

  /**
   * Audit logging for compliance requirements
   */
  audit(action: string, resource: string, result: 'success' | 'failure', context?: Partial<LogContext>): void {
    const auditContext = {
      ...context,
      metadata: {
        ...context?.metadata,
        auditAction: action,
        auditResource: resource,
        auditResult: result,
        auditTimestamp: new Date().toISOString(),
      },
    };
    this.log('info', `Audit: ${action} on ${resource} - ${result}`, 'audit', auditContext);
  }

  /**
   * User action logging for behavior analytics
   */
  userAction(action: string, userId: string, context?: Partial<LogContext>): void {
    const actionContext = {
      ...context,
      userId,
      metadata: {
        ...context?.metadata,
        userAction: action,
        actionTimestamp: new Date().toISOString(),
      },
    };
    this.log('info', `User Action: ${action}`, 'user-action', actionContext);
  }

  /**
   * AI inference logging for model performance tracking
   */
  aiInference(
    modelName: string,
    inferenceTime: number,
    confidence: number,
    context?: Partial<LogContext>
  ): void {
    const aiContext = {
      ...context,
      metadata: {
        ...context?.metadata,
        modelName,
        inferenceTime,
        confidence,
        aiTimestamp: new Date().toISOString(),
      },
    };
    this.log('info', `AI Inference: ${modelName} (${inferenceTime}ms, confidence: ${confidence})`, 'ai-inference', aiContext);
  }

  /**
   * Create timer for measuring operation duration
   */
  timer(operation: string, context?: Partial<LogContext>): () => void {
    const startTime = Date.now();
    const operationId = uuidv4();
    
    this.debug(`Timer started: ${operation}`, {
      ...context,
      metadata: { ...context?.metadata, operationId, timerEvent: 'start' },
    });

    return () => {
      const duration = Date.now() - startTime;
      this.performance(operation, duration, {
        ...context,
        metadata: { ...context?.metadata, operationId, timerEvent: 'complete' },
      });
    };
  }

  /**
   * Create child logger with additional context
   */
  child(context: Partial<LogContext>): LoggerService {
    const childLogger = new LoggerService(this.config);
    childLogger.metricsService = this.metricsService;
    childLogger.streamingService = this.streamingService;
    
    // Override log method to merge contexts
    const originalLog = childLogger.log.bind(childLogger);
    childLogger.log = (level, message, category, childContext, error) => {
      const mergedContext = this.mergeContexts(context, childContext);
      originalLog(level, message, category, mergedContext, error);
    };

    return childLogger;
  }

  /**
   * Core logging method - handles all log levels and processing
   */
  private log(
    level: LogLevel,
    message: string,
    category: EventCategory,
    context?: Partial<LogContext>,
    error?: Error
  ): void {
    // Check if we should log at this level
    if (!this.shouldLog(level)) {
      return;
    }

    // Apply sampling if enabled
    if (this.config.sampling.enabled && Math.random() > this.config.sampling.rate) {
      return;
    }

    // Build complete log context
    const correlationContext = this.getCorrelationContext();
    const completeContext = this.buildLogContext(context, correlationContext);

    // Create log entry
    const logEntry: LogEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      level,
      message: this.redactSensitiveData(message),
      category,
      context: completeContext,
      error: error ? this.serializeError(error) : undefined,
      stackTrace: error?.stack,
      fingerprint: this.createFingerprint(message, level, category),
      hash: this.createLogHash(message, completeContext),
    };

    // Process the log entry
    this.processLogEntry(logEntry);
  }

  /**
   * Process log entry through all transports and services
   */
  private processLogEntry(entry: LogEntry): void {
    try {
      // Emit to event listeners
      this.emit('log', entry);

      // Write to Pino logger
      this.writeToLogger(entry);

      // Send to metrics service
      if (this.metricsService) {
        this.updateMetrics(entry);
      }

      // Stream to real-time subscribers
      if (this.streamingService) {
        this.streamingService.streamLog(entry);
      }

      // Buffer for batch processing
      this.bufferLogEntry(entry);

    } catch (processingError) {
      // Avoid infinite loops by using console directly for processing errors
      console.error('Log processing error:', processingError);
    }
  }

  /**
   * Write log entry to Pino logger
   */
  private writeToLogger(entry: LogEntry): void {
    const logObject = {
      ...entry.context,
      category: entry.category,
      fingerprint: entry.fingerprint,
      hash: entry.hash,
      ...(entry.error && { error: entry.error }),
    };

    this.logger[entry.level](logObject, entry.message);
  }

  /**
   * Update metrics based on log entry
   */
  private updateMetrics(entry: LogEntry): void {
    try {
      // Increment log counter
      this.metricsService?.incrementCounter('logs_total', {
        level: entry.level,
        service: entry.context.service,
        category: entry.category,
      });

      // Track error rates
      if (entry.level === 'error' || entry.level === 'fatal') {
        this.metricsService?.incrementCounter('errors_total', {
          service: entry.context.service,
          level: entry.level,
        });
      }

      // Track performance metrics
      if (entry.context.duration) {
        this.metricsService?.recordHistogram('operation_duration_seconds', entry.context.duration / 1000, {
          operation: entry.context.operation || 'unknown',
          service: entry.context.service,
        });
      }

      // Track business metrics
      if (entry.context.businessContext) {
        this.trackBusinessMetrics(entry);
      }

    } catch (metricsError) {
      console.error('Metrics update error:', metricsError);
    }
  }

  /**
   * Track business-specific metrics
   */
  private trackBusinessMetrics(entry: LogEntry): void {
    const business = entry.context.businessContext;
    if (!business) return;

    if (business.revenue) {
      this.metricsService?.recordGauge('revenue_total', business.revenue, {
        customerId: business.customerId || 'unknown',
        planType: business.planType || 'unknown',
      });
    }

    if (business.conversionEvent) {
      this.metricsService?.incrementCounter('conversions_total', {
        event: business.conversionEvent,
        customerId: business.customerId || 'unknown',
      });
    }
  }

  /**
   * Buffer log entry for batch processing
   */
  private bufferLogEntry(entry: LogEntry): void {
    this.logBuffer.push(entry);
    
    // Flush buffer if it gets too large
    if (this.logBuffer.length >= 1000) {
      this.flushBuffer();
    }
  }

  /**
   * Flush log buffer to persistent storage
   */
  private flushBuffer(): void {
    if (this.logBuffer.length === 0) return;

    const entries = [...this.logBuffer];
    this.logBuffer = [];

    // Process buffer asynchronously
    setImmediate(() => {
      this.emit('buffer-flush', entries);
    });
  }

  /**
   * Build complete log context from partial context and correlation
   */
  private buildLogContext(context?: Partial<LogContext>, correlation?: CorrelationContext): LogContext {
    return {
      service: context?.service || this.config.serviceName as ServiceType,
      environment: this.config.environment,
      version: context?.version || '1.0.0',
      component: context?.component,
      operation: context?.operation,
      duration: context?.duration,
      metadata: context?.metadata,
      tags: context?.tags,
      businessContext: context?.businessContext,
      technicalContext: context?.technicalContext,
      securityContext: context?.securityContext,
      // Correlation context
      requestId: correlation?.requestId || context?.requestId || uuidv4(),
      sessionId: correlation?.sessionId || context?.sessionId,
      userId: correlation?.userId || context?.userId,
      agentId: correlation?.agentId || context?.agentId,
      workflowId: correlation?.workflowId || context?.workflowId,
      parentSpanId: correlation?.parentSpanId || context?.parentSpanId,
      traceId: correlation?.traceId || context?.traceId,
      causationId: correlation?.causationId || context?.causationId,
      correlationId: correlation?.correlationId || context?.correlationId,
    };
  }

  /**
   * Merge multiple contexts
   */
  private mergeContexts(...contexts: (Partial<LogContext> | undefined)[]): Partial<LogContext> {
    return contexts.reduce((merged, context) => {
      if (!context) return merged;
      
      return {
        ...merged,
        ...context,
        metadata: { ...merged.metadata, ...context.metadata },
        tags: [...(merged.tags || []), ...(context.tags || [])],
        businessContext: { ...merged.businessContext, ...context.businessContext },
        technicalContext: { ...merged.technicalContext, ...context.technicalContext },
        securityContext: { ...merged.securityContext, ...context.securityContext },
      };
    }, {} as Partial<LogContext>);
  }

  /**
   * Create Pino logger instance with configuration
   */
  private createPinoLogger(): PinoLogger {
    const transport = this.createTransport();
    
    return pino({
      level: this.config.logLevel,
      name: this.config.serviceName,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
      },
      serializers: {
        error: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
      },
      redact: {
        paths: this.config.redactFields,
        censor: '[REDACTED]',
      },
    }, transport);
  }

  /**
   * Create Pino transport configuration
   */
  private createTransport() {
    const targets: any[] = [];

    // Console transport
    if (this.config.enableConsole) {
      targets.push({
        target: 'pino-pretty',
        level: this.config.logLevel,
        options: {
          colorize: this.config.environment === 'development',
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      });
    }

    // File transport
    if (this.config.enableFile) {
      targets.push({
        target: 'pino/file',
        level: this.config.logLevel,
        options: {
          destination: `./logs/${this.config.serviceName}.log`,
        },
      });
    }

    // Elasticsearch transport
    if (this.config.enableElasticsearch) {
      targets.push({
        target: 'pino-elasticsearch',
        level: this.config.logLevel,
        options: {
          index: `fineprint-logs-${this.config.environment}`,
          node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
          'es-version': 8,
        },
      });
    }

    return targets.length > 1 ? 
      pino.transport({ targets }) : 
      targets[0] ? pino.transport(targets[0]) : undefined;
  }

  /**
   * Setup buffer flushing interval
   */
  private setupBufferFlushing(): void {
    this.bufferFlushInterval = setInterval(() => {
      this.flushBuffer();
    }, 5000); // Flush every 5 seconds
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.fatal('Uncaught Exception', {
        service: 'logger-service' as ServiceType,
        environment: this.config.environment,
      }, error);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.error('Unhandled Promise Rejection', {
        service: 'logger-service' as ServiceType,
        environment: this.config.environment,
        metadata: { promise: promise.toString() },
      }, reason instanceof Error ? reason : new Error(String(reason)));
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      this.info('Received SIGTERM, shutting down gracefully', {
        service: 'logger-service' as ServiceType,
        environment: this.config.environment,
      });
      this.shutdown();
    });
  }

  /**
   * Check if log level should be processed
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      trace: 10,
      debug: 20,
      info: 30,
      warn: 40,
      error: 50,
      fatal: 60,
    };

    return levels[level] >= levels[this.config.logLevel];
  }

  /**
   * Serialize error object
   */
  private serializeError(error: Error): ErrorDetails {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause instanceof Error ? this.serializeError(error.cause) : undefined,
    };
  }

  /**
   * Create fingerprint for log deduplication
   */
  private createFingerprint(message: string, level: LogLevel, category: EventCategory): string {
    const content = `${level}:${category}:${message.substring(0, 100)}`;
    return Buffer.from(content).toString('base64').substring(0, 16);
  }

  /**
   * Create hash for log entry
   */
  private createLogHash(message: string, context: LogContext): string {
    const content = `${message}:${JSON.stringify(context)}`;
    return require('crypto').createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Create redact patterns from field list
   */
  private createRedactPatterns(fields: string[]): RegExp[] {
    return fields.map(field => new RegExp(`"${field}"\\s*:\\s*"[^"]*"`, 'gi'));
  }

  /**
   * Redact sensitive data from message
   */
  private redactSensitiveData(message: string): string {
    let redacted = message;
    this.redactPatterns.forEach(pattern => {
      redacted = redacted.replace(pattern, (match) => {
        const [key] = match.split(':');
        return `${key}: "[REDACTED]"`;
      });
    });
    return redacted;
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.info('Logger service shutting down', {
      service: 'logger-service' as ServiceType,
      environment: this.config.environment,
    });

    // Clear intervals
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
    }

    // Flush remaining logs
    this.flushBuffer();

    // Wait for pending operations
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Close logger
    if (this.logger && typeof this.logger.flush === 'function') {
      await this.logger.flush();
    }
  }
}