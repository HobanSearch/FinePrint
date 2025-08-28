import { PrismaClient } from '@prisma/client';
export interface DatabaseSecurityConfig {
    enableQueryValidation: boolean;
    enableQueryLogging: boolean;
    enableSlowQueryLogging: boolean;
    slowQueryThreshold: number;
    enableEncryption: boolean;
    enableFieldLevelEncryption: boolean;
    maxQueryComplexity: number;
    connectionTimeout: number;
    maxConnections: number;
    enableReadReplicas: boolean;
}
export interface QueryMetrics {
    queryCount: number;
    slowQueries: number;
    blockedQueries: number;
    averageExecutionTime: number;
    peakConnections: number;
}
export interface EncryptedField {
    table: string;
    field: string;
    keyId: string;
    algorithm: string;
}
export declare class DatabaseSecurity {
    private prisma;
    private config;
    private encryptedFields;
    private queryMetrics;
    private readonly sqlInjectionPatterns;
    private readonly dangerousFunctions;
    constructor(prisma: PrismaClient, config?: Partial<DatabaseSecurityConfig>);
    validateQuery(query: string, params: any[]): Promise<{
        isValid: boolean;
        sanitizedParams: any[];
        errors: string[];
    }>;
    encryptField(table: string, field: string, value: string): Promise<string>;
    decryptField(table: string, field: string, encryptedValue: string): Promise<string>;
    createSecureConnection(): PrismaClient;
    healthCheck(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        metrics: QueryMetrics;
        securityAlerts: string[];
    }>;
    secureBulkInsert(table: string, data: any[], userId?: string): Promise<number>;
    executeSecureQuery<T>(query: string, params?: any[], userId?: string, operation?: 'read' | 'write'): Promise<T>;
    private detectSQLInjection;
    private containsSQLKeywords;
    private calculateQueryComplexity;
    private initializeFieldEncryption;
    private setupDatabaseMiddleware;
    private updateQueryMetrics;
    private startMetricsCollection;
    private buildSecureConnectionString;
    private sanitizeQueryForLogging;
    private sanitizeParamsForLogging;
}
export declare function createDatabaseSecurity(prisma: PrismaClient, config?: Partial<DatabaseSecurityConfig>): DatabaseSecurity;
//# sourceMappingURL=db-security.d.ts.map