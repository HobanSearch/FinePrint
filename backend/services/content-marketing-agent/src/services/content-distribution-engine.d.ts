import { GeneratedContent, Platform } from '../types';
interface PublishResult {
    platform: Platform;
    success: boolean;
    publishedId?: string;
    url?: string;
    error?: string;
    scheduledFor?: Date;
}
export declare class ContentDistributionEngine {
    private linkedInApiUrl;
    private twitterApiUrl;
    private facebookApiUrl;
    private bufferApiUrl;
    private hootsuiteDashUrl;
    constructor();
    publishContent(content: GeneratedContent, platforms: Platform[], options?: {
        scheduleTime?: Date;
        immediate?: boolean;
        testMode?: boolean;
    }): Promise<PublishResult[]>;
    scheduleContent(content: GeneratedContent, platforms: Platform[], scheduleTime: Date, options?: {
        recurring?: 'daily' | 'weekly' | 'monthly';
        endDate?: Date;
    }): Promise<PublishResult[]>;
    private publishToPlatform;
    private publishToLinkedIn;
    private publishToTwitter;
    private publishToFacebook;
    private publishToMedium;
    private sendEmailCampaign;
    private publishToBlog;
    private scheduleToPlatform;
    private scheduleWithBuffer;
    private validateContentForPlatform;
    private adaptContentForLinkedIn;
    private adaptContentForTwitter;
    private adaptContentForFacebook;
    private adaptContentForMedium;
    private adaptContentForEmail;
    private adaptContentForPlatform;
    private splitIntoTweets;
    private markdownToHtml;
    private getLinkedInAccessToken;
    private getLinkedInPersonId;
    private getTwitterBearerToken;
    private getFacebookPageAccessToken;
    private getFacebookPageId;
}
export {};
//# sourceMappingURL=content-distribution-engine.d.ts.map