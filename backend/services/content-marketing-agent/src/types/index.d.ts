import { z } from 'zod';
export declare const ContentTypeSchema: any;
export type ContentType = z.infer<typeof ContentTypeSchema>;
export declare const PlatformSchema: any;
export type Platform = z.infer<typeof PlatformSchema>;
export declare const ContentStatusSchema: any;
export type ContentStatus = z.infer<typeof ContentStatusSchema>;
export declare const CampaignTypeSchema: any;
export type CampaignType = z.infer<typeof CampaignTypeSchema>;
export declare const ContentCreationRequestSchema: any;
export type ContentCreationRequest = z.infer<typeof ContentCreationRequestSchema>;
export declare const GeneratedContentSchema: any;
export type GeneratedContent = z.infer<typeof GeneratedContentSchema>;
export declare const SEOAnalysisSchema: any;
export type SEOAnalysis = z.infer<typeof SEOAnalysisSchema>;
export declare const ContentCalendarEntrySchema: any;
export type ContentCalendarEntry = z.infer<typeof ContentCalendarEntrySchema>;
export declare const CampaignSchema: any;
export type Campaign = z.infer<typeof CampaignSchema>;
export declare const AnalyticsDataSchema: any;
export type AnalyticsData = z.infer<typeof AnalyticsDataSchema>;
export declare const BrandVoiceConfigSchema: any;
export type BrandVoiceConfig = z.infer<typeof BrandVoiceConfigSchema>;
export declare const KeywordDataSchema: any;
export type KeywordData = z.infer<typeof KeywordDataSchema>;
export declare const EmailCampaignSchema: any;
export type EmailCampaign = z.infer<typeof EmailCampaignSchema>;
export declare const LeadSchema: any;
export type Lead = z.infer<typeof LeadSchema>;
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    pagination?: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
export interface ContentCreationResponse extends ApiResponse {
    data: GeneratedContent;
}
export interface ContentListResponse extends ApiResponse {
    data: GeneratedContent[];
}
export interface CampaignResponse extends ApiResponse {
    data: Campaign;
}
export interface AnalyticsResponse extends ApiResponse {
    data: AnalyticsData[];
}
export interface ContentMarketingConfig {
    openai: {
        apiKey: string;
        model: string;
        maxTokens: number;
    };
    ollama: {
        baseUrl: string;
        model: string;
    };
    database: {
        url: string;
    };
    redis: {
        url: string;
    };
    socialMedia: {
        linkedin: {
            clientId: string;
            clientSecret: string;
        };
        twitter: {
            apiKey: string;
            apiSecret: string;
            accessToken: string;
            accessTokenSecret: string;
        };
        facebook: {
            appId: string;
            appSecret: string;
        };
    };
    email: {
        sendgrid: {
            apiKey: string;
        };
        mailchimp: {
            apiKey: string;
            serverPrefix: string;
        };
    };
    seo: {
        ahrefs: {
            apiKey: string;
        };
        semrush: {
            apiKey: string;
        };
    };
    analytics: {
        googleAnalytics: {
            propertyId: string;
            credentialsPath: string;
        };
    };
    storage: {
        bucket: string;
        region: string;
    };
}
export declare class ContentMarketingError extends Error {
    code: string;
    statusCode: number;
    constructor(message: string, code: string, statusCode?: number);
}
export declare class ValidationError extends ContentMarketingError {
    constructor(message: string);
}
export declare class NotFoundError extends ContentMarketingError {
    constructor(resource: string);
}
export declare class ExternalAPIError extends ContentMarketingError {
    constructor(service: string, message: string);
}
//# sourceMappingURL=index.d.ts.map