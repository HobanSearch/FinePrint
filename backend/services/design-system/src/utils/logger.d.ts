interface LogContext {
    [key: string]: any;
}
declare class Logger {
    private serviceName;
    private formatMessage;
    private log;
    fatal(message: string, context?: LogContext): void;
    fatal(context: LogContext, message: string): void;
    error(message: string, context?: LogContext): void;
    error(error: Error, message?: string): void;
    error(context: LogContext, message: string): void;
    warn(message: string, context?: LogContext): void;
    warn(context: LogContext, message: string): void;
    info(message: string, context?: LogContext): void;
    info(context: LogContext, message: string): void;
    debug(message: string, context?: LogContext): void;
    debug(context: LogContext, message: string): void;
    trace(message: string, context?: LogContext): void;
    trace(context: LogContext, message: string): void;
    child(context: LogContext): Logger;
}
export declare const logger: Logger;
export {};
//# sourceMappingURL=logger.d.ts.map