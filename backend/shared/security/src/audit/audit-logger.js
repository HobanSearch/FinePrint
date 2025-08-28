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
exports.auditLogger = exports.AuditLogger = exports.ComplianceFlag = exports.AuditRiskLevel = void 0;
const crypto = __importStar(require("crypto"));
const index_1 = require("../index");
var AuditRiskLevel;
(function (AuditRiskLevel) {
    AuditRiskLevel["LOW"] = "low";
    AuditRiskLevel["MEDIUM"] = "medium";
    AuditRiskLevel["HIGH"] = "high";
    AuditRiskLevel["CRITICAL"] = "critical";
})(AuditRiskLevel || (exports.AuditRiskLevel = AuditRiskLevel = {}));
var ComplianceFlag;
(function (ComplianceFlag) {
    ComplianceFlag["GDPR"] = "gdpr";
    ComplianceFlag["CCPA"] = "ccpa";
    ComplianceFlag["SOX"] = "sox";
    ComplianceFlag["HIPAA"] = "hipaa";
    ComplianceFlag["PCI_DSS"] = "pci_dss";
    ComplianceFlag["ISO27001"] = "iso27001";
})(ComplianceFlag || (exports.ComplianceFlag = ComplianceFlag = {}));
class AuditLogger {
    config;
    eventChain = [];
    hashSecret;
    constructor(config = {}) {
        this.config = {
            enabled: true,
            retentionDays: 2555,
            compressionEnabled: true,
            encryptionEnabled: true,
            integrityProtection: true,
            realTimeAlerts: true,
            excludePaths: ['/health', '/metrics', '/favicon.ico'],
            excludeUsers: ['system', 'healthcheck'],
            sensitiveFields: [
                'password', 'token', 'secret', 'key', 'ssn', 'social',
                'credit_card', 'bank_account', 'passport', 'driver_license'
            ],
            complianceMode: [ComplianceFlag.GDPR, ComplianceFlag.SOX],
            ...config
        };
        this.hashSecret = process.env.AUDIT_HASH_SECRET || index_1.SecurityUtils.generateSecureRandom(32);
    }
    async logEvent(eventData) {
        if (!this.config.enabled) {
            return '';
        }
        if (this.shouldExclude(eventData)) {
            return '';
        }
        const event = {
            id: index_1.SecurityUtils.generateUUID(),
            timestamp: new Date(),
            riskLevel: AuditRiskLevel.LOW,
            complianceFlags: [],
            hash: '',
            ...eventData,
            details: this.sanitizeDetails(eventData.details)
        };
        event.complianceFlags = this.determineComplianceFlags(event);
        event.riskLevel = this.calculateRiskLevel(event);
        if (this.config.integrityProtection) {
            event.previousHash = this.getLastEventHash();
            event.hash = this.generateEventHash(event);
            this.eventChain.push(event.hash);
        }
        await this.storeEvent(event);
        if (this.config.realTimeAlerts && event.riskLevel === AuditRiskLevel.CRITICAL) {
            await this.sendAlert(event);
        }
        return event.id;
    }
    middleware() {
        return async (request, reply) => {
            const startTime = Date.now();
            if (this.config.excludePaths.some(path => request.url.startsWith(path))) {
                return;
            }
            const baseEvent = {
                sourceIP: index_1.SecurityUtils.extractClientIP(request),
                userAgent: request.headers['user-agent'],
                method: request.method,
                path: request.url,
                sessionId: this.extractSessionId(request),
                userId: this.extractUserId(request)
            };
            if (this.isHighRiskOperation(request)) {
                await this.logEvent({
                    ...baseEvent,
                    action: 'request_start',
                    resource: 'http_request',
                    details: {
                        headers: this.sanitizeHeaders(request.headers),
                        query: request.query,
                        body: this.sanitizeBody(request.body)
                    }
                });
            }
            reply.addHook('onSend', async (request, reply, payload) => {
                const responseTime = Date.now() - startTime;
                const statusCode = reply.statusCode;
                await this.logEvent({
                    ...baseEvent,
                    action: this.getActionFromRequest(request),
                    resource: this.getResourceFromRequest(request),
                    resourceId: this.getResourceIdFromRequest(request),
                    statusCode,
                    details: {
                        responseTime,
                        bodySize: payload ? Buffer.byteLength(payload) : 0,
                        headers: this.sanitizeHeaders(request.headers)
                    }
                });
            });
        };
    }
    async logAuth(action, userId, request, success, details) {
        return this.logEvent({
            action: `auth_${action}`,
            resource: 'user_authentication',
            resourceId: userId,
            userId,
            sourceIP: index_1.SecurityUtils.extractClientIP(request),
            userAgent: request.headers['user-agent'],
            statusCode: success ? 200 : 401,
            details: {
                success,
                ...this.sanitizeDetails(details)
            },
            riskLevel: success ? AuditRiskLevel.LOW : AuditRiskLevel.MEDIUM
        });
    }
    async logDataAccess(action, resource, resourceId, userId, request, oldValues, newValues) {
        return this.logEvent({
            action: `data_${action}`,
            resource,
            resourceId,
            userId,
            sourceIP: index_1.SecurityUtils.extractClientIP(request),
            userAgent: request.headers['user-agent'],
            oldValues: this.sanitizeDetails(oldValues),
            newValues: this.sanitizeDetails(newValues),
            riskLevel: action === 'delete' ? AuditRiskLevel.HIGH : AuditRiskLevel.MEDIUM
        });
    }
    async logAdmin(action, resource, userId, request, details) {
        return this.logEvent({
            action: `admin_${action}`,
            resource,
            userId,
            sourceIP: index_1.SecurityUtils.extractClientIP(request),
            userAgent: request.headers['user-agent'],
            details: this.sanitizeDetails(details),
            riskLevel: AuditRiskLevel.HIGH
        });
    }
    async logSecurity(action, userId, request, details) {
        return this.logEvent({
            action: `security_${action}`,
            resource: 'security_system',
            userId,
            sourceIP: index_1.SecurityUtils.extractClientIP(request),
            userAgent: request.headers['user-agent'],
            details: this.sanitizeDetails(details),
            riskLevel: AuditRiskLevel.CRITICAL
        });
    }
    async logPrivacy(action, userId, request, details) {
        return this.logEvent({
            action: `privacy_${action}`,
            resource: 'user_data',
            resourceId: userId,
            userId,
            sourceIP: index_1.SecurityUtils.extractClientIP(request),
            userAgent: request.headers['user-agent'],
            details: this.sanitizeDetails(details),
            complianceFlags: [ComplianceFlag.GDPR, ComplianceFlag.CCPA],
            riskLevel: AuditRiskLevel.HIGH
        });
    }
    async queryEvents(query) {
        return [];
    }
    async generateReport(startDate, endDate) {
        const events = await this.queryEvents({ startDate, endDate });
        const report = {
            totalEvents: events.length,
            timeRange: { start: startDate, end: endDate },
            userActivity: {},
            actionBreakdown: {},
            riskDistribution: {},
            complianceEvents: {},
            anomalies: []
        };
        for (const event of events) {
            if (event.userId) {
                report.userActivity[event.userId] = (report.userActivity[event.userId] || 0) + 1;
            }
            report.actionBreakdown[event.action] = (report.actionBreakdown[event.action] || 0) + 1;
            report.riskDistribution[event.riskLevel] = (report.riskDistribution[event.riskLevel] || 0) + 1;
            for (const flag of event.complianceFlags) {
                report.complianceEvents[flag] = (report.complianceEvents[flag] || 0) + 1;
            }
        }
        report.anomalies = await this.detectAnomalies(events);
        return report;
    }
    async verifyIntegrity() {
        const errors = [];
        if (!this.config.integrityProtection) {
            return { valid: true, errors: ['Integrity protection disabled'] };
        }
        return { valid: true, errors };
    }
    async exportData(format, query) {
        const events = await this.queryEvents(query);
        switch (format) {
            case 'json':
                return JSON.stringify(events, null, 2);
            case 'csv':
                return this.convertToCSV(events);
            case 'xml':
                return this.convertToXML(events);
            default:
                throw new Error('Unsupported export format');
        }
    }
    shouldExclude(eventData) {
        if (eventData.path && this.config.excludePaths.some(path => eventData.path.startsWith(path))) {
            return true;
        }
        if (eventData.userId && this.config.excludeUsers.includes(eventData.userId)) {
            return true;
        }
        return false;
    }
    sanitizeDetails(details) {
        if (!details || typeof details !== 'object') {
            return details;
        }
        const sanitized = { ...details };
        for (const field of this.config.sensitiveFields) {
            if (sanitized[field]) {
                sanitized[field] = '***REDACTED***';
            }
        }
        for (const [key, value] of Object.entries(sanitized)) {
            if (typeof value === 'object' && value !== null) {
                sanitized[key] = this.sanitizeDetails(value);
            }
        }
        return sanitized;
    }
    determineComplianceFlags(event) {
        const flags = [];
        if (event.action.includes('privacy') ||
            event.action.includes('data_export') ||
            event.action.includes('data_deletion') ||
            event.resource === 'user_data') {
            flags.push(ComplianceFlag.GDPR, ComplianceFlag.CCPA);
        }
        if (event.action.includes('admin') ||
            event.action.includes('config') ||
            event.riskLevel === AuditRiskLevel.CRITICAL) {
            flags.push(ComplianceFlag.SOX);
        }
        if (event.action.includes('security') ||
            event.action.includes('auth') ||
            event.riskLevel === AuditRiskLevel.HIGH) {
            flags.push(ComplianceFlag.ISO27001);
        }
        return flags;
    }
    calculateRiskLevel(event) {
        let score = 0;
        if (event.action.includes('delete'))
            score += 3;
        if (event.action.includes('admin'))
            score += 2;
        if (event.action.includes('security'))
            score += 4;
        if (event.action.includes('auth'))
            score += 1;
        if (event.statusCode && event.statusCode >= 400)
            score += 2;
        if (event.statusCode && event.statusCode >= 500)
            score += 3;
        if (event.resource === 'user_data')
            score += 2;
        if (event.resource === 'security_system')
            score += 3;
        if (score >= 6)
            return AuditRiskLevel.CRITICAL;
        if (score >= 4)
            return AuditRiskLevel.HIGH;
        if (score >= 2)
            return AuditRiskLevel.MEDIUM;
        return AuditRiskLevel.LOW;
    }
    generateEventHash(event) {
        const eventData = {
            id: event.id,
            timestamp: event.timestamp.toISOString(),
            userId: event.userId,
            action: event.action,
            resource: event.resource,
            resourceId: event.resourceId,
            sourceIP: event.sourceIP,
            previousHash: event.previousHash
        };
        return crypto
            .createHmac('sha256', this.hashSecret)
            .update(JSON.stringify(eventData))
            .digest('hex');
    }
    getLastEventHash() {
        return this.eventChain[this.eventChain.length - 1];
    }
    async storeEvent(event) {
        console.log('AUDIT:', {
            id: event.id,
            action: event.action,
            resource: event.resource,
            userId: event.userId,
            riskLevel: event.riskLevel,
            complianceFlags: event.complianceFlags
        });
    }
    async sendAlert(event) {
        console.warn('CRITICAL AUDIT EVENT:', event);
    }
    extractSessionId(request) {
        const authHeader = request.headers.authorization;
        if (authHeader) {
            try {
                const token = authHeader.split(' ')[1];
                const jwt = require('jsonwebtoken');
                const decoded = jwt.decode(token);
                return decoded?.jti;
            }
            catch {
                return undefined;
            }
        }
        return undefined;
    }
    extractUserId(request) {
        const authHeader = request.headers.authorization;
        if (authHeader) {
            try {
                const token = authHeader.split(' ')[1];
                const jwt = require('jsonwebtoken');
                const decoded = jwt.decode(token);
                return decoded?.sub;
            }
            catch {
                return undefined;
            }
        }
        return undefined;
    }
    isHighRiskOperation(request) {
        const highRiskPaths = ['/api/admin', '/api/auth', '/api/user/delete'];
        const highRiskMethods = ['DELETE', 'PUT'];
        return highRiskPaths.some(path => request.url.startsWith(path)) ||
            highRiskMethods.includes(request.method);
    }
    getActionFromRequest(request) {
        const method = request.method.toLowerCase();
        const path = request.url;
        if (path.includes('/auth/login'))
            return 'auth_login';
        if (path.includes('/auth/logout'))
            return 'auth_logout';
        if (path.includes('/admin/'))
            return `admin_${method}`;
        return `http_${method}`;
    }
    getResourceFromRequest(request) {
        const path = request.url;
        if (path.includes('/api/user'))
            return 'user';
        if (path.includes('/api/documents'))
            return 'document';
        if (path.includes('/api/analysis'))
            return 'analysis';
        if (path.includes('/api/admin'))
            return 'admin';
        return 'http_request';
    }
    getResourceIdFromRequest(request) {
        const pathParts = request.url.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lastPart)) {
            return lastPart;
        }
        return undefined;
    }
    sanitizeHeaders(headers) {
        const sanitized = { ...headers };
        delete sanitized.authorization;
        delete sanitized.cookie;
        return sanitized;
    }
    sanitizeBody(body) {
        return this.sanitizeDetails(body);
    }
    async detectAnomalies(events) {
        const anomalies = [];
        const userEvents = new Map();
        for (const event of events) {
            if (event.userId) {
                if (!userEvents.has(event.userId)) {
                    userEvents.set(event.userId, []);
                }
                userEvents.get(event.userId).push(event);
            }
        }
        for (const [userId, userEventList] of userEvents) {
            const deleteEvents = userEventList.filter(e => e.action.includes('delete'));
            if (deleteEvents.length > 10) {
                anomalies.push({
                    type: 'bulk_action',
                    description: `User ${userId} performed ${deleteEvents.length} delete operations`,
                    events: deleteEvents.map(e => e.id),
                    severity: 'high'
                });
            }
        }
        const nightEvents = events.filter(e => {
            const hour = e.timestamp.getHours();
            return hour < 6 || hour > 22;
        });
        if (nightEvents.length > events.length * 0.3) {
            anomalies.push({
                type: 'unusual_time',
                description: `${nightEvents.length} events occurred outside normal hours`,
                events: nightEvents.map(e => e.id),
                severity: 'medium'
            });
        }
        return anomalies;
    }
    convertToCSV(events) {
        if (events.length === 0)
            return '';
        const headers = ['id', 'timestamp', 'userId', 'action', 'resource', 'sourceIP', 'riskLevel'];
        const csvLines = [headers.join(',')];
        for (const event of events) {
            const values = headers.map(header => {
                const value = event[header];
                return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
            });
            csvLines.push(values.join(','));
        }
        return csvLines.join('\n');
    }
    convertToXML(events) {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<auditEvents>\n';
        for (const event of events) {
            xml += '  <event>\n';
            xml += `    <id>${event.id}</id>\n`;
            xml += `    <timestamp>${event.timestamp.toISOString()}</timestamp>\n`;
            xml += `    <userId>${event.userId || ''}</userId>\n`;
            xml += `    <action>${event.action}</action>\n`;
            xml += `    <resource>${event.resource}</resource>\n`;
            xml += `    <sourceIP>${event.sourceIP}</sourceIP>\n`;
            xml += `    <riskLevel>${event.riskLevel}</riskLevel>\n`;
            xml += '  </event>\n';
        }
        xml += '</auditEvents>';
        return xml;
    }
}
exports.AuditLogger = AuditLogger;
exports.auditLogger = new AuditLogger();
//# sourceMappingURL=audit-logger.js.map