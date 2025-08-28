import { EventEmitter } from 'events';
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
export declare class SecurityAutomationEngine extends EventEmitter {
    private readonly vulnerabilityScanner;
    private readonly complianceChecker;
    private readonly policyEngine;
    private readonly secretManager;
    private readonly threatDetector;
    private readonly securityAuditor;
    private readonly incidentResponder;
    private readonly scans;
    private readonly findings;
    private readonly policies;
    private readonly incidents;
    private readonly frameworks;
    constructor();
    startSecurityScan(name: string, type: 'sast' | 'dast' | 'dependency' | 'container' | 'infrastructure' | 'compliance', target: string, configuration: ScanConfiguration): Promise<SecurityScan>;
    private executeScan;
    createSecurityPolicy(name: string, category: 'access' | 'network' | 'data' | 'application' | 'infrastructure', rules: PolicyRule[], scope: PolicyScope, enforcement?: 'blocking' | 'monitoring' | 'alerting'): Promise<SecurityPolicy>;
    setupComplianceFramework(framework: ComplianceFramework): Promise<void>;
    performComplianceAssessment(frameworkId: string, target: string): Promise<ComplianceAssessment>;
    detectThreats(): Promise<ThreatIntelligence[]>;
    createSecurityIncident(title: string, description: string, severity: 'critical' | 'high' | 'medium' | 'low', category: string, affectedSystems?: string[]): Promise<SecurityIncident>;
    getSecurityMetrics(): Promise<SecurityMetrics>;
    generateSecurityReport(type: 'vulnerability' | 'compliance' | 'incident' | 'comprehensive', period: 'daily' | 'weekly' | 'monthly' | 'quarterly', format?: 'pdf' | 'html' | 'json'): Promise<string>;
    private evaluateThresholds;
    private processThreat;
    private scheduleComplianceAssessments;
    private calculateScanMetrics;
    private calculateVulnerabilityMetrics;
    private calculateComplianceMetrics;
    private calculateIncidentMetrics;
    private calculatePolicyMetrics;
    private calculateThreatMetrics;
    private calculateComplianceScore;
    private generateComplianceRecommendations;
    private blockDeployment;
    private sendWarningNotification;
    private gatherReportData;
    private initializeScanMetrics;
    private initializeSecurity;
    getScan(scanId: string): SecurityScan | undefined;
    listScans(): SecurityScan[];
    getFinding(findingId: string): SecurityFinding | undefined;
    listFindings(severity?: string): SecurityFinding[];
    getPolicy(policyId: string): SecurityPolicy | undefined;
    listPolicies(): SecurityPolicy[];
    getIncident(incidentId: string): SecurityIncident | undefined;
    listIncidents(): SecurityIncident[];
    deletePolicy(policyId: string): Promise<void>;
}
//# sourceMappingURL=security-automation-engine.d.ts.map