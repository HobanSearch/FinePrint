"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changeMonitoringService = exports.ChangeMonitoringService = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const client_1 = require("@prisma/client");
const notification_1 = require("@fineprintai/notification");
const websocket_1 = require("@fineprintai/websocket");
const textProcessor_1 = require("./textProcessor");
const analysisEngine_1 = require("./analysisEngine");
const crypto_1 = __importDefault(require("crypto"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const node_cron_1 = __importDefault(require("node-cron"));
const logger = (0, logger_1.createServiceLogger)('change-monitor');
const prisma = new client_1.PrismaClient();
class ChangeMonitoringService {
    notificationService;
    wsService;
    activeMonitors = new Map();
    cronJobs = new Map();
    constructor() {
        try {
            this.notificationService = new notification_1.NotificationService();
            this.wsService = new websocket_1.WebSocketService();
        }
        catch (error) {
            logger.warn('Optional services not available', { error: error.message });
        }
    }
    async initialize() {
        logger.info('Initializing Change Monitoring Service');
        try {
            await this.loadActiveMonitors();
            this.startCleanupJob();
            logger.info('Change Monitoring Service initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize Change Monitoring Service', { error: error.message });
            throw error;
        }
    }
    async createMonitor(config) {
        const monitorId = crypto_1.default.randomUUID();
        logger.info('Creating change monitor', {
            monitorId,
            userId: config.userId,
            url: config.url,
            checkInterval: config.checkInterval
        });
        try {
            await this.validateUrl(config.url);
            const initialContent = await this.fetchContentSafely(config.url);
            const contentHash = crypto_1.default.createHash('sha256').update(initialContent).digest('hex');
            const monitor = await prisma.documentChangeMonitor.create({
                data: {
                    id: monitorId,
                    userId: config.userId,
                    teamId: config.teamId,
                    analysisId: config.analysisId,
                    url: config.url,
                    enabled: config.enabled,
                    checkInterval: config.checkInterval,
                    sensitivity: config.sensitivity,
                    alertTypes: config.alertTypes,
                    webhookUrl: config.webhookUrl,
                    emailRecipients: config.emailRecipients,
                    schedule: config.schedule,
                    timezone: config.timezone,
                    ignoreMinorChanges: config.ignoreMinorChanges,
                    keywordsToWatch: config.keywordsToWatch,
                    sectionsToWatch: config.sectionsToWatch,
                    status: 'active',
                    checksPerformed: 0,
                    changesDetected: 0,
                    lastContentHash: contentHash,
                    nextCheck: this.calculateNextCheck(config.checkInterval, config.schedule)
                }
            });
            if (config.enabled) {
                await this.startMonitoring(monitorId, config);
            }
            const monitorConfig = {
                id: monitor.id,
                userId: monitor.userId,
                teamId: monitor.teamId,
                analysisId: monitor.analysisId,
                url: monitor.url,
                enabled: monitor.enabled,
                checkInterval: monitor.checkInterval,
                sensitivity: monitor.sensitivity,
                alertTypes: monitor.alertTypes,
                webhookUrl: monitor.webhookUrl,
                emailRecipients: monitor.emailRecipients,
                schedule: monitor.schedule,
                timezone: monitor.timezone,
                ignoreMinorChanges: monitor.ignoreMinorChanges,
                keywordsToWatch: monitor.keywordsToWatch,
                sectionsToWatch: monitor.sectionsToWatch,
                createdAt: monitor.createdAt,
                updatedAt: monitor.updatedAt,
                lastCheck: monitor.lastCheck,
                nextCheck: monitor.nextCheck,
                status: monitor.status,
                errorMessage: monitor.errorMessage,
                checksPerformed: monitor.checksPerformed,
                changesDetected: monitor.changesDetected
            };
            logger.info('Change monitor created successfully', { monitorId, url: config.url });
            return monitorConfig;
        }
        catch (error) {
            logger.error('Failed to create change monitor', {
                error: error.message,
                userId: config.userId,
                url: config.url
            });
            throw error;
        }
    }
    async getMonitor(monitorId, userId) {
        try {
            const monitor = await prisma.documentChangeMonitor.findFirst({
                where: {
                    id: monitorId,
                    userId
                }
            });
            if (!monitor) {
                return null;
            }
            return this.mapDatabaseToConfig(monitor);
        }
        catch (error) {
            logger.error('Failed to get monitor', { error: error.message, monitorId, userId });
            throw error;
        }
    }
    async updateMonitor(monitorId, userId, updates) {
        try {
            const monitor = await prisma.documentChangeMonitor.findFirst({
                where: { id: monitorId, userId }
            });
            if (!monitor) {
                throw new Error('Monitor not found');
            }
            const updatedMonitor = await prisma.documentChangeMonitor.update({
                where: { id: monitorId },
                data: {
                    enabled: updates.enabled,
                    checkInterval: updates.checkInterval,
                    sensitivity: updates.sensitivity,
                    alertTypes: updates.alertTypes,
                    webhookUrl: updates.webhookUrl,
                    emailRecipients: updates.emailRecipients,
                    schedule: updates.schedule,
                    timezone: updates.timezone,
                    ignoreMinorChanges: updates.ignoreMinorChanges,
                    keywordsToWatch: updates.keywordsToWatch,
                    sectionsToWatch: updates.sectionsToWatch,
                    nextCheck: updates.checkInterval ?
                        this.calculateNextCheck(updates.checkInterval, updates.schedule) :
                        undefined,
                    updatedAt: new Date()
                }
            });
            await this.stopMonitoring(monitorId);
            if (updatedMonitor.enabled) {
                await this.startMonitoring(monitorId, this.mapDatabaseToConfig(updatedMonitor));
            }
            logger.info('Monitor updated successfully', { monitorId, updates: Object.keys(updates) });
            return this.mapDatabaseToConfig(updatedMonitor);
        }
        catch (error) {
            logger.error('Failed to update monitor', { error: error.message, monitorId, userId });
            throw error;
        }
    }
    async deleteMonitor(monitorId, userId) {
        try {
            const monitor = await prisma.documentChangeMonitor.findFirst({
                where: { id: monitorId, userId }
            });
            if (!monitor) {
                return false;
            }
            await this.stopMonitoring(monitorId);
            await prisma.documentChangeMonitor.update({
                where: { id: monitorId },
                data: {
                    status: 'disabled',
                    enabled: false,
                    deletedAt: new Date()
                }
            });
            logger.info('Monitor deleted successfully', { monitorId, userId });
            return true;
        }
        catch (error) {
            logger.error('Failed to delete monitor', { error: error.message, monitorId, userId });
            throw error;
        }
    }
    async listUserMonitors(userId, options = {}) {
        try {
            const { page = 1, limit = 20 } = options;
            const skip = (page - 1) * limit;
            const where = {
                userId,
                deletedAt: null
            };
            if (options.status)
                where.status = options.status;
            if (options.enabled !== undefined)
                where.enabled = options.enabled;
            const [monitors, total] = await Promise.all([
                prisma.documentChangeMonitor.findMany({
                    where,
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: limit
                }),
                prisma.documentChangeMonitor.count({ where })
            ]);
            return {
                monitors: monitors.map(m => this.mapDatabaseToConfig(m)),
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            };
        }
        catch (error) {
            logger.error('Failed to list user monitors', { error: error.message, userId });
            throw error;
        }
    }
    async getChangeHistory(monitorId, userId, options = {}) {
        try {
            const monitor = await prisma.documentChangeMonitor.findFirst({
                where: { id: monitorId, userId }
            });
            if (!monitor) {
                throw new Error('Monitor not found');
            }
            const { page = 1, limit = 20 } = options;
            const skip = (page - 1) * limit;
            const where = { monitorId };
            if (options.changeType)
                where.changeType = options.changeType;
            const [changes, total] = await Promise.all([
                prisma.documentChange.findMany({
                    where,
                    orderBy: { detectedAt: 'desc' },
                    skip,
                    take: limit
                }),
                prisma.documentChange.count({ where })
            ]);
            return {
                changes: changes.map(c => this.mapDatabaseToChangeResult(c)),
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            };
        }
        catch (error) {
            logger.error('Failed to get change history', { error: error.message, monitorId, userId });
            throw error;
        }
    }
    async manualCheck(monitorId, userId) {
        try {
            const monitor = await prisma.documentChangeMonitor.findFirst({
                where: { id: monitorId, userId }
            });
            if (!monitor) {
                throw new Error('Monitor not found');
            }
            logger.info('Performing manual check', { monitorId, url: monitor.url });
            const config = this.mapDatabaseToConfig(monitor);
            const result = await this.performCheck(config);
            if (result) {
                logger.info('Manual check detected changes', {
                    monitorId,
                    changeType: result.changeType,
                    changeScore: result.changeScore
                });
            }
            else {
                logger.info('Manual check - no changes detected', { monitorId });
            }
            return result;
        }
        catch (error) {
            logger.error('Manual check failed', { error: error.message, monitorId, userId });
            throw error;
        }
    }
    async startMonitoring(monitorId, config) {
        try {
            await this.stopMonitoring(monitorId);
            if (config.schedule) {
                const task = node_cron_1.default.schedule(config.schedule, async () => {
                    await this.performScheduledCheck(monitorId);
                }, {
                    scheduled: false,
                    timezone: config.timezone || 'UTC'
                });
                task.start();
                this.cronJobs.set(monitorId, task);
                logger.info('Started cron monitoring', { monitorId, schedule: config.schedule });
            }
            else {
                const interval = setInterval(async () => {
                    await this.performScheduledCheck(monitorId);
                }, config.checkInterval * 1000);
                this.activeMonitors.set(monitorId, interval);
                logger.info('Started interval monitoring', { monitorId, interval: config.checkInterval });
            }
        }
        catch (error) {
            logger.error('Failed to start monitoring', { error: error.message, monitorId });
            throw error;
        }
    }
    async stopMonitoring(monitorId) {
        const interval = this.activeMonitors.get(monitorId);
        if (interval) {
            clearInterval(interval);
            this.activeMonitors.delete(monitorId);
        }
        const cronJob = this.cronJobs.get(monitorId);
        if (cronJob) {
            cronJob.stop();
            cronJob.destroy();
            this.cronJobs.delete(monitorId);
        }
        logger.debug('Stopped monitoring', { monitorId });
    }
    async performScheduledCheck(monitorId) {
        try {
            const monitor = await prisma.documentChangeMonitor.findUnique({
                where: { id: monitorId }
            });
            if (!monitor || !monitor.enabled || monitor.status !== 'active') {
                logger.debug('Skipping check for inactive monitor', { monitorId });
                return;
            }
            const config = this.mapDatabaseToConfig(monitor);
            const result = await this.performCheck(config);
            await prisma.documentChangeMonitor.update({
                where: { id: monitorId },
                data: {
                    lastCheck: new Date(),
                    nextCheck: this.calculateNextCheck(config.checkInterval, config.schedule),
                    checksPerformed: { increment: 1 },
                    ...(result && { changesDetected: { increment: 1 } })
                }
            });
            if (result) {
                await this.sendAlerts(config, result);
            }
        }
        catch (error) {
            logger.error('Scheduled check failed', { error: error.message, monitorId });
            await prisma.documentChangeMonitor.update({
                where: { id: monitorId },
                data: {
                    status: 'error',
                    errorMessage: error.message,
                    lastCheck: new Date()
                }
            }).catch(() => { });
        }
    }
    async performCheck(config) {
        const startTime = Date.now();
        try {
            const currentContent = await this.fetchContentSafely(config.url);
            const currentHash = crypto_1.default.createHash('sha256').update(currentContent).digest('hex');
            const monitor = await prisma.documentChangeMonitor.findUnique({
                where: { id: config.id },
                select: { lastContentHash: true }
            });
            const lastHash = monitor?.lastContentHash;
            if (currentHash === lastHash) {
                return null;
            }
            const originalContent = await this.getOriginalContent(config);
            const changeAnalysis = await this.analyzeChanges(originalContent, currentContent, config);
            if (config.ignoreMinorChanges && changeAnalysis.changeType === 'minor') {
                await prisma.documentChangeMonitor.update({
                    where: { id: config.id },
                    data: { lastContentHash: currentHash }
                });
                return null;
            }
            const changeResult = {
                id: crypto_1.default.randomUUID(),
                monitorId: config.id,
                detectedAt: new Date(),
                changeType: changeAnalysis.changeType,
                changeScore: changeAnalysis.changeScore,
                affectedSections: changeAnalysis.affectedSections,
                originalContent: originalContent.substring(0, 10000),
                newContent: currentContent.substring(0, 10000),
                contentHash: currentHash,
                diffSummary: changeAnalysis.diffSummary,
                originalAnalysis: changeAnalysis.originalAnalysis,
                newAnalysis: changeAnalysis.newAnalysis,
                analysisChanged: changeAnalysis.analysisChanged,
                riskScoreChange: changeAnalysis.riskScoreChange,
                addedContent: changeAnalysis.addedContent,
                removedContent: changeAnalysis.removedContent,
                modifiedSections: changeAnalysis.modifiedSections,
                newRiskyPatterns: changeAnalysis.newRiskyPatterns,
                removedRiskyPatterns: changeAnalysis.removedRiskyPatterns,
                metadata: {
                    contentLength: currentContent.length,
                    wordCount: currentContent.split(/\s+/).length,
                    checkDuration: Date.now() - startTime,
                    userAgent: 'FinePrintAI-Monitor/1.0'
                }
            };
            await this.storeChangeRecord(changeResult);
            await prisma.documentChangeMonitor.update({
                where: { id: config.id },
                data: { lastContentHash: currentHash }
            });
            logger.info('Change detected and recorded', {
                monitorId: config.id,
                changeType: changeResult.changeType,
                changeScore: changeResult.changeScore
            });
            return changeResult;
        }
        catch (error) {
            logger.error('Check performance failed', {
                error: error.message,
                monitorId: config.id,
                url: config.url
            });
            throw error;
        }
    }
    async analyzeChanges(originalContent, newContent, config) {
        const originalWords = originalContent.split(/\s+/);
        const newWords = newContent.split(/\s+/);
        const changeScore = this.calculateChangeScore(originalContent, newContent);
        const changeType = this.determineChangeType(changeScore, config.sensitivity);
        const addedContent = this.findAddedContent(originalContent, newContent);
        const removedContent = this.findRemovedContent(originalContent, newContent);
        const modifiedSections = this.findModifiedSections(originalContent, newContent, config.sectionsToWatch);
        const newRiskyPatterns = await this.findRiskyPatterns(newContent, config.keywordsToWatch);
        const originalRiskyPatterns = await this.findRiskyPatterns(originalContent, config.keywordsToWatch);
        const removedRiskyPatterns = originalRiskyPatterns.filter(p => !newRiskyPatterns.includes(p));
        const addedRiskyPatterns = newRiskyPatterns.filter(p => !originalRiskyPatterns.includes(p));
        const diffSummary = this.generateDiffSummary(addedContent, removedContent, modifiedSections.length);
        const affectedSections = this.identifyAffectedSections(modifiedSections, config.sectionsToWatch);
        let originalAnalysis, newAnalysis, analysisChanged = false, riskScoreChange = 0;
        try {
            const [origAnalysis, newAnalysisResult] = await Promise.all([
                this.getAnalysisForContent(originalContent, config.userId),
                this.getAnalysisForContent(newContent, config.userId)
            ]);
            if (origAnalysis && newAnalysisResult) {
                originalAnalysis = {
                    riskScore: origAnalysis.overallRiskScore || 0,
                    keyFindings: origAnalysis.keyFindings || []
                };
                newAnalysis = {
                    riskScore: newAnalysisResult.overallRiskScore || 0,
                    keyFindings: newAnalysisResult.keyFindings || []
                };
                riskScoreChange = newAnalysis.riskScore - originalAnalysis.riskScore;
                analysisChanged = Math.abs(riskScoreChange) > 5;
            }
        }
        catch (error) {
            logger.warn('Failed to compare analyses', { error: error.message });
        }
        return {
            changeType,
            changeScore,
            affectedSections,
            diffSummary,
            originalAnalysis,
            newAnalysis,
            analysisChanged,
            riskScoreChange,
            addedContent: addedContent.slice(0, 10),
            removedContent: removedContent.slice(0, 10),
            modifiedSections: modifiedSections.slice(0, 5),
            newRiskyPatterns: addedRiskyPatterns,
            removedRiskyPatterns
        };
    }
    calculateChangeScore(original, current) {
        const originalWords = new Set(original.toLowerCase().split(/\s+/));
        const currentWords = new Set(current.toLowerCase().split(/\s+/));
        const intersection = new Set([...originalWords].filter(word => currentWords.has(word)));
        const union = new Set([...originalWords, ...currentWords]);
        const similarity = intersection.size / union.size;
        return Math.round((1 - similarity) * 100);
    }
    determineChangeType(changeScore, sensitivity) {
        const thresholds = {
            low: { minor: 10, moderate: 25, major: 50 },
            medium: { minor: 5, moderate: 15, major: 35 },
            high: { minor: 2, moderate: 8, major: 20 }
        };
        const threshold = thresholds[sensitivity] || thresholds.medium;
        if (changeScore >= threshold.major)
            return 'critical';
        if (changeScore >= threshold.moderate)
            return 'major';
        if (changeScore >= threshold.minor)
            return 'moderate';
        return 'minor';
    }
    findAddedContent(original, current) {
        const originalSentences = original.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
        const currentSentences = current.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
        return currentSentences.filter(sentence => !originalSentences.some(orig => this.areSimilar(orig, sentence, 0.8)));
    }
    findRemovedContent(original, current) {
        const originalSentences = original.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
        const currentSentences = current.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
        return originalSentences.filter(sentence => !currentSentences.some(curr => this.areSimilar(curr, sentence, 0.8)));
    }
    findModifiedSections(original, current, sectionsToWatch) {
        const modifications = [];
        if (!sectionsToWatch || sectionsToWatch.length === 0) {
            return modifications;
        }
        for (const section of sectionsToWatch) {
            const origSection = this.extractSection(original, section);
            const newSection = this.extractSection(current, section);
            if (origSection && newSection && origSection !== newSection) {
                modifications.push({
                    section,
                    originalText: origSection.substring(0, 500),
                    newText: newSection.substring(0, 500)
                });
            }
        }
        return modifications;
    }
    extractSection(content, sectionName) {
        const regex = new RegExp(`${sectionName}[:\\s]*([\\s\\S]*?)(?=\\n\\n|\\n[A-Z][a-z]+:|$)`, 'i');
        const match = content.match(regex);
        return match ? match[1].trim() : null;
    }
    async findRiskyPatterns(content, keywords) {
        const riskyPatterns = [];
        const defaultRiskyKeywords = [
            'unlimited liability', 'no warranty', 'at your own risk',
            'may collect personal data', 'share with third parties',
            'automatic renewal', 'binding arbitration', 'class action waiver'
        ];
        const keywordsToCheck = [...(keywords || []), ...defaultRiskyKeywords];
        for (const keyword of keywordsToCheck) {
            if (content.toLowerCase().includes(keyword.toLowerCase())) {
                riskyPatterns.push(keyword);
            }
        }
        return riskyPatterns;
    }
    generateDiffSummary(added, removed, modifiedCount) {
        const parts = [];
        if (added.length > 0) {
            parts.push(`${added.length} section(s) added`);
        }
        if (removed.length > 0) {
            parts.push(`${removed.length} section(s) removed`);
        }
        if (modifiedCount > 0) {
            parts.push(`${modifiedCount} section(s) modified`);
        }
        return parts.length > 0 ? parts.join(', ') : 'Minor text changes detected';
    }
    identifyAffectedSections(modifiedSections, sectionsToWatch) {
        const affected = modifiedSections.map(m => m.section);
        if (modifiedSections.some(m => m.section.toLowerCase().includes('privacy'))) {
            affected.push('Privacy Policy');
        }
        if (modifiedSections.some(m => m.section.toLowerCase().includes('terms'))) {
            affected.push('Terms of Service');
        }
        return [...new Set(affected)];
    }
    areSimilar(text1, text2, threshold) {
        const words1 = new Set(text1.toLowerCase().split(/\s+/));
        const words2 = new Set(text2.toLowerCase().split(/\s+/));
        const intersection = new Set([...words1].filter(word => words2.has(word)));
        const union = new Set([...words1, ...words2]);
        const similarity = intersection.size / union.size;
        return similarity >= threshold;
    }
    async getAnalysisForContent(content, userId) {
        try {
            const analysisRequest = {
                content,
                userId,
                teamId: undefined,
                options: {
                    modelPreference: 'speed',
                    includeEmbeddings: false
                }
            };
            const result = await analysisEngine_1.unifiedAnalysisEngine.createAnalysis(analysisRequest);
            return result.results;
        }
        catch (error) {
            logger.warn('Failed to get analysis for content', { error: error.message });
            return null;
        }
    }
    async sendAlerts(config, change) {
        try {
            for (const alertType of config.alertTypes) {
                await this.sendAlert(config, change, alertType);
            }
        }
        catch (error) {
            logger.error('Failed to send alerts', { error: error.message, monitorId: config.id });
        }
    }
    async sendAlert(config, change, alertType) {
        const alertId = crypto_1.default.randomUUID();
        const priority = this.getAlertPriority(change.changeType);
        try {
            let deliveryStatus = 'pending';
            let errorMessage;
            switch (alertType) {
                case 'email':
                    if (config.emailRecipients && config.emailRecipients.length > 0) {
                        await this.sendEmailAlert(config, change);
                        deliveryStatus = 'sent';
                    }
                    break;
                case 'webhook':
                    if (config.webhookUrl) {
                        await this.sendWebhookAlert(config, change);
                        deliveryStatus = 'sent';
                    }
                    break;
                case 'websocket':
                    if (this.wsService) {
                        this.wsService.sendToUser(config.userId, 'document_change_detected', {
                            monitorId: config.id,
                            changeId: change.id,
                            changeType: change.changeType,
                            url: config.url,
                            changeScore: change.changeScore
                        });
                        deliveryStatus = 'sent';
                    }
                    break;
                case 'sms':
                    break;
            }
            await prisma.monitoringAlert.create({
                data: {
                    id: alertId,
                    monitorId: config.id,
                    changeId: change.id,
                    alertType,
                    title: this.generateAlertTitle(change),
                    message: this.generateAlertMessage(config, change),
                    priority,
                    deliveryStatus,
                    errorMessage,
                    sentAt: deliveryStatus === 'sent' ? new Date() : undefined
                }
            });
        }
        catch (error) {
            logger.error('Failed to send individual alert', {
                error: error.message,
                alertType,
                monitorId: config.id
            });
            await prisma.monitoringAlert.create({
                data: {
                    id: alertId,
                    monitorId: config.id,
                    changeId: change.id,
                    alertType,
                    title: this.generateAlertTitle(change),
                    message: this.generateAlertMessage(config, change),
                    priority,
                    deliveryStatus: 'failed',
                    errorMessage: error.message
                }
            });
        }
    }
    async sendEmailAlert(config, change) {
        if (!this.notificationService || !config.emailRecipients)
            return;
        const subject = `Document Change Alert: ${change.changeType.toUpperCase()} changes detected`;
        const body = this.generateEmailBody(config, change);
        for (const recipient of config.emailRecipients) {
            await this.notificationService.sendEmail({
                to: recipient,
                subject,
                body,
                priority: this.getAlertPriority(change.changeType)
            });
        }
    }
    async sendWebhookAlert(config, change) {
        if (!config.webhookUrl)
            return;
        const payload = {
            monitorId: config.id,
            changeId: change.id,
            url: config.url,
            changeType: change.changeType,
            changeScore: change.changeScore,
            detectedAt: change.detectedAt,
            diffSummary: change.diffSummary,
            affectedSections: change.affectedSections,
            riskScoreChange: change.riskScoreChange
        };
        const response = await (0, node_fetch_1.default)(config.webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'FinePrintAI-Monitor/1.0'
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw new Error(`Webhook failed with status ${response.status}`);
        }
    }
    getAlertPriority(changeType) {
        const priorityMap = {
            minor: 'low',
            moderate: 'medium',
            major: 'high',
            critical: 'critical'
        };
        return priorityMap[changeType] || 'medium';
    }
    generateAlertTitle(change) {
        return `${change.changeType.toUpperCase()} document changes detected (${change.changeScore}% change)`;
    }
    generateAlertMessage(config, change) {
        return `Document monitoring alert for ${config.url}\n\n` +
            `Change Type: ${change.changeType}\n` +
            `Change Score: ${change.changeScore}%\n` +
            `Affected Sections: ${change.affectedSections.join(', ')}\n` +
            `Summary: ${change.diffSummary}\n\n` +
            `View details: /dashboard/monitoring/${config.id}/changes/${change.id}`;
    }
    generateEmailBody(config, change) {
        return `
    <h2>Document Change Alert</h2>
    <p>Changes have been detected in the document you're monitoring:</p>
    
    <h3>Change Details</h3>
    <ul>
      <li><strong>URL:</strong> ${config.url}</li>
      <li><strong>Change Type:</strong> ${change.changeType}</li>
      <li><strong>Change Score:</strong> ${change.changeScore}%</li>
      <li><strong>Detected At:</strong> ${change.detectedAt.toLocaleString()}</li>
    </ul>
    
    <h3>Summary</h3>
    <p>${change.diffSummary}</p>
    
    ${change.affectedSections.length > 0 ? `
    <h3>Affected Sections</h3>
    <ul>
      ${change.affectedSections.map(section => `<li>${section}</li>`).join('')}
    </ul>
    ` : ''}
    
    ${change.riskScoreChange !== 0 ? `
    <h3>Risk Score Change</h3>
    <p>The risk score has changed by ${change.riskScoreChange > 0 ? '+' : ''}${change.riskScoreChange}%</p>
    ` : ''}
    
    <p><a href="/dashboard/monitoring/${config.id}/changes/${change.id}">View Full Details</a></p>
    `;
    }
    async storeChangeRecord(change) {
        await prisma.documentChange.create({
            data: {
                id: change.id,
                monitorId: change.monitorId,
                detectedAt: change.detectedAt,
                changeType: change.changeType,
                changeScore: change.changeScore,
                affectedSections: change.affectedSections,
                contentHash: change.contentHash,
                diffSummary: change.diffSummary,
                analysisChanged: change.analysisChanged,
                riskScoreChange: change.riskScoreChange,
                changeData: {
                    originalContent: change.originalContent.substring(0, 5000),
                    newContent: change.newContent.substring(0, 5000),
                    addedContent: change.addedContent,
                    removedContent: change.removedContent,
                    modifiedSections: change.modifiedSections,
                    newRiskyPatterns: change.newRiskyPatterns,
                    removedRiskyPatterns: change.removedRiskyPatterns,
                    metadata: change.metadata
                }
            }
        });
    }
    async fetchContentSafely(url) {
        try {
            const response = await (0, node_fetch_1.default)(url, {
                headers: {
                    'User-Agent': 'FinePrintAI-Monitor/1.0'
                },
                timeout: 30000
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const content = await response.text();
            const extractionResult = await textProcessor_1.textProcessor.extractFromBuffer(Buffer.from(content, 'utf-8'), 'fetched-content.html');
            return extractionResult.content;
        }
        catch (error) {
            logger.error('Failed to fetch content safely', { error: error.message, url });
            throw error;
        }
    }
    async getOriginalContent(config) {
        try {
            const analysis = await prisma.documentAnalysis.findUnique({
                where: { id: config.analysisId },
                include: { document: true }
            });
            if (analysis?.document?.content) {
                return analysis.document.content;
            }
            return await this.fetchContentSafely(config.url);
        }
        catch (error) {
            logger.warn('Failed to get original content', { error: error.message, monitorId: config.id });
            return await this.fetchContentSafely(config.url);
        }
    }
    async validateUrl(url) {
        try {
            const parsedUrl = new URL(url);
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                throw new Error('Only HTTP and HTTPS URLs are supported');
            }
            const response = await (0, node_fetch_1.default)(url, {
                method: 'HEAD',
                timeout: 10000
            });
            if (!response.ok) {
                throw new Error(`URL is not accessible: ${response.status} ${response.statusText}`);
            }
        }
        catch (error) {
            throw new Error(`Invalid URL: ${error.message}`);
        }
    }
    calculateNextCheck(intervalSeconds, schedule) {
        const nextCheck = new Date();
        if (schedule) {
            nextCheck.setHours(nextCheck.getHours() + 1);
        }
        else {
            nextCheck.setSeconds(nextCheck.getSeconds() + intervalSeconds);
        }
        return nextCheck;
    }
    async loadActiveMonitors() {
        try {
            const activeMonitors = await prisma.documentChangeMonitor.findMany({
                where: {
                    enabled: true,
                    status: 'active',
                    deletedAt: null
                }
            });
            for (const monitor of activeMonitors) {
                const config = this.mapDatabaseToConfig(monitor);
                await this.startMonitoring(monitor.id, config);
            }
            logger.info('Loaded active monitors', { count: activeMonitors.length });
        }
        catch (error) {
            logger.error('Failed to load active monitors', { error: error.message });
        }
    }
    startCleanupJob() {
        node_cron_1.default.schedule('0 2 * * *', async () => {
            try {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                const deleted = await prisma.documentChange.deleteMany({
                    where: {
                        detectedAt: { lt: thirtyDaysAgo }
                    }
                });
                logger.info('Cleaned up old change records', { deletedCount: deleted.count });
            }
            catch (error) {
                logger.error('Cleanup job failed', { error: error.message });
            }
        });
    }
    mapDatabaseToConfig(monitor) {
        return {
            id: monitor.id,
            userId: monitor.userId,
            teamId: monitor.teamId,
            analysisId: monitor.analysisId,
            url: monitor.url,
            enabled: monitor.enabled,
            checkInterval: monitor.checkInterval,
            sensitivity: monitor.sensitivity,
            alertTypes: monitor.alertTypes || [],
            webhookUrl: monitor.webhookUrl,
            emailRecipients: monitor.emailRecipients || [],
            schedule: monitor.schedule,
            timezone: monitor.timezone,
            ignoreMinorChanges: monitor.ignoreMinorChanges,
            keywordsToWatch: monitor.keywordsToWatch || [],
            sectionsToWatch: monitor.sectionsToWatch || [],
            createdAt: monitor.createdAt,
            updatedAt: monitor.updatedAt,
            lastCheck: monitor.lastCheck,
            nextCheck: monitor.nextCheck,
            status: monitor.status,
            errorMessage: monitor.errorMessage,
            checksPerformed: monitor.checksPerformed,
            changesDetected: monitor.changesDetected
        };
    }
    mapDatabaseToChangeResult(change) {
        const changeData = change.changeData || {};
        return {
            id: change.id,
            monitorId: change.monitorId,
            detectedAt: change.detectedAt,
            changeType: change.changeType,
            changeScore: change.changeScore,
            affectedSections: change.affectedSections || [],
            originalContent: changeData.originalContent || '',
            newContent: changeData.newContent || '',
            contentHash: change.contentHash,
            diffSummary: change.diffSummary,
            originalAnalysis: changeData.originalAnalysis,
            newAnalysis: changeData.newAnalysis,
            analysisChanged: change.analysisChanged,
            riskScoreChange: change.riskScoreChange,
            addedContent: changeData.addedContent || [],
            removedContent: changeData.removedContent || [],
            modifiedSections: changeData.modifiedSections || [],
            newRiskyPatterns: changeData.newRiskyPatterns || [],
            removedRiskyPatterns: changeData.removedRiskyPatterns || [],
            metadata: changeData.metadata || {}
        };
    }
}
exports.ChangeMonitoringService = ChangeMonitoringService;
exports.changeMonitoringService = new ChangeMonitoringService();
//# sourceMappingURL=changeMonitor.js.map