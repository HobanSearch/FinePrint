import { ContentCreationRequest, GeneratedContent } from '../types';
export declare class ContentCreationEngine {
    private openai;
    private ollama;
    private brandVoiceManager;
    private seoOptimizer;
    constructor();
    createContent(request: ContentCreationRequest): Promise<GeneratedContent>;
    private createBlogPost;
    private createSocialMediaPost;
    private createEmailCampaign;
    private createVideoScript;
    private createCaseStudy;
    private createWhitepaper;
    private createPressRelease;
    private createGenericContent;
    private validateRequest;
    private getSystemPrompt;
    private getSocialMediaSystemPrompt;
    private getEmailSystemPrompt;
    private buildBlogPostPrompt;
    private buildSocialMediaPrompt;
    private buildEmailPrompt;
    private parseFullContent;
    private parseEmailContent;
    private extractExcerpt;
    private generateTags;
    private calculateWordCount;
    private calculateReadingTime;
    private predictEngagement;
    private generateHashtags;
    private generateVisualSuggestions;
    private generateCallToAction;
    private getTargetLength;
    private estimateVideoDuration;
    private extractScenes;
}
//# sourceMappingURL=content-creation-engine.d.ts.map