import { BrandVoiceConfig } from '../types';
import { brandVoiceDefaults } from '../config';
import { logger } from '../utils/logger';

export class BrandVoiceManager {
  private brandVoiceConfig: BrandVoiceConfig;

  constructor() {
    this.brandVoiceConfig = this.initializeBrandVoice();
  }

  private initializeBrandVoice(): BrandVoiceConfig {
    return {
      archetype: brandVoiceDefaults.archetype,
      toneAttributes: [...brandVoiceDefaults.toneAttributes],
      vocabulary: {
        preferred: [...brandVoiceDefaults.vocabulary.preferred],
        avoid: [...brandVoiceDefaults.vocabulary.avoid]
      },
      writingStyle: { ...brandVoiceDefaults.writingStyle },
      brandPersonality: { ...brandVoiceDefaults.brandPersonality },
      examples: [
        "Instead of 'Our revolutionary AI leverages cutting-edge technology,' we say 'Our AI helps you understand what you're agreeing to.'",
        "Instead of 'Utilize our solution for maximum ROI,' we say 'Use Fine Print AI to protect your rights.'",
        "Instead of 'We provide comprehensive legal document analysis solutions,' we say 'We analyze legal documents so you don't have to.'"
      ],
      guidelines: [...brandVoiceDefaults.guidelines]
    };
  }

  async getBrandVoice(): Promise<BrandVoiceConfig> {
    return this.brandVoiceConfig;
  }

  async updateBrandVoice(updates: Partial<BrandVoiceConfig>): Promise<BrandVoiceConfig> {
    this.brandVoiceConfig = {
      ...this.brandVoiceConfig,
      ...updates
    };

    logger.info('Brand voice updated', { updates });
    return this.brandVoiceConfig;
  }

  async analyzeToneCompliance(content: string): Promise<{
    score: number;
    issues: string[];
    suggestions: string[];
  }> {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    const contentLower = content.toLowerCase();

    // Check for avoided vocabulary
    for (const avoidWord of this.brandVoiceConfig.vocabulary.avoid) {
      if (contentLower.includes(avoidWord.toLowerCase())) {
        issues.push(`Contains avoided word: "${avoidWord}"`);
        suggestions.push(`Replace "${avoidWord}" with more direct language`);
        score -= 10;
      }
    }

    // Check for jargon without explanation
    const jargonWords = [
      'jurisprudential', 'utilization', 'implementation', 'optimization',
      'leveraging', 'synergistic', 'paradigm', 'framework', 'ecosystem'
    ];
    
    for (const jargon of jargonWords) {
      if (contentLower.includes(jargon.toLowerCase())) {
        issues.push(`Contains unexplained jargon: "${jargon}"`);
        suggestions.push(`Explain or replace technical term "${jargon}"`);
        score -= 5;
      }
    }

    // Check for passive voice (simplified detection)
    const passivePatterns = [
      /is \w+ed/g, /are \w+ed/g, /was \w+ed/g, /were \w+ed/g,
      /has been \w+ed/g, /have been \w+ed/g, /had been \w+ed/g
    ];

    let passiveCount = 0;
    for (const pattern of passivePatterns) {
      const matches = content.match(pattern);
      if (matches) passiveCount += matches.length;
    }

    const sentences = content.split(/[.!?]+/).length;
    const passiveRatio = passiveCount / sentences;

    if (passiveRatio > 0.3) {
      issues.push(`High passive voice usage (${Math.round(passiveRatio * 100)}%)`);
      suggestions.push('Use more active voice to sound more direct and confident');
      score -= 15;
    }

    // Check for preferred vocabulary usage
    let preferredCount = 0;
    for (const preferredWord of this.brandVoiceConfig.vocabulary.preferred) {
      if (contentLower.includes(preferredWord.toLowerCase())) {
        preferredCount++;
      }
    }

    if (preferredCount === 0) {
      suggestions.push('Consider including brand-preferred vocabulary terms');
      score -= 5;
    }

    // Check sentence length variety
    const sentences_array = content.split(/[.!?]+/).filter(s => s.trim());
    const avgSentenceLength = sentences_array.reduce((acc, s) => acc + s.split(' ').length, 0) / sentences_array.length;

    if (avgSentenceLength > 25) {
      issues.push('Sentences are too long on average');
      suggestions.push('Break up long sentences for better readability');
      score -= 10;
    }

    // Check for direct address (using "you")
    if (!contentLower.includes('you')) {
      issues.push('Content lacks direct address to reader');
      suggestions.push('Use "you" to address readers directly');
      score -= 10;
    }

    // Check for questions (engagement)
    if (!content.includes('?')) {
      suggestions.push('Consider adding questions to increase engagement');
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      issues,
      suggestions
    };
  }

  async generateBrandVoicePrompt(): Promise<string> {
    const config = this.brandVoiceConfig;
    
    return `Brand Voice Guidelines for Fine Print AI:

ARCHETYPE: ${config.archetype} - We are protectors and educators, helping users understand and navigate legal documents.

PERSONALITY TRAITS:
${Object.entries(config.brandPersonality)
  .map(([trait, score]) => `- ${trait}: ${score}/10`)
  .join('\n')}

TONE ATTRIBUTES: ${config.toneAttributes.join(', ')}

WRITING STYLE:
- Sentence Length: ${config.writingStyle.sentenceLength}
- Paragraph Length: ${config.writingStyle.paragraphLength}  
- Formality Level: ${config.writingStyle.formalityLevel}/10
- Technical Level: ${config.writingStyle.technicalLevel}/10

VOCABULARY:
Preferred Words: ${config.vocabulary.preferred.join(', ')}
Words to Avoid: ${config.vocabulary.avoid.join(', ')}

KEY GUIDELINES:
${config.guidelines.map(g => `- ${g}`).join('\n')}

EXAMPLES OF OUR VOICE:
${config.examples.map(e => `- ${e}`).join('\n')}

Remember: We empower users with clarity, protect them from hidden dangers, and maintain professional authority while being approachable and human.`;
  }

  async adaptForPlatform(platform: string): Promise<Partial<BrandVoiceConfig>> {
    const baseConfig = this.brandVoiceConfig;
    
    switch (platform.toLowerCase()) {
      case 'linkedin':
        return {
          ...baseConfig,
          writingStyle: {
            ...baseConfig.writingStyle,
            formalityLevel: Math.min(baseConfig.writingStyle.formalityLevel + 1, 10),
            technicalLevel: Math.min(baseConfig.writingStyle.technicalLevel + 1, 10)
          },
          toneAttributes: [...baseConfig.toneAttributes, 'professional', 'thought-leadership']
        };
        
      case 'twitter':
        return {
          ...baseConfig,
          writingStyle: {
            ...baseConfig.writingStyle,
            sentenceLength: 'short',
            formalityLevel: Math.max(baseConfig.writingStyle.formalityLevel - 2, 1)
          },
          toneAttributes: [...baseConfig.toneAttributes, 'concise', 'impactful']
        };
        
      case 'facebook':
        return {
          ...baseConfig,
          writingStyle: {
            ...baseConfig.writingStyle,
            formalityLevel: Math.max(baseConfig.writingStyle.formalityLevel - 1, 1)
          },
          toneAttributes: [...baseConfig.toneAttributes, 'conversational', 'community-focused']
        };
        
      case 'email':
        return {
          ...baseConfig,
          writingStyle: {
            ...baseConfig.writingStyle,
            paragraphLength: 'short'
          },
          toneAttributes: [...baseConfig.toneAttributes, 'personal', 'direct']
        };
        
      default:
        return baseConfig;
    }
  }

  async validateContent(content: string, contentType: string): Promise<{
    isValid: boolean;
    score: number;
    feedback: string[];
  }> {
    const toneAnalysis = await this.analyzeToneCompliance(content);
    const feedback: string[] = [];
    
    // Content type specific validations
    switch (contentType) {
      case 'blog_post':
        if (!content.includes('#') && !content.includes('##')) {
          feedback.push('Blog post should include headings for better structure');
        }
        if (content.length < 800) {
          feedback.push('Blog post might be too short for good SEO performance');
        }
        break;
        
      case 'social_media_post':
        if (content.length > 2000) {
          feedback.push('Social media post might be too long for optimal engagement');
        }
        if (!content.includes('?') && !content.includes('!')) {
          feedback.push('Social media posts benefit from questions or exclamations');
        }
        break;
        
      case 'email_campaign':
        if (!content.toLowerCase().includes('subject:')) {
          feedback.push('Email campaign should include a subject line');
        }
        if (!content.toLowerCase().includes('call') && !content.toLowerCase().includes('click')) {
          feedback.push('Email campaign should include a clear call to action');
        }
        break;
    }

    // Combine tone analysis feedback
    feedback.push(...toneAnalysis.issues);
    feedback.push(...toneAnalysis.suggestions);

    return {
      isValid: toneAnalysis.score >= 70 && feedback.filter(f => f.includes('should')).length === 0,
      score: toneAnalysis.score,
      feedback
    };
  }

  async generateContentGuidelines(contentType: string, platform?: string): Promise<string[]> {
    const baseGuidelines = [
      'Use clear, direct language that empowers users',
      'Focus on user benefits and protection',
      'Include specific, actionable advice',
      'Maintain professional but approachable tone',
      'Explain technical concepts in plain English'
    ];

    const typeSpecificGuidelines: Record<string, string[]> = {
      blog_post: [
        'Start with a compelling headline',
        'Use subheadings to break up content',
        'Include practical examples and case studies',
        'End with a clear call to action',
        'Optimize for SEO with relevant keywords'
      ],
      social_media_post: [
        'Hook readers in the first line',
        'Use emojis sparingly and purposefully',
        'Include relevant hashtags',
        'Encourage engagement with questions',
        'Keep paragraphs short for mobile reading'
      ],
      email_campaign: [
        'Write compelling subject lines under 50 characters',
        'Personalize the greeting when possible',
        'Focus on one primary call to action',
        'Use short paragraphs and bullet points',
        'Include unsubscribe information'
      ],
      video_script: [
        'Write conversationally for spoken delivery',
        'Include visual cues and scene directions',
        'Keep segments focused and concise',
        'End segments with clear transitions',
        'Consider pacing for viewer retention'
      ]
    };

    const platformGuidelines: Record<string, string[]> = {
      linkedin: [
        'Maintain professional tone',
        'Share industry insights and thought leadership',
        'Use relevant professional hashtags',
        'Engage with business community'
      ],
      twitter: [
        'Be concise and punchy',
        'Use threads for longer content',
        'Engage in conversations',
        'Share timely, relevant content'
      ],
      facebook: [
        'Use storytelling approaches',
        'Encourage community discussion',
        'Share relatable experiences',
        'Use visual content when possible'
      ]
    };

    let guidelines = [...baseGuidelines];
    
    if (typeSpecificGuidelines[contentType]) {
      guidelines.push(...typeSpecificGuidelines[contentType]);
    }
    
    if (platform && platformGuidelines[platform]) {
      guidelines.push(...platformGuidelines[platform]);
    }

    return guidelines;
  }
}