import { ChangeAnalysisRequest, ChangeAnalysisResponse } from '@fineprintai/shared-types';
declare class ChangeDetectionEngine {
    private turndownService;
    private config;
    private initialized;
    constructor();
    initialize(): Promise<void>;
    analyzeChanges(request: ChangeAnalysisRequest): Promise<ChangeAnalysisResponse>;
    private normalizeContent;
    private generateContentHash;
    private generateDetailedDiff;
    private calculateDiffStats;
    private isStructuralChange;
    private analyzeSections;
    private categorizeContent;
    private assessSeverity;
    private identifyModifiedSections;
    private calculateSimilarity;
    private getHigherSeverity;
    private determineChangeType;
    private calculateRiskChange;
    private generateChangeSummary;
    private extractSignificantChanges;
    healthCheck(): Promise<void>;
    shutdown(): Promise<void>;
}
export declare const changeDetectionEngine: ChangeDetectionEngine;
export {};
//# sourceMappingURL=changeDetection.d.ts.map