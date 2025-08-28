import { Request, Response, NextFunction } from 'express';
export interface AuthenticatedUser {
    userId: string;
    email: string;
    subscriptionTier: string;
    isAdmin?: boolean;
}
declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedUser;
        }
    }
}
export declare const authMiddleware: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const adminMiddleware: (req: Request, res: Response, next: NextFunction) => void;
export declare const requireSubscriptionTier: (requiredTiers: string[]) => (req: Request, res: Response, next: NextFunction) => void;
export declare const optionalAuthMiddleware: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export default authMiddleware;
//# sourceMappingURL=auth.d.ts.map