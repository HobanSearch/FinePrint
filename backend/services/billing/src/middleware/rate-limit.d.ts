export declare const rateLimitMiddleware: any;
export declare const strictRateLimitMiddleware: any;
export declare const webhookRateLimitMiddleware: any;
export declare const apiRateLimitMiddleware: any;
export declare const subscriptionChangeRateLimit: any;
export declare const paymentMethodRateLimit: any;
export declare const invoiceRateLimit: any;
export declare const usageTrackingRateLimit: any;
export declare const createCustomRateLimit: (options: {
    prefix: string;
    windowMs: number;
    max: number | ((req: any) => number);
    message?: string | ((req: any) => any);
    keyGenerator?: (req: any) => string;
    skip?: (req: any) => boolean;
}) => any;
export default rateLimitMiddleware;
//# sourceMappingURL=rate-limit.d.ts.map