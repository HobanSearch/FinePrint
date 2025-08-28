"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComplianceMonitorService = void 0;
const logger_1 = require("../utils/logger");
class ComplianceMonitorService {
    prisma;
    isRunning = false;
    monitoringInterval = null;
    complianceRules = [];
    constructor(prisma) {
        this.prisma = prisma;
        this.initializeComplianceRules();
    }
    async startMonitoring() {
        if (this.isRunning) {
            logger_1.logger.warn('Compliance monitoring is already running');
            return;
        }
        this.isRunning = true;
        logger_1.logger.info('Starting compliance monitoring');
        await this.runComplianceCheck();
        this.monitoringInterval = setInterval(async () => {
            try {
                await this.runComplianceCheck();
            }
            catch (error) {
                logger_1.logger.error('Error in periodic compliance check:', error);
            }
        }, 2 * 60 * 60 * 1000);
    }
    async stop() {
        this.isRunning = false;
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        logger_1.logger.info('Compliance monitoring stopped');
    }
    initializeComplianceRules() {
        this.complianceRules = [
            {
                id: 'gdpr_consent_clear',
                name: 'Clear Consent Language',
                regulation: 'GDPR',
                region: 'EU',
                category: 'consent',
                severity: 'high',
                description: 'Consent must be freely given, specific, informed and unambiguous',
                pattern: '(consent|agree|accept).{0,50}(clear|specific|informed|unambiguous|freely)',
                positiveMatch: true,
                isActive: true,
            },
            {
                id: 'gdpr_data_portability',
                name: 'Data Portability Rights',
                regulation: 'GDPR',
                region: 'EU',
                category: 'deletion',
                severity: 'medium',
                description: 'Users must have the right to data portability',
                pattern: '(data.{0,20}portability|export.{0,20}data|download.{0,20}data)',
                positiveMatch: true,
                isActive: true,
            },
            {
                id: 'gdpr_right_to_be_forgotten',
                name: 'Right to Erasure',
                regulation: 'GDPR',
                region: 'EU',
                category: 'deletion',
                severity: 'high',
                description: 'Users must have the right to request deletion of their data',
                pattern: '(right.{0,20}erasure|right.{0,20}forgotten|delete.{0,20}data|remove.{0,20}data)',
                positiveMatch: true,
                isActive: true,
            },
            {
                id: 'gdpr_dpo_contact',
                name: 'Data Protection Officer Contact',
                regulation: 'GDPR',
                region: 'EU',
                category: 'disclosure',
                severity: 'medium',
                description: 'Contact information for DPO must be provided',
                pattern: '(data.{0,20}protection.{0,20}officer|DPO|privacy.{0,20}officer)',
                positiveMatch: true,
                isActive: true,
            },
            {
                id: 'ccpa_right_to_know',
                name: 'Right to Know',
                regulation: 'CCPA',
                region: 'US',
                category: 'disclosure',
                severity: 'high',
                description: 'Users have the right to know what personal information is collected',
                pattern: '(right.{0,20}know|right.{0,20}information|categories.{0,20}personal.{0,20}information)',
                positiveMatch: true,
                isActive: true,
            },
            {
                id: 'ccpa_do_not_sell',
                name: 'Do Not Sell Rights',
                regulation: 'CCPA',
                region: 'US',
                category: 'disclosure',
                severity: 'high',
                description: 'Users must have option to opt-out of sale of personal information',
                pattern: '(do.{0,20}not.{0,20}sell|opt.{0,20}out.{0,20}sale|sale.{0,20}personal.{0,20}information)',
                positiveMatch: true,
                isActive: true,
            },
            {
                id: 'coppa_parental_consent',
                name: 'Parental Consent for Children',
                regulation: 'COPPA',
                region: 'US',
                category: 'children',
                severity: 'critical',
                description: 'Parental consent required for children under 13',
                pattern: '(parent.{0,20}consent|children.{0,20}under.{0,20}13|age.{0,20}verification)',
                positiveMatch: true,
                isActive: true,
            },
            {
                id: 'coppa_no_behavioral_advertising',
                name: 'No Behavioral Advertising to Children',
                regulation: 'COPPA',
                region: 'US',
                category: 'children',
                severity: 'high',
                description: 'Behavioral advertising prohibited for children under 13',
                pattern: '(behavioral.{0,20}advertising|targeted.{0,20}advertising).{0,100}(children|minor|under.{0,10}13)',
                positiveMatch: false,
                isActive: true,
            },
            {
                id: 'general_third_party_sharing',
                name: 'Third Party Data Sharing Disclosure',
                regulation: 'GDPR',
                region: 'GLOBAL',
                category: 'disclosure',
                severity: 'medium',
                description: 'Clear disclosure of third-party data sharing',
                pattern: '(third.{0,20}part|share.{0,20}data|partner|vendor).{0,100}(personal.{0,20}information|data)',
                positiveMatch: true,
                isActive: true,
            },
            {
                id: 'general_data_retention',
                name: 'Data Retention Period',
                regulation: 'GDPR',
                region: 'GLOBAL',
                category: 'retention',
                severity: 'medium',
                description: 'Clear statement of data retention periods',
                pattern: '(retain.{0,20}data|keep.{0,20}information|storage.{0,20}period|delete.{0,20}after)',
                positiveMatch: true,
                isActive: true,
            },
            {
                id: 'general_cookie_consent',
                name: 'Cookie Consent',
                regulation: 'GDPR',
                region: 'EU',
                category: 'consent',
                severity: 'medium',
                description: 'Proper cookie consent mechanism',
                pattern: '(cookie.{0,20}consent|accept.{0,20}cookies|cookie.{0,20}banner)',
                positiveMatch: true,
                isActive: true,
            },
        ];
        logger_1.logger.info(`Initialized ${this.complianceRules.length} compliance rules`);
    }
    async runComplianceCheck() {
        logger_1.logger.info('Starting compliance check');
        try {
            const documents = await this.getDocumentsForComplianceCheck();
            let totalAlerts = 0;
            for (const document of documents) {
                const alerts = await this.checkDocumentCompliance(document);
                totalAlerts += alerts.length;
                for (const alert of alerts) {
                    await this.saveComplianceAlert(alert);
                }
            }
            await this.updateComplianceScores();
            logger_1.logger.info(`Compliance check completed. Generated ${totalAlerts} alerts for ${documents.length} documents`);
        }
        catch (error) {
            logger_1.logger.error('Error in compliance check:', error);
        }
    }
    async getDocumentsForComplianceCheck() {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return await this.prisma.aggregatedDocument.findMany({
            where: {
                OR: [
                    { lastAnalyzed: { gte: since } },
                    { lastComplianceCheck: null },
                ],
            },
            include: {
                documentAnalyses: {
                    where: { status: 'completed' },
                    orderBy: { completedAt: 'desc' },
                    take: 1,
                },
            },
            take: 100,
        });
    }
    async checkDocumentCompliance(document) {
        const alerts = [];
        const content = document.content.toLowerCase();
        for (const rule of this.complianceRules.filter(r => r.isActive)) {
            try {
                const regex = new RegExp(rule.pattern, 'gi');
                const matches = content.match(regex);
                const hasMatch = matches && matches.length > 0;
                const isViolation = rule.positiveMatch ? !hasMatch : hasMatch;
                if (isViolation) {
                    const alert = {
                        id: `${document.id}_${rule.id}_${Date.now()}`,
                        documentId: document.id,
                        websiteName: document.websiteName,
                        ruleId: rule.id,
                        ruleName: rule.name,
                        regulation: rule.regulation,
                        severity: rule.severity,
                        alertType: rule.positiveMatch ? 'missing_requirement' : 'violation',
                        description: rule.description,
                        excerpt: this.extractRelevantExcerpt(document.content, rule.pattern),
                        recommendations: this.generateRecommendations(rule),
                        detectedAt: new Date(),
                        isResolved: false,
                    };
                    alerts.push(alert);
                }
            }
            catch (error) {
                logger_1.logger.error(`Error checking rule ${rule.id}:`, error);
            }
        }
        return alerts;
    }
    extractRelevantExcerpt(content, pattern) {
        try {
            const regex = new RegExp(pattern, 'gi');
            const match = regex.exec(content);
            if (match) {
                const start = Math.max(0, match.index - 100);
                const end = Math.min(content.length, match.index + match[0].length + 100);
                return '...' + content.substring(start, end) + '...';
            }
            return content.substring(0, 200) + '...';
        }
        catch (error) {
            return 'Unable to extract excerpt';
        }
    }
    generateRecommendations(rule) {
        const recommendationMap = {
            'gdpr_consent_clear': [
                'Use clear, plain language for consent requests',
                'Separate consent from other terms and conditions',
                'Provide granular consent options for different data processing purposes',
            ],
            'gdpr_data_portability': [
                'Implement a data export feature',
                'Provide data in a structured, commonly used format',
                'Include all personal data in the export',
            ],
            'gdpr_right_to_be_forgotten': [
                'Add clear instructions for data deletion requests',
                'Implement automated deletion processes where possible',
                'Specify timeframes for deletion completion',
            ],
            'ccpa_do_not_sell': [
                'Add a prominent "Do Not Sell My Personal Information" link',
                'Implement opt-out mechanisms',
                'Honor opt-out requests within 15 days',
            ],
            'coppa_parental_consent': [
                'Implement age verification mechanisms',
                'Require verifiable parental consent for users under 13',
                'Provide clear notice to parents about data collection',
            ],
        };
        return recommendationMap[rule.id] || [
            'Review and update privacy policy language',
            'Consult with legal counsel for compliance guidance',
            'Implement necessary technical or procedural changes',
        ];
    }
    async saveComplianceAlert(alert) {
        try {
            const existingAlert = await this.prisma.complianceAlert.findFirst({
                where: {
                    documentId: alert.documentId,
                    ruleId: alert.ruleId,
                    isResolved: false,
                },
            });
            if (existingAlert) {
                await this.prisma.complianceAlert.update({
                    where: { id: existingAlert.id },
                    data: {
                        severity: alert.severity,
                        excerpt: alert.excerpt,
                        detectedAt: alert.detectedAt,
                    },
                });
            }
            else {
                await this.prisma.complianceAlert.create({
                    data: {
                        documentId: alert.documentId,
                        websiteName: alert.websiteName,
                        ruleId: alert.ruleId,
                        ruleName: alert.ruleName,
                        regulation: alert.regulation,
                        severity: alert.severity,
                        alertType: alert.alertType,
                        description: alert.description,
                        excerpt: alert.excerpt,
                        recommendations: alert.recommendations,
                        detectedAt: alert.detectedAt,
                        isResolved: false,
                    },
                });
            }
            await this.prisma.aggregatedDocument.update({
                where: { id: alert.documentId },
                data: { lastComplianceCheck: new Date() },
            });
        }
        catch (error) {
            logger_1.logger.error('Error saving compliance alert:', error);
        }
    }
    async updateComplianceScores() {
        const regulations = ['GDPR', 'CCPA', 'COPPA', 'PIPEDA', 'LGPD', 'PDPA'];
        for (const regulation of regulations) {
            try {
                const score = await this.calculateComplianceScore(regulation);
                await this.saveComplianceScore(regulation, score);
            }
            catch (error) {
                logger_1.logger.error(`Error updating compliance score for ${regulation}:`, error);
            }
        }
    }
    async calculateComplianceScore(regulation) {
        const rules = this.complianceRules.filter(r => r.regulation === regulation && r.isActive);
        const totalRules = rules.length;
        const alerts = await this.prisma.complianceAlert.findMany({
            where: {
                regulation,
                isResolved: false,
                detectedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
            },
        });
        const criticalViolations = alerts.filter(a => a.severity === 'critical').length;
        const highViolations = alerts.filter(a => a.severity === 'high').length;
        const mediumViolations = alerts.filter(a => a.severity === 'medium').length;
        const lowViolations = alerts.filter(a => a.severity === 'low').length;
        const violationPenalty = (criticalViolations * 20) +
            (highViolations * 10) +
            (mediumViolations * 5) +
            (lowViolations * 2);
        const maxPossibleScore = 100;
        const score = Math.max(0, maxPossibleScore - violationPenalty);
        const failedRules = new Set(alerts.map(a => a.ruleId)).size;
        const passedRules = totalRules - failedRules;
        return {
            regulation,
            score,
            passing: score >= 70,
            totalRules,
            passedRules,
            failedRules,
            criticalViolations,
            lastAssessed: new Date(),
        };
    }
    async saveComplianceScore(regulation, score) {
        try {
            await this.prisma.complianceScore.upsert({
                where: { regulation },
                update: score,
                create: score,
            });
        }
        catch (error) {
            logger_1.logger.error('Error saving compliance score:', error);
        }
    }
    async getRecentAlerts(severity, limit = 50) {
        const whereClause = { isResolved: false };
        if (severity) {
            whereClause.severity = severity;
        }
        try {
            return await this.prisma.complianceAlert.findMany({
                where: whereClause,
                orderBy: { detectedAt: 'desc' },
                take: limit,
            });
        }
        catch (error) {
            logger_1.logger.error('Error fetching compliance alerts:', error);
            return [];
        }
    }
    async getComplianceScores() {
        try {
            return await this.prisma.complianceScore.findMany({
                orderBy: { lastAssessed: 'desc' },
            });
        }
        catch (error) {
            logger_1.logger.error('Error fetching compliance scores:', error);
            return [];
        }
    }
    async getRegulatoryChanges(region, days = 30) {
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const whereClause = { detectedAt: { gte: since } };
        if (region) {
            whereClause.region = region;
        }
        try {
            return await this.prisma.regulatoryChange.findMany({
                where: whereClause,
                orderBy: { detectedAt: 'desc' },
            });
        }
        catch (error) {
            logger_1.logger.error('Error fetching regulatory changes:', error);
            return [];
        }
    }
    async resolveAlert(alertId) {
        try {
            await this.prisma.complianceAlert.update({
                where: { id: alertId },
                data: {
                    isResolved: true,
                    resolvedAt: new Date(),
                },
            });
            logger_1.logger.info(`Compliance alert resolved: ${alertId}`);
        }
        catch (error) {
            logger_1.logger.error('Error resolving compliance alert:', error);
        }
    }
    async addCustomRule(rule) {
        const customRule = {
            ...rule,
            id: `custom_${Date.now()}`,
        };
        this.complianceRules.push(customRule);
        logger_1.logger.info(`Added custom compliance rule: ${customRule.id}`);
    }
    async getComplianceStatistics() {
        try {
            const [totalAlerts, resolvedAlerts, criticalAlerts, recentScores] = await Promise.all([
                this.prisma.complianceAlert.count(),
                this.prisma.complianceAlert.count({ where: { isResolved: true } }),
                this.prisma.complianceAlert.count({ where: { severity: 'critical', isResolved: false } }),
                this.prisma.complianceScore.findMany({
                    orderBy: { lastAssessed: 'desc' },
                    take: 10,
                }),
            ]);
            return {
                totalAlerts,
                resolvedAlerts,
                criticalAlerts,
                resolutionRate: totalAlerts > 0 ? (resolvedAlerts / totalAlerts) * 100 : 0,
                averageScore: recentScores.reduce((sum, s) => sum + s.score, 0) / Math.max(recentScores.length, 1),
                lastUpdated: new Date(),
            };
        }
        catch (error) {
            logger_1.logger.error('Error fetching compliance statistics:', error);
            return {};
        }
    }
}
exports.ComplianceMonitorService = ComplianceMonitorService;
//# sourceMappingURL=compliance-monitor.js.map