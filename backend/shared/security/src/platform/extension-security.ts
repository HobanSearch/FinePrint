/**
 * Browser Extension Security Implementation 
 * Content script isolation, secure communication, minimal permissions, manifest security
 */

import * as crypto from 'crypto';

export interface ExtensionSecurityConfig {
  permissions: {
    minimal: boolean;
    requestedPermissions: string[];
    optionalPermissions: string[];
    hostPermissions: string[];
  };
  contentSecurity: {
    isolatedWorlds: boolean;
    sandboxing: boolean;
    cspEnabled: boolean;
    strictMode: boolean;
  };
  communication: {
    encryptMessages: boolean;
    validateOrigin: boolean;
    rateLimit: boolean;
    messageTimeout: number;
  };
  storage: {
    encrypted: boolean;
    localOnly: boolean;
    syncEnabled: boolean;
    quotaManagement: boolean;
  };
  webRequest: {
    filteringEnabled: boolean;
    blockMalicious: boolean;
    validateCertificates: boolean;
    headerSecurity: boolean;
  };
}

export interface ExtensionManifest {
  manifest_version: 3;
  name: string;
  version: string;
  description: string;
  permissions: string[];
  optional_permissions?: string[];
  host_permissions?: string[];
  content_security_policy?: {
    extension_pages: string;
    sandbox?: string;
  };
  background?: {
    service_worker: string;
    type?: 'module';
  };
  content_scripts?: ContentScript[];
  web_accessible_resources?: WebAccessibleResource[];
  externally_connectable?: {
    matches: string[];
    ids?: string[];
  };
}

export interface ContentScript {
  matches: string[];
  js: string[];
  css?: string[];
  run_at: 'document_start' | 'document_end' | 'document_idle';
  all_frames?: boolean;
  world?: 'ISOLATED' | 'MAIN';
}

export interface WebAccessibleResource {
  resources: string[];
  matches: string[];
  extension_ids?: string[];
}

export interface SecureMessage {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
  signature: string;
  nonce: string;
  origin?: string;
}

export interface ExtensionSecurityMetrics {
  messagesProcessed: number;
  messagesBlocked: number;
  permissionRequests: number;
  securityViolations: number;
  maliciousSitesBlocked: number;
  contentScriptInjections: number;
}

export class ExtensionSecurityService {
  private config: ExtensionSecurityConfig;
  private messageQueue: Map<string, SecureMessage>;
  private rateLimiters: Map<string, { count: number; resetTime: number }>;
  private securityKey: string;
  private metrics: ExtensionSecurityMetrics;

  constructor(config: ExtensionSecurityConfig) {
    this.config = config;
    this.messageQueue = new Map();
    this.rateLimiters = new Map();
    this.securityKey = this.generateSecurityKey();
    this.metrics = {
      messagesProcessed: 0,
      messagesBlocked: 0,
      permissionRequests: 0,
      securityViolations: 0,
      maliciousSitesBlocked: 0,
      contentScriptInjections: 0
    };

    this.initializeSecurity();
  }

  /**
   * Generate secure extension manifest
   */
  generateSecureManifest(baseManifest: Partial<ExtensionManifest>): ExtensionManifest {
    const manifest: ExtensionManifest = {
      manifest_version: 3,
      name: baseManifest.name || 'Fine Print AI',
      version: baseManifest.version || '1.0.0',
      description: baseManifest.description || 'AI-powered legal document analysis',
      permissions: this.getMinimalPermissions(),
      ...baseManifest
    };

    // Add security-focused CSP
    manifest.content_security_policy = {
      extension_pages: this.generateStrictCSP(),
      sandbox: "sandbox allow-scripts allow-forms allow-popups allow-modals; script-src 'self' 'unsafe-inline' 'unsafe-eval'; child-src 'self';"
    };

    // Restrict externally connectable
    manifest.externally_connectable = {
      matches: ['https://*.fineprintai.com/*'],
      ids: [] // No other extensions
    };

    // Secure content scripts
    if (manifest.content_scripts) {
      manifest.content_scripts = manifest.content_scripts.map(script => ({
        ...script,
        world: 'ISOLATED',
        run_at: 'document_idle'
      }));
    }

    // Minimal web accessible resources
    manifest.web_accessible_resources = manifest.web_accessible_resources || [{
      resources: ['icons/*', 'popup.html'],
      matches: ['<all_urls>']
    }];

    return manifest;
  }

  /**
   * Secure message passing between contexts
   */
  async sendSecureMessage(
    target: 'background' | 'content' | 'popup',
    type: string,
    payload: any,
    origin?: string
  ): Promise<any> {
    try {
      // Validate origin if provided
      if (origin && !this.validateOrigin(origin)) {
        throw new Error('Invalid message origin');
      }

      // Check rate limiting
      if (this.config.communication.rateLimit) {
        const rateLimitKey = `${target}:${type}`;
        if (!this.checkRateLimit(rateLimitKey)) {
          this.metrics.messagesBlocked++;
          throw new Error('Rate limit exceeded');
        }
      }

      // Create secure message
      const message: SecureMessage = {
        id: crypto.randomUUID(),
        type,
        payload: this.config.communication.encryptMessages ? 
          await this.encryptPayload(payload) : payload,
        timestamp: Date.now(),
        signature: '',
        nonce: crypto.randomBytes(16).toString('hex'),
        origin
      };

      // Sign message
      message.signature = this.signMessage(message);

      // Send message with timeout
      const response = await this.sendMessageWithTimeout(target, message);
      
      this.metrics.messagesProcessed++;
      return response;
    } catch (error) {
      this.metrics.messagesBlocked++;
      throw error;
    }
  }

  /**
   * Validate and process incoming messages
   */
  async processIncomingMessage(message: any, sender: any): Promise<any> {
    try {
      // Validate message structure
      if (!this.validateMessageStructure(message)) {
        this.metrics.securityViolations++;
        throw new Error('Invalid message structure');
      }

      // Verify message signature
      if (!this.verifyMessageSignature(message)) {
        this.metrics.securityViolations++;
        throw new Error('Invalid message signature');
      }

      // Check message age
      if (Date.now() - message.timestamp > this.config.communication.messageTimeout) {
        this.metrics.messagesBlocked++;
        throw new Error('Message expired');
      }

      // Validate sender origin
      if (this.config.communication.validateOrigin && !this.validateSender(sender)) {
        this.metrics.securityViolations++;
        throw new Error('Invalid sender origin');
      }

      // Decrypt payload if encrypted
      let payload = message.payload;
      if (this.config.communication.encryptMessages) {
        payload = await this.decryptPayload(message.payload);
      }

      this.metrics.messagesProcessed++;
      return payload;
    } catch (error) {
      this.metrics.messagesBlocked++;
      throw error;
    }
  }

  /**
   * Secure storage operations
   */
  async storeSecurely(key: string, value: any, options: {
    sync?: boolean;
    encrypted?: boolean;
  } = {}): Promise<void> {
    try {
      let finalValue = value;

      // Encrypt if required
      if (options.encrypted || this.config.storage.encrypted) {
        finalValue = await this.encryptStorageValue(value);
      }

      // Choose storage type
      const storage = options.sync && this.config.storage.syncEnabled ? 
        'sync' : 'local';

      // Store with quota management
      if (this.config.storage.quotaManagement) {
        await this.checkStorageQuota(key, finalValue);
      }

      await this.storeValue(storage, key, finalValue);
    } catch (error) {
      throw new Error(`Secure storage failed: ${error.message}`);
    }
  }

  /**
   * Secure retrieval from storage
   */
  async retrieveSecurely(key: string, options: {
    sync?: boolean;
    encrypted?: boolean;
  } = {}): Promise<any> {
    try {
      const storage = options.sync && this.config.storage.syncEnabled ? 
        'sync' : 'local';

      const value = await this.retrieveValue(storage, key);
      if (!value) return null;

      // Decrypt if encrypted
      if (options.encrypted || this.config.storage.encrypted) {
        return await this.decryptStorageValue(value);
      }

      return value;
    } catch (error) {
      throw new Error(`Secure retrieval failed: ${error.message}`);
    }
  }

  /**
   * Content script security injection
   */
  async injectSecureContentScript(
    tabId: number,
    scriptConfig: {
      file?: string;
      code?: string;
      allFrames?: boolean;
    }
  ): Promise<void> {
    try {
      // Validate tab permissions
      if (!await this.hasTabPermission(tabId)) {
        throw new Error('No permission for tab');
      }

      // Check if site is malicious
      const tabInfo = await this.getTabInfo(tabId);
      if (await this.isMaliciousSite(tabInfo.url)) {
        this.metrics.maliciousSitesBlocked++;
        throw new Error('Malicious site blocked');
      }

      // Inject with isolation
      const injectionDetails = {
        ...scriptConfig,
        world: this.config.contentSecurity.isolatedWorlds ? 'ISOLATED' : 'MAIN'
      };

      await this.injectScript(tabId, injectionDetails);
      this.metrics.contentScriptInjections++;
    } catch (error) {
      throw new Error(`Content script injection failed: ${error.message}`);
    }
  }

  /**
   * Web request filtering and security
   */
  async filterWebRequest(
    request: {
      url: string;
      method: string;
      headers: Record<string, string>;
      type: string;
    }
  ): Promise<{
    action: 'allow' | 'block' | 'redirect';
    reason?: string;
    redirectUrl?: string;
  }> {
    try {
      // Check if filtering is enabled
      if (!this.config.webRequest.filteringEnabled) {
        return { action: 'allow' };
      }

      // Block malicious URLs
      if (this.config.webRequest.blockMalicious && await this.isMaliciousUrl(request.url)) {
        this.metrics.maliciousSitesBlocked++;
        return { action: 'block', reason: 'Malicious URL detected' };
      }

      // Validate certificates for HTTPS
      if (this.config.webRequest.validateCertificates && request.url.startsWith('https://')) {
        const certValid = await this.validateCertificate(request.url);
        if (!certValid) {
          return { action: 'block', reason: 'Invalid certificate' };
        }
      }

      // Add security headers
      if (this.config.webRequest.headerSecurity) {
        await this.addSecurityHeaders(request);
      }

      return { action: 'allow' };
    } catch (error) {
      return { action: 'block', reason: `Security check failed: ${error.message}` };
    }
  }

  /**
   * Permission management and validation
   */
  async requestPermission(permission: string): Promise<boolean> {
    try {
      // Check if permission is in optional list
      if (!this.config.permissions.optionalPermissions.includes(permission)) {
        this.metrics.securityViolations++;
        throw new Error('Permission not in optional list');
      }

      // Request permission with user consent
      const granted = await this.requestUserPermission(permission);
      
      this.metrics.permissionRequests++;
      return granted;
    } catch (error) {
      return false;
    }
  }

  /**
   * Security monitoring and metrics
   */
  getSecurityMetrics(): ExtensionSecurityMetrics {
    return { ...this.metrics };
  }

  /**
   * Security audit of extension state
   */
  async performSecurityAudit(): Promise<{
    score: number;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check manifest security
    const manifestIssues = await this.auditManifest();
    issues.push(...manifestIssues);
    score -= manifestIssues.length * 10;

    // Check permission usage
    const permissionIssues = await this.auditPermissions();
    issues.push(...permissionIssues);
    score -= permissionIssues.length * 15;

    // Check content script security
    const contentScriptIssues = await this.auditContentScripts();
    issues.push(...contentScriptIssues);
    score -= contentScriptIssues.length * 20;

    // Generate recommendations
    if (issues.length > 0) {
      recommendations.push('Review and fix identified security issues');
      recommendations.push('Implement additional security measures');
      recommendations.push('Regular security audits');
    }

    return {
      score: Math.max(score, 0),
      issues,
      recommendations
    };
  }

  // Private helper methods

  private initializeSecurity(): void {
    // Set up security event listeners
    this.setupSecurityListeners();
    
    // Start periodic security checks
    setInterval(() => this.performPeriodicSecurityCheck(), 5 * 60 * 1000); // 5 minutes
  }

  private generateSecurityKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private getMinimalPermissions(): string[] {
    if (!this.config.permissions.minimal) {
      return this.config.permissions.requestedPermissions;
    }

    // Return only essential permissions
    const essential = ['storage', 'activeTab'];
    return this.config.permissions.requestedPermissions.filter(p => essential.includes(p));
  }

  private generateStrictCSP(): string {
    return "script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'none';";
  }

  private validateOrigin(origin: string): boolean {
    const allowedOrigins = [
      'https://fineprintai.com',
      'https://api.fineprintai.com',
      'chrome-extension://' + chrome.runtime.id
    ];
    
    return allowedOrigins.some(allowed => origin.startsWith(allowed));
  }

  private checkRateLimit(key: string): boolean {
    const now = Date.now();
    const limit = this.rateLimiters.get(key);
    
    if (!limit || now > limit.resetTime) {
      this.rateLimiters.set(key, { count: 1, resetTime: now + 60000 }); // 1 minute window
      return true;
    }
    
    if (limit.count >= 100) { // 100 messages per minute
      return false;
    }
    
    limit.count++;
    return true;
  }

  private async encryptPayload(payload: any): Promise<string> {
    const data = JSON.stringify(payload);
    const cipher = crypto.createCipher('aes-256-gcm', this.securityKey);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();
    return `${encrypted}:${tag.toString('hex')}`;
  }

  private async decryptPayload(encryptedPayload: string): Promise<any> {
    const [encrypted, tagHex] = encryptedPayload.split(':');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipher('aes-256-gcm', this.securityKey);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }

  private signMessage(message: Omit<SecureMessage, 'signature'>): string {
    const data = `${message.id}:${message.type}:${message.timestamp}:${message.nonce}`;
    return crypto.createHmac('sha256', this.securityKey).update(data).digest('hex');
  }

  private verifyMessageSignature(message: SecureMessage): boolean {
    const expectedSignature = this.signMessage({
      id: message.id,
      type: message.type,
      payload: message.payload,
      timestamp: message.timestamp,
      nonce: message.nonce,
      origin: message.origin
    });
    
    return crypto.timingSafeEqual(
      Buffer.from(message.signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  private validateMessageStructure(message: any): boolean {
    return message &&
           typeof message.id === 'string' &&
           typeof message.type === 'string' &&
           typeof message.timestamp === 'number' &&
           typeof message.signature === 'string' &&
           typeof message.nonce === 'string';
  }

  private validateSender(sender: any): boolean {
    // Validate sender is from allowed origins
    if (sender.origin && !this.validateOrigin(sender.origin)) {
      return false;
    }
    
    // Validate extension context
    if (sender.id && sender.id !== chrome.runtime.id) {
      return false;
    }
    
    return true;
  }

  private async sendMessageWithTimeout(target: string, message: SecureMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Message timeout'));
      }, this.config.communication.messageTimeout);

      // Send message based on target
      if (target === 'background') {
        chrome.runtime.sendMessage(message, (response) => {
          clearTimeout(timeout);
          resolve(response);
        });
      } else if (target === 'content') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id!, message, (response) => {
              clearTimeout(timeout);
              resolve(response);
            });
          } else {
            clearTimeout(timeout);
            reject(new Error('No active tab'));
          }
        });
      }
    });
  }

  // Additional placeholder methods (would be implemented with Chrome API)
  private async encryptStorageValue(value: any): Promise<string> {
    return this.encryptPayload(value);
  }

  private async decryptStorageValue(value: string): Promise<any> {
    return this.decryptPayload(value);
  }

  private async checkStorageQuota(key: string, value: any): Promise<void> {
    // Check if storage quota would be exceeded
  }

  private async storeValue(storage: string, key: string, value: any): Promise<void> {
    // Chrome storage API implementation
  }

  private async retrieveValue(storage: string, key: string): Promise<any> {
    // Chrome storage API implementation
    return null;
  }

  private async hasTabPermission(tabId: number): Promise<boolean> {
    // Check if extension has permission for tab
    return true;
  }

  private async getTabInfo(tabId: number): Promise<{ url: string }> {
    // Get tab information
    return { url: '' };
  }

  private async isMaliciousSite(url: string): Promise<boolean> {
    // Check URL against threat intelligence
    return false;
  }

  private async injectScript(tabId: number, details: any): Promise<void> {
    // Chrome tabs API script injection
  }

  private async isMaliciousUrl(url: string): Promise<boolean> {
    // URL reputation check
    return false;
  }

  private async validateCertificate(url: string): Promise<boolean> {
    // Certificate validation
    return true;
  }

  private async addSecurityHeaders(request: any): Promise<void> {
    // Add security headers to request
  }

  private async requestUserPermission(permission: string): Promise<boolean> {
    // Chrome permissions API
    return false;
  }

  private setupSecurityListeners(): void {
    // Set up Chrome API event listeners
  }

  private async performPeriodicSecurityCheck(): Promise<void> {
    // Periodic security validation
  }

  private async auditManifest(): Promise<string[]> {
    // Audit manifest security
    return [];
  }

  private async auditPermissions(): Promise<string[]> {
    // Audit permission usage
    return [];
  }

  private async auditContentScripts(): Promise<string[]> {
    // Audit content script security
    return [];
  }
}

export const createExtensionSecurity = (config: ExtensionSecurityConfig) => {
  return new ExtensionSecurityService(config);
};

// Default extension security configuration
export const defaultExtensionSecurityConfig: ExtensionSecurityConfig = {
  permissions: {
    minimal: true,
    requestedPermissions: ['storage', 'activeTab'],
    optionalPermissions: ['tabs', 'background'],
    hostPermissions: ['https://*.fineprintai.com/*']
  },
  contentSecurity: {
    isolatedWorlds: true,
    sandboxing: true,
    cspEnabled: true,
    strictMode: true
  },
  communication: {
    encryptMessages: true,
    validateOrigin: true,
    rateLimit: true,
    messageTimeout: 30000
  },
  storage: {
    encrypted: true,
    localOnly: false,
    syncEnabled: true,
    quotaManagement: true
  },
  webRequest: {
    filteringEnabled: true,
    blockMalicious: true,
    validateCertificates: true,
    headerSecurity: true
  }
};