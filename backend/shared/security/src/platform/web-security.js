"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultWebSecurityConfig = exports.createWebSecurity = exports.WebSecurityService = void 0;
const crypto = __importStar(require("crypto"));
class WebSecurityService {
    config;
    nonceCache;
    constructor(config) {
        this.config = config;
        this.nonceCache = new Map();
        setInterval(() => this.cleanupNonces(), 60 * 60 * 1000);
    }
    generateSecurityHeaders(request) {
        const headers = {};
        if (this.config.csp.enabled) {
            headers['Content-Security-Policy'] = this.generateCSPHeader(request);
        }
        if (this.config.https.hsts.enabled) {
            headers['Strict-Transport-Security'] = this.generateHSTSHeader();
        }
        if (this.config.headers.xContentTypeOptions) {
            headers['X-Content-Type-Options'] = 'nosniff';
        }
        headers['X-Frame-Options'] = this.config.headers.xFrameOptions;
        if (this.config.headers.xXssProtection) {
            headers['X-XSS-Protection'] = '1; mode=block';
        }
        headers['Referrer-Policy'] = this.config.headers.referrerPolicy;
        headers['Permissions-Policy'] = this.generatePermissionsPolicyHeader();
        headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
        headers['Cross-Origin-Opener-Policy'] = 'same-origin';
        headers['Cross-Origin-Resource-Policy'] = 'same-origin';
        return headers;
    }
    generateCSPHeader(request) {
        const directives = [];
        const nonce = this.generateNonce();
        this.nonceCache.set(nonce, {
            nonce,
            timestamp: Date.now()
        });
        for (const [directive, sources] of Object.entries(this.config.csp.directives)) {
            let directiveValue = sources.join(' ');
            if ((directive === 'script-src' || directive === 'style-src') && this.config.csp.strict) {
                directiveValue += ` 'nonce-${nonce}'`;
            }
            directives.push(`${directive} ${directiveValue}`);
        }
        if (this.config.csp.reportUri) {
            directives.push(`report-uri ${this.config.csp.reportUri}`);
        }
        return directives.join('; ');
    }
    generateHSTSHeader() {
        let hsts = `max-age=${this.config.https.hsts.maxAge}`;
        if (this.config.https.hsts.includeSubDomains) {
            hsts += '; includeSubDomains';
        }
        if (this.config.https.hsts.preload) {
            hsts += '; preload';
        }
        return hsts;
    }
    generatePermissionsPolicyHeader() {
        const policies = [];
        for (const [feature, allowlist] of Object.entries(this.config.headers.permissionsPolicy)) {
            if (allowlist.length === 0) {
                policies.push(`${feature}=()`);
            }
            else {
                policies.push(`${feature}=(${allowlist.join(' ')})`);
            }
        }
        return policies.join(', ');
    }
    createSecureCookie(options) {
        const cookieParts = [`${options.name}=${options.value}`];
        if (options.domain) {
            cookieParts.push(`Domain=${options.domain}`);
        }
        if (options.path) {
            cookieParts.push(`Path=${options.path}`);
        }
        if (options.secure || this.config.cookies.secure) {
            cookieParts.push('Secure');
        }
        if (options.httpOnly || this.config.cookies.httpOnly) {
            cookieParts.push('HttpOnly');
        }
        const sameSite = options.sameSite || this.config.cookies.sameSite;
        cookieParts.push(`SameSite=${sameSite.charAt(0).toUpperCase() + sameSite.slice(1)}`);
        if (options.maxAge !== undefined) {
            cookieParts.push(`Max-Age=${options.maxAge}`);
        }
        else if (this.config.cookies.maxAge) {
            cookieParts.push(`Max-Age=${this.config.cookies.maxAge}`);
        }
        if (options.expires) {
            cookieParts.push(`Expires=${options.expires.toUTCString()}`);
        }
        return cookieParts.join('; ');
    }
    validateNonce(nonce) {
        const cached = this.nonceCache.get(nonce);
        if (!cached) {
            return false;
        }
        const isExpired = Date.now() - cached.timestamp > 60 * 60 * 1000;
        if (isExpired) {
            this.nonceCache.delete(nonce);
            return false;
        }
        return true;
    }
    generateNonce() {
        return crypto.randomBytes(16).toString('base64');
    }
    cleanupNonces() {
        const now = Date.now();
        for (const [nonce, data] of this.nonceCache.entries()) {
            if (now - data.timestamp > 60 * 60 * 1000) {
                this.nonceCache.delete(nonce);
            }
        }
    }
    validateCORSRequest(origin, method) {
        if (!this.config.cors.enabled) {
            return { allowed: false, headers: {} };
        }
        const headers = {};
        const originAllowed = this.config.cors.origins.includes('*') ||
            this.config.cors.origins.includes(origin);
        if (originAllowed) {
            headers['Access-Control-Allow-Origin'] = origin;
            if (this.config.cors.credentials) {
                headers['Access-Control-Allow-Credentials'] = 'true';
            }
            if (method === 'OPTIONS') {
                headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
                headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token';
                headers['Access-Control-Max-Age'] = '86400';
            }
        }
        return {
            allowed: originAllowed,
            headers
        };
    }
    generateCSRFToken(sessionId) {
        const timestamp = Date.now().toString();
        const data = `${sessionId}:${timestamp}`;
        const hmac = crypto.createHmac('sha256', process.env.CSRF_SECRET || 'default-secret');
        const signature = hmac.update(data).digest('hex');
        return Buffer.from(`${timestamp}:${signature}`).toString('base64');
    }
    validateCSRFToken(token, sessionId) {
        try {
            const decoded = Buffer.from(token, 'base64').toString('utf8');
            const [timestamp, signature] = decoded.split(':');
            const tokenAge = Date.now() - parseInt(timestamp);
            if (tokenAge > 60 * 60 * 1000) {
                return false;
            }
            const data = `${sessionId}:${timestamp}`;
            const hmac = crypto.createHmac('sha256', process.env.CSRF_SECRET || 'default-secret');
            const expectedSignature = hmac.update(data).digest('hex');
            return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
        }
        catch (error) {
            return false;
        }
    }
    sanitizeHTML(html) {
        return html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '');
    }
    validateFileUpload(file) {
        const errors = [];
        if (file.size > 10 * 1024 * 1024) {
            errors.push('File size exceeds 10MB limit');
        }
        const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt'];
        const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
        if (!allowedExtensions.includes(extension)) {
            errors.push('File type not allowed');
        }
        const allowedMimeTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
        ];
        if (!allowedMimeTypes.includes(file.type)) {
            errors.push('MIME type not allowed');
        }
        const signatures = {
            pdf: [0x25, 0x50, 0x44, 0x46],
            doc: [0xD0, 0xCF, 0x11, 0xE0],
            txt: [0x0A, 0x0D]
        };
        let signatureValid = false;
        for (const [type, sig] of Object.entries(signatures)) {
            if (file.buffer.length >= sig.length) {
                const fileSignature = Array.from(file.buffer.slice(0, sig.length));
                if (sig.every((byte, index) => byte === fileSignature[index])) {
                    signatureValid = true;
                    break;
                }
            }
        }
        if (!signatureValid && extension !== '.txt') {
            errors.push('File signature validation failed');
        }
        return {
            valid: errors.length === 0,
            errors
        };
    }
    generateSRIHash(content) {
        const hash = crypto.createHash('sha384').update(content).digest('base64');
        return `sha384-${hash}`;
    }
    createSecureSessionConfig() {
        return {
            name: 'fineprint.sid',
            secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
            cookie: {
                secure: this.config.cookies.secure,
                httpOnly: this.config.cookies.httpOnly,
                maxAge: this.config.cookies.maxAge,
                sameSite: this.config.cookies.sameSite
            },
            resave: false,
            saveUninitialized: false
        };
    }
}
exports.WebSecurityService = WebSecurityService;
const createWebSecurity = (config) => {
    return new WebSecurityService(config);
};
exports.createWebSecurity = createWebSecurity;
exports.defaultWebSecurityConfig = {
    csp: {
        enabled: true,
        strict: true,
        reportUri: '/api/security/csp-report',
        directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'", "'strict-dynamic'"],
            'style-src': ["'self'", "'unsafe-inline'"],
            'img-src': ["'self'", 'data:', 'https:'],
            'connect-src': ["'self'"],
            'font-src': ["'self'"],
            'object-src': ["'none'"],
            'media-src': ["'self'"],
            'frame-src': ["'none'"],
            'worker-src': ["'self'"],
            'child-src': ["'none'"],
            'form-action': ["'self'"],
            'frame-ancestors': ["'none'"],
            'base-uri': ["'self'"],
            'manifest-src': ["'self'"]
        }
    },
    cookies: {
        secure: true,
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 24 * 60 * 60
    },
    https: {
        enforce: true,
        hsts: {
            enabled: true,
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
        }
    },
    headers: {
        xContentTypeOptions: true,
        xFrameOptions: 'DENY',
        xXssProtection: true,
        referrerPolicy: 'strict-origin-when-cross-origin',
        permissionsPolicy: {
            camera: [],
            microphone: [],
            geolocation: [],
            payment: ['self'],
            usb: [],
            bluetooth: []
        }
    },
    cors: {
        enabled: false,
        origins: [],
        credentials: false
    }
};
//# sourceMappingURL=web-security.js.map