import { FastifyInstance } from 'fastify';
export declare function setupErrorHandling(fastify: FastifyInstance): void;
export declare class DevOpsAgentError extends Error {
    readonly statusCode: number;
    readonly code: string;
    constructor(message: string, statusCode?: number, code?: string);
}
export declare class InfrastructureError extends DevOpsAgentError {
    constructor(message: string, statusCode?: number);
}
export declare class PipelineError extends DevOpsAgentError {
    constructor(message: string, statusCode?: number);
}
export declare class KubernetesError extends DevOpsAgentError {
    constructor(message: string, statusCode?: number);
}
export declare class SecurityError extends DevOpsAgentError {
    constructor(message: string, statusCode?: number);
}
export declare class MonitoringError extends DevOpsAgentError {
    constructor(message: string, statusCode?: number);
}
export declare function reportError(error: Error, context?: Record<string, any>): void;
export declare function asyncErrorHandler<T extends any[], R>(fn: (...args: T) => Promise<R>): (...args: T) => Promise<R>;
export declare function withErrorBoundary<T>(operation: () => Promise<T>, fallback?: () => T | Promise<T>, errorContext?: Record<string, any>): Promise<T>;
//# sourceMappingURL=error-handler.d.ts.map