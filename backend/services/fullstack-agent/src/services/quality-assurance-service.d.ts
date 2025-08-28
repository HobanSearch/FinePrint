import { QualityAssessmentRequest, QualityAssessmentResult, QualityIssue } from '@/types';
export interface LintResult {
    filePath: string;
    messages: LintMessage[];
    errorCount: number;
    warningCount: number;
}
export interface LintMessage {
    ruleId: string;
    severity: number;
    message: string;
    line: number;
    column: number;
    nodeType?: string;
    fix?: {
        range: [number, number];
        text: string;
    };
}
export interface SecurityScanResult {
    vulnerabilities: SecurityVulnerability[];
    severity: 'low' | 'medium' | 'high' | 'critical';
    score: number;
}
export interface SecurityVulnerability {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    line?: number;
    column?: number;
    cwe?: string;
    recommendation: string;
}
export declare class QualityAssuranceService {
    private readonly logger;
    private readonly aiService;
    constructor();
    assessCode(request: QualityAssessmentRequest): Promise<QualityAssessmentResult>;
    autoFix(code: string, language: string, issues: QualityIssue[]): Promise<{
        fixedCode: string;
        appliedFixes: string[];
        remainingIssues: QualityIssue[];
    }>;
    generateReport(results: QualityAssessmentResult[], format?: 'json' | 'html' | 'markdown'): Promise<string>;
    private performCheck;
    private checkSyntax;
    private checkFormatting;
    private checkSecurity;
    private checkPerformance;
    private checkAccessibility;
    private checkBestPractices;
    private checkTesting;
    private checkDocumentation;
    private validateJavaScriptSyntax;
    private validatePythonSyntax;
    private validateJsonSyntax;
    private validateSyntaxWithAI;
    private calculateOverallScore;
    private generateSuggestions;
    private generateSuggestionForType;
    private calculateMetrics;
    private generateRequestId;
    private mapSeverity;
    private checkJavaScriptFormatting;
    private checkPythonFormatting;
    private checkFormattingWithAI;
    private scanSecurityVulnerabilities;
    private checkSecurityWithAI;
    private analyzePerformancePatterns;
    private calculateComplexity;
    private checkPerformanceWithAI;
    private checkReactAccessibility;
    private checkHtmlAccessibility;
    private checkAccessibilityWithAI;
    private checkJavaScriptBestPractices;
    private checkPythonBestPractices;
    private checkFrameworkBestPractices;
    private checkBestPracticesWithAI;
    private hasTestPatterns;
    private estimateTestCoverage;
    private analyzeDocumentation;
    private findUndocumentedFunctions;
    private calculateMaintainabilityIndex;
    private findDuplicatedLines;
    private calculateTechnicalDebt;
    private calculateSecurityScore;
    private calculateAccessibilityScore;
    private applyFix;
    private aggregateResults;
    private generateHtmlReport;
    private generateMarkdownReport;
}
//# sourceMappingURL=quality-assurance-service.d.ts.map