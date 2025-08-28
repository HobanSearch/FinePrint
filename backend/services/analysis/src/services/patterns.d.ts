import type { PatternLibraryEntry, PatternMatch } from '@fineprintai/shared-types';
export interface PatternAnalysisResult {
    totalMatches: number;
    categorizedMatches: {
        [category: string]: PatternMatch[];
    };
    riskScore: number;
    highestSeverity: 'low' | 'medium' | 'high' | 'critical';
    affectedTextPercentage: number;
}
export declare class PatternLibrary {
    private patterns;
    private initialized;
    constructor();
    private initializePatterns;
    private addPattern;
    analyzeText(text: string): Promise<PatternAnalysisResult>;
    private findPatternMatches;
    private extractContext;
    private calculateConfidence;
    private categorizeMatches;
    private calculateRiskScore;
    private getHighestSeverity;
    private calculateAffectedTextPercentage;
    getPattern(patternId: string): PatternLibraryEntry | undefined;
    getAllPatterns(): PatternLibraryEntry[];
    getPatternsByCategory(category: string): PatternLibraryEntry[];
    getActivePatterns(): PatternLibraryEntry[];
    addCustomPattern(pattern: Omit<PatternLibraryEntry, 'id' | 'isCustom' | 'version'>): string;
    updatePattern(patternId: string, updates: Partial<PatternLibraryEntry>): boolean;
    removePattern(patternId: string): boolean;
    getPatternStats(): {
        total: number;
        active: number;
        byCategory: {
            [category: string]: number;
        };
        bySeverity: {
            [severity: string]: number;
        };
        custom: number;
    };
}
export declare const patternLibrary: PatternLibrary;
//# sourceMappingURL=patterns.d.ts.map