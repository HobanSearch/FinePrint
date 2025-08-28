// Database Security and SQL Injection Prevention
// Comprehensive database security hardening with query validation and monitoring

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { inputSanitizer, ValidationRule } from '../validation/input-sanitizer';
import { kmsService } from '../encryption/kms';
import { auditLogger } from '../audit/audit-logger';
import { SecurityError } from '../index';

export interface DatabaseSecurityConfig {
  enableQueryValidation: boolean;
  enableQueryLogging: boolean;
  enableSlowQueryLogging: boolean;
  slowQueryThreshold: number; // milliseconds
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

export class DatabaseSecurity {
  private prisma: PrismaClient;
  private config: DatabaseSecurityConfig;
  private encryptedFields: Map<string, EncryptedField> = new Map();
  private queryMetrics: QueryMetrics = {
    queryCount: 0,
    slowQueries: 0,
    blockedQueries: 0,
    averageExecutionTime: 0,
    peakConnections: 0
  };

  // SQL injection patterns to detect
  private readonly sqlInjectionPatterns = [
    // Union-based injection
    /\bunion\b.*\bselect\b/i,
    /\bunion\b.*\ball\b.*\bselect\b/i,
    
    // Boolean-based blind injection
    /\bor\b.*['"].*['"]\s*=\s*['"].*['"]/i,
    /\band\b.*['"].*['"]\s*=\s*['"].*['"]/i,
    /\bor\b.*\d+\s*=\s*\d+/i,
    /\band\b.*\d+\s*=\s*\d+/i,
    
    // Time-based blind injection
    /\bwaitfor\b.*\bdelay\b/i,
    /\bsleep\b\s*\(/i,
    /\bbenchmark\b\s*\(/i,
    /\bpg_sleep\b\s*\(/i,
    
    // Comment-based injection
    /\/\*.*\*\//,
    /--.*$/m,
    /#.*$/m,
    
    // SQL commands
    /\b(drop|delete|insert|update|create|alter|exec|execute|sp_|xp_)\b/i,
    
    // Function calls that could be dangerous
    /\b(load_file|into\s+outfile|into\s+dumpfile)\b/i,
    
    // Hex encoding attempts
    /0x[0-9a-f]+/i,
    
    // SQL concatenation
    /\|\||concat\s*\(/i,
    
    // Subquery injection
    /\(\s*select\b/i,
    
    // Information schema queries
    /information_schema/i,
    /pg_catalog/i,
    /sys\./i,
    
    // Database-specific functions
    /\b(version|user|database|schema)\s*\(\s*\)/i
  ];

  // Dangerous functions that should never appear in user input
  private readonly dangerousFunctions = [
    'exec', 'execute', 'eval', 'system', 'shell_exec',
    'passthru', 'file_get_contents', 'file_put_contents',
    'fopen', 'fwrite', 'include', 'require'
  ];

  constructor(prisma: PrismaClient, config: Partial<DatabaseSecurityConfig> = {}) {
    this.prisma = prisma;
    this.config = {
      enableQueryValidation: true,
      enableQueryLogging: true,
      enableSlowQueryLogging: true,
      slowQueryThreshold: 1000, // 1 second
      enableEncryption: true,
      enableFieldLevelEncryption: true,
      maxQueryComplexity: 100,
      connectionTimeout: 30000, // 30 seconds
      maxConnections: 100,
      enableReadReplicas: false,
      ...config
    };

    this.initializeFieldEncryption();
    this.setupDatabaseMiddleware();
    this.startMetricsCollection();
  }

  /**
   * Validate and sanitize database query parameters
   */
  async validateQuery(query: string, params: any[]): Promise<{ isValid: boolean; sanitizedParams: any[]; errors: string[] }> {
    const errors: string[] = [];
    const sanitizedParams: any[] = [];

    // Check for SQL injection patterns
    const sqlInjectionDetected = this.detectSQLInjection(query, params);
    if (sqlInjectionDetected.length > 0) {
      errors.push(...sqlInjectionDetected);
      this.queryMetrics.blockedQueries++;
      
      // Log security event
      await auditLogger.logSecurity('sql_injection_attempt', undefined, {} as any, {
        query: this.sanitizeQueryForLogging(query),
        params: this.sanitizeParamsForLogging(params),
        patterns: sqlInjectionDetected
      });
    }

    // Validate and sanitize parameters
    for (let i = 0; i < params.length; i++) {
      const param = params[i];
      
      try {
        // Type-specific validation
        if (typeof param === 'string') {
          const sanitized = inputSanitizer.sanitizeString(param, {
            removeSqlKeywords: true,
            removeHtml: true,
            maxLength: 10000
          });
          
          // Additional SQL-specific checks
          if (this.containsSQLKeywords(sanitized)) {
            errors.push(`Parameter ${i} contains SQL keywords`);
            continue;
          }
          
          sanitizedParams.push(sanitized);
        } else if (typeof param === 'number') {
          // Validate numeric parameters
          if (!Number.isFinite(param) || Math.abs(param) > Number.MAX_SAFE_INTEGER) {
            errors.push(`Parameter ${i} is not a valid number`);
            continue;
          }
          sanitizedParams.push(param);
        } else if (typeof param === 'boolean') {
          sanitizedParams.push(param);
        } else if (param instanceof Date) {
          sanitizedParams.push(param);
        } else if (param === null || param === undefined) {
          sanitizedParams.push(param);
        } else {
          // For objects and arrays, stringify and validate
          const jsonString = JSON.stringify(param);
          const sanitized = inputSanitizer.sanitizeJson(jsonString);
          sanitizedParams.push(sanitized);
        }
      } catch (error) {
        errors.push(`Parameter ${i} validation failed: ${error.message}`);
      }
    }

    // Check query complexity
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

  /**
   * Encrypt sensitive database field
   */
  async encryptField(table: string, field: string, value: string): Promise<string> {
    if (!this.config.enableFieldLevelEncryption) {
      return value;
    }

    const fieldKey = `${table}.${field}`;
    const fieldConfig = this.encryptedFields.get(fieldKey);
    
    if (fieldConfig) {
      return await kmsService.encryptDatabaseField(value, table, field);
    }
    
    return value;
  }

  /**
   * Decrypt sensitive database field
   */
  async decryptField(table: string, field: string, encryptedValue: string): Promise<string> {
    if (!this.config.enableFieldLevelEncryption) {
      return encryptedValue;
    }

    const fieldKey = `${table}.${field}`;
    const fieldConfig = this.encryptedFields.get(fieldKey);
    
    if (fieldConfig && encryptedValue.includes(':')) {
      return await kmsService.decryptDatabaseField(encryptedValue);
    }
    
    return encryptedValue;
  }

  /**
   * Create secure database connection with enhanced security
   */
  createSecureConnection(): PrismaClient {
    return new PrismaClient({
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

  /**
   * Database health check with security monitoring
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: QueryMetrics;
    securityAlerts: string[];
  }> {
    const securityAlerts: string[] = [];
    
    try {
      // Test basic connectivity
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1 as health_check`;
      const responseTime = Date.now() - start;

      // Check for security issues
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
    } catch (error) {
      return {
        status: 'unhealthy',
        metrics: { ...this.queryMetrics },
        securityAlerts: ['Database connection failed']
      };
    }
  }

  /**
   * Secure bulk operations with validation
   */
  async secureBulkInsert(table: string, data: any[], userId?: string): Promise<number> {
    // Validate all records first
    const validationErrors: string[] = [];
    const sanitizedData: any[] = [];

    for (let i = 0; i < data.length; i++) {
      const record = data[i];
      const sanitized: any = {};

      for (const [field, value] of Object.entries(record)) {
        try {
          if (typeof value === 'string') {
            sanitized[field] = inputSanitizer.sanitizeString(value, {
              removeSqlKeywords: true,
              removeHtml: true
            });

            // Encrypt if configured
            if (this.encryptedFields.has(`${table}.${field}`)) {
              sanitized[field] = await this.encryptField(table, field, sanitized[field]);
            }
          } else {
            sanitized[field] = value;
          }
        } catch (error) {
          validationErrors.push(`Record ${i}, field ${field}: ${error.message}`);
        }
      }

      if (validationErrors.length === 0) {
        sanitizedData.push(sanitized);
      }
    }

    if (validationErrors.length > 0) {
      throw new SecurityError(`Bulk insert validation failed: ${validationErrors.join(', ')}`, 'VALIDATION_ERROR');
    }

    // Log bulk operation
    await auditLogger.logDataAccess('create', table, `bulk_${sanitizedData.length}`, userId || 'system', {} as any);

    // Perform bulk insert (implementation would depend on specific table)
    // For now, return count of processed records
    return sanitizedData.length;
  }

  /**
   * Secure query execution with monitoring
   */
  async executeSecureQuery<T>(
    query: string, 
    params: any[] = [],
    userId?: string,
    operation: 'read' | 'write' = 'read'
  ): Promise<T> {
    const startTime = Date.now();

    try {
      // Validate query and parameters
      const validation = await this.validateQuery(query, params);
      if (!validation.isValid) {
        throw new SecurityError(`Query validation failed: ${validation.errors.join(', ')}`, 'QUERY_VALIDATION_ERROR');
      }

      // Log query execution
      if (this.config.enableQueryLogging) {
        await auditLogger.logEvent({
          action: `db_${operation}`,
          resource: 'database',
          userId,
          details: {
            query: this.sanitizeQueryForLogging(query),
            paramCount: params.length
          }
        });
      }

      // Execute query
      const result = await this.prisma.$queryRawUnsafe<T>(query, ...validation.sanitizedParams);

      // Update metrics
      const executionTime = Date.now() - startTime;
      this.updateQueryMetrics(executionTime);

      return result;
    } catch (error) {
      // Log error
      await auditLogger.logEvent({
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

  /**
   * Detect SQL injection patterns
   */
  private detectSQLInjection(query: string, params: any[]): string[] {
    const detectedPatterns: string[] = [];
    const fullQuery = query.toLowerCase() + ' ' + params.join(' ').toLowerCase();

    // Check SQL injection patterns
    for (const pattern of this.sqlInjectionPatterns) {
      if (pattern.test(fullQuery)) {
        detectedPatterns.push(`SQL injection pattern detected: ${pattern.source}`);
      }
    }

    // Check for dangerous functions
    for (const func of this.dangerousFunctions) {
      if (fullQuery.includes(func.toLowerCase())) {
        detectedPatterns.push(`Dangerous function detected: ${func}`);
      }
    }

    // Check for suspicious parameter values
    for (let i = 0; i < params.length; i++) {
      const param = String(params[i]).toLowerCase();
      
      // Check for SQL comments
      if (param.includes('--') || param.includes('/*') || param.includes('*/')) {
        detectedPatterns.push(`SQL comment in parameter ${i}`);
      }

      // Check for quote escaping attempts
      if (param.includes("''") || param.includes('""') || param.includes('\\"') || param.includes("\\'")) {
        detectedPatterns.push(`Quote escaping attempt in parameter ${i}`);
      }

      // Check for hex encoding
      if (/0x[0-9a-f]+/.test(param)) {
        detectedPatterns.push(`Hex encoding detected in parameter ${i}`);
      }

      // Check for union attempts
      if (param.includes('union') && param.includes('select')) {
        detectedPatterns.push(`Union injection attempt in parameter ${i}`);
      }
    }

    return detectedPatterns;
  }

  /**
   * Check if string contains SQL keywords
   */
  private containsSQLKeywords(input: string): boolean {
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

  /**
   * Calculate query complexity score
   */
  private calculateQueryComplexity(query: string): number {
    let complexity = 0;
    const lowerQuery = query.toLowerCase();

    // Base complexity
    complexity += 1;

    // Joins increase complexity
    const joinCount = (lowerQuery.match(/\bjoin\b/g) || []).length;
    complexity += joinCount * 2;

    // Subqueries increase complexity
    const subqueryCount = (lowerQuery.match(/\(\s*select\b/g) || []).length;
    complexity += subqueryCount * 3;

    // Unions increase complexity
    const unionCount = (lowerQuery.match(/\bunion\b/g) || []).length;
    complexity += unionCount * 2;

    // Aggregate functions
    const aggregateCount = (lowerQuery.match(/\b(count|sum|avg|min|max|group_concat)\b/g) || []).length;
    complexity += aggregateCount;

    // Window functions
    const windowCount = (lowerQuery.match(/\bover\s*\(/g) || []).length;
    complexity += windowCount * 2;

    // Recursive CTEs
    if (lowerQuery.includes('with recursive')) {
      complexity += 5;
    }

    return complexity;
  }

  /**
   * Initialize field-level encryption configuration
   */
  private initializeFieldEncryption(): void {
    if (!this.config.enableFieldLevelEncryption) return;

    // Define fields that should be encrypted
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
        keyId: 'default', // Would be generated/configured per field
        algorithm: 'aes-256-gcm'
      });
    }
  }

  /**
   * Setup database middleware for security monitoring
   */
  private setupDatabaseMiddleware(): void {
    if (!this.config.enableQueryLogging) return;

    // Query event listener
    this.prisma.$on('query', async (e) => {
      const executionTime = parseInt(e.duration);
      this.updateQueryMetrics(executionTime);

      // Log slow queries
      if (this.config.enableSlowQueryLogging && executionTime > this.config.slowQueryThreshold) {
        await auditLogger.logEvent({
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

    // Error event listener
    this.prisma.$on('error', async (e) => {
      await auditLogger.logEvent({
        action: 'db_error',
        resource: 'database',
        details: {
          message: e.message,
          target: e.target
        }
      });
    });
  }

  /**
   * Update query metrics
   */
  private updateQueryMetrics(executionTime: number): void {
    this.queryMetrics.queryCount++;
    
    if (executionTime > this.config.slowQueryThreshold) {
      this.queryMetrics.slowQueries++;
    }

    // Update rolling average
    this.queryMetrics.averageExecutionTime = 
      (this.queryMetrics.averageExecutionTime * (this.queryMetrics.queryCount - 1) + executionTime) 
      / this.queryMetrics.queryCount;
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    setInterval(() => {
      // Reset some metrics periodically
      if (this.queryMetrics.queryCount > 10000) {
        this.queryMetrics.queryCount = Math.floor(this.queryMetrics.queryCount / 2);
        this.queryMetrics.slowQueries = Math.floor(this.queryMetrics.slowQueries / 2);
        this.queryMetrics.blockedQueries = Math.floor(this.queryMetrics.blockedQueries / 2);
      }
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Build secure connection string
   */
  private buildSecureConnectionString(): string {
    const baseUrl = process.env.DATABASE_URL || '';
    const url = new URL(baseUrl);
    
    // Add security parameters
    url.searchParams.set('sslmode', 'require');
    url.searchParams.set('connect_timeout', String(this.config.connectionTimeout / 1000));
    url.searchParams.set('application_name', 'fineprintai_secure');
    
    return url.toString();
  }

  /**
   * Sanitize query for logging (remove sensitive data)
   */
  private sanitizeQueryForLogging(query: string): string {
    // Remove potential sensitive data from queries
    return query
      .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/g, '[EMAIL]')
      .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD]')
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
      .replace(/'[^']{8,}'/g, "'[REDACTED]'")
      .substring(0, 500); // Limit length
  }

  /**
   * Sanitize parameters for logging
   */
  private sanitizeParamsForLogging(params: any[]): any[] {
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

// Export factory function
export function createDatabaseSecurity(prisma: PrismaClient, config?: Partial<DatabaseSecurityConfig>): DatabaseSecurity {
  return new DatabaseSecurity(prisma, config);
}