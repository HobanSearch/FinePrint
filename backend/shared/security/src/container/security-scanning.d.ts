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
export declare class SecurityScanner {
    private policy;
    private scanHistory;
    constructor(policy?: Partial<SecurityPolicy>);
    scanContainerImage(imageName: string): Promise<VulnerabilityReport>;
    scanDependencies(packageJsonPath: string): Promise<VulnerabilityReport>;
    scanSourceCode(projectPath: string): Promise<VulnerabilityReport>;
    fullSecurityScan(config: {
        containerImages: string[];
        packagePaths: string[];
        codePaths: string[];
    }): Promise<VulnerabilityReport[]>;
    autoRemediate(report: VulnerabilityReport): Promise<void>;
    checkPolicyCompliance(report: VulnerabilityReport): Promise<{
        compliant: boolean;
        violations: string[];
        actions: string[];
    }>;
    private parseTrivyResults;
    private parseNpmAuditResults;
    private parseSemgrepResults;
    private normalizeSeverity;
    private assessExploitability;
    private assessCodeExploitability;
    private calculateSummary;
    private generateRecommendations;
    private processReport;
    private handlePolicyViolation;
    private sendNotifications;
    private updateDependency;
    private quarantineComponent;
    private generateScanId;
    private generateConsolidatedReport;
    private sendEmailNotification;
    private sendSlackNotification;
    private sendWebhookNotification;
}
export declare function createSecurityScanner(policy?: Partial<SecurityPolicy>): SecurityScanner;
//# sourceMappingURL=security-scanning.d.ts.map