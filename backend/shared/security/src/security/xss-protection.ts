// Advanced XSS Protection and Content Security Policy
// Multi-layered XSS prevention with dynamic CSP and context-aware sanitization

import { FastifyRequest, FastifyReply } from 'fastify';
import * as DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { SecurityError, SecurityUtils } from '../index';

// Initialize DOMPurify with JSDOM for server-side usage
const window = new JSDOM('').window;
const purify = DOMPurify(window as any);

export interface XSSProtectionConfig {
  enabled: boolean;
  strictMode: boolean;
  blockMode: boolean; // vs report mode
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
    allowedAttributes: { [tag: string]: string[] };
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

export class XSSProtectionEngine {
  private config: XSSProtectionConfig;
  private nonceStore = new Map<string, { nonce: string; timestamp: number }>();
  
  // XSS detection patterns
  private readonly xssPatterns = [
    // Script tags
    {
      pattern: /<script[^>]*>[\s\S]*?<\/script>/gi,
      type: 'script_injection' as const,
      severity: 'critical' as const,
      description: 'Script tag injection detected'
    },
    {
      pattern: /<script[^>]*>/gi,
      type: 'script_injection' as const,
      severity: 'critical' as const,
      description: 'Script tag opening detected'
    },
    
    // Event handlers
    {
      pattern: /on\w+\s*=\s*["'][^"']*["']/gi,
      type: 'event_handler' as const,
      severity: 'high' as const,
      description: 'HTML event handler detected'
    },
    {
      pattern: /on\w+\s*=\s*[^\s>]+/gi,
      type: 'event_handler' as const,
      severity: 'high' as const,
      description: 'Unquoted event handler detected'
    },
    
    // JavaScript URLs
    {
      pattern: /javascript\s*:/gi,
      type: 'javascript_uri' as const,
      severity: 'high' as const,
      description: 'JavaScript URI detected'
    },
    {
      pattern: /vbscript\s*:/gi,
      type: 'javascript_uri' as const,
      severity: 'high' as const,
      description: 'VBScript URI detected'
    },
    
    // Data URIs with script
    {
      pattern: /data\s*:[^,]*;base64,[A-Za-z0-9+\/]+=*/gi,
      type: 'data_uri' as const,
      severity: 'medium' as const,
      description: 'Base64 data URI detected'
    },
    {
      pattern: /data\s*:[^,]*text\/html/gi,
      type: 'data_uri' as const,
      severity: 'high' as const,
      description: 'HTML data URI detected'
    },
    
    // SVG with script
    {
      pattern: /<svg[^>]*>[\s\S]*?<script[\s\S]*?<\/svg>/gi,
      type: 'svg_script' as const,
      severity: 'high' as const,
      description: 'SVG with embedded script detected'
    },
    
    // Meta refresh
    {
      pattern: /<meta[^>]*http-equiv[^>]*refresh[^>]*>/gi,
      type: 'meta_refresh' as const,
      severity: 'medium' as const,
      description: 'Meta refresh redirect detected'
    },
    
    // Form injection
    {
      pattern: /<form[^>]*action[^>]*javascript:/gi,
      type: 'form_injection' as const,
      severity: 'high' as const,
      description: 'Form with JavaScript action detected'
    },
    
    // Iframe injection
    {
      pattern: /<iframe[^>]*src[^>]*javascript:/gi,
      type: 'iframe_injection' as const,
      severity: 'high' as const,
      description: 'Iframe with JavaScript source detected'
    },
    {
      pattern: /<iframe[^>]*srcdoc[^>]*>/gi,
      type: 'iframe_injection' as const,
      severity: 'medium' as const,
      description: 'Iframe with inline content detected'
    },
    
    // Object injection
    {
      pattern: /<object[^>]*data[^>]*javascript:/gi,
      type: 'object_injection' as const,
      severity: 'high' as const,
      description: 'Object with JavaScript data detected'
    },
    {
      pattern: /<embed[^>]*src[^>]*javascript:/gi,
      type: 'object_injection' as const,
      severity: 'high' as const,
      description: 'Embed with JavaScript source detected'
    }
  ];
  
  // Context-aware sanitization rules
  private readonly contextSanitizers = {
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

  constructor(config: Partial<XSSProtectionConfig> = {}) {
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
    
    // Configure DOMPurify
    this.configureDOMPurify();
    
    // Start nonce cleanup job
    this.startNonceCleanupJob();
  }

  /**
   * Main XSS protection middleware
   */
  middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!this.config.enabled) {
        return;
      }

      try {
        // Generate nonce for this request
        const nonce = this.generateNonce(request);
        
        // Set CSP headers with nonce
        await this.setCSPHeaders(request, reply, nonce);
        
        // Scan request for XSS attempts
        await this.scanRequest(request);
        
        // Add nonce to request for use in templates
        (request as any).nonce = nonce;
        
        // Set additional XSS protection headers
        this.setXSSHeaders(reply);
        
      } catch (error) {
        if (error instanceof SecurityError) {
          throw error;
        }
        
        request.log.error('XSS protection error', { error });
        if (this.config.strictMode) {
          throw new SecurityError('XSS protection failed', 'XSS_PROTECTION_ERROR', 500);
        }
      }
    };
  }

  /**
   * Generate Content Security Policy headers
   */
  private async setCSPHeaders(
    request: FastifyRequest, 
    reply: FastifyReply, 
    nonce: string
  ): Promise<void> {
    const directives = await this.buildCSPDirectives(request, nonce);
    const cspHeader = this.buildCSPHeader(directives);
    
    if (this.config.cspReportOnly) {
      reply.header('Content-Security-Policy-Report-Only', cspHeader);
    } else {
      reply.header('Content-Security-Policy', cspHeader);
    }
  }

  /**
   * Build CSP directives based on request context
   */
  private async buildCSPDirectives(request: FastifyRequest, nonce: string): Promise<CSPDirectives> {
    const baseDirectives: CSPDirectives = {
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
    
    // Add allowed domains
    for (const domain of this.config.allowedDomains) {
      baseDirectives['script-src']?.push(domain);
      baseDirectives['style-src']?.push(domain);
      baseDirectives['connect-src']?.push(domain);
    }
    
    // Add report URI
    if (this.config.cspReportUri) {
      baseDirectives['report-uri'] = this.config.cspReportUri;
    }
    
    // Context-specific adjustments
    if (this.isAdminPath(request.url)) {
      // More restrictive CSP for admin pages
      baseDirectives['script-src'] = ["'self'", `'nonce-${nonce}'`];
      baseDirectives['style-src'] = ["'self'", `'nonce-${nonce}'`];
    }
    
    if (this.isAPIPath(request.url)) {
      // API endpoints don't need most CSP directives
      return {
        'default-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'report-uri': this.config.cspReportUri
      };
    }
    
    return baseDirectives;
  }

  /**
   * Build CSP header string from directives
   */
  private buildCSPHeader(directives: CSPDirectives): string {
    const parts: string[] = [];
    
    for (const [directive, value] of Object.entries(directives)) {
      if (value === true) {
        parts.push(directive);
      } else if (Array.isArray(value) && value.length > 0) {
        parts.push(`${directive} ${value.join(' ')}`);
      } else if (typeof value === 'string') {
        parts.push(`${directive} ${value}`);
      }
    }
    
    return parts.join('; ');
  }

  /**
   * Generate cryptographically secure nonce
   */
  private generateNonce(request: FastifyRequest): string {
    const sessionId = this.extractSessionId(request);
    const existingNonce = this.nonceStore.get(sessionId);
    
    // Reuse nonce within the same session for a short period
    if (existingNonce && Date.now() - existingNonce.timestamp < 60000) { // 1 minute
      return existingNonce.nonce;
    }
    
    const nonce = SecurityUtils.generateSecureRandom(this.config.nonce.length);
    this.nonceStore.set(sessionId, { nonce, timestamp: Date.now() });
    
    return nonce;
  }

  /**
   * Scan request for XSS attempts
   */
  private async scanRequest(request: FastifyRequest): Promise<void> {
    const threats: XSSThreat[] = [];
    
    // Scan query parameters
    if (request.query && typeof request.query === 'object') {
      for (const [key, value] of Object.entries(request.query)) {
        if (typeof value === 'string') {
          const detected = this.detectXSS(value, `query.${key}`);
          threats.push(...detected.threats);
        }
      }
    }
    
    // Scan request body
    if (request.body && typeof request.body === 'object') {
      this.scanObjectForXSS(request.body, 'body', threats);
    }
    
    // Scan headers (specific ones that might contain user content)
    const suspiciousHeaders = ['referer', 'user-agent', 'x-forwarded-for'];
    for (const header of suspiciousHeaders) {
      const value = request.headers[header];
      if (typeof value === 'string') {
        const detected = this.detectXSS(value, `headers.${header}`);
        threats.push(...detected.threats);
      }
    }
    
    // Handle detected threats
    if (threats.length > 0) {
      const criticalThreats = threats.filter(t => t.severity === 'critical');
      const highThreats = threats.filter(t => t.severity === 'high');
      
      // Log all threats
      request.log.warn('XSS threats detected', {
        ip: SecurityUtils.extractClientIP(request),
        userAgent: request.headers['user-agent'],
        threats: threats.map(t => ({
          type: t.type,
          severity: t.severity,
          location: t.location,
          description: t.description
        }))
      });
      
      // Block critical threats
      if (this.config.blockMode && (criticalThreats.length > 0 || highThreats.length > 2)) {
        throw new SecurityError(
          'Request blocked due to XSS threat detection',
          'XSS_THREAT_DETECTED',
          403
        );
      }
    }
  }

  /**
   * Recursively scan object for XSS
   */
  private scanObjectForXSS(obj: any, path: string, threats: XSSThreat[], depth = 0): void {
    if (depth > 10) return; // Prevent deep recursion
    
    if (typeof obj === 'string') {
      const detected = this.detectXSS(obj, path);
      threats.push(...detected.threats);
    } else if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        this.scanObjectForXSS(item, `${path}[${index}]`, threats, depth + 1);
      });
    } else if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        this.scanObjectForXSS(value, `${path}.${key}`, threats, depth + 1);
      }
    }
  }

  /**
   * Detect XSS in content
   */
  detectXSS(content: string, location: string): XSSDetectionResult {
    const threats: XSSThreat[] = [];
    const blockedPayloads: string[] = [];
    let riskScore = 0;
    
    // Check against known XSS patterns
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
          
          // Add to risk score
          const severityScores = { low: 10, medium: 25, high: 50, critical: 75 };
          riskScore += severityScores[patternDef.severity];
        }
      }
    }
    
    // Additional heuristic checks
    riskScore += this.calculateHeuristicRisk(content);
    
    // Sanitize content
    const sanitizedContent = this.sanitizeContent(content, 'html');
    
    return {
      hasXSS: threats.length > 0,
      threats,
      sanitizedContent,
      riskScore: Math.min(riskScore, 100),
      blockedPayloads
    };
  }

  /**
   * Calculate heuristic risk score
   */
  private calculateHeuristicRisk(content: string): number {
    let score = 0;
    
    // High number of angle brackets
    const bracketCount = (content.match(/[<>]/g) || []).length;
    if (bracketCount > 10) score += 15;
    
    // Suspicious attribute patterns
    if (/\w+\s*=\s*["'][^"']*javascript/i.test(content)) score += 30;
    if (/\w+\s*=\s*["'][^"']*data:/i.test(content)) score += 20;
    
    // Encoded content that might be XSS
    if (/&#x?[0-9a-f]+;/i.test(content)) score += 10;
    if (/%[0-9a-f]{2}/i.test(content)) score += 10;
    
    // Suspicious strings
    const suspiciousStrings = ['alert(', 'confirm(', 'prompt(', 'eval(', 'expression('];
    for (const str of suspiciousStrings) {
      if (content.toLowerCase().includes(str)) {
        score += 25;
      }
    }
    
    return score;
  }

  /**
   * Sanitize content based on context
   */
  sanitizeContent(content: string, context: keyof typeof this.contextSanitizers = 'html'): string {
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

  /**
   * Set additional XSS protection headers
   */
  private setXSSHeaders(reply: FastifyReply): void {
    // X-XSS-Protection (legacy but still supported)
    reply.header('X-XSS-Protection', this.config.blockMode ? '1; mode=block' : '1');
    
    // X-Content-Type-Options
    reply.header('X-Content-Type-Options', 'nosniff');
    
    // X-Frame-Options
    reply.header('X-Frame-Options', 'DENY');
    
    // Referrer Policy
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Cross-Origin policies
    reply.header('Cross-Origin-Embedder-Policy', 'require-corp');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
  }

  /**
   * CSP violation report handler
   */
  createCSPReportHandler() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const report = request.body as any;
        
        // Log CSP violation
        request.log.warn('CSP Violation Report', {
          violatedDirective: report['csp-report']?.['violated-directive'],
          blockedUri: report['csp-report']?.['blocked-uri'],
          documentUri: report['csp-report']?.['document-uri'],
          sourceFile: report['csp-report']?.['source-file'],
          lineNumber: report['csp-report']?.['line-number'],
          userAgent: request.headers['user-agent'],
          ip: SecurityUtils.extractClientIP(request),
          timestamp: new Date().toISOString()
        });
        
        // Store report for analysis (implement as needed)
        // await this.storeCSPViolation(report);
        
        return reply.status(204).send();
        
      } catch (error) {
        request.log.error('CSP report processing error', { error });
        return reply.status(400).send({ error: 'Invalid CSP report' });
      }
    };
  }

  /**
   * Create sanitization middleware for specific contexts
   */
  createSanitizationMiddleware(context: keyof typeof this.contextSanitizers = 'html') {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.body && typeof request.body === 'object') {
        this.sanitizeObject(request.body, context);
      }
    };
  }

  /**
   * Recursively sanitize object
   */
  private sanitizeObject(obj: any, context: keyof typeof this.contextSanitizers, depth = 0): void {
    if (depth > 10) return;
    
    if (typeof obj === 'string') {
      return this.sanitizeContent(obj, context);
    } else if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        obj[i] = this.sanitizeObject(obj[i], context, depth + 1);
      }
    } else if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        (obj as any)[key] = this.sanitizeObject(value, context, depth + 1);
      }
    }
    
    return obj;
  }

  /**
   * Configure DOMPurify with security settings
   */
  private configureDOMPurify(): void {
    // Add custom hooks for additional security
    purify.addHook('beforeSanitizeElements', (node) => {
      // Log suspicious elements
      if (node.tagName && ['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED'].includes(node.tagName)) {
        console.warn('Suspicious element detected and removed:', node.tagName);
      }
    });
    
    purify.addHook('beforeSanitizeAttributes', (node) => {
      // Remove all event handlers
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

  /**
   * Helper methods
   */
  private extractSessionId(request: FastifyRequest): string {
    // Try to extract from JWT or session cookie
    const authHeader = request.headers.authorization;
    if (authHeader) {
      try {
        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const decoded = jwt.decode(token) as any;
        return decoded?.jti || decoded?.sub || 'anonymous';
      } catch {
        // Ignore JWT decode errors
      }
    }
    
    // Fallback to IP + User-Agent hash
    const ip = SecurityUtils.extractClientIP(request);
    const userAgent = request.headers['user-agent'] || '';
    return require('crypto').createHash('sha256')
      .update(`${ip}:${userAgent}`)
      .digest('hex')
      .substring(0, 16);
  }

  private isAdminPath(path: string): boolean {
    return path.startsWith('/admin') || path.startsWith('/api/admin');
  }

  private isAPIPath(path: string): boolean {
    return path.startsWith('/api/');
  }

  /**
   * Start nonce cleanup job
   */
  private startNonceCleanupJob(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [sessionId, data] of this.nonceStore.entries()) {
        if (now - data.timestamp > 300000) { // 5 minutes
          this.nonceStore.delete(sessionId);
        }
      }
    }, 60000); // Run every minute
  }

  /**
   * Generate template helper for nonce inclusion
   */
  generateNonceScript(nonce: string): string {
    return `<script nonce="${nonce}">`;
  }

  generateNonceStyle(nonce: string): string {
    return `<style nonce="${nonce}">`;
  }

  /**
   * Get XSS protection statistics
   */
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

// Export factory function
export function createXSSProtection(
  config?: Partial<XSSProtectionConfig>
): XSSProtectionEngine {
  return new XSSProtectionEngine(config);
}
