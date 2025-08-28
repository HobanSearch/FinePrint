import { trace, context, SpanKind, SpanStatusCode, Span } from '@opentelemetry/api';
export declare function initializeTracing(): void;
export declare class TracingUtils {
    private static getTracer;
    static startSpan(name: string, options?: {
        kind?: SpanKind;
        attributes?: Record<string, string | number | boolean>;
        parent?: Span | undefined;
    }): Span;
    static traceFunction<T>(name: string, fn: (span: Span) => Promise<T>, options?: {
        kind?: SpanKind;
        attributes?: Record<string, string | number | boolean>;
    }): Promise<T>;
    static traceDocumentCrawl<T>(url: string, userId: string, fn: (span: Span) => Promise<T>): Promise<T>;
    static traceChangeDetection<T>(documentId: string, changeType: string, fn: (span: Span) => Promise<T>): Promise<T>;
    static traceWebhookDelivery<T>(webhookId: string, eventType: string, targetUrl: string, fn: (span: Span) => Promise<T>): Promise<T>;
    static traceAlertProcessing<T>(alertId: string, severity: string, ruleId: string, fn: (span: Span) => Promise<T>): Promise<T>;
    static traceDatabaseOperation<T>(operation: string, collection: string, fn: (span: Span) => Promise<T>): Promise<T>;
    static traceQueueJob<T>(queueName: string, jobType: string, jobId: string, fn: (span: Span) => Promise<T>): Promise<T>;
    static traceCircuitBreakerCall<T>(breakerName: string, fn: (span: Span) => Promise<T>): Promise<T>;
    static addSpanAttributes(attributes: Record<string, string | number | boolean>): void;
    static addSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
    static recordException(error: Error, attributes?: Record<string, string | number | boolean>): void;
    static setSpanError(message: string, error?: Error): void;
    static setSpanOK(): void;
    static getCurrentTraceId(): string | undefined;
    static getCurrentSpanId(): string | undefined;
    static createChildSpan(name: string, attributes?: Record<string, string | number | boolean>): Span;
    static withSpan<T>(span: Span, fn: () => T): T;
    static withSpanAsync<T>(span: Span, fn: () => Promise<T>): Promise<T>;
}
export declare function traceMethod(operationName?: string, options?: {
    attributes?: Record<string, string | number | boolean>;
    kind?: SpanKind;
}): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
export declare function createTracingMiddleware(): (request: any, reply: any, next: () => void) => Promise<void>;
export declare function shutdownTracing(): Promise<void>;
export { trace, context, SpanKind, SpanStatusCode };
//# sourceMappingURL=tracing.d.ts.map