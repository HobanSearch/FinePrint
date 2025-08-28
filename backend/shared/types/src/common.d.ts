export interface BaseEntity {
    id: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    pagination?: PaginationInfo;
    metadata?: Record<string, any>;
}
export interface PaginationInfo {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}
export interface PaginationQuery {
    page?: number;
    limit?: number;
    sort?: string;
    order?: 'asc' | 'desc';
    search?: string;
}
export interface HealthCheck {
    service: string;
    status: 'healthy' | 'unhealthy' | 'degraded';
    timestamp: Date;
    uptime: number;
    version: string;
    dependencies: DependencyStatus[];
}
export interface DependencyStatus {
    name: string;
    status: 'connected' | 'disconnected';
    responseTimeMs?: number;
    error?: string;
}
export interface ServiceConfig {
    name: string;
    version: string;
    port: number;
    env: 'development' | 'staging' | 'production';
    logLevel: 'debug' | 'info' | 'warn' | 'error';
}
export interface MetricsData {
    timestamp: Date;
    service: string;
    metric: string;
    value: number;
    tags?: Record<string, string>;
}
export declare class AppError extends Error {
    readonly statusCode: number;
    readonly isOperational: boolean;
    readonly errorCode?: string;
    constructor(message: string, statusCode?: number, isOperational?: boolean, errorCode?: string);
}
export declare class ValidationError extends AppError {
    constructor(message: string, field?: string);
}
export declare class NotFoundError extends AppError {
    constructor(resource: string);
}
export declare class UnauthorizedError extends AppError {
    constructor(message?: string);
}
export declare class ForbiddenError extends AppError {
    constructor(message?: string);
}
export declare class RateLimitError extends AppError {
    constructor(message?: string);
}
//# sourceMappingURL=common.d.ts.map