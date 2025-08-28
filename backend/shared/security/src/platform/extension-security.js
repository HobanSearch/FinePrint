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
exports.defaultExtensionSecurityConfig = exports.createExtensionSecurity = exports.ExtensionSecurityService = void 0;
const crypto = __importStar(require("crypto"));
class ExtensionSecurityService {
    config;
    messageQueue;
    rateLimiters;
    securityKey;
    metrics;
    constructor(config) {
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
    generateSecureManifest(baseManifest) {
        const manifest = {
            manifest_version: 3,
            name: baseManifest.name || 'Fine Print AI',
            version: baseManifest.version || '1.0.0',
            description: baseManifest.description || 'AI-powered legal document analysis',
            permissions: this.getMinimalPermissions(),
            ...baseManifest
        };
        manifest.content_security_policy = {
            extension_pages: this.generateStrictCSP(),
            sandbox: "sandbox allow-scripts allow-forms allow-popups allow-modals; script-src 'self' 'unsafe-inline' 'unsafe-eval'; child-src 'self';"
        };
        manifest.externally_connectable = {
            matches: ['https://*.fineprintai.com/*'],
            ids: []
        };
        if (manifest.content_scripts) {
            manifest.content_scripts = manifest.content_scripts.map(script => ({
                ...script,
                world: 'ISOLATED',
                run_at: 'document_idle'
            }));
        }
        manifest.web_accessible_resources = manifest.web_accessible_resources || [{
                resources: ['icons/*', 'popup.html'],
                matches: ['<all_urls>']
            }];
        return manifest;
    }
    async sendSecureMessage(target, type, payload, origin) {
        try {
            if (origin && !this.validateOrigin(origin)) {
                throw new Error('Invalid message origin');
            }
            if (this.config.communication.rateLimit) {
                const rateLimitKey = `${target}:${type}`;
                if (!this.checkRateLimit(rateLimitKey)) {
                    this.metrics.messagesBlocked++;
                    throw new Error('Rate limit exceeded');
                }
            }
            const message = {
                id: crypto.randomUUID(),
                type,
                payload: this.config.communication.encryptMessages ?
                    await this.encryptPayload(payload) : payload,
                timestamp: Date.now(),
                signature: '',
                nonce: crypto.randomBytes(16).toString('hex'),
                origin
            };
            message.signature = this.signMessage(message);
            const response = await this.sendMessageWithTimeout(target, message);
            this.metrics.messagesProcessed++;
            return response;
        }
        catch (error) {
            this.metrics.messagesBlocked++;
            throw error;
        }
    }
    async processIncomingMessage(message, sender) {
        try {
            if (!this.validateMessageStructure(message)) {
                this.metrics.securityViolations++;
                throw new Error('Invalid message structure');
            }
            if (!this.verifyMessageSignature(message)) {
                this.metrics.securityViolations++;
                throw new Error('Invalid message signature');
            }
            if (Date.now() - message.timestamp > this.config.communication.messageTimeout) {
                this.metrics.messagesBlocked++;
                throw new Error('Message expired');
            }
            if (this.config.communication.validateOrigin && !this.validateSender(sender)) {
                this.metrics.securityViolations++;
                throw new Error('Invalid sender origin');
            }
            let payload = message.payload;
            if (this.config.communication.encryptMessages) {
                payload = await this.decryptPayload(message.payload);
            }
            this.metrics.messagesProcessed++;
            return payload;
        }
        catch (error) {
            this.metrics.messagesBlocked++;
            throw error;
        }
    }
    async storeSecurely(key, value, options = {}) {
        try {
            let finalValue = value;
            if (options.encrypted || this.config.storage.encrypted) {
                finalValue = await this.encryptStorageValue(value);
            }
            const storage = options.sync && this.config.storage.syncEnabled ?
                'sync' : 'local';
            if (this.config.storage.quotaManagement) {
                await this.checkStorageQuota(key, finalValue);
            }
            await this.storeValue(storage, key, finalValue);
        }
        catch (error) {
            throw new Error(`Secure storage failed: ${error.message}`);
        }
    }
    async retrieveSecurely(key, options = {}) {
        try {
            const storage = options.sync && this.config.storage.syncEnabled ?
                'sync' : 'local';
            const value = await this.retrieveValue(storage, key);
            if (!value)
                return null;
            if (options.encrypted || this.config.storage.encrypted) {
                return await this.decryptStorageValue(value);
            }
            return value;
        }
        catch (error) {
            throw new Error(`Secure retrieval failed: ${error.message}`);
        }
    }
    async injectSecureContentScript(tabId, scriptConfig) {
        try {
            if (!await this.hasTabPermission(tabId)) {
                throw new Error('No permission for tab');
            }
            const tabInfo = await this.getTabInfo(tabId);
            if (await this.isMaliciousSite(tabInfo.url)) {
                this.metrics.maliciousSitesBlocked++;
                throw new Error('Malicious site blocked');
            }
            const injectionDetails = {
                ...scriptConfig,
                world: this.config.contentSecurity.isolatedWorlds ? 'ISOLATED' : 'MAIN'
            };
            await this.injectScript(tabId, injectionDetails);
            this.metrics.contentScriptInjections++;
        }
        catch (error) {
            throw new Error(`Content script injection failed: ${error.message}`);
        }
    }
    async filterWebRequest(request) {
        try {
            if (!this.config.webRequest.filteringEnabled) {
                return { action: 'allow' };
            }
            if (this.config.webRequest.blockMalicious && await this.isMaliciousUrl(request.url)) {
                this.metrics.maliciousSitesBlocked++;
                return { action: 'block', reason: 'Malicious URL detected' };
            }
            if (this.config.webRequest.validateCertificates && request.url.startsWith('https://')) {
                const certValid = await this.validateCertificate(request.url);
                if (!certValid) {
                    return { action: 'block', reason: 'Invalid certificate' };
                }
            }
            if (this.config.webRequest.headerSecurity) {
                await this.addSecurityHeaders(request);
            }
            return { action: 'allow' };
        }
        catch (error) {
            return { action: 'block', reason: `Security check failed: ${error.message}` };
        }
    }
    async requestPermission(permission) {
        try {
            if (!this.config.permissions.optionalPermissions.includes(permission)) {
                this.metrics.securityViolations++;
                throw new Error('Permission not in optional list');
            }
            const granted = await this.requestUserPermission(permission);
            this.metrics.permissionRequests++;
            return granted;
        }
        catch (error) {
            return false;
        }
    }
    getSecurityMetrics() {
        return { ...this.metrics };
    }
    async performSecurityAudit() {
        const issues = [];
        const recommendations = [];
        let score = 100;
        const manifestIssues = await this.auditManifest();
        issues.push(...manifestIssues);
        score -= manifestIssues.length * 10;
        const permissionIssues = await this.auditPermissions();
        issues.push(...permissionIssues);
        score -= permissionIssues.length * 15;
        const contentScriptIssues = await this.auditContentScripts();
        issues.push(...contentScriptIssues);
        score -= contentScriptIssues.length * 20;
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
    initializeSecurity() {
        this.setupSecurityListeners();
        setInterval(() => this.performPeriodicSecurityCheck(), 5 * 60 * 1000);
    }
    generateSecurityKey() {
        return crypto.randomBytes(32).toString('hex');
    }
    getMinimalPermissions() {
        if (!this.config.permissions.minimal) {
            return this.config.permissions.requestedPermissions;
        }
        const essential = ['storage', 'activeTab'];
        return this.config.permissions.requestedPermissions.filter(p => essential.includes(p));
    }
    generateStrictCSP() {
        return "script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'none';";
    }
    validateOrigin(origin) {
        const allowedOrigins = [
            'https://fineprintai.com',
            'https://api.fineprintai.com',
            'chrome-extension://' + chrome.runtime.id
        ];
        return allowedOrigins.some(allowed => origin.startsWith(allowed));
    }
    checkRateLimit(key) {
        const now = Date.now();
        const limit = this.rateLimiters.get(key);
        if (!limit || now > limit.resetTime) {
            this.rateLimiters.set(key, { count: 1, resetTime: now + 60000 });
            return true;
        }
        if (limit.count >= 100) {
            return false;
        }
        limit.count++;
        return true;
    }
    async encryptPayload(payload) {
        const data = JSON.stringify(payload);
        const cipher = crypto.createCipher('aes-256-gcm', this.securityKey);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const tag = cipher.getAuthTag();
        return `${encrypted}:${tag.toString('hex')}`;
    }
    async decryptPayload(encryptedPayload) {
        const [encrypted, tagHex] = encryptedPayload.split(':');
        const tag = Buffer.from(tagHex, 'hex');
        const decipher = crypto.createDecipher('aes-256-gcm', this.securityKey);
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    }
    signMessage(message) {
        const data = `${message.id}:${message.type}:${message.timestamp}:${message.nonce}`;
        return crypto.createHmac('sha256', this.securityKey).update(data).digest('hex');
    }
    verifyMessageSignature(message) {
        const expectedSignature = this.signMessage({
            id: message.id,
            type: message.type,
            payload: message.payload,
            timestamp: message.timestamp,
            nonce: message.nonce,
            origin: message.origin
        });
        return crypto.timingSafeEqual(Buffer.from(message.signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
    }
    validateMessageStructure(message) {
        return message &&
            typeof message.id === 'string' &&
            typeof message.type === 'string' &&
            typeof message.timestamp === 'number' &&
            typeof message.signature === 'string' &&
            typeof message.nonce === 'string';
    }
    validateSender(sender) {
        if (sender.origin && !this.validateOrigin(sender.origin)) {
            return false;
        }
        if (sender.id && sender.id !== chrome.runtime.id) {
            return false;
        }
        return true;
    }
    async sendMessageWithTimeout(target, message) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Message timeout'));
            }, this.config.communication.messageTimeout);
            if (target === 'background') {
                chrome.runtime.sendMessage(message, (response) => {
                    clearTimeout(timeout);
                    resolve(response);
                });
            }
            else if (target === 'content') {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
                            clearTimeout(timeout);
                            resolve(response);
                        });
                    }
                    else {
                        clearTimeout(timeout);
                        reject(new Error('No active tab'));
                    }
                });
            }
        });
    }
    async encryptStorageValue(value) {
        return this.encryptPayload(value);
    }
    async decryptStorageValue(value) {
        return this.decryptPayload(value);
    }
    async checkStorageQuota(key, value) {
    }
    async storeValue(storage, key, value) {
    }
    async retrieveValue(storage, key) {
        return null;
    }
    async hasTabPermission(tabId) {
        return true;
    }
    async getTabInfo(tabId) {
        return { url: '' };
    }
    async isMaliciousSite(url) {
        return false;
    }
    async injectScript(tabId, details) {
    }
    async isMaliciousUrl(url) {
        return false;
    }
    async validateCertificate(url) {
        return true;
    }
    async addSecurityHeaders(request) {
    }
    async requestUserPermission(permission) {
        return false;
    }
    setupSecurityListeners() {
    }
    async performPeriodicSecurityCheck() {
    }
    async auditManifest() {
        return [];
    }
    async auditPermissions() {
        return [];
    }
    async auditContentScripts() {
        return [];
    }
}
exports.ExtensionSecurityService = ExtensionSecurityService;
const createExtensionSecurity = (config) => {
    return new ExtensionSecurityService(config);
};
exports.createExtensionSecurity = createExtensionSecurity;
exports.defaultExtensionSecurityConfig = {
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
//# sourceMappingURL=extension-security.js.map