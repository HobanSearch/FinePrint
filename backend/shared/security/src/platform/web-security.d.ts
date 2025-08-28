export interface WebSecurityConfig {
    csp: {
        enabled: boolean;
        strict: boolean;
        reportUri?: string;
        directives: Record<string, string[]>;
    };
    cookies: {
        secure: boolean;
        httpOnly: boolean;
        sameSite: 'strict' | 'lax' | 'none';
        maxAge: number;
    };
    https: {
        enforce: boolean;
        hsts: {
            enabled: boolean;
            maxAge: number;
            includeSubDomains: boolean;
            preload: boolean;
        };
    };
    headers: {
        xContentTypeOptions: boolean;
        xFrameOptions: 'DENY' | 'SAMEORIGIN' | string;
        xXssProtection: boolean;
        referrerPolicy: string;
        permissionsPolicy: Record<string, string[]>;
    };
    cors: {
        enabled: boolean;
        origins: string[];
        credentials: boolean;
    };
}
export interface CSPDirectives {
    'default-src': string[];
    'script-src': string[];
    'style-src': string[];
    'img-src': string[];
    'connect-src': string[];
    'font-src': string[];
    'object-src': string[];
    'media-src': string[];
    'frame-src': string[];
    'worker-src': string[];
    'child-src': string[];
    'form-action': string[];
    'frame-ancestors': string[];
    'base-uri': string[];
    'manifest-src': string[];
    'report-uri': string[];
}
export interface SecureCookieOptions {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    maxAge?: number;
    expires?: Date;
}
export interface SecurityHeaders {
    'Content-Security-Policy': string;
    'Strict-Transport-Security': string;
    'X-Content-Type-Options': string;
    'X-Frame-Options': string;
    'X-XSS-Protection': string;
    'Referrer-Policy': string;
    'Permissions-Policy': string;
    'Cross-Origin-Embedder-Policy': string;
    'Cross-Origin-Opener-Policy': string;
    'Cross-Origin-Resource-Policy': string;
}
export declare class WebSecurityService {
    private config;
    private nonceCache;
    constructor(config: WebSecurityConfig);
    generateSecurityHeaders(request: {
        path: string;
        userAgent: string;
        referer?: string;
    }): SecurityHeaders;
    private generateCSPHeader;
    private generateHSTSHeader;
    private generatePermissionsPolicyHeader;
    createSecureCookie(options: SecureCookieOptions): string;
    validateNonce(nonce: string): boolean;
    generateNonce(): string;
    private cleanupNonces;
    validateCORSRequest(origin: string, method: string): {
        allowed: boolean;
        headers: Record<string, string>;
    };
    generateCSRFToken(sessionId: string): string;
    validateCSRFToken(token: string, sessionId: string): boolean;
    sanitizeHTML(html: string): string;
    validateFileUpload(file: {
        name: string;
        size: number;
        type: string;
        buffer: Buffer;
    }): {
        valid: boolean;
        errors: string[];
    };
    generateSRIHash(content: string): string;
    createSecureSessionConfig(): {
        name: string;
        secret: string;
        cookie: {
            secure: boolean;
            httpOnly: boolean;
            maxAge: number;
            sameSite: 'strict' | 'lax' | 'none';
        };
        resave: boolean;
        saveUninitialized: boolean;
    };
}
export declare const createWebSecurity: (config: WebSecurityConfig) => WebSecurityService;
export declare const defaultWebSecurityConfig: WebSecurityConfig;
//# sourceMappingURL=web-security.d.ts.map