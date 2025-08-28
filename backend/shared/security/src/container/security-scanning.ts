// Container and Dependency Security Scanning
// Automated vulnerability scanning and dependency management

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { auditLogger } from '../audit/audit-logger';

const execAsync = promisify(exec);

export interface VulnerabilityReport {
  scanId: string;
  timestamp: Date;
  scanType: 'container' | 'dependency' | 'code';
  target: string;
  vulnerabilities: Vulnerability[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  recommendations: string[];
}

export interface Vulnerability {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  affectedPackage: string;
  affectedVersion: string;
  fixedVersion?: string;
  cve?: string;
  cvss?: number;
  exploitability: 'high' | 'medium' | 'low';
  references: string[];
}

export interface SecurityPolicy {
  maxCritical: number;
  maxHigh: number;
  autoUpdate: boolean;
  quarantineOnVuln: boolean;
  notificationChannels: string[];
  scanFrequency: 'daily' | 'weekly' | 'monthly';
}

export class SecurityScanner {
  private policy: SecurityPolicy;
  private scanHistory: VulnerabilityReport[] = [];

  constructor(policy: Partial<SecurityPolicy> = {}) {
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

  /**
   * Scan container images for vulnerabilities
   */
  async scanContainerImage(imageName: string): Promise<VulnerabilityReport> {
    const scanId = this.generateScanId();
    const timestamp = new Date();

    try {
      // Use Trivy for container scanning
      const { stdout } = await execAsync(`trivy image --format json ${imageName}`);
      const trivyResults = JSON.parse(stdout);

      const vulnerabilities = this.parseTrivyResults(trivyResults);
      const summary = this.calculateSummary(vulnerabilities);

      const report: VulnerabilityReport = {
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

    } catch (error) {
      console.error('Container scan failed:', error);
      throw new Error(`Container scan failed: ${error.message}`);
    }
  }

  /**
   * Scan dependencies for vulnerabilities
   */
  async scanDependencies(packageJsonPath: string): Promise<VulnerabilityReport> {
    const scanId = this.generateScanId();
    const timestamp = new Date();

    try {
      // Use npm audit for dependency scanning
      const { stdout } = await execAsync('npm audit --json', {
        cwd: path.dirname(packageJsonPath)
      });
      const auditResults = JSON.parse(stdout);

      const vulnerabilities = this.parseNpmAuditResults(auditResults);
      const summary = this.calculateSummary(vulnerabilities);

      const report: VulnerabilityReport = {
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

    } catch (error) {
      // npm audit returns non-zero exit code when vulnerabilities found
      if (error.stdout) {
        const auditResults = JSON.parse(error.stdout);
        const vulnerabilities = this.parseNpmAuditResults(auditResults);
        const summary = this.calculateSummary(vulnerabilities);

        const report: VulnerabilityReport = {
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

  /**
   * Scan source code for security issues
   */
  async scanSourceCode(projectPath: string): Promise<VulnerabilityReport> {
    const scanId = this.generateScanId();
    const timestamp = new Date();

    try {
      // Use Semgrep for static analysis
      const { stdout } = await execAsync(`semgrep --config=auto --json ${projectPath}`);
      const semgrepResults = JSON.parse(stdout);

      const vulnerabilities = this.parseSemgrepResults(semgrepResults);
      const summary = this.calculateSummary(vulnerabilities);

      const report: VulnerabilityReport = {
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

    } catch (error) {
      console.error('Code scan failed:', error);
      throw new Error(`Code scan failed: ${error.message}`);
    }
  }

  /**
   * Comprehensive security scan
   */
  async fullSecurityScan(config: {
    containerImages: string[];
    packagePaths: string[];
    codePaths: string[];
  }): Promise<VulnerabilityReport[]> {
    const reports: VulnerabilityReport[] = [];

    // Scan container images
    for (const image of config.containerImages) {
      try {
        const report = await this.scanContainerImage(image);
        reports.push(report);
      } catch (error) {
        console.error(`Failed to scan image ${image}:`, error);
      }
    }

    // Scan dependencies
    for (const packagePath of config.packagePaths) {
      try {
        const report = await this.scanDependencies(packagePath);
        reports.push(report);
      } catch (error) {
        console.error(`Failed to scan dependencies ${packagePath}:`, error);
      }
    }

    // Scan source code
    for (const codePath of config.codePaths) {
      try {
        const report = await this.scanSourceCode(codePath);
        reports.push(report);
      } catch (error) {
        console.error(`Failed to scan code ${codePath}:`, error);
      }
    }

    // Generate consolidated report
    await this.generateConsolidatedReport(reports);

    return reports;
  }

  /**
   * Auto-remediate vulnerabilities
   */
  async autoRemediate(report: VulnerabilityReport): Promise<void> {
    if (!this.policy.autoUpdate) {
      return;
    }

    const criticalVulns = report.vulnerabilities.filter(v => v.severity === 'critical');
    const highVulns = report.vulnerabilities.filter(v => v.severity === 'high');

    // Auto-update critical vulnerabilities
    for (const vuln of criticalVulns) {
      if (vuln.fixedVersion) {
        await this.updateDependency(vuln.affectedPackage, vuln.fixedVersion);
      }
    }

    // Auto-update high vulnerabilities if within policy
    if (highVulns.length <= this.policy.maxHigh) {
      for (const vuln of highVulns) {
        if (vuln.fixedVersion) {
          await this.updateDependency(vuln.affectedPackage, vuln.fixedVersion);
        }
      }
    }

    // Log remediation actions
    await auditLogger.logEvent({
      action: 'security_auto_remediation',
      resource: 'dependencies',
      details: {
        scanId: report.scanId,
        remediatedVulns: criticalVulns.length + highVulns.length,
        target: report.target
      }
    });
  }

  /**
   * Generate security policy compliance report
   */
  async checkPolicyCompliance(report: VulnerabilityReport): Promise<{
    compliant: boolean;
    violations: string[];
    actions: string[];
  }> {
    const violations: string[] = [];
    const actions: string[] = [];

    // Check critical vulnerability threshold
    if (report.summary.critical > this.policy.maxCritical) {
      violations.push(`Critical vulnerabilities (${report.summary.critical}) exceed policy limit (${this.policy.maxCritical})`);
      actions.push('Immediate remediation required for critical vulnerabilities');
    }

    // Check high vulnerability threshold
    if (report.summary.high > this.policy.maxHigh) {
      violations.push(`High vulnerabilities (${report.summary.high}) exceed policy limit (${this.policy.maxHigh})`);
      actions.push('Remediation plan required for high vulnerabilities');
    }

    // Quarantine recommendation
    if (this.policy.quarantineOnVuln && (report.summary.critical > 0 || report.summary.high > 3)) {
      actions.push('Consider quarantining affected components');
    }

    return {
      compliant: violations.length === 0,
      violations,
      actions
    };
  }

  /**
   * Parse Trivy container scan results
   */
  private parseTrivyResults(results: any): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

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

  /**
   * Parse npm audit results
   */
  private parseNpmAuditResults(results: any): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    if (results.vulnerabilities) {
      for (const [packageName, vulnData] of Object.entries(results.vulnerabilities as any)) {
        const vuln = vulnData as any;
        
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

  /**
   * Parse Semgrep results
   */
  private parseSemgrepResults(results: any): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

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

  /**
   * Normalize severity levels
   */
  private normalizeSeverity(severity: string): 'critical' | 'high' | 'medium' | 'low' {
    const normalizedSeverity = severity.toLowerCase();
    
    if (['critical', 'high', 'medium', 'low'].includes(normalizedSeverity)) {
      return normalizedSeverity as 'critical' | 'high' | 'medium' | 'low';
    }
    
    // Map common severity terms
    const severityMap: { [key: string]: 'critical' | 'high' | 'medium' | 'low' } = {
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

  /**
   * Assess exploitability of vulnerability
   */
  private assessExploitability(vuln: any): 'high' | 'medium' | 'low' {
    if (vuln.CVSS?.nvd?.V3Score >= 9.0 || vuln.CVSS?.redhat?.V3Score >= 9.0) {
      return 'high';
    }
    if (vuln.CVSS?.nvd?.V3Score >= 7.0 || vuln.CVSS?.redhat?.V3Score >= 7.0) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Assess exploitability for code vulnerabilities
   */
  private assessCodeExploitability(finding: any): 'high' | 'medium' | 'low' {
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

  /**
   * Calculate vulnerability summary
   */
  private calculateSummary(vulnerabilities: Vulnerability[]) {
    return {
      total: vulnerabilities.length,
      critical: vulnerabilities.filter(v => v.severity === 'critical').length,
      high: vulnerabilities.filter(v => v.severity === 'high').length,
      medium: vulnerabilities.filter(v => v.severity === 'medium').length,
      low: vulnerabilities.filter(v => v.severity === 'low').length
    };
  }

  /**
   * Generate recommendations based on vulnerabilities
   */
  private generateRecommendations(vulnerabilities: Vulnerability[], scanType: string): string[] {
    const recommendations: string[] = [];
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

  /**
   * Process scan report
   */
  private async processReport(report: VulnerabilityReport): Promise<void> {
    // Store report
    this.scanHistory.push(report);

    // Log security event
    await auditLogger.logEvent({
      action: 'security_scan_completed',
      resource: report.scanType,
      details: {
        scanId: report.scanId,
        target: report.target,
        summary: report.summary,
        scanType: report.scanType
      }
    });

    // Check policy compliance
    const compliance = await this.checkPolicyCompliance(report);
    if (!compliance.compliant) {
      await this.handlePolicyViolation(report, compliance);
    }

    // Auto-remediate if enabled
    if (this.policy.autoUpdate) {
      await this.autoRemediate(report);
    }

    // Send notifications
    await this.sendNotifications(report, compliance);
  }

  /**
   * Handle policy violations
   */
  private async handlePolicyViolation(
    report: VulnerabilityReport,
    compliance: { violations: string[]; actions: string[] }
  ): Promise<void> {
    await auditLogger.logEvent({
      action: 'security_policy_violation',
      resource: report.scanType,
      details: {
        scanId: report.scanId,
        violations: compliance.violations,
        recommendedActions: compliance.actions,
        target: report.target
      }
    });

    // Implement quarantine if configured
    if (this.policy.quarantineOnVuln) {
      await this.quarantineComponent(report.target);
    }
  }

  /**
   * Send security notifications
   */
  private async sendNotifications(
    report: VulnerabilityReport,
    compliance: { compliant: boolean; violations: string[]; actions: string[] }
  ): Promise<void> {
    const notification = {
      scanId: report.scanId,
      scanType: report.scanType,
      target: report.target,
      summary: report.summary,
      compliant: compliance.compliant,
      violations: compliance.violations,
      timestamp: report.timestamp
    };

    // Send to configured channels
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

  /**
   * Update dependency to fixed version
   */
  private async updateDependency(packageName: string, version: string): Promise<void> {
    try {
      await execAsync(`npm update ${packageName}@${version}`);
      console.log(`Updated ${packageName} to ${version}`);
    } catch (error) {
      console.error(`Failed to update ${packageName}:`, error);
    }
  }

  /**
   * Quarantine component
   */
  private async quarantineComponent(target: string): Promise<void> {
    // Implementation would depend on the deployment system
    console.log(`QUARANTINE: Component ${target} has been marked for quarantine due to security violations`);
  }

  /**
   * Generate scan ID
   */
  private generateScanId(): string {
    return `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate consolidated report
   */
  private async generateConsolidatedReport(reports: VulnerabilityReport[]): Promise<void> {
    const consolidatedSummary = {
      totalScans: reports.length,
      totalVulnerabilities: reports.reduce((sum, r) => sum + r.summary.total, 0),
      criticalVulnerabilities: reports.reduce((sum, r) => sum + r.summary.critical, 0),
      highVulnerabilities: reports.reduce((sum, r) => sum + r.summary.high, 0),
      mediumVulnerabilities: reports.reduce((sum, r) => sum + r.summary.medium, 0),
      lowVulnerabilities: reports.reduce((sum, r) => sum + r.summary.low, 0),
    };

    await auditLogger.logEvent({
      action: 'security_scan_consolidated',
      resource: 'security_system',
      details: {
        consolidatedSummary,
        scanIds: reports.map(r => r.scanId),
        timestamp: new Date()
      }
    });
  }

  // Notification methods (to be implemented based on infrastructure)
  private async sendEmailNotification(notification: any): Promise<void> {
    console.log('EMAIL: Security scan notification', notification);
  }

  private async sendSlackNotification(notification: any): Promise<void> {
    console.log('SLACK: Security scan notification', notification);
  }

  private async sendWebhookNotification(notification: any): Promise<void> {
    console.log('WEBHOOK: Security scan notification', notification);
  }
}

// Export factory function
export function createSecurityScanner(policy?: Partial<SecurityPolicy>): SecurityScanner {
  return new SecurityScanner(policy);
}