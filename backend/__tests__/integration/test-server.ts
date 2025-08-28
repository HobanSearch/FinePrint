import Fastify, { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import supertest from 'supertest';
import { testHelpers } from '../utils/test-helpers';
import { createOllamaMock } from '../mocks/ollama.mock';
import { createRedisMock } from '../mocks/redis.mock';

export class TestServer {
  private static instance: TestServer;
  private server: FastifyInstance | null = null;
  private prisma: PrismaClient;
  private baseUrl: string = '';

  constructor() {
    this.prisma = testHelpers.prisma;
  }

  static getInstance(): TestServer {
    if (!TestServer.instance) {
      TestServer.instance = new TestServer();
    }
    return TestServer.instance;
  }

  async start(): Promise<{ server: FastifyInstance; request: supertest.SuperTest<supertest.Test> }> {
    if (this.server) {
      return { 
        server: this.server, 
        request: supertest(this.server.listeningOrigin || this.baseUrl) 
      };
    }

    // Create Fastify server with test configuration
    this.server = Fastify({
      logger: false, // Disable logging in tests
      pluginTimeout: 30000,
    });

    // Setup error handling
    this.server.setErrorHandler((error, request, reply) => {
      console.error('Test server error:', error);
      reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message,
        statusCode: 500
      });
    });

    // Register test plugins
    await this.registerTestPlugins();

    // Register test routes
    await this.registerTestRoutes();

    // Start the server
    const address = await this.server.listen({
      port: 0, // Use random available port
      host: '127.0.0.1'
    });

    this.baseUrl = address;

    return { 
      server: this.server, 
      request: supertest(address) 
    };
  }

  async stop(): Promise<void> {
    if (this.server) {
      await this.server.close();
      this.server = null;
      this.baseUrl = '';
    }
  }

  async cleanup(): Promise<void> {
    await testHelpers.cleanup();
  }

  private async registerTestPlugins(): Promise<void> {
    if (!this.server) return;

    // CORS plugin
    await this.server.register(import('@fastify/cors'), {
      origin: true,
      credentials: true
    });

    // Helmet for security headers
    await this.server.register(import('@fastify/helmet'), {
      contentSecurityPolicy: false
    });

    // Multipart support for file uploads
    await this.server.register(import('@fastify/multipart'), {
      limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
      }
    });

    // Rate limiting (disabled in tests)
    await this.server.register(import('@fastify/rate-limit'), {
      max: 1000,
      timeWindow: '1 minute',
      skipOnSuccess: true
    });

    // Swagger documentation
    await this.server.register(import('@fastify/swagger'), {
      openapi: {
        openapi: '3.0.0',
        info: {
          title: 'Fine Print AI Test API',
          description: 'Test API for Fine Print AI',
          version: '1.0.0'
        }
      }
    });

    await this.server.register(import('@fastify/swagger-ui'), {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false
      }
    });
  }

  private async registerTestRoutes(): Promise<void> {
    if (!this.server) return;

    // Health check route
    this.server.get('/health', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    // Auth routes
    await this.registerAuthRoutes();

    // User routes
    await this.registerUserRoutes();

    // Document routes  
    await this.registerDocumentRoutes();

    // Analysis routes
    await this.registerAnalysisRoutes();
  }

  private async registerAuthRoutes(): Promise<void> {
    if (!this.server) return;

    this.server.post('/api/auth/login', {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 6 }
          }
        }
      }
    }, async (request, reply) => {
      const { email, password } = request.body as { email: string; password: string };

      // Simple test authentication
      if (email === 'test@example.com' && password === 'password123') {
        const token = testHelpers.generateJwtToken({ email });
        const user = await testHelpers.createTestUser({ email });
        
        return { token, user };
      }

      reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid credentials'
      });
    });

    this.server.post('/api/auth/register', async (request, reply) => {
      const { email, password, firstName, lastName } = request.body as any;
      
      // Check if user already exists
      const existingUser = await this.prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        reply.status(409).send({
          error: 'Conflict',
          message: 'User already exists'
        });
        return;
      }

      const user = await testHelpers.createTestUser({
        email,
        firstName,
        lastName
      });

      const token = testHelpers.generateJwtToken({ userId: user.id, email });

      return { token, user };
    });
  }

  private async registerUserRoutes(): Promise<void> {
    if (!this.server) return;

    this.server.addHook('preHandler', async (request, reply) => {
      // Simple auth check for user routes
      const auth = request.headers.authorization;
      if (!auth || !auth.startsWith('Bearer ')) {
        reply.status(401).send({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
        return;
      }
    });

    this.server.get('/api/users/me', async (request) => {
      // Extract user from token (simplified for tests)
      const user = await testHelpers.createTestUser();
      return user;
    });

    this.server.put('/api/users/me', async (request) => {
      const updates = request.body as any;
      const user = await testHelpers.createTestUser(updates);
      return user;
    });
  }

  private async registerDocumentRoutes(): Promise<void> {
    if (!this.server) return;

    this.server.get('/api/documents', async (request) => {
      const user = await testHelpers.createTestUser();
      const documents = [
        await testHelpers.createTestDocument(user.id),
        await testHelpers.createTestDocument(user.id, { title: 'Second Document' })
      ];

      return {
        documents,
        total: documents.length,
        page: 1,
        limit: 10
      };
    });

    this.server.post('/api/documents', async (request) => {
      const user = await testHelpers.createTestUser();
      const documentData = request.body as any;
      const document = await testHelpers.createTestDocument(user.id, documentData);
      return document;
    });

    this.server.get('/api/documents/:id', async (request) => {
      const { id } = request.params as { id: string };
      const user = await testHelpers.createTestUser();
      const document = await testHelpers.createTestDocument(user.id, { id });
      return document;
    });

    this.server.delete('/api/documents/:id', async (request) => {
      const { id } = request.params as { id: string };
      await this.prisma.document.delete({ where: { id } });
      return { success: true };
    });
  }

  private async registerAnalysisRoutes(): Promise<void> {
    if (!this.server) return;

    this.server.post('/api/analysis', async (request) => {
      const { documentId } = request.body as { documentId: string };
      const analysis = await testHelpers.createTestAnalysis(documentId, {
        status: 'pending'
      });
      return analysis;
    });

    this.server.get('/api/analysis/:id', async (request) => {
      const { id } = request.params as { id: string };
      const user = await testHelpers.createTestUser();
      const document = await testHelpers.createTestDocument(user.id);
      const analysis = await testHelpers.createTestAnalysis(document.id, { id });
      
      return {
        ...analysis,
        findings: [
          await testHelpers.createTestFinding(analysis.id)
        ]
      };
    });

    this.server.get('/api/analysis/document/:documentId', async (request) => {
      const { documentId } = request.params as { documentId: string };
      const analyses = [
        await testHelpers.createTestAnalysis(documentId)
      ];
      return analyses;
    });
  }
}

export const testServer = TestServer.getInstance();