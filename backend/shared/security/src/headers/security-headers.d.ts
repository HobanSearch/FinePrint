import { FastifyRequest, FastifyReply } from 'fastify';
export interface SecurityHeadersOptions {
    contentSecurityPolicy?: CSPConfig;
    strictTransportSecurity?: HSTSConfig;
    xFrameOptions?: 'DENY' | 'SAMEORIGIN' | string;
    xContentTypeOptions?: boolean;
    xXSSProtection?: boolean;
    referrerPolicy?: ReferrerPolicyValue;
    permissionsPolicy?: PermissionsPolicyConfig;
    expectCT?: ExpectCTConfig;
    customHeaders?: {
        [key: string]: string;
    };
}
export interface CSPConfig {
    defaultSrc?: string[];
    scriptSrc?: string[];
    styleSrc?: string[];
    imgSrc?: string[];
    fontSrc?: string[];
    connectSrc?: string[];
    mediaSrc?: string[];
    objectSrc?: string[];
    childSrc?: string[];
    frameSrc?: string[];
    workerSrc?: string[];
    manifestSrc?: string[];
    prefetchSrc?: string[];
    baseUri?: string[];
    formAction?: string[];
    frameAncestors?: string[];
    upgradeInsecureRequests?: boolean;
    blockAllMixedContent?: boolean;
    requireSriFor?: string[];
    reportUri?: string;
    reportTo?: string;
}
export interface HSTSConfig {
    maxAge: number;
    includeSubDomains?: boolean;
    preload?: boolean;
}
export interface PermissionsPolicyConfig {
    camera?: string[];
    microphone?: string[];
    geolocation?: string[];
    payment?: string[];
    usb?: string[];
    accelerometer?: string[];
    gyroscope?: string[];
    magnetometer?: string[];
    fullscreen?: string[];
    pictureInPicture?: string[];
    displayCapture?: string[];
    [key: string]: string[] | undefined;
}
export interface ExpectCTConfig {
    maxAge: number;
    enforce?: boolean;
    reportUri?: string;
}
export type ReferrerPolicyValue = 'no-referrer' | 'no-referrer-when-downgrade' | 'origin' | 'origin-when-cross-origin' | 'same-origin' | 'strict-origin' | 'strict-origin-when-cross-origin' | 'unsafe-url';
export declare class SecurityHeaders {
    private readonly options;
    constructor(options?: SecurityHeadersOptions);
    middleware(): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    private buildCSPHeader;
    private buildHSTSHeader;
    private buildPermissionsPolicyHeader;
    private buildExpectCTHeader;
    private isSensitivePath;
    cspReportHandler(): (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
    validateConfiguration(): {
        isValid: boolean;
        warnings: string[];
        errors: string[];
    };
    generateSecurityTxt(): string;
}
export declare const securityHeaders: SecurityHeaders;
//# sourceMappingURL=security-headers.d.ts.map