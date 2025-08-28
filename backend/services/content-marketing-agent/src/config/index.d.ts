import { ContentMarketingConfig } from '../types';
export declare const config: ContentMarketingConfig;
export declare const serverConfig: {
    port: number;
    host: string;
    environment: string;
    cors: {
        origin: string[];
        credentials: boolean;
    };
    rateLimit: {
        max: number;
        timeWindow: string;
    };
    jwt: {
        secret: string;
        expiresIn: string;
    };
};
export declare const brandVoiceDefaults: {
    archetype: "guardian";
    toneAttributes: string[];
    vocabulary: {
        preferred: string[];
        avoid: string[];
    };
    writingStyle: {
        sentenceLength: "varied";
        paragraphLength: "medium";
        formalityLevel: number;
        technicalLevel: number;
    };
    brandPersonality: {
        approachable: number;
        intelligent: number;
        protective: number;
        clear: number;
        empowering: number;
    };
    guidelines: string[];
};
export declare const contentTemplates: {
    blog_post: {
        structure: string[];
        wordCount: {
            short: number;
            medium: number;
            long: number;
        };
    };
    social_media_post: {
        linkedin: {
            maxLength: number;
            structure: string[];
            hashtagLimit: number;
        };
        twitter: {
            maxLength: number;
            structure: string[];
            hashtagLimit: number;
        };
        facebook: {
            maxLength: number;
            structure: string[];
            hashtagLimit: number;
        };
    };
    email_campaign: {
        structure: string[];
        subjectLineLength: number;
    };
};
export default config;
//# sourceMappingURL=index.d.ts.map