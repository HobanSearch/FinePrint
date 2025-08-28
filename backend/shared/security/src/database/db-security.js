"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseSecurity = void 0;
exports.createDatabaseSecurity = createDatabaseSecurity;
const client_1 = require("@prisma/client");
const input_sanitizer_1 = require("../validation/input-sanitizer");
const kms_1 = require("../encryption/kms");
const audit_logger_1 = require("../audit/audit-logger");
const index_1 = require("../index");
class DatabaseSecurity {
    prisma;
    config;
    encryptedFields = new Map();
    queryMetrics = {
        queryCount: 0,
        slowQueries: 0,
        blockedQueries: 0,
        averageExecutionTime: 0,
        peakConnections: 0
    };
    sqlInjectionPatterns = [
        /\bunion\b.*\bselect\b/i,
        /\bunion\b.*\ball\b.*\bselect\b/i,
        /\bor\b.*['"].*['"]\s*=\s*['"].*['"]/i,
        /\band\b.*['"].*['"]\s*=\s*['"].*['"]/i,
        /\bor\b.*\d+\s*=\s*\d+/i,
        /\band\b.*\d+\s*=\s*\d+/i,
        /\bwaitfor\b.*\bdelay\b/i,
        /\bsleep\b\s*\(/i,
        /\bbenchmark\b\s*\(/i,
        /\bpg_sleep\b\s*\(/i,
        /\/\*.*\*\//,
        /--.*$/m,
        /#.*$/m,
        /\b(drop|delete|insert|update|create|alter|exec|execute|sp_|xp_)\b/i,
        /\b(load_file|into\s+outfile|into\s+dumpfile)\b/i,
        /0x[0-9a-f]+/i,
        /\|\||concat\s*\(/i,
        /\(\s*select\b/i,
        /information_schema/i,
        /pg_catalog/i,
        /sys\./i,
        /\b(version|user|database|schema)\s*\(\s*\)/i
    ];
    dangerousFunctions = [
        'exec', 'execute', 'eval', 'system', 'shell_exec',
        'passthru', 'file_get_contents', 'file_put_contents',
        'fopen', 'fwrite', 'include', 'require'
    ];
    constructor(prisma, config = {}) {
        this.prisma = prisma;
        this.config = {
            enableQueryValidation: true,
            enableQueryLogging: true,
            enableSlowQueryLogging: true,
            slowQueryThreshold: 1000,
            enableEncryption: true,
            enableFieldLevelEncryption: true,
            maxQueryComplexity: 100,
            connectionTimeout: 30000,
            maxConnections: 100,
            enableReadReplicas: false,
            ...config
        };
        this.initializeFieldEncryption();
        this.setupDatabaseMiddleware();
        this.startMetricsCollection();
    }
    async validateQuery(query, params) {
        const errors = [];
        const sanitizedParams = [];
        const sqlInjectionDetected = this.detectSQLInjection(query, params);
        if (sqlInjectionDetected.length > 0) {
            errors.push(...sqlInjectionDetected);
            this.queryMetrics.blockedQueries++;
            await audit_logger_1.auditLogger.logSecurity('sql_injection_attempt', undefined, {}, {
                query: this.sanitizeQueryForLogging(query),
                params: this.sanitizeParamsForLogging(params),
                patterns: sqlInjectionDetected
            });
        }
        for (let i = 0; i < params.length; i++) {
            const param = params[i];
            try {
                if (typeof param === 'string') {
                    const sanitized = input_sanitizer_1.inputSanitizer.sanitizeString(param, {
                        removeSqlKeywords: true,
                        removeHtml: true,
                        maxLength: 10000
                    });
                    if (this.containsSQLKeywords(sanitized)) {
                        errors.push(`Parameter ${i} contains SQL keywords`);
                        continue;
                    }
                    sanitizedParams.push(sanitized);
                }
                else if (typeof param === 'number') {
                    if (!Number.isFinite(param) || Math.abs(param) > Number.MAX_SAFE_INTEGER) {
                        errors.push(`Parameter ${i} is not a valid number`);
                        continue;
                    }
                    sanitizedParams.push(param);
                }
                else if (typeof param === 'boolean') {
                    sanitizedParams.push(param);
                }
                else if (param instanceof Date) {
                    sanitizedParams.push(param);
                }
                else if (param === null || param === undefined) {
                    sanitizedParams.push(param);
                }
                else {
                    const jsonString = JSON.stringify(param);
                    const sanitized = input_sanitizer_1.inputSanitizer.sanitizeJson(jsonString);
                    sanitizedParams.push(sanitized);
                }
            }
            catch (error) {
                errors.push(`Parameter ${i} validation failed: ${error.message}`);
            }
        }
        const complexity = this.calculateQueryComplexity(query);
        if (complexity > this.config.maxQueryComplexity) {
            errors.push(`Query complexity (${complexity}) exceeds maximum (${this.config.maxQueryComplexity})`);
        }
        return {
            isValid: errors.length === 0,
            sanitizedParams,
            errors
        };
    }
    async encryptField(table, field, value) {
        if (!this.config.enableFieldLevelEncryption) {
            return value;
        }
        const fieldKey = `${table}.${field}`;
        const fieldConfig = this.encryptedFields.get(fieldKey);
        if (fieldConfig) {
            return await kms_1.kmsService.encryptDatabaseField(value, table, field);
        }
        return value;
    }
    async decryptField(table, field, encryptedValue) {
        if (!this.config.enableFieldLevelEncryption) {
            return encryptedValue;
        }
        const fieldKey = `${table}.${field}`;
        const fieldConfig = this.encryptedFields.get(fieldKey);
        if (fieldConfig && encryptedValue.includes(':')) {
            return await kms_1.kmsService.decryptDatabaseField(encryptedValue);
        }
        return encryptedValue;
    }
    createSecureConnection() {
        return new client_1.PrismaClient({
            datasources: {
                db: {
                    url: this.buildSecureConnectionString()
                }
            },
            log: this.config.enableQueryLogging ? [
                {
                    emit: 'event',
                    level: 'query'
                },
                {
                    emit: 'event',
                    level: 'info'
                },
                {
                    emit: 'event',
                    level: 'warn'
                },
                {
                    emit: 'event',
                    level: 'error'
                }
            ] : undefined
        });
    }
    async healthCheck() {
        const securityAlerts = [];
        try {
            const start = Date.now();
            await this.prisma.$queryRaw `SELECT 1 as health_check`;
            const responseTime = Date.now() - start;
            if (this.queryMetrics.blockedQueries > 10) {
                securityAlerts.push('High number of blocked queries detected');
            }
            if (this.queryMetrics.slowQueries > this.queryMetrics.queryCount * 0.1) {
                securityAlerts.push('High percentage of slow queries detected');
            }
            const status = securityAlerts.length > 0 ? 'degraded' :
                responseTime > 1000 ? 'degraded' : 'healthy';
            return {
                status,
                metrics: { ...this.queryMetrics },
                securityAlerts
            };
        }
        catch (error) {
            return {
                status: 'unhealthy',
                metrics: { ...this.queryMetrics },
                securityAlerts: ['Database connection failed']
            };
        }
    }
    async secureBulkInsert(table, data, userId) {
        const validationErrors = [];
        const sanitizedData = [];
        for (let i = 0; i < data.length; i++) {
            const record = data[i];
            const sanitized = {};
            for (const [field, value] of Object.entries(record)) {
                try {
                    if (typeof value === 'string') {
                        sanitized[field] = input_sanitizer_1.inputSanitizer.sanitizeString(value, {
                            removeSqlKeywords: true,
                            removeHtml: true
                        });
                        if (this.encryptedFields.has(`${table}.${field}`)) {
                            sanitized[field] = await this.encryptField(table, field, sanitized[field]);
                        }
                    }
                    else {
                        sanitized[field] = value;
                    }
                }
                catch (error) {
                    validationErrors.push(`Record ${i}, field ${field}: ${error.message}`);
                }
            }
            if (validationErrors.length === 0) {
                sanitizedData.push(sanitized);
            }
        }
        if (validationErrors.length > 0) {
            throw new index_1.SecurityError(`Bulk insert validation failed: ${validationErrors.join(', ')}`, 'VALIDATION_ERROR');
        }
        await audit_logger_1.auditLogger.logDataAccess('create', table, `bulk_${sanitizedData.length}`, userId || 'system', {});
        return sanitizedData.length;
    }
    async executeSecureQuery(query, params = [], userId, operation = 'read') {
        const startTime = Date.now();
        try {
            const validation = await this.validateQuery(query, params);
            if (!validation.isValid) {
                throw new index_1.SecurityError(`Query validation failed: ${validation.errors.join(', ')}`, 'QUERY_VALIDATION_ERROR');
            }
            if (this.config.enableQueryLogging) {
                await audit_logger_1.auditLogger.logEvent({
                    action: `db_${operation}`,
                    resource: 'database',
                    userId,
                    details: {
                        query: this.sanitizeQueryForLogging(query),
                        paramCount: params.length
                    }
                });
            }
            const result = await this.prisma.$queryRawUnsafe(query, ...validation.sanitizedParams);
            const executionTime = Date.now() - startTime;
            this.updateQueryMetrics(executionTime);
            return result;
        }
        catch (error) {
            await audit_logger_1.auditLogger.logEvent({
                action: 'db_error',
                resource: 'database',
                userId,
                details: {
                    error: error.message,
                    query: this.sanitizeQueryForLogging(query)
                }
            });
            throw error;
        }
    }
    detectSQLInjection(query, params) {
        const detectedPatterns = [];
        const fullQuery = query.toLowerCase() + ' ' + params.join(' ').toLowerCase();
        for (const pattern of this.sqlInjectionPatterns) {
            if (pattern.test(fullQuery)) {
                detectedPatterns.push(`SQL injection pattern detected: ${pattern.source}`);
            }
        }
        for (const func of this.dangerousFunctions) {
            if (fullQuery.includes(func.toLowerCase())) {
                detectedPatterns.push(`Dangerous function detected: ${func}`);
            }
        }
        for (let i = 0; i < params.length; i++) {
            const param = String(params[i]).toLowerCase();
            if (param.includes('--') || param.includes('/*') || param.includes('*/')) {
                detectedPatterns.push(`SQL comment in parameter ${i}`);
            }
            if (param.includes("''") || param.includes('""') || param.includes('\\"') || param.includes("\\'")) {
                detectedPatterns.push(`Quote escaping attempt in parameter ${i}`);
            }
            if (/0x[0-9a-f]+/.test(param)) {
                detectedPatterns.push(`Hex encoding detected in parameter ${i}`);
            }
            if (param.includes('union') && param.includes('select')) {
                detectedPatterns.push(`Union injection attempt in parameter ${i}`);
            }
        }
        return detectedPatterns;
    }
    containsSQLKeywords(input) {
        const sqlKeywords = [
            'select', 'insert', 'update', 'delete', 'drop', 'create', 'alter',
            'union', 'where', 'order', 'group', 'having', 'exec', 'execute',
            'sp_', 'xp_', 'into', 'from', 'values', 'set'
        ];
        const lowerInput = input.toLowerCase();
        return sqlKeywords.some(keyword => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'i');
            return regex.test(lowerInput);
        });
    }
    calculateQueryComplexity(query) {
        let complexity = 0;
        const lowerQuery = query.toLowerCase();
        complexity += 1;
        const joinCount = (lowerQuery.match(/\bjoin\b/g) || []).length;
        complexity += joinCount * 2;
        const subqueryCount = (lowerQuery.match(/\(\s*select\b/g) || []).length;
        complexity += subqueryCount * 3;
        const unionCount = (lowerQuery.match(/\bunion\b/g) || []).length;
        complexity += unionCount * 2;
        const aggregateCount = (lowerQuery.match(/\b(count|sum|avg|min|max|group_concat)\b/g) || []).length;
        complexity += aggregateCount;
        const windowCount = (lowerQuery.match(/\bover\s*\(/g) || []).length;
        complexity += windowCount * 2;
        if (lowerQuery.includes('with recursive')) {
            complexity += 5;
        }
        return complexity;
    }
    initializeFieldEncryption() {
        if (!this.config.enableFieldLevelEncryption)
            return;
        const fieldsToEncrypt = [
            { table: 'users', field: 'email' },
            { table: 'users', field: 'phone_number' },
            { table: 'user_sessions', field: 'ip_address' },
            { table: 'audit_logs', field: 'details' },
            { table: 'documents', field: 'source_info' }
        ];
        for (const fieldConfig of fieldsToEncrypt) {
            const key = `${fieldConfig.table}.${fieldConfig.field}`;
            this.encryptedFields.set(key, {
                table: fieldConfig.table,
                field: fieldConfig.field,
                keyId: 'default',
                algorithm: 'aes-256-gcm'
            });
        }
    }
    setupDatabaseMiddleware() {
        if (!this.config.enableQueryLogging)
            return;
        this.prisma.$on('query', async (e) => {
            const executionTime = parseInt(e.duration);
            this.updateQueryMetrics(executionTime);
            if (this.config.enableSlowQueryLogging && executionTime > this.config.slowQueryThreshold) {
                await audit_logger_1.auditLogger.logEvent({
                    action: 'slow_query',
                    resource: 'database',
                    details: {
                        query: this.sanitizeQueryForLogging(e.query),
                        duration: executionTime,
                        params: e.params
                    }
                });
            }
        });
        this.prisma.$on('error', async (e) => {
            await audit_logger_1.auditLogger.logEvent({
                action: 'db_error',
                resource: 'database',
                details: {
                    message: e.message,
                    target: e.target
                }
            });
        });
    }
    updateQueryMetrics(executionTime) {
        this.queryMetrics.queryCount++;
        if (executionTime > this.config.slowQueryThreshold) {
            this.queryMetrics.slowQueries++;
        }
        this.queryMetrics.averageExecutionTime =
            (this.queryMetrics.averageExecutionTime * (this.queryMetrics.queryCount - 1) + executionTime)
                / this.queryMetrics.queryCount;
    }
    startMetricsCollection() {
        setInterval(() => {
            if (this.queryMetrics.queryCount > 10000) {
                this.queryMetrics.queryCount = Math.floor(this.queryMetrics.queryCount / 2);
                this.queryMetrics.slowQueries = Math.floor(this.queryMetrics.slowQueries / 2);
                this.queryMetrics.blockedQueries = Math.floor(this.queryMetrics.blockedQueries / 2);
            }
        }, 60 * 60 * 1000);
    }
    buildSecureConnectionString() {
        const baseUrl = process.env.DATABASE_URL || '';
        const url = new URL(baseUrl);
        url.searchParams.set('sslmode', 'require');
        url.searchParams.set('connect_timeout', String(this.config.connectionTimeout / 1000));
        url.searchParams.set('application_name', 'fineprintai_secure');
        return url.toString();
    }
    sanitizeQueryForLogging(query) {
        return query
            .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/g, '[EMAIL]')
            .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD]')
            .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
            .replace(/'[^']{8,}'/g, "'[REDACTED]'")
            .substring(0, 500);
    }
    sanitizeParamsForLogging(params) {
        return params.map((param, index) => {
            if (typeof param === 'string' && param.length > 100) {
                return `[LONG_STRING_${param.length}_CHARS]`;
            }
            if (typeof param === 'string' && /@/.test(param)) {
                return '[EMAIL]';
            }
            return param;
        });
    }
}
exports.DatabaseSecurity = DatabaseSecurity;
function createDatabaseSecurity(prisma, config) {
    return new DatabaseSecurity(prisma, config);
}
//# sourceMappingURL=db-security.js.map