export interface LogEntry {
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    timestamp: string;
    service: string;
    metadata?: Record<string, any>;
}
declare class Logger {
    private serviceName;
    private formatMessage;
    private shouldLog;
    private log;
    debug(message: string, metadata?: any): void;
    info(message: string, metadata?: any): void;
    warn(message: string, metadata?: any): void;
    error(message: string, error?: Error | any, metadata?: any): void;
    startTimer(operationId: string): void;
    endTimer(operationId: string, metadata?: any): void;
    logRequest(method: string, url: string, statusCode?: number, duration?: number): void;
    logDatabaseOperation(operation: string, table: string, duration?: number, recordCount?: number): void;
    logCrawlOperation(website: string, status: 'success' | 'failed', details?: any): void;
    logProcessingOperation(documentId: string, status: 'started' | 'completed' | 'failed', details?: any): void;
    logComplianceAlert(regulation: string, severity: string, websiteName: string, details?: any): void;
}
export declare const logger: Logger;
export {};
//# sourceMappingURL=logger.d.ts.map