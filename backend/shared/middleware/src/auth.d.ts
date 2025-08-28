import { FastifyRequest, FastifyReply } from 'fastify';
import type { JWTPayload } from '@fineprintai/shared-types';
export declare const authenticateToken: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
export declare const authenticateApiKey: (request: FastifyRequest, reply: FastifyReply) => Promise<never>;
export declare const requireRole: (allowedRoles: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
export declare const requireSubscription: (requiredTiers: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
export declare const optionalAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
export declare const generateTokens: (payload: Omit<JWTPayload, "iat" | "exp" | "type">) => {
    accessToken: any;
    refreshToken: any;
    expiresIn: any;
};
export declare const generateMFATokens: (payload: Omit<JWTPayload, "iat" | "exp" | "type">, mfaVerified?: boolean) => {
    accessToken: any;
    refreshToken: any;
    expiresIn: any;
};
//# sourceMappingURL=auth.d.ts.map