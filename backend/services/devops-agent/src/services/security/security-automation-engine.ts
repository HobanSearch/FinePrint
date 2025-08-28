/**
 * Security Automation and Compliance Engine
 * 
 * Provides comprehensive security scanning, vulnerability management, compliance checking,
 * and automated security policy enforcement across the entire infrastructure.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
import * as path from 'path';
import { spawn } from 'child_process';
import { createContextLogger } from '@/utils/logger';
import { config } from '@/config';
import { VulnerabilityScanner } from './vulnerability-scanner';
import { ComplianceChecker } from './compliance-checker';
import { PolicyEngine } from './policy-engine';
import { SecretManager } from './secret-manager';
import { ThreatDetector } from './threat-detector';
import { SecurityAuditor } from './security-auditor';
import { IncidentResponder } from './incident-responder';

const logger = createContextLogger('Security-Engine');

export interface SecurityScan {
  id: string;
  name: string;
  type: 'sast' | 'dast' | 'dependency' | 'container' | 'infrastructure' | 'compliance';
  target: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  findings: SecurityFinding[];
  metrics: ScanMetrics;
  configuration: ScanConfiguration;
}

export interface SecurityFinding {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  cwe?: string;
  cve?: string;
  location: FindingLocation;
  remediation: RemediationAdvice;
  status: 'open' | 'acknowledged' | 'fixed' | 'false_positive' | 'accepted';
  assignee?: string;
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface FindingLocation {
  file?: string;
  line?: number;
  column?: number;
  function?: string;
  url?: string;
  component?: string;
}

export interface RemediationAdvice {
  description: string;
  steps: string[];
  references: string[];
  effort: 'low' | 'medium' | 'high';
  priority: number;
}

export interface ScanMetrics {
  totalFindings: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  fixedFindings: number;
  falsePositives: number;
  timeToFix: number;
  coveragePercentage: number;
}

export interface ScanConfiguration {
  scope: string[];
  exclusions: string[];
  rules: SecurityRule[];
  thresholds: SecurityThreshold[];
  notifications: NotificationConfig[];
}

export interface SecurityRule {
  id: string;
  name: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  enabled: boolean;
  pattern?: string;
  conditions: RuleCondition[];
}

export interface RuleCondition {
  field: string;
  operator: 'equals' | 'contains' | 'regex' | 'gt' | 'lt';
  value: any;
}

export interface SecurityThreshold {
  severity: 'critical' | 'high' | 'medium' | 'low';
  maxFindings: number;
  action: 'block' | 'warn' | 'ignore';
}

export interface NotificationConfig {
  type: 'slack' | 'email' | 'webhook' | 'pagerduty';
  events: string[];
  recipients: string[];
  settings: Record<string, any>;
}

export interface ComplianceFramework {
  id: string;
  name: string;
  version: string;
  description: string;
  controls: ComplianceControl[];
  requirements: ComplianceRequirement[];
  assessments: ComplianceAssessment[];
}

export interface ComplianceControl {
  id: string;
  name: string;
  description: string;
  category: string;
  criticality: 'critical' | 'high' | 'medium' | 'low';
  automated: boolean;
  tests: ControlTest[];
  status: 'compliant' | 'non_compliant' | 'partially_compliant' | 'not_assessed';
}

export interface ControlTest {
  id: string;
  name: string;
  description: string;
  query: string;
  expectedResult: any;
  actualResult?: any;
  status: 'pass' | 'fail' | 'skip';
  lastRun?: Date;
}

export interface ComplianceRequirement {
  id: string;
  title: string;
  description: string;
  controls: string[];
  mandatory: boolean;
  evidence: Evidence[];
}

export interface Evidence {
  type: 'document' | 'screenshot' | 'log' | 'config' | 'code';
  description: string;
  location: string;
  collectedAt: Date;
  validUntil?: Date;
}

export interface ComplianceAssessment {
  id: string;
  framework: string;
  target: string;
  status: 'in_progress' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  results: AssessmentResult[];
  overallScore: number;
  recommendations: string[];
}

export interface AssessmentResult {
  controlId: string;
  status: 'compliant' | 'non_compliant' | 'partially_compliant';
  score: number;
  findings: string[];
  evidence: Evidence[];
}

export interface SecurityPolicy {
  id: string;
  name: string;
  description: string;
  category: 'access' | 'network' | 'data' | 'application' | 'infrastructure';
  rules: PolicyRule[];
  enforcement: 'blocking' | 'monitoring' | 'alerting';
  scope: PolicyScope;
  exceptions: PolicyException[];
  status: 'active' | 'inactive' | 'draft';
  version: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyRule {
  id: string;
  condition: string;
  action: 'allow' | 'deny' | 'log' | 'alert';
  parameters: Record<string, any>;
  priority: number;
}

export interface PolicyScope {
  resources: string[];
  environments: string[];
  services: string[];
  users: string[];
  roles: string[];
}

export interface PolicyException {
  id: string;
  reason: string;
  approver: string;
  validUntil: Date;
  conditions: Record<string, any>;
}

export interface ThreatIntelligence {
  id: string;
  type: 'ioc' | 'ttp' | 'vulnerability' | 'malware' | 'phishing';
  severity: 'critical' | 'high' | 'medium' | 'low';
  source: string;
  description: string;
  indicators: ThreatIndicator[];
  mitigation: string[];
  confidence: number;
  validFrom: Date;
  validUntil?: Date;
}

export interface ThreatIndicator {
  type: 'ip' | 'domain' | 'url' | 'hash' | 'email' | 'file';
  value: string;
  context: string;
}

export interface SecurityIncident {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'investigating' | 'contained' | 'resolved' | 'closed';
  category: 'malware' | 'data_breach' | 'unauthorized_access' | 'ddos' | 'phishing' | 'other';
  affectedSystems: string[];
  indicators: ThreatIndicator[];
  timeline: IncidentEvent[];
  responders: string[];
  containmentActions: ContainmentAction[];
  evidence: Evidence[];
  lessonsLearned?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IncidentEvent {
  timestamp: Date;
  type: 'detected' | 'investigated' | 'contained' | 'mitigated' | 'resolved';
  description: string;
  actor: string;
  impact: string;
}

export interface ContainmentAction {
  id: string;
  action: string;
  description: string;
  automated: boolean;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  timestamp: Date;
  executor: string;
}

export interface SecurityMetrics {
  vulnerabilities: VulnerabilityMetrics;
  compliance: ComplianceMetrics;
  incidents: IncidentMetrics;
  policies: PolicyMetrics;
  threats: ThreatMetrics;
}

export interface VulnerabilityMetrics {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  fixed: number;
  meanTimeToFix: number;
  exposureTime: number;
}

export interface ComplianceMetrics {
  frameworks: number;
  controls: number;
  compliantControls: number;
  nonCompliantControls: number;
  overallScore: number;
  lastAssessment: Date;
}

export interface IncidentMetrics {
  total: number;
  open: number;
  meanTimeToDetection: number;
  meanTimeToResponse: number;
  meanTimeToResolve: number;
}

export interface PolicyMetrics {
  total: number;
  active: number;
  violations: number;
  exemptions: number;
  coverage: number;
}

export interface ThreatMetrics {
  indicators: number;
  blocked: number;
  detected: number;
  accuracy: number;
  falsePositives: number;
}

export class SecurityAutomationEngine extends EventEmitter {
  private readonly vulnerabilityScanner: VulnerabilityScanner;
  private readonly complianceChecker: ComplianceChecker;
  private readonly policyEngine: PolicyEngine;
  private readonly secretManager: SecretManager;
  private readonly threatDetector: ThreatDetector;
  private readonly securityAuditor: SecurityAuditor;
  private readonly incidentResponder: IncidentResponder;
  
  private readonly scans: Map<string, SecurityScan> = new Map();
  private readonly findings: Map<string, SecurityFinding> = new Map();
  private readonly policies: Map<string, SecurityPolicy> = new Map();
  private readonly incidents: Map<string, SecurityIncident> = new Map();
  private readonly frameworks: Map<string, ComplianceFramework> = new Map();

  constructor() {
    super();
    
    this.vulnerabilityScanner = new VulnerabilityScanner();
    this.complianceChecker = new ComplianceChecker();
    this.policyEngine = new PolicyEngine();
    this.secretManager = new SecretManager();
    this.threatDetector = new ThreatDetector();
    this.securityAuditor = new SecurityAuditor();
    this.incidentResponder = new IncidentResponder();
    
    this.initializeSecurity();
  }

  /**
   * Start a comprehensive security scan
   */
  async startSecurityScan(
    name: string,
    type: 'sast' | 'dast' | 'dependency' | 'container' | 'infrastructure' | 'compliance',
    target: string,
    configuration: ScanConfiguration
  ): Promise<SecurityScan> {
    const scanId = `scan-${Date.now()}`;
    
    logger.info(`Starting security scan: ${name} (${type}) on target: ${target}`);

    try {
      const scan: SecurityScan = {
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

      // Execute scan based on type
      this.executeScan(scan);

      this.emit('scanStarted', scan);
      return scan;

    } catch (error) {
      logger.error(`Failed to start security scan ${name}:`, error);
      throw error;
    }
  }

  /**
   * Execute security scan
   */
  private async executeScan(scan: SecurityScan): Promise<void> {
    try {
      scan.status = 'running';
      this.emit('scanUpdated', scan);

      let findings: SecurityFinding[] = [];

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

      // Process findings
      scan.findings = findings;
      scan.metrics = this.calculateScanMetrics(findings);

      // Store findings
      for (const finding of findings) {
        this.findings.set(finding.id, finding);
      }

      // Check thresholds and trigger actions
      await this.evaluateThresholds(scan);

      scan.status = 'completed';
      scan.endTime = new Date();
      scan.duration = scan.endTime.getTime() - scan.startTime.getTime();

      this.emit('scanCompleted', scan);
      logger.info(`Security scan ${scan.name} completed with ${findings.length} findings`);

    } catch (error) {
      scan.status = 'failed';
      scan.endTime = new Date();
      scan.duration = scan.endTime.getTime() - scan.startTime.getTime();
      
      this.emit('scanFailed', scan, error);
      logger.error(`Security scan ${scan.name} failed:`, error);
    }
  }

  /**
   * Create and enforce security policy
   */
  async createSecurityPolicy(
    name: string,
    category: 'access' | 'network' | 'data' | 'application' | 'infrastructure',
    rules: PolicyRule[],
    scope: PolicyScope,
    enforcement: 'blocking' | 'monitoring' | 'alerting' = 'monitoring'
  ): Promise<SecurityPolicy> {
    const policyId = `policy-${Date.now()}`;
    
    logger.info(`Creating security policy: ${name}`);

    try {
      const policy: SecurityPolicy = {
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

      // Deploy policy to enforcement points
      await this.policyEngine.deployPolicy(policy);

      this.emit('policyCreated', policy);
      logger.info(`Security policy ${name} created and deployed`);

      return policy;

    } catch (error) {
      logger.error(`Failed to create security policy ${name}:`, error);
      throw error;
    }
  }

  /**
   * Setup compliance framework monitoring
   */
  async setupComplianceFramework(
    framework: ComplianceFramework
  ): Promise<void> {
    logger.info(`Setting up compliance framework: ${framework.name}`);

    try {
      this.frameworks.set(framework.id, framework);

      // Setup automated compliance checks
      await this.complianceChecker.setupFramework(framework);

      // Schedule regular assessments
      this.scheduleComplianceAssessments(framework);

      this.emit('complianceFrameworkSetup', framework);
      logger.info(`Compliance framework ${framework.name} setup completed`);

    } catch (error) {
      logger.error(`Failed to setup compliance framework ${framework.name}:`, error);
      throw error;
    }
  }

  /**
   * Perform compliance assessment
   */
  async performComplianceAssessment(
    frameworkId: string,
    target: string
  ): Promise<ComplianceAssessment> {
    const framework = this.frameworks.get(frameworkId);
    if (!framework) {
      throw new Error(`Compliance framework not found: ${frameworkId}`);
    }

    const assessmentId = `assessment-${Date.now()}`;
    
    logger.info(`Performing compliance assessment: ${framework.name} on ${target}`);

    try {
      const assessment: ComplianceAssessment = {
        id: assessmentId,
        framework: frameworkId,
        target,
        status: 'in_progress',
        startTime: new Date(),
        results: [],
        overallScore: 0,
        recommendations: [],
      };

      // Execute compliance tests
      for (const control of framework.controls) {
        const result = await this.complianceChecker.assessControl(control, target);
        assessment.results.push(result);
      }

      // Calculate overall score
      assessment.overallScore = this.calculateComplianceScore(assessment.results);

      // Generate recommendations
      assessment.recommendations = await this.generateComplianceRecommendations(assessment);

      assessment.status = 'completed';
      assessment.endTime = new Date();

      this.emit('complianceAssessmentCompleted', assessment);
      logger.info(`Compliance assessment completed with score: ${assessment.overallScore}%`);

      return assessment;

    } catch (error) {
      logger.error(`Compliance assessment failed:`, error);
      throw error;
    }
  }

  /**
   * Detect and respond to security threats
   */
  async detectThreats(): Promise<ThreatIntelligence[]> {
    logger.info('Performing threat detection');

    try {
      const threats = await this.threatDetector.detectThreats();

      // Process each threat
      for (const threat of threats) {
        await this.processThreat(threat);
      }

      return threats;

    } catch (error) {
      logger.error('Threat detection failed:', error);
      throw error;
    }
  }

  /**
   * Create security incident
   */
  async createSecurityIncident(
    title: string,
    description: string,
    severity: 'critical' | 'high' | 'medium' | 'low',
    category: string,
    affectedSystems: string[] = []
  ): Promise<SecurityIncident> {
    const incidentId = `incident-${Date.now()}`;
    
    logger.info(`Creating security incident: ${title}`);

    try {
      const incident: SecurityIncident = {
        id: incidentId,
        title,
        description,
        severity,
        status: 'open',
        category: category as any,
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

      // Trigger automated response
      await this.incidentResponder.initiateResponse(incident);

      this.emit('securityIncidentCreated', incident);
      logger.info(`Security incident ${title} created and response initiated`);

      return incident;

    } catch (error) {
      logger.error(`Failed to create security incident ${title}:`, error);
      throw error;
    }
  }

  /**
   * Get security metrics and dashboard data
   */
  async getSecurityMetrics(): Promise<SecurityMetrics> {
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

    } catch (error) {
      logger.error('Failed to calculate security metrics:', error);
      throw error;
    }
  }

  /**
   * Generate security report
   */
  async generateSecurityReport(
    type: 'vulnerability' | 'compliance' | 'incident' | 'comprehensive',
    period: 'daily' | 'weekly' | 'monthly' | 'quarterly',
    format: 'pdf' | 'html' | 'json' = 'pdf'
  ): Promise<string> {
    logger.info(`Generating ${type} security report for ${period} period`);

    try {
      const reportData = await this.gatherReportData(type, period);
      const reportPath = await this.securityAuditor.generateReport(reportData, format);

      this.emit('securityReportGenerated', { type, period, format, path: reportPath });
      logger.info(`Security report generated: ${reportPath}`);

      return reportPath;

    } catch (error) {
      logger.error(`Failed to generate security report:`, error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async evaluateThresholds(scan: SecurityScan): Promise<void> {
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
            // Do nothing
            break;
        }
      }
    }
  }

  private async processThreat(threat: ThreatIntelligence): Promise<void> {
    logger.info(`Processing threat: ${threat.type} - ${threat.description}`);

    // Apply threat intelligence to detection rules
    await this.threatDetector.applyIntelligence(threat);

    // Check for matches in current environment
    const matches = await this.threatDetector.searchIndicators(threat.indicators);
    
    if (matches.length > 0) {
      // Create security incident
      await this.createSecurityIncident(
        `Threat detected: ${threat.description}`,
        `Threat intelligence match found for ${threat.type}`,
        threat.severity,
        'threat_intelligence',
        matches
      );
    }
  }

  private scheduleComplianceAssessments(framework: ComplianceFramework): void {
    // Schedule regular compliance assessments
    setInterval(async () => {
      try {
        await this.performComplianceAssessment(framework.id, 'all');
      } catch (error) {
        logger.error(`Scheduled compliance assessment failed for ${framework.name}:`, error);
      }
    }, 24 * 60 * 60 * 1000); // Daily
  }

  private calculateScanMetrics(findings: SecurityFinding[]): ScanMetrics {
    return {
      totalFindings: findings.length,
      criticalFindings: findings.filter(f => f.severity === 'critical').length,
      highFindings: findings.filter(f => f.severity === 'high').length,
      mediumFindings: findings.filter(f => f.severity === 'medium').length,
      lowFindings: findings.filter(f => f.severity === 'low').length,
      fixedFindings: findings.filter(f => f.status === 'fixed').length,
      falsePositives: findings.filter(f => f.status === 'false_positive').length,
      timeToFix: 0, // Calculate based on finding lifecycle
      coveragePercentage: 100, // Calculate based on scan scope
    };
  }

  private calculateVulnerabilityMetrics(): VulnerabilityMetrics {
    const findings = Array.from(this.findings.values());
    
    return {
      total: findings.length,
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
      fixed: findings.filter(f => f.status === 'fixed').length,
      meanTimeToFix: 0, // Calculate from finding lifecycle
      exposureTime: 0, // Calculate from finding age
    };
  }

  private async calculateComplianceMetrics(): Promise<ComplianceMetrics> {
    const frameworks = Array.from(this.frameworks.values());
    const totalControls = frameworks.reduce((sum, f) => sum + f.controls.length, 0);
    const compliantControls = frameworks.reduce((sum, f) => 
      sum + f.controls.filter(c => c.status === 'compliant').length, 0);
    
    return {
      frameworks: frameworks.length,
      controls: totalControls,
      compliantControls,
      nonCompliantControls: totalControls - compliantControls,
      overallScore: totalControls > 0 ? (compliantControls / totalControls) * 100 : 0,
      lastAssessment: new Date(),
    };
  }

  private calculateIncidentMetrics(): IncidentMetrics {
    const incidents = Array.from(this.incidents.values());
    
    return {
      total: incidents.length,
      open: incidents.filter(i => i.status === 'open').length,
      meanTimeToDetection: 0, // Calculate from incident timeline
      meanTimeToResponse: 0, // Calculate from incident timeline
      meanTimeToResolve: 0, // Calculate from incident timeline
    };
  }

  private calculatePolicyMetrics(): PolicyMetrics {
    const policies = Array.from(this.policies.values());
    
    return {
      total: policies.length,
      active: policies.filter(p => p.status === 'active').length,
      violations: 0, // Track policy violations
      exemptions: policies.reduce((sum, p) => sum + p.exceptions.length, 0),
      coverage: 100, // Calculate policy coverage
    };
  }

  private async calculateThreatMetrics(): Promise<ThreatMetrics> {
    return {
      indicators: 0, // Count threat indicators
      blocked: 0, // Count blocked threats
      detected: 0, // Count detected threats
      accuracy: 0, // Calculate detection accuracy
      falsePositives: 0, // Count false positives
    };
  }

  private calculateComplianceScore(results: AssessmentResult[]): number {
    if (results.length === 0) return 0;
    
    const totalScore = results.reduce((sum, result) => sum + result.score, 0);
    return Math.round(totalScore / results.length);
  }

  private async generateComplianceRecommendations(assessment: ComplianceAssessment): Promise<string[]> {
    const recommendations: string[] = [];
    
    for (const result of assessment.results) {
      if (result.status !== 'compliant') {
        recommendations.push(`Improve control ${result.controlId}: ${result.findings.join(', ')}`);
      }
    }
    
    return recommendations;
  }

  private async blockDeployment(scan: SecurityScan): Promise<void> {
    logger.warn(`Blocking deployment due to security threshold violation in scan: ${scan.name}`);
    // Implementation to block deployment
  }

  private async sendWarningNotification(scan: SecurityScan, threshold: SecurityThreshold): Promise<void> {
    logger.warn(`Security threshold warning for scan: ${scan.name}`);
    // Implementation to send warning notification
  }

  private async gatherReportData(type: string, period: string): Promise<any> {
    // Gather data for security report
    return {};
  }

  private initializeScanMetrics(): ScanMetrics {
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

  private async initializeSecurity(): Promise<void> {
    // Initialize security subsystems
    await this.threatDetector.start();
    await this.policyEngine.start();
    
    // Start continuous monitoring
    setInterval(async () => {
      await this.detectThreats();
    }, 5 * 60 * 1000); // Every 5 minutes
    
    // Start daily compliance checks
    setInterval(async () => {
      for (const framework of this.frameworks.values()) {
        try {
          await this.performComplianceAssessment(framework.id, 'all');
        } catch (error) {
          logger.error(`Daily compliance check failed for ${framework.name}:`, error);
        }
      }
    }, 24 * 60 * 60 * 1000); // Daily
  }

  /**
   * Public API methods
   */
  getScan(scanId: string): SecurityScan | undefined {
    return this.scans.get(scanId);
  }

  listScans(): SecurityScan[] {
    return Array.from(this.scans.values());
  }

  getFinding(findingId: string): SecurityFinding | undefined {
    return this.findings.get(findingId);
  }

  listFindings(severity?: string): SecurityFinding[] {
    const findings = Array.from(this.findings.values());
    return severity ? findings.filter(f => f.severity === severity) : findings;
  }

  getPolicy(policyId: string): SecurityPolicy | undefined {
    return this.policies.get(policyId);
  }

  listPolicies(): SecurityPolicy[] {
    return Array.from(this.policies.values());
  }

  getIncident(incidentId: string): SecurityIncident | undefined {
    return this.incidents.get(incidentId);
  }

  listIncidents(): SecurityIncident[] {
    return Array.from(this.incidents.values());
  }

  async deletePolicy(policyId: string): Promise<void> {
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