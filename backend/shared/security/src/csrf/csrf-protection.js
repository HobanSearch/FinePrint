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
exports.csrfProtection = exports.CSRFProtection = void 0;
const crypto = __importStar(require("crypto"));
const index_1 = require("../index");
class CSRFProtection {
    options;
    secret;
    constructor(options = {}) {
        this.options = {
            cookieName: options.cookieName || 'csrf-token',
            headerName: options.headerName || 'x-csrf-token',
            secret: options.secret || process.env.CSRF_SECRET || index_1.SecurityUtils.generateSecureRandom(32),
            expiration: options.expiration || 60 * 60 * 1000,
            sameSite: options.sameSite || 'strict',
            secure: options.secure ?? true,
            httpOnly: options.httpOnly ?? false,
            exemptMethods: options.exemptMethods || ['GET', 'HEAD', 'OPTIONS'],
            exemptPaths: options.exemptPaths || ['/health', '/metrics', '/api/auth/csrf-token']
        };
        this.secret = Buffer.from(this.options.secret, 'hex');
    }
    generateToken(sessionId) {
        const timestamp = Date.now();
        const randomBytes = crypto.randomBytes(16);
        const payload = `${timestamp}:${randomBytes.toString('hex')}:${sessionId || ''}`;
        const signature = crypto
            .createHmac('sha256', this.secret)
            .update(payload)
            .digest('hex');
        const token = Buffer.from(`${payload}:${signature}`).toString('base64');
        return token;
    }
    verifyToken(token, sessionId) {
        try {
            const decoded = Buffer.from(token, 'base64').toString('utf-8');
            const parts = decoded.split(':');
            if (parts.length !== 4) {
                return false;
            }
            const [timestampStr, randomStr, tokenSessionId, signature] = parts;
            const timestamp = parseInt(timestampStr, 10);
            if (Date.now() - timestamp > this.options.expiration) {
                return false;
            }
            if (sessionId && tokenSessionId !== sessionId) {
                return false;
            }
            const payload = `${timestampStr}:${randomStr}:${tokenSessionId}`;
            const expectedSignature = crypto
                .createHmac('sha256', this.secret)
                .update(payload)
                .digest('hex');
            return index_1.SecurityUtils.secureCompare(signature, expectedSignature);
        }
        catch (error) {
            return false;
        }
    }
    setTokenMiddleware() {
        return async (request, reply) => {
            if (this.options.exemptMethods.includes(request.method)) {
                return;
            }
            if (this.options.exemptPaths.some(path => request.url.startsWith(path))) {
                return;
            }
            const sessionId = this.extractSessionId(request);
            const token = this.generateToken(sessionId);
            reply.setCookie(this.options.cookieName, token, {
                maxAge: this.options.expiration,
                sameSite: this.options.sameSite,
                secure: this.options.secure,
                httpOnly: this.options.httpOnly,
                path: '/'
            });
            reply.header('X-CSRF-Token', token);
        };
    }
    verifyTokenMiddleware() {
        return async (request, reply) => {
            if (this.options.exemptMethods.includes(request.method)) {
                return;
            }
            if (this.options.exemptPaths.some(path => request.url.startsWith(path))) {
                return;
            }
            const cookieToken = request.cookies[this.options.cookieName];
            const headerToken = request.headers[this.options.headerName];
            if (!cookieToken || !headerToken) {
                throw new index_1.CSRFError('CSRF token missing');
            }
            if (!index_1.SecurityUtils.secureCompare(cookieToken, headerToken)) {
                throw new index_1.CSRFError('CSRF token mismatch');
            }
            const sessionId = this.extractSessionId(request);
            if (!this.verifyToken(cookieToken, sessionId)) {
                throw new index_1.CSRFError('CSRF token invalid or expired');
            }
            if (!this.verifyOrigin(request)) {
                throw new index_1.CSRFError('Invalid request origin');
            }
        };
    }
    getTokenHandler() {
        return async (request, reply) => {
            const sessionId = this.extractSessionId(request);
            const token = this.generateToken(sessionId);
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
    extractSessionId(request) {
        const authHeader = request.headers.authorization;
        if (authHeader) {
            try {
                const token = authHeader.split(' ')[1];
                const jwt = require('jsonwebtoken');
                const decoded = jwt.decode(token);
                return decoded?.sub || '';
            }
            catch {
            }
        }
        const ip = index_1.SecurityUtils.extractClientIP(request);
        const userAgent = request.headers['user-agent'] || '';
        return crypto.createHash('sha256').update(`${ip}:${userAgent}`).digest('hex');
    }
    verifyOrigin(request) {
        const origin = request.headers.origin;
        const referer = request.headers.referer;
        const host = request.headers.host;
        if (origin) {
            try {
                const originUrl = new URL(origin);
                return originUrl.host === host;
            }
            catch {
                return false;
            }
        }
        if (referer) {
            try {
                const refererUrl = new URL(referer);
                return refererUrl.host === host;
            }
            catch {
                return false;
            }
        }
        return false;
    }
    generateMetaTag(token) {
        return `<meta name="csrf-token" content="${token}">`;
    }
    generateClientScript() {
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
    validateConfiguration() {
        const errors = [];
        if (!this.options.secret || this.options.secret.length < 32) {
            errors.push('CSRF secret must be at least 32 characters long');
        }
        if (this.options.expiration < 60000) {
            errors.push('CSRF token expiration should be at least 1 minute');
        }
        if (this.options.expiration > 24 * 60 * 60 * 1000) {
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
exports.CSRFProtection = CSRFProtection;
exports.csrfProtection = new CSRFProtection();
//# sourceMappingURL=csrf-protection.js.map