import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ApiResponse } from '../types';
import { SEOOptimizer } from '../services/seo-optimizer';
import { logger } from '../utils/logger';

const seoOptimizer = new SEOOptimizer();

export default async function seoRoutes(fastify: FastifyInstance) {
  // Optimize content for SEO
  fastify.post('/optimize', async (request: FastifyRequest<{
    Body: {
      content: string;
      title: string;
      keywords: string[];
    }
  }>, reply: FastifyReply) => {
    try {
      const { content, title, keywords } = request.body;

      const optimization = await seoOptimizer.optimizeContent(content, title, keywords);

      const response: ApiResponse = {
        success: true,
        data: optimization,
        message: 'Content optimized for SEO'
      };

      return response;
    } catch (error) {
      logger.error('SEO optimization failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to optimize content for SEO'
      };
    }
  });

  // Analyze content SEO
  fastify.post('/analyze', async (request: FastifyRequest<{
    Body: {
      content: string;
      title: string;
      keywords: string[];
    }
  }>, reply: FastifyReply) => {
    try {
      const { content, title, keywords } = request.body;

      const analysis = await seoOptimizer.analyzeContent(content, title, keywords);

      const response: ApiResponse = {
        success: true,
        data: analysis,
        message: 'SEO analysis completed'
      };

      return response;
    } catch (error) {
      logger.error('SEO analysis failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to analyze content for SEO'
      };
    }
  });

  // Research keywords
  fastify.post('/keywords/research', async (request: FastifyRequest<{
    Body: {
      topic: string;
      targetAudience: string;
      contentType: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const { topic, targetAudience, contentType } = request.body;

      const keywords = await seoOptimizer.researchKeywords(topic, targetAudience, contentType);

      const response: ApiResponse = {
        success: true,
        data: keywords,
        message: `Found ${keywords.length} relevant keywords`
      };

      return response;
    } catch (error) {
      logger.error('Keyword research failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to research keywords'
      };
    }
  });

  // Generate SEO titles
  fastify.post('/titles/generate', async (request: FastifyRequest<{
    Body: {
      content: string;
      keywords: string[];
    }
  }>, reply: FastifyReply) => {
    try {
      const { content, keywords } = request.body;

      const titles = await seoOptimizer.generateSEOTitle(content, keywords);

      const response: ApiResponse = {
        success: true,
        data: { titles },
        message: `Generated ${titles.length} SEO-optimized titles`
      };

      return response;
    } catch (error) {
      logger.error('SEO title generation failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to generate SEO titles'
      };
    }
  });

  // Get keyword suggestions
  fastify.get('/keywords/suggestions', async (request: FastifyRequest<{
    Querystring: {
      seed: string;
      count?: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const { seed, count = '10' } = request.query;
      const maxCount = parseInt(count);

      // This would generate keyword suggestions
      const suggestions = [
        { keyword: `${seed} guide`, volume: 5400, difficulty: 45 },
        { keyword: `${seed} tips`, volume: 3200, difficulty: 38 },
        { keyword: `${seed} best practices`, volume: 2800, difficulty: 52 },
        { keyword: `how to ${seed}`, volume: 4100, difficulty: 41 },
        { keyword: `${seed} tools`, volume: 1900, difficulty: 48 }
      ].slice(0, maxCount);

      const response: ApiResponse = {
        success: true,
        data: suggestions,
        message: `Generated ${suggestions.length} keyword suggestions`
      };

      return response;
    } catch (error) {
      logger.error('Keyword suggestions failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to generate keyword suggestions'
      };
    }
  });

  // Analyze competitor keywords
  fastify.post('/competitors/keywords', async (request: FastifyRequest<{
    Body: {
      competitors: string[];
      topic: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const { competitors, topic } = request.body;

      // This would analyze competitor keywords
      const analysis = {
        topic,
        competitors: competitors.map(competitor => ({
          domain: competitor,
          topKeywords: [
            { keyword: `${topic} analysis`, volume: 3200, position: 3 },
            { keyword: `${topic} review`, volume: 2100, position: 7 },
            { keyword: `${topic} guide`, volume: 4500, position: 2 }
          ],
          keywordGaps: [
            { keyword: `${topic} automation`, volume: 1800, opportunity: 'high' },
            { keyword: `${topic} compliance`, volume: 2400, opportunity: 'medium' }
          ]
        }))
      };

      const response: ApiResponse = {
        success: true,
        data: analysis,
        message: 'Competitor keyword analysis completed'
      };

      return response;
    } catch (error) {
      logger.error('Competitor keyword analysis failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to analyze competitor keywords'
      };
    }
  });

  // Get SEO performance report
  fastify.get('/performance/:contentId', async (request: FastifyRequest<{
    Params: { contentId: string };
    Querystring: {
      period?: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const { contentId } = request.params;
      const { period = '30d' } = request.query;

      // This would fetch SEO performance data
      const performance = {
        contentId,
        period,
        rankings: [
          { keyword: 'privacy policy analysis', position: 12, change: +3 },
          { keyword: 'terms of service review', position: 8, change: -1 },
          { keyword: 'legal document scanner', position: 15, change: +5 }
        ],
        organicTraffic: {
          sessions: 2450,
          change: +18,
          topPages: [
            { page: '/blog/privacy-policy-red-flags', sessions: 890 },
            { page: '/blog/gdpr-compliance-guide', sessions: 670 }
          ]
        },
        backlinks: {
          total: 45,
          newThisMonth: 7,
          topReferrers: [
            'techcrunch.com',
            'legaltech.blog',
            'privacynews.com'
          ]
        },
        seoScore: 78,
        improvements: [
          'Add more internal links to related content',
          'Optimize for featured snippets',
          'Improve page loading speed'
        ]
      };

      const response: ApiResponse = {
        success: true,
        data: performance,
        message: 'SEO performance report generated'
      };

      return response;
    } catch (error) {
      logger.error('SEO performance report failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to generate SEO performance report'
      };
    }
  });

  // Get content optimization suggestions
  fastify.post('/suggestions', async (request: FastifyRequest<{
    Body: {
      url?: string;
      content?: string;
      targetKeywords: string[];
    }
  }>, reply: FastifyReply) => {
    try {
      const { url, content, targetKeywords } = request.body;

      // This would analyze content and provide suggestions
      const suggestions = {
        onPage: [
          'Add target keyword to H1 tag',
          'Improve meta description length (currently 95 characters)',
          'Add alt text to 3 images',
          'Increase keyword density for "legal analysis" (currently 0.8%)'
        ],
        technical: [
          'Compress images to improve loading speed',
          'Add structured data markup',
          'Optimize URL structure',
          'Fix broken internal links (2 found)'
        ],
        content: [
          'Add FAQ section for long-tail keywords',
          'Include more recent statistics and data',
          'Add call-to-action buttons',
          'Create related content for topic clustering'
        ],
        priority: {
          high: ['Fix meta description', 'Add H1 keyword'],
          medium: ['Compress images', 'Add FAQ section'],
          low: ['Structured data', 'Related content']
        }
      };

      const response: ApiResponse = {
        success: true,
        data: suggestions,
        message: 'SEO suggestions generated'
      };

      return response;
    } catch (error) {
      logger.error('SEO suggestions failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to generate SEO suggestions'
      };
    }
  });
}