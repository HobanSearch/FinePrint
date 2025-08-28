"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentCreationEngine = void 0;
const openai_1 = __importDefault(require("openai"));
const ollama_1 = require("ollama");
const uuid_1 = require("uuid");
const types_1 = require("../types");
const config_1 = require("../config");
const brand_voice_manager_1 = require("./brand-voice-manager");
const seo_optimizer_1 = require("./seo-optimizer");
const logger_1 = require("../utils/logger");
class ContentCreationEngine {
    openai;
    ollama;
    brandVoiceManager;
    seoOptimizer;
    constructor() {
        this.openai = new openai_1.default({
            apiKey: config_1.config.openai.apiKey
        });
        this.ollama = new ollama_1.Ollama({
            host: config_1.config.ollama.baseUrl
        });
        this.brandVoiceManager = new brand_voice_manager_1.BrandVoiceManager();
        this.seoOptimizer = new seo_optimizer_1.SEOOptimizer();
    }
    async createContent(request) {
        try {
            logger_1.logger.info('Starting content creation', { request });
            this.validateRequest(request);
            const brandVoice = await this.brandVoiceManager.getBrandVoice();
            let content;
            let title;
            let metadata = {};
            switch (request.type) {
                case 'blog_post':
                    ({ content, title, metadata } = await this.createBlogPost(request, brandVoice));
                    break;
                case 'social_media_post':
                    ({ content, title, metadata } = await this.createSocialMediaPost(request, brandVoice));
                    break;
                case 'email_campaign':
                    ({ content, title, metadata } = await this.createEmailCampaign(request, brandVoice));
                    break;
                case 'video_script':
                    ({ content, title, metadata } = await this.createVideoScript(request, brandVoice));
                    break;
                case 'case_study':
                    ({ content, title, metadata } = await this.createCaseStudy(request, brandVoice));
                    break;
                case 'whitepaper':
                    ({ content, title, metadata } = await this.createWhitepaper(request, brandVoice));
                    break;
                case 'press_release':
                    ({ content, title, metadata } = await this.createPressRelease(request, brandVoice));
                    break;
                default:
                    ({ content, title, metadata } = await this.createGenericContent(request, brandVoice));
            }
            const excerpt = this.extractExcerpt(content);
            const tags = await this.generateTags(content, request.topic);
            let seoScore = 0;
            let optimizedContent = content;
            if (request.seoOptimized) {
                const seoResult = await this.seoOptimizer.optimizeContent(content, title, request.keywords || []);
                optimizedContent = seoResult.optimizedContent;
                seoScore = seoResult.score;
            }
            const wordCount = this.calculateWordCount(optimizedContent);
            const readingTime = this.calculateReadingTime(wordCount);
            const engagementPrediction = await this.predictEngagement(optimizedContent, request.type, request.platform || 'blog');
            const hashtags = request.platform && ['linkedin', 'twitter', 'instagram'].includes(request.platform)
                ? await this.generateHashtags(optimizedContent, request.platform)
                : [];
            const visualSuggestions = request.includeVisuals
                ? await this.generateVisualSuggestions(optimizedContent, request.type)
                : [];
            const callToAction = request.includeCallToAction
                ? await this.generateCallToAction(request.type, request.platform)
                : undefined;
            const generatedContent = {
                id: (0, uuid_1.v4)(),
                type: request.type,
                title,
                content: optimizedContent,
                excerpt,
                tags,
                keywords: request.keywords || [],
                platform: request.platform || 'blog',
                status: 'draft',
                tone: request.tone || 'professional',
                wordCount,
                readingTime,
                seoScore,
                engagementPrediction,
                callToAction,
                visualSuggestions,
                hashtags,
                metadata,
                createdAt: new Date(),
                updatedAt: new Date(),
                authorId: 'content-marketing-agent',
                campaignId: request.campaignId
            };
            logger_1.logger.info('Content creation completed', {
                contentId: generatedContent.id,
                type: request.type,
                wordCount,
                seoScore
            });
            return generatedContent;
        }
        catch (error) {
            logger_1.logger.error('Content creation failed', { error, request });
            throw error;
        }
    }
    async createBlogPost(request, brandVoice) {
        const prompt = this.buildBlogPostPrompt(request, brandVoice);
        const response = await this.openai.chat.completions.create({
            model: config_1.config.openai.model,
            messages: [
                {
                    role: 'system',
                    content: this.getSystemPrompt(brandVoice)
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: config_1.config.openai.maxTokens,
            temperature: 0.7
        });
        const fullResponse = response.choices[0]?.message?.content || '';
        const { title, content } = this.parseFullContent(fullResponse);
        return {
            content,
            title,
            metadata: {
                structure: config_1.contentTemplates.blog_post.structure,
                targetLength: this.getTargetLength(request.length || 'medium', 'blog_post')
            }
        };
    }
    async createSocialMediaPost(request, brandVoice) {
        const platform = request.platform || 'linkedin';
        const platformSpecs = config_1.contentTemplates.social_media_post[platform];
        const prompt = this.buildSocialMediaPrompt(request, brandVoice, platformSpecs);
        const response = await this.openai.chat.completions.create({
            model: config_1.config.openai.model,
            messages: [
                {
                    role: 'system',
                    content: this.getSocialMediaSystemPrompt(brandVoice, platform)
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 500,
            temperature: 0.8
        });
        const content = response.choices[0]?.message?.content || '';
        const title = `${platform} Post: ${request.topic}`;
        return {
            content,
            title,
            metadata: {
                platform,
                maxLength: platformSpecs?.maxLength,
                structure: platformSpecs?.structure
            }
        };
    }
    async createEmailCampaign(request, brandVoice) {
        const prompt = this.buildEmailPrompt(request, brandVoice);
        const response = await this.openai.chat.completions.create({
            model: config_1.config.openai.model,
            messages: [
                {
                    role: 'system',
                    content: this.getEmailSystemPrompt(brandVoice)
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 2000,
            temperature: 0.7
        });
        const fullResponse = response.choices[0]?.message?.content || '';
        const { title, content } = this.parseEmailContent(fullResponse);
        return {
            content,
            title,
            metadata: {
                structure: config_1.contentTemplates.email_campaign.structure,
                subjectLineOptimized: true
            }
        };
    }
    async createVideoScript(request, brandVoice) {
        const prompt = `Create a video script about ${request.topic} for ${request.targetAudience}. 
    The script should be engaging, educational, and align with our brand voice. 
    Include scene directions, talking points, and visual cues.
    Format as a proper video script with timestamps and scenes.`;
        const response = await this.openai.chat.completions.create({
            model: config_1.config.openai.model,
            messages: [
                {
                    role: 'system',
                    content: `${this.getSystemPrompt(brandVoice)}\n\nYou are writing a video script. Include scene directions, timing, and visual elements.`
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 3000,
            temperature: 0.7
        });
        const content = response.choices[0]?.message?.content || '';
        const title = `Video Script: ${request.topic}`;
        return {
            content,
            title,
            metadata: {
                type: 'video_script',
                estimatedDuration: this.estimateVideoDuration(content),
                scenes: this.extractScenes(content)
            }
        };
    }
    async createCaseStudy(request, brandVoice) {
        const prompt = `Create a detailed case study about ${request.topic}. 
    Structure: Problem, Solution, Implementation, Results, Lessons Learned.
    Make it data-driven and compelling for ${request.targetAudience}.
    Include specific metrics and outcomes where possible.`;
        const response = await this.openai.chat.completions.create({
            model: config_1.config.openai.model,
            messages: [
                {
                    role: 'system',
                    content: `${this.getSystemPrompt(brandVoice)}\n\nYou are writing a professional case study. Include specific data, metrics, and actionable insights.`
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 4000,
            temperature: 0.6
        });
        const content = response.choices[0]?.message?.content || '';
        const title = `Case Study: ${request.topic}`;
        return {
            content,
            title,
            metadata: {
                type: 'case_study',
                structure: ['problem', 'solution', 'implementation', 'results', 'lessons']
            }
        };
    }
    async createWhitepaper(request, brandVoice) {
        const prompt = `Create a comprehensive whitepaper on ${request.topic}. 
    This should be authoritative, research-backed, and valuable for ${request.targetAudience}.
    Include executive summary, detailed analysis, recommendations, and conclusion.
    Use a professional, educational tone with supporting data.`;
        const response = await this.openai.chat.completions.create({
            model: config_1.config.openai.model,
            messages: [
                {
                    role: 'system',
                    content: `${this.getSystemPrompt(brandVoice)}\n\nYou are writing an authoritative whitepaper. Include research, data, and expert insights.`
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 4000,
            temperature: 0.5
        });
        const content = response.choices[0]?.message?.content || '';
        const title = `Whitepaper: ${request.topic}`;
        return {
            content,
            title,
            metadata: {
                type: 'whitepaper',
                structure: ['executive_summary', 'introduction', 'analysis', 'recommendations', 'conclusion']
            }
        };
    }
    async createPressRelease(request, brandVoice) {
        const prompt = `Write a press release about ${request.topic}. 
    Follow standard press release format with headline, dateline, lead paragraph, body, and boilerplate.
    Make it newsworthy and compelling for media outlets.
    Include quotes and relevant details.`;
        const response = await this.openai.chat.completions.create({
            model: config_1.config.openai.model,
            messages: [
                {
                    role: 'system',
                    content: `${this.getSystemPrompt(brandVoice)}\n\nYou are writing a professional press release. Follow AP style and press release best practices.`
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 2000,
            temperature: 0.6
        });
        const content = response.choices[0]?.message?.content || '';
        const title = `Press Release: ${request.topic}`;
        return {
            content,
            title,
            metadata: {
                type: 'press_release',
                format: 'standard_press_release'
            }
        };
    }
    async createGenericContent(request, brandVoice) {
        const prompt = `Create ${request.type.replace('_', ' ')} content about ${request.topic} 
    for ${request.targetAudience}. Make it valuable, engaging, and aligned with our brand voice.`;
        const response = await this.openai.chat.completions.create({
            model: config_1.config.openai.model,
            messages: [
                {
                    role: 'system',
                    content: this.getSystemPrompt(brandVoice)
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: config_1.config.openai.maxTokens,
            temperature: 0.7
        });
        const content = response.choices[0]?.message?.content || '';
        const title = `${request.type.replace('_', ' ')}: ${request.topic}`;
        return {
            content,
            title,
            metadata: {
                type: request.type
            }
        };
    }
    validateRequest(request) {
        if (!request.topic || request.topic.trim().length === 0) {
            throw new types_1.ValidationError('Topic is required');
        }
        if (!request.targetAudience || request.targetAudience.trim().length === 0) {
            throw new types_1.ValidationError('Target audience is required');
        }
    }
    getSystemPrompt(brandVoice) {
        return `You are a content marketing specialist for Fine Print AI, a company that helps users understand legal documents and protect their digital rights.

Brand Voice:
- Archetype: ${brandVoice.archetype} 
- Personality: ${Object.entries(brandVoice.brandPersonality).map(([trait, score]) => `${trait}: ${score}/10`).join(', ')}
- Tone: ${brandVoice.toneAttributes.join(', ')}

Writing Guidelines:
${brandVoice.guidelines.map(g => `- ${g}`).join('\n')}

Preferred vocabulary: ${brandVoice.vocabulary.preferred.join(', ')}
Avoid: ${brandVoice.vocabulary.avoid.join(', ')}

Write content that protects and empowers users while maintaining professional authority.`;
    }
    getSocialMediaSystemPrompt(brandVoice, platform) {
        return `${this.getSystemPrompt(brandVoice)}

Platform: ${platform}
Focus on engagement and value delivery. Use platform-appropriate formatting and tone.
${platform === 'linkedin' ? 'Professional tone, industry insights, thought leadership.' : ''}
${platform === 'twitter' ? 'Concise, impactful, conversation-starting.' : ''}
${platform === 'facebook' ? 'Community-focused, storytelling, relatable.' : ''}`;
    }
    getEmailSystemPrompt(brandVoice) {
        return `${this.getSystemPrompt(brandVoice)}

Writing an email campaign. Include:
- Compelling subject line (under 50 characters)
- Engaging preheader text
- Personal greeting
- Clear value proposition
- Strong call to action
- Professional signature

Format as: SUBJECT: [subject line]\nPREHEADER: [preheader]\n\n[email body]`;
    }
    buildBlogPostPrompt(request, brandVoice) {
        const targetLength = this.getTargetLength(request.length || 'medium', 'blog_post');
        const keywordText = request.keywords ? `Keywords to naturally include: ${request.keywords.join(', ')}` : '';
        return `Write a comprehensive blog post about "${request.topic}" for ${request.targetAudience}.

Requirements:
- Target length: ${targetLength} words
- Tone: ${request.tone || 'professional'}
- ${keywordText}
- Include practical, actionable advice
- Use clear headings and structure
- Focus on legal transparency and user protection

Structure:
1. Compelling headline
2. Hook introduction 
3. Main points with examples
4. Actionable takeaways
5. Clear call to action

Make it valuable and shareable while staying true to our brand voice.`;
    }
    buildSocialMediaPrompt(request, brandVoice, platformSpecs) {
        return `Create a ${request.platform} post about "${request.topic}" for ${request.targetAudience}.

Requirements:
- Maximum length: ${platformSpecs?.maxLength} characters
- Structure: ${platformSpecs?.structure?.join(' → ')}
- Tone: ${request.tone || 'professional'}
- Include value and engagement
- ${request.includeCallToAction ? 'Include a clear call to action' : ''}

Make it scroll-stopping and shareable while providing real value.`;
    }
    buildEmailPrompt(request, brandVoice) {
        return `Create an email campaign about "${request.topic}" for ${request.targetAudience}.

Requirements:
- Compelling subject line (under 50 characters)
- Engaging content that provides value
- Clear call to action
- Tone: ${request.tone || 'professional'}
- Focus on legal protection and transparency

Structure the email with proper formatting and ensure it's mobile-friendly.`;
    }
    parseFullContent(response) {
        const lines = response.split('\n');
        const title = lines[0]?.replace(/^#\s*/, '') || 'Untitled';
        const content = lines.slice(1).join('\n').trim();
        return { title, content };
    }
    parseEmailContent(response) {
        const subjectMatch = response.match(/SUBJECT:\s*(.+)/i);
        const title = subjectMatch ? subjectMatch[1].trim() : 'Email Campaign';
        const content = response
            .replace(/SUBJECT:\s*.+/i, '')
            .replace(/PREHEADER:\s*.+/i, '')
            .trim();
        return { title, content };
    }
    extractExcerpt(content, maxLength = 160) {
        const cleanContent = content.replace(/[#*_`]/g, '').trim();
        if (cleanContent.length <= maxLength)
            return cleanContent;
        const excerpt = cleanContent.substring(0, maxLength);
        const lastSpace = excerpt.lastIndexOf(' ');
        return lastSpace > 0 ? excerpt.substring(0, lastSpace) + '...' : excerpt + '...';
    }
    async generateTags(content, topic) {
        const prompt = `Analyze this content and generate 5-8 relevant tags that would help categorize and discover this content. Focus on legal tech, privacy, transparency, and user protection themes.

Content: ${content.substring(0, 500)}...
Topic: ${topic}

Return only the tags as a comma-separated list.`;
        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 100,
                temperature: 0.5
            });
            const tagsText = response.choices[0]?.message?.content || '';
            return tagsText.split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean);
        }
        catch (error) {
            logger_1.logger.error('Failed to generate tags', { error });
            return [topic.toLowerCase(), 'legal-tech', 'privacy', 'transparency'];
        }
    }
    calculateWordCount(content) {
        return content.trim().split(/\s+/).length;
    }
    calculateReadingTime(wordCount) {
        const wordsPerMinute = 200;
        return Math.ceil(wordCount / wordsPerMinute);
    }
    async predictEngagement(content, type, platform) {
        let score = 50;
        const contentLower = content.toLowerCase();
        if (contentLower.includes('how to'))
            score += 10;
        if (contentLower.includes('free'))
            score += 8;
        if (contentLower.includes('protect'))
            score += 7;
        if (contentLower.includes('avoid'))
            score += 6;
        if (contentLower.includes('?'))
            score += 5;
        if (platform === 'linkedin' && type === 'blog_post')
            score += 15;
        if (platform === 'twitter' && content.length < 200)
            score += 10;
        if (platform === 'facebook' && contentLower.includes('story'))
            score += 8;
        if (type === 'case_study')
            score += 12;
        if (type === 'guide')
            score += 10;
        if (type === 'video_script')
            score += 15;
        return Math.min(Math.max(score, 0), 100);
    }
    async generateHashtags(content, platform) {
        const platformLimits = {
            linkedin: 5,
            twitter: 3,
            instagram: 10,
            facebook: 5
        };
        const limit = platformLimits[platform] || 3;
        const baseHashtags = [
            '#LegalTech',
            '#PrivacyRights',
            '#DigitalRights',
            '#Transparency',
            '#UserProtection',
            '#TermsOfService',
            '#PrivacyPolicy',
            '#FinePrintAI'
        ];
        const topicHashtags = [];
        const contentLower = content.toLowerCase();
        if (contentLower.includes('gdpr'))
            topicHashtags.push('#GDPR');
        if (contentLower.includes('ccpa'))
            topicHashtags.push('#CCPA');
        if (contentLower.includes('data breach'))
            topicHashtags.push('#DataBreach');
        if (contentLower.includes('security'))
            topicHashtags.push('#CyberSecurity');
        if (contentLower.includes('social media'))
            topicHashtags.push('#SocialMedia');
        const allHashtags = [...baseHashtags, ...topicHashtags];
        return allHashtags.slice(0, limit);
    }
    async generateVisualSuggestions(content, type) {
        const suggestions = [];
        switch (type) {
            case 'blog_post':
                suggestions.push('Featured image with legal document and magnifying glass', 'Infographic showing key statistics', 'Screenshots of problematic clauses', 'Step-by-step process diagram');
                break;
            case 'social_media_post':
                suggestions.push('Quote card with key insight', 'Statistical visualization', 'Brand logo with key message');
                break;
            case 'video_script':
                suggestions.push('Screen recordings of document analysis', 'Animated explanations of complex concepts', 'Split-screen comparisons');
                break;
            case 'infographic_content':
                suggestions.push('Data visualization charts', 'Process flow diagrams', 'Comparison tables', 'Icon-based information hierarchy');
                break;
        }
        return suggestions;
    }
    async generateCallToAction(type, platform) {
        const ctas = {
            blog_post: [
                'Try Fine Print AI free for 30 days',
                'Analyze your first document now',
                'Get started with document protection',
                'Join thousands protecting their digital rights'
            ],
            social_media_post: [
                'Learn more about your rights',
                'Get your free analysis',
                'Protect yourself today',
                'Share to help others'
            ],
            email_campaign: [
                'Start your free trial',
                'Analyze your agreements now',
                'Claim your protection',
                'Join the movement'
            ],
            case_study: [
                'See how we can help you',
                'Start protecting your business',
                'Get your custom analysis'
            ]
        };
        const typeCtas = ctas[type] || ctas.blog_post;
        return typeCtas[Math.floor(Math.random() * typeCtas.length)];
    }
    getTargetLength(length, type) {
        const lengths = config_1.contentTemplates[type];
        if (lengths && 'wordCount' in lengths) {
            return lengths.wordCount[length];
        }
        const defaults = { short: 500, medium: 1000, long: 2000 };
        return defaults[length];
    }
    estimateVideoDuration(script) {
        const wordCount = this.calculateWordCount(script);
        return Math.ceil(wordCount / 150);
    }
    extractScenes(script) {
        const sceneRegex = /(?:scene|shot|cut to)[\s\d:]+/gi;
        const matches = script.match(sceneRegex) || [];
        return matches.map(match => match.trim());
    }
}
exports.ContentCreationEngine = ContentCreationEngine;
//# sourceMappingURL=content-creation-engine.js.map