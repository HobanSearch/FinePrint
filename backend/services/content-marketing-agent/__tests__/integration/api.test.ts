import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/index';

describe('API Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Endpoints', () => {
    it('should return health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.service).toBe('content-marketing-agent');
    });

    it('should return detailed health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/detailed'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBeDefined();
      expect(body.checks).toBeDefined();
    });

    it('should return readiness status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ready');
    });
  });

  describe('Content API', () => {
    it('should create content successfully', async () => {
      const contentRequest = {
        type: 'blog_post',
        topic: 'Privacy Policy Red Flags',
        targetAudience: 'Privacy-conscious users',
        keywords: ['privacy policy', 'data protection'],
        seoOptimized: true,
        includeCallToAction: true
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/content/create',
        payload: contentRequest
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.type).toBe('blog_post');
      expect(body.data.title).toBeDefined();
      expect(body.data.content).toBeDefined();
    });

    it('should validate required fields', async () => {
      const invalidRequest = {
        type: 'blog_post',
        topic: '', // Missing topic
        targetAudience: 'Users'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/content/create',
        payload: invalidRequest
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Topic is required');
    });

    it('should list content with pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/content?page=1&limit=10'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.pagination).toBeDefined();
    });

    it('should validate content against brand voice', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/content/test-content-id/validate'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.isValid).toBeDefined();
      expect(body.data.score).toBeDefined();
    });
  });

  describe('Campaign API', () => {
    it('should create autonomous campaign', async () => {
      const campaignRequest = {
        topic: 'GDPR Compliance',
        targetAudience: 'Small business owners',
        goals: { leads: 100, awareness: 50000 },
        platforms: ['linkedin', 'twitter'],
        duration: 30
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/campaigns/autonomous',
        payload: campaignRequest
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.name).toBeDefined();
      expect(body.data.type).toBeDefined();
    });

    it('should list campaigns', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/campaigns'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toBeInstanceOf(Array);
    });

    it('should optimize campaign', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/campaigns/test-campaign-id/optimize'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.optimizations).toBeDefined();
      expect(body.data.projectedImprovement).toBeDefined();
    });
  });

  describe('Analytics API', () => {
    it('should track content performance', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/content/test-content-id/performance?platforms=linkedin,twitter'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toBeInstanceOf(Array);
    });

    it('should analyze campaign ROI', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/campaigns/test-campaign-id/roi'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.roi).toBeDefined();
      expect(body.data.totalRevenue).toBeDefined();
    });

    it('should get dashboard data', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/dashboard'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.overview).toBeDefined();
      expect(body.data.platformPerformance).toBeDefined();
    });
  });

  describe('Lead Generation API', () => {
    it('should generate leads from content', async () => {
      const leadsRequest = {
        contentIds: ['content_1', 'content_2'],
        leadMagnets: ['gdpr-guide', 'privacy-checklist'],
        targetAudience: 'Business owners'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/leads/generate',
        payload: leadsRequest
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.data.length).toBeGreaterThan(0);
    });

    it('should create lead magnet', async () => {
      const magnetRequest = {
        title: 'GDPR Compliance Checklist',
        type: 'checklist',
        targetAudience: 'EU businesses',
        topic: 'GDPR compliance'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/leads/magnets',
        payload: magnetRequest
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.title).toBe(magnetRequest.title);
      expect(body.data.type).toBe(magnetRequest.type);
    });
  });

  describe('SEO API', () => {
    it('should optimize content for SEO', async () => {
      const seoRequest = {
        content: 'Privacy policies are important legal documents...',
        title: 'Understanding Privacy Policies',
        keywords: ['privacy policy', 'data protection', 'user rights']
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/seo/optimize',
        payload: seoRequest
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.optimizedContent).toBeDefined();
      expect(body.data.score).toBeDefined();
    });

    it('should research keywords', async () => {
      const keywordRequest = {
        topic: 'legal document analysis',
        targetAudience: 'business owners',
        contentType: 'blog_post'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/seo/keywords/research',
        payload: keywordRequest
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toBeInstanceOf(Array);
    });
  });

  describe('Distribution API', () => {
    it('should publish content to platforms', async () => {
      const publishRequest = {
        contentId: 'test-content-id',
        platforms: ['linkedin', 'twitter'],
        testMode: true
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/distribution/publish',
        payload: publishRequest
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.data.length).toBe(2); // Two platforms
    });

    it('should schedule content', async () => {
      const scheduleRequest = {
        contentId: 'test-content-id',
        platforms: ['linkedin'],
        scheduleTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/distribution/schedule',
        payload: scheduleRequest
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toBeInstanceOf(Array);
    });

    it('should get platform capabilities', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/distribution/platforms'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.data.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 errors', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/nonexistent-endpoint'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Endpoint not found');
    });

    it('should handle validation errors', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/content/create',
        payload: {
          invalidField: 'value'
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      // Make multiple requests quickly to trigger rate limiting
      const requests = Array(110).fill(null).map(() => 
        app.inject({
          method: 'GET',
          url: '/health'
        })
      );

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.statusCode === 429);
      
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });
});