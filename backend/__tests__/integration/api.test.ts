import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import supertest from 'supertest';
import { FastifyInstance } from 'fastify';
import { testServer } from './test-server';
import { testHelpers } from '../utils/test-helpers';

describe('API Integration Tests', () => {
  let server: FastifyInstance;
  let request: supertest.SuperTest<supertest.Test>;

  beforeAll(async () => {
    const testApp = await testServer.start();
    server = testApp.server;
    request = testApp.request;
  });

  afterAll(async () => {
    await testServer.stop();
  });

  beforeEach(async () => {
    await testServer.cleanup();
  });

  describe('Health Check', () => {
    test('GET /health should return 200', async () => {
      const response = await request.get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.timestamp).toBeValidTimestamp();
    });
  });

  describe('Authentication', () => {
    describe('POST /api/auth/login', () => {
      test('should login with valid credentials', async () => {
        const response = await request
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'password123'
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');
        expect(response.body).toHaveProperty('user');
        expect(response.body.user).toHaveProperty('email', 'test@example.com');
      });

      test('should reject invalid credentials', async () => {
        const response = await request
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'wrongpassword'
          });

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error', 'Unauthorized');
      });

      test('should validate email format', async () => {
        const response = await request
          .post('/api/auth/login')
          .send({
            email: 'invalid-email',
            password: 'password123'
          });

        expect(response.status).toBe(400);
      });

      test('should require password', async () => {
        const response = await request
          .post('/api/auth/login')
          .send({
            email: 'test@example.com'
          });

        expect(response.status).toBe(400);
      });
    });

    describe('POST /api/auth/register', () => {
      test('should register new user', async () => {
        const userData = {
          email: 'newuser@example.com',
          password: 'password123',
          firstName: 'New',
          lastName: 'User'
        };

        const response = await request
          .post('/api/auth/register')
          .send(userData);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');
        expect(response.body).toHaveProperty('user');
        expect(response.body.user).toHaveProperty('email', userData.email);
        expect(response.body.user).toHaveProperty('firstName', userData.firstName);
      });

      test('should reject duplicate email', async () => {
        const userData = {
          email: 'duplicate@example.com',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User'
        };

        // First registration
        await request.post('/api/auth/register').send(userData);

        // Second registration with same email
        const response = await request
          .post('/api/auth/register')
          .send(userData);

        expect(response.status).toBe(409);
        expect(response.body).toHaveProperty('error', 'Conflict');
      });
    });
  });

  describe('User Management', () => {
    let authHeaders: Record<string, string>;

    beforeEach(() => {
      authHeaders = testHelpers.createAuthHeaders();
    });

    describe('GET /api/users/me', () => {
      test('should return current user', async () => {
        const response = await request
          .get('/api/users/me')
          .set(authHeaders);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('email');
        expect(response.body.id).toBeValidUUID();
      });

      test('should require authentication', async () => {
        const response = await request.get('/api/users/me');

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error', 'Unauthorized');
      });
    });

    describe('PUT /api/users/me', () => {
      test('should update user profile', async () => {
        const updates = {
          firstName: 'Updated',
          lastName: 'Name'
        };

        const response = await request
          .put('/api/users/me')
          .set(authHeaders)
          .send(updates);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('firstName', updates.firstName);
        expect(response.body).toHaveProperty('lastName', updates.lastName);
      });

      test('should require authentication', async () => {
        const response = await request
          .put('/api/users/me')
          .send({ firstName: 'Test' });

        expect(response.status).toBe(401);
      });
    });
  });

  describe('Document Management', () => {
    let authHeaders: Record<string, string>;

    beforeEach(() => {
      authHeaders = testHelpers.createAuthHeaders();
    });

    describe('GET /api/documents', () => {
      test('should return user documents', async () => {
        const response = await request
          .get('/api/documents')
          .set(authHeaders);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('documents');
        expect(response.body).toHaveProperty('total');
        expect(response.body).toHaveProperty('page');
        expect(response.body).toHaveProperty('limit');
        expect(Array.isArray(response.body.documents)).toBe(true);
      });

      test('should require authentication', async () => {
        const response = await request.get('/api/documents');

        expect(response.status).toBe(401);
      });
    });

    describe('POST /api/documents', () => {
      test('should create new document', async () => {
        const documentData = {
          title: 'Test Contract',
          documentType: 'contract',
          language: 'en'
        };

        const response = await request
          .post('/api/documents')
          .set(authHeaders)
          .send(documentData);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('title', documentData.title);
        expect(response.body).toHaveProperty('documentType', documentData.documentType);
        expect(response.body.id).toBeValidUUID();
      });

      test('should require authentication', async () => {
        const response = await request
          .post('/api/documents')
          .send({ title: 'Test' });

        expect(response.status).toBe(401);
      });
    });

    describe('GET /api/documents/:id', () => {
      test('should return specific document', async () => {
        const documentId = 'test-document-id';

        const response = await request
          .get(`/api/documents/${documentId}`)
          .set(authHeaders);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('id', documentId);
        expect(response.body).toHaveProperty('title');
        expect(response.body).toHaveProperty('documentType');
      });

      test('should require authentication', async () => {
        const response = await request.get('/api/documents/test-id');

        expect(response.status).toBe(401);
      });
    });

    describe('DELETE /api/documents/:id', () => {
      test('should delete document', async () => {
        const documentId = 'test-document-id';

        const response = await request
          .delete(`/api/documents/${documentId}`)
          .set(authHeaders);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
      });

      test('should require authentication', async () => {
        const response = await request.delete('/api/documents/test-id');

        expect(response.status).toBe(401);
      });
    });
  });

  describe('Analysis', () => {
    let authHeaders: Record<string, string>;

    beforeEach(() => {
      authHeaders = testHelpers.createAuthHeaders();
    });

    describe('POST /api/analysis', () => {
      test('should create new analysis', async () => {
        const analysisRequest = {
          documentId: 'test-document-id'
        };

        const response = await request
          .post('/api/analysis')
          .set(authHeaders)
          .send(analysisRequest);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('status', 'pending');
        expect(response.body).toHaveProperty('documentId', analysisRequest.documentId);
        expect(response.body.id).toBeValidUUID();
      });

      test('should require authentication', async () => {
        const response = await request
          .post('/api/analysis')
          .send({ documentId: 'test-id' });

        expect(response.status).toBe(401);
      });
    });

    describe('GET /api/analysis/:id', () => {
      test('should return analysis results', async () => {
        const analysisId = 'test-analysis-id';

        const response = await request
          .get(`/api/analysis/${analysisId}`)
          .set(authHeaders);

        expect(response.status).toBe(200);
        expect(response.body).toHaveValidAnalysisStructure();
        expect(response.body).toHaveProperty('findings');
        expect(Array.isArray(response.body.findings)).toBe(true);
        
        if (response.body.findings.length > 0) {
          const finding = response.body.findings[0];
          expect(finding).toHaveProperty('category');
          expect(finding).toHaveProperty('title');
          expect(finding).toHaveProperty('severity');
          expect(['low', 'medium', 'high', 'critical']).toContain(finding.severity);
        }
      });

      test('should require authentication', async () => {
        const response = await request.get('/api/analysis/test-id');

        expect(response.status).toBe(401);
      });
    });

    describe('GET /api/analysis/document/:documentId', () => {
      test('should return document analyses', async () => {
        const documentId = 'test-document-id';

        const response = await request
          .get(`/api/analysis/document/${documentId}`)
          .set(authHeaders);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        
        if (response.body.length > 0) {
          response.body.forEach((analysis: any) => {
            expect(analysis).toHaveValidAnalysisStructure();
            expect(analysis).toHaveProperty('documentId', documentId);
          });
        }
      });

      test('should require authentication', async () => {
        const response = await request.get('/api/analysis/document/test-id');

        expect(response.status).toBe(401);
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle 404 for non-existent routes', async () => {
      const response = await request.get('/api/non-existent');

      expect(response.status).toBe(404);
    });

    test('should handle malformed JSON', async () => {
      const response = await request
        .post('/api/auth/login')
        .send('invalid json')
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
    });
  });

  describe('Rate Limiting', () => {
    test('should not rate limit during tests', async () => {
      // Make multiple requests rapidly
      const promises = Array.from({ length: 10 }, () => 
        request.get('/health')
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });
});