import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
export declare const validateRequest: (schema: ZodSchema, source?: "body" | "query" | "params") => (req: Request, res: Response, next: NextFunction) => void;
export declare const validateCommonParams: (req: Request, res: Response, next: NextFunction) => void;
export declare const commonSchemas: {
    uuid: any;
    email: any;
    currency: any;
    amount: any;
    pagination: any;
    dateRange: any;
    subscriptionTier: any;
    paymentMethodType: any;
    invoiceStatus: any;
};
export declare const validateFileUpload: (allowedTypes: string[], maxSize?: number) => (req: Request, res: Response, next: NextFunction) => void;
export declare const validateApiKey: (req: Request, res: Response, next: NextFunction) => void;
export default validateRequest;
//# sourceMappingURL=validation.d.ts.map