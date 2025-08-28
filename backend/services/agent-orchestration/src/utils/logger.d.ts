import pino from 'pino';
export declare class Logger {
    private static instance;
    static getInstance(): pino.Logger;
    static child(bindings: pino.Bindings): pino.Logger;
}
//# sourceMappingURL=logger.d.ts.map