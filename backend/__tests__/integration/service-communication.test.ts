/**
 * Integration tests for microservice communication
 * Tests the interaction between different services in the Fine Print AI backend
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import supertest from 'supertest';
import { createMockUser, createMockDocument, createMockAnalysis } from '../mocks/factories';
import { resetAllMocks, setupMockDefaults } from '../mocks/utils/mock-utils';

// Integration test setup
let testServer: any;
let request: supertest.SuperTest<supertest.Test>;
let authToken: string;
let testUser: any;

// Mock external services for integration tests
const mockServices = {
  ollama: {
    isHealthy: true,
    generateResponse: jest.fn(),
  },
  stripe: {
    isHealthy: true,
    customers: new Map(),
    subscriptions: new Map(),
  },
  redis: {
    isHealthy: true,
    data: new Map(),
  },
  database: {
    isHealthy: true,
    connected: true,
  },
};

// Test server configuration
const createTestServer = async () => {
  // This would typically import and configure your actual server
  // For this example, we'll mock the server responses
  const mockApp = {
    listen: jest.fn(),
    close: jest.fn(),
    // Add mock routes that simulate real service interactions
  };
  
  return {
    server: mockApp,
    request: supertest(mockApp as any),
  };
};

describe('Microservice Integration Tests', () => {
  beforeAll(async () => {
    setupMockDefaults();
    
    // Start test server
    const testApp = await createTestServer();
    testServer = testApp.server;
    request = testApp.request;
    
    // Create test user and get auth token
    testUser = createMockUser();
    authToken = 'Bearer test-jwt-token';
  });

  afterAll(async () => {
    if (testServer && testServer.close) {
      await testServer.close();
    }
  });

  beforeEach(() => {
    resetAllMocks();
    // Reset mock service states
    Object.values(mockServices).forEach(service => {
      if (service.data && service.data.clear) {
        service.data.clear();
      }
    });
  });

  afterEach(() => {
    resetAllMocks();
  });

  describe('Analysis Service Integration', () => {
    test('should handle complete document analysis workflow', async () => {
      const mockDocument = createMockDocument({
        userId: testUser.id,
        type: 'terms-of-service',
      });

      // Step 1: Upload document
      const uploadResponse = await request
        .post('/api/documents')
        .set('Authorization', authToken)
        .send({
          title: mockDocument.title,
          type: mockDocument.type,
          content: mockDocument.content,
        });

      expect(uploadResponse.status).toBe(200);
      expect(uploadResponse.body).toHaveProperty('id');
      const documentId = uploadResponse.body.id;

      // Step 2: Start analysis
      const analysisResponse = await request
        .post('/api/analysis')
        .set('Authorization', authToken)
        .send({
          documentId,
          options: {
            modelVersion: 'phi:2.7b',
            priority: 'high',
          },
        });

      expect(analysisResponse.status).toBe(200);
      expect(analysisResponse.body).toHaveProperty('id');
      expect(analysisResponse.body.status).toBe('pending');
      const analysisId = analysisResponse.body.id;

      // Step 3: Poll for completion (simulate async processing)
      let analysisComplete = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!analysisComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const statusResponse = await request
          .get(`/api/analysis/${analysisId}`)
          .set('Authorization', authToken);

        expect(statusResponse.status).toBe(200);
        
        if (statusResponse.body.status === 'completed') {
          analysisComplete = true;
          
          // Verify analysis results
          expect(statusResponse.body).toHaveValidAnalysisStructure();
          expect(statusResponse.body.findings).toBeDefined();
          expect(statusResponse.body.overallRiskScore).toHaveValidRiskScore();
          expect(statusResponse.body.executiveSummary).toBeDefined();
        }
        
        attempts++;
      }

      expect(analysisComplete).toBe(true);

      // Step 4: Verify notifications were sent
      const notificationsResponse = await request
        .get('/api/notifications')
        .set('Authorization', authToken);

      expect(notificationsResponse.status).toBe(200);
      expect(notificationsResponse.body.notifications).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'analysis_complete',
            title: expect.stringContaining('Analysis Complete'),
          }),
        ])
      );

      // Step 5: Verify usage tracking
      const usageResponse = await request
        .get('/api/billing/usage')
        .set('Authorization', authToken);

      expect(usageResponse.status).toBe(200);
      expect(usageResponse.body.breakdown.document_analysis).toBeGreaterThan(0);
    });

    test('should handle analysis failure and retry', async () => {
      const mockDocument = createMockDocument({ userId: testUser.id });

      // Upload document
      const uploadResponse = await request
        .post('/api/documents')
        .set('Authorization', authToken)
        .send(mockDocument);

      const documentId = uploadResponse.body.id;

      // Simulate AI service failure
      mockServices.ollama.isHealthy = false;

      // Start analysis
      const analysisResponse = await request
        .post('/api/analysis')
        .set('Authorization', authToken)
        .send({ documentId });

      const analysisId = analysisResponse.body.id;

      // Wait for failure
      await new Promise(resolve => setTimeout(resolve, 200));

      const failedResponse = await request
        .get(`/api/analysis/${analysisId}`)
        .set('Authorization', authToken);

      expect(failedResponse.body.status).toBe('failed');
      expect(failedResponse.body.error).toBeDefined();

      // Restore AI service
      mockServices.ollama.isHealthy = true;

      // Retry analysis
      const retryResponse = await request
        .post(`/api/analysis/${analysisId}/retry`)
        .set('Authorization', authToken);

      expect(retryResponse.status).toBe(200);
      expect(retryResponse.body.status).toBe('pending');
    });
  });

  describe('Billing Service Integration', () => {
    test('should handle subscription lifecycle', async () => {
      // Step 1: Check current subscription (should be none/free)
      const currentSubResponse = await request
        .get('/api/billing/subscription')
        .set('Authorization', authToken);

      expect(currentSubResponse.status).toBe(200);
      expect(currentSubResponse.body.plan).toBe('free');

      // Step 2: Create subscription
      const subscriptionResponse = await request
        .post('/api/billing/subscription')
        .set('Authorization', authToken)
        .send({
          priceId: 'price_basic_monthly',
          paymentMethodId: 'pm_test_card',
        });

      expect(subscriptionResponse.status).toBe(200);
      expect(subscriptionResponse.body).toHaveProperty('subscription');
      expect(subscriptionResponse.body).toHaveProperty('clientSecret');

      // Step 3: Simulate webhook for subscription activation
      const webhookResponse = await request
        .post('/api/billing/webhooks')
        .send({
          type: 'customer.subscription.created',
          data: {
            object: {
              id: subscriptionResponse.body.subscription.stripeSubscriptionId,
              status: 'active',
              metadata: { userId: testUser.id },
            },
          },
        });

      expect(webhookResponse.status).toBe(200);

      // Step 4: Verify subscription is active
      const activeSubResponse = await request
        .get('/api/billing/subscription')
        .set('Authorization', authToken);

      expect(activeSubResponse.body.status).toBe('active');
      expect(activeSubResponse.body.plan).toBe('basic');

      // Step 5: Check updated usage limits
      const limitsResponse = await request
        .get('/api/billing/limits')
        .set('Authorization', authToken);

      expect(limitsResponse.body.limits.documentsPerMonth.limit).toBe(50);
      expect(limitsResponse.body.limits.analysesPerMonth.limit).toBe(50);
    });

    test('should enforce usage limits', async () => {
      // Setup user with exceeded limits
      mockServices.redis.data.set(`usage:${testUser.id}:document_upload`, 5);
      mockServices.redis.data.set(`usage:${testUser.id}:document_analysis`, 5);

      // Try to upload document (should be blocked for free tier)
      const uploadResponse = await request
        .post('/api/documents')
        .set('Authorization', authToken)
        .send(createMockDocument());

      expect(uploadResponse.status).toBe(429); // Too Many Requests
      expect(uploadResponse.body.error).toContain('usage limit exceeded');

      // Try to start analysis (should be blocked)
      const analysisResponse = await request
        .post('/api/analysis')
        .set('Authorization', authToken)
        .send({ documentId: 'existing-doc-id' });

      expect(analysisResponse.status).toBe(429);
    });
  });

  describe('Notification Service Integration', () => {
    test('should send multi-channel notifications', async () => {
      // Step 1: Update notification preferences
      const preferencesResponse = await request
        .put('/api/notifications/preferences')
        .set('Authorization', authToken)
        .send({
          email: true,
          push: true,
          realtime: true,
        });

      expect(preferencesResponse.status).toBe(200);

      // Step 2: Trigger notification (via analysis completion)
      const mockDocument = createMockDocument({ userId: testUser.id });
      const uploadResponse = await request
        .post('/api/documents')
        .set('Authorization', authToken)
        .send(mockDocument);

      const analysisResponse = await request
        .post('/api/analysis')
        .set('Authorization', authToken)
        .send({ documentId: uploadResponse.body.id });

      // Wait for analysis completion
      await new Promise(resolve => setTimeout(resolve, 300));

      // Step 3: Verify notifications were created
      const notificationsResponse = await request
        .get('/api/notifications')
        .set('Authorization', authToken);

      expect(notificationsResponse.body.notifications).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'analysis_complete',
            status: 'sent',
          }),
        ])
      );

      // Step 4: Verify unread count
      expect(notificationsResponse.body.unreadCount).toBeGreaterThan(0);

      // Step 5: Mark as read and verify real-time update
      const notificationId = notificationsResponse.body.notifications[0].id;
      const readResponse = await request
        .patch(`/api/notifications/${notificationId}/read`)
        .set('Authorization', authToken);

      expect(readResponse.status).toBe(200);
      expect(readResponse.body.status).toBe('read');
    });

    test('should handle bulk notifications', async () => {
      // Create multiple test users
      const testUsers = Array.from({ length: 5 }, () => createMockUser());

      // Send bulk notification
      const bulkResponse = await request
        .post('/api/notifications/bulk')
        .set('Authorization', 'Bearer admin-token')
        .send({
          userIds: testUsers.map(u => u.id),
          type: 'system_update',
          title: 'System Maintenance',
          message: 'Scheduled maintenance tonight from 2-4 AM',
        });

      expect(bulkResponse.status).toBe(200);
      expect(bulkResponse.body.sent).toBe(5);
      expect(bulkResponse.body.failed).toBe(0);

      // Verify notifications were created for all users
      for (const user of testUsers) {
        const userNotifications = await request
          .get('/api/notifications')
          .set('Authorization', `Bearer token-for-${user.id}`);

        expect(userNotifications.body.notifications).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'system_update',
              title: 'System Maintenance',
            }),
          ])
        );
      }
    });
  });

  describe('WebSocket Service Integration', () => {
    test('should handle real-time analysis updates', async () => {
      // This would typically test WebSocket connections
      // For integration tests, we'll verify the WebSocket events are triggered
      
      const mockDocument = createMockDocument({ userId: testUser.id });
      
      // Start analysis
      const analysisResponse = await request
        .post('/api/analysis')
        .set('Authorization', authToken)
        .send({ documentId: mockDocument.id });

      const analysisId = analysisResponse.body.id;

      // Simulate WebSocket connection and verify events
      const events: any[] = [];
      
      // Mock WebSocket event handler
      const mockWebSocketHandler = (event: string, data: any) => {
        events.push({ event, data });
      };

      // Wait for analysis completion and events
      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify expected events were triggered
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'analysis_started',
            data: expect.objectContaining({ analysisId }),
          }),
          expect.objectContaining({
            event: 'analysis_completed',
            data: expect.objectContaining({ analysisId }),
          }),
          expect.objectContaining({
            event: 'notification',
            data: expect.objectContaining({ type: 'analysis_complete' }),
          }),
        ])
      );
    });
  });

  describe('Gateway Service Integration', () => {
    test('should handle rate limiting across services', async () => {
      const requests = Array.from({ length: 20 }, (_, i) =>
        request
          .get('/api/health')
          .set('Authorization', authToken)
      );

      const responses = await Promise.allSettled(requests);
      const successfulResponses = responses.filter(r => 
        r.status === 'fulfilled' && r.value.status === 200
      );
      const rateLimitedResponses = responses.filter(r =>
        r.status === 'fulfilled' && r.value.status === 429
      );

      // Should allow some requests but rate limit others
      expect(successfulResponses.length).toBeLessThanOrEqual(15);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    test('should handle service circuit breaker', async () => {
      // Simulate service failure
      mockServices.ollama.isHealthy = false;

      // Make multiple requests to trigger circuit breaker
      const requests = Array.from({ length: 10 }, () =>
        request
          .post('/api/analysis')
          .set('Authorization', authToken)
          .send({ documentId: 'test-doc' })
      );

      const responses = await Promise.allSettled(requests);
      
      // Should get service unavailable responses
      const serviceUnavailableResponses = responses.filter(r =>
        r.status === 'fulfilled' && r.value.status === 503
      );

      expect(serviceUnavailableResponses.length).toBeGreaterThan(5);
    });
  });

  describe('Monitoring Service Integration', () => {
    test('should collect metrics across services', async () => {
      // Perform various operations to generate metrics
      await request
        .post('/api/documents')
        .set('Authorization', authToken)
        .send(createMockDocument());

      await request
        .get('/api/notifications')
        .set('Authorization', authToken);

      await request
        .get('/api/billing/usage')
        .set('Authorization', authToken);

      // Check metrics endpoint
      const metricsResponse = await request
        .get('/api/monitoring/metrics')
        .set('Authorization', 'Bearer admin-token');

      expect(metricsResponse.status).toBe(200);
      expect(metricsResponse.body).toHaveProperty('http_requests_total');
      expect(metricsResponse.body).toHaveProperty('document_uploads_total');
      expect(metricsResponse.body).toHaveProperty('analysis_requests_total');
    });

    test('should detect health issues across services', async () => {
      // Simulate various service health states
      mockServices.database.connected = false;

      const healthResponse = await request
        .get('/api/health')
        .set('Authorization', authToken);

      expect(healthResponse.status).toBe(503);
      expect(healthResponse.body.status).toBe('unhealthy');
      expect(healthResponse.body.checks).toEqual(
        expect.objectContaining({
          database: expect.objectContaining({
            status: 'unhealthy',
          }),
        })
      );

      // Restore service health
      mockServices.database.connected = true;

      const healthyResponse = await request
        .get('/api/health')
        .set('Authorization', authToken);

      expect(healthyResponse.status).toBe(200);
      expect(healthyResponse.body.status).toBe('healthy');
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle cascading service failures gracefully', async () => {
      // Simulate database failure
      mockServices.database.connected = false;

      const documentResponse = await request
        .post('/api/documents')
        .set('Authorization', authToken)
        .send(createMockDocument());

      expect(documentResponse.status).toBe(503);
      expect(documentResponse.body.error).toContain('Service temporarily unavailable');

      // Other services should still work
      const healthResponse = await request
        .get('/api/health')
        .set('Authorization', authToken);

      // Health check should report partial failure
      expect(healthResponse.status).toBe(503);
      expect(healthResponse.body.status).toBe('unhealthy');
    });

    test('should implement retry logic for transient failures', async () => {
      let attemptCount = 0;
      
      // Mock transient failure (fails first 2 times, succeeds on 3rd)
      const originalOllamaGenerate = mockServices.ollama.generateResponse;
      mockServices.ollama.generateResponse = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Transient failure');
        }
        return originalOllamaGenerate();
      });

      const analysisResponse = await request
        .post('/api/analysis')
        .set('Authorization', authToken)
        .send({ documentId: 'test-doc' });

      expect(analysisResponse.status).toBe(200);
      expect(mockServices.ollama.generateResponse).toHaveBeenCalledTimes(3);
    });
  });

  describe('Data Consistency', () => {
    test('should maintain data consistency across services', async () => {
      const mockDocument = createMockDocument({ userId: testUser.id });

      // Create document
      const documentResponse = await request
        .post('/api/documents')
        .set('Authorization', authToken)
        .send(mockDocument);

      const documentId = documentResponse.body.id;

      // Start analysis
      const analysisResponse = await request
        .post('/api/analysis')
        .set('Authorization', authToken)
        .send({ documentId });

      const analysisId = analysisResponse.body.id;

      // Verify document exists in document service
      const docCheckResponse = await request
        .get(`/api/documents/${documentId}`)
        .set('Authorization', authToken);

      expect(docCheckResponse.status).toBe(200);
      expect(docCheckResponse.body.id).toBe(documentId);

      // Verify analysis exists in analysis service
      const analysisCheckResponse = await request
        .get(`/api/analysis/${analysisId}`)
        .set('Authorization', authToken);

      expect(analysisCheckResponse.status).toBe(200);
      expect(analysisCheckResponse.body.documentId).toBe(documentId);

      // Verify usage was recorded in billing service
      const usageResponse = await request
        .get('/api/billing/usage')
        .set('Authorization', authToken);

      expect(usageResponse.body.breakdown.document_upload).toBeGreaterThan(0);
      expect(usageResponse.body.breakdown.document_analysis).toBeGreaterThan(0);
    });

    test('should rollback changes on transaction failures', async () => {
      // Simulate a scenario where document creation succeeds but analysis creation fails
      const mockDocument = createMockDocument({ userId: testUser.id });

      // Mock analysis service failure after document creation
      const originalAnalysisCreate = request.post;
      let documentCreated = false;

      // Override the analysis creation to fail
      jest.spyOn(request, 'post').mockImplementation((path: string) => {
        if (path === '/api/documents') {
          documentCreated = true;
          return originalAnalysisCreate.call(request, path);
        } else if (path === '/api/analysis' && documentCreated) {
          // Simulate analysis service failure
          return Promise.resolve({
            status: 503,
            body: { error: 'Analysis service unavailable' },
          } as any);
        }
        return originalAnalysisCreate.call(request, path);
      });

      // Try to create document and start analysis in a transaction
      const transactionResponse = await request
        .post('/api/documents/analyze')
        .set('Authorization', authToken)
        .send(mockDocument);

      expect(transactionResponse.status).toBe(503);

      // Verify document was not persisted due to rollback
      const documentsResponse = await request
        .get('/api/documents')
        .set('Authorization', authToken);

      const createdDocuments = documentsResponse.body.documents.filter(
        (doc: any) => doc.title === mockDocument.title
      );

      expect(createdDocuments.length).toBe(0);

      // Restore original implementation
      jest.restoreAllMocks();
    });
  });

  describe('Performance Integration', () => {
    test('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 10;
      const startTime = Date.now();

      const requests = Array.from({ length: concurrentRequests }, (_, i) =>
        request
          .get('/api/health')
          .set('Authorization', authToken)
      );

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should handle concurrent requests efficiently
      expect(totalTime).toBeLessThan(2000); // Less than 2 seconds for 10 concurrent requests
    });

    test('should meet performance thresholds for complex workflows', async () => {
      const startTime = Date.now();

      // Complex workflow: upload document, analyze, get results, send notification
      const mockDocument = createMockDocument({ userId: testUser.id });

      const uploadResponse = await request
        .post('/api/documents')
        .set('Authorization', authToken)
        .send(mockDocument);

      const analysisResponse = await request
        .post('/api/analysis')
        .set('Authorization', authToken)
        .send({ documentId: uploadResponse.body.id });

      // Wait for analysis completion
      let completed = false;
      while (!completed) {
        const statusResponse = await request
          .get(`/api/analysis/${analysisResponse.body.id}`)
          .set('Authorization', authToken);

        if (statusResponse.body.status === 'completed') {
          completed = true;
        } else {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Complete workflow should finish within 10 seconds
      expect(totalTime).toBeLessThan(10000);
    });
  });
});