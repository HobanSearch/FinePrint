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
exports.XSSProtectionEngine = void 0;
exports.createXSSProtection = createXSSProtection;
const DOMPurify = __importStar(require("dompurify"));
const jsdom_1 = require("jsdom");
const index_1 = require("../index");
const window = new jsdom_1.JSDOM('').window;
const purify = DOMPurify(window);
class XSSProtectionEngine {
    config;
    nonceStore = new Map();
    xssPatterns = [
        {
            pattern: /<script[^>]*>[\s\S]*?<\/script>/gi,
            type: 'script_injection',
            severity: 'critical',
            description: 'Script tag injection detected'
        },
        {
            pattern: /<script[^>]*>/gi,
            type: 'script_injection',
            severity: 'critical',
            description: 'Script tag opening detected'
        },
        {
            pattern: /on\w+\s*=\s*["'][^"']*["']/gi,
            type: 'event_handler',
            severity: 'high',
            description: 'HTML event handler detected'
        },
        {
            pattern: /on\w+\s*=\s*[^\s>]+/gi,
            type: 'event_handler',
            severity: 'high',
            description: 'Unquoted event handler detected'
        },
        {
            pattern: /javascript\s*:/gi,
            type: 'javascript_uri',
            severity: 'high',
            description: 'JavaScript URI detected'
        },
        {
            pattern: /vbscript\s*:/gi,
            type: 'javascript_uri',
            severity: 'high',
            description: 'VBScript URI detected'
        },
        {
            pattern: /data\s*:[^,]*;base64,[A-Za-z0-9+\/]+=*/gi,
            type: 'data_uri',
            severity: 'medium',
            description: 'Base64 data URI detected'
        },
        {
            pattern: /data\s*:[^,]*text\/html/gi,
            type: 'data_uri',
            severity: 'high',
            description: 'HTML data URI detected'
        },
        {
            pattern: /<svg[^>]*>[\s\S]*?<script[\s\S]*?<\/svg>/gi,
            type: 'svg_script',
            severity: 'high',
            description: 'SVG with embedded script detected'
        },
        {
            pattern: /<meta[^>]*http-equiv[^>]*refresh[^>]*>/gi,
            type: 'meta_refresh',
            severity: 'medium',
            description: 'Meta refresh redirect detected'
        },
        {
            pattern: /<form[^>]*action[^>]*javascript:/gi,
            type: 'form_injection',
            severity: 'high',
            description: 'Form with JavaScript action detected'
        },
        {
            pattern: /<iframe[^>]*src[^>]*javascript:/gi,
            type: 'iframe_injection',
            severity: 'high',
            description: 'Iframe with JavaScript source detected'
        },
        {
            pattern: /<iframe[^>]*srcdoc[^>]*>/gi,
            type: 'iframe_injection',
            severity: 'medium',
            description: 'Iframe with inline content detected'
        },
        {
            pattern: /<object[^>]*data[^>]*javascript:/gi,
            type: 'object_injection',
            severity: 'high',
            description: 'Object with JavaScript data detected'
        },
        {
            pattern: /<embed[^>]*src[^>]*javascript:/gi,
            type: 'object_injection',
            severity: 'high',
            description: 'Embed with JavaScript source detected'
        }
    ];
    contextSanitizers = {
        html: {
            allowedTags: ['p', 'br', 'strong', 'em', 'u', 'ol', 'ul', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'a'],
            allowedAttributes: {
                'a': ['href', 'title'],
                '*': ['id', 'class']
            },
            allowedProtocols: ['http', 'https', 'mailto']
        },
        comment: {
            allowedTags: ['p', 'br', 'strong', 'em', 'u', 'a'],
            allowedAttributes: {
                'a': ['href']
            },
            allowedProtocols: ['http', 'https']
        },
        minimal: {
            allowedTags: ['p', 'br'],
            allowedAttributes: {},
            allowedProtocols: []
        },
        none: {
            allowedTags: [],
            allowedAttributes: {},
            allowedProtocols: []
        }
    };
    constructor(config = {}) {
        this.config = {
            enabled: true,
            strictMode: true,
            blockMode: true,
            allowedDomains: [],
            trustedTypes: false,
            cspReportUri: '/api/security/csp-report',
            cspReportOnly: false,
            nonce: {
                enabled: true,
                length: 16
            },
            sanitization: {
                enabled: true,
                allowedTags: ['p', 'br', 'strong', 'em', 'u'],
                allowedAttributes: {},
                allowedProtocols: ['http', 'https']
            },
            ...config
        };
        this.configureDOMPurify();
        this.startNonceCleanupJob();
    }
    middleware() {
        return async (request, reply) => {
            if (!this.config.enabled) {
                return;
            }
            try {
                const nonce = this.generateNonce(request);
                await this.setCSPHeaders(request, reply, nonce);
                await this.scanRequest(request);
                request.nonce = nonce;
                this.setXSSHeaders(reply);
            }
            catch (error) {
                if (error instanceof index_1.SecurityError) {
                    throw error;
                }
                request.log.error('XSS protection error', { error });
                if (this.config.strictMode) {
                    throw new index_1.SecurityError('XSS protection failed', 'XSS_PROTECTION_ERROR', 500);
                }
            }
        };
    }
    async setCSPHeaders(request, reply, nonce) {
        const directives = await this.buildCSPDirectives(request, nonce);
        const cspHeader = this.buildCSPHeader(directives);
        if (this.config.cspReportOnly) {
            reply.header('Content-Security-Policy-Report-Only', cspHeader);
        }
        else {
            reply.header('Content-Security-Policy', cspHeader);
        }
    }
    async buildCSPDirectives(request, nonce) {
        const baseDirectives = {
            'default-src': ["'self'"],
            'script-src': this.config.nonce.enabled ? ["'self'", `'nonce-${nonce}'`] : ["'self'"],
            'style-src': this.config.nonce.enabled ? ["'self'", `'nonce-${nonce}'`, "'unsafe-inline'"] : ["'self'", "'unsafe-inline'"],
            'img-src': ["'self'", 'data:', 'https:'],
            'font-src': ["'self'", 'https://fonts.gstatic.com'],
            'connect-src': ["'self'", 'https:', 'wss:'],
            'media-src': ["'self'"],
            'object-src': ["'none'"],
            'child-src': ["'self'"],
            'frame-src': ["'none'"],
            'worker-src': ["'self'"],
            'manifest-src': ["'self'"],
            'base-uri': ["'self'"],
            'form-action': ["'self'"],
            'frame-ancestors': ["'none'"],
            'upgrade-insecure-requests': true,
            'block-all-mixed-content': true
        };
        for (const domain of this.config.allowedDomains) {
            baseDirectives['script-src']?.push(domain);
            baseDirectives['style-src']?.push(domain);
            baseDirectives['connect-src']?.push(domain);
        }
        if (this.config.cspReportUri) {
            baseDirectives['report-uri'] = this.config.cspReportUri;
        }
        if (this.isAdminPath(request.url)) {
            baseDirectives['script-src'] = ["'self'", `'nonce-${nonce}'`];
            baseDirectives['style-src'] = ["'self'", `'nonce-${nonce}'`];
        }
        if (this.isAPIPath(request.url)) {
            return {
                'default-src': ["'none'"],
                'frame-ancestors': ["'none'"],
                'report-uri': this.config.cspReportUri
            };
        }
        return baseDirectives;
    }
    buildCSPHeader(directives) {
        const parts = [];
        for (const [directive, value] of Object.entries(directives)) {
            if (value === true) {
                parts.push(directive);
            }
            else if (Array.isArray(value) && value.length > 0) {
                parts.push(`${directive} ${value.join(' ')}`);
            }
            else if (typeof value === 'string') {
                parts.push(`${directive} ${value}`);
            }
        }
        return parts.join('; ');
    }
    generateNonce(request) {
        const sessionId = this.extractSessionId(request);
        const existingNonce = this.nonceStore.get(sessionId);
        if (existingNonce && Date.now() - existingNonce.timestamp < 60000) {
            return existingNonce.nonce;
        }
        const nonce = index_1.SecurityUtils.generateSecureRandom(this.config.nonce.length);
        this.nonceStore.set(sessionId, { nonce, timestamp: Date.now() });
        return nonce;
    }
    async scanRequest(request) {
        const threats = [];
        if (request.query && typeof request.query === 'object') {
            for (const [key, value] of Object.entries(request.query)) {
                if (typeof value === 'string') {
                    const detected = this.detectXSS(value, `query.${key}`);
                    threats.push(...detected.threats);
                }
            }
        }
        if (request.body && typeof request.body === 'object') {
            this.scanObjectForXSS(request.body, 'body', threats);
        }
        const suspiciousHeaders = ['referer', 'user-agent', 'x-forwarded-for'];
        for (const header of suspiciousHeaders) {
            const value = request.headers[header];
            if (typeof value === 'string') {
                const detected = this.detectXSS(value, `headers.${header}`);
                threats.push(...detected.threats);
            }
        }
        if (threats.length > 0) {
            const criticalThreats = threats.filter(t => t.severity === 'critical');
            const highThreats = threats.filter(t => t.severity === 'high');
            request.log.warn('XSS threats detected', {
                ip: index_1.SecurityUtils.extractClientIP(request),
                userAgent: request.headers['user-agent'],
                threats: threats.map(t => ({
                    type: t.type,
                    severity: t.severity,
                    location: t.location,
                    description: t.description
                }))
            });
            if (this.config.blockMode && (criticalThreats.length > 0 || highThreats.length > 2)) {
                throw new index_1.SecurityError('Request blocked due to XSS threat detection', 'XSS_THREAT_DETECTED', 403);
            }
        }
    }
    scanObjectForXSS(obj, path, threats, depth = 0) {
        if (depth > 10)
            return;
        if (typeof obj === 'string') {
            const detected = this.detectXSS(obj, path);
            threats.push(...detected.threats);
        }
        else if (Array.isArray(obj)) {
            obj.forEach((item, index) => {
                this.scanObjectForXSS(item, `${path}[${index}]`, threats, depth + 1);
            });
        }
        else if (obj && typeof obj === 'object') {
            for (const [key, value] of Object.entries(obj)) {
                this.scanObjectForXSS(value, `${path}.${key}`, threats, depth + 1);
            }
        }
    }
    detectXSS(content, location) {
        const threats = [];
        const blockedPayloads = [];
        let riskScore = 0;
        for (const patternDef of this.xssPatterns) {
            const matches = content.match(patternDef.pattern);
            if (matches) {
                for (const match of matches) {
                    threats.push({
                        type: patternDef.type,
                        payload: match,
                        location,
                        severity: patternDef.severity,
                        description: patternDef.description
                    });
                    blockedPayloads.push(match);
                    const severityScores = { low: 10, medium: 25, high: 50, critical: 75 };
                    riskScore += severityScores[patternDef.severity];
                }
            }
        }
        riskScore += this.calculateHeuristicRisk(content);
        const sanitizedContent = this.sanitizeContent(content, 'html');
        return {
            hasXSS: threats.length > 0,
            threats,
            sanitizedContent,
            riskScore: Math.min(riskScore, 100),
            blockedPayloads
        };
    }
    calculateHeuristicRisk(content) {
        let score = 0;
        const bracketCount = (content.match(/[<>]/g) || []).length;
        if (bracketCount > 10)
            score += 15;
        if (/\w+\s*=\s*["'][^"']*javascript/i.test(content))
            score += 30;
        if (/\w+\s*=\s*["'][^"']*data:/i.test(content))
            score += 20;
        if (/&#x?[0-9a-f]+;/i.test(content))
            score += 10;
        if (/%[0-9a-f]{2}/i.test(content))
            score += 10;
        const suspiciousStrings = ['alert(', 'confirm(', 'prompt(', 'eval(', 'expression('];
        for (const str of suspiciousStrings) {
            if (content.toLowerCase().includes(str)) {
                score += 25;
            }
        }
        return score;
    }
    sanitizeContent(content, context = 'html') {
        if (!this.config.sanitization.enabled) {
            return content;
        }
        const contextRules = this.contextSanitizers[context];
        return purify.sanitize(content, {
            ALLOWED_TAGS: contextRules.allowedTags,
            ALLOWED_ATTR: contextRules.allowedAttributes,
            ALLOWED_URI_REGEXP: new RegExp(`^(${contextRules.allowedProtocols.join('|')}):`, 'i'),
            KEEP_CONTENT: false,
            REMOVE_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
            REMOVE_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur'],
            FORBID_TAGS: ['script', 'style'],
            FORBID_ATTR: ['style', 'on*']
        });
    }
    setXSSHeaders(reply) {
        reply.header('X-XSS-Protection', this.config.blockMode ? '1; mode=block' : '1');
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('X-Frame-Options', 'DENY');
        reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
        reply.header('Cross-Origin-Embedder-Policy', 'require-corp');
        reply.header('Cross-Origin-Opener-Policy', 'same-origin');
        reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    }
    createCSPReportHandler() {
        return async (request, reply) => {
            try {
                const report = request.body;
                request.log.warn('CSP Violation Report', {
                    violatedDirective: report['csp-report']?.['violated-directive'],
                    blockedUri: report['csp-report']?.['blocked-uri'],
                    documentUri: report['csp-report']?.['document-uri'],
                    sourceFile: report['csp-report']?.['source-file'],
                    lineNumber: report['csp-report']?.['line-number'],
                    userAgent: request.headers['user-agent'],
                    ip: index_1.SecurityUtils.extractClientIP(request),
                    timestamp: new Date().toISOString()
                });
                return reply.status(204).send();
            }
            catch (error) {
                request.log.error('CSP report processing error', { error });
                return reply.status(400).send({ error: 'Invalid CSP report' });
            }
        };
    }
    createSanitizationMiddleware(context = 'html') {
        return async (request, reply) => {
            if (request.body && typeof request.body === 'object') {
                this.sanitizeObject(request.body, context);
            }
        };
    }
    sanitizeObject(obj, context, depth = 0) {
        if (depth > 10)
            return;
        if (typeof obj === 'string') {
            return this.sanitizeContent(obj, context);
        }
        else if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                obj[i] = this.sanitizeObject(obj[i], context, depth + 1);
            }
        }
        else if (obj && typeof obj === 'object') {
            for (const [key, value] of Object.entries(obj)) {
                obj[key] = this.sanitizeObject(value, context, depth + 1);
            }
        }
        return obj;
    }
    configureDOMPurify() {
        purify.addHook('beforeSanitizeElements', (node) => {
            if (node.tagName && ['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED'].includes(node.tagName)) {
                console.warn('Suspicious element detected and removed:', node.tagName);
            }
        });
        purify.addHook('beforeSanitizeAttributes', (node) => {
            if (node.hasAttributes()) {
                const attributes = Array.from(node.attributes);
                for (const attr of attributes) {
                    if (attr.name.startsWith('on')) {
                        node.removeAttribute(attr.name);
                    }
                }
            }
        });
    }
    extractSessionId(request) {
        const authHeader = request.headers.authorization;
        if (authHeader) {
            try {
                const token = authHeader.split(' ')[1];
                const jwt = require('jsonwebtoken');
                const decoded = jwt.decode(token);
                return decoded?.jti || decoded?.sub || 'anonymous';
            }
            catch {
            }
        }
        const ip = index_1.SecurityUtils.extractClientIP(request);
        const userAgent = request.headers['user-agent'] || '';
        return require('crypto').createHash('sha256')
            .update(`${ip}:${userAgent}`)
            .digest('hex')
            .substring(0, 16);
    }
    isAdminPath(path) {
        return path.startsWith('/admin') || path.startsWith('/api/admin');
    }
    isAPIPath(path) {
        return path.startsWith('/api/');
    }
    startNonceCleanupJob() {
        setInterval(() => {
            const now = Date.now();
            for (const [sessionId, data] of this.nonceStore.entries()) {
                if (now - data.timestamp > 300000) {
                    this.nonceStore.delete(sessionId);
                }
            }
        }, 60000);
    }
    generateNonceScript(nonce) {
        return `<script nonce="${nonce}">`;
    }
    generateNonceStyle(nonce) {
        return `<style nonce="${nonce}">`;
    }
    getStatistics() {
        return {
            activeNonces: this.nonceStore.size,
            config: {
                enabled: this.config.enabled,
                strictMode: this.config.strictMode,
                blockMode: this.config.blockMode,
                nonceEnabled: this.config.nonce.enabled,
                trustedTypes: this.config.trustedTypes
            }
        };
    }
}
exports.XSSProtectionEngine = XSSProtectionEngine;
function createXSSProtection(config) {
    return new XSSProtectionEngine(config);
}
//# sourceMappingURL=xss-protection.js.map