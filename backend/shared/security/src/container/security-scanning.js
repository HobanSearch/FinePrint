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
exports.SecurityScanner = void 0;
exports.createSecurityScanner = createSecurityScanner;
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const audit_logger_1 = require("../audit/audit-logger");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class SecurityScanner {
    policy;
    scanHistory = [];
    constructor(policy = {}) {
        this.policy = {
            maxCritical: 0,
            maxHigh: 5,
            autoUpdate: true,
            quarantineOnVuln: true,
            notificationChannels: ['email', 'slack'],
            scanFrequency: 'daily',
            ...policy
        };
    }
    async scanContainerImage(imageName) {
        const scanId = this.generateScanId();
        const timestamp = new Date();
        try {
            const { stdout } = await execAsync(`trivy image --format json ${imageName}`);
            const trivyResults = JSON.parse(stdout);
            const vulnerabilities = this.parseTrivyResults(trivyResults);
            const summary = this.calculateSummary(vulnerabilities);
            const report = {
                scanId,
                timestamp,
                scanType: 'container',
                target: imageName,
                vulnerabilities,
                summary,
                recommendations: this.generateRecommendations(vulnerabilities, 'container')
            };
            await this.processReport(report);
            return report;
        }
        catch (error) {
            console.error('Container scan failed:', error);
            throw new Error(`Container scan failed: ${error.message}`);
        }
    }
    async scanDependencies(packageJsonPath) {
        const scanId = this.generateScanId();
        const timestamp = new Date();
        try {
            const { stdout } = await execAsync('npm audit --json', {
                cwd: path.dirname(packageJsonPath)
            });
            const auditResults = JSON.parse(stdout);
            const vulnerabilities = this.parseNpmAuditResults(auditResults);
            const summary = this.calculateSummary(vulnerabilities);
            const report = {
                scanId,
                timestamp,
                scanType: 'dependency',
                target: packageJsonPath,
                vulnerabilities,
                summary,
                recommendations: this.generateRecommendations(vulnerabilities, 'dependency')
            };
            await this.processReport(report);
            return report;
        }
        catch (error) {
            if (error.stdout) {
                const auditResults = JSON.parse(error.stdout);
                const vulnerabilities = this.parseNpmAuditResults(auditResults);
                const summary = this.calculateSummary(vulnerabilities);
                const report = {
                    scanId,
                    timestamp,
                    scanType: 'dependency',
                    target: packageJsonPath,
                    vulnerabilities,
                    summary,
                    recommendations: this.generateRecommendations(vulnerabilities, 'dependency')
                };
                await this.processReport(report);
                return report;
            }
            throw new Error(`Dependency scan failed: ${error.message}`);
        }
    }
    async scanSourceCode(projectPath) {
        const scanId = this.generateScanId();
        const timestamp = new Date();
        try {
            const { stdout } = await execAsync(`semgrep --config=auto --json ${projectPath}`);
            const semgrepResults = JSON.parse(stdout);
            const vulnerabilities = this.parseSemgrepResults(semgrepResults);
            const summary = this.calculateSummary(vulnerabilities);
            const report = {
                scanId,
                timestamp,
                scanType: 'code',
                target: projectPath,
                vulnerabilities,
                summary,
                recommendations: this.generateRecommendations(vulnerabilities, 'code')
            };
            await this.processReport(report);
            return report;
        }
        catch (error) {
            console.error('Code scan failed:', error);
            throw new Error(`Code scan failed: ${error.message}`);
        }
    }
    async fullSecurityScan(config) {
        const reports = [];
        for (const image of config.containerImages) {
            try {
                const report = await this.scanContainerImage(image);
                reports.push(report);
            }
            catch (error) {
                console.error(`Failed to scan image ${image}:`, error);
            }
        }
        for (const packagePath of config.packagePaths) {
            try {
                const report = await this.scanDependencies(packagePath);
                reports.push(report);
            }
            catch (error) {
                console.error(`Failed to scan dependencies ${packagePath}:`, error);
            }
        }
        for (const codePath of config.codePaths) {
            try {
                const report = await this.scanSourceCode(codePath);
                reports.push(report);
            }
            catch (error) {
                console.error(`Failed to scan code ${codePath}:`, error);
            }
        }
        await this.generateConsolidatedReport(reports);
        return reports;
    }
    async autoRemediate(report) {
        if (!this.policy.autoUpdate) {
            return;
        }
        const criticalVulns = report.vulnerabilities.filter(v => v.severity === 'critical');
        const highVulns = report.vulnerabilities.filter(v => v.severity === 'high');
        for (const vuln of criticalVulns) {
            if (vuln.fixedVersion) {
                await this.updateDependency(vuln.affectedPackage, vuln.fixedVersion);
            }
        }
        if (highVulns.length <= this.policy.maxHigh) {
            for (const vuln of highVulns) {
                if (vuln.fixedVersion) {
                    await this.updateDependency(vuln.affectedPackage, vuln.fixedVersion);
                }
            }
        }
        await audit_logger_1.auditLogger.logEvent({
            action: 'security_auto_remediation',
            resource: 'dependencies',
            details: {
                scanId: report.scanId,
                remediatedVulns: criticalVulns.length + highVulns.length,
                target: report.target
            }
        });
    }
    async checkPolicyCompliance(report) {
        const violations = [];
        const actions = [];
        if (report.summary.critical > this.policy.maxCritical) {
            violations.push(`Critical vulnerabilities (${report.summary.critical}) exceed policy limit (${this.policy.maxCritical})`);
            actions.push('Immediate remediation required for critical vulnerabilities');
        }
        if (report.summary.high > this.policy.maxHigh) {
            violations.push(`High vulnerabilities (${report.summary.high}) exceed policy limit (${this.policy.maxHigh})`);
            actions.push('Remediation plan required for high vulnerabilities');
        }
        if (this.policy.quarantineOnVuln && (report.summary.critical > 0 || report.summary.high > 3)) {
            actions.push('Consider quarantining affected components');
        }
        return {
            compliant: violations.length === 0,
            violations,
            actions
        };
    }
    parseTrivyResults(results) {
        const vulnerabilities = [];
        if (results.Results) {
            for (const result of results.Results) {
                if (result.Vulnerabilities) {
                    for (const vuln of result.Vulnerabilities) {
                        vulnerabilities.push({
                            id: vuln.VulnerabilityID,
                            severity: this.normalizeSeverity(vuln.Severity),
                            title: vuln.Title || vuln.VulnerabilityID,
                            description: vuln.Description || 'No description available',
                            affectedPackage: vuln.PkgName,
                            affectedVersion: vuln.InstalledVersion,
                            fixedVersion: vuln.FixedVersion,
                            cve: vuln.VulnerabilityID.startsWith('CVE') ? vuln.VulnerabilityID : undefined,
                            cvss: vuln.CVSS?.nvd?.V3Score || vuln.CVSS?.redhat?.V3Score,
                            exploitability: this.assessExploitability(vuln),
                            references: vuln.References || []
                        });
                    }
                }
            }
        }
        return vulnerabilities;
    }
    parseNpmAuditResults(results) {
        const vulnerabilities = [];
        if (results.vulnerabilities) {
            for (const [packageName, vulnData] of Object.entries(results.vulnerabilities)) {
                const vuln = vulnData;
                vulnerabilities.push({
                    id: vuln.via?.[0]?.source?.toString() || `npm-${packageName}`,
                    severity: this.normalizeSeverity(vuln.severity),
                    title: vuln.via?.[0]?.title || `${packageName} vulnerability`,
                    description: vuln.via?.[0]?.description || 'No description available',
                    affectedPackage: packageName,
                    affectedVersion: vuln.via?.[0]?.range || 'unknown',
                    fixedVersion: vuln.fixAvailable ? 'available' : undefined,
                    cve: vuln.via?.[0]?.cve,
                    cvss: vuln.via?.[0]?.cvss,
                    exploitability: 'medium',
                    references: vuln.via?.[0]?.references || []
                });
            }
        }
        return vulnerabilities;
    }
    parseSemgrepResults(results) {
        const vulnerabilities = [];
        if (results.results) {
            for (const finding of results.results) {
                vulnerabilities.push({
                    id: finding.check_id,
                    severity: this.normalizeSeverity(finding.extra?.severity || 'medium'),
                    title: finding.extra?.message || finding.check_id,
                    description: finding.extra?.description || 'Security issue detected in source code',
                    affectedPackage: path.basename(finding.path),
                    affectedVersion: 'current',
                    exploitability: this.assessCodeExploitability(finding),
                    references: finding.extra?.references || []
                });
            }
        }
        return vulnerabilities;
    }
    normalizeSeverity(severity) {
        const normalizedSeverity = severity.toLowerCase();
        if (['critical', 'high', 'medium', 'low'].includes(normalizedSeverity)) {
            return normalizedSeverity;
        }
        const severityMap = {
            'severe': 'high',
            'important': 'high',
            'moderate': 'medium',
            'minor': 'low',
            'info': 'low',
            'warning': 'medium',
            'error': 'high'
        };
        return severityMap[normalizedSeverity] || 'medium';
    }
    assessExploitability(vuln) {
        if (vuln.CVSS?.nvd?.V3Score >= 9.0 || vuln.CVSS?.redhat?.V3Score >= 9.0) {
            return 'high';
        }
        if (vuln.CVSS?.nvd?.V3Score >= 7.0 || vuln.CVSS?.redhat?.V3Score >= 7.0) {
            return 'medium';
        }
        return 'low';
    }
    assessCodeExploitability(finding) {
        const highRiskPatterns = [
            'sql-injection',
            'command-injection',
            'path-traversal',
            'xss',
            'csrf'
        ];
        const checkId = finding.check_id.toLowerCase();
        if (highRiskPatterns.some(pattern => checkId.includes(pattern))) {
            return 'high';
        }
        return 'medium';
    }
    calculateSummary(vulnerabilities) {
        return {
            total: vulnerabilities.length,
            critical: vulnerabilities.filter(v => v.severity === 'critical').length,
            high: vulnerabilities.filter(v => v.severity === 'high').length,
            medium: vulnerabilities.filter(v => v.severity === 'medium').length,
            low: vulnerabilities.filter(v => v.severity === 'low').length
        };
    }
    generateRecommendations(vulnerabilities, scanType) {
        const recommendations = [];
        const criticalCount = vulnerabilities.filter(v => v.severity === 'critical').length;
        const highCount = vulnerabilities.filter(v => v.severity === 'high').length;
        if (criticalCount > 0) {
            recommendations.push(`Immediate action required: ${criticalCount} critical vulnerabilities found`);
            recommendations.push('Consider stopping deployment until critical issues are resolved');
        }
        if (highCount > 5) {
            recommendations.push(`High priority: ${highCount} high-severity vulnerabilities require attention`);
        }
        if (scanType === 'dependency') {
            const updatableVulns = vulnerabilities.filter(v => v.fixedVersion).length;
            if (updatableVulns > 0) {
                recommendations.push(`${updatableVulns} vulnerabilities can be fixed by updating dependencies`);
            }
        }
        if (scanType === 'container') {
            recommendations.push('Consider using distroless or minimal base images');
            recommendations.push('Implement multi-stage builds to reduce attack surface');
        }
        if (scanType === 'code') {
            recommendations.push('Enable pre-commit hooks for security scanning');
            recommendations.push('Implement security code review processes');
        }
        return recommendations;
    }
    async processReport(report) {
        this.scanHistory.push(report);
        await audit_logger_1.auditLogger.logEvent({
            action: 'security_scan_completed',
            resource: report.scanType,
            details: {
                scanId: report.scanId,
                target: report.target,
                summary: report.summary,
                scanType: report.scanType
            }
        });
        const compliance = await this.checkPolicyCompliance(report);
        if (!compliance.compliant) {
            await this.handlePolicyViolation(report, compliance);
        }
        if (this.policy.autoUpdate) {
            await this.autoRemediate(report);
        }
        await this.sendNotifications(report, compliance);
    }
    async handlePolicyViolation(report, compliance) {
        await audit_logger_1.auditLogger.logEvent({
            action: 'security_policy_violation',
            resource: report.scanType,
            details: {
                scanId: report.scanId,
                violations: compliance.violations,
                recommendedActions: compliance.actions,
                target: report.target
            }
        });
        if (this.policy.quarantineOnVuln) {
            await this.quarantineComponent(report.target);
        }
    }
    async sendNotifications(report, compliance) {
        const notification = {
            scanId: report.scanId,
            scanType: report.scanType,
            target: report.target,
            summary: report.summary,
            compliant: compliance.compliant,
            violations: compliance.violations,
            timestamp: report.timestamp
        };
        for (const channel of this.policy.notificationChannels) {
            switch (channel) {
                case 'email':
                    await this.sendEmailNotification(notification);
                    break;
                case 'slack':
                    await this.sendSlackNotification(notification);
                    break;
                case 'webhook':
                    await this.sendWebhookNotification(notification);
                    break;
            }
        }
    }
    async updateDependency(packageName, version) {
        try {
            await execAsync(`npm update ${packageName}@${version}`);
            console.log(`Updated ${packageName} to ${version}`);
        }
        catch (error) {
            console.error(`Failed to update ${packageName}:`, error);
        }
    }
    async quarantineComponent(target) {
        console.log(`QUARANTINE: Component ${target} has been marked for quarantine due to security violations`);
    }
    generateScanId() {
        return `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    async generateConsolidatedReport(reports) {
        const consolidatedSummary = {
            totalScans: reports.length,
            totalVulnerabilities: reports.reduce((sum, r) => sum + r.summary.total, 0),
            criticalVulnerabilities: reports.reduce((sum, r) => sum + r.summary.critical, 0),
            highVulnerabilities: reports.reduce((sum, r) => sum + r.summary.high, 0),
            mediumVulnerabilities: reports.reduce((sum, r) => sum + r.summary.medium, 0),
            lowVulnerabilities: reports.reduce((sum, r) => sum + r.summary.low, 0),
        };
        await audit_logger_1.auditLogger.logEvent({
            action: 'security_scan_consolidated',
            resource: 'security_system',
            details: {
                consolidatedSummary,
                scanIds: reports.map(r => r.scanId),
                timestamp: new Date()
            }
        });
    }
    async sendEmailNotification(notification) {
        console.log('EMAIL: Security scan notification', notification);
    }
    async sendSlackNotification(notification) {
        console.log('SLACK: Security scan notification', notification);
    }
    async sendWebhookNotification(notification) {
        console.log('WEBHOOK: Security scan notification', notification);
    }
}
exports.SecurityScanner = SecurityScanner;
function createSecurityScanner(policy) {
    return new SecurityScanner(policy);
}
//# sourceMappingURL=security-scanning.js.map