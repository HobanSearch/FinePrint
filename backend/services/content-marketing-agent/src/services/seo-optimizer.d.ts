import { KeywordData, SEOAnalysis } from '../types';
export declare class SEOOptimizer {
    private ahrefsApiKey;
    private semrushApiKey;
    constructor();
    optimizeContent(content: string, title: string, keywords: string[]): Promise<{
        optimizedContent: string;
        optimizedTitle: string;
        score: number;
        suggestions: string[];
    }>;
    analyzeContent(content: string, title: string, keywords: string[]): Promise<SEOAnalysis>;
    researchKeywords(topic: string, targetAudience: string, contentType: string): Promise<KeywordData[]>;
    generateSEOTitle(content: string, keywords: string[]): Promise<string[]>;
    private generateSeedKeywords;
    private getKeywordData;
    private getSemrushKeywordData;
    private getAhrefsKeywordData;
    private getEstimatedKeywordData;
    private getRelatedKeywords;
    private getFallbackKeywords;
    private calculateKeywordDensity;
    private calculateReadabilityScore;
    private countSyllables;
    private analyzeHeadingStructure;
    private extractLinks;
    private extractImageAltTags;
    private generateMetaDescription;
    private generateOptimizationSuggestions;
    private applyContentOptimizations;
    private optimizeTitle;
    private addHeadingStructure;
    private addInternalLinks;
    private improveKeywordUsage;
    private extractMainTopic;
    private mapCompetitionToDifficulty;
    private mapCompetitionLevel;
    private mapDifficultyToCompetition;
    private determineSearchIntent;
}
//# sourceMappingURL=seo-optimizer.d.ts.map