import { PrismaClient } from '@prisma/client';
export interface ComplianceRule {
    id: string;
    name: string;
    regulation: 'GDPR' | 'CCPA' | 'COPPA' | 'PIPEDA' | 'LGPD' | 'PDPA';
    region: 'EU' | 'US' | 'CA' | 'BR' | 'SG' | 'GLOBAL';
    category: 'data_collection' | 'consent' | 'retention' | 'deletion' | 'disclosure' | 'children';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    pattern: string;
    positiveMatch: boolean;
    isActive: boolean;
}
export interface ComplianceAlert {
    id: string;
    documentId: string;
    websiteName: string;
    ruleId: string;
    ruleName: string;
    regulation: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    alertType: 'violation' | 'missing_requirement' | 'ambiguous_language';
    description: string;
    excerpt: string;
    recommendations: string[];
    detectedAt: Date;
    isResolved: boolean;
    resolvedAt?: Date;
}
export interface ComplianceScore {
    regulation: string;
    score: number;
    passing: boolean;
    totalRules: number;
    passedRules: number;
    failedRules: number;
    criticalViolations: number;
    lastAssessed: Date;
}
export interface RegulatoryChange {
    id: string;
    regulation: string;
    region: string;
    title: string;
    summary: string;
    effectiveDate: Date;
    impact: 'low' | 'medium' | 'high';
    source: string;
    detectedAt: Date;
}
export declare class ComplianceMonitorService {
    private prisma;
    private isRunning;
    private monitoringInterval;
    private complianceRules;
    constructor(prisma: PrismaClient);
    startMonitoring(): Promise<void>;
    stop(): Promise<void>;
    private initializeComplianceRules;
    private runComplianceCheck;
    private getDocumentsForComplianceCheck;
    private checkDocumentCompliance;
    private extractRelevantExcerpt;
    private generateRecommendations;
    private saveComplianceAlert;
    private updateComplianceScores;
    private calculateComplianceScore;
    private saveComplianceScore;
    getRecentAlerts(severity?: string, limit?: number): Promise<ComplianceAlert[]>;
    getComplianceScores(): Promise<ComplianceScore[]>;
    getRegulatoryChanges(region?: string, days?: number): Promise<RegulatoryChange[]>;
    resolveAlert(alertId: string): Promise<void>;
    addCustomRule(rule: Omit<ComplianceRule, 'id'>): Promise<void>;
    getComplianceStatistics(): Promise<any>;
}
//# sourceMappingURL=compliance-monitor.d.ts.map