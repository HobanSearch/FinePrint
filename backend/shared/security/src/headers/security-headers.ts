// Security Headers Implementation
// Comprehensive security headers for OWASP compliance

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
  customHeaders?: { [key: string]: string };
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

export type ReferrerPolicyValue = 
  | 'no-referrer'
  | 'no-referrer-when-downgrade'
  | 'origin'
  | 'origin-when-cross-origin'
  | 'same-origin'
  | 'strict-origin'
  | 'strict-origin-when-cross-origin'
  | 'unsafe-url';

export class SecurityHeaders {
  private readonly options: SecurityHeadersOptions;

  constructor(options: SecurityHeadersOptions = {}) {
    this.options = {
      // Default CSP - restrictive but functional
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // TODO: Remove unsafe-* in production
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
      
      // HSTS - 1 year with subdomain inclusion
      strictTransportSecurity: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
        ...options.strictTransportSecurity
      },
      
      xFrameOptions: options.xFrameOptions ?? 'DENY',
      xContentTypeOptions: options.xContentTypeOptions ?? true,
      xXSSProtection: options.xXSSProtection ?? true,
      referrerPolicy: options.referrerPolicy ?? 'strict-origin-when-cross-origin',
      
      // Permissions Policy - restrictive by default
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
      
      // Expect-CT header
      expectCT: options.expectCT || {
        maxAge: 86400, // 24 hours
        enforce: true
      },
      
      customHeaders: options.customHeaders || {}
    };
  }

  /**
   * Middleware to set security headers
   */
  middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      // Content Security Policy
      if (this.options.contentSecurityPolicy) {
        const cspHeader = this.buildCSPHeader(this.options.contentSecurityPolicy);
        reply.header('Content-Security-Policy', cspHeader);
        
        // Also set report-only header for testing
        if (process.env.NODE_ENV === 'development') {
          reply.header('Content-Security-Policy-Report-Only', cspHeader);
        }
      }

      // Strict Transport Security
      if (this.options.strictTransportSecurity && request.protocol === 'https') {
        const hstsHeader = this.buildHSTSHeader(this.options.strictTransportSecurity);
        reply.header('Strict-Transport-Security', hstsHeader);
      }

      // X-Frame-Options
      if (this.options.xFrameOptions) {
        reply.header('X-Frame-Options', this.options.xFrameOptions);
      }

      // X-Content-Type-Options
      if (this.options.xContentTypeOptions) {
        reply.header('X-Content-Type-Options', 'nosniff');
      }

      // X-XSS-Protection (deprecated but still used by some browsers)
      if (this.options.xXSSProtection) {
        reply.header('X-XSS-Protection', '1; mode=block');
      }

      // Referrer-Policy
      if (this.options.referrerPolicy) {
        reply.header('Referrer-Policy', this.options.referrerPolicy);
      }

      // Permissions-Policy
      if (this.options.permissionsPolicy) {
        const permissionsPolicyHeader = this.buildPermissionsPolicyHeader(this.options.permissionsPolicy);
        if (permissionsPolicyHeader) {
          reply.header('Permissions-Policy', permissionsPolicyHeader);
        }
      }

      // Expect-CT
      if (this.options.expectCT && request.protocol === 'https') {
        const expectCTHeader = this.buildExpectCTHeader(this.options.expectCT);
        reply.header('Expect-CT', expectCTHeader);
      }

      // Custom headers
      for (const [name, value] of Object.entries(this.options.customHeaders)) {
        reply.header(name, value);
      }

      // Additional security headers
      reply.header('X-DNS-Prefetch-Control', 'off');
      reply.header('X-Permitted-Cross-Domain-Policies', 'none');
      reply.header('Cross-Origin-Embedder-Policy', 'require-corp');
      reply.header('Cross-Origin-Opener-Policy', 'same-origin');
      reply.header('Cross-Origin-Resource-Policy', 'same-origin');
      
      // Cache control for sensitive pages
      if (this.isSensitivePath(request.url)) {
        reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        reply.header('Pragma', 'no-cache');
        reply.header('Expires', '0');
        reply.header('Surrogate-Control', 'no-store');
      }

      // Server header removal/modification
      reply.header('Server', 'Fine Print AI');
      reply.removeHeader('X-Powered-By');
    };
  }

  /**
   * Build Content Security Policy header
   */
  private buildCSPHeader(csp: CSPConfig): string {
    const directives: string[] = [];

    // Source list directives
    const sourceListDirectives = [
      'default-src', 'script-src', 'style-src', 'img-src', 'font-src',
      'connect-src', 'media-src', 'object-src', 'child-src', 'frame-src',
      'worker-src', 'manifest-src', 'prefetch-src', 'base-uri', 'form-action',
      'frame-ancestors'
    ];

    for (const directive of sourceListDirectives) {
      const camelCase = directive.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const sources = (csp as any)[camelCase];
      
      if (sources && sources.length > 0) {
        directives.push(`${directive} ${sources.join(' ')}`);
      }
    }

    // Boolean directives
    if (csp.upgradeInsecureRequests) {
      directives.push('upgrade-insecure-requests');
    }

    if (csp.blockAllMixedContent) {
      directives.push('block-all-mixed-content');
    }

    // Require SRI for
    if (csp.requireSriFor && csp.requireSriFor.length > 0) {
      directives.push(`require-sri-for ${csp.requireSriFor.join(' ')}`);
    }

    // Report directives
    if (csp.reportUri) {
      directives.push(`report-uri ${csp.reportUri}`);
    }

    if (csp.reportTo) {
      directives.push(`report-to ${csp.reportTo}`);
    }

    return directives.join('; ');
  }

  /**
   * Build HSTS header
   */
  private buildHSTSHeader(hsts: HSTSConfig): string {
    let header = `max-age=${hsts.maxAge}`;
    
    if (hsts.includeSubDomains) {
      header += '; includeSubDomains';
    }
    
    if (hsts.preload) {
      header += '; preload';
    }
    
    return header;
  }

  /**
   * Build Permissions Policy header
   */
  private buildPermissionsPolicyHeader(policy: PermissionsPolicyConfig): string {
    const directives: string[] = [];
    
    for (const [feature, allowlist] of Object.entries(policy)) {
      if (allowlist && allowlist.length >= 0) {
        if (allowlist.length === 0) {
          directives.push(`${feature}=()`);
        } else {
          const origins = allowlist.map(origin => 
            origin === "'self'" ? 'self' : `"${origin}"`
          ).join(' ');
          directives.push(`${feature}=(${origins})`);
        }
      }
    }
    
    return directives.join(', ');
  }

  /**
   * Build Expect-CT header
   */
  private buildExpectCTHeader(expectCT: ExpectCTConfig): string {
    let header = `max-age=${expectCT.maxAge}`;
    
    if (expectCT.enforce) {
      header += ', enforce';
    }
    
    if (expectCT.reportUri) {
      header += `, report-uri="${expectCT.reportUri}"`;
    }
    
    return header;
  }

  /**
   * Check if path contains sensitive content
   */
  private isSensitivePath(path: string): boolean {
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

  /**
   * Generate Content Security Policy report endpoint
   */
  cspReportHandler() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const report = request.body as any;
      
      // Log CSP violation
      request.log.warn('CSP Violation Report', {
        cspReport: report,
        userAgent: request.headers['user-agent'],
        ip: request.ip,
        timestamp: new Date().toISOString()
      });

      // Store report for analysis (implement as needed)
      // await this.storeCSPReport(report);

      return reply.status(204).send();
    };
  }

  /**
   * Validate security headers configuration
   */
  validateConfiguration(): { isValid: boolean; warnings: string[]; errors: string[] } {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check CSP configuration
    if (this.options.contentSecurityPolicy) {
      const csp = this.options.contentSecurityPolicy;
      
      // Check for unsafe directives
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

    // Check HSTS configuration
    if (this.options.strictTransportSecurity) {
      const hsts = this.options.strictTransportSecurity;
      
      if (hsts.maxAge < 31536000) { // 1 year
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

  /**
   * Generate security.txt file content
   */
  generateSecurityTxt(): string {
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

// Export singleton instance with production-ready defaults
export const securityHeaders = new SecurityHeaders({
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