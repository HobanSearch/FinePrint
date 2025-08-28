/**
 * Marketing Agent Controller
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { 
  MarketingGenerateRequest, 
  MarketingContentResponse, 
  ContentVariation,
  AgentType,
  ContentType 
} from '../types';
import { ollamaService } from '../services/ollama.service';
import { cacheService } from '../services/cache.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('marketing-controller');

export class MarketingController {
  async generateContent(
    request: FastifyRequest<{ Body: MarketingGenerateRequest }>,
    reply: FastifyReply
  ): Promise<void> {
    const startTime = Date.now();
    const { body } = request;

    try {
      // Check cache first
      const cached = await cacheService.get<MarketingContentResponse>(
        AgentType.MARKETING,
        'generate',
        body
      );

      if (cached) {
        logger.info('Returning cached marketing content');
        return reply.send(cached);
      }

      // Generate content variations
      const variations: ContentVariation[] = [];
      
      for (let i = 0; i < body.variations; i++) {
        const variation = await this.generateVariation(body, i);
        variations.push(variation);
      }

      // Create response
      const response: MarketingContentResponse = {
        id: uuidv4(),
        type: body.type,
        variations,
        metadata: {
          generatedAt: new Date(),
          model: 'fine-print-marketing',
          version: '1.0.0',
          tokensUsed: variations.reduce((sum, v) => sum + (v.content.length / 4), 0),
          processingTime: Date.now() - startTime
        }
      };

      // Handle A/B testing if enabled
      if (body.enableABTest) {
        response.abTestId = await this.createABTest(response);
      }

      // Cache the response
      await cacheService.set(
        AgentType.MARKETING,
        'generate',
        body,
        response,
        3600 // 1 hour TTL
      );

      logger.info({
        contentType: body.type,
        variations: body.variations,
        processingTime: response.metadata.processingTime,
        msg: 'Marketing content generated successfully'
      });

      reply.send(response);
    } catch (error) {
      logger.error('Failed to generate marketing content:', error);
      reply.code(500).send({
        error: 'GENERATION_FAILED',
        message: 'Failed to generate marketing content',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async generateVariation(
    request: MarketingGenerateRequest,
    index: number
  ): Promise<ContentVariation> {
    const systemPrompt = this.buildSystemPrompt(request);
    const userPrompt = this.buildUserPrompt(request, index);

    const content = await ollamaService.generate(
      AgentType.MARKETING,
      userPrompt,
      systemPrompt,
      {
        temperature: 0.7 + (index * 0.1), // Vary temperature for diversity
        maxTokens: request.maxLength || 2000
      }
    );

    // Parse and structure the content
    const structured = this.parseGeneratedContent(content, request.type);

    // Calculate scores
    const scores = await this.calculateScores(structured, request);

    return {
      id: uuidv4(),
      content: structured.content,
      subject: structured.subject,
      headline: structured.headline,
      callToAction: structured.callToAction,
      keywords: request.keywords || [],
      score: scores,
      testGroup: index === 0 ? 'A' : index === 1 ? 'B' : 'C'
    };
  }

  private buildSystemPrompt(request: MarketingGenerateRequest): string {
    const toneMap = {
      professional: 'professional and authoritative',
      casual: 'casual and conversational',
      friendly: 'warm and friendly',
      urgent: 'urgent and action-oriented',
      informative: 'informative and educational'
    };

    return `You are an expert marketing content creator for Fine Print AI, a privacy-focused legal document analysis platform.

Your task is to create ${request.type} content that:
1. Targets: ${request.targetAudience || 'privacy-conscious users and businesses'}
2. Tone: ${toneMap[request.tone || 'professional']}
3. Highlights our key differentiators: Local AI processing, no data retention, comprehensive pattern detection
4. Includes relevant keywords naturally
5. Drives action and engagement

Context:
${request.context?.companyInfo || 'Fine Print AI helps users understand legal documents using local AI models.'}
${request.context?.productFeatures ? `Features: ${request.context.productFeatures.join(', ')}` : ''}
${request.context?.campaign ? `Campaign: ${request.context.campaign}` : ''}

Always ensure the content is clear, compelling, and aligned with our privacy-first values.`;
  }

  private buildUserPrompt(request: MarketingGenerateRequest, variation: number): string {
    const variationInstruction = variation > 0 
      ? `Create a different variation (${variation + 1}) with a unique angle.` 
      : '';

    switch (request.type) {
      case ContentType.EMAIL:
        return `Create a marketing email with:
- Compelling subject line
- Engaging opening
- Clear value proposition
- Strong call to action
- Professional signature
Keywords to include: ${request.keywords?.join(', ') || 'none specified'}
Max length: ${request.maxLength || 500} words
${variationInstruction}`;

      case ContentType.BLOG:
        return `Write a blog post with:
- Attention-grabbing headline
- Engaging introduction
- Informative body with subheadings
- Clear conclusion with CTA
Keywords to include: ${request.keywords?.join(', ') || 'none specified'}
Max length: ${request.maxLength || 1000} words
${variationInstruction}`;

      case ContentType.SOCIAL:
        return `Create social media content with:
- Hook/attention grabber
- Concise value message
- Relevant hashtags
- Call to action
Platform-appropriate length (Twitter: 280 chars, LinkedIn: 1300 chars, Facebook: 500 chars)
${variationInstruction}`;

      case ContentType.LANDING_PAGE:
        return `Create landing page copy with:
- Powerful headline
- Compelling subheadline
- Benefits section
- Features list
- Social proof elements
- Strong CTA buttons
${variationInstruction}`;

      case ContentType.AD_COPY:
        return `Create ad copy with:
- Attention-grabbing headline
- Compelling description
- Clear value proposition
- Strong call to action
- Display URL
Keep it concise and impactful
${variationInstruction}`;

      case ContentType.NEWSLETTER:
        return `Create newsletter content with:
- Engaging subject line
- Personal greeting
- Main story/update
- Additional sections/tips
- Call to action
- Footer with unsubscribe
${variationInstruction}`;

      default:
        return `Create ${request.type} marketing content based on the prompt: ${request.prompt}. ${variationInstruction}`;
    }
  }

  private parseGeneratedContent(
    content: string,
    type: ContentType
  ): {
    content: string;
    subject?: string;
    headline?: string;
    callToAction?: string;
  } {
    // Simple parsing logic - in production, use more sophisticated parsing
    const lines = content.split('\n').filter(line => line.trim());
    
    let subject: string | undefined;
    let headline: string | undefined;
    let callToAction: string | undefined;
    let mainContent = content;

    // Extract structured elements based on content type
    if (type === ContentType.EMAIL || type === ContentType.NEWSLETTER) {
      // Look for subject line
      const subjectMatch = content.match(/Subject:\s*(.+)/i);
      if (subjectMatch) {
        subject = subjectMatch[1].trim();
        mainContent = mainContent.replace(subjectMatch[0], '').trim();
      }
    }

    if (type === ContentType.BLOG || type === ContentType.LANDING_PAGE) {
      // First non-empty line is likely the headline
      if (lines.length > 0) {
        headline = lines[0].replace(/^#+\s*/, '').trim();
      }
    }

    // Look for CTA
    const ctaMatch = content.match(/CTA:\s*(.+)/i) || 
                     content.match(/Call to Action:\s*(.+)/i);
    if (ctaMatch) {
      callToAction = ctaMatch[1].trim();
      mainContent = mainContent.replace(ctaMatch[0], '').trim();
    }

    return {
      content: mainContent,
      subject,
      headline,
      callToAction
    };
  }

  private async calculateScores(
    content: any,
    request: MarketingGenerateRequest
  ): Promise<{
    readability: number;
    seoScore?: number;
    engagement?: number;
  }> {
    // Simple scoring logic - in production, use more sophisticated algorithms
    const text = content.content;
    const wordCount = text.split(/\s+/).length;
    const sentenceCount = text.split(/[.!?]+/).length;
    const avgWordsPerSentence = wordCount / sentenceCount;

    // Readability score (simplified Flesch Reading Ease)
    const readability = Math.min(100, Math.max(0, 
      206.835 - 1.015 * avgWordsPerSentence - 84.6 * (text.length / wordCount)
    ));

    // SEO score (if keywords provided)
    let seoScore: number | undefined;
    if (request.keywords && request.keywords.length > 0) {
      const keywordMatches = request.keywords.filter(keyword => 
        text.toLowerCase().includes(keyword.toLowerCase())
      ).length;
      seoScore = (keywordMatches / request.keywords.length) * 100;
    }

    // Engagement score (based on CTA presence and content structure)
    const engagement = content.callToAction ? 80 : 60;

    return {
      readability: Math.round(readability),
      seoScore: seoScore ? Math.round(seoScore) : undefined,
      engagement
    };
  }

  private async createABTest(response: MarketingContentResponse): Promise<string> {
    // In production, integrate with A/B testing service
    const abTestId = uuidv4();
    
    logger.info({
      abTestId,
      variations: response.variations.length,
      msg: 'A/B test created for marketing content'
    });

    return abTestId;
  }
}

export const marketingController = new MarketingController();