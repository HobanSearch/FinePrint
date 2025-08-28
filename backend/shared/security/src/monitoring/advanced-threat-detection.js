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
exports.createAdvancedThreatDetection = exports.AdvancedThreatDetectionService = void 0;
const crypto = __importStar(require("crypto"));
const events_1 = require("events");
class AdvancedThreatDetectionService extends events_1.EventEmitter {
    redis;
    prisma;
    config;
    eventBuffer;
    userProfiles;
    threatIntelCache;
    metrics;
    processingTimer;
    constructor(redis, prisma, config) {
        super();
        this.redis = redis;
        this.prisma = prisma;
        this.config = config;
        this.eventBuffer = [];
        this.userProfiles = new Map();
        this.threatIntelCache = new Map();
        this.metrics = {
            totalEvents: 0,
            threatsDetected: 0,
            falsePositives: 0,
            truePositives: 0,
            incidentsCreated: 0,
            averageResponseTime: 0,
            averageResolutionTime: 0,
            blockedAttacks: 0,
            anomaliesDetected: 0,
            riskScoreDistribution: {}
        };
        this.initialize();
    }
    async initialize() {
        if (this.config.threatIntelligence.enabled) {
            await this.loadThreatIntelligence();
            this.startThreatIntelUpdater();
        }
        if (this.config.behavioralAnalysis.enabled) {
            await this.loadUserProfiles();
        }
        if (this.config.realTimeMonitoring.enabled) {
            this.startRealTimeProcessor();
        }
    }
    async processSecurityEvent(event) {
        const securityEvent = {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            riskScore: 0,
            ...event
        };
        try {
            securityEvent.riskScore = await this.calculateRiskScore(securityEvent);
            if (this.config.threatIntelligence.enabled) {
                securityEvent.threatIntelligence = await this.checkThreatIntelligence(securityEvent);
                if (securityEvent.threatIntelligence.length > 0) {
                    securityEvent.riskScore += 30;
                }
            }
            if (this.config.behavioralAnalysis.enabled && securityEvent.userId) {
                const anomalies = await this.analyzeBehavior(securityEvent);
                if (anomalies.length > 0) {
                    securityEvent.anomalyScore = anomalies.reduce((sum, a) => sum + a.confidence, 0) / anomalies.length;
                    securityEvent.riskScore += securityEvent.anomalyScore * 0.5;
                }
            }
            if (this.config.anomalyDetection.enabled) {
                const isAnomaly = await this.detectAnomaly(securityEvent);
                if (isAnomaly) {
                    securityEvent.riskScore += 20;
                    this.metrics.anomaliesDetected++;
                }
            }
            this.eventBuffer.push(securityEvent);
            if (securityEvent.riskScore >= 80 || securityEvent.severity === 'critical') {
                await this.processHighRiskEvent(securityEvent);
            }
            this.updateMetrics(securityEvent);
            this.emit('securityEvent', securityEvent);
            return securityEvent;
        }
        catch (error) {
            console.error('Security event processing failed:', error);
            throw error;
        }
    }
    async createIncident(title, description, severity, category, triggeringEvents) {
        const incident = {
            id: crypto.randomUUID(),
            title,
            description,
            severity,
            status: 'open',
            category,
            affectedSystems: [...new Set(triggeringEvents.map(e => e.source))],
            affectedUsers: [...new Set(triggeringEvents.map(e => e.userId).filter(Boolean))],
            detectedAt: new Date(),
            timeline: [{
                    timestamp: new Date(),
                    action: 'incident_created',
                    actor: 'system',
                    description: 'Incident automatically created by threat detection system'
                }],
            evidence: [],
            mitigation: []
        };
        await this.storeIncident(incident);
        if (severity === 'critical' || severity === 'high') {
            await this.autoAssignIncident(incident);
        }
        if (this.config.incidentResponse.autoBlocking) {
            await this.triggerAutomatedResponse(incident, triggeringEvents);
        }
        await this.sendIncidentNotifications(incident);
        this.metrics.incidentsCreated++;
        this.emit('incident', incident);
        return incident;
    }
    async analyzeBehavior(event) {
        if (!event.userId)
            return [];
        const anomalies = [];
        try {
            let profile = this.userProfiles.get(event.userId);
            if (!profile) {
                profile = await this.createUserProfile(event.userId);
                this.userProfiles.set(event.userId, profile);
            }
            if (this.config.behavioralAnalysis.locationAnalysisEnabled) {
                const locationAnomaly = this.detectLocationAnomaly(profile, event);
                if (locationAnomaly) {
                    anomalies.push(locationAnomaly);
                }
            }
            const timeAnomaly = this.detectTimeAnomaly(profile, event);
            if (timeAnomaly) {
                anomalies.push(timeAnomaly);
            }
            if (this.config.behavioralAnalysis.deviceTrackingEnabled) {
                const deviceAnomaly = this.detectDeviceAnomaly(profile, event);
                if (deviceAnomaly) {
                    anomalies.push(deviceAnomaly);
                }
            }
            const usageAnomaly = this.detectUsageAnomaly(profile, event);
            if (usageAnomaly) {
                anomalies.push(usageAnomaly);
            }
            await this.updateUserProfile(profile, event);
            return anomalies;
        }
        catch (error) {
            console.error('Behavior analysis failed:', error);
            return [];
        }
    }
    async calculateRiskScore(event) {
        let score = 0;
        switch (event.type) {
            case 'authentication':
                score += event.result === 'failure' ? 20 : 5;
                break;
            case 'authorization':
                score += event.result === 'failure' ? 15 : 3;
                break;
            case 'data_access':
                score += 10;
                break;
            case 'configuration_change':
                score += 25;
                break;
            case 'anomaly':
                score += 30;
                break;
            case 'threat':
                score += 40;
                break;
        }
        switch (event.severity) {
            case 'critical':
                score *= 2;
                break;
            case 'high':
                score *= 1.5;
                break;
            case 'warning':
                score *= 1.2;
                break;
        }
        const ipRisk = await this.checkIPReputation(event.ipAddress);
        score += ipRisk;
        const rateViolations = await this.checkRateViolations(event.ipAddress, event.userId);
        score += rateViolations * 5;
        if (event.type === 'authentication' && event.result === 'failure') {
            const recentFailures = await this.getRecentAuthFailures(event.ipAddress, event.userId);
            score += Math.min(recentFailures * 10, 50);
        }
        return Math.min(score, 100);
    }
    async checkThreatIntelligence(event) {
        const matches = [];
        try {
            const ipMatches = this.threatIntelCache.get(`ip:${event.ipAddress}`);
            if (ipMatches) {
                matches.push(...ipMatches);
            }
            const uaHash = crypto.createHash('md5').update(event.userAgent).digest('hex');
            const uaMatches = this.threatIntelCache.get(`ua:${uaHash}`);
            if (uaMatches) {
                matches.push(...uaMatches);
            }
            return matches.filter(match => match.confidence >= this.config.threatIntelligence.confidence_threshold);
        }
        catch (error) {
            console.error('Threat intelligence check failed:', error);
            return [];
        }
    }
    async detectAnomaly(event) {
        try {
            const historicalEvents = await this.getHistoricalEvents(event.type, event.source);
            if (historicalEvents.length < 50) {
                return false;
            }
            const metrics = this.extractEventMetrics(event);
            const historicalMetrics = historicalEvents.map(e => this.extractEventMetrics(e));
            for (const [key, value] of Object.entries(metrics)) {
                const historicalValues = historicalMetrics.map(m => m[key]).filter(v => v !== undefined);
                if (historicalValues.length === 0)
                    continue;
                const mean = historicalValues.reduce((sum, v) => sum + v, 0) / historicalValues.length;
                const variance = historicalValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / historicalValues.length;
                const stdDev = Math.sqrt(variance);
                if (stdDev === 0)
                    continue;
                const zScore = Math.abs((value - mean) / stdDev);
                const threshold = this.getAnomalyThreshold();
                if (zScore > threshold) {
                    return true;
                }
            }
            return false;
        }
        catch (error) {
            console.error('Anomaly detection failed:', error);
            return false;
        }
    }
    async processHighRiskEvent(event) {
        try {
            if (event.severity === 'critical' || event.riskScore >= 90) {
                await this.createIncident(`High-risk ${event.type} event detected`, `Critical security event detected: ${event.action} on ${event.resource}`, event.severity === 'critical' ? 'critical' : 'high', 'attack', [event]);
            }
            if (this.config.incidentResponse.autoBlocking && event.riskScore >= 85) {
                await this.blockThreatSource(event);
            }
            if (event.riskScore >= 70) {
                await this.applyRateLimit(event.ipAddress, event.userId);
            }
        }
        catch (error) {
            console.error('High-risk event processing failed:', error);
        }
    }
    getAnomalyThreshold() {
        switch (this.config.anomalyDetection.sensitivity) {
            case 'low': return 3.0;
            case 'medium': return 2.5;
            case 'high': return 2.0;
            default: return 2.5;
        }
    }
    extractEventMetrics(event) {
        return {
            hour: new Date(event.timestamp).getHours(),
            riskScore: event.riskScore,
            userAgentLength: event.userAgent.length,
            resourcePathLength: event.resource.length
        };
    }
    async loadThreatIntelligence() {
    }
    startThreatIntelUpdater() {
        setInterval(async () => {
            await this.loadThreatIntelligence();
        }, this.config.threatIntelligence.updateInterval * 60 * 60 * 1000);
    }
    async loadUserProfiles() {
    }
    startRealTimeProcessor() {
        this.processingTimer = setInterval(async () => {
            await this.processEventBuffer();
        }, this.config.realTimeMonitoring.processingInterval * 1000);
    }
    async processEventBuffer() {
        if (this.eventBuffer.length === 0)
            return;
        const events = this.eventBuffer.splice(0);
        try {
            await this.batchStoreEvents(events);
            await this.detectPatterns(events);
        }
        catch (error) {
            console.error('Event buffer processing failed:', error);
            this.eventBuffer.unshift(...events);
        }
    }
    async createUserProfile(userId) {
        return {
            userId,
            baseline: {
                loginTimes: [],
                commonLocations: [],
                typicalDevices: [],
                usagePatterns: {},
                riskFactors: []
            },
            current: {
                lastLogin: new Date(),
                currentLocation: '',
                currentDevice: '',
                sessionDuration: 0,
                actionFrequency: {}
            },
            anomalies: [],
            lastUpdated: new Date()
        };
    }
    detectLocationAnomaly(profile, event) {
        return null;
    }
    detectTimeAnomaly(profile, event) {
        return null;
    }
    detectDeviceAnomaly(profile, event) {
        return null;
    }
    detectUsageAnomaly(profile, event) {
        return null;
    }
    async updateUserProfile(profile, event) {
    }
    async checkIPReputation(ip) {
        return 0;
    }
    async checkRateViolations(ip, userId) {
        return 0;
    }
    async getRecentAuthFailures(ip, userId) {
        return 0;
    }
    async getHistoricalEvents(type, source) {
        return [];
    }
    async storeIncident(incident) {
    }
    async autoAssignIncident(incident) {
    }
    async triggerAutomatedResponse(incident, events) {
    }
    async sendIncidentNotifications(incident) {
    }
    async blockThreatSource(event) {
    }
    async applyRateLimit(ip, userId) {
    }
    async batchStoreEvents(events) {
    }
    async detectPatterns(events) {
    }
    updateMetrics(event) {
        this.metrics.totalEvents++;
        const riskBucket = Math.floor(event.riskScore / 10) * 10;
        this.metrics.riskScoreDistribution[riskBucket] =
            (this.metrics.riskScoreDistribution[riskBucket] || 0) + 1;
    }
    getMetrics() {
        return { ...this.metrics };
    }
    async getActiveIncidents() {
        return [];
    }
    async updateIncident(incidentId, updates) {
    }
    async closeIncident(incidentId, resolution, lessonsLearned) {
    }
}
exports.AdvancedThreatDetectionService = AdvancedThreatDetectionService;
const createAdvancedThreatDetection = (redis, prisma, config) => {
    return new AdvancedThreatDetectionService(redis, prisma, config);
};
exports.createAdvancedThreatDetection = createAdvancedThreatDetection;
//# sourceMappingURL=advanced-threat-detection.js.map