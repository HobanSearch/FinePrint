import OpenAI from 'openai';
import { Ollama } from 'ollama';
import { v4 as uuidv4 } from 'uuid';
import {
  ContentCreationRequest,
  GeneratedContent,
  ContentType,
  Platform,
  BrandVoiceConfig,
  ValidationError
} from '../types';
import { config, brandVoiceDefaults, contentTemplates } from '../config';
import { BrandVoiceManager } from './brand-voice-manager';
import { SEOOptimizer } from './seo-optimizer';
import { logger } from '../utils/logger';

export class ContentCreationEngine {
  private openai: OpenAI;
  private ollama: Ollama;
  private brandVoiceManager: BrandVoiceManager;
  private seoOptimizer: SEOOptimizer;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey
    });
    this.ollama = new Ollama({
      host: config.ollama.baseUrl
    });
    this.brandVoiceManager = new BrandVoiceManager();
    this.seoOptimizer = new SEOOptimizer();
  }

  async createContent(request: ContentCreationRequest): Promise<GeneratedContent> {
    try {
      logger.info('Starting content creation', { request });

      // Validate request
      this.validateRequest(request);

      // Get brand voice configuration
      const brandVoice = await this.brandVoiceManager.getBrandVoice();

      // Generate content based on type
      let content: string;
      let title: string;
      let metadata: Record<string, any> = {};

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

      // Extract excerpt
      const excerpt = this.extractExcerpt(content);

      // Extract and enhance tags
      const tags = await this.generateTags(content, request.topic);

      // Optimize for SEO if requested
      let seoScore = 0;
      let optimizedContent = content;
      if (request.seoOptimized) {
        const seoResult = await this.seoOptimizer.optimizeContent(
          content,
          title,
          request.keywords || []
        );
        optimizedContent = seoResult.optimizedContent;
        seoScore = seoResult.score;
      }

      // Calculate reading time and word count
      const wordCount = this.calculateWordCount(optimizedContent);
      const readingTime = this.calculateReadingTime(wordCount);

      // Generate engagement prediction
      const engagementPrediction = await this.predictEngagement(
        optimizedContent,
        request.type,
        request.platform || 'blog'
      );

      // Generate hashtags for social media
      const hashtags = request.platform && ['linkedin', 'twitter', 'instagram'].includes(request.platform)
        ? await this.generateHashtags(optimizedContent, request.platform)
        : [];

      // Generate visual suggestions
      const visualSuggestions = request.includeVisuals
        ? await this.generateVisualSuggestions(optimizedContent, request.type)
        : [];

      // Create call to action
      const callToAction = request.includeCallToAction
        ? await this.generateCallToAction(request.type, request.platform)
        : undefined;

      const generatedContent: GeneratedContent = {
        id: uuidv4(),
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

      logger.info('Content creation completed', { 
        contentId: generatedContent.id,
        type: request.type,
        wordCount,
        seoScore 
      });

      return generatedContent;

    } catch (error) {
      logger.error('Content creation failed', { error, request });
      throw error;
    }
  }

  private async createBlogPost(
    request: ContentCreationRequest,
    brandVoice: BrandVoiceConfig
  ): Promise<{ content: string; title: string; metadata: Record<string, any> }> {
    const prompt = this.buildBlogPostPrompt(request, brandVoice);
    
    const response = await this.openai.chat.completions.create({
      model: config.openai.model,
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
      max_tokens: config.openai.maxTokens,
      temperature: 0.7
    });

    const fullResponse = response.choices[0]?.message?.content || '';
    const { title, content } = this.parseFullContent(fullResponse);

    return {
      content,
      title,
      metadata: {
        structure: contentTemplates.blog_post.structure,
        targetLength: this.getTargetLength(request.length || 'medium', 'blog_post')
      }
    };
  }

  private async createSocialMediaPost(
    request: ContentCreationRequest,
    brandVoice: BrandVoiceConfig
  ): Promise<{ content: string; title: string; metadata: Record<string, any> }> {
    const platform = request.platform || 'linkedin';
    const platformSpecs = contentTemplates.social_media_post[platform as keyof typeof contentTemplates.social_media_post];
    
    const prompt = this.buildSocialMediaPrompt(request, brandVoice, platformSpecs);
    
    const response = await this.openai.chat.completions.create({
      model: config.openai.model,
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

  private async createEmailCampaign(
    request: ContentCreationRequest,
    brandVoice: BrandVoiceConfig
  ): Promise<{ content: string; title: string; metadata: Record<string, any> }> {
    const prompt = this.buildEmailPrompt(request, brandVoice);
    
    const response = await this.openai.chat.completions.create({
      model: config.openai.model,
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
        structure: contentTemplates.email_campaign.structure,
        subjectLineOptimized: true
      }
    };
  }

  private async createVideoScript(
    request: ContentCreationRequest,
    brandVoice: BrandVoiceConfig
  ): Promise<{ content: string; title: string; metadata: Record<string, any> }> {
    const prompt = `Create a video script about ${request.topic} for ${request.targetAudience}. 
    The script should be engaging, educational, and align with our brand voice. 
    Include scene directions, talking points, and visual cues.
    Format as a proper video script with timestamps and scenes.`;

    const response = await this.openai.chat.completions.create({
      model: config.openai.model,
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

  private async createCaseStudy(
    request: ContentCreationRequest,
    brandVoice: BrandVoiceConfig
  ): Promise<{ content: string; title: string; metadata: Record<string, any> }> {
    const prompt = `Create a detailed case study about ${request.topic}. 
    Structure: Problem, Solution, Implementation, Results, Lessons Learned.
    Make it data-driven and compelling for ${request.targetAudience}.
    Include specific metrics and outcomes where possible.`;

    const response = await this.openai.chat.completions.create({
      model: config.openai.model,
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

  private async createWhitepaper(
    request: ContentCreationRequest,
    brandVoice: BrandVoiceConfig
  ): Promise<{ content: string; title: string; metadata: Record<string, any> }> {
    const prompt = `Create a comprehensive whitepaper on ${request.topic}. 
    This should be authoritative, research-backed, and valuable for ${request.targetAudience}.
    Include executive summary, detailed analysis, recommendations, and conclusion.
    Use a professional, educational tone with supporting data.`;

    const response = await this.openai.chat.completions.create({
      model: config.openai.model,
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

  private async createPressRelease(
    request: ContentCreationRequest,
    brandVoice: BrandVoiceConfig
  ): Promise<{ content: string; title: string; metadata: Record<string, any> }> {
    const prompt = `Write a press release about ${request.topic}. 
    Follow standard press release format with headline, dateline, lead paragraph, body, and boilerplate.
    Make it newsworthy and compelling for media outlets.
    Include quotes and relevant details.`;

    const response = await this.openai.chat.completions.create({
      model: config.openai.model,
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

  private async createGenericContent(
    request: ContentCreationRequest,
    brandVoice: BrandVoiceConfig
  ): Promise<{ content: string; title: string; metadata: Record<string, any> }> {
    const prompt = `Create ${request.type.replace('_', ' ')} content about ${request.topic} 
    for ${request.targetAudience}. Make it valuable, engaging, and aligned with our brand voice.`;

    const response = await this.openai.chat.completions.create({
      model: config.openai.model,
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
      max_tokens: config.openai.maxTokens,
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

  // Helper methods
  private validateRequest(request: ContentCreationRequest): void {
    if (!request.topic || request.topic.trim().length === 0) {
      throw new ValidationError('Topic is required');
    }
    if (!request.targetAudience || request.targetAudience.trim().length === 0) {
      throw new ValidationError('Target audience is required');
    }
  }

  private getSystemPrompt(brandVoice: BrandVoiceConfig): string {
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

  private getSocialMediaSystemPrompt(brandVoice: BrandVoiceConfig, platform: string): string {
    return `${this.getSystemPrompt(brandVoice)}

Platform: ${platform}
Focus on engagement and value delivery. Use platform-appropriate formatting and tone.
${platform === 'linkedin' ? 'Professional tone, industry insights, thought leadership.' : ''}
${platform === 'twitter' ? 'Concise, impactful, conversation-starting.' : ''}
${platform === 'facebook' ? 'Community-focused, storytelling, relatable.' : ''}`;
  }

  private getEmailSystemPrompt(brandVoice: BrandVoiceConfig): string {
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

  private buildBlogPostPrompt(request: ContentCreationRequest, brandVoice: BrandVoiceConfig): string {
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

  private buildSocialMediaPrompt(request: ContentCreationRequest, brandVoice: BrandVoiceConfig, platformSpecs: any): string {
    return `Create a ${request.platform} post about "${request.topic}" for ${request.targetAudience}.

Requirements:
- Maximum length: ${platformSpecs?.maxLength} characters
- Structure: ${platformSpecs?.structure?.join(' → ')}
- Tone: ${request.tone || 'professional'}
- Include value and engagement
- ${request.includeCallToAction ? 'Include a clear call to action' : ''}

Make it scroll-stopping and shareable while providing real value.`;
  }

  private buildEmailPrompt(request: ContentCreationRequest, brandVoice: BrandVoiceConfig): string {
    return `Create an email campaign about "${request.topic}" for ${request.targetAudience}.

Requirements:
- Compelling subject line (under 50 characters)
- Engaging content that provides value
- Clear call to action
- Tone: ${request.tone || 'professional'}
- Focus on legal protection and transparency

Structure the email with proper formatting and ensure it's mobile-friendly.`;
  }

  private parseFullContent(response: string): { title: string; content: string } {
    const lines = response.split('\n');
    const title = lines[0]?.replace(/^#\s*/, '') || 'Untitled';
    const content = lines.slice(1).join('\n').trim();
    return { title, content };
  }

  private parseEmailContent(response: string): { title: string; content: string } {
    const subjectMatch = response.match(/SUBJECT:\s*(.+)/i);
    const title = subjectMatch ? subjectMatch[1].trim() : 'Email Campaign';
    
    // Remove subject and preheader lines from content
    const content = response
      .replace(/SUBJECT:\s*.+/i, '')
      .replace(/PREHEADER:\s*.+/i, '')
      .trim();
    
    return { title, content };
  }

  private extractExcerpt(content: string, maxLength: number = 160): string {
    const cleanContent = content.replace(/[#*_`]/g, '').trim();
    if (cleanContent.length <= maxLength) return cleanContent;
    
    const excerpt = cleanContent.substring(0, maxLength);
    const lastSpace = excerpt.lastIndexOf(' ');
    return lastSpace > 0 ? excerpt.substring(0, lastSpace) + '...' : excerpt + '...';
  }

  private async generateTags(content: string, topic: string): Promise<string[]> {
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
    } catch (error) {
      logger.error('Failed to generate tags', { error });
      return [topic.toLowerCase(), 'legal-tech', 'privacy', 'transparency'];
    }
  }

  private calculateWordCount(content: string): number {
    return content.trim().split(/\s+/).length;
  }

  private calculateReadingTime(wordCount: number): number {
    const wordsPerMinute = 200;
    return Math.ceil(wordCount / wordsPerMinute);
  }

  private async predictEngagement(content: string, type: ContentType, platform: Platform): Promise<number> {
    // Simplified engagement prediction based on content characteristics
    let score = 50; // Base score

    const contentLower = content.toLowerCase();
    
    // Positive factors
    if (contentLower.includes('how to')) score += 10;
    if (contentLower.includes('free')) score += 8;
    if (contentLower.includes('protect')) score += 7;
    if (contentLower.includes('avoid')) score += 6;
    if (contentLower.includes('?')) score += 5; // Questions engage
    
    // Platform adjustments
    if (platform === 'linkedin' && type === 'blog_post') score += 15;
    if (platform === 'twitter' && content.length < 200) score += 10;
    if (platform === 'facebook' && contentLower.includes('story')) score += 8;

    // Content type adjustments
    if (type === 'case_study') score += 12;
    if (type === 'guide') score += 10;
    if (type === 'video_script') score += 15;

    return Math.min(Math.max(score, 0), 100);
  }

  private async generateHashtags(content: string, platform: string): Promise<string[]> {
    const platformLimits = {
      linkedin: 5,
      twitter: 3,
      instagram: 10,
      facebook: 5
    };

    const limit = platformLimits[platform as keyof typeof platformLimits] || 3;
    
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

    // Topic-specific hashtags based on content
    const topicHashtags: string[] = [];
    const contentLower = content.toLowerCase();
    
    if (contentLower.includes('gdpr')) topicHashtags.push('#GDPR');
    if (contentLower.includes('ccpa')) topicHashtags.push('#CCPA');
    if (contentLower.includes('data breach')) topicHashtags.push('#DataBreach');
    if (contentLower.includes('security')) topicHashtags.push('#CyberSecurity');
    if (contentLower.includes('social media')) topicHashtags.push('#SocialMedia');

    const allHashtags = [...baseHashtags, ...topicHashtags];
    return allHashtags.slice(0, limit);
  }

  private async generateVisualSuggestions(content: string, type: ContentType): Promise<string[]> {
    const suggestions: string[] = [];

    // Type-specific visual suggestions
    switch (type) {
      case 'blog_post':
        suggestions.push(
          'Featured image with legal document and magnifying glass',
          'Infographic showing key statistics',
          'Screenshots of problematic clauses',
          'Step-by-step process diagram'
        );
        break;
      case 'social_media_post':
        suggestions.push(
          'Quote card with key insight',
          'Statistical visualization',
          'Brand logo with key message'
        );
        break;
      case 'video_script':
        suggestions.push(
          'Screen recordings of document analysis',
          'Animated explanations of complex concepts',
          'Split-screen comparisons'
        );
        break;
      case 'infographic_content':
        suggestions.push(
          'Data visualization charts',
          'Process flow diagrams',
          'Comparison tables',
          'Icon-based information hierarchy'
        );
        break;
    }

    return suggestions;
  }

  private async generateCallToAction(type: ContentType, platform?: Platform): Promise<string> {
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

  private getTargetLength(length: string, type: string): number {
    const lengths = contentTemplates[type as keyof typeof contentTemplates];
    if (lengths && 'wordCount' in lengths) {
      return lengths.wordCount[length as keyof typeof lengths.wordCount];
    }
    
    // Default lengths
    const defaults = { short: 500, medium: 1000, long: 2000 };
    return defaults[length as keyof typeof defaults];
  }

  private estimateVideoDuration(script: string): number {
    // Rough estimate: 150 words per minute for video
    const wordCount = this.calculateWordCount(script);
    return Math.ceil(wordCount / 150);
  }

  private extractScenes(script: string): string[] {
    const sceneRegex = /(?:scene|shot|cut to)[\s\d:]+/gi;
    const matches = script.match(sceneRegex) || [];
    return matches.map(match => match.trim());
  }
}