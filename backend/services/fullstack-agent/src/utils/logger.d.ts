import pino from 'pino';
export declare class Logger {
    private static instance;
    private logger;
    private constructor();
    static getInstance(): Logger;
    info(message: string, meta?: any): void;
    error(message: string, meta?: any): void;
    warn(message: string, meta?: any): void;
    debug(message: string, meta?: any): void;
    trace(message: string, meta?: any): void;
    fatal(message: string, meta?: any): void;
    child(bindings: pino.Bindings): pino.Logger;
}
//# sourceMappingURL=logger.d.ts.map