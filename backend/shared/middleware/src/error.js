"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupErrorHandling = exports.asyncHandler = exports.createErrorResponse = exports.notFoundHandler = exports.errorHandler = void 0;
const zod_1 = require("zod");
const types_1 = require("@fineprintai/types");
const config_1 = require("@fineprintai/config");
const errorHandler = (error, request, reply) => {
    request.log.error({
        error: {
            message: error.message,
            stack: error.stack,
            statusCode: error.statusCode,
        },
        request: {
            url: request.url,
            method: request.method,
            headers: request.headers,
            ip: request.ip,
        },
    }, 'Request error occurred');
    if (error instanceof zod_1.ZodError) {
        return reply.status(400).send({
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: error.errors.map(err => ({
                field: err.path.join('.'),
                message: err.message,
                code: err.code,
            })),
        });
    }
    if (error instanceof types_1.AppError) {
        return reply.status(error.statusCode).send({
            success: false,
            error: error.errorCode || error.name,
            message: error.message,
        });
    }
    if (error.validation) {
        return reply.status(400).send({
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: error.validation,
        });
    }
    if (error.statusCode) {
        let errorCode = 'HTTP_ERROR';
        let message = error.message;
        switch (error.statusCode) {
            case 400:
                errorCode = 'BAD_REQUEST';
                break;
            case 401:
                errorCode = 'UNAUTHORIZED';
                message = 'Authentication required';
                break;
            case 403:
                errorCode = 'FORBIDDEN';
                message = 'Access denied';
                break;
            case 404:
                errorCode = 'NOT_FOUND';
                message = 'Resource not found';
                break;
            case 409:
                errorCode = 'CONFLICT';
                break;
            case 422:
                errorCode = 'UNPROCESSABLE_ENTITY';
                break;
            case 429:
                errorCode = 'RATE_LIMIT_EXCEEDED';
                message = 'Too many requests';
                break;
        }
        return reply.status(error.statusCode).send({
            success: false,
            error: errorCode,
            message,
        });
    }
    if (error.message?.includes('ECONNREFUSED') || error.message?.includes('ENOTFOUND')) {
        request.log.error('Database connection error', { error: error.message });
        return reply.status(503).send({
            success: false,
            error: 'SERVICE_UNAVAILABLE',
            message: 'Service temporarily unavailable',
        });
    }
    if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
        return reply.status(408).send({
            success: false,
            error: 'REQUEST_TIMEOUT',
            message: 'Request timeout',
        });
    }
    const isDevelopment = config_1.config.NODE_ENV === 'development';
    return reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        ...(isDevelopment && {
            details: {
                message: error.message,
                stack: error.stack,
            },
        }),
    });
};
exports.errorHandler = errorHandler;
const notFoundHandler = (request, reply) => {
    return reply.status(404).send({
        success: false,
        error: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
    });
};
exports.notFoundHandler = notFoundHandler;
const createErrorResponse = (statusCode, errorCode, message, details) => {
    return {
        success: false,
        error: errorCode,
        message,
        ...(details && { details }),
    };
};
exports.createErrorResponse = createErrorResponse;
const asyncHandler = (fn) => {
    return async (request, reply) => {
        try {
            return await fn(request, reply);
        }
        catch (error) {
            throw error;
        }
    };
};
exports.asyncHandler = asyncHandler;
const setupErrorHandling = () => {
    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
        process.exit(1);
    });
};
exports.setupErrorHandling = setupErrorHandling;
//# sourceMappingURL=error.js.map