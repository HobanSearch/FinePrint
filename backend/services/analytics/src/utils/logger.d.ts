import { Logger } from 'pino';
export declare const logger: Logger;
export declare const analyticsLogger: {
    event: (eventName: string, properties: any, userId?: string) => void;
    performance: (metric: string, value: number, tags?: Record<string, string>) => void;
    privacy: (action: string, details: any) => void;
    dataProcessing: (operation: string, recordCount: number, duration: number) => void;
    apiUsage: (endpoint: string, method: string, statusCode: number, responseTime: number) => void;
    error: (error: Error, context?: any) => void;
    health: (service: string, status: "healthy" | "unhealthy" | "degraded", details?: any) => void;
};
export default logger;
//# sourceMappingURL=logger.d.ts.map