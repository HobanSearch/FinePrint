"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoringError = exports.SecurityError = exports.KubernetesError = exports.PipelineError = exports.InfrastructureError = exports.DevOpsAgentError = void 0;
exports.setupErrorHandling = setupErrorHandling;
exports.reportError = reportError;
exports.asyncErrorHandler = asyncErrorHandler;
exports.withErrorBoundary = withErrorBoundary;
const logger_1 = require("./logger");
const logger = (0, logger_1.createContextLogger)('ErrorHandler');
function setupErrorHandling(fastify) {
    logger.info('Setting up global error handling...');
    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Promise Rejection:', {
            reason,
            promise: promise.toString(),
            stack: reason instanceof Error ? reason.stack : undefined,
        });
        if (process.env.NODE_ENV === 'production') {
            logger.error('Shutting down due to unhandled promise rejection');
            process.exit(1);
        }
    });
    process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception:', {
            error: error.message,
            stack: error.stack,
        });
        logger.error('Shutting down due to uncaught exception');
        process.exit(1);
    });
    fastify.setErrorHandler(async (error, request, reply) => {
        logger.error('Request error:', {
            error: error.message,
            stack: error.stack,
            url: request.url,
            method: request.method,
            headers: request.headers,
            body: request.body,
        });
        if (error.validation) {
            return reply.status(400).send({
                success: false,
                error: 'Validation Error',
                message: 'Request validation failed',
                details: error.validation.map(v => ({
                    field: v.instancePath,
                    message: v.message,
                    value: v.data,
                })),
            });
        }
        if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
            return reply.status(401).send({
                success: false,
                error: 'Unauthorized',
                message: 'Authorization header is required',
            });
        }
        if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
            return reply.status(401).send({
                success: false,
                error: 'Unauthorized',
                message: 'Invalid authorization token',
            });
        }
        if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
            return reply.status(401).send({
                success: false,
                error: 'Unauthorized',
                message: 'Authorization token has expired',
            });
        }
        if (error.code === 'FST_TOO_MANY_REQUESTS') {
            return reply.status(429).send({
                success: false,
                error: 'Too Many Requests',
                message: 'Rate limit exceeded. Please try again later.',
            });
        }
        if (error.statusCode === 404) {
            return reply.status(404).send({
                success: false,
                error: 'Not Found',
                message: 'The requested resource was not found',
            });
        }
        if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
            return reply.status(error.statusCode).send({
                success: false,
                error: error.name || 'Client Error',
                message: error.message,
            });
        }
        if (error.statusCode && error.statusCode >= 500) {
            return reply.status(error.statusCode).send({
                success: false,
                error: error.name || 'Server Error',
                message: error.message,
            });
        }
        if (error.message.includes('deployment not found')) {
            return reply.status(404).send({
                success: false,
                error: 'Resource Not Found',
                message: error.message,
            });
        }
        if (error.message.includes('insufficient permissions')) {
            return reply.status(403).send({
                success: false,
                error: 'Forbidden',
                message: error.message,
            });
        }
        if (error.message.includes('quota exceeded')) {
            return reply.status(429).send({
                success: false,
                error: 'Quota Exceeded',
                message: error.message,
            });
        }
        if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
            return reply.status(408).send({
                success: false,
                error: 'Request Timeout',
                message: 'The request timed out. Please try again.',
            });
        }
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            return reply.status(503).send({
                success: false,
                error: 'Service Unavailable',
                message: 'Unable to connect to external service. Please try again later.',
            });
        }
        return reply.status(500).send({
            success: false,
            error: 'Internal Server Error',
            message: process.env.NODE_ENV === 'production'
                ? 'An unexpected error occurred'
                : error.message,
            ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
        });
    });
    fastify.setNotFoundHandler(async (request, reply) => {
        logger.warn(`Route not found: ${request.method} ${request.url}`);
        return reply.status(404).send({
            success: false,
            error: 'Not Found',
            message: `Route ${request.method} ${request.url} not found`,
            suggestion: 'Check the API documentation at /docs for available endpoints',
        });
    });
    logger.info('Global error handling setup completed');
}
class DevOpsAgentError extends Error {
    statusCode;
    code;
    constructor(message, statusCode = 500, code) {
        super(message);
        this.name = 'DevOpsAgentError';
        this.statusCode = statusCode;
        this.code = code || 'DEVOPS_AGENT_ERROR';
    }
}
exports.DevOpsAgentError = DevOpsAgentError;
class InfrastructureError extends DevOpsAgentError {
    constructor(message, statusCode = 500) {
        super(message, statusCode, 'INFRASTRUCTURE_ERROR');
        this.name = 'InfrastructureError';
    }
}
exports.InfrastructureError = InfrastructureError;
class PipelineError extends DevOpsAgentError {
    constructor(message, statusCode = 500) {
        super(message, statusCode, 'PIPELINE_ERROR');
        this.name = 'PipelineError';
    }
}
exports.PipelineError = PipelineError;
class KubernetesError extends DevOpsAgentError {
    constructor(message, statusCode = 500) {
        super(message, statusCode, 'KUBERNETES_ERROR');
        this.name = 'KubernetesError';
    }
}
exports.KubernetesError = KubernetesError;
class SecurityError extends DevOpsAgentError {
    constructor(message, statusCode = 500) {
        super(message, statusCode, 'SECURITY_ERROR');
        this.name = 'SecurityError';
    }
}
exports.SecurityError = SecurityError;
class MonitoringError extends DevOpsAgentError {
    constructor(message, statusCode = 500) {
        super(message, statusCode, 'MONITORING_ERROR');
        this.name = 'MonitoringError';
    }
}
exports.MonitoringError = MonitoringError;
function reportError(error, context) {
    logger.error('Error reported:', {
        error: error.message,
        stack: error.stack,
        context,
    });
    if (process.env.NODE_ENV === 'production') {
    }
}
function asyncErrorHandler(fn) {
    return async (...args) => {
        try {
            return await fn(...args);
        }
        catch (error) {
            reportError(error, { args });
            throw error;
        }
    };
}
async function withErrorBoundary(operation, fallback, errorContext) {
    try {
        return await operation();
    }
    catch (error) {
        reportError(error, errorContext);
        if (fallback) {
            logger.warn('Using fallback due to error in operation');
            return await fallback();
        }
        throw error;
    }
}
//# sourceMappingURL=error-handler.js.map