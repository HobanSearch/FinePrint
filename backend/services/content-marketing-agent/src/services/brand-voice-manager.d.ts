import { BrandVoiceConfig } from '../types';
export declare class BrandVoiceManager {
    private brandVoiceConfig;
    constructor();
    private initializeBrandVoice;
    getBrandVoice(): Promise<BrandVoiceConfig>;
    updateBrandVoice(updates: Partial<BrandVoiceConfig>): Promise<BrandVoiceConfig>;
    analyzeToneCompliance(content: string): Promise<{
        score: number;
        issues: string[];
        suggestions: string[];
    }>;
    generateBrandVoicePrompt(): Promise<string>;
    adaptForPlatform(platform: string): Promise<Partial<BrandVoiceConfig>>;
    validateContent(content: string, contentType: string): Promise<{
        isValid: boolean;
        score: number;
        feedback: string[];
    }>;
    generateContentGuidelines(contentType: string, platform?: string): Promise<string[]>;
}
//# sourceMappingURL=brand-voice-manager.d.ts.map