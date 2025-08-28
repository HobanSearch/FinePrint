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
exports.QualityAssuranceService = void 0;
const esprima = __importStar(require("esprima"));
const types_1 = require("@/types");
const ai_service_1 = require("./ai-service");
const logger_1 = require("@/utils/logger");
const config_1 = require("@/config");
class QualityAssuranceService {
    logger = logger_1.Logger.getInstance();
    aiService;
    constructor() {
        this.aiService = new ai_service_1.AIService();
    }
    async assessCode(request) {
        const startTime = Date.now();
        const requestId = this.generateRequestId();
        try {
            this.logger.info(`Starting quality assessment: ${requestId}`, { request });
            const assessments = [];
            const allIssues = [];
            const enabledChecks = request.checks || config_1.config.agent.quality.enabledChecks;
            for (const checkType of enabledChecks) {
                try {
                    const check = await this.performCheck(checkType, request);
                    assessments.push(check);
                    allIssues.push(...check.issues);
                }
                catch (error) {
                    this.logger.warn(`Quality check failed: ${checkType}`, { error: error.message });
                    assessments.push({
                        type: checkType,
                        score: 0,
                        status: types_1.CheckStatus.FAILED,
                        issues: [{
                                type: checkType,
                                severity: types_1.IssueSeverity.ERROR,
                                message: `Check failed: ${error.message}`,
                            }],
                        recommendations: [`Fix ${checkType} check configuration`],
                    });
                }
            }
            const overallScore = this.calculateOverallScore(assessments);
            const suggestions = await this.generateSuggestions(allIssues, request);
            const metrics = await this.calculateMetrics(request.code, request.language, allIssues);
            const result = {
                id: requestId,
                request,
                overallScore,
                assessments,
                suggestions,
                metrics,
                timestamp: new Date(),
            };
            const processingTime = Date.now() - startTime;
            this.logger.info(`Quality assessment completed: ${requestId}`, {
                processingTime,
                overallScore,
                issueCount: allIssues.length,
            });
            return result;
        }
        catch (error) {
            const processingTime = Date.now() - startTime;
            this.logger.error(`Quality assessment failed: ${requestId}`, {
                error: error.message,
                processingTime,
            });
            throw error;
        }
    }
    async autoFix(code, language, issues) {
        try {
            let fixedCode = code;
            const appliedFixes = [];
            const remainingIssues = [];
            const sortedIssues = issues
                .filter(issue => issue.fixSuggestion)
                .sort((a, b) => (b.line || 0) - (a.line || 0));
            for (const issue of sortedIssues) {
                try {
                    if (issue.fixSuggestion) {
                        const result = await this.applyFix(fixedCode, language, issue);
                        if (result.success) {
                            fixedCode = result.code;
                            appliedFixes.push(`Fixed: ${issue.message}`);
                        }
                        else {
                            remainingIssues.push(issue);
                        }
                    }
                    else {
                        remainingIssues.push(issue);
                    }
                }
                catch (error) {
                    this.logger.warn('Failed to apply fix', { issue: issue.message, error: error.message });
                    remainingIssues.push(issue);
                }
            }
            remainingIssues.push(...issues.filter(issue => !issue.fixSuggestion));
            return {
                fixedCode,
                appliedFixes,
                remainingIssues,
            };
        }
        catch (error) {
            this.logger.error('Auto-fix failed', { error: error.message });
            throw error;
        }
    }
    async generateReport(results, format = 'json') {
        try {
            const reportData = this.aggregateResults(results);
            switch (format) {
                case 'html':
                    return await this.generateHtmlReport(reportData);
                case 'markdown':
                    return await this.generateMarkdownReport(reportData);
                default:
                    return JSON.stringify(reportData, null, 2);
            }
        }
        catch (error) {
            this.logger.error('Report generation failed', { error: error.message });
            throw error;
        }
    }
    async performCheck(checkType, request) {
        switch (checkType) {
            case types_1.QualityCheckType.SYNTAX:
                return await this.checkSyntax(request);
            case types_1.QualityCheckType.FORMATTING:
                return await this.checkFormatting(request);
            case types_1.QualityCheckType.SECURITY:
                return await this.checkSecurity(request);
            case types_1.QualityCheckType.PERFORMANCE:
                return await this.checkPerformance(request);
            case types_1.QualityCheckType.ACCESSIBILITY:
                return await this.checkAccessibility(request);
            case types_1.QualityCheckType.BEST_PRACTICES:
                return await this.checkBestPractices(request);
            case types_1.QualityCheckType.TESTING:
                return await this.checkTesting(request);
            case types_1.QualityCheckType.DOCUMENTATION:
                return await this.checkDocumentation(request);
            default:
                throw new Error(`Unknown check type: ${checkType}`);
        }
    }
    async checkSyntax(request) {
        const issues = [];
        try {
            switch (request.language.toLowerCase()) {
                case 'typescript':
                case 'javascript':
                    await this.validateJavaScriptSyntax(request.code, issues);
                    break;
                case 'python':
                    await this.validatePythonSyntax(request.code, issues);
                    break;
                case 'json':
                    await this.validateJsonSyntax(request.code, issues);
                    break;
                default:
                    await this.validateSyntaxWithAI(request.code, request.language, issues);
            }
        }
        catch (error) {
            issues.push({
                type: types_1.QualityCheckType.SYNTAX,
                severity: types_1.IssueSeverity.ERROR,
                message: `Syntax validation failed: ${error.message}`,
            });
        }
        return {
            type: types_1.QualityCheckType.SYNTAX,
            score: issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * 10),
            status: issues.length === 0 ? types_1.CheckStatus.PASSED : types_1.CheckStatus.FAILED,
            issues,
            recommendations: issues.length > 0 ? ['Fix syntax errors before proceeding'] : [],
        };
    }
    async checkFormatting(request) {
        const issues = [];
        try {
            switch (request.language.toLowerCase()) {
                case 'typescript':
                case 'javascript':
                    await this.checkJavaScriptFormatting(request.code, issues);
                    break;
                case 'python':
                    await this.checkPythonFormatting(request.code, issues);
                    break;
                default:
                    await this.checkFormattingWithAI(request.code, request.language, issues);
            }
        }
        catch (error) {
            this.logger.warn('Formatting check failed', { error: error.message });
        }
        return {
            type: types_1.QualityCheckType.FORMATTING,
            score: Math.max(0, 100 - issues.length * 5),
            status: issues.length === 0 ? types_1.CheckStatus.PASSED : types_1.CheckStatus.WARNING,
            issues,
            recommendations: issues.length > 0 ? ['Run code formatter to fix formatting issues'] : [],
        };
    }
    async checkSecurity(request) {
        const issues = [];
        try {
            await this.scanSecurityVulnerabilities(request.code, request.language, issues);
            if (config_1.config.agent.generation.enableAIEnhancement) {
                await this.checkSecurityWithAI(request.code, request.language, issues);
            }
        }
        catch (error) {
            this.logger.warn('Security check failed', { error: error.message });
        }
        const criticalIssues = issues.filter(i => i.severity === types_1.IssueSeverity.CRITICAL).length;
        const highIssues = issues.filter(i => i.severity === types_1.IssueSeverity.ERROR).length;
        return {
            type: types_1.QualityCheckType.SECURITY,
            score: Math.max(0, 100 - criticalIssues * 25 - highIssues * 10),
            status: criticalIssues > 0 ? types_1.CheckStatus.FAILED :
                highIssues > 0 ? types_1.CheckStatus.WARNING : types_1.CheckStatus.PASSED,
            issues,
            recommendations: criticalIssues > 0 ?
                ['Address critical security vulnerabilities immediately'] :
                highIssues > 0 ? ['Review and fix security issues'] : [],
        };
    }
    async checkPerformance(request) {
        const issues = [];
        try {
            await this.analyzePerformancePatterns(request.code, request.language, issues);
            const complexity = await this.calculateComplexity(request.code, request.language);
            if (complexity > 10) {
                issues.push({
                    type: types_1.QualityCheckType.PERFORMANCE,
                    severity: types_1.IssueSeverity.WARNING,
                    message: `High cyclomatic complexity: ${complexity}`,
                    fixSuggestion: 'Consider breaking down complex functions into smaller ones',
                });
            }
            if (config_1.config.agent.generation.enableAIEnhancement) {
                await this.checkPerformanceWithAI(request.code, request.language, issues);
            }
        }
        catch (error) {
            this.logger.warn('Performance check failed', { error: error.message });
        }
        return {
            type: types_1.QualityCheckType.PERFORMANCE,
            score: Math.max(0, 100 - issues.length * 8),
            status: issues.length === 0 ? types_1.CheckStatus.PASSED : types_1.CheckStatus.WARNING,
            issues,
            recommendations: issues.length > 0 ? ['Optimize performance bottlenecks'] : [],
        };
    }
    async checkAccessibility(request) {
        const issues = [];
        try {
            if (request.context?.framework === 'react') {
                await this.checkReactAccessibility(request.code, issues);
            }
            else if (request.language === 'html') {
                await this.checkHtmlAccessibility(request.code, issues);
            }
            if (config_1.config.agent.generation.enableAIEnhancement) {
                await this.checkAccessibilityWithAI(request.code, request.language, issues);
            }
        }
        catch (error) {
            this.logger.warn('Accessibility check failed', { error: error.message });
        }
        return {
            type: types_1.QualityCheckType.ACCESSIBILITY,
            score: Math.max(0, 100 - issues.length * 10),
            status: issues.length === 0 ? types_1.CheckStatus.PASSED : types_1.CheckStatus.WARNING,
            issues,
            recommendations: issues.length > 0 ? ['Improve accessibility compliance'] : [],
        };
    }
    async checkBestPractices(request) {
        const issues = [];
        try {
            switch (request.language.toLowerCase()) {
                case 'typescript':
                case 'javascript':
                    await this.checkJavaScriptBestPractices(request.code, issues);
                    break;
                case 'python':
                    await this.checkPythonBestPractices(request.code, issues);
                    break;
            }
            if (request.context?.framework) {
                await this.checkFrameworkBestPractices(request.code, request.context.framework, issues);
            }
            if (config_1.config.agent.generation.enableAIEnhancement) {
                await this.checkBestPracticesWithAI(request.code, request.language, issues);
            }
        }
        catch (error) {
            this.logger.warn('Best practices check failed', { error: error.message });
        }
        return {
            type: types_1.QualityCheckType.BEST_PRACTICES,
            score: Math.max(0, 100 - issues.length * 5),
            status: issues.length === 0 ? types_1.CheckStatus.PASSED : types_1.CheckStatus.WARNING,
            issues,
            recommendations: issues.length > 0 ? ['Follow established best practices'] : [],
        };
    }
    async checkTesting(request) {
        const issues = [];
        try {
            const hasTests = this.hasTestPatterns(request.code, request.language);
            if (!hasTests) {
                issues.push({
                    type: types_1.QualityCheckType.TESTING,
                    severity: types_1.IssueSeverity.WARNING,
                    message: 'No test patterns detected',
                    fixSuggestion: 'Add unit tests for better code quality',
                });
            }
            const testCoverage = await this.estimateTestCoverage(request.code, request.language);
            if (testCoverage < 80) {
                issues.push({
                    type: types_1.QualityCheckType.TESTING,
                    severity: types_1.IssueSeverity.WARNING,
                    message: `Estimated test coverage is low: ${testCoverage}%`,
                    fixSuggestion: 'Increase test coverage to at least 80%',
                });
            }
        }
        catch (error) {
            this.logger.warn('Testing check failed', { error: error.message });
        }
        return {
            type: types_1.QualityCheckType.TESTING,
            score: Math.max(0, 100 - issues.length * 15),
            status: issues.length === 0 ? types_1.CheckStatus.PASSED : types_1.CheckStatus.WARNING,
            issues,
            recommendations: issues.length > 0 ? ['Improve test coverage and quality'] : [],
        };
    }
    async checkDocumentation(request) {
        const issues = [];
        try {
            const docScore = await this.analyzeDocumentation(request.code, request.language);
            if (docScore < 50) {
                issues.push({
                    type: types_1.QualityCheckType.DOCUMENTATION,
                    severity: types_1.IssueSeverity.WARNING,
                    message: 'Insufficient code documentation',
                    fixSuggestion: 'Add comprehensive comments and documentation',
                });
            }
            const undocumentedFunctions = await this.findUndocumentedFunctions(request.code, request.language);
            undocumentedFunctions.forEach(func => {
                issues.push({
                    type: types_1.QualityCheckType.DOCUMENTATION,
                    severity: types_1.IssueSeverity.INFO,
                    message: `Function '${func}' lacks documentation`,
                    fixSuggestion: 'Add JSDoc or similar documentation',
                });
            });
        }
        catch (error) {
            this.logger.warn('Documentation check failed', { error: error.message });
        }
        return {
            type: types_1.QualityCheckType.DOCUMENTATION,
            score: Math.max(0, 100 - issues.length * 8),
            status: issues.length === 0 ? types_1.CheckStatus.PASSED : types_1.CheckStatus.WARNING,
            issues,
            recommendations: issues.length > 0 ? ['Improve code documentation'] : [],
        };
    }
    async validateJavaScriptSyntax(code, issues) {
        try {
            esprima.parseScript(code, { tolerant: false });
        }
        catch (error) {
            issues.push({
                type: types_1.QualityCheckType.SYNTAX,
                severity: types_1.IssueSeverity.ERROR,
                message: error.message,
                line: error.lineNumber,
                column: error.column,
            });
        }
    }
    async validatePythonSyntax(code, issues) {
        const lines = code.split('\n');
        lines.forEach((line, index) => {
            if (line.trim().endsWith(':') && !line.match(/^\s*(if|for|while|def|class|try|except|with|else|elif)\b/)) {
                issues.push({
                    type: types_1.QualityCheckType.SYNTAX,
                    severity: types_1.IssueSeverity.WARNING,
                    message: 'Potential syntax issue: unexpected colon',
                    line: index + 1,
                });
            }
        });
    }
    async validateJsonSyntax(code, issues) {
        try {
            JSON.parse(code);
        }
        catch (error) {
            issues.push({
                type: types_1.QualityCheckType.SYNTAX,
                severity: types_1.IssueSeverity.ERROR,
                message: error.message,
            });
        }
    }
    async validateSyntaxWithAI(code, language, issues) {
        try {
            const prompt = `
Validate the syntax of the following ${language} code and identify any syntax errors:

\`\`\`${language}
${code}
\`\`\`

Return a JSON array of issues with the format:
[
  {
    "message": "Error description",
    "line": line_number,
    "column": column_number,
    "severity": "error|warning|info"
  }
]
      `;
            const response = await this.aiService.generateStructuredResponse(prompt);
            const aiIssues = JSON.parse(response);
            aiIssues.forEach((issue) => {
                issues.push({
                    type: types_1.QualityCheckType.SYNTAX,
                    severity: this.mapSeverity(issue.severity),
                    message: issue.message,
                    line: issue.line,
                    column: issue.column,
                });
            });
        }
        catch (error) {
            this.logger.warn('AI syntax validation failed', { error: error.message });
        }
    }
    calculateOverallScore(assessments) {
        if (assessments.length === 0)
            return 0;
        const totalScore = assessments.reduce((sum, assessment) => sum + assessment.score, 0);
        return Math.round(totalScore / assessments.length);
    }
    async generateSuggestions(issues, request) {
        const suggestions = [];
        const issuesByType = issues.reduce((groups, issue) => {
            if (!groups[issue.type])
                groups[issue.type] = [];
            groups[issue.type].push(issue);
            return groups;
        }, {});
        for (const [type, typeIssues] of Object.entries(issuesByType)) {
            const suggestion = this.generateSuggestionForType(type, typeIssues, request);
            if (suggestion) {
                suggestions.push(suggestion);
            }
        }
        return suggestions;
    }
    generateSuggestionForType(type, issues, request) {
        return null;
    }
    async calculateMetrics(code, language, issues) {
        return {
            complexity: await this.calculateComplexity(code, language),
            maintainabilityIndex: await this.calculateMaintainabilityIndex(code, language),
            testCoverage: await this.estimateTestCoverage(code, language),
            duplicatedLines: await this.findDuplicatedLines(code),
            technicalDebt: await this.calculateTechnicalDebt(issues),
            securityScore: await this.calculateSecurityScore(issues),
            accessibilityScore: await this.calculateAccessibilityScore(issues),
        };
    }
    generateRequestId() {
        return `qa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    mapSeverity(severity) {
        switch (severity.toLowerCase()) {
            case 'critical':
                return types_1.IssueSeverity.CRITICAL;
            case 'error':
                return types_1.IssueSeverity.ERROR;
            case 'warning':
                return types_1.IssueSeverity.WARNING;
            default:
                return types_1.IssueSeverity.INFO;
        }
    }
    async checkJavaScriptFormatting(code, issues) { }
    async checkPythonFormatting(code, issues) { }
    async checkFormattingWithAI(code, language, issues) { }
    async scanSecurityVulnerabilities(code, language, issues) { }
    async checkSecurityWithAI(code, language, issues) { }
    async analyzePerformancePatterns(code, language, issues) { }
    async calculateComplexity(code, language) { return 1; }
    async checkPerformanceWithAI(code, language, issues) { }
    async checkReactAccessibility(code, issues) { }
    async checkHtmlAccessibility(code, issues) { }
    async checkAccessibilityWithAI(code, language, issues) { }
    async checkJavaScriptBestPractices(code, issues) { }
    async checkPythonBestPractices(code, issues) { }
    async checkFrameworkBestPractices(code, framework, issues) { }
    async checkBestPracticesWithAI(code, language, issues) { }
    hasTestPatterns(code, language) { return false; }
    async estimateTestCoverage(code, language) { return 0; }
    async analyzeDocumentation(code, language) { return 50; }
    async findUndocumentedFunctions(code, language) { return []; }
    async calculateMaintainabilityIndex(code, language) { return 85; }
    async findDuplicatedLines(code) { return 0; }
    async calculateTechnicalDebt(issues) { return 0; }
    async calculateSecurityScore(issues) { return 90; }
    async calculateAccessibilityScore(issues) { return 85; }
    async applyFix(code, language, issue) {
        return { success: false, code };
    }
    aggregateResults(results) { return {}; }
    async generateHtmlReport(data) { return ''; }
    async generateMarkdownReport(data) { return ''; }
}
exports.QualityAssuranceService = QualityAssuranceService;
//# sourceMappingURL=quality-assurance-service.js.map