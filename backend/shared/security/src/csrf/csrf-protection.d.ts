import { FastifyRequest, FastifyReply } from 'fastify';
export interface CSRFOptions {
    cookieName?: string;
    headerName?: string;
    secret?: string;
    expiration?: number;
    sameSite?: 'strict' | 'lax' | 'none';
    secure?: boolean;
    httpOnly?: boolean;
    exemptMethods?: string[];
    exemptPaths?: string[];
}
export interface CSRFToken {
    token: string;
    timestamp: number;
    signature: string;
}
export declare class CSRFProtection {
    private readonly options;
    private readonly secret;
    constructor(options?: CSRFOptions);
    generateToken(sessionId?: string): string;
    verifyToken(token: string, sessionId?: string): boolean;
    setTokenMiddleware(): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    verifyTokenMiddleware(): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    getTokenHandler(): (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
    private extractSessionId;
    private verifyOrigin;
    generateMetaTag(token: string): string;
    generateClientScript(): string;
    validateConfiguration(): {
        isValid: boolean;
        errors: string[];
    };
}
export declare const csrfProtection: CSRFProtection;
//# sourceMappingURL=csrf-protection.d.ts.map