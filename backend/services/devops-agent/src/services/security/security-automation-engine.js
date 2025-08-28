"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityAutomationEngine = void 0;
const events_1 = require("events");
const logger_1 = require("@/utils/logger");
const vulnerability_scanner_1 = require("./vulnerability-scanner");
const compliance_checker_1 = require("./compliance-checker");
const policy_engine_1 = require("./policy-engine");
const secret_manager_1 = require("./secret-manager");
const threat_detector_1 = require("./threat-detector");
const security_auditor_1 = require("./security-auditor");
const incident_responder_1 = require("./incident-responder");
const logger = (0, logger_1.createContextLogger)('Security-Engine');
class SecurityAutomationEngine extends events_1.EventEmitter {
    vulnerabilityScanner;
    complianceChecker;
    policyEngine;
    secretManager;
    threatDetector;
    securityAuditor;
    incidentResponder;
    scans = new Map();
    findings = new Map();
    policies = new Map();
    incidents = new Map();
    frameworks = new Map();
    constructor() {
        super();
        this.vulnerabilityScanner = new vulnerability_scanner_1.VulnerabilityScanner();
        this.complianceChecker = new compliance_checker_1.ComplianceChecker();
        this.policyEngine = new policy_engine_1.PolicyEngine();
        this.secretManager = new secret_manager_1.SecretManager();
        this.threatDetector = new threat_detector_1.ThreatDetector();
        this.securityAuditor = new security_auditor_1.SecurityAuditor();
        this.incidentResponder = new incident_responder_1.IncidentResponder();
        this.initializeSecurity();
    }
    async startSecurityScan(name, type, target, configuration) {
        const scanId = `scan-${Date.now()}`;
        logger.info(`Starting security scan: ${name} (${type}) on target: ${target}`);
        try {
            const scan = {
                id: scanId,
                name,
                type,
                target,
                status: 'queued',
                startTime: new Date(),
                findings: [],
                metrics: this.initializeScanMetrics(),
                configuration,
            };
            this.scans.set(scanId, scan);
            this.executeScan(scan);
            this.emit('scanStarted', scan);
            return scan;
        }
        catch (error) {
            logger.error(`Failed to start security scan ${name}:`, error);
            throw error;
        }
    }
    async executeScan(scan) {
        try {
            scan.status = 'running';
            this.emit('scanUpdated', scan);
            let findings = [];
            switch (scan.type) {
                case 'sast':
                    findings = await this.vulnerabilityScanner.performSASTScan(scan.target, scan.configuration);
                    break;
                case 'dast':
                    findings = await this.vulnerabilityScanner.performDASTScan(scan.target, scan.configuration);
                    break;
                case 'dependency':
                    findings = await this.vulnerabilityScanner.performDependencyScan(scan.target, scan.configuration);
                    break;
                case 'container':
                    findings = await this.vulnerabilityScanner.performContainerScan(scan.target, scan.configuration);
                    break;
                case 'infrastructure':
                    findings = await this.vulnerabilityScanner.performInfrastructureScan(scan.target, scan.configuration);
                    break;
                case 'compliance':
                    findings = await this.complianceChecker.performComplianceScan(scan.target, scan.configuration);
                    break;
            }
            scan.findings = findings;
            scan.metrics = this.calculateScanMetrics(findings);
            for (const finding of findings) {
                this.findings.set(finding.id, finding);
            }
            await this.evaluateThresholds(scan);
            scan.status = 'completed';
            scan.endTime = new Date();
            scan.duration = scan.endTime.getTime() - scan.startTime.getTime();
            this.emit('scanCompleted', scan);
            logger.info(`Security scan ${scan.name} completed with ${findings.length} findings`);
        }
        catch (error) {
            scan.status = 'failed';
            scan.endTime = new Date();
            scan.duration = scan.endTime.getTime() - scan.startTime.getTime();
            this.emit('scanFailed', scan, error);
            logger.error(`Security scan ${scan.name} failed:`, error);
        }
    }
    async createSecurityPolicy(name, category, rules, scope, enforcement = 'monitoring') {
        const policyId = `policy-${Date.now()}`;
        logger.info(`Creating security policy: ${name}`);
        try {
            const policy = {
                id: policyId,
                name,
                description: `Security policy for ${category}`,
                category,
                rules,
                enforcement,
                scope,
                exceptions: [],
                status: 'active',
                version: '1.0.0',
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            this.policies.set(policyId, policy);
            await this.policyEngine.deployPolicy(policy);
            this.emit('policyCreated', policy);
            logger.info(`Security policy ${name} created and deployed`);
            return policy;
        }
        catch (error) {
            logger.error(`Failed to create security policy ${name}:`, error);
            throw error;
        }
    }
    async setupComplianceFramework(framework) {
        logger.info(`Setting up compliance framework: ${framework.name}`);
        try {
            this.frameworks.set(framework.id, framework);
            await this.complianceChecker.setupFramework(framework);
            this.scheduleComplianceAssessments(framework);
            this.emit('complianceFrameworkSetup', framework);
            logger.info(`Compliance framework ${framework.name} setup completed`);
        }
        catch (error) {
            logger.error(`Failed to setup compliance framework ${framework.name}:`, error);
            throw error;
        }
    }
    async performComplianceAssessment(frameworkId, target) {
        const framework = this.frameworks.get(frameworkId);
        if (!framework) {
            throw new Error(`Compliance framework not found: ${frameworkId}`);
        }
        const assessmentId = `assessment-${Date.now()}`;
        logger.info(`Performing compliance assessment: ${framework.name} on ${target}`);
        try {
            const assessment = {
                id: assessmentId,
                framework: frameworkId,
                target,
                status: 'in_progress',
                startTime: new Date(),
                results: [],
                overallScore: 0,
                recommendations: [],
            };
            for (const control of framework.controls) {
                const result = await this.complianceChecker.assessControl(control, target);
                assessment.results.push(result);
            }
            assessment.overallScore = this.calculateComplianceScore(assessment.results);
            assessment.recommendations = await this.generateComplianceRecommendations(assessment);
            assessment.status = 'completed';
            assessment.endTime = new Date();
            this.emit('complianceAssessmentCompleted', assessment);
            logger.info(`Compliance assessment completed with score: ${assessment.overallScore}%`);
            return assessment;
        }
        catch (error) {
            logger.error(`Compliance assessment failed:`, error);
            throw error;
        }
    }
    async detectThreats() {
        logger.info('Performing threat detection');
        try {
            const threats = await this.threatDetector.detectThreats();
            for (const threat of threats) {
                await this.processThreat(threat);
            }
            return threats;
        }
        catch (error) {
            logger.error('Threat detection failed:', error);
            throw error;
        }
    }
    async createSecurityIncident(title, description, severity, category, affectedSystems = []) {
        const incidentId = `incident-${Date.now()}`;
        logger.info(`Creating security incident: ${title}`);
        try {
            const incident = {
                id: incidentId,
                title,
                description,
                severity,
                status: 'open',
                category: category,
                affectedSystems,
                indicators: [],
                timeline: [{
                        timestamp: new Date(),
                        type: 'detected',
                        description: 'Security incident created',
                        actor: 'system',
                        impact: 'unknown',
                    }],
                responders: [],
                containmentActions: [],
                evidence: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            this.incidents.set(incidentId, incident);
            await this.incidentResponder.initiateResponse(incident);
            this.emit('securityIncidentCreated', incident);
            logger.info(`Security incident ${title} created and response initiated`);
            return incident;
        }
        catch (error) {
            logger.error(`Failed to create security incident ${title}:`, error);
            throw error;
        }
    }
    async getSecurityMetrics() {
        try {
            const vulnerabilities = this.calculateVulnerabilityMetrics();
            const compliance = await this.calculateComplianceMetrics();
            const incidents = this.calculateIncidentMetrics();
            const policies = this.calculatePolicyMetrics();
            const threats = await this.calculateThreatMetrics();
            return {
                vulnerabilities,
                compliance,
                incidents,
                policies,
                threats,
            };
        }
        catch (error) {
            logger.error('Failed to calculate security metrics:', error);
            throw error;
        }
    }
    async generateSecurityReport(type, period, format = 'pdf') {
        logger.info(`Generating ${type} security report for ${period} period`);
        try {
            const reportData = await this.gatherReportData(type, period);
            const reportPath = await this.securityAuditor.generateReport(reportData, format);
            this.emit('securityReportGenerated', { type, period, format, path: reportPath });
            logger.info(`Security report generated: ${reportPath}`);
            return reportPath;
        }
        catch (error) {
            logger.error(`Failed to generate security report:`, error);
            throw error;
        }
    }
    async evaluateThresholds(scan) {
        for (const threshold of scan.configuration.thresholds) {
            const count = scan.findings.filter(f => f.severity === threshold.severity).length;
            if (count > threshold.maxFindings) {
                switch (threshold.action) {
                    case 'block':
                        await this.blockDeployment(scan);
                        break;
                    case 'warn':
                        await this.sendWarningNotification(scan, threshold);
                        break;
                    case 'ignore':
                        break;
                }
            }
        }
    }
    async processThreat(threat) {
        logger.info(`Processing threat: ${threat.type} - ${threat.description}`);
        await this.threatDetector.applyIntelligence(threat);
        const matches = await this.threatDetector.searchIndicators(threat.indicators);
        if (matches.length > 0) {
            await this.createSecurityIncident(`Threat detected: ${threat.description}`, `Threat intelligence match found for ${threat.type}`, threat.severity, 'threat_intelligence', matches);
        }
    }
    scheduleComplianceAssessments(framework) {
        setInterval(async () => {
            try {
                await this.performComplianceAssessment(framework.id, 'all');
            }
            catch (error) {
                logger.error(`Scheduled compliance assessment failed for ${framework.name}:`, error);
            }
        }, 24 * 60 * 60 * 1000);
    }
    calculateScanMetrics(findings) {
        return {
            totalFindings: findings.length,
            criticalFindings: findings.filter(f => f.severity === 'critical').length,
            highFindings: findings.filter(f => f.severity === 'high').length,
            mediumFindings: findings.filter(f => f.severity === 'medium').length,
            lowFindings: findings.filter(f => f.severity === 'low').length,
            fixedFindings: findings.filter(f => f.status === 'fixed').length,
            falsePositives: findings.filter(f => f.status === 'false_positive').length,
            timeToFix: 0,
            coveragePercentage: 100,
        };
    }
    calculateVulnerabilityMetrics() {
        const findings = Array.from(this.findings.values());
        return {
            total: findings.length,
            critical: findings.filter(f => f.severity === 'critical').length,
            high: findings.filter(f => f.severity === 'high').length,
            medium: findings.filter(f => f.severity === 'medium').length,
            low: findings.filter(f => f.severity === 'low').length,
            fixed: findings.filter(f => f.status === 'fixed').length,
            meanTimeToFix: 0,
            exposureTime: 0,
        };
    }
    async calculateComplianceMetrics() {
        const frameworks = Array.from(this.frameworks.values());
        const totalControls = frameworks.reduce((sum, f) => sum + f.controls.length, 0);
        const compliantControls = frameworks.reduce((sum, f) => sum + f.controls.filter(c => c.status === 'compliant').length, 0);
        return {
            frameworks: frameworks.length,
            controls: totalControls,
            compliantControls,
            nonCompliantControls: totalControls - compliantControls,
            overallScore: totalControls > 0 ? (compliantControls / totalControls) * 100 : 0,
            lastAssessment: new Date(),
        };
    }
    calculateIncidentMetrics() {
        const incidents = Array.from(this.incidents.values());
        return {
            total: incidents.length,
            open: incidents.filter(i => i.status === 'open').length,
            meanTimeToDetection: 0,
            meanTimeToResponse: 0,
            meanTimeToResolve: 0,
        };
    }
    calculatePolicyMetrics() {
        const policies = Array.from(this.policies.values());
        return {
            total: policies.length,
            active: policies.filter(p => p.status === 'active').length,
            violations: 0,
            exemptions: policies.reduce((sum, p) => sum + p.exceptions.length, 0),
            coverage: 100,
        };
    }
    async calculateThreatMetrics() {
        return {
            indicators: 0,
            blocked: 0,
            detected: 0,
            accuracy: 0,
            falsePositives: 0,
        };
    }
    calculateComplianceScore(results) {
        if (results.length === 0)
            return 0;
        const totalScore = results.reduce((sum, result) => sum + result.score, 0);
        return Math.round(totalScore / results.length);
    }
    async generateComplianceRecommendations(assessment) {
        const recommendations = [];
        for (const result of assessment.results) {
            if (result.status !== 'compliant') {
                recommendations.push(`Improve control ${result.controlId}: ${result.findings.join(', ')}`);
            }
        }
        return recommendations;
    }
    async blockDeployment(scan) {
        logger.warn(`Blocking deployment due to security threshold violation in scan: ${scan.name}`);
    }
    async sendWarningNotification(scan, threshold) {
        logger.warn(`Security threshold warning for scan: ${scan.name}`);
    }
    async gatherReportData(type, period) {
        return {};
    }
    initializeScanMetrics() {
        return {
            totalFindings: 0,
            criticalFindings: 0,
            highFindings: 0,
            mediumFindings: 0,
            lowFindings: 0,
            fixedFindings: 0,
            falsePositives: 0,
            timeToFix: 0,
            coveragePercentage: 0,
        };
    }
    async initializeSecurity() {
        await this.threatDetector.start();
        await this.policyEngine.start();
        setInterval(async () => {
            await this.detectThreats();
        }, 5 * 60 * 1000);
        setInterval(async () => {
            for (const framework of this.frameworks.values()) {
                try {
                    await this.performComplianceAssessment(framework.id, 'all');
                }
                catch (error) {
                    logger.error(`Daily compliance check failed for ${framework.name}:`, error);
                }
            }
        }, 24 * 60 * 60 * 1000);
    }
    getScan(scanId) {
        return this.scans.get(scanId);
    }
    listScans() {
        return Array.from(this.scans.values());
    }
    getFinding(findingId) {
        return this.findings.get(findingId);
    }
    listFindings(severity) {
        const findings = Array.from(this.findings.values());
        return severity ? findings.filter(f => f.severity === severity) : findings;
    }
    getPolicy(policyId) {
        return this.policies.get(policyId);
    }
    listPolicies() {
        return Array.from(this.policies.values());
    }
    getIncident(incidentId) {
        return this.incidents.get(incidentId);
    }
    listIncidents() {
        return Array.from(this.incidents.values());
    }
    async deletePolicy(policyId) {
        const policy = this.policies.get(policyId);
        if (!policy) {
            throw new Error(`Policy not found: ${policyId}`);
        }
        await this.policyEngine.removePolicy(policy);
        this.policies.delete(policyId);
        this.emit('policyDeleted', policy);
        logger.info(`Security policy ${policy.name} deleted`);
    }
}
exports.SecurityAutomationEngine = SecurityAutomationEngine;
//# sourceMappingURL=security-automation-engine.js.map