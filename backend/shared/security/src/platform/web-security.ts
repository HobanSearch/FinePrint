/**
 * Web Platform Security Implementation
 * CSP headers, XSS protection, secure cookies, HTTPS enforcement
 */

import * as crypto from 'crypto';

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

export class WebSecurityService {
  private config: WebSecurityConfig;
  private nonceCache: Map<string, { nonce: string; timestamp: number }>;

  constructor(config: WebSecurityConfig) {
    this.config = config;
    this.nonceCache = new Map();
    
    // Clean up expired nonces every hour
    setInterval(() => this.cleanupNonces(), 60 * 60 * 1000);
  }

  /**
   * Generate comprehensive security headers
   */
  generateSecurityHeaders(request: {
    path: string;
    userAgent: string;
    referer?: string;
  }): SecurityHeaders {
    const headers: Partial<SecurityHeaders> = {};

    // Content Security Policy
    if (this.config.csp.enabled) {
      headers['Content-Security-Policy'] = this.generateCSPHeader(request);
    }

    // HTTP Strict Transport Security
    if (this.config.https.hsts.enabled) {
      headers['Strict-Transport-Security'] = this.generateHSTSHeader();
    }

    // X-Content-Type-Options
    if (this.config.headers.xContentTypeOptions) {
      headers['X-Content-Type-Options'] = 'nosniff';
    }

    // X-Frame-Options
    headers['X-Frame-Options'] = this.config.headers.xFrameOptions;

    // X-XSS-Protection
    if (this.config.headers.xXssProtection) {
      headers['X-XSS-Protection'] = '1; mode=block';
    }

    // Referrer Policy
    headers['Referrer-Policy'] = this.config.headers.referrerPolicy;

    // Permissions Policy
    headers['Permissions-Policy'] = this.generatePermissionsPolicyHeader();

    // Cross-Origin policies
    headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
    headers['Cross-Origin-Opener-Policy'] = 'same-origin';
    headers['Cross-Origin-Resource-Policy'] = 'same-origin';

    return headers as SecurityHeaders;
  }

  /**
   * Generate dynamic Content Security Policy with nonces
   */
  private generateCSPHeader(request: any): string {
    const directives: string[] = [];
    const nonce = this.generateNonce();

    // Store nonce for validation
    this.nonceCache.set(nonce, {
      nonce,
      timestamp: Date.now()
    });

    // Build CSP directives
    for (const [directive, sources] of Object.entries(this.config.csp.directives)) {
      let directiveValue = sources.join(' ');
      
      // Add nonce for script and style sources
      if ((directive === 'script-src' || directive === 'style-src') && this.config.csp.strict) {
        directiveValue += ` 'nonce-${nonce}'`;
      }
      
      directives.push(`${directive} ${directiveValue}`);
    }

    // Add report URI if configured
    if (this.config.csp.reportUri) {
      directives.push(`report-uri ${this.config.csp.reportUri}`);
    }

    return directives.join('; ');
  }

  /**
   * Generate HSTS header
   */
  private generateHSTSHeader(): string {
    let hsts = `max-age=${this.config.https.hsts.maxAge}`;
    
    if (this.config.https.hsts.includeSubDomains) {
      hsts += '; includeSubDomains';
    }
    
    if (this.config.https.hsts.preload) {
      hsts += '; preload';
    }
    
    return hsts;
  }

  /**
   * Generate Permissions Policy header
   */
  private generatePermissionsPolicyHeader(): string {
    const policies: string[] = [];
    
    for (const [feature, allowlist] of Object.entries(this.config.headers.permissionsPolicy)) {
      if (allowlist.length === 0) {
        policies.push(`${feature}=()`);
      } else {
        policies.push(`${feature}=(${allowlist.join(' ')})`);
      }
    }
    
    return policies.join(', ');
  }

  /**
   * Create secure cookie configuration
   */
  createSecureCookie(options: SecureCookieOptions): string {
    const cookieParts: string[] = [`${options.name}=${options.value}`];

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
    } else if (this.config.cookies.maxAge) {
      cookieParts.push(`Max-Age=${this.config.cookies.maxAge}`);
    }

    if (options.expires) {
      cookieParts.push(`Expires=${options.expires.toUTCString()}`);
    }

    return cookieParts.join('; ');
  }

  /**
   * Validate CSP nonce
   */
  validateNonce(nonce: string): boolean {
    const cached = this.nonceCache.get(nonce);
    if (!cached) {
      return false;
    }

    // Check if nonce is expired (valid for 1 hour)
    const isExpired = Date.now() - cached.timestamp > 60 * 60 * 1000;
    if (isExpired) {
      this.nonceCache.delete(nonce);
      return false;
    }

    return true;
  }

  /**
   * Generate cryptographic nonce
   */
  generateNonce(): string {
    return crypto.randomBytes(16).toString('base64');
  }

  /**
   * Clean up expired nonces
   */
  private cleanupNonces(): void {
    const now = Date.now();
    for (const [nonce, data] of this.nonceCache.entries()) {
      if (now - data.timestamp > 60 * 60 * 1000) {
        this.nonceCache.delete(nonce);
      }
    }
  }

  /**
   * Validate CORS request
   */
  validateCORSRequest(origin: string, method: string): {
    allowed: boolean;
    headers: Record<string, string>;
  } {
    if (!this.config.cors.enabled) {
      return { allowed: false, headers: {} };
    }

    const headers: Record<string, string> = {};

    // Check origin
    const originAllowed = this.config.cors.origins.includes('*') || 
                         this.config.cors.origins.includes(origin);

    if (originAllowed) {
      headers['Access-Control-Allow-Origin'] = origin;
      
      if (this.config.cors.credentials) {
        headers['Access-Control-Allow-Credentials'] = 'true';
      }

      // Add method-specific headers
      if (method === 'OPTIONS') {
        headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token';
        headers['Access-Control-Max-Age'] = '86400'; // 24 hours
      }
    }

    return {
      allowed: originAllowed,
      headers
    };
  }

  /**
   * Generate CSRF token
   */
  generateCSRFToken(sessionId: string): string {
    const timestamp = Date.now().toString();
    const data = `${sessionId}:${timestamp}`;
    const hmac = crypto.createHmac('sha256', process.env.CSRF_SECRET || 'default-secret');
    const signature = hmac.update(data).digest('hex');
    
    return Buffer.from(`${timestamp}:${signature}`).toString('base64');
  }

  /**
   * Validate CSRF token
   */
  validateCSRFToken(token: string, sessionId: string): boolean {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf8');
      const [timestamp, signature] = decoded.split(':');
      
      // Check token age (valid for 1 hour)
      const tokenAge = Date.now() - parseInt(timestamp);
      if (tokenAge > 60 * 60 * 1000) {
        return false;
      }

      // Verify signature
      const data = `${sessionId}:${timestamp}`;
      const hmac = crypto.createHmac('sha256', process.env.CSRF_SECRET || 'default-secret');
      const expectedSignature = hmac.update(data).digest('hex');
      
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Sanitize HTML content
   */
  sanitizeHTML(html: string): string {
    // Basic HTML sanitization - in production, use a library like DOMPurify
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }

  /**
   * Validate file upload
   */
  validateFileUpload(file: {
    name: string;
    size: number;
    type: string;
    buffer: Buffer;
  }): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      errors.push('File size exceeds 10MB limit');
    }

    // Check file extension
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt'];
    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!allowedExtensions.includes(extension)) {
      errors.push('File type not allowed');
    }

    // Check MIME type
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    if (!allowedMimeTypes.includes(file.type)) {
      errors.push('MIME type not allowed');
    }

    // Check file signature (magic bytes)
    const signatures = {
      pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
      doc: [0xD0, 0xCF, 0x11, 0xE0], // DOC file signature
      txt: [0x0A, 0x0D] // Simple text file check
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

  /**
   * Generate Subresource Integrity hash
   */
  generateSRIHash(content: string): string {
    const hash = crypto.createHash('sha384').update(content).digest('base64');
    return `sha384-${hash}`;
  }

  /**
   * Create secure session configuration
   */
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
  } {
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

export const createWebSecurity = (config: WebSecurityConfig) => {
  return new WebSecurityService(config);
};

// Default secure configuration
export const defaultWebSecurityConfig: WebSecurityConfig = {
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
    maxAge: 24 * 60 * 60 // 24 hours
  },
  https: {
    enforce: true,
    hsts: {
      enabled: true,
      maxAge: 31536000, // 1 year
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