"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.securityHeaders = exports.SecurityHeaders = void 0;
class SecurityHeaders {
    options;
    constructor(options = {}) {
        this.options = {
            contentSecurityPolicy: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                connectSrc: ["'self'", 'https:', 'wss:', 'ws:'],
                mediaSrc: ["'self'"],
                objectSrc: ["'none'"],
                childSrc: ["'self'"],
                frameSrc: ["'none'"],
                workerSrc: ["'self'"],
                manifestSrc: ["'self'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                frameAncestors: ["'none'"],
                upgradeInsecureRequests: true,
                blockAllMixedContent: true,
                ...options.contentSecurityPolicy
            },
            strictTransportSecurity: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true,
                ...options.strictTransportSecurity
            },
            xFrameOptions: options.xFrameOptions ?? 'DENY',
            xContentTypeOptions: options.xContentTypeOptions ?? true,
            xXSSProtection: options.xXSSProtection ?? true,
            referrerPolicy: options.referrerPolicy ?? 'strict-origin-when-cross-origin',
            permissionsPolicy: {
                camera: [],
                microphone: [],
                geolocation: [],
                payment: [],
                usb: [],
                accelerometer: [],
                gyroscope: [],
                magnetometer: [],
                fullscreen: ["'self'"],
                pictureInPicture: [],
                displayCapture: [],
                ...options.permissionsPolicy
            },
            expectCT: options.expectCT || {
                maxAge: 86400,
                enforce: true
            },
            customHeaders: options.customHeaders || {}
        };
    }
    middleware() {
        return async (request, reply) => {
            if (this.options.contentSecurityPolicy) {
                const cspHeader = this.buildCSPHeader(this.options.contentSecurityPolicy);
                reply.header('Content-Security-Policy', cspHeader);
                if (process.env.NODE_ENV === 'development') {
                    reply.header('Content-Security-Policy-Report-Only', cspHeader);
                }
            }
            if (this.options.strictTransportSecurity && request.protocol === 'https') {
                const hstsHeader = this.buildHSTSHeader(this.options.strictTransportSecurity);
                reply.header('Strict-Transport-Security', hstsHeader);
            }
            if (this.options.xFrameOptions) {
                reply.header('X-Frame-Options', this.options.xFrameOptions);
            }
            if (this.options.xContentTypeOptions) {
                reply.header('X-Content-Type-Options', 'nosniff');
            }
            if (this.options.xXSSProtection) {
                reply.header('X-XSS-Protection', '1; mode=block');
            }
            if (this.options.referrerPolicy) {
                reply.header('Referrer-Policy', this.options.referrerPolicy);
            }
            if (this.options.permissionsPolicy) {
                const permissionsPolicyHeader = this.buildPermissionsPolicyHeader(this.options.permissionsPolicy);
                if (permissionsPolicyHeader) {
                    reply.header('Permissions-Policy', permissionsPolicyHeader);
                }
            }
            if (this.options.expectCT && request.protocol === 'https') {
                const expectCTHeader = this.buildExpectCTHeader(this.options.expectCT);
                reply.header('Expect-CT', expectCTHeader);
            }
            for (const [name, value] of Object.entries(this.options.customHeaders)) {
                reply.header(name, value);
            }
            reply.header('X-DNS-Prefetch-Control', 'off');
            reply.header('X-Permitted-Cross-Domain-Policies', 'none');
            reply.header('Cross-Origin-Embedder-Policy', 'require-corp');
            reply.header('Cross-Origin-Opener-Policy', 'same-origin');
            reply.header('Cross-Origin-Resource-Policy', 'same-origin');
            if (this.isSensitivePath(request.url)) {
                reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                reply.header('Pragma', 'no-cache');
                reply.header('Expires', '0');
                reply.header('Surrogate-Control', 'no-store');
            }
            reply.header('Server', 'Fine Print AI');
            reply.removeHeader('X-Powered-By');
        };
    }
    buildCSPHeader(csp) {
        const directives = [];
        const sourceListDirectives = [
            'default-src', 'script-src', 'style-src', 'img-src', 'font-src',
            'connect-src', 'media-src', 'object-src', 'child-src', 'frame-src',
            'worker-src', 'manifest-src', 'prefetch-src', 'base-uri', 'form-action',
            'frame-ancestors'
        ];
        for (const directive of sourceListDirectives) {
            const camelCase = directive.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
            const sources = csp[camelCase];
            if (sources && sources.length > 0) {
                directives.push(`${directive} ${sources.join(' ')}`);
            }
        }
        if (csp.upgradeInsecureRequests) {
            directives.push('upgrade-insecure-requests');
        }
        if (csp.blockAllMixedContent) {
            directives.push('block-all-mixed-content');
        }
        if (csp.requireSriFor && csp.requireSriFor.length > 0) {
            directives.push(`require-sri-for ${csp.requireSriFor.join(' ')}`);
        }
        if (csp.reportUri) {
            directives.push(`report-uri ${csp.reportUri}`);
        }
        if (csp.reportTo) {
            directives.push(`report-to ${csp.reportTo}`);
        }
        return directives.join('; ');
    }
    buildHSTSHeader(hsts) {
        let header = `max-age=${hsts.maxAge}`;
        if (hsts.includeSubDomains) {
            header += '; includeSubDomains';
        }
        if (hsts.preload) {
            header += '; preload';
        }
        return header;
    }
    buildPermissionsPolicyHeader(policy) {
        const directives = [];
        for (const [feature, allowlist] of Object.entries(policy)) {
            if (allowlist && allowlist.length >= 0) {
                if (allowlist.length === 0) {
                    directives.push(`${feature}=()`);
                }
                else {
                    const origins = allowlist.map(origin => origin === "'self'" ? 'self' : `"${origin}"`).join(' ');
                    directives.push(`${feature}=(${origins})`);
                }
            }
        }
        return directives.join(', ');
    }
    buildExpectCTHeader(expectCT) {
        let header = `max-age=${expectCT.maxAge}`;
        if (expectCT.enforce) {
            header += ', enforce';
        }
        if (expectCT.reportUri) {
            header += `, report-uri="${expectCT.reportUri}"`;
        }
        return header;
    }
    isSensitivePath(path) {
        const sensitivePaths = [
            '/auth',
            '/login',
            '/admin',
            '/api/auth',
            '/api/user',
            '/api/admin',
            '/dashboard',
            '/settings',
            '/profile'
        ];
        return sensitivePaths.some(sensitivePath => path.startsWith(sensitivePath));
    }
    cspReportHandler() {
        return async (request, reply) => {
            const report = request.body;
            request.log.warn('CSP Violation Report', {
                cspReport: report,
                userAgent: request.headers['user-agent'],
                ip: request.ip,
                timestamp: new Date().toISOString()
            });
            return reply.status(204).send();
        };
    }
    validateConfiguration() {
        const warnings = [];
        const errors = [];
        if (this.options.contentSecurityPolicy) {
            const csp = this.options.contentSecurityPolicy;
            if (csp.scriptSrc?.includes("'unsafe-inline'")) {
                warnings.push("'unsafe-inline' in script-src reduces XSS protection");
            }
            if (csp.scriptSrc?.includes("'unsafe-eval'")) {
                warnings.push("'unsafe-eval' in script-src reduces XSS protection");
            }
            if (csp.objectSrc && !csp.objectSrc.includes("'none'")) {
                warnings.push("object-src should be set to 'none' for better security");
            }
            if (!csp.frameAncestors || !csp.frameAncestors.includes("'none'")) {
                warnings.push("frame-ancestors should be set to 'none' to prevent clickjacking");
            }
        }
        if (this.options.strictTransportSecurity) {
            const hsts = this.options.strictTransportSecurity;
            if (hsts.maxAge < 31536000) {
                warnings.push('HSTS max-age should be at least 1 year (31536000 seconds)');
            }
            if (!hsts.includeSubDomains) {
                warnings.push('HSTS should include subdomains for complete protection');
            }
        }
        return {
            isValid: errors.length === 0,
            warnings,
            errors
        };
    }
    generateSecurityTxt() {
        return `# Security Policy for Fine Print AI
# Generated on ${new Date().toISOString()}

Contact: security@fineprintai.com
Expires: ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()}
Encryption: https://keys.openpgp.org/vks/v1/by-fingerprint/YOUR_PGP_FINGERPRINT
Preferred-Languages: en
Canonical: https://fineprintai.com/.well-known/security.txt
Policy: https://fineprintai.com/security-policy
Acknowledgments: https://fineprintai.com/security-acknowledgments

# Reporting Guidelines
# Please report security vulnerabilities responsibly
# Include proof of concept if applicable
# Allow reasonable time for remediation before public disclosure
`;
    }
}
exports.SecurityHeaders = SecurityHeaders;
exports.securityHeaders = new SecurityHeaders({
    contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        connectSrc: ["'self'", 'https:', 'wss:'],
        mediaSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: true,
        blockAllMixedContent: true,
        reportUri: '/api/security/csp-report'
    },
    strictTransportSecurity: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    permissionsPolicy: {
        camera: [],
        microphone: [],
        geolocation: [],
        payment: ["'self'"],
        fullscreen: ["'self'"]
    }
});
//# sourceMappingURL=security-headers.js.map