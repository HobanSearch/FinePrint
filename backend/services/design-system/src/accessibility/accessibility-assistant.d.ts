import type { AccessibilityReport, AccessibilityFix, ColorContrastResult, KeyboardNavigationReport, ScreenReaderReport, WCAGLevel } from '../types/accessibility.js';
export declare class AccessibilityAssistant {
    private wcagGuidelines;
    private customRules;
    private autoFixStrategies;
    constructor();
    initialize(): Promise<void>;
    healthCheck(): Promise<boolean>;
    auditAccessibility(request: {
        html: string;
        css?: string;
        options?: {
            wcagLevel?: WCAGLevel;
            includeRules?: string[];
            excludeRules?: string[];
            tags?: string[];
        };
    }): Promise<AccessibilityReport>;
    checkColorContrast(foreground: string, background: string, fontSize?: number, fontWeight?: 'normal' | 'bold', wcagLevel?: WCAGLevel): Promise<ColorContrastResult>;
    analyzeColorPalette(colors: string[]): Promise<{
        combinations: ColorContrastResult[];
        recommendations: string[];
    }>;
    analyzeKeyboardNavigation(html: string): Promise<KeyboardNavigationReport>;
    analyzeScreenReaderSupport(html: string): Promise<ScreenReaderReport>;
    generateAutomatedFixes(violations: any[]): Promise<AccessibilityFix[]>;
    applyAutomatedFixes(html: string, fixes: AccessibilityFix[]): Promise<string>;
    private assessWCAGCompliance;
    private initializeWCAGGuidelines;
    private initializeAutoFixStrategies;
    private buildAxeConfig;
    private generateAccessibilityReport;
    private calculateAccessibilityScore;
    private getContrastRequirements;
    private generateContrastSuggestions;
    private getWCAGRules;
    private extractWCAGLevel;
    private hasVisibleFocusIndicator;
    private isElementAccessible;
    private analyzeTabOrder;
    private identifyKeyboardIssues;
    private generateKeyboardRecommendations;
    private calculateKeyboardScore;
    private analyzeHeadingStructure;
    private analyzeLandmarks;
    private analyzeAriaUsage;
    private identifyScreenReaderIssues;
    private generateScreenReaderRecommendations;
    private calculateScreenReaderScore;
    private generateManualFixInstructions;
    private getWCAGReference;
}
//# sourceMappingURL=accessibility-assistant.d.ts.map