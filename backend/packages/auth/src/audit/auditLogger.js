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
exports.AuditLogger = void 0;
const crypto = __importStar(require("crypto"));
const zlib = __importStar(require("zlib"));
const util_1 = require("util");
const logger_1 = require("@fineprintai/logger");
const types_1 = require("./types");
const gzip = (0, util_1.promisify)(zlib.gzip);
const gunzip = (0, util_1.promisify)(zlib.gunzip);
const logger = (0, logger_1.createServiceLogger)('audit-logger');
class AuditLogger {
    cache;
    config;
    alerts = new Map();
    encryptionKey;
    constructor(cache, config) {
        this.cache = cache;
        this.config = config;
        this.initializeEncryption();
        this.initializeAlerts();
    }
    initializeEncryption() {
        if (this.config.encryption.enabled && this.config.encryption.key) {
            this.encryptionKey = Buffer.from(this.config.encryption.key, 'hex');
            logger.info('Audit encryption initialized');
        }
    }
    initializeAlerts() {
        const alertConfigs = [
            {
                name: 'Multiple Failed Logins',
                description: 'Multiple failed login attempts from same IP',
                condition: (events) => {
                    const recentFailures = events.filter(e => e.type === types_1.AuditEventType.LOGIN_FAILURE &&
                        Date.now() - e.timestamp.getTime() < 300000);
                    const ipGroups = recentFailures.reduce((acc, event) => {
                        const ip = event.actor.ipAddress || 'unknown';
                        acc[ip] = (acc[ip] || 0) + 1;
                        return acc;
                    }, {});
                    return Object.values(ipGroups).some(count => count >= 5);
                },
                severity: 'high',
                cooldownPeriod: 300,
                enabled: true
            },
            {
                name: 'Privilege Escalation',
                description: 'User permissions changed to admin level',
                condition: (events) => {
                    return events.some(e => e.type === types_1.AuditEventType.PERMISSIONS_CHANGED &&
                        e.details?.newRole === 'admin' &&
                        Date.now() - e.timestamp.getTime() < 60000);
                },
                severity: 'critical',
                cooldownPeriod: 0,
                enabled: true
            },
            {
                name: 'Unusual Login Location',
                description: 'Login from new geographic location',
                condition: (events) => {
                    return false;
                },
                severity: 'medium',
                cooldownPeriod: 3600,
                enabled: true
            },
            {
                name: 'Mass Token Revocation',
                description: 'Large number of tokens revoked in short time',
                condition: (events) => {
                    const recentRevocations = events.filter(e => e.type === types_1.AuditEventType.TOKEN_REVOKED &&
                        Date.now() - e.timestamp.getTime() < 600000);
                    return recentRevocations.length >= 10;
                },
                severity: 'high',
                cooldownPeriod: 600,
                enabled: true
            },
            {
                name: 'MFA Bypass Attempt',
                description: 'Multiple MFA failures followed by successful login',
                condition: (events) => {
                    const sortedEvents = events
                        .filter(e => e.actor.id && Date.now() - e.timestamp.getTime() < 900000)
                        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
                    for (let i = 0; i < sortedEvents.length - 1; i++) {
                        const mfaFailures = sortedEvents.slice(i, i + 5)
                            .filter(e => e.type === types_1.AuditEventType.MFA_FAILURE);
                        if (mfaFailures.length >= 3) {
                            const subsequentLogin = sortedEvents.slice(i + 5)
                                .find(e => e.type === types_1.AuditEventType.LOGIN_SUCCESS);
                            if (subsequentLogin) {
                                return true;
                            }
                        }
                    }
                    return false;
                },
                severity: 'critical',
                cooldownPeriod: 0,
                enabled: true
            }
        ];
        alertConfigs.forEach(config => {
            const alert = {
                ...config,
                id: crypto.randomUUID(),
                triggerCount: 0
            };
            this.alerts.set(alert.id, alert);
        });
        logger.info('Audit alerts initialized', { count: this.alerts.size });
    }
    async logEvent(type, level, actor, action, outcome, details = {}, resource, context) {
        if (!this.config.enabled) {
            return;
        }
        try {
            if (!this.config.levels.includes(level)) {
                return;
            }
            const event = {
                id: crypto.randomUUID(),
                timestamp: new Date(),
                type,
                level,
                actor: this.sanitizeActor(actor),
                resource,
                action,
                outcome,
                details: this.sanitizeDetails(details),
                context: {
                    service: 'fine-print-auth',
                    version: '1.0.0',
                    environment: process.env.NODE_ENV || 'development',
                    ...context
                },
                metadata: {
                    encrypted: this.config.encryption.enabled,
                    compressed: false,
                    retention: new Date(Date.now() + (this.config.retention.days * 24 * 60 * 60 * 1000)),
                    tags: this.generateTags(type, level, outcome)
                }
            };
            event.metadata.hash = this.calculateHash(event);
            await this.processEvent(event);
            await this.storeEvent(event);
            await this.checkAlerts(event);
            if (this.config.forwarding.enabled) {
                await this.forwardEvent(event);
            }
            logger.debug('Audit event logged', {
                id: event.id.substring(0, 8) + '...',
                type: event.type,
                level: event.level,
                outcome: event.outcome
            });
        }
        catch (error) {
            logger.error('Failed to log audit event', { error, type, level });
        }
    }
    async queryEvents(query) {
        try {
            const events = [];
            const keys = await this.getEventKeys(query);
            for (const key of keys.slice(query.offset || 0, (query.offset || 0) + (query.limit || 100))) {
                const event = await this.retrieveEvent(key);
                if (event && this.matchesQuery(event, query)) {
                    events.push(event);
                }
            }
            if (query.sortBy) {
                events.sort((a, b) => {
                    let aVal, bVal;
                    switch (query.sortBy) {
                        case 'timestamp':
                            aVal = a.timestamp.getTime();
                            bVal = b.timestamp.getTime();
                            break;
                        case 'type':
                            aVal = a.type;
                            bVal = b.type;
                            break;
                        case 'level':
                            aVal = a.level;
                            bVal = b.level;
                            break;
                        default:
                            return 0;
                    }
                    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                    return query.sortOrder === 'desc' ? -comparison : comparison;
                });
            }
            return events;
        }
        catch (error) {
            logger.error('Failed to query audit events', { error, query });
            return [];
        }
    }
    async getStats() {
        try {
            const eventKeys = await this.cache.keys('audit:event:*');
            const events = [];
            const recentKeys = eventKeys.slice(-1000);
            for (const key of recentKeys) {
                const event = await this.retrieveEvent(key);
                if (event) {
                    events.push(event);
                }
            }
            const totalEvents = eventKeys.length;
            const eventsByType = events.reduce((acc, event) => {
                acc[event.type] = (acc[event.type] || 0) + 1;
                return acc;
            }, {});
            const eventsByLevel = events.reduce((acc, event) => {
                acc[event.level] = (acc[event.level] || 0) + 1;
                return acc;
            }, {});
            const eventsByOutcome = events.reduce((acc, event) => {
                acc[event.outcome] = (acc[event.outcome] || 0) + 1;
                return acc;
            }, {});
            const eventsByActor = events.reduce((acc, event) => {
                const actorKey = event.actor.id || event.actor.ipAddress || 'anonymous';
                acc[actorKey] = (acc[actorKey] || 0) + 1;
                return acc;
            }, {});
            const recentEvents = events
                .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                .slice(0, 20);
            const topRiskyEvents = events
                .filter(e => e.outcome === 'failure' || e.level === types_1.AuditLevel.CRITICAL)
                .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                .slice(0, 10);
            const anomalies = await this.detectAnomalies(events);
            return {
                totalEvents,
                eventsByType,
                eventsByLevel,
                eventsByOutcome,
                eventsByActor,
                recentEvents,
                topRiskyEvents,
                anomalies
            };
        }
        catch (error) {
            logger.error('Failed to get audit stats', { error });
            return {
                totalEvents: 0,
                eventsByType: {},
                eventsByLevel: {},
                eventsByOutcome: {},
                eventsByActor: {},
                recentEvents: [],
                topRiskyEvents: [],
                anomalies: []
            };
        }
    }
    async cleanup() {
        try {
            const now = new Date();
            const eventKeys = await this.cache.keys('audit:event:*');
            let deletedCount = 0;
            for (const key of eventKeys) {
                const event = await this.retrieveEvent(key);
                if (event && event.metadata.retention < now) {
                    await this.cache.del(key);
                    deletedCount++;
                }
            }
            if (eventKeys.length > this.config.retention.maxEntries) {
                const excess = eventKeys.length - this.config.retention.maxEntries;
                const oldestKeys = eventKeys.slice(0, excess);
                for (const key of oldestKeys) {
                    await this.cache.del(key);
                    deletedCount++;
                }
            }
            logger.info('Audit cleanup completed', { deletedCount });
            return deletedCount;
        }
        catch (error) {
            logger.error('Audit cleanup failed', { error });
            return 0;
        }
    }
    sanitizeActor(actor) {
        const sanitized = { ...actor };
        this.config.sensitiveFields.forEach(field => {
            if (sanitized[field]) {
                delete sanitized[field];
            }
        });
        return sanitized;
    }
    sanitizeDetails(details) {
        const sanitized = { ...details };
        this.config.sensitiveFields.forEach(field => {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        });
        const sensitivePatterns = [
            /password/i,
            /token/i,
            /secret/i,
            /key/i,
            /credential/i
        ];
        Object.keys(sanitized).forEach(key => {
            if (sensitivePatterns.some(pattern => pattern.test(key))) {
                sanitized[key] = '[REDACTED]';
            }
        });
        return sanitized;
    }
    generateTags(type, level, outcome) {
        const tags = [];
        if (type.startsWith('auth.')) {
            tags.push('authentication');
        }
        if (type.startsWith('security.')) {
            tags.push('security');
        }
        if (type.startsWith('admin.')) {
            tags.push('administration');
        }
        if (type.startsWith('system.')) {
            tags.push('system');
        }
        tags.push(`level:${level}`);
        tags.push(`outcome:${outcome}`);
        if (level === types_1.AuditLevel.CRITICAL || level === types_1.AuditLevel.ERROR) {
            tags.push('high-risk');
        }
        if (outcome === 'failure') {
            tags.push('failure');
        }
        return tags;
    }
    calculateHash(event) {
        const data = JSON.stringify({
            id: event.id,
            timestamp: event.timestamp,
            type: event.type,
            actor: event.actor,
            action: event.action,
            outcome: event.outcome,
            details: event.details
        });
        return crypto.createHash('sha256').update(data).digest('hex');
    }
    async processEvent(event) {
        let data = JSON.stringify(event);
        if (data.length > 1024) {
            const compressed = await gzip(Buffer.from(data));
            event.details = { _compressed: compressed.toString('base64') };
            event.metadata.compressed = true;
        }
        if (this.config.encryption.enabled && this.encryptionKey) {
            const encrypted = this.encrypt(JSON.stringify(event.details));
            event.details = { _encrypted: encrypted };
            event.metadata.encrypted = true;
        }
    }
    async storeEvent(event) {
        const key = `audit:event:${event.timestamp.getTime()}:${event.id}`;
        const ttl = Math.floor((event.metadata.retention.getTime() - Date.now()) / 1000);
        await this.cache.set(key, event, ttl);
        await this.addToIndexes(event);
    }
    async addToIndexes(event) {
        const timestamp = event.timestamp.getTime();
        await this.cache.sadd(`audit:index:type:${event.type}`, `${timestamp}:${event.id}`);
        await this.cache.sadd(`audit:index:level:${event.level}`, `${timestamp}:${event.id}`);
        if (event.actor.id) {
            await this.cache.sadd(`audit:index:actor:${event.actor.id}`, `${timestamp}:${event.id}`);
        }
        if (event.resource?.id) {
            await this.cache.sadd(`audit:index:resource:${event.resource.id}`, `${timestamp}:${event.id}`);
        }
        const indexTtl = this.config.retention.days * 24 * 60 * 60;
        await Promise.all([
            this.cache.expire(`audit:index:type:${event.type}`, indexTtl),
            this.cache.expire(`audit:index:level:${event.level}`, indexTtl),
            event.actor.id && this.cache.expire(`audit:index:actor:${event.actor.id}`, indexTtl),
            event.resource?.id && this.cache.expire(`audit:index:resource:${event.resource.id}`, indexTtl)
        ].filter(Boolean));
    }
    async retrieveEvent(key) {
        try {
            const event = await this.cache.get(key);
            if (!event)
                return null;
            if (event.metadata.encrypted && event.details._encrypted) {
                const decrypted = this.decrypt(event.details._encrypted);
                event.details = JSON.parse(decrypted);
            }
            if (event.metadata.compressed && event.details._compressed) {
                const decompressed = await gunzip(Buffer.from(event.details._compressed, 'base64'));
                const originalEvent = JSON.parse(decompressed.toString());
                event.details = originalEvent.details;
            }
            return event;
        }
        catch (error) {
            logger.error('Failed to retrieve audit event', { error, key });
            return null;
        }
    }
    encrypt(data) {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not available');
        }
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
        cipher.setAutoPadding(true);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }
    decrypt(encryptedData) {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not available');
        }
        const [ivHex, encrypted] = encryptedData.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
        decipher.setAutoPadding(true);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    async getEventKeys(query) {
        let keys = await this.cache.keys('audit:event:*');
        if (query.startDate || query.endDate) {
            keys = keys.filter(key => {
                const timestampStr = key.split(':')[2];
                const timestamp = parseInt(timestampStr);
                if (query.startDate && timestamp < query.startDate.getTime()) {
                    return false;
                }
                if (query.endDate && timestamp > query.endDate.getTime()) {
                    return false;
                }
                return true;
            });
        }
        return keys;
    }
    matchesQuery(event, query) {
        if (query.types && !query.types.includes(event.type)) {
            return false;
        }
        if (query.levels && !query.levels.includes(event.level)) {
            return false;
        }
        if (query.outcomes && !query.outcomes.includes(event.outcome)) {
            return false;
        }
        if (query.actorIds && event.actor.id && !query.actorIds.includes(event.actor.id)) {
            return false;
        }
        if (query.actorTypes && !query.actorTypes.includes(event.actor.type)) {
            return false;
        }
        if (query.resourceIds && event.resource?.id && !query.resourceIds.includes(event.resource.id)) {
            return false;
        }
        if (query.resourceTypes && event.resource?.type && !query.resourceTypes.includes(event.resource.type)) {
            return false;
        }
        if (query.ipAddresses && event.actor.ipAddress && !query.ipAddresses.includes(event.actor.ipAddress)) {
            return false;
        }
        return true;
    }
    async checkAlerts(event) {
        try {
            const recentEvents = await this.queryEvents({
                startDate: new Date(Date.now() - 3600000),
                limit: 1000
            });
            for (const alert of this.alerts.values()) {
                if (!alert.enabled)
                    continue;
                if (alert.lastTriggered &&
                    Date.now() - alert.lastTriggered.getTime() < alert.cooldownPeriod * 1000) {
                    continue;
                }
                if (alert.condition([...recentEvents, event])) {
                    await this.triggerAlert(alert, event);
                }
            }
        }
        catch (error) {
            logger.error('Failed to check alerts', { error });
        }
    }
    async triggerAlert(alert, triggeringEvent) {
        try {
            alert.lastTriggered = new Date();
            alert.triggerCount++;
            const alertEvent = {
                id: crypto.randomUUID(),
                timestamp: new Date(),
                type: types_1.AuditEventType.SUSPICIOUS_ACTIVITY,
                level: types_1.AuditLevel.CRITICAL,
                actor: {
                    type: 'system',
                    id: 'audit-system'
                },
                action: 'alert_triggered',
                outcome: 'success',
                details: {
                    alertId: alert.id,
                    alertName: alert.name,
                    alertDescription: alert.description,
                    severity: alert.severity,
                    triggeringEventId: triggeringEvent.id,
                    triggerCount: alert.triggerCount
                },
                context: {
                    service: 'fine-print-audit',
                    version: '1.0.0',
                    environment: process.env.NODE_ENV || 'development'
                },
                metadata: {
                    encrypted: false,
                    compressed: false,
                    retention: new Date(Date.now() + (this.config.retention.days * 24 * 60 * 60 * 1000)),
                    tags: ['security', 'alert', `severity:${alert.severity}`]
                }
            };
            alertEvent.metadata.hash = this.calculateHash(alertEvent);
            await this.storeEvent(alertEvent);
            logger.error('Security alert triggered', {
                alertName: alert.name,
                severity: alert.severity,
                triggeringEvent: triggeringEvent.id
            });
        }
        catch (error) {
            logger.error('Failed to trigger alert', { error, alertId: alert.id });
        }
    }
    async detectAnomalies(events) {
        const anomalies = [];
        try {
            const hourlyVolume = this.calculateHourlyVolume(events);
            const avgVolume = hourlyVolume.reduce((sum, vol) => sum + vol, 0) / hourlyVolume.length;
            const stdDev = Math.sqrt(hourlyVolume.reduce((sum, vol) => sum + Math.pow(vol - avgVolume, 2), 0) / hourlyVolume.length);
            const currentVolume = hourlyVolume[hourlyVolume.length - 1];
            if (currentVolume > avgVolume + (2 * stdDev)) {
                anomalies.push({
                    id: crypto.randomUUID(),
                    type: 'unusual_volume',
                    description: `Event volume (${currentVolume}) significantly higher than average (${avgVolume.toFixed(2)})`,
                    severity: currentVolume > avgVolume + (3 * stdDev) ? 'critical' : 'medium',
                    firstSeen: new Date(Date.now() - 3600000),
                    lastSeen: new Date(),
                    count: currentVolume,
                    relatedEvents: events.slice(-currentVolume).map(e => e.id),
                    context: { avgVolume, currentVolume, threshold: avgVolume + (2 * stdDev) }
                });
            }
            const uniqueIPs = new Set(events.map(e => e.actor.ipAddress).filter(Boolean));
            if (uniqueIPs.size > 50) {
                anomalies.push({
                    id: crypto.randomUUID(),
                    type: 'new_location',
                    description: `Unusually high number of unique IP addresses (${uniqueIPs.size})`,
                    severity: 'medium',
                    firstSeen: new Date(Date.now() - 3600000),
                    lastSeen: new Date(),
                    count: uniqueIPs.size,
                    relatedEvents: [],
                    context: { uniqueIPs: uniqueIPs.size }
                });
            }
            const failedEvents = events.filter(e => e.outcome === 'failure');
            const failureRate = failedEvents.length / events.length;
            if (failureRate > 0.3) {
                anomalies.push({
                    id: crypto.randomUUID(),
                    type: 'failed_attempts',
                    description: `High failure rate detected (${(failureRate * 100).toFixed(1)}%)`,
                    severity: failureRate > 0.5 ? 'high' : 'medium',
                    firstSeen: new Date(Math.min(...failedEvents.map(e => e.timestamp.getTime()))),
                    lastSeen: new Date(Math.max(...failedEvents.map(e => e.timestamp.getTime()))),
                    count: failedEvents.length,
                    relatedEvents: failedEvents.map(e => e.id),
                    context: { failureRate, totalEvents: events.length, failedEvents: failedEvents.length }
                });
            }
        }
        catch (error) {
            logger.error('Failed to detect anomalies', { error });
        }
        return anomalies;
    }
    calculateHourlyVolume(events) {
        const hours = {};
        events.forEach(event => {
            const hour = new Date(event.timestamp).toISOString().substring(0, 13);
            hours[hour] = (hours[hour] || 0) + 1;
        });
        return Object.values(hours);
    }
    async forwardEvent(event) {
        logger.debug('Event forwarding would happen here', { eventId: event.id });
    }
}
exports.AuditLogger = AuditLogger;
//# sourceMappingURL=auditLogger.js.map