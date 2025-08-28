import { FastifyRequest, FastifyReply } from 'fastify';
export interface XSSProtectionConfig {
    enabled: boolean;
    strictMode: boolean;
    blockMode: boolean;
    allowedDomains: string[];
    trustedTypes: boolean;
    cspReportUri: string;
    cspReportOnly: boolean;
    nonce: {
        enabled: boolean;
        length: number;
    };
    sanitization: {
        enabled: boolean;
        allowedTags: string[];
        allowedAttributes: {
            [tag: string]: string[];
        };
        allowedProtocols: string[];
    };
}
export interface CSPDirectives {
    'default-src'?: string[];
    'script-src'?: string[];
    'style-src'?: string[];
    'img-src'?: string[];
    'font-src'?: string[];
    'connect-src'?: string[];
    'media-src'?: string[];
    'object-src'?: string[];
    'child-src'?: string[];
    'frame-src'?: string[];
    'worker-src'?: string[];
    'manifest-src'?: string[];
    'prefetch-src'?: string[];
    'base-uri'?: string[];
    'form-action'?: string[];
    'frame-ancestors'?: string[];
    'navigate-to'?: string[];
    'upgrade-insecure-requests'?: boolean;
    'block-all-mixed-content'?: boolean;
    'require-sri-for'?: string[];
    'report-uri'?: string;
    'report-to'?: string;
}
export interface XSSDetectionResult {
    hasXSS: boolean;
    threats: XSSThreat[];
    sanitizedContent: string;
    riskScore: number;
    blockedPayloads: string[];
}
export interface XSSThreat {
    type: 'script_injection' | 'event_handler' | 'data_uri' | 'javascript_uri' | 'svg_script' | 'meta_refresh' | 'form_injection' | 'iframe_injection' | 'object_injection';
    payload: string;
    location: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
}
export declare class XSSProtectionEngine {
    private config;
    private nonceStore;
    private readonly xssPatterns;
    private readonly contextSanitizers;
    constructor(config?: Partial<XSSProtectionConfig>);
    middleware(): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    private setCSPHeaders;
    private buildCSPDirectives;
    private buildCSPHeader;
    private generateNonce;
    private scanRequest;
    private scanObjectForXSS;
    detectXSS(content: string, location: string): XSSDetectionResult;
    private calculateHeuristicRisk;
    sanitizeContent(content: string, context?: keyof typeof this.contextSanitizers): string;
    private setXSSHeaders;
    createCSPReportHandler(): (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
    createSanitizationMiddleware(context?: keyof typeof this.contextSanitizers): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    private sanitizeObject;
    private configureDOMPurify;
    private extractSessionId;
    private isAdminPath;
    private isAPIPath;
    private startNonceCleanupJob;
    generateNonceScript(nonce: string): string;
    generateNonceStyle(nonce: string): string;
    getStatistics(): {
        activeNonces: number;
        config: {
            enabled: boolean;
            strictMode: boolean;
            blockMode: boolean;
            nonceEnabled: boolean;
            trustedTypes: boolean;
        };
    };
}
export declare function createXSSProtection(config?: Partial<XSSProtectionConfig>): XSSProtectionEngine;
//# sourceMappingURL=xss-protection.d.ts.map