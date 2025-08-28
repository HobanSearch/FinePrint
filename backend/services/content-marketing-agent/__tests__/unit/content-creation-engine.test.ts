import { ContentCreationEngine } from '../../src/services/content-creation-engine';
import { ContentType, Platform } from '../../src/types';

// Mock dependencies
jest.mock('openai');
jest.mock('ollama');
jest.mock('../../src/services/brand-voice-manager');
jest.mock('../../src/services/seo-optimizer');

describe('ContentCreationEngine', () => {
  let engine: ContentCreationEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new ContentCreationEngine();
  });

  describe('createContent', () => {
    it('should create a blog post successfully', async () => {
      const request = {
        type: 'blog_post' as ContentType,
        topic: 'Privacy Policy Analysis',
        targetAudience: 'Privacy-conscious users',
        keywords: ['privacy policy', 'data protection'],
        tone: 'professional' as const,
        seoOptimized: true,
        includeCallToAction: true
      };

      const result = await engine.createContent(request);

      expect(result).toBeDefined();
      expect(result.type).toBe('blog_post');
      expect(result.title).toContain('Privacy Policy');
      expect(result.content).toBeDefined();
      expect(result.seoScore).toBeGreaterThan(0);
      expect(result.engagementPrediction).toBeGreaterThan(0);
      expect(result.callToAction).toBeDefined();
    });

    it('should create social media post with platform adaptation', async () => {
      const request = {
        type: 'social_media_post' as ContentType,
        topic: 'GDPR Compliance',
        targetAudience: 'Business owners',
        platform: 'linkedin' as Platform,
        includeCallToAction: true
      };

      const result = await engine.createContent(request);

      expect(result).toBeDefined();
      expect(result.type).toBe('social_media_post');
      expect(result.platform).toBe('linkedin');
      expect(result.hashtags).toBeDefined();
      expect(result.hashtags!.length).toBeLessThanOrEqual(5); // LinkedIn limit
    });

    it('should validate required fields', async () => {
      const invalidRequest = {
        type: 'blog_post' as ContentType,
        topic: '', // Empty topic should fail
        targetAudience: 'Users'
      };

      await expect(engine.createContent(invalidRequest)).rejects.toThrow('Topic is required');
    });

    it('should generate appropriate tags based on content', async () => {
      const request = {
        type: 'blog_post' as ContentType,
        topic: 'GDPR Data Protection Rights',
        targetAudience: 'EU citizens'
      };

      const result = await engine.createContent(request);

      expect(result.tags).toBeDefined();
      expect(result.tags.length).toBeGreaterThan(0);
      expect(result.tags).toContain('legal-tech');
    });

    it('should calculate reading time correctly', async () => {
      const request = {
        type: 'blog_post' as ContentType,
        topic: 'Long form content analysis',
        targetAudience: 'Researchers',
        length: 'long' as const
      };

      const result = await engine.createContent(request);

      expect(result.readingTime).toBeGreaterThan(0);
      expect(result.wordCount).toBeGreaterThan(0);
      // Rough check: 200 words per minute reading speed
      expect(result.readingTime).toBe(Math.ceil(result.wordCount / 200));
    });

    it('should handle email campaign content differently', async () => {
      const request = {
        type: 'email_campaign' as ContentType,
        topic: 'Weekly Privacy Update',
        targetAudience: 'Subscribers'
      };

      const result = await engine.createContent(request);

      expect(result.type).toBe('email_campaign');
      expect(result.title.length).toBeLessThanOrEqual(50); // Email subject line limit
    });

    it('should generate visual suggestions when requested', async () => {
      const request = {
        type: 'blog_post' as ContentType,
        topic: 'Data Breach Prevention',
        targetAudience: 'IT professionals',
        includeVisuals: true
      };

      const result = await engine.createContent(request);

      expect(result.visualSuggestions).toBeDefined();
      expect(result.visualSuggestions!.length).toBeGreaterThan(0);
    });

    it('should respect platform character limits', async () => {
      const twitterRequest = {
        type: 'social_media_post' as ContentType,
        topic: 'Quick privacy tip',
        targetAudience: 'General public',
        platform: 'twitter' as Platform
      };

      const result = await engine.createContent(twitterRequest);

      // Twitter content should be short enough for the platform
      expect(result.content.length).toBeLessThanOrEqual(280);
    });
  });

  describe('error handling', () => {
    it('should handle OpenAI API errors gracefully', async () => {
      // Mock OpenAI to throw an error
      const mockOpenAI = require('openai');
      mockOpenAI.prototype.chat = {
        completions: {
          create: jest.fn().mockRejectedValue(new Error('API Error'))
        }
      };

      const request = {
        type: 'blog_post' as ContentType,
        topic: 'Test topic',
        targetAudience: 'Test audience'
      };

      await expect(engine.createContent(request)).rejects.toThrow();
    });

    it('should validate target audience', async () => {
      const request = {
        type: 'blog_post' as ContentType,
        topic: 'Test topic',
        targetAudience: '' // Empty audience should fail
      };

      await expect(engine.createContent(request)).rejects.toThrow('Target audience is required');
    });
  });

  describe('brand voice integration', () => {
    it('should apply brand voice guidelines', async () => {
      const request = {
        type: 'blog_post' as ContentType,
        topic: 'User Rights Protection',
        targetAudience: 'Privacy advocates',
        brandVoiceLevel: 9
      };

      const result = await engine.createContent(request);

      // Content should reflect Fine Print AI brand voice
      expect(result.content.toLowerCase()).toMatch(/protect|understand|rights|transparency/);
    });
  });

  describe('SEO optimization', () => {
    it('should optimize content for SEO when requested', async () => {
      const request = {
        type: 'blog_post' as ContentType,
        topic: 'Legal Document Analysis',
        targetAudience: 'Business owners',
        keywords: ['legal analysis', 'document review'],
        seoOptimized: true
      };

      const result = await engine.createContent(request);

      expect(result.seoScore).toBeGreaterThan(50);
      expect(result.keywords).toEqual(['legal analysis', 'document review']);
    });
  });
});