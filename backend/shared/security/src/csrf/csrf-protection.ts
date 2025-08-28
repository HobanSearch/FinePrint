// CSRF Protection Implementation
// Double-submit cookie pattern with additional security measures

import * as crypto from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { CSRFError, SecurityUtils } from '../index';

export interface CSRFOptions {
  cookieName?: string;
  headerName?: string;
  secret?: string;
  expiration?: number; // in milliseconds
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

export class CSRFProtection {
  private readonly options: Required<CSRFOptions>;
  private readonly secret: Buffer;

  constructor(options: CSRFOptions = {}) {
    this.options = {
      cookieName: options.cookieName || 'csrf-token',
      headerName: options.headerName || 'x-csrf-token',
      secret: options.secret || process.env.CSRF_SECRET || SecurityUtils.generateSecureRandom(32),
      expiration: options.expiration || 60 * 60 * 1000, // 1 hour
      sameSite: options.sameSite || 'strict',
      secure: options.secure ?? true,
      httpOnly: options.httpOnly ?? false, // CSRF tokens need to be accessible by JS
      exemptMethods: options.exemptMethods || ['GET', 'HEAD', 'OPTIONS'],
      exemptPaths: options.exemptPaths || ['/health', '/metrics', '/api/auth/csrf-token']
    };

    this.secret = Buffer.from(this.options.secret, 'hex');
  }

  /**
   * Generate CSRF token
   */
  generateToken(sessionId?: string): string {
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(16);
    const payload = `${timestamp}:${randomBytes.toString('hex')}:${sessionId || ''}`;
    
    // Create HMAC signature
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(payload)
      .digest('hex');

    // Combine payload and signature
    const token = Buffer.from(`${payload}:${signature}`).toString('base64');
    
    return token;
  }

  /**
   * Verify CSRF token
   */
  verifyToken(token: string, sessionId?: string): boolean {
    try {
      // Decode token
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const parts = decoded.split(':');
      
      if (parts.length !== 4) {
        return false;
      }

      const [timestampStr, randomStr, tokenSessionId, signature] = parts;
      const timestamp = parseInt(timestampStr, 10);
      
      // Check expiration
      if (Date.now() - timestamp > this.options.expiration) {
        return false;
      }

      // Check session ID match (if provided)
      if (sessionId && tokenSessionId !== sessionId) {
        return false;
      }

      // Verify signature
      const payload = `${timestampStr}:${randomStr}:${tokenSessionId}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.secret)
        .update(payload)
        .digest('hex');

      return SecurityUtils.secureCompare(signature, expectedSignature);
    } catch (error) {
      return false;
    }
  }

  /**
   * Middleware to set CSRF token in cookie
   */
  setTokenMiddleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      // Skip if method is exempt
      if (this.options.exemptMethods.includes(request.method)) {
        return;
      }

      // Skip if path is exempt
      if (this.options.exemptPaths.some(path => request.url.startsWith(path))) {
        return;
      }

      // Get or create session ID
      const sessionId = this.extractSessionId(request);
      
      // Generate new token
      const token = this.generateToken(sessionId);
      
      // Set cookie
      reply.setCookie(this.options.cookieName, token, {
        maxAge: this.options.expiration,
        sameSite: this.options.sameSite,
        secure: this.options.secure,
        httpOnly: this.options.httpOnly,
        path: '/'
      });

      // Add token to response headers for SPA usage
      reply.header('X-CSRF-Token', token);
    };
  }

  /**
   * Middleware to verify CSRF token
   */
  verifyTokenMiddleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      // Skip GET, HEAD, OPTIONS requests
      if (this.options.exemptMethods.includes(request.method)) {
        return;
      }

      // Skip exempt paths
      if (this.options.exemptPaths.some(path => request.url.startsWith(path))) {
        return;
      }

      // Extract tokens from cookie and header
      const cookieToken = request.cookies[this.options.cookieName];
      const headerToken = request.headers[this.options.headerName] as string;

      if (!cookieToken || !headerToken) {
        throw new CSRFError('CSRF token missing');
      }

      // Verify both tokens match (double-submit pattern)
      if (!SecurityUtils.secureCompare(cookieToken, headerToken)) {
        throw new CSRFError('CSRF token mismatch');
      }

      // Get session ID
      const sessionId = this.extractSessionId(request);

      // Verify token validity
      if (!this.verifyToken(cookieToken, sessionId)) {
        throw new CSRFError('CSRF token invalid or expired');
      }

      // Additional origin verification
      if (!this.verifyOrigin(request)) {
        throw new CSRFError('Invalid request origin');
      }
    };
  }

  /**
   * Route handler to provide CSRF token to clients
   */
  getTokenHandler() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const sessionId = this.extractSessionId(request);
      const token = this.generateToken(sessionId);
      
      // Set cookie
      reply.setCookie(this.options.cookieName, token, {
        maxAge: this.options.expiration,
        sameSite: this.options.sameSite,
        secure: this.options.secure,
        httpOnly: this.options.httpOnly,
        path: '/'
      });

      return reply.send({
        success: true,
        data: {
          csrfToken: token,
          expiresIn: this.options.expiration
        }
      });
    };
  }

  /**
   * Extract session ID from request
   */
  private extractSessionId(request: FastifyRequest): string {
    // Try to get session ID from JWT token
    const authHeader = request.headers.authorization;
    if (authHeader) {
      try {
        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const decoded = jwt.decode(token) as any;
        return decoded?.sub || '';
      } catch {
        // Ignore JWT decode errors
      }
    }

    // Fallback to IP + User-Agent hash
    const ip = SecurityUtils.extractClientIP(request);
    const userAgent = request.headers['user-agent'] || '';
    return crypto.createHash('sha256').update(`${ip}:${userAgent}`).digest('hex');
  }

  /**
   * Verify request origin
   */
  private verifyOrigin(request: FastifyRequest): boolean {
    const origin = request.headers.origin;
    const referer = request.headers.referer;
    const host = request.headers.host;

    // Check if origin matches host
    if (origin) {
      try {
        const originUrl = new URL(origin);
        return originUrl.host === host;
      } catch {
        return false;
      }
    }

    // Check if referer matches host
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        return refererUrl.host === host;
      } catch {
        return false;
      }
    }

    // No origin or referer - potentially suspicious
    return false;
  }

  /**
   * Generate anti-CSRF meta tag for HTML pages
   */
  generateMetaTag(token: string): string {
    return `<meta name="csrf-token" content="${token}">`;
  }

  /**
   * JavaScript code to include CSRF token in AJAX requests
   */
  generateClientScript(): string {
    return `
// CSRF Protection Client Script
(function() {
  var csrfToken = null;
  
  // Get CSRF token from meta tag
  var metaTag = document.querySelector('meta[name="csrf-token"]');
  if (metaTag) {
    csrfToken = metaTag.getAttribute('content');
  }
  
  // Get CSRF token from cookie
  if (!csrfToken) {
    var cookies = document.cookie.split(';');
    for (var i = 0; i < cookies.length; i++) {
      var cookie = cookies[i].trim();
      if (cookie.indexOf('${this.options.cookieName}=') === 0) {
        csrfToken = cookie.substring('${this.options.cookieName}='.length);
        break;
      }
    }
  }
  
  // Add CSRF token to XMLHttpRequest
  if (XMLHttpRequest && csrfToken) {
    var originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
      this._method = method;
      return originalOpen.apply(this, arguments);
    };
    
    var originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(data) {
      if (this._method && !['GET', 'HEAD', 'OPTIONS'].includes(this._method.toUpperCase())) {
        this.setRequestHeader('${this.options.headerName}', csrfToken);
      }
      return originalSend.apply(this, arguments);
    };
  }
  
  // Add CSRF token to fetch requests
  if (window.fetch && csrfToken) {
    var originalFetch = window.fetch;
    window.fetch = function(input, init) {
      init = init || {};
      init.headers = init.headers || {};
      
      var method = init.method || 'GET';
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
        if (init.headers instanceof Headers) {
          init.headers.set('${this.options.headerName}', csrfToken);
        } else {
          init.headers['${this.options.headerName}'] = csrfToken;
        }
      }
      
      return originalFetch.apply(this, arguments);
    };
  }
  
  // Expose function to get current CSRF token
  window.getCSRFToken = function() {
    return csrfToken;
  };
  
  // Function to refresh CSRF token
  window.refreshCSRFToken = function() {
    return fetch('/api/auth/csrf-token', {
      method: 'GET',
      credentials: 'include'
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      if (data.success) {
        csrfToken = data.data.csrfToken;
        // Update meta tag if exists
        if (metaTag) {
          metaTag.setAttribute('content', csrfToken);
        }
        return csrfToken;
      }
      throw new Error('Failed to refresh CSRF token');
    });
  };
})();
    `.trim();
  }

  /**
   * Validate CSRF configuration
   */
  validateConfiguration(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.options.secret || this.options.secret.length < 32) {
      errors.push('CSRF secret must be at least 32 characters long');
    }

    if (this.options.expiration < 60000) { // 1 minute
      errors.push('CSRF token expiration should be at least 1 minute');
    }

    if (this.options.expiration > 24 * 60 * 60 * 1000) { // 24 hours
      errors.push('CSRF token expiration should not exceed 24 hours');
    }

    if (this.options.secure && this.options.sameSite === 'none') {
      errors.push('SameSite=None requires Secure=true');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Export singleton instance
export const csrfProtection = new CSRFProtection();